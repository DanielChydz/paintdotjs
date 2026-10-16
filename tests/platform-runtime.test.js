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
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const {EventEmitter} = require("node:events");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

function loadPlatform(relative, globals, dependencies) {
    let filename = path.resolve(__dirname, "../js/platform", relative);
    let module = {exports: {}};
    let context = vm.createContext({
        module, exports: module.exports, __dirname: path.dirname(filename),
        console, URL, Response, Buffer, setImmediate, ...globals,
        require: name => {
            if (Object.hasOwn(dependencies, name)) {
                return dependencies[name];
            }
            if (name.startsWith("node:")) {
                return require(name);
            }
            throw new Error("Unconfigured platform dependency: " + name);
        }
    });
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    return {context, api: module.exports};
}

function bootFixture(options = {}) {
    let state = {now: 1000000, reloads: 0, unregisters: 0, updates: 0, dialogs: [], logs: [],
        messages: [], modal: false, unsaved: false, saveResult: true, saves: 0, ...options,
        choices: [...(options.choices || [])]};
    let worker = new EventEmitter();
    worker.state = "installing";
    worker.addEventListener = worker.on;
    worker.postMessage = message => state.messages.push(JSON.parse(JSON.stringify(message)));
    let registration = new EventEmitter();
    registration.addEventListener = registration.on;
    registration.waiting = options.waiting ? worker : null;
    registration.installing = options.installing ? worker : null;
    registration.update = async () => {
        ++state.updates;
        if (state.updateError) {
            throw state.updateError;
        }
    };
    let serviceWorker = new EventEmitter();
    serviceWorker.addEventListener = serviceWorker.on;
    serviceWorker.controller = options.controlled === false ? null : {};
    serviceWorker.register = async (...args) => {
        state.registrationArgs = args;
        if (state.registerError) {
            throw state.registerError;
        }
        return registration;
    };
    serviceWorker.getRegistrations = async () => [{
        unregister: async () => {
            ++state.unregisters;
            return true;
        }
    }];
    let storage = new Map(options.cleared ? [["paintdotjs-sw-cleared", "1"]] : []);
    let document = new EventEmitter();
    document.addEventListener = document.on;
    document.visibilityState = "visible";
    document.baseURI = "https://paint.example.test/index.html";
    document.body = {};
    document.createElement = tag => ({
        tag, children: [], append(...children) {
            this.children.push(...children);
        }
    });
    function MutationObserver(callback) {
        this.observe = (target, settings) => {
            assert.equal(target, document.body);
            assert.equal(settings.childList, true);
            assert.equal(settings.subtree, true);
            state.observer = callback;
        };
        this.disconnect = () => state.disconnected = true;
    }
    let globals = {
        isApp: false, navigator: {serviceWorker}, document, MutationObserver,
        location: {hostname: options.hostname || "paint.example.test", reload: () => ++state.reloads},
        sessionStorage: {getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
        Date: {now: () => state.now},
        setInterval: (callback, delay) => {
            assert.equal(delay, 3600000);
            state.interval = callback;
        },
        console: {log: error => state.logs.push(error)},
        fetch: async (url, settings) => {
            assert.equal(url.origin, "https://paint.example.test");
            assert.equal(url.pathname, "/assets/update.json");
            assert.equal(url.searchParams.get("v"), String(state.now));
            assert.equal(settings.cache, "no-store");
            if (state.fetchError) {
                throw state.fetchError;
            }
            return {ok: state.httpOk !== false, json: async () => {
                if (state.jsonError) {
                    throw state.jsonError;
                }
                return state.metadata === undefined ? {version: "2.2.0"} : state.metadata;
            }};
        },
        ModalDialogController: {isActive: () => state.modal},
        PdjInfo: {formatVersion: version => "formatted:" + version},
        TaskDialog: {show: async settings => {
            state.dialogs.push(settings);
            return state.choices.shift() || "later";
        }},
        window: options.noApp ? {} : {app: {hasUnsavedDocuments: () => state.unsaved}},
        DocumentIO: {saveAll: async () => {
            ++state.saves;
            return state.saveResult;
        }}
    };
    if (options.isApp !== undefined) {
        globals.isApp = options.isApp;
    }
    if (options.noServiceWorker) {
        globals.navigator = {};
    }
    if (options.undefinedPlatform) {
        delete globals.isApp;
    }
    loadPlatform("boot_loader.js", globals, {});
    let flush = async () => {
        for (let index = 0; index < 4; ++index) {
            await new Promise(resolve => setImmediate(resolve));
        }
    };
    return {state, worker, registration, serviceWorker, document, storage, flush};
}

test("browser boot disables stale local workers and avoids reload loops", async () => {
    for (let hostname of ["localhost", "127.0.0.1", "[::1]"]) {
        for (let [controlled, cleared] of [[true, false], [true, true], [false, false]]) {
            let fixture = bootFixture({hostname, controlled, cleared});
            await fixture.flush();
            assert.equal(fixture.state.unregisters, 1);
            assert.equal(fixture.state.reloads, controlled && !cleared ? 1 : 0);
            assert.equal(fixture.storage.has("paintdotjs-sw-cleared"), controlled && !cleared);
            assert.equal(fixture.state.registrationArgs, undefined);
        }
    }
    for (let options of [{isApp: true}, {undefinedPlatform: true}, {noServiceWorker: true}]) {
        let fixture = bootFixture(options);
        await fixture.flush();
        assert.equal(fixture.state.registrationArgs, undefined);
        assert.equal(fixture.state.unregisters, 0);
    }
});

test("browser boot throttles update checks and reports registration/update failures", async () => {
    let fixture = bootFixture();
    await fixture.flush();
    assert.equal(fixture.state.registrationArgs[0], "./service_worker.js");
    assert.equal(fixture.state.registrationArgs[1].updateViaCache, "none");
    assert.equal(fixture.state.updates, 1);
    fixture.serviceWorker.emit("controllerchange");
    assert.equal(fixture.state.reloads, 0);
    fixture.document.visibilityState = "hidden";
    fixture.document.emit("visibilitychange");
    fixture.document.visibilityState = "visible";
    fixture.document.emit("visibilitychange");
    fixture.state.interval();
    await fixture.flush();
    assert.equal(fixture.state.updates, 1);
    fixture.state.now += 300000;
    fixture.document.emit("visibilitychange");
    await fixture.flush();
    assert.equal(fixture.state.updates, 2);
    fixture.state.now += 3600000;
    fixture.state.updateError = new Error("offline update check");
    fixture.state.interval();
    await fixture.flush();
    assert.equal(fixture.state.updates, 3);
    assert.equal(fixture.state.logs[0], fixture.state.updateError);
    let error = new Error("registration denied");
    fixture = bootFixture({registerError: error});
    await fixture.flush();
    assert.equal(fixture.state.logs[0], error);
    assert.equal(fixture.state.interval, undefined);
});

test("browser boot prompts safely for installed workers, metadata and unsaved documents", async () => {
    for (let options of [
        {choices: ["later"]},
        {choices: ["now"], noApp: true},
        {choices: ["now", "discard"], unsaved: true},
        {choices: ["now", "cancel"], unsaved: true},
        {choices: ["now", "save"], unsaved: true, saveResult: false},
        {choices: ["now", "save"], unsaved: true, saveResult: true},
        {choices: ["now"], httpOk: false},
        {choices: ["now"], metadata: {version: 123}},
        {choices: ["now"], fetchError: new Error("metadata unavailable")},
        {choices: ["now"], jsonError: new Error("invalid metadata")}
    ]) {
        let fixture = bootFixture({...options, waiting: true});
        await fixture.flush();
        let installed = options.choices[0] === "now" && (!options.unsaved
            || options.choices[1] === "discard" || options.choices[1] === "save" && options.saveResult);
        assert.equal(fixture.state.messages.length, installed ? 1 : 0);
        if (installed) {
            assert.deepEqual(fixture.state.messages[0], {type: "SKIP_WAITING"});
        }
        assert.equal(fixture.state.saves, options.choices[1] === "save" ? 1 : 0);
        let preview = fixture.state.dialogs[0].preview;
        assert.equal(preview.children[1].textContent, options.httpOk === false || options.metadata
            || options.fetchError || options.jsonError ? "A newer version is ready" : "paint.js formatted:2.2.0");
        assert.equal(preview.children[2].rel, "noopener");
        fixture.serviceWorker.emit("controllerchange");
        fixture.serviceWorker.emit("controllerchange");
        assert.equal(fixture.state.reloads, installed ? 1 : 0);
    }
    let fixture = bootFixture({installing: true, controlled: false});
    await fixture.flush();
    fixture.worker.state = "installed";
    fixture.worker.emit("statechange");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 0);
    fixture.serviceWorker.controller = {};
    fixture.worker.state = "installing";
    fixture.worker.emit("statechange");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 0);
    fixture.worker.state = "installed";
    fixture.worker.emit("statechange");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 1);
    fixture.registration.installing = null;
    fixture.registration.emit("updatefound");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 1);
});

