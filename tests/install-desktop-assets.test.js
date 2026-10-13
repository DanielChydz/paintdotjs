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
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {test} = require("node:test");
const {extractLargestPngFromIco, installAssets, readStringResources} = require("../scripts/install_desktop_assets");
const {resourceBuffer, pngBuffer, icoBuffer} = require("./fixtures/resources");

function fixture(t) {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-assets-test-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let source = path.join(directory, "source");
    let output = path.join(directory, "output");
    let manifestPath = path.join(directory, "manifest.json");
    fs.mkdirSync(path.join(source, "nested"), {recursive: true});
    let png = pngBuffer(1, [32, 96, 192, 255]);
    let large = pngBuffer(256, [192, 96, 32, 255]);
    let ico = icoBuffer([{size: 1, data: png}, {size: 256, data: large}]);
    let hash = value => crypto.createHash("sha256").update(value).digest("hex");
    let manifest = {
        paintDotNetVersion: "fixture",
        files: {[hash(png)]: ["small.png", "nested/copy.png"]},
        icons: {ico: hash(ico), png: hash(large)}
    };
    fs.writeFileSync(path.join(source, "nested/PaintDotNet.Resources.dll"), Buffer.concat([
        Buffer.from("fixture"), png, png,
        png.subarray(0, 20),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0])
    ]));
    fs.writeFileSync(path.join(source, "paintdotnet.ico"), ico);
    fs.writeFileSync(path.join(source, "irrelevant.txt"), "");
    fs.symlinkSync("irrelevant.txt", path.join(source, "ignored-link"));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    return {directory, source, output, manifestPath, manifest, png, large, ico};
}

test(".resources parser reads UTF-16 names, UTF-8 strings, nulls and skips non-string values", t => {
    let {directory} = fixture(t);
    let filename = path.join(directory, "strings.resources");
    for (let types of [[], ["Fixture.Type"], ["Longer.Type.Name", "Other.Type"]]) {
        fs.writeFileSync(filename, resourceBuffer([
            {name: "Name", value: "Za\u017c\u00f3\u0142\u0107 \ud83d\ude80"},
            {name: "Empty", type: 0},
            {name: "Flag", type: 2}
        ], {types}));
        assert.deepEqual(readStringResources(filename), {Name: "Za\u017c\u00f3\u0142\u0107 \ud83d\ude80", Empty: ""});
    }
    fs.writeFileSync(filename, resourceBuffer([]));
    assert.deepEqual(readStringResources(filename), {});
});

test(".resources parser rejects invalid headers, versions, counts and truncated data", t => {
    let {directory} = fixture(t);
    let filename = path.join(directory, "bad.resources");
    let invalidMagic = resourceBuffer([]);
    invalidMagic.writeUInt32LE(0);
    for (let [bytes, expected] of [
        [invalidMagic, /Not a .NET resources file/],
        [resourceBuffer([], {managerVersion: 0}), /Unsupported resource manager header/],
        [resourceBuffer([], {version: 1}), /Unsupported .resources version/],
        [resourceBuffer([], {resourceCount: -1}), /Invalid .resources counts/],
        [resourceBuffer([], {typeCount: -1, types: []}), /Invalid .resources counts/],
        [resourceBuffer([]).subarray(0, 7), /Unexpected end/],
        [resourceBuffer([{name: "Name", value: "truncated"}]).subarray(0, -1), /Unexpected end/]
    ]) {
        fs.writeFileSync(filename, bytes);
        assert.throws(() => readStringResources(filename), expected);
    }
});

test("ICO extraction selects the largest PNG, including zero-encoded 256px dimensions", t => {
    let {png, large, ico} = fixture(t);
    assert.deepEqual(extractLargestPngFromIco(ico, "fixture.ico"), large);
    let mixed = icoBuffer([{size: 1, data: Buffer.from("not PNG")}, {size: 1, data: png}]);
    assert.deepEqual(extractLargestPngFromIco(mixed, "mixed.ico"), png);
});

test("ICO extraction rejects invalid headers, directories, offsets and missing PNGs", t => {
    let {png, ico} = fixture(t);
    let badHeader = Buffer.from(ico);
    badHeader.writeUInt16LE(1, 0);
    let badType = Buffer.from(ico);
    badType.writeUInt16LE(2, 2);
    let badOffset = icoBuffer([{size: 1, data: png}]);
    badOffset.writeUInt32LE(0xffffffff, 18);
    for (let [bytes, expected] of [
        [Buffer.alloc(0), /Invalid ICO file/], [badHeader, /Invalid ICO file/],
        [badType, /Invalid ICO file/], [ico.subarray(0, 8), /Truncated ICO directory/],
        [badOffset, /Invalid ICO image offset/],
        [icoBuffer([]), /does not contain an embedded PNG/],
        [icoBuffer([{size: 1, data: Buffer.from("not PNG")}]), /does not contain an embedded PNG/]
    ]) {
        assert.throws(() => extractLargestPngFromIco(bytes, "bad.ico"), expected);
    }
});

