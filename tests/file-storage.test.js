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
const path = require("node:path");
const vm = require("node:vm");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

function storageFixture(isApp = false) {
    let state = {records: new Map(), operations: []};
    let context = vm.createContext({
        isApp, require,
        getObjectStore: async mode => {
            if (state.storeError) {
                throw state.storeError;
            }
            let request = (operation, id, record) => {
                state.operations.push([mode, operation, id]);
                let result = {};
                setImmediate(() => {
                    if (state.requestError) {
                        result.onerror({target: {error: state.requestError}});
                    } else {
                        if (operation === "put") {
                            state.records.set(id, structuredClone(record));
                        }
                        result.result = state.records.get(id);
                        result.onsuccess({target: result});
                    }
                });
                return result;
            };
            return {
                get: id => request("get", id),
                put: record => {
                    assert.equal(typeof record.fileName, "string", "fileSystem requires the fileName key");
                    return request("put", record.fileName, record);
                }
            };
        }
    });
    for (let relative of [
        "File.js", "file/AppFile.js", "file/WebFile.js",
        "FileSystem.js", "system/AppFileSystem.js", "system/WebFileSystem.js"
    ]) {
        let filename = path.resolve(__dirname, "../js/src/io", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let api = vm.runInContext("({File, AppFile, WebFile, FileSystem, AppFileSystem, WebFileSystem})", context);
    return {state, context, ...api};
}

test("file paths normalize segments and preserve relative/absolute parent semantics", () => {
    let {File, WebFile} = storageFixture();
    assert.throws(() => new File("file"), /Use File.create/);
    for (let [segments, expected, relative, name, parent] of [
        [[], "/", false, "", null],
        [["/"], "/", false, "", null],
        [["relative", "folder//", "file.png"], "relative/folder/file.png", true, "file.png", "relative/folder"],
        [["/absolute/", "folder", "file.png"], "/absolute/folder/file.png", false, "file.png", "/absolute/folder"],
        [["", "folder"], "/folder", false, "folder", "/"],
        [[42, null], "42/null", true, "null", "42"],
        [["single"], "single", true, "single", ""]
    ]) {
        let file = File.of(...segments);
        assert.ok(file instanceof WebFile);
        assert.equal(file.getPath(), expected);
        assert.equal(file.isRelative(), relative);
        assert.equal(file.getName(), name);
        assert.equal(file.getParent()?.getPath() ?? null, parent);
        if (parent !== null) {
            assert.equal(file.getParent().isRelative(), relative);
            assert.equal(file.getPath(), expected);
        }
    }
    let original = File.of("/one", "two");
    let nested = File.of(original, "three");
    assert.equal(nested.getPath(), "/one/two/three");
    let appended = File.of("prefix", original);
    assert.equal(appended.getPath(), "prefix/one/two");
    nested.getSegments().push("four");
    assert.equal(original.getPath(), "/one/two");
    assert.equal(nested.getPath(), "/one/two/three/four");
});

test("web files persist structured-cloned bytes and distinguish missing records", async () => {
    let {File, state} = storageFixture();
    let file = File.of("images", "test.png");
    assert.equal(await file.exists(), false);
    await assert.rejects(file.read(), /File not found: images\/test.png/);
    let bytes = new Uint8Array([0, 42, 255]);
    assert.equal(await file.write(bytes), undefined);
    bytes[1] = 0;
    assert.equal(await file.exists(), true);
    assert.deepEqual(await File.of("images/test.png").read(), new Uint8Array([0, 42, 255]));
    assert.deepEqual(state.operations.map(entry => entry[0]), ["readonly", "readonly", "readwrite", "readonly", "readonly"]);
    await file.write(null);
    assert.equal(await file.exists(), true);
    assert.equal(await file.read(), null);
});

test("web storage request/store failures reject every operation without success-shaped fallback", async () => {
    for (let failure of ["requestError", "storeError"]) {
        let {File, state} = storageFixture();
        let file = File.of("/image.png");
        let error = new Error(failure);
        state[failure] = error;
        for (let operation of [() => file.exists(), () => file.read(), () => file.write("bytes")]) {
            await assert.rejects(operation(), actual => actual === error);
        }
        assert.equal(state.records.size, 0);
    }
});

test("desktop file factory chooses AppFile and inherited abstract I/O rejects", async () => {
    let {File, AppFile} = storageFixture(true);
    let file = File.of("/tmp", "test.png");
    assert.ok(file instanceof AppFile);
    assert.equal(file.getPath(), "/tmp/test.png");
    await assert.rejects(file.read(), /Not implemented/);
    await assert.rejects(file.write("bytes"), /Not implemented/);
    await assert.rejects(File.prototype.exists.call(file), /Not implemented/);
});

test("file systems cache the selected platform and expose abstract desktop temporary-directory errors", async () => {
    for (let isApp of [false, true]) {
        let {FileSystem, AppFileSystem, WebFileSystem} = storageFixture(isApp);
        let platform = FileSystem.getPlatform();
        assert.ok(platform instanceof (isApp ? AppFileSystem : WebFileSystem));
        assert.equal(FileSystem.getPlatform(), platform);
        assert.throws(() => new FileSystem().getTempDirectory(), /Not implemented/);
        if (isApp) {
            assert.throws(() => platform.getTempDirectory(), /Not implemented/);
            await assert.rejects(platform.getTempFile(), /Not implemented/);
        } else {
            assert.equal(platform.getTempDirectory().getPath(), "temp");
        }
    }
});

test("temporary web files skip collisions, stop after 100 attempts and propagate storage errors", async () => {
    let {state, context, FileSystem} = storageFixture();
    let platform = FileSystem.getPlatform();
    let ordinals = [10, 20, 30];
    context.nextOrdinal = () => ordinals.shift() / 1000000;
    vm.runInContext("Math.random = nextOrdinal", context);
    for (let ordinal of [10, 20]) {
        state.records.set("temp/" + ordinal, {fileName: "temp/" + ordinal, data: null});
    }
    let available = await platform.getTempFile();
    assert.equal(available.getPath(), "temp/30");
    assert.equal(await available.exists(), false);
    assert.equal(state.operations.length, 4);
    assert.equal(state.records.size, 2);
    context.nextOrdinal = () => 10 / 1000000;
    vm.runInContext("Math.random = nextOrdinal", context);
    let before = state.operations.length;
    await assert.rejects(platform.getTempFile(), /Failed to get temp file/);
    assert.equal(state.operations.length - before, 100);
    let failure = new Error("Temporary store inaccessible");
    state.storeError = failure;
    await assert.rejects(platform.getTempFile(), error => error === failure);
});

test("desktop file existence checks real files/directories and rejects missing path components", async t => {
    let {File} = storageFixture(true);
    let directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "paintdotjs-file-exists-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let filename = path.join(directory, "image.png");
    assert.equal(await File.of(directory).exists(), true);
    assert.equal(await File.of(filename).exists(), false);
    fs.writeFileSync(filename, new Uint8Array([0, 42, 255]));
    assert.equal(await File.of(filename).exists(), true);
    assert.equal(await File.of(filename, "nested.png").exists(), false);
    fs.unlinkSync(filename);
    assert.equal(await File.of(filename).exists(), false);
    assert.equal(await File.of(directory, "missing", "image.png").exists(), false);
});

test("desktop file existence preserves permission and filesystem errors instead of reporting absence", async () => {
    let {File, context} = storageFixture(true);
    let file = File.of("/images/private.png");
    for (let code of ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "EIO", undefined]) {
        let failure = Object.assign(new Error("Filesystem failure"), {code});
        context.require = module => {
            assert.equal(module, "node:fs/promises");
            return {access: async pathname => {
                assert.equal(pathname, "/images/private.png");
                throw failure;
            }};
        };
        if (code === "ENOENT" || code === "ENOTDIR") {
            assert.equal(await file.exists(), false);
        } else {
            await assert.rejects(file.exists(), error => error === failure);
        }
    }
});
