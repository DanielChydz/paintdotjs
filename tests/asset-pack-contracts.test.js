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
    let storage = new Map();
    let events = [];
    let context = vm.createContext({URL, Blob, TextDecoder, Uint8Array, crypto: webcrypto, HTMLImageElement: function () {},
        console: {warn() {}}, navigator: {language: "pl-PL"},
        document: {documentElement: null}, CustomEvent: function (type, options) { return {type, ...options}; },
        localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)},
        window: {ZipArchive: {unzipSync}, dispatchEvent: event => events.push(event)}});
    let filename = path.resolve("js/src/engine/util/AssetPackManager.js");
    vm.runInContext(fs.readFileSync(filename, "utf8") + "\nthis.manager = AssetPackManager;", context,
        {filename: pathToFileURL(filename).href});
    let manager = context.manager;
    manager.initialization = Promise.resolve();
    manager.writePack = async () => {};
    manager.deletePack = async () => {};
    return {context, manager, storage, events};
}

function packFile(entries) {
    let file = new Blob([zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) =>
        [name, typeof value === "string" ? new TextEncoder().encode(value) : value])))]);
    Object.defineProperty(file, "name", {value: "pack.zip"});
    return file;
}

test("icon packs reject unsafe paths, bad manifests and oversized or unsupported archives", async () => {
    let {manager, context} = fixture();
    for (let value of [null, [], 1, {formatVersion: 2}, {formatVersion: 1}, {formatVersion: 1, name: " "},
        {formatVersion: 1, name: "x".repeat(81)}, {formatVersion: 1, name: "x", author: 2}]) {
        assert.throws(() => manager.validateManifest(value));
    }
    assert.equal(manager.isZipFile(null), false);
    assert.equal(manager.isZipFile({}), false);
    assert.equal(manager.isZipFile({type: "application/zip"}), true);
    assert.equal(manager.isZipFile({type: "application/x-zip-compressed"}), true);
    for (let value of ["", "/abs", "C:\\abs", "../bad", "icons/../bad", "a\0b"]) {
        assert.equal(manager.normalizePath(value), null);
    }
    assert.equal(manager.normalizePath("./icons\\a.png"), "icons/a.png");
    assert.throws(() => manager.parseJson(new TextEncoder().encode("{"), "bad"), /valid JSON/);
    await assert.rejects(manager.importFile(new Blob()), /ZIP/);
    await assert.rejects(manager.importFile({name: "large.zip", size: 25 * 1024 * 1024 + 1}), /25 MB/);
    let manifest = {formatVersion: 1, name: "Fixture"};
    let entries = {"asset-pack.json": JSON.stringify(manifest)};
    for (let [data, error] of [[{}, /asset-pack.json/], [entries, /supported/],
        [{...entries, "../bad.png": "x"}, /Invalid path/],
        [{...entries, "lang/pl.json": "[]"}, /JSON object/],
        [{...entries, "lang/pl.json": "null"}, /JSON object/],
        [{...entries, ...Object.fromEntries(Array.from({length: 1001}, (_, i) => ["icons/" + i, ""]))}, /1,000/]]) {
        await assert.rejects(manager.importFile(packFile(data)), error);
    }
    let original = context.window.ZipArchive;
    delete context.window.ZipArchive;
    await assert.rejects(manager.importFile(packFile(entries)), /ZIP support/);
    context.window.ZipArchive = {unzipSync: (bytes, options) => {
        options.filter({originalSize: 60 * 1024 * 1024 + 1});
    }};
    await assert.rejects(manager.importFile(packFile(entries)), /60 MB/);
    context.window.ZipArchive = {unzipSync: () => ({
        "asset-pack.json": new TextEncoder().encode(JSON.stringify(manifest)),
        "icons/huge.png": new Uint8Array(60 * 1024 * 1024 + 1)
    })};
    await assert.rejects(manager.importFile(packFile(entries)), /60 MB/);
    context.window.ZipArchive = original;
    let nested = packFile({"folder/asset-pack.json": JSON.stringify({...manifest, name: "!!!"}),
        "folder/lang/en.json": "{}", "folder/": new Uint8Array(), "outside.txt": "ignored"});
    let record = await manager.importFile(nested);
    assert.ok(record.id.startsWith("asset-pack-"));
    assert.equal(record.author, "Unknown");
    assert.equal(record.localeCount, 1);
    assert.equal(manager.getPacks().length, 2);
    assert.equal(await manager.remove("absent"), false);
    await manager.remove(record.id);
    assert.equal(manager.getActivePackId(), "default");
    await assert.rejects(manager.activate("absent"), /not installed/);
});

test("icon pack previews prioritize known tools and translation preferences survive unavailable storage", async () => {
    let {manager, context, storage} = fixture();
    let paths = ["assets/images/z.png", "assets/icons/z.png", "assets/icons/a.png", manager.previewPaths[0]];
    let pack = {id: "fixture", files: paths.map(path => ({path, data: new Uint8Array([1]), type: "image/png"})),
        translations: {en: {title: "English"}, pl: {title: "Polski"}, "de-DE": {title: "Deutsch"}}};
    manager.packs = [pack];
    assert.equal(manager.getPreviewFiles("absent").length, 0);
    assert.equal(manager.getPreviewFiles("default", 1)[0].data, null);
    assert.deepEqual(Array.from(manager.getPreviewFiles(pack.id).map(file => file.path)),
        [paths[3], paths[2], paths[1], paths[0]]);
    context.Language = context.window.Language = {setPackLocales: codes => { context.locales = codes; }, code: "pl"};
    let preference = "PL_pl";
    context.AppSettingsStore = {get: () => preference, set: (key, value) => { preference = value; }};
    manager.normalizeLanguagePreference(["pl"]);
    assert.equal(preference, "pl");
    assert.equal(context.Language.preference, "pl");
    manager.normalizeLanguagePreference(["pl"]);
    preference = "de-DE";
    manager.normalizeLanguagePreference(["de-DE"]);
    assert.equal(preference, "de-DE");
    preference = "unknown";
    manager.normalizeLanguagePreference(["pl"]);
    assert.equal(preference, "en");
    preference = "auto";
    manager.normalizeLanguagePreference(["pl"]);
    assert.equal(preference, "auto");
    storage.set("paintdotjs.settings.v1", JSON.stringify({ui: {language: "pl"}}));
    assert.equal(manager.getLanguagePreference(), "pl");
    await manager.activate(pack.id);
    assert.equal(manager.resolve("./assets/icons/a.png").startsWith("blob:"), true);
    assert.equal(manager.resolve(null), null);
    assert.ok(storage.get(manager.activeLocalesKey).includes("pl"));
    for (let requested of ["auto", "PL", "de_AT", "unknown", ""]) {
        manager.prepareLanguage(requested);
        let translated = JSON.parse(storage.get(manager.activeTranslationsKey));
        assert.equal(translated.en.title, "English");
        if (requested === "auto" || requested === "PL") {
            assert.equal(translated.pl.title, "Polski");
        }
    }
    storage.set("paintdotjs.settings.v1", "{");
    assert.equal(manager.getLanguagePreference(), "auto");
    context.localStorage = {getItem() { throw new Error("unavailable"); },
        setItem() { throw new Error("unavailable"); }, removeItem() { throw new Error("unavailable"); }};
    manager.prepareLanguage("pl");
    await manager.activate(pack.id);
    manager.activePack = null;
    manager.prepareLanguage("pl");
    await manager.applyPack(null);
    assert.equal(manager.objectUrls.size, 0);
    manager.observer = {};
    manager.observeImages();
    manager.applyToTree({});
});