test("browser boot waits for free modal slots and deduplicates installation prompts", async () => {
    let fixture = bootFixture({installing: true, modal: true, choices: ["now"]});
    await fixture.flush();
    fixture.worker.state = "installed";
    fixture.worker.emit("statechange");
    fixture.worker.emit("statechange");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 0);
    assert.equal(typeof fixture.state.observer, "function");
    fixture.state.observer();
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 0);
    fixture.state.modal = false;
    fixture.state.observer();
    await fixture.flush();
    assert.equal(fixture.state.disconnected, true);
    assert.equal(fixture.state.dialogs.length, 1);
    assert.deepEqual(fixture.state.messages, [{type: "SKIP_WAITING"}]);
    fixture.registration.waiting = fixture.worker;
    fixture.registration.emit("updatefound");
    fixture.worker.emit("statechange");
    await fixture.flush();
    assert.equal(fixture.state.dialogs.length, 2);
});

function updaterFixture(packaged, managed) {
    let messages = [];
    let timers = [];
    let autoUpdater = new EventEmitter();
    let state = {response: {ok: true, json: async () => ({tag_name: "v2.2.0"})}, result: {updateInfo: {version: "2.2.0"}}};
    autoUpdater.checkForUpdates = async () => {
        if (state.failure) {
            throw state.failure;
        }
        return state.result;
    };
    autoUpdater.quitAndInstall = (...args) => state.install = args;
    let window = {isDestroyed: () => !!state.destroyed, webContents: {send: (...args) => messages.push(args)}};
    let {api} = loadPlatform("desktop/updater.js", {
        process: {env: {PAINTDOTJS_MANAGED_INSTALL: managed ? "1" : "0"}},
        setTimeout: (callback, delay) => {
            assert.equal(delay, 10000);
            timers.push(callback);
        }
    }, {
        electron: {
            app: {isPackaged: packaged, getVersion: () => "2.1.16"},
            net: {fetch: async (url, options) => {
                assert.equal(url, "https://api.github.com/repos/LabyStudio/paintdotjs/releases/latest");
                assert.equal(options.headers.Accept, "application/vnd.github+json");
                return state.response;
            }}
        },
        "electron-updater": {autoUpdater}
    });
    return {api, state, messages, timers, autoUpdater, window};
}

