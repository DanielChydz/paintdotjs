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
const {webcrypto} = require("node:crypto");
const {zipSync, unzipSync} = require("fflate");

function fixture() {
    let context = vm.createContext({Uint8Array, Uint8ClampedArray, ArrayBuffer, Blob, URL,
        TextEncoder, TextDecoder, AbortSignal, Promise, crypto: webcrypto, btoa,
        console: {warn() {}, error() {}}, window: {ZipArchive: {unzipSync}},
        LayerProperties: {getBlendMode: value => ({value: value === "multiply" ? value : "normal"})}});
    for (let name of ["PluginPixels", "PluginManager", "PluginFileTypes", "PluginCatalog"]) {
        let filename = path.resolve("js/src/engine/plugin", name + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8") + `\nthis.${name} = ${name};`, context,
            {filename: pathToFileURL(filename).href});
    }
    return context;
}

function manifest(overrides = {}) {
    return {apiVersion: 1, id: "test.plugin", name: "Test plugin", version: "1.0", author: "Tests",
        website: "https://example.com/", description: "A fixture", category: "Tests", license: "MIT", ...overrides};
}

function packageFile(entries) {
    let bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) =>
        [name, typeof value === "string" ? new TextEncoder().encode(value) : value])));
    let file = new Blob([bytes]);
    Object.defineProperty(file, "name", {value: "test.paintjs"});
    return file;
}

test("plugin pixel helpers preserve inputs, clamp edges and match independent color/convolution examples", () => {
    let {PluginPixels: pixels} = fixture();
    assert.deepEqual({...pixels.selectionBounds(null, 3, 2)}, {x: 0, y: 0, width: 3, height: 2});
    assert.deepEqual({...pixels.selectionBounds(new Uint8Array(6), 3, 2)}, {x: 3, y: 2, width: 0, height: 0});
    assert.deepEqual({...pixels.selectionBounds(new Uint8Array([0, 1, 0, 1, 0, 0]), 3, 2)},
        {x: 0, y: 0, width: 2, height: 2});
    let source = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]);
    assert.deepEqual(Array.from(pixels.sample(source, 2, 1, -20, 10)), [10, 20, 30, 40]);
    assert.deepEqual(Array.from(pixels.sample(source, 2, 1, 30, -5)), [50, 60, 70, 80]);
    for (let [rgb, hsv] of [[[0, 0, 0], [0, 0, 0]], [[255, 255, 255], [0, 0, 1]],
        [[255, 0, 0], [0, 1, 1]], [[0, 255, 0], [120, 1, 1]], [[0, 0, 255], [240, 1, 1]],
        [[255, 0, 255], [300, 1, 1]]]) {
        assert.deepEqual(Array.from(pixels.rgbToHsv(...rgb)), hsv);
        assert.deepEqual(Array.from(pixels.hsvToRgb(...hsv)), rgb);
    }
    assert.deepEqual(Array.from(pixels.hsvToRgb(60, 1, 1)), [255, 255, 0]);
    assert.deepEqual(Array.from(pixels.hsvToRgb(180, 1, 1)), [0, 255, 255]);
    assert.deepEqual(Array.from(pixels.hsvToRgb(-60, 1, 1)), [255, 0, 255]);
    assert.deepEqual(pixels.convolve(source, 2, 1, [1]), source);
    assert.deepEqual(Array.from(pixels.convolve(source, 2, 1, [2], {divisor: 2, bias: 1, preserveAlpha: false})),
        [11, 21, 31, 41, 51, 61, 71, 81]);
    assert.deepEqual(Array.from(pixels.convolve(source, 2, 1, Array(9).fill(1), {divisor: 9})),
        [23, 33, 43, 40, 37, 47, 57, 80]);
    for (let [kernel, options] of [[[], {}], [[1, 1], {}], [Array(4), {}], [Array(33 * 33), {}],
        [[1], {divisor: 0}], [[1], {divisor: Infinity}]]) {
        assert.throws(() => pixels.convolve(source, 2, 1, kernel, options), /Convolution/);
    }
    assert.equal(source[0], 10);
});

