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

function fixture(relative) {
    let pending = [];
    let state = {pending, events: [], values: [], stored: new Map()};
    let request;
    let database = {
        objectStoreNames: {contains: () => state.exists === true},
        createObjectStore(name, options) {
            state.created = {name, options};
        },
        transaction(name, mode) {
            state.transaction = {name, mode};
            request = {};
            let transaction = {objectStore: () => ({
                getAll: () => { request.result = state.values; return request; },
                put: record => { request.result = record.id; return request; },
                delete: () => request,
                clear: () => request
            })};
            pending.push({transaction, request});
            return transaction;
        }
    };
    let context = vm.createContext({console: {warn() {}, error() {}},
        window: {dispatchEvent: event => state.events.push(event)},
        CustomEvent: function (type, options) { return {type, ...options}; },
        localStorage: {getItem: () => null}, document: {documentElement: null},
        URL, Blob, navigator: {language: "en"},
        indexedDB: {open: () => { request = {result: database}; state.open = request; return request; }}});
    let filename = path.resolve("js/src", relative + ".js");
    let name = path.basename(relative);
    vm.runInContext(fs.readFileSync(filename, "utf8") + `\nthis.manager = ${name};`, context,
        {filename: pathToFileURL(filename).href});
    context.manager.database = database;
    return {context, manager: context.manager, state, database};
}

for (let relative of ["engine/plugin/PluginManager", "engine/util/AssetPackManager", "engine/document/tool/shape/ShapeManager"]) {
    test(path.basename(relative) + " waits for transaction commit and rejects errors after request success", async () => {
        let {manager, state} = fixture(relative);
        let write = manager.writeRecord ? record => manager.writeRecord(record) : record => manager.writePack(record);
        let settled = false;
        let promise = write({id: "test"});
        promise.then(() => { settled = true; }, () => { settled = true; });
        let {transaction, request} = state.pending.shift();
        request.onsuccess?.();
        await Promise.resolve();
        assert.equal(settled, false, "A successful request is not a committed transaction");
        transaction.error = new Error("commit failed");
        transaction.onabort();
        await assert.rejects(promise, /commit failed/);
        for (let error of [new Error("request failed"), null]) {
            let promise = write({id: "test"});
            let {transaction, request} = state.pending.shift();
            request.error = error;
            request.onerror();
            await assert.rejects(promise, /request failed|operation failed/);
            transaction.onabort();
        }
        let aborted = write({id: "test"});
        state.pending.shift().transaction.onabort();
        await assert.rejects(aborted, /transaction failed/);
        for (let operation of [() => write({id: "test"}),
            () => manager.deleteRecord ? manager.deleteRecord("test") : manager.deletePack("test"),
            ...(manager.clearRecords ? [() => manager.clearRecords()] : [])]) {
            let promise = operation();
            let {transaction, request} = state.pending.shift();
            request.onsuccess?.();
            transaction.oncomplete();
            assert.equal(await promise, request.result);
        }
        for (let values of [undefined, [{id: "saved"}]]) {
            state.values = values;
            let promise = manager.readAllRecords ? manager.readAllRecords() : manager.readAllPacks();
            let {transaction, request} = state.pending.shift();
            request.onsuccess?.();
            transaction.oncomplete();
            assert.deepEqual(Array.from(await promise), values || []);
        }
    });

    test(path.basename(relative) + " initializes storage and reports blocked/open failures", async () => {
        let {manager, state, database} = fixture(relative);
        for (let exists of [false, true]) {
            state.exists = exists;
            let promise = manager.openDatabase();
            state.open.onupgradeneeded();
            state.open.onsuccess();
            assert.equal(await promise, database);
        }
        assert.equal(state.created.name, manager.storeName);
        assert.equal(state.created.options.keyPath, "id");
        for (let error of [new Error("open failed"), null]) {
            let promise = manager.openDatabase();
            state.open.error = error;
            state.open.onerror();
            await assert.rejects(promise, /open failed|Could not open/);
        }
        let promise = manager.openDatabase();
        state.open.onblocked();
        await assert.rejects(promise, /blocked/);
    });
}