test("desktop updater gates installation and propagates every native update event", async () => {
    let development = updaterFixture(false, false);
    development.api.initializeUpdater(development.window);
    development.api.initializeUpdater(development.window);
    assert.equal(development.messages.length, 1);
    assert.equal(development.messages[0][1].state, "development");
    assert.equal(development.timers.length, 0);
    assert.equal(development.api.updatesSupported(), false);
    assert.equal((await development.api.checkForUpdates()).supported, false);
    development.api.installUpdate();
    assert.equal(development.state.install, undefined);

    let fixture = updaterFixture(true, false);
    fixture.api.initializeUpdater(fixture.window);
    assert.equal(fixture.autoUpdater.autoDownload, true);
    assert.equal(fixture.autoUpdater.autoInstallOnAppQuit, true);
    for (let [event, value, expected, detail] of [
        ["checking-for-update", undefined, "checking", null],
        ["update-available", {version: "2.2.0"}, "available", "2.2.0"],
        ["update-not-available", {version: "2.1.16"}, "current", "2.1.16"],
        ["download-progress", {percent: 42.6}, "downloading", 43],
        ["update-downloaded", {version: "2.2.0"}, "downloaded", "2.2.0"],
        ["error", new Error("offline"), "error", "offline"]
    ]) {
        fixture.autoUpdater.emit(event, value);
        assert.equal(fixture.messages.at(-1)[1].state, expected);
        assert.equal(fixture.messages.at(-1)[1].detail, detail);
    }
    assert.equal((await fixture.api.checkForUpdates()).version, "2.2.0");
    fixture.state.result = undefined;
    assert.equal((await fixture.api.checkForUpdates()).version, null);
    fixture.api.installUpdate();
    assert.deepEqual(fixture.state.install, [false, true]);
    fixture.state.failure = new Error("native update failed");
    await assert.rejects(fixture.api.checkForUpdates(), /native update failed/);
    fixture.timers[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.messages.at(-1)[1].detail, "native update failed");
    let count = fixture.messages.length;
    fixture.state.destroyed = true;
    fixture.autoUpdater.emit("checking-for-update");
    assert.equal(fixture.messages.length, count);
    fixture.api.initializeUpdater(null);
    fixture.autoUpdater.emit("checking-for-update");
    assert.equal(fixture.messages.length, count);
});

test("managed updater compares release versions, reports malformed responses and never self-installs", async () => {
    let fixture = updaterFixture(true, true);
    fixture.api.initializeUpdater(fixture.window);
    assert.equal(fixture.messages[0][1].state, "managed");
    assert.equal(fixture.api.updatesSupported(), false);
    fixture.api.installUpdate();
    assert.equal(fixture.state.install, undefined);
    for (let [version, available] of [
        ["v2.2.0", true], ["2.1.17", true], ["3.0.0", true],
        ["2.1.16.1", true], ["2.1.16", false], ["2.1.16-beta.1", false],
        ["2.1.15", false], ["1.99.99", false], ["2.0.99", false]
    ]) {
        fixture.state.response = {ok: true, json: async () => ({tag_name: version})};
        let result = await fixture.api.checkForUpdates();
        assert.equal(result.updateAvailable, available, version);
        assert.equal(result.managed, true);
        assert.equal(result.supported, false);
        assert.equal(fixture.messages.at(-1)[1].state, available ? "managed-available" : "managed-current");
        assert.equal(result.url, "https://github.com/LabyStudio/paintdotjs/releases/tag/v" + encodeURIComponent(version.replace(/^v/, "")));
    }
    for (let tag of [undefined, "", "not-a-version", "2", "<script>"]) {
        fixture.state.response = {ok: true, json: async () => ({tag_name: tag})};
        await assert.rejects(fixture.api.checkForUpdates(), /invalid release version/);
    }
    fixture.state.response = {ok: false, status: 503};
    await assert.rejects(fixture.api.checkForUpdates(), /HTTP 503/);
    fixture.timers[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.messages.at(-1)[1].state, "managed");
});