test("plugin metadata, controls and icons reject malformed definitions before activation", () => {
    let {PluginManager: manager} = fixture();
    for (let value of [null, [], "x"]) {
        assert.throws(() => manager.normalizeManifest(value, "test"), /object/);
        assert.throws(() => manager.normalizePlugin(value), /object/);
    }
    assert.throws(() => manager.normalizeManifest(manifest({apiVersion: 2})), /API version/);
    assert.throws(() => manager.normalizeManifest(manifest({website: "http://example.com"})), /HTTPS/);
    assert.equal(manager.normalizeManifest(manifest(), "test").sourceFileName, "test");
    for (let value of [undefined, "", "UPPER", "a".repeat(65)]) {
        assert.throws(() => manager.validateId(value, "id"), /lowercase/);
    }
    for (let value of [null, "", " ", "abc"]) {
        assert.throws(() => manager.validateText(value, "name", 2), /non-empty/);
    }
    assert.equal(manager.validateText(" a ", "name", 3), "a");
    assert.equal(manager.optionalText(undefined, "fallback", 1), "fallback");
    assert.equal(manager.optionalText(" a ", "", 3), "a");
    for (let value of [null, 1, "abc"]) {
        assert.throws(() => manager.optionalText(value, "", 2), /metadata/);
    }
    let range = {type: "range", key: "amount", min: 0, max: 10, defaultValue: 5};
    let controls = manager.normalizeControls([range, {type: "checkbox", key: "enabled", defaultValue: true},
        {type: "text", key: "text"}, {type: "color", key: "color", defaultValue: "#aAbB01"},
        {type: "select", key: "mode", defaultValue: "a", choices: [["a", "Alpha"], {value: "b", label: "Beta"}]}], "test");
    assert.equal(controls[0].step, 1);
    assert.equal(controls[0].track, "default");
    assert.equal(controls[1].defaultValue, true);
    assert.equal(controls[2].defaultValue, "");
    assert.equal(controls[4].choices[1].label, "Beta");
    for (let value of [null, Array(33).fill(range), [null], [[]], [range, range],
        [{...range, min: 20}], [{...range, step: 0}], [{...range, max: NaN}],
        [{...range, defaultValue: -1}], [{...range, defaultValue: 11}], [{...range, track: "unknown"}],
        [{type: "text", key: "text", defaultValue: "x".repeat(4097)}],
        [{type: "color", key: "color"}], [{type: "select", key: "mode"}],
        [{type: "select", key: "mode", choices: []}],
        [{type: "select", key: "mode", choices: Array(65).fill(["a", "a"])}],
        [{type: "select", key: "mode", choices: [["a", "a"]], defaultValue: "b"}],
        [{type: "unknown", key: "unknown"}]]) {
        assert.throws(() => manager.normalizeControls(value, "test"), /Effect/);
    }
    assert.equal(manager.normalizeIcon(), "menu_help_plugins_icon.png");
    assert.equal(manager.normalizeIcon("test.png"), "test.png");
    assert.equal(manager.normalizeIcon("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
    for (let value of [null, "../test.png", "https://example.com/icon.png", "data:image/png;base64," + "A".repeat(524288)]) {
        assert.throws(() => manager.normalizeIcon(value), /icons/);
    }
    let definition = {...manifest(), effects: [{id: "effect", name: "Effect", renderPixel: () => [1, 2, 3, 4]}]};
    assert.equal(manager.normalizePlugin(definition).effects[0].definition.configure, null);
    for (let value of [{...definition, apiVersion: 0}, {...definition, shapes: [{}]},
        {...definition, effects: []}, {...definition, effects: Array(129).fill(definition.effects[0])},
        {...definition, effects: [definition.effects[0], definition.effects[0]]}]) {
        assert.throws(() => manager.normalizePlugin(value));
    }
    for (let value of [null, [], {id: "a", name: "a"}, {id: "a", name: "a", render() {}, renderPixel() {}},
        {id: "a", name: "a", render() {}, menu: "unknown"}, {id: "a", name: "a", render() {}, configure: 1}]) {
        assert.throws(() => manager.normalizeEffect(definition, value));
    }
    let configure = () => ({});
    assert.equal(manager.normalizeEffect(definition, {...definition.effects[0], configure}).definition.configure, configure);
    for (let result of [null, [], [1, 2, 3], new Uint8ClampedArray(4)]) {
        let effect = manager.normalizeEffect(definition, {id: "a", name: "a", renderPixel: () => result}).definition;
        if (result instanceof Uint8ClampedArray) {
            assert.equal(effect.transform(1, 2, 3, 4, {}), result);
        } else {
            assert.throws(() => effect.transform(1, 2, 3, 4, {}), /four channels/);
        }
    }
});

test("plugin ZIP packages enforce paths, metadata, expansion limits and embedded asset types", async () => {
    let {PluginManager: manager, window} = fixture();
    assert.equal(manager.isPluginFile(null), false);
    assert.equal(manager.isPluginFile({}), false);
    assert.equal(manager.isPluginFile({name: "TEST.PAINTJS"}), true);
    let entries = {"plugin.json": JSON.stringify(manifest()), "plugin.js": "/* valid package */", "assets/": new Uint8Array()};
    assert.equal((await manager.readPackage(packageFile(entries))).manifest.id, "test.plugin");
    for (let [changes, message] of [[{"../bad": "x"}, /Invalid file/],
        [{"plugin.json": "{"}, /invalid/], [{"plugin.js": "x".repeat(1048577)}, /1 MB/],
        [{"huge.txt": new Uint8Array(8 * 1024 * 1024)}, /8 MB/],
        [Object.fromEntries(Array.from({length: 129}, (_, i) => ["assets/" + i, ""])), /128 files/]]) {
        await assert.rejects(manager.readPackage(packageFile({...entries, ...changes})), message);
    }
    await assert.rejects(manager.readPackage(packageFile({"plugin.js": "x"})), /root/);
    let zip = window.ZipArchive;
    delete window.ZipArchive;
    await assert.rejects(manager.readPackage(packageFile(entries)), /ZIP support/);
    window.ZipArchive = zip;
    assert.equal(manager.resolvePackageAssets('paintDotJs.asset("icon.png")', {"assets/icon.png": new Uint8Array([1, 2, 3])}),
        '"data:image/png;base64,AQID"');
    assert.equal(manager.resolvePackageAssets("paintDotJs.asset('empty.txt')", {"assets/empty.txt": new Uint8Array()}),
        '"data:text/plain;base64,"');
    assert.throws(() => manager.resolvePackageAssets('paintDotJs.asset("absent.png")', {}), /missing/);
    assert.throws(() => manager.resolvePackageAssets('paintDotJs.asset("large.png")',
        {"assets/large.png": new Uint8Array(384 * 1024 + 1)}), /384 KB/);
    assert.throws(() => manager.resolvePackageAssets('paintDotJs.asset("a.exe")', {"assets/a.exe": new Uint8Array()}), /unsupported/);
    assert.throws(() => manager.resolvePackageAssets("paintDotJs.asset(variable)", {}), /invalid/);
});

test("file-type plugins validate extensions, document bounds, layer data and codec results", async () => {
    let {PluginFileTypes: types, PluginManager: manager} = fixture();
    let plugin = {id: "test", name: "Test"};
    let input = {id: "format", name: "Format", extensions: [".TEST"], decode() {}};
    let normalized = types.normalize(plugin, input);
    assert.equal(normalized.extension, ".test");
    assert.equal(normalized.mime, "application/octet-stream");
    for (let value of [null, {...input, decode: null}, {...input, extensions: null}, {...input, extensions: []},
        {...input, extensions: Array(17).fill(".test")}, {...input, extensions: [".test", ".TEST"]},
        {...input, extensions: [".png"]}, {...input, extensions: ["../bad"]}, {...input, mime: "invalid"}]) {
        assert.throws(() => types.normalize(plugin, value));
    }
    types.definitions.set(normalized.id, normalized);
    assert.equal(types.forFile({name: "IMAGE.TEST"}), normalized);
    assert.equal(types.forFile(), null);
    assert.deepEqual(Array.from(types.openExtensions()), [".test"]);
    assert.equal(types.saveFormats().length, 0);
    assert.throws(() => types.assertAvailable({id: "other", fileTypes: [normalized]}), /already handles/);
    types.assertAvailable({id: "test", fileTypes: [normalized]});
    let ft = {...manifest(), fileTypes: [input, input]};
    assert.throws(() => manager.normalizePlugin(ft), /Duplicate file type/);
    let image = {width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255])};
    let document = types.normalizeDocument(image);
    assert.equal(document.resolution, 96);
    assert.equal(document.activeLayer, 0);
    assert.equal(document.layers[0].name, "Background");
    assert.notEqual(document.layers[0].data, image.data);
    let layer = {data: image.data, blendMode: "multiply", opacity: 128, visible: false, isBackground: true};
    assert.equal(types.normalizeDocument({...image, layers: [layer]}).layers[0].blendMode, "multiply");
    for (let value of [null, {...image, width: 0}, {...image, height: -1}, {...image, width: 32769},
        {...image, height: 32769}, {...image, width: 32768, height: 32768}, {...image, layers: []},
        {...image, layers: {}}, {...image, layers: Array(65).fill(layer)},
        {...image, width: 8192, height: 8192, layers: [layer, layer]},
        {...image, resolution: 0}, {...image, activeLayer: -1}, {...image, activeLayer: 1},
        {...image, activeLayer: 0.5}, {...image, layers: [null]}, {...image, data: []},
        {...image, data: new Uint8Array(3)}, {...image, layers: [{...layer, opacity: -1}]},
        {...image, layers: [{...layer, opacity: 256}]}, {...image, layers: [{...layer, blendMode: "unknown"}]}]) {
        assert.throws(() => types.normalizeDocument(value));
    }
    let file = new Blob([new Uint8Array([1])]);
    normalized.decode = ({bytes, fileName}) => {
        assert.equal(bytes[0], 1);
        assert.equal(fileName, "");
        return image;
    };
    assert.equal((await types.decode(file, normalized)).width, 1);
    await assert.rejects(types.decode(file), /No enabled plugin/);
    await assert.rejects(types.decode({size: types.maximumBytes + 1}, normalized), /256 MB/);
    normalized.decode = () => ({...image, layers: [layer, layer]});
    await assert.rejects(types.decode(file, normalized), /layer support/);
    let encoder = types.normalize(plugin, {...input, decode: undefined, encode: () => new Uint8Array([42])});
    types.definitions.set(encoder.id, encoder);
    assert.equal(types.forFile({name: "x.test"}), null);
    assert.equal(types.saveFormats().length, 1);
    assert.equal(types.openExtensions().length, 0);
    assert.equal((await types.encode(encoder.id, image)).size, 1);
    await assert.rejects(types.encode("missing", image), /disabled/);
    await assert.rejects(types.encode(encoder.id, {...image, layers: [layer, layer]}), /flattened/);
    types.maximumBytes = 4;
    for (let result of [new Blob(["x"]), new Uint8ClampedArray([1]), new Uint8Array([1]).buffer,
        "invalid", new Uint8Array(), new Blob([new Uint8Array(5)])]) {
        encoder.encode = () => result;
        if (typeof result === "string" || result.byteLength === 0 || result.size > types.maximumBytes) {
            await assert.rejects(types.encode(encoder.id, image), /return|empty|oversized/);
        } else {
            assert.equal((await types.encode(encoder.id, image)).size, 1);
        }
    }
});

