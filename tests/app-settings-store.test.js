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
const {EventEmitter} = require("node:events");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

function settingsFixture(options = {}) {
    let storage = new Map(Object.entries(options.storage || {}));
    let events = [];
    let classes = new Set();
    let properties = new Map();
    let fills = [];
    let state = {invalidations: 0, views: true, writeError: false, readError: false, ...options};
    let query = new EventEmitter();
    query.matches = false;
    query.addEventListener = query.on;
    let window = {
        dispatchEvent: event => events.push(event),
        matchMedia: name => {
            assert.equal(name, "(prefers-color-scheme: dark)");
            return query;
        }
    };
    let root = {dataset: {}, style: {setProperty: (key, value) => properties.set(key, value)},
        classList: {toggle: (name, enabled) => {
            if (enabled) {
                classes.add(name);
            } else {
                classes.delete(name);
            }
        }}};
    let view = {style: {}};
    let context = vm.createContext({
        window,
        CustomEvent: function (type, options) {
            this.type = type;
            this.detail = options.detail;
        },
        localStorage: {
            getItem: key => {
                if (state.readError) {
                    throw new Error("Storage inaccessible");
                }
                return storage.get(key) ?? null;
            },
            setItem: (key, value) => {
                if (state.writeError) {
                    throw new Error("Quota exceeded");
                }
                storage.set(key, value);
            }
        },
        document: {
            documentElement: root,
            getElementById: id => {
                assert.equal(id, "view");
                return state.views ? view : null;
            },
            createElement: tag => {
                assert.equal(tag, "canvas");
                let canvas = {getContext: type => {
                    assert.equal(type, "2d");
                    let drawing = {fillRect: (...args) => fills.push([drawing.fillStyle, ...args])};
                    return drawing;
                }, toDataURL: type => {
                    assert.equal(type, "image/png");
                    assert.equal(canvas.width, 8);
                    assert.equal(canvas.height, 8);
                    return "data:image/png;base64,checkerboard";
                }};
                return canvas;
            }
        }
    });
    let filename = path.resolve(__dirname, "../js/src/interface/window/settings/AppSettingsStore.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let store = vm.runInContext("AppSettingsStore", context);
    return {store, storage, state, events, classes, properties, fills, window, root, view, query};
}

test("settings recover from malformed persisted values and unavailable storage", () => {
    for (let value of ["null", "false", "42", '"text"', "[]", "{broken", ""]) {
        let fixture = settingsFixture({storage: {"paintdotjs.settings.v1": value}});
        assert.equal(fixture.store.get("canvas.checkerboardBrightness"), 75);
        assert.equal(fixture.store.get("ui.animations"), true);
        assert.equal(fixture.store.get("missing.value"), null);
        assert.equal(fixture.store.get("missing.value", 42), 42);
    }
    for (let options of [{readError: true}, {writeError: true}]) {
        let fixture = settingsFixture(options);
        assert.equal(fixture.store.get("ui.language"), "auto");
        fixture.store.set("custom.value", 17);
        assert.equal(fixture.store.get("custom.value"), 17);
        assert.equal(fixture.events.at(-1).detail.value, 17);
    }
});

test("checkerboard migration runs once and preserves subsequent explicit choices", () => {
    let fixture = settingsFixture({storage: {
        "paintdotjs.settings.v1": JSON.stringify({canvas: {checkerboardBrightness: 100}, ui: {language: "pl"}})
    }});
    assert.equal(fixture.store.get("canvas.checkerboardBrightness"), 75);
    assert.equal(JSON.parse(fixture.storage.get(fixture.store.storageKey)).canvas.checkerboardBrightness, 75);
    assert.equal(fixture.store.get("ui.language"), "pl");
    assert.equal(fixture.storage.get(fixture.store.checkerboardDefaultMigrationKey), "1");
    fixture.store.set("canvas.checkerboardBrightness", 100);
    assert.equal(fixture.store.load().canvas.checkerboardBrightness, 100);
    fixture.state.writeError = true;
    fixture.store.set("tools.defaultTool", "pencilTool");
    assert.equal(fixture.store.get("tools.defaultTool"), "pencilTool");
    assert.notEqual(JSON.parse(fixture.storage.get(fixture.store.storageKey)).tools.defaultTool, "pencilTool");
});

test("settings apply theme, checkerboard geometry, view styles and document invalidation", () => {
    let fixture = settingsFixture();
    let {store, root, properties, fills, classes, view, window, state} = fixture;
    store.apply();
    assert.equal(root.dataset.colorScheme, "light");
    assert.equal(properties.get("--checkerboard-brightness"), "0.75");
    assert.deepEqual(fills.slice(-4), [
        ["rgb(143, 143, 143)", 0, 0, 4, 4], ["rgb(143, 143, 143)", 4, 4, 4, 4],
        ["rgb(191, 191, 191)", 4, 0, 4, 4], ["rgb(191, 191, 191)", 0, 4, 4, 4]
    ]);
    store.set("ui.animations", false);
    store.set("ui.translucentWindows", false);
    store.set("ui.overscroll", false);
    assert.equal(classes.has("settings-animations-disabled"), true);
    assert.equal(classes.has("settings-translucent-windows"), false);
    assert.equal(view.style.overscrollBehavior, "none");
    window.app = {};
    store.set("canvas.customBorder", true);
    assert.equal(classes.has("settings-canvas-custom-border"), true);
    window.app = {getActiveDocumentWorkspace: () => null};
    store.set("canvas.dropShadow", false);
    assert.equal(classes.has("settings-canvas-shadow"), false);
    window.app.getActiveDocumentWorkspace = () => ({getDocument: () => null});
    store.set("canvas.borderColor", "#123456");
    window.app.getActiveDocumentWorkspace = () => ({getDocument: () => ({invalidate: () => ++state.invalidations})});
    store.set("ui.colorScheme", "blue");
    assert.equal(state.invalidations, 1);
    assert.equal(root.dataset.colorScheme, "blue");
    for (let [value, expected] of [[-100, "0.25"], [200, "1"]]) {
        store.set("canvas.checkerboardBrightness", value);
        assert.equal(properties.get("--checkerboard-brightness"), expected);
    }
    state.views = false;
    store.apply();
    delete window.matchMedia;
    assert.equal(store.resolveColorScheme("default"), "dark");
    store.watchSystemColorScheme();
    assert.equal(store.systemColorSchemeQuery, null);
});

test("system theme observer registers once, follows default and ignores explicit themes", () => {
    let {store, window, root, query, events, state} = settingsFixture();
    store.watchSystemColorScheme();
    store.watchSystemColorScheme();
    assert.equal(query.listenerCount("change"), 1);
    query.matches = true;
    query.emit("change");
    assert.equal(root.dataset.colorScheme, "dark");
    assert.equal(events.at(-1).type, "paintdotjs:theme-changed");
    assert.equal(events.at(-1).detail.preference, "default");
    window.app = {};
    query.matches = false;
    query.emit("change");
    assert.equal(root.dataset.colorScheme, "light");
    window.app.getActiveDocumentWorkspace = () => null;
    query.emit("change");
    window.app.getActiveDocumentWorkspace = () => ({getDocument: () => null});
    query.emit("change");
    window.app.getActiveDocumentWorkspace = () => ({getDocument: () => ({invalidate: () => ++state.invalidations})});
    query.emit("change");
    assert.equal(state.invalidations, 1);
    store.set("ui.colorScheme", "blue");
    let count = events.length;
    query.matches = true;
    query.emit("change");
    assert.equal(events.length, count);
    assert.equal(root.dataset.colorScheme, "blue");
});
