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

test("Windows system settings links are disabled outside the Windows desktop", () => {
    for (let platform of ["linux", "darwin", "freebsd", "win32", null]) {
        let buttons = [];
        let opened = [];
        let globals = {
            isApp: platform !== null,
            AppSettingsStore: {apply() {}, watchSystemColorScheme() {}},
            window: {
                addEventListener() {},
                open: (...args) => opened.push(args)
            }
        };
        if (platform !== null) {
            globals.process = {platform};
        }
        let context = vm.createContext(globals);
        let filename = path.resolve(__dirname, "../js/src/interface/window/dialog/SettingsDialog.js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
        let settings = vm.runInContext("new SettingsDialog()", context);
        for (let method of ["addHeading", "addCheckbox", "addNote", "addSectionHeading"]) {
            settings[method] = () => {};
        }
        settings.addButton = (label, callback, options) => buttons.push({label, callback, ...options});
        settings.renderPen();
        settings.renderColorManagement();
        assert.equal(buttons.length, 2);
        for (let button of buttons) {
            assert.equal(button.disabled, platform !== "win32", `${platform}: ${button.label}`);
            assert.equal(button.tooltip, "Available in the Windows desktop app");
            if (!button.disabled) {
                button.callback();
            }
        }
        assert.deepEqual(opened, platform === "win32" ? [
            ["ms-settings:pen", "_blank", "noopener"],
            ["ms-settings:display", "_blank", "noopener"]
        ] : []);
    }
});

function updateFixture(options = {}) {
    let state = {dirty: false, choice: "reload", scopes: [], cacheNames: [], unregistered: [],
        deleted: [], errors: [], statuses: [], ...options};
    let scope = "https://paint.example.test/editor/";
    let window = {
        addEventListener() {},
        app: {hasUnsavedDocuments: () => state.dirty},
        location: {href: scope + "?document=example&v=old#canvas", replace: url => state.reloaded = url},
        caches: {},
        desktopUpdater: {check: async () => {
            throw new Error("Network unavailable");
        }}
    };
    let context = vm.createContext({
        isApp: !!options.isApp, window, URL, Date: {now: () => 123456789},
        console: {error: (...args) => state.errors.push(args)},
        document: {baseURI: scope + "index.html"},
        AppSettingsStore: {apply() {}, watchSystemColorScheme() {}},
        TaskDialog: {show: async settings => {
            state.dialog = settings;
            return state.choice;
        }},
        navigator: {serviceWorker: {getRegistrations: async () => {
            if (state.workerError) {
                throw state.workerError;
            }
            return state.scopes.map(registrationScope => ({scope: registrationScope, unregister: async () => {
                state.unregistered.push(registrationScope);
                return true;
            }}));
        }}},
        caches: {
            keys: async () => state.cacheNames,
            delete: async name => {
                if (state.cacheError) {
                    throw state.cacheError;
                }
                state.deleted.push(name);
                return true;
            }
        }
    });
    let filename = path.resolve(__dirname, "../js/src/interface/window/dialog/SettingsDialog.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let settings = vm.runInContext("new SettingsDialog()", context);
    settings.setStatus = message => state.statuses.push(message);
    return {settings, state, context, window, scope, button: {textContent: "Check now", disabled: false}};
}

test("web update cancellation keeps unsaved work, registrations and caches intact", async () => {
    let {settings, state, button} = updateFixture({dirty: true, choice: "cancel"});
    await settings.checkForUpdates(button);
    assert.equal(state.dialog.cancelValue, "cancel");
    assert.ok(state.dialog.message.includes("Save your changes"));
    assert.equal(state.reloaded, undefined);
    assert.equal(state.unregistered.length, 0);
    assert.equal(state.deleted.length, 0);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Check now");
});

test("web update clears only this app's registrations and caches before a cache-busting reload", async () => {
    for (let dirty of [true, false]) {
        let fixture = updateFixture({dirty});
        let {settings, state, scope, button} = fixture;
        state.scopes = [scope, "https://paint.example.test/other/", scope + "nested/"];
        state.cacheNames = ["paintdotjs-shell-v1", "other-app", "PAINTDOTJS-assets-v2"];
        await settings.checkForUpdates(button);
        assert.deepEqual(state.unregistered, [scope]);
        assert.deepEqual(state.deleted, ["paintdotjs-shell-v1", "PAINTDOTJS-assets-v2"]);
        let target = new URL(state.reloaded);
        assert.equal(target.pathname, "/editor/");
        assert.equal(target.searchParams.get("document"), "example");
        assert.equal(target.searchParams.get("v"), "123456789");
        assert.equal(target.hash, "#canvas");
        assert.equal(button.disabled, true);
        assert.equal(button.textContent, "Checking...");
    }
    let fixture = updateFixture();
    delete fixture.context.navigator.serviceWorker;
    delete fixture.window.caches;
    delete fixture.window.app;
    await fixture.settings.checkForUpdates(fixture.button);
    assert.ok(fixture.state.reloaded);
});

test("failed web or desktop update restores controls and reports a recoverable failure", async () => {
    for (let failure of ["worker", "cache", "reload", "desktop"]) {
        let fixture = updateFixture({isApp: failure === "desktop"});
        let error = new Error("Update failed");
        if (failure === "worker") {
            fixture.state.workerError = error;
        } else if (failure === "cache") {
            fixture.state.cacheNames = ["paintdotjs-shell"];
            fixture.state.cacheError = error;
        } else if (failure === "reload") {
            fixture.window.location.replace = () => {
                throw error;
            };
        }
        await fixture.settings.checkForUpdates(fixture.button);
        assert.equal(fixture.button.disabled, false);
        assert.equal(fixture.button.textContent, "Check now");
        assert.equal(fixture.state.reloaded, undefined);
        assert.equal(fixture.state.errors.length, 1);
        assert.ok(/failed|Could not clear/.test(fixture.state.statuses.at(-1)));
    }
});

test("web update settings describe the web cache workflow and expose disabled channel preferences", () => {
    let {settings} = updateFixture();
    let controls = [];
    let notes = [];
    settings.addHeading = title => assert.equal(title, "Updates");
    settings.addCheckbox = (key, label, options) => controls.push({key, label, ...options});
    settings.addButton = (label, callback) => ({label, callback});
    settings.addNote = text => notes.push(text);
    settings.renderUpdates();
    assert.equal(controls.length, 2);
    assert.ok(controls.every(control => control.disabled));
    assert.ok(controls[0].note.includes("installed web app"));
    assert.equal(controls[1].key, "updates.prerelease");
    assert.equal(notes.length, 1);
    assert.ok(notes[0].includes("offline cache"));
});

test("graphics availability tries supported context versions and tolerates allocation errors", () => {
    let {settings, context} = updateFixture();
    for (let [available, expected, calls] of [
        [{webgl2: {}}, true, ["webgl2"]],
        [{webgl2: null, webgl: {}}, true, ["webgl2", "webgl"]],
        [{webgl2: null, webgl: null}, false, ["webgl2", "webgl"]]
    ]) {
        let requested = [];
        context.document.createElement = tag => {
            assert.equal(tag, "canvas");
            return {getContext: type => {
                requested.push(type);
                return available[type];
            }};
        };
        assert.equal(settings.isWebGlAvailable(), expected);
        assert.deepEqual(requested, calls);
    }
    context.document.createElement = () => {
        throw new Error("Canvas allocation failed");
    };
    assert.equal(settings.isWebGlAvailable(), false);
});

test("version metadata tolerates absent globals and formats only nonempty distribution labels", () => {
    let window = {};
    let context = vm.createContext({window});
    let filename = path.resolve(__dirname, "../js/src/PdjInfo.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let info = vm.runInContext("PdjInfo", context);
    assert.equal(info.version(), "Unknown version");
    assert.equal(info.distribution(), null);
    window.PDJVERSION = 123;
    window.PDJDISTRIBUTION = "";
    assert.equal(info.version(), "Unknown version");
    assert.equal(info.distribution(), null);
    window.PDJVERSION = "2.1.16";
    window.PDJDISTRIBUTION = "Ubuntu";
    assert.equal(info.version(), "2.1.16 (Ubuntu)");
    assert.equal(info.formatVersion("3.0.0"), "3.0.0 (Ubuntu)");
    assert.equal(info.productName(), "paint.js");
});