test("plugin catalog validates remote metadata, bounded downloads and package integrity", async () => {
    let context = fixture();
    let {PluginCatalog: catalog} = context;
    for (let url of ["http://example.com", "ftp://localhost", "https://user:pass@example.com"]) {
        assert.throws(() => catalog.validateUrl(url), /HTTPS/);
    }
    for (let url of ["https://example.com", "http://localhost", "http://127.0.0.1", "http://[::1]"]) {
        assert.ok(catalog.validateUrl(url) instanceof URL);
    }
    let requests = [];
    context.fetch = async (url, options) => {
        requests.push({url, options});
        return new Response(new Uint8Array([1, 2, 3]));
    };
    assert.deepEqual(Array.from(await catalog.download("https://example.com", 3)), [1, 2, 3]);
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(requests[0].options.redirect, "error");
    await catalog.download("https://example.com", 3, true);
    assert.ok(requests[1].url.searchParams.has("refresh"));
    await assert.rejects(catalog.download("https://example.com", 2), /size limit/);
    context.fetch = async () => new Response("missing", {status: 404});
    await assert.rejects(catalog.download("https://example.com", 5), /HTTP 404/);
    let entry = {...manifest(), file: "plugins/test.paintjs", sha256: "a".repeat(64)};
    let load = entries => {
        context.fetch = async () => Response.json({schemaVersion: 1, plugins: entries});
        return catalog.load();
    };
    let loaded = (await load([entry]))[0];
    assert.ok(loaded.url.endsWith("/plugins/test.paintjs"));
    assert.ok(loaded.source.endsWith("/test"));
    assert.equal((await load([{...entry, source: "https://example.com/source", website: undefined,
        description: undefined, author: undefined, category: undefined}]))[0].author, "Unknown");
    for (let entries of [[entry, entry], [{...entry, file: null}], [{...entry, file: "../a.paintjs"}],
        [{...entry, file: "/a.paintjs"}], [{...entry, file: "a?.paintjs"}],
        [{...entry, sha256: "bad"}], [{...entry, apiVersion: 2}],
        [{...entry, website: "http://example.com"}], [{...entry, source: "http://example.com"}]]) {
        await assert.rejects(load(entries));
    }
    for (let body of [{schemaVersion: 2, plugins: []}, {schemaVersion: 1},
        {schemaVersion: 1, plugins: Array(1001).fill(entry)}]) {
        context.fetch = async () => Response.json(body);
        await assert.rejects(catalog.load(), /format/);
    }
    let bytes = new Uint8Array([10, 20, 30]);
    context.fetch = async () => new Response(bytes);
    await assert.rejects(catalog.install({...entry, url: "https://example.com/test.paintjs"}), /integrity/);
    let hash = require("node:crypto").createHash("sha256").update(bytes).digest("hex");
    context.PluginManager.importFile = async (file, expected) => {
        assert.equal(file.name, entry.id + ".paintjs");
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
        assert.equal(expected.sha256, hash);
        return {id: expected.id};
    };
    assert.equal((await catalog.install({...entry, sha256: hash, url: "https://example.com/test.paintjs"})).id, entry.id);
});