test("plugin startup retains disabled records, isolates corrupt plugins and reports storage failures", async () => {
    let {manager, context, database} = fixture("engine/plugin/PluginManager");
    context.PluginPixels = {};
    context.PluginFileTypes = {definitions: new Map(), assertAvailable() {}};
    context.BitmapEffectAction = {forgetDefinition() {}};
    manager.openDatabase = async () => database;
    manager.readAllRecords = async () => [
        {id: "disabled", name: "Z disabled", enabled: false},
        {id: "broken", name: "Broken", enabled: true, source: "throw"},
        {id: "changed", name: "Changed", enabled: true, source: "changed"},
        {id: "valid", name: "Valid", enabled: true, source: "valid", manifest: {id: "valid"}}
    ];
    manager.evaluateSource = async source => {
        if (source === "throw") {
            throw new Error("corrupt plugin");
        }
        return {id: source, name: source, effects: [], fileTypes: []};
    };
    let initialization = manager.initialize();
    assert.equal(manager.initialize(), initialization);
    await initialization;
    assert.equal(manager.getPlugins().length, 4);
    assert.equal(manager.getLoadErrors().length, 1);
    manager.runtimePlugins.set("other", {id: "other", name: "AAA", effects: [
        {definition: {displayName: "Z"}}, {definition: {displayName: "A"}}]});
    assert.equal(manager.getRuntimePlugins()[0].id, "other");
    assert.equal(manager.getRuntimePlugins()[0].effects[0].displayName, "A");
    assert.throws(() => manager.activatePlugin({id: "valid", effects: [], fileTypes: []}), /already active/);
    manager.deactivatePlugin("missing");
    manager.loadErrors = [];
    manager.records = [{id: "expected", name: "Expected", enabled: true, source: "different"}];
    manager.readAllRecords = async () => manager.records;
    await manager.loadPlugins();
    assert.ok(manager.getLoadErrors()[0].message.includes("id changed"));
    let errors = manager.getLoadErrors();
    errors[0].message = "modified";
    assert.notEqual(manager.getLoadErrors()[0].message, "modified");
    manager.openDatabase = async () => { throw new Error("storage failed"); };
    await manager.loadPlugins();
    assert.equal(manager.getLoadErrors().at(-1).id, "storage");
});

test("shape startup isolates corrupt saved geometry and reports unavailable storage", async () => {
    let {manager, context, database} = fixture("engine/document/tool/shape/ShapeManager");
    for (let value of [null, undefined, {}, {name: "not-shape.txt"}]) {
        assert.equal(manager.isShapeFile(value), false);
    }
    let active = new Map();
    context.ShapeCatalog = {has: id => active.has(id), register: shape => active.set(shape.id, shape)};
    context.PaintDotNetShapeParser = {parse: source => {
        if (source === "bad") {
            throw new Error("invalid geometry");
        }
        return {name: "Valid", path: "M0 0 L1 1", fillPath: "", fillRule: "nonzero", viewBox: [0, 0, 1, 1]};
    }};
    manager.openDatabase = async () => database;
    manager.readAllRecords = async () => [{id: "valid", fileName: "z.xaml", source: "valid"},
        {id: "bad", fileName: "a.xaml", source: "bad"}];
    let initialization = manager.initialize();
    assert.equal(manager.initialize(), initialization);
    await initialization;
    assert.equal(manager.getLoadErrors().length, 1);
    assert.equal(manager.getShapes()[1].loaded, true);
    assert.equal(manager.getShapes()[0].loaded, false);
    manager.openDatabase = async () => { throw new Error("storage failed"); };
    await manager.loadShapes();
    assert.equal(manager.getLoadErrors().at(-1).fileName, "Shape storage");
});

test("icon pack startup restores the selected pack and falls back when storage fails", async () => {
    let {manager, context, database} = fixture("engine/util/AssetPackManager");
    context.localStorage.getItem = () => "selected";
    manager.openDatabase = async () => database;
    manager.readAllPacks = async () => [{id: "selected", files: [], translations: {}}];
    let initialization = manager.initialize();
    assert.equal(manager.initialize(), initialization);
    await initialization;
    assert.equal(manager.getActivePackId(), "selected");
    manager.openDatabase = async () => { throw new Error("storage failed"); };
    await manager.loadPacks();
    assert.equal(manager.getActivePackId(), "default");
});

test("failed plugin enable, disable and removal preserve the running plugin and saved metadata", async () => {
    let {manager, context} = fixture("engine/plugin/PluginManager");
    context.PluginFileTypes = {definitions: new Map(), assertAvailable() {}};
    context.BitmapEffectAction = {forgetDefinition() {}};
    manager.initialization = Promise.resolve();
    manager.installPublicApi = () => {};
    let record = {id: "fixture", enabled: true};
    let plugin = {id: record.id, effects: [], fileTypes: []};
    manager.records = [record];
    manager.runtimePlugins.set(record.id, plugin);
    manager.writeRecord = manager.deleteRecord = async () => { throw new Error("disk full"); };
    await assert.rejects(manager.setEnabled(record.id, false), /disk full/);
    assert.equal(record.enabled, true);
    assert.equal(manager.runtimePlugins.get(record.id), plugin);
    await assert.rejects(manager.remove(record.id), /disk full/);
    assert.equal(manager.records[0], record);
    assert.equal(manager.runtimePlugins.get(record.id), plugin);
    record.enabled = false;
    manager.runtimePlugins.clear();
    manager.evaluateSource = async () => plugin;
    await assert.rejects(manager.setEnabled(record.id, true), /disk full/);
    assert.equal(record.enabled, false);
    assert.equal(manager.runtimePlugins.size, 0);
});