function mainFixture(directory, options = {}) {
    let app = new EventEmitter();
    let ipcMain = new EventEmitter();
    let nativeAutoUpdater = new EventEmitter();
    let state = {windows: [], sent: [], timers: new Map(), handlers: new Map(), assets: path.join(directory, "assets"),
        userData: directory, warnings: [], dialogs: [], responses: [0], displayAreas: [
            {workArea: {x: 0, y: 0, width: 1920, height: 1080}},
            {workArea: {x: 1920, y: 0, width: 1280, height: 720}}
        ]};
    app.isPackaged = !!options.packaged;
    app.getPath = () => state.userData;
    app.getAppPath = () => directory;
    app.requestSingleInstanceLock = () => options.locked !== false;
    app.quit = () => state.quits = (state.quits || 0) + 1;
    app.whenReady = () => ({then: callback => state.start = callback});
    ipcMain.handle = (name, callback) => state.handlers.set(name, callback);
    let BrowserWindow = function (settings) {
        let window = new EventEmitter();
        let contents = new EventEmitter();
        Object.assign(contents, {
            isLoading: () => !!state.loading,
            send: (...args) => state.sent.push(args),
            isDevToolsOpened: () => !!state.devTools,
            openDevTools: () => state.devTools = true,
            closeDevTools: () => state.devTools = false
        });
        Object.assign(window, {
            settings, webContents: contents,
            isDestroyed: () => !!window.destroyed,
            destroy: () => {
                window.destroyed = true;
                window.emit("closed");
            },
            getNormalBounds: () => window.bounds || {x: 20, y: 30, width: 1080, height: 720},
            getBounds: () => window.getNormalBounds(),
            setBounds: bounds => window.bounds = bounds,
            isMaximized: () => !!window.maximized,
            maximize: () => window.maximized = true,
            isMinimized: () => !!window.minimized,
            restore: () => window.minimized = false,
            show: () => window.shown = true,
            focus: () => window.focused = true,
            loadURL: async url => window.url = url
        });
        state.windows.push(window);
        return window;
    };
    BrowserWindow.getAllWindows = () => state.windows.filter(window => !window.destroyed);
    let {context} = loadPlatform("desktop/main.js", {
        process: {argv: ["electron", "entry.js"], platform: options.platform || "linux", resourcesPath: directory},
        console: {warn: (...args) => state.warnings.push(args)},
        setTimeout: callback => {
            let id = state.timers.size + 1;
            state.timers.set(id, callback);
            return id;
        },
        clearTimeout: id => state.timers.delete(id)
    }, {
        electron: {app, ipcMain, autoUpdater: nativeAutoUpdater, BrowserWindow,
            Menu: {setApplicationMenu: value => assert.equal(value, null)},
            screen: {getAllDisplays: () => state.displayAreas, getPrimaryDisplay: () => state.displayAreas[0]},
            protocol: {
                registerSchemesAsPrivileged: schemes => assert.equal(schemes[0].scheme, "paintjs"),
                handle: async (scheme, callback) => state.protocol = callback
            },
            dialog: {showMessageBox: async options => {
                state.dialogs.push(options);
                return {response: state.responses.shift()};
            }},
            net: {fetch: async url => ({url})}
        },
        "custom-electron-titlebar/main": {setupTitlebar() {}},
        "./asset-manager": {ensureDesktopAssets: async () => {
            if (state.assetFailures > 0) {
                --state.assetFailures;
                throw new Error("asset install failed");
            }
            return state.assets;
        }},
        "./updater": {initializeUpdater: window => state.updaterWindow = window,
            checkForUpdates: () => "check", installUpdate: () => state.install = true}
    });
    let api = vm.runInContext("({readWindowState, restoreWindowBounds, writeWindowState, commandLineFiles, resolveAppRequest, prepareApplication})", context);
    return {state, app, ipcMain, nativeAutoUpdater, api};
}