test("public effect discovery handles duplicate, unavailable and translated definitions", () => {
    let context = fixture();
    let {PluginManager: manager} = context;
    assert.equal(manager.getPublicEffectDefinitions().length, 0);
    assert.throws(() => manager.getPublicEffectDefinition("missing"), /Unknown/);
    let first = {id: "first", transform() {}};
    let second = {id: "second", apply() {}, displayName: "Second", controls: [{key: "amount"}]};
    context.BitmapEffectEngine = {EFFECTS: {first, null: null, absent: undefined, invalid: {id: "invalid"}},
        DEFINITIONS: {first, second}, defaults: () => ({amount: 3})};
    assert.deepEqual(Array.from(manager.getPublicEffectDefinitions().map(value => value.name)), ["first", "Second"]);
    context.i18n = key => "Translated " + key;
    assert.ok(manager.getPublicEffectDefinitions().some(value => value.name === "Translated first.name"));
    assert.equal(manager.getPublicEffectDefinition("second"), second);
    let plugin = {id: "plain", name: "Plain", fileTypes: [], effects: [{definition: first}]};
    context.BitmapEffectAction = {forgetDefinition() {}};
    manager.activatePlugin(plugin);
    manager.deactivatePlugin(plugin.id);
    context.ActionRegistry = {initialized: false};
    manager.activatePlugin(plugin);
    manager.deactivatePlugin(plugin.id);
});

test("application startup reports initialization failure and always releases its loading state", async () => {
    let failures = [], removed = [];
    let context = vm.createContext({window: {paintDotJsAssetsReady: false},
        AssetPackManager: {initialize: async () => { throw new Error("storage unavailable"); }},
        console: {error: (...args) => failures.push(args)},
        document: {body: {classList: {remove: value => removed.push(value)}}}});
    let filename = path.resolve("js/src/main.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    await context.startPaintDotJs();
    assert.equal(failures[0][1].message, "storage unavailable");
    assert.deepEqual(removed, ["asset-pack-loading"]);
});