test("asset installation writes verified images, icons, nested translations and metadata", t => {
    let options = fixture(t);
    let strings = [
        {name: "Menu", value: "&File"},
        {name: "Menu.Save", value: "Save && Exit"},
        {name: "Entities", value: "&lt; &GT; &quot; &apos; &#65; &#x42; &amp;"},
        {name: "Toolbar.Save", value: "Save"},
        {name: "Toolbar.Open", value: "Open"},
        {name: "Status", value: "Upper"},
        {name: "status", value: "Lower"},
        {name: "...", value: "ignored"}
    ];
    for (let locale of ["", ".PL", ".zh-Hant-TW", ".es-419"]) {
        fs.writeFileSync(path.join(options.source, `PaintDotNet.Strings.3${locale}.resources`),
            resourceBuffer(strings));
    }
    assert.deepEqual(installAssets(options), {assetCount: 2, languageCount: 4});
    for (let filename of ["small.png", "nested/copy.png"]) {
        assert.deepEqual(fs.readFileSync(path.join(options.output, filename)), options.png);
    }
    assert.deepEqual(fs.readFileSync(path.join(options.output, "icon.ico")), options.ico);
    assert.deepEqual(fs.readFileSync(path.join(options.output, "icon.png")), options.large);
    let locales = JSON.parse(fs.readFileSync(path.join(options.output, "lang/languages.json"), "utf8")).locales;
    assert.deepEqual(locales, ["en", "es-419", "pl", "zh-Hant-TW"]);
    let language = JSON.parse(fs.readFileSync(path.join(options.output, "lang/pl.json"), "utf8"));
    assert.equal(language.entities, '< > " \' A B &');
    assert.deepEqual(language.menu, {text: "File", save: "Save & Exit"});
    assert.deepEqual(language.toolbar, {open: "Open", save: "Save"});
    assert.deepEqual(Object.values(language.status).sort(), ["Lower", "Upper"]);
    let marker = JSON.parse(fs.readFileSync(path.join(options.output, ".paintdotjs-assets.json"), "utf8"));
    assert.equal(marker.paintDotNetVersion, "fixture");
    assert(Number.isFinite(Date.parse(marker.installedAt)));
});

test("asset installation rejects missing resources and icon files", t => {
    let options = fixture(t);
    let filename = path.join(options.source, "paintdotnet.ico");
    fs.unlinkSync(filename);
    assert.throws(() => installAssets(options), /paintdotnet.ico was not found/);
    fs.unlinkSync(path.join(options.source, "nested/PaintDotNet.Resources.dll"));
    assert.throws(() => installAssets(options), /PaintDotNet.Resources.dll was not found/);
});

test("asset installation rejects missing PNG hashes and unexpected icon hashes", t => {
    let options = fixture(t);
    let manifest = structuredClone(options.manifest);
    manifest.files.missing = ["not-found.png"];
    fs.writeFileSync(options.manifestPath, JSON.stringify(manifest));
    assert.throws(() => installAssets(options), /did not contain 1 expected assets/);
    for (let key of ["ico", "png"]) {
        manifest = structuredClone(options.manifest);
        manifest.icons[key] = "incorrect";
        fs.writeFileSync(options.manifestPath, JSON.stringify(manifest));
        assert.throws(() => installAssets(options), /unexpected icon data/);
    }
});

test("asset installer CLI validates arguments, exits on errors and reports successful installation", t => {
    let options = fixture(t);
    let script = path.resolve(__dirname, "../scripts/install_desktop_assets.js");
    for (let [args, expected] of [
        [["source", options.source], /Invalid argument/],
        [["--source"], /Invalid argument/],
        [[], /Missing --source/],
        [["--source", options.source], /Missing --output/],
        [["--source", options.source, "--output", options.output], /Missing --manifest/]
    ]) {
        let result = spawnSync(process.execPath, [script, ...args], {encoding: "utf8"});
        assert.equal(result.status, 1);
        assert.match(result.stderr, expected);
    }
    let result = spawnSync(process.execPath, [script, "--source", options.source,
        "--output", options.output, "--manifest", options.manifestPath], {encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Installed 2 assets and 0 languages/);
    assert(fs.existsSync(path.join(options.output, ".paintdotjs-assets.json")));
});