test("desktop main restores monitor bounds, persists window state and filters protocol/file inputs", async t => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-main-test-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let fixture = mainFixture(directory);
    let {state, api, app, ipcMain, nativeAutoUpdater} = fixture;
    assert.equal(api.readWindowState(), null);
    let statePath = path.join(directory, "window-state.json");
    for (let value of ["bad JSON", "null", JSON.stringify({bounds: {x: 0, y: 0, width: -1, height: 10}}),
        JSON.stringify({bounds: {x: "0", y: 0, width: 10, height: 10}})]) {
        fs.writeFileSync(statePath, value);
        assert.equal(api.readWindowState(), null);
    }
    fs.writeFileSync(statePath, JSON.stringify({bounds: {x: 2000.4, y: 900.3, width: 4000, height: 0}}));
    assert.equal(api.readWindowState(), null);
    fs.writeFileSync(statePath, JSON.stringify({bounds: {x: 2000.4, y: 30.6, width: 640, height: 480}, maximized: true}));
    assert.equal(api.readWindowState().bounds.y, 31);
    assert.equal(api.restoreWindowBounds(null), null);
    assert.equal(api.restoreWindowBounds({x: 2000, y: 100, width: 4000, height: 2000}).x, 1920);
    assert.equal(api.restoreWindowBounds({x: 2000, y: 900, width: 4000, height: 2000}).x, 0);
    assert.equal(api.restoreWindowBounds({x: -10000, y: -10000, width: 1, height: 1}).width, 640);
    fs.mkdirSync(state.assets);
    fs.writeFileSync(path.join(state.assets, "en.json"), "{}");
    fs.writeFileSync(path.join(directory, "index.html"), "test");
    let image = path.join(directory, "example.PNG");
    fs.writeFileSync(image, "image");
    assert.equal(api.commandLineFiles([image, "--switch", 123, path.join(directory, "missing.png"), directory]).length, 1);
    app.emit("open-file", {preventDefault() {}}, image);
    await state.start();
    let window = state.windows[0];
    assert.match(window.url, /skipWelcome=1/);
    window.emit("ready-to-show");
    assert.equal(window.shown, true);
    assert.equal(window.maximized, true);
    assert.equal(window.settings.x, 2000);
    assert.equal((await state.protocol({url: "paintjs://app/"})).url, pathToFileURL(path.join(directory, "index.html")).href);
    assert.equal((await state.protocol({url: "paintjs://app/assets/en.json"})).url, pathToFileURL(path.join(state.assets, "en.json")).href);
    assert.equal((await state.protocol({url: "paintjs://app/missing.js"})).status, 404);
    assert.equal(api.resolveAppRequest("paintjs://app/%2e%2e%2fsecret"), null);
    assert.equal(api.resolveAppRequest("paintjs://app/assets"), null);
    window.webContents.emit("did-finish-load");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.sent.at(-1)[0], "desktop:open-files");
    state.loading = true;
    app.emit("open-file", {preventDefault() {}}, image);
    app.emit("open-file", {preventDefault() {}}, image);
    state.loading = false;
    window.minimized = true;
    app.emit("second-instance", {}, [image]);
    assert.equal(window.minimized, false);
    assert.equal(window.focused, true);
    assert.equal(state.sent.at(-1)[1].length, 1);
    app.emit("second-instance", {}, []);
    for (let type of ["move", "resize", "maximize", "unmaximize"]) {
        window.emit(type);
    }
    assert.equal(state.timers.size, 1);
    state.timers.values().next().value();
    assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).maximized, true);
    ipcMain.emit("resize-window", {}, {width: 10, height: 20});
    assert.equal(window.bounds.width, 100);
    assert.equal(window.bounds.height, 100);
    for (let input of [{type: "keyUp", key: "F12"}, {type: "keyDown", key: "a"},
        {type: "keyDown", key: "F12"}, {type: "keyDown", key: "F12"}]) {
        window.webContents.emit("before-input-event", {}, input);
    }
    assert.equal(state.devTools, false);
    assert.equal(state.handlers.get("desktop:check-for-updates")(), "check");
    ipcMain.emit("desktop:install-update");
    assert.equal(state.install, true);
    let prevented = 0;
    let close = {preventDefault: () => ++prevented};
    window.emit("close", close);
    assert.equal(prevented, 0);
    ipcMain.emit("desktop:close-dialog-ready", {sender: {}});
    window.emit("close", close);
    assert.equal(prevented, 0);
    ipcMain.emit("desktop:close-dialog-ready", {sender: window.webContents});
    window.emit("close", close);
    window.emit("close", close);
    assert.equal(state.sent.filter(([channel]) => channel === "desktop:request-close").length, 1);
    ipcMain.emit("desktop:close-response", {sender: {}}, true);
    assert.equal(window.destroyed, undefined);
    ipcMain.emit("desktop:close-response", {sender: window.webContents}, false);
    nativeAutoUpdater.emit("before-quit-for-update");
    let before = prevented;
    window.emit("close", close);
    assert.equal(prevented, before);
    ipcMain.emit("desktop:close-response", {sender: window.webContents}, true);
    assert.equal(window.destroyed, true);
    ipcMain.emit("desktop:close-response", {sender: window.webContents}, true);
    ipcMain.emit("resize-window", {}, {width: 800, height: 600});
    api.writeWindowState(null);
    api.writeWindowState(window);
    app.emit("second-instance", {}, []);
    app.emit("activate");
    assert.equal(state.windows.length, 2);
    let blocker = path.join(directory, "blocker");
    fs.writeFileSync(blocker, "");
    state.userData = blocker;
    api.writeWindowState(state.windows[1]);
    assert.equal(state.warnings.length, 1);
    app.emit("window-all-closed");
    assert.equal(state.quits, 1);
});

