/*
 * paint.js, an unofficial JavaScript port of Paint.NET 3.36.7
 *
 * Original Paint.NET source:
 * Copyright (C) dotPDN LLC, Rick Brewster, and contributors.
 *
 * JavaScript port and port-specific changes:
 * Copyright (C) 2024-present LabyStudio.
 * https://github.com/LabyStudio
 *
 * The interface design and behavior target Paint.NET 5.1.12+.
 * Licensed under LICENSE.md. See NOTICE.md for full attribution.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {once, EventEmitter} = require("node:events");
const {test} = require("node:test");
const yauzl = require("yauzl");
const {downloadArchive, extractArchive, sha256} = require("../scripts/asset_archive");
const {zipBuffer} = require("./fixtures/archives");
const abcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function temporaryDirectory(t) {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-archive-test-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    return directory;
}

async function localServer(t) {
    let requests = [];
    let server = http.createServer((request, response) => {
        requests.push(request.url);
        if (request.url === "/missing") {
            response.writeHead(404);
            response.end();
        } else if (request.url === "/redirect") {
            response.writeHead(302, {location: "/archive"});
            response.end();
        } else if (request.url === "/abort") {
            response.writeHead(200, {"content-length": 100});
            response.write("abc");
            setImmediate(() => response.destroy());
        } else if (request.url === "/chunked") {
            response.write("a");
            response.end("bc");
        } else {
            response.writeHead(200, {"content-length": 3});
            response.end("abc");
        }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
        server.closeAllConnections();
    }));
    return {url: `http://127.0.0.1:${server.address().port}`, requests};
}

test("archive SHA-256 matches known vectors and propagates missing-file errors", async t => {
    let directory = temporaryDirectory(t);
    let filename = path.join(directory, "data");
    fs.writeFileSync(filename, "abc");
    assert.equal(await sha256(filename), abcHash);
    fs.writeFileSync(filename, "");
    assert.equal(await sha256(filename), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    await assert.rejects(sha256(path.join(directory, "missing")), {code: "ENOENT"});
});

test("archive download follows redirects, reports progress and reuses a verified cache", async t => {
    let directory = temporaryDirectory(t);
    let {url, requests} = await localServer(t);
    let destination = path.join(directory, "nested", "archive.zip");
    let progress = [];
    let options = {url: url + "/redirect", destination, expectedSha256: abcHash,
        onProgress: event => progress.push(event)};
    assert.equal(await downloadArchive(options), abcHash);
    assert.equal(fs.readFileSync(destination, "utf8"), "abc");
    assert.deepEqual(requests, ["/redirect", "/archive"]);
    assert.deepEqual(progress.at(-1), {downloaded: 3, total: 3, cached: false});
    assert.equal(fs.existsSync(destination + ".part"), false);
    assert.equal(await downloadArchive(options), abcHash);
    assert.deepEqual(progress.at(-1), {downloaded: 3, total: 3, cached: true});
    assert.equal(await downloadArchive({...options, expectedSha256: undefined}), abcHash);
    assert.equal(requests.length, 2);
});

test("archive download replaces a mismatched cache and removes stale partial files", async t => {
    let directory = temporaryDirectory(t);
    let {url} = await localServer(t);
    let destination = path.join(directory, "archive.zip");
    fs.writeFileSync(destination, "old");
    fs.writeFileSync(destination + ".part", "interrupted");
    assert.equal(await downloadArchive({url, destination, expectedSha256: abcHash}), abcHash);
    assert.equal(fs.readFileSync(destination, "utf8"), "abc");
    assert.equal(fs.existsSync(destination + ".part"), false);
});

test("chunked downloads work without Content-Length or a checksum", async t => {
    let directory = temporaryDirectory(t);
    let {url} = await localServer(t);
    let progress = [];
    let destination = path.join(directory, "archive.zip");
    assert.equal(await downloadArchive({url: url + "/chunked", destination,
        onProgress: event => progress.push(event)}), abcHash);
    assert.deepEqual(progress.at(-1), {downloaded: 3, total: 0, cached: false});
});

test("failed downloads preserve the old cache and never leave partial files", async t => {
    let directory = temporaryDirectory(t);
    let {url} = await localServer(t);
    let destination = path.join(directory, "archive.zip");
    for (let [suffix, checksum, expected] of [
        ["/archive", "incorrect", /checksum mismatch/],
        ["/missing", abcHash, /Asset download failed \(404\)/],
        ["/abort", abcHash, Error]
    ]) {
        fs.writeFileSync(destination, "old");
        await assert.rejects(downloadArchive({url: url + suffix, destination, expectedSha256: checksum}), expected);
        assert.equal(fs.readFileSync(destination, "utf8"), "old");
        assert.equal(fs.existsSync(destination + ".part"), false);
    }
});

test("ZIP extraction handles empty archives, directories, UTF-8 names and deflated files", async t => {
    let directory = temporaryDirectory(t);
    let archive = path.join(directory, "archive.zip");
    let output = path.join(directory, "output");
    fs.writeFileSync(archive, zipBuffer([]));
    await extractArchive(archive, output);
    fs.writeFileSync(archive, zipBuffer([
        {name: "nested/"},
        {name: "nested/file.txt", data: "plain"},
        {name: "other/\u017c.txt", data: "compressed content", deflate: true}
    ]));
    await extractArchive(archive, output);
    assert.equal(fs.readFileSync(path.join(output, "nested/file.txt"), "utf8"), "plain");
    assert.equal(fs.readFileSync(path.join(output, "other/\u017c.txt"), "utf8"), "compressed content");
});

test("ZIP extraction rejects missing/corrupt archives and unsafe entries", async t => {
    let directory = temporaryDirectory(t);
    let archive = path.join(directory, "archive.zip");
    let output = path.join(directory, "output");
    await assert.rejects(extractArchive(archive, output), {code: "ENOENT"});
    fs.writeFileSync(archive, "not a zip");
    await assert.rejects(extractArchive(archive, output), /End of central directory/);
    for (let entry of [
        {name: "../escape.txt", data: "bad"},
        {name: "/absolute.txt", data: "bad"},
        {name: "link", data: "../escape.txt", attributes: 0o120777 << 16}
    ]) {
        fs.writeFileSync(archive, zipBuffer([entry]));
        await assert.rejects(extractArchive(archive, output), /invalid relative path|absolute path|Unsafe path/);
        assert.equal(fs.existsSync(path.join(directory, "escape.txt")), false);
        assert.equal(fs.existsSync(path.join(output, "link")), false);
    }
});

test("ZIP extraction propagates destination errors for both directories and files", async t => {
    let directory = temporaryDirectory(t);
    let archive = path.join(directory, "archive.zip");
    let output = path.join(directory, "output");
    fs.writeFileSync(output, "not a directory");
    for (let name of ["nested/", "nested/file.txt"]) {
        fs.writeFileSync(archive, zipBuffer([{name, data: "data"}]));
        await assert.rejects(extractArchive(archive, output), /ENOTDIR|EEXIST/);
    }
});

test("ZIP extraction closes the archive on errors and ignores subsequent terminal events", async t => {
    let directory = temporaryDirectory(t);
    let closed = 0;
    let failure;
    t.mock.method(yauzl, "open", (_filename, _options, callback) => {
        let zip = new EventEmitter();
        zip.close = () => {
            ++closed;
            zip.emit("end");
        };
        zip.readEntry = () => {
            queueMicrotask(() => {
                zip.emit("error", failure);
                zip.emit("error", new Error("Already failed"));
                zip.emit("end");
            });
        };
        callback(null, zip);
    });
    let failures = 0;
    for (let error of [new Error("Read failed"), "Read failed"]) {
        failure = error;
        await assert.rejects(extractArchive("fixture.zip", directory), /Read failed/);
        ++failures;
        assert.equal(closed, failures);
    }
});

test("ZIP extraction closes the archive if opening an entry stream fails", async t => {
    let directory = temporaryDirectory(t);
    let archive = path.join(directory, "archive.zip");
    fs.writeFileSync(archive, zipBuffer([{name: "file.txt", data: "content"}]));
    let original = yauzl.open;
    let closed = 0;
    t.mock.method(yauzl, "open", (filename, options, callback) => {
        original(filename, options, (error, zip) => {
            assert.ifError(error);
            let close = zip.close.bind(zip);
            zip.close = () => {
                ++closed;
                close();
            };
            zip.openReadStream = (_entry, streamCallback) => streamCallback(new Error("Stream failed"));
            callback(null, zip);
        });
    });
    await assert.rejects(extractArchive(archive, path.join(directory, "output")), /Stream failed/);
    assert.equal(closed, 1);
});
