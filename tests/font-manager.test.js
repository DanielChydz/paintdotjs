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

function fontFixture(options = {}) {
    let state = {events: [], warnings: [], errors: [], closed: 0, selected: "Calibri", ...options};
    let storage = new Map();
    let records = new Map();
    let fonts = new Set();
    let database = {
        close: () => ++state.closed,
        transaction: (name, mode) => {
            assert.equal(name, "fonts");
            assert.ok(["readonly", "readwrite"].includes(mode));
            let request = {};
            let transaction = {objectStore: storeName => {
                assert.equal(storeName, "fonts");
                return {
                    getAllKeys: () => {
                        request.result = [...records.keys()];
                        return request;
                    },
                    get: id => {
                        request.result = records.get(id);
                        return request;
                    },
                    put: record => {
                        request.result = record.id;
                        transaction.commit = () => records.set(record.id, record);
                        return request;
                    },
                    delete: id => {
                        transaction.commit = () => records.delete(id);
                        return request;
                    },
                    clear: () => {
                        transaction.commit = () => records.clear();
                        return request;
                    }
                };
            }};
            queueMicrotask(() => {
                if (state.abort) {
                    transaction.error = state.transactionError;
                    transaction.onabort();
                } else {
                    transaction.commit?.();
                    transaction.oncomplete();
                }
            });
            return transaction;
        }
    };
    function FontFace(family, data) {
        this.family = family;
        this.data = data;
        this.load = async () => {
            if (state.faceError) {
                throw state.faceError;
            }
            if (state.beforeLoad) {
                await state.beforeLoad();
            }
            return this;
        };
    }
    let window = {
        indexedDB: {}, FontFace,
        dispatchEvent: event => state.events.push(event),
        app: {fire: (...args) => state.events.push(args)}
    };
    let context = vm.createContext({
        window, FontFace, crypto: {randomUUID: () => "font-" + (records.size + 1)},
        console: {warn: (...args) => state.warnings.push(args), error: (...args) => state.errors.push(args)},
        document: {fonts},
        requestAnimationFrame: callback => queueMicrotask(callback),
        localStorage: {
            getItem: key => {
                if (state.readError) {
                    throw new Error("Storage denied");
                }
                return storage.get(key) ?? null;
            },
            setItem: (key, value) => {
                if (state.writeError) {
                    throw new Error("Storage full");
                }
                storage.set(key, value);
            }
        },
        CustomEvent: function (type, options) {
            this.type = type;
            this.detail = options.detail;
        },
        ToolType: {TEXT: {
            getSetting: key => {
                assert.equal(key, "fontFamily");
                return state.selected;
            },
            setSetting: (key, value) => {
                assert.equal(key, "fontFamily");
                state.selected = value;
            }
        }}
    });
    let filename = path.resolve(__dirname, "../js/src/engine/util/FontManager.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let manager = vm.runInContext("FontManager", context);
    let openDatabase = manager.openDatabase.bind(manager);
    manager.openDatabase = async () => {
        if (state.databaseError) {
            throw state.databaseError;
        }
        return database;
    };
    let file = (name, type = "", data = new Uint8Array([1, 2, 3]).buffer) => ({name, type, arrayBuffer: async () => data});
    return {state, storage, records, fonts, database, manager, context, window, file, openDatabase};
}

test("font metadata validation rejects damaged caches and omits heavyweight byte buffers", async () => {
    let {manager, storage, state, records} = fontFixture();
    assert.equal(manager.isInitializing(), false);
    for (let value of [null, "{broken", "{}", "[null]", '[{"id":1}]',
        '[{"id":"a","name":3}]', '[{"id":"a","name":"A","family":4}]']) {
        if (value !== null) {
            storage.set(manager.metadataCacheKey, value);
        }
        assert.equal(manager.readMetadataCache(), null);
    }
    state.readError = true;
    assert.equal(manager.readMetadataCache(), null);
    state.readError = false;
    let record = {id: "a", name: "Alpha", family: "family-a", size: 3, data: new Uint8Array([1, 2, 3]).buffer};
    records.set("a", record);
    let initializing = manager.initialize();
    assert.equal(manager.isInitializing(), true);
    assert.equal(manager.initialize(), initializing);
    await initializing;
    assert.equal(manager.isInitializing(), false);
    assert.equal(manager.getFonts().length, 1);
    assert.equal(manager.getFonts()[0].data, undefined);
    assert.equal(manager.getFonts()[0].name, "Alpha");
    assert.equal(state.closed, 1);
    let cached = manager.readMetadataCache();
    assert.equal(cached[0].id, "a");
    manager.records = [];
    await manager.loadStoredFonts();
    assert.equal(manager.getFonts()[0].id, "a");
    assert.equal(state.closed, 1, "Reading a metadata cache must not reopen the font-byte store");
    state.writeError = true;
    manager.writeMetadataCache();
    assert.equal(state.warnings.length, 1);
});

test("font startup reports database failures and degrades gracefully without browser APIs", async () => {
    let fixture = fontFixture({databaseError: new Error("Database failed")});
    await fixture.manager.initialize();
    assert.equal(fixture.manager.metadataReady, true);
    assert.equal(fixture.state.errors.length, 1);
    assert.equal(fixture.state.errors[0][1], fixture.state.databaseError);
    for (let missing of ["indexedDB", "FontFace"]) {
        fixture = fontFixture();
        delete fixture.window[missing];
        await fixture.manager.initialize();
        assert.equal(fixture.manager.getFonts().length, 0);
        assert.equal(fixture.manager.metadataReady, true);
        assert.equal(fixture.state.closed, 0);
    }
});

test("font validation and aborted persistence leave no registered face or metadata", async () => {
    let {manager, file, state, fonts, records} = fontFixture();
    for (let candidate of [null, undefined, {}, file("image.png")]) {
        assert.equal(manager.isFontFile(candidate), false);
    }
    assert.equal(manager.isFontFile(file("FONT.OTF")), true);
    assert.equal(manager.isFontFile(file("", "FONT/WOFF2")), true);
    await assert.rejects(manager.addFont(file("invalid.png")), /Unsupported font format/);
    await assert.rejects(manager.addFont(file("empty.ttf", "", new ArrayBuffer(0))), /empty/);
    state.faceError = new Error("Invalid font bytes");
    await assert.rejects(manager.addFont(file("broken.ttf")), error => error === state.faceError);
    state.faceError = null;
    state.abort = true;
    await assert.rejects(manager.addFont(file("rolled-back.ttf")), /transaction failed/);
    assert.equal(fonts.size, 0);
    assert.equal(records.size, 0);
    assert.equal(manager.getFonts().length, 0);
    assert.equal(state.events.length, 0);
    state.abort = false;
    state.databaseError = new Error("Offline storage");
    await assert.rejects(manager.addFont(file("offline.ttf")), error => error === state.databaseError);
    assert.equal(fonts.size, 0);
});

test("font imports sanitize families, collect failures and reset selected custom faces on deletion", async () => {
    let {manager, file, state, context, fonts} = fontFixture();
    context.crypto = {};
    let first = await manager.addFont(file("\\'\";, .ttf"));
    assert.ok(first.family.startsWith("paintjs-font-"));
    assert.equal(first.data, undefined);
    let unnamed = await manager.addFont(file("", "font/woff"), false);
    assert.equal(unnamed.name, "Custom Font");
    assert.equal(unnamed.fileName, "Custom Font");
    let blank = await manager.addFont(file("  .ttf"), false);
    assert.equal(blank.name, "Custom Font");
    assert.equal(manager.isCustomFont(first.id), true);
    assert.equal(manager.isCustomFont(first.family), true);
    assert.equal(await manager.removeFont("missing"), false);
    state.selected = first.family;
    assert.equal(await manager.removeFont(first.id), true);
    assert.equal(state.selected, "sans-serif");
    assert.equal(manager.faces.has(first.id), false);
    state.selected = unnamed.family;
    assert.equal(await manager.removeAllFonts(), 2);
    assert.equal(state.selected, "sans-serif");
    assert.equal(fonts.size, 0);
    assert.equal(await manager.removeAllFonts(), 0);
    let progress = [];
    let imported = await manager.importFiles([file("B.ttf"), file("A.ttf"), file("empty.ttf", "", new ArrayBuffer(0)), file("skip.png")],
        event => progress.push([event.completed, event.total, event.phase]));
    assert.equal(imported.added.length, 2);
    assert.equal(imported.errors.length, 1);
    assert.equal(imported.errors[0].file.name, "empty.ttf");
    assert.deepEqual(progress, [[0, 3, "preparing"], [0, 3, "adding"], [1, 3, "complete"],
        [1, 3, "adding"], [2, 3, "complete"], [2, 3, "adding"], [3, 3, "complete"]]);
    assert.deepEqual(Array.from(manager.getFonts(), font => font.name), ["A", "B"]);
    assert.equal(manager.getTextToolChoices().at(-1)[1], "B");
    assert.equal((await manager.importFiles()).added.length, 0);
});

test("lazy font loading deduplicates requests, discards removed faces and recovers after failures", async () => {
    let {manager, records, fonts, file, state} = fontFixture();
    let metadata = await manager.addFont(file("Alpha.ttf"));
    assert.equal(await manager.ensureLoaded("missing"), null);
    assert.equal(await manager.ensureLoaded(metadata.id), manager.faces.get(metadata.id));
    fonts.clear();
    manager.faces.clear();
    let loading = manager.ensureLoaded(metadata.family);
    let duplicate = manager.ensureLoaded(metadata.id);
    let [first, second] = await Promise.all([loading, duplicate]);
    assert.equal(first, second);
    assert.equal(fonts.size, 1);
    assert.equal(manager.loadingFaces.size, 0);
    fonts.clear();
    manager.faces.clear();
    records.delete(metadata.id);
    assert.equal(await manager.ensureLoaded(metadata.id), null);
    assert.equal(manager.faces.size, 0);
    records.set(metadata.id, {...metadata, data: new Uint8Array([1, 2, 3]).buffer});
    state.faceError = new Error("Decode rejected");
    await assert.rejects(manager.ensureLoaded(metadata.id), error => error === state.faceError);
    assert.equal(manager.loadingFaces.size, 0);
    state.faceError = null;
    state.beforeLoad = () => manager.records = [];
    assert.equal(await manager.ensureLoaded(metadata.id), null);
    assert.equal(fonts.size, 0);
    assert.equal(manager.faces.size, 0);
});

test("font scheduling prefers idle callbacks, then scheduler yield, then animation frames", async () => {
    let {manager, context} = fontFixture();
    let calls = [];
    context.requestIdleCallback = (callback, options) => {
        assert.equal(options.timeout, 100);
        calls.push("idle");
        callback();
    };
    context.scheduler = {yield: async () => calls.push("scheduler")};
    await manager.yieldToBrowser(true);
    await manager.yieldToBrowser();
    delete context.requestIdleCallback;
    await manager.yieldToBrowser(true);
    context.scheduler = {};
    context.requestAnimationFrame = callback => {
        calls.push("frame");
        callback();
    };
    await manager.yieldToBrowser();
    assert.deepEqual(calls, ["idle", "scheduler", "scheduler", "frame"]);
});

test("font database requests expose native errors and upgrade only a missing store", async () => {
    let {context, window, openDatabase} = fontFixture();
    delete window.indexedDB;
    await assert.rejects(openDatabase(), /Persistent browser storage is not available/);
    window.indexedDB = {};
    let request;
    context.indexedDB = {open: (name, version) => {
        assert.equal(name, "paintdotjs-user-fonts");
        assert.equal(version, 1);
        request = {};
        return request;
    }};
    for (let exists of [true, false]) {
        let created = [];
        let database = {objectStoreNames: {contains: name => {
            assert.equal(name, "fonts");
            return exists;
        }}, createObjectStore: (name, options) => created.push([name, options.keyPath])};
        let opening = openDatabase();
        request.result = database;
        request.onupgradeneeded();
        assert.deepEqual(created, exists ? [] : [["fonts", "id"]]);
        request.onsuccess();
        assert.equal(await opening, database);
    }
    for (let error of [null, new Error("IndexedDB denied")]) {
        let opening = openDatabase();
        request.error = error;
        request.onerror();
        await assert.rejects(opening, failure => error ? failure === error : /Could not open font storage/.test(failure.message));
    }
});

test("font request failures reject before completion without closing caller-owned databases", async () => {
    let {manager} = fontFixture();
    for (let error of [null, new Error("Request failed")]) {
        let closed = 0;
        let transaction = {objectStore: () => ({})};
        let database = {transaction: () => transaction, close: () => ++closed};
        let request = {error};
        let running = manager.runRequest(database, "readonly", () => request, false);
        request.onerror();
        await assert.rejects(running, failure => error ? failure === error : /operation failed/.test(failure.message));
        transaction.onabort();
        assert.equal(closed, 0);
    }
});

test("uncached fonts omit deleted records and can be removed without loaded faces or a Text tool", async () => {
    let {manager, records, context, state} = fontFixture();
    records.set("missing", undefined);
    records.set("valid", {id: "valid", name: "Stored", family: "stored-family", size: 4});
    await manager.initialize();
    assert.equal(manager.getFonts().length, 1);
    assert.equal(manager.faces.size, 0);
    delete context.ToolType;
    assert.equal(await manager.removeFont("valid"), true);
    assert.equal(manager.getFonts().length, 0);
    manager.records = [{id: "legacy", name: "Legacy", family: "legacy-family"}];
    assert.equal(await manager.removeAllFonts(), 1);
    assert.equal(state.closed, 3);
});


test("font settings distinguish pending metadata loading from a completed empty library", async () => {
    let {manager, context, window, database} = fontFixture();
    let release;
    manager.openDatabase = () => new Promise(resolve => { release = () => resolve(database); });
    let loading = manager.initialize();
    assert.equal(manager.isInitializing(), true);
    context.AppSettingsStore = {apply() {}, watchSystemColorScheme() {}};
    window.addEventListener = () => {};
    context.document.createElement = () => ({className: "", textContent: ""});
    let filename = path.resolve(__dirname, "../js/src/interface/window/dialog/SettingsDialog.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let settings = vm.runInContext("new SettingsDialog()", context);
    let children = [];
    settings.fontList = {isConnected: true, innerHTML: "", appendChild: child => children.push(child)};
    settings.renderFontRows();
    assert.equal(children.at(-1).textContent, "Loading installed fonts…");
    release();
    await loading;
    settings.renderFontRows();
    assert.equal(manager.isInitializing(), false);
    assert.equal(children.at(-1).textContent, "No custom fonts have been added.");
    assert.equal(manager.getFonts().length, 0);
});