test("desktop main setup retries or quits explicitly and respects single-instance/macOS lifecycle", async t => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-main-setup-test-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let retry = mainFixture(directory, {packaged: true});
    retry.state.assetFailures = 1;
    await retry.state.start();
    assert.equal(retry.state.dialogs.length, 1);
    assert.equal(retry.state.dialogs[0].detail, "asset install failed");
    assert.equal(retry.state.windows.length, 1);
    let quit = mainFixture(directory);
    quit.state.assetFailures = 1;
    quit.state.responses = [1];
    await quit.state.start();
    assert.equal(quit.state.quits, 1);
    assert.equal(quit.state.windows.length, 0);
    quit.app.emit("activate");
    quit.app.emit("window-all-closed");
    assert.equal(quit.state.quits, 1);
    let locked = mainFixture(directory, {locked: false});
    assert.equal(locked.state.quits, 1);
    assert.equal(locked.state.start, undefined);
    let mac = mainFixture(directory, {platform: "darwin"});
    await mac.state.start();
    mac.app.emit("window-all-closed");
    assert.equal(mac.state.quits, undefined);
});

test("desktop preload publishes package version and explicit/AppImage distribution hints", () => {
    for (let [env, expected] of [
        [{}, null], [{APPIMAGE: "/tmp/application.AppImage"}, "AppImage"],
        [{APPIMAGE: "/tmp/application.AppImage", PAINTDOTJS_DISTRIBUTION: "Debian"}, "Debian"]
    ]) {
        let window = {};
        loadPlatform("desktop/preload.js", {window, process: {env}}, {
            "../../../package.json": {version: "2.1.16"}
        });
        assert.equal(window.PDJVERSION, "2.1.16");
        assert.equal(window.PDJDISTRIBUTION, expected);
    }
});

test("browser IndexedDB adapter upgrades the store, reuses connections and rejects blocked/error opens", async () => {
            let requests = [];
            let opened = [];
            let stored = [];
            let created = [];
            let database = {
                closed: false,
                objectStoreNames: {contains: () => false},
                createObjectStore: (name, options) => created.push([name, options.keyPath]),
                transaction: (names, mode) => {
                    assert.equal(names[0], "fileSystem");
                    assert.equal(mode, "readonly");
                    return {objectStore: name => {
                        stored.push(name);
                        return {name};
                    }};
                }
            };
            let {context} = loadPlatform("web/web.js", {
                indexedDB: {open: (name, version) => {
                    opened.push([name, version]);
                    let request = {};
                    requests.push(request);
                    return request;
                }}
            }, {});
            let getObjectStore = vm.runInContext("getObjectStore", context);
            let createIndexedDBInstance = vm.runInContext("createIndexedDBInstance", context);
            let opening = getObjectStore("readonly");
            let request = requests.at(-1);
            request.onupgradeneeded({target: {result: database}});
            request.onsuccess({target: {result: database}});
            assert.equal((await opening).name, "fileSystem");
            assert.deepEqual(created, [["fileSystem", "fileName"]]);
            assert.deepEqual(opened, [["paint.js", 1]]);
            assert.equal((await getObjectStore("readonly")).name, "fileSystem");
            assert.equal(requests.length, 1);
            database.closed = true;
            let reopening = getObjectStore("readonly");
            database.objectStoreNames.contains = () => true;
            requests.at(-1).onupgradeneeded({target: {result: database}});
            requests.at(-1).onsuccess({target: {result: database}});
            await reopening;
            assert.equal(created.length, 1);
            assert.equal(stored.length, 3);
            let blocked = createIndexedDBInstance();
            requests.at(-1).onblocked({});
            await assert.rejects(blocked, /IndexedDB blocked/);
            let failed = createIndexedDBInstance();
            let error = new Error("database permission denied");
            requests.at(-1).onerror({target: {error}});
            await assert.rejects(failed, error);
});

test("desktop assets are bundled and verified without using old caches or the network", async t => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintjs-bundled-assets-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let root = path.resolve(__dirname, "..");
    let app = {isPackaged: false, getAppPath: () => root};
    let {api} = loadPlatform("desktop/asset-manager.js", {
        process: {resourcesPath: directory, env: {PAINTDOTJS_ASSETS_DIR: "/old/proprietary/assets"}}
    }, {electron: {app}, "../../../scripts/resource/AssetCatalog": require("../scripts/resource/AssetCatalog"),
        "../../../desktop-resources/asset-manifest.json": require("../desktop-resources/asset-manifest.json")});
    assert.equal(await api.ensureDesktopAssets(), path.join(root, "assets"));
    app.isPackaged = true;
    assert.equal(api.findInstalledAssets(), null);
    await assert.rejects(api.ensureDesktopAssets(), /Bundled open assets are missing or corrupt/);
    fs.cpSync(path.join(root, "assets"), path.join(directory, "assets"), {recursive: true});
    assert.equal(await api.ensureDesktopAssets(), path.join(directory, "assets"));
    fs.mkdirSync(path.join(directory, "desktop"));
    fs.copyFileSync(path.join(root, "desktop-resources/asset-manifest.json"), path.join(directory, "desktop/asset-manifest.json"));
    let packagedApp = {isPackaged: true, getAppPath: () => path.join(directory, "app.asar")};
    let packaged = loadPlatform("desktop/asset-manager.js", {process: {resourcesPath: directory}}, {
        electron: {app: packagedApp}, "../../../scripts/resource/AssetCatalog": require("../scripts/resource/AssetCatalog")
    }).api;
    assert.equal(await packaged.ensureDesktopAssets(), path.join(directory, "assets"),
        "Packaged metadata lives beside app.asar, not inside its source tree");
    fs.writeFileSync(path.join(directory, "assets/icon.png"), "bad");
    assert.equal(api.findInstalledAssets(), null);
});

function rendererBridgeFixture() {
    let ipcRenderer = new EventEmitter();
    let state = {sent: [], timers: [], errors: [], opened: [], saved: true, choice: "later", dirty: false,
        prompts: [], external: [], storage: new Map(), listeners: new Map(), color: "#121212"};
    ipcRenderer.send = (...args) => state.sent.push(args);
    ipcRenderer.invoke = async channel => {
        assert.equal(channel, "desktop:check-for-updates");
        state.check = true;
        if (state.checkError) {
            throw new Error("IPC failed");
        }
        return {supported: false};
    };
    let application = {
        getDocumentWorkspaces: () => [{isDirty: () => state.dirty}],
        hasUnsavedDocuments: () => state.dirty
    };
    let documentIO = {
        showUnsavedChangesDialog: async () => {
            if (state.closeError) {
                throw new Error("close failed");
            }
            return state.choice;
        },
        saveAll: async () => state.saved,
        openFiles: async files => state.opened.push(files)
    };
    let resizeHandle = {addEventListener: (name, callback) => state.resizeStart = callback};
    let window = {
        app: application, innerWidth: 1000, innerHeight: 700,
        addEventListener: (name, callback) => state.listeners.set(name, callback),
        removeEventListener: (name, callback) => {
            assert.equal(state.listeners.get(name), callback);
            state.listeners.delete(name);
        }
    };
    let {context} = loadPlatform("desktop/desktop.js", {
        window, app: application, DocumentIO: documentIO, Blob,
        console: {error: (...args) => state.errors.push(args)},
        setTimeout: callback => state.timers.push(callback),
        PdjInfo: {formatVersion: version => version},
        TaskDialog: {show: async options => {
            state.prompts.push(options);
            return state.pendingPrompt || state.choice;
        }},
        navigator: {clipboard: {writeText: async value => {
            if (state.clipboardError) {
                throw new Error("clipboard denied");
            }
            state.clipboard = value;
        }}},
        localStorage: {getItem: key => state.storage.get(key) ?? null, setItem: (key, value) => state.storage.set(key, value)},
        getComputedStyle: () => ({getPropertyValue: () => state.color}),
        windowTop: () => 42,
        MutationObserver: function (callback) {
            state.themeChanged = callback;
            return {observe() {}};
        },
        document: {
            documentElement: {style: {setProperty: (name, value) => state.top = [name, value]}},
            getElementById: name => {
                assert.equal(name, "windowResize");
                return resizeHandle;
            }
        }
    }, {
        electron: {ipcRenderer,
            shell: {showItemInFolder: value => state.folder = value, openExternal: async url => state.external.push(url)},
            webUtils: {getPathForFile: file => file.path}
        },
        "custom-electron-titlebar": {
            CustomTitlebar: function () {
                return {updateTitle: title => state.title = title, updateBackground: color => state.background = color};
            },
            TitlebarColor: {fromHex: value => value}
        }
    });
    let api = vm.runInContext("({openLocalFiles, showDownloadedUpdate, showManagedUpdate, waitForApplication})", context);
    return {state, window, ipcRenderer, context, api, documentIO};
}

test("desktop renderer bridge reads local files, exposes file/clipboard actions and mirrors title/resize state", async t => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-renderer-bridge-test-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let {state, window, api, ipcRenderer} = rendererBridgeFixture();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.sent[0][0], "desktop:close-dialog-ready");
    let input = path.join(directory, "example.png");
    fs.writeFileSync(input, Buffer.from([1, 2, 3]));
    await api.openLocalFiles([input, path.join(directory, "missing.png")]);
    assert.equal(state.errors.length, 1);
    assert.equal(state.opened.length, 1);
    let file = state.opened[0][0];
    assert.equal(file.name, "example.png");
    assert.equal(file.lastModified, fs.statSync(input).mtimeMs);
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
    assert.equal(window.desktopFileActions.getPathForFile(file), input);
    assert.equal(window.desktopFileActions.getPathForFile({path: "/tmp/native"}), "/tmp/native");
    await api.openLocalFiles([]);
    assert.equal(state.opened.length, 1);
    ipcRenderer.emit("desktop:open-files", {}, [input]);
    await new Promise(resolve => setImmediate(resolve));
    let deadline = Date.now() + 5000;
    while (state.opened.length < 2) {
        assert(Date.now() < deadline, "Local-file IPC did not deliver its files");
        await new Promise(resolve => setImmediate(resolve));
    }
    let output = path.join(directory, "written.bin");
    await window.desktopFileActions.writeFile(output, new Uint8Array([4, 5, 6]));
    assert.deepEqual([...fs.readFileSync(output)], [4, 5, 6]);
    await assert.rejects(window.desktopFileActions.writeFile(path.join(directory, "absent/file"), new Uint8Array()), /ENOENT/);
    await window.desktopFileActions.copyText("diagnostics");
    assert.equal(state.clipboard, "diagnostics");
    state.clipboardError = true;
    await assert.rejects(window.desktopFileActions.copyText("diagnostics"), /clipboard denied/);
    window.desktopFileActions.showItemInFolder(input);
    assert.equal(state.folder, input);
    window.updatePlatformTitle("image");
    assert.equal(state.title, "image");
    assert.equal(state.background, "#121212");
    state.color = "";
    state.themeChanged();
    assert.equal(state.background, "#121212");
    assert.deepEqual(state.top, ["--window-top", "42px"]);
    let prevented = false;
    state.resizeStart({screenX: 100, screenY: 200, preventDefault: () => prevented = true});
    state.listeners.get("mousemove")({screenX: 120, screenY: 170});
    assert.equal(prevented, true);
    assert.equal(state.sent.at(-1)[0], "resize-window");
    assert.equal(state.sent.at(-1)[1].width, 1020);
    assert.equal(state.sent.at(-1)[1].height, 670);
    state.listeners.get("mouseup")();
    assert.equal(state.listeners.has("mousemove"), false);
});

test("desktop renderer close and downloaded-update choices preserve unsaved work and serialize dialogs", async () => {
    let {state, ipcRenderer, api, documentIO} = rendererBridgeFixture();
    let close = ipcRenderer.listeners("desktop:request-close")[0];
    await close();
    assert.equal(state.sent.at(-1)[1], true);
    state.dirty = true;
    for (let [choice, saved, expected] of [
        ["discard", false, true], ["save", true, true], ["save", false, false], ["cancel", true, false]
    ]) {
        state.choice = choice;
        state.saved = saved;
        await close();
        assert.equal(state.sent.at(-1)[1], expected);
    }
    state.closeError = true;
    await close();
    assert.equal(state.sent.at(-1)[1], false);
    assert.equal(state.errors.length, 1);
    state.closeError = false;
    let finish;
    documentIO.showUnsavedChangesDialog = () => new Promise(resolve => finish = resolve);
    let pending = close();
    await new Promise(resolve => setImmediate(resolve));
    let count = state.sent.length;
    await close();
    assert.equal(state.sent.length, count);
    finish("cancel");
    await pending;
    for (let [choice, dirty, saved, expected] of [
        ["later", false, true, false], ["restart", false, false, true],
        ["restart", true, false, false], ["restart", true, true, true]
    ]) {
        state.choice = choice;
        state.dirty = dirty;
        state.saved = saved;
        let before = state.sent.filter(([channel]) => channel === "desktop:install-update").length;
        await api.showDownloadedUpdate("2.2.0");
        assert.equal(state.sent.filter(([channel]) => channel === "desktop:install-update").length - before, expected ? 1 : 0);
    }
    state.pendingPrompt = new Promise(resolve => finish = resolve);
    let first = api.showDownloadedUpdate("2.2.0");
    await new Promise(resolve => setImmediate(resolve));
    let prompts = state.prompts.length;
    await api.showDownloadedUpdate("2.2.0");
    assert.equal(state.prompts.length, prompts);
    finish("later");
    await first;
});

test("desktop renderer managed-update dismissal, manual checks and deferred application readiness", async () => {
    let {state, window, api, ipcRenderer, context} = rendererBridgeFixture();
    let update = {version: "2.2.0", url: "https://github.com/LabyStudio/paintdotjs/releases/tag/v2.2.0"};
    state.choice = "download";
    await api.showManagedUpdate(update);
    assert.deepEqual(state.external, [update.url]);
    state.choice = "dismiss";
    await api.showManagedUpdate(update);
    let count = state.prompts.length;
    await api.showManagedUpdate(update);
    assert.equal(state.prompts.length, count);
    state.choice = "later";
    await api.showManagedUpdate(update, true);
    assert.equal(state.prompts.length, count + 1);
    let changed = [];
    window.desktopUpdater.onStateChanged = value => changed.push(value.state);
    ipcRenderer.emit("desktop:update-state", {}, {state: "current", detail: "2.1.16"});
    assert.equal(window.desktopUpdater.state, "current");
    assert.equal(window.desktopUpdater.detail, "2.1.16");
    assert.deepEqual(changed, ["current"]);
    ipcRenderer.emit("desktop:update-state", {}, {state: "managed-available", detail: update});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.prompts.length, count + 1);
    ipcRenderer.emit("desktop:update-state", {}, {state: "downloaded", detail: "2.2.0"});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.prompts.length, count + 2);
    assert.equal((await window.desktopUpdater.check()).supported, false);
    assert.equal(state.check, true);
    state.checkError = true;
    await assert.rejects(window.desktopUpdater.check(), /IPC failed/);
    window.app = null;
    context.DocumentIO = undefined;
    let ready = api.waitForApplication();
    assert.equal(state.timers.length, 1);
    window.app = context.app;
    context.DocumentIO = {};
    state.timers[0]();
    await ready;
});
