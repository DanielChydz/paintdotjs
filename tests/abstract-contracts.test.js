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

function contractFixture() {
    let state = {events: [], action: null, query: null};
    let document = new EventEmitter();
    document.addEventListener = (type, listener, options) => {
        if (options?.once) {
            document.once(type, listener);
        } else {
            document.on(type, listener);
        }
    };
    document.removeEventListener = document.removeListener;
    let app = {fire: (...args) => state.events.push(args)};
    let context = vm.createContext({
        app, document,
        ActionRegistry: {get: id => {
            state.query = id;
            return state.action;
        }}
    });
    for (let relative of [
        "engine/document/history/HistoryFunction.js", "engine/document/history/HistoryMemento.js",
        "engine/document/render/SurfaceBoxRenderer.js", "interface/UIElement.js",
        "interface/item/Item.js", "interface/window/window/AbstractWindow.js"
    ]) {
        let filename = path.resolve(__dirname, "../js/src", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let api = vm.runInContext("({HistoryFunction, HistoryMemento, SurfaceBoxRenderer, UIElement, Item, AbstractWindow})", context);
    return {state, app, document, ...api};
}

test("abstract windows announce open state and reject unimplemented native geometry operations", () => {
    let {state, app, AbstractWindow} = contractFixture();
    let window = new AbstractWindow();
    assert.equal(window.app, app);
    assert.equal(window.isOpen(), false);
    window.create();
    assert.equal(window.isOpen(), true);
    window.close();
    assert.equal(window.isOpen(), false);
    assert.deepEqual(state.events, [
        ["app:window_open_state_changed", window, true],
        ["app:window_open_state_changed", window, false]
    ]);
    for (let operation of [
        () => window.setTitle("Title"), () => window.setSize(100, 200),
        () => window.setPosition(1, 2), () => window.getWidth(), () => window.getHeight()
    ]) {
        assert.throws(operation, /Not implemented/);
    }
});

test("history base contracts propagate failures, execute once and preserve memento identity through undo", () => {
    let {HistoryFunction, HistoryMemento} = contractFixture();
    let operation = new HistoryFunction();
    assert.equal(operation.executed, false);
    assert.throws(() => operation.execute({}), /Not implemented/);
    assert.equal(operation.executed, false);
    let workspace = {};
    let result = new HistoryMemento("Initial", "initial.png");
    let calls = 0;
    operation.onExecute = received => {
        assert.equal(received, workspace);
        ++calls;
        return result;
    };
    assert.equal(operation.execute(workspace), result);
    assert.equal(operation.executed, true);
    assert.throws(() => operation.execute(workspace), /Already executed/);
    assert.equal(calls, 1);
    assert.equal(result.getName(), "Initial");
    assert.equal(result.getImage(), "initial.png");
    assert.equal(result.data, null);
    assert.throws(() => result.performUndo(), /Not implemented/);
    let reverse = new HistoryMemento("Reverse", "reverse.png");
    assert.notEqual(reverse.getId(), result.getId());
    result.setName("Renamed");
    result.setImage("renamed.png");
    result.setId(42);
    result.onUndo = () => reverse;
    assert.equal(result.performUndo(), reverse);
    assert.equal(reverse.getId(), 42);
    assert.equal(result.getName(), "Renamed");
    assert.equal(result.getImage(), "renamed.png");
});

test("base renderers enforce visibility/disposal while leaving abstract rendering side-effect free", () => {
    let {SurfaceBoxRenderer} = contractFixture();
    let surfaceBox = {};
    let renderer = new SurfaceBoxRenderer(surfaceBox);
    assert.equal(renderer.surfaceBox, surfaceBox);
    assert.equal(renderer.isVisible(), true);
    renderer.setVisible(false);
    assert.equal(renderer.isVisible(), false);
    renderer.setVisible(true);
    let destination = {pixels: [1, 2, 3]};
    assert.equal(renderer.render(destination, {}), undefined);
    assert.deepEqual(destination.pixels, [1, 2, 3]);
    renderer.dispose();
    assert.equal(renderer.isVisible(), false);
    assert.equal(renderer.disposed, true);
    assert.throws(() => renderer.setVisible(true), /disposed/);
});

test("UI base contracts preserve IDs/parents and release document mouse listeners after each drag", () => {
    let {state, app, document, UIElement, Item} = contractFixture();
    let base = new UIElement("base");
    assert.equal(base.app, app);
    let parent = {};
    base.initialize(parent);
    assert.equal(base.parent, parent);
    assert.equal(base.getId(), "base");
    assert.throws(() => base.getElement(), /Not implemented for UIElement/);
    assert.equal(base.getAsAction(), null);
    assert.equal(state.query, "base");
    let item = new Item("item");
    assert.equal(item.isInitialized(), false);
    assert.equal(item.isImplemented(), false);
    assert.equal(item.isEnabled(), false);
    assert.equal(item.shouldPress({}), true);
    assert.throws(() => item.buildElement(), /not implemented for Item/);
    item.updateParent(parent);
    assert.equal(item.parent, parent);
    item.setId("renamed");
    assert.equal(item.getId(), "renamed");
    item.setClassName("selected", true);
    item.setClassName("selected", true);
    assert.deepEqual(Array.from(item.classNames), ["selected"]);
    item.setClassName("selected", false);
    assert.equal(item.classNames.length, 0);
    let presses = 0;
    item.setPressable(() => ++presses);
    item.onPress({});
    assert.equal(presses, 1);
    assert.equal(item.isImplemented(), true);
    state.action = {runIsActionExecutable: () => true};
    item.setEnabledFromActionExecutable();
    assert.equal(item.isEnabled(), true);
    assert.equal(state.query, "renamed");
    let element = {};
    let received = [];
    item.registerMouseEvents(element,
        (...args) => received.push(["down", ...args]),
        (...args) => received.push(["move", ...args]),
        (...args) => received.push(["up", ...args]));
    element.onmousedown({clientX: 2, clientY: 3, button: 0});
    document.emit("mousemove", {clientX: 4, clientY: 5, button: 0});
    document.emit("mouseup", {clientX: 6, clientY: 7, button: 0});
    assert.deepEqual(received, [["down", 2, 3, 0], ["move", 4, 5, 0], ["up", 6, 7, 0]]);
    assert.equal(document.listenerCount("mousemove"), 0);
    assert.equal(document.listenerCount("mouseup"), 0);
    received.length = 0;
    item.registerMouseEventsCombined(element, (...args) => received.push(args));
    element.onmousedown({clientX: 8, clientY: 9, button: 2});
    document.emit("mouseup", {clientX: 10, clientY: 11, button: 2});
    document.emit("mousemove", {clientX: 12, clientY: 13, button: 2});
    assert.deepEqual(received, [[8, 9, 2], [10, 11, 2]]);
    assert.equal(document.listenerCount("mousemove"), 0);
});

function historyFixture() {
    let context = vm.createContext({});
    for (let relative of [
        "event/EventHandler", "history/HistoryMemento", "history/memento/ToolHistoryMemento", "history/HistoryStack"
    ]) {
        let filename = path.resolve(__dirname, "../js/src/engine/document", relative + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let {HistoryStack, HistoryMemento, ToolHistoryMemento} = vm.runInContext(
        "({HistoryStack, HistoryMemento, ToolHistoryMemento})", context);
    let state = {value: 0, type: "brush", notifications: [], switches: []};
    let app = {
        getActiveTool: () => state.type === null ? null : {getType: () => state.type},
        setActiveToolFromType: type => {
            state.switches.push(type);
            state.type = type;
        },
        fire: (...args) => state.notifications.push(args)
    };
    let workspace = {getApp: () => app};
    let history = new HistoryStack(app, workspace);
    let makeMemento = (value, tool = false) => {
        let memento = tool ? new ToolHistoryMemento(workspace, "Edit", "icon") : new HistoryMemento("Edit", "icon");
        let undo = () => {
            let previous = state.value;
            state.value = value;
            let reverse = makeMemento(previous, tool);
            return reverse;
        };
        if (tool) {
            memento.onToolUndo = undo;
        } else {
            memento.onUndo = undo;
        }
        return memento;
    };
    return {state, workspace, history, makeMemento, ToolHistoryMemento};
}

test("history navigation restores intermediate values and branches after undo", () => {
    let {state, workspace, history, makeMemento} = historyFixture();
    let executing = 0;
    let executed = 0;
    history.executing.add(received => {
        assert.equal(received, history);
        ++executing;
    });
    history.executed.add(received => {
        assert.equal(received, history);
        ++executed;
    });
    let baseline = makeMemento(0);
    history.pushNewMemento(baseline);
    history.stepTo(baseline);
    assert.equal(executing, 1);
    assert.equal(state.value, 0);
    for (let value of [10, 20, 30]) {
        history.pushNewMemento(makeMemento(state.value));
        state.value = value;
    }
    let first = history.getUndoStack()[1];
    history.stepTo(first);
    assert.equal(state.value, 10);
    assert.equal(history.getUndoStack().length, 2);
    assert.equal(history.getRedoStack().length, 2);
    let future = history.getRedoStack().at(-1);
    history.stepTo(future);
    assert.equal(state.value, 30);
    assert.equal(history.getRedoStack().length, 0);
    history.stepTo(history.getUndoStack().at(-1));
    assert.equal(state.value, 20);
    let before = executing;
    history.stepTo(makeMemento(999));
    assert.equal(executing, before);
    assert.equal(state.value, 20);
    history.pushNewMemento(makeMemento(20));
    state.value = 40;
    assert.equal(history.getRedoStack().length, 0);
    history.clearAll();
    assert.equal(history.getUndoStack().length, 0);
    assert.equal(history.getRedoStack().length, 0);
    assert.equal(executing, executed);
    assert.equal(state.notifications.length, executed);
    assert.ok(state.notifications.every(([event, target]) => event === "document:history_changed" && target === workspace));
});

test("tool history navigation restores the required tool before undo and redo", () => {
    let {state, workspace, history, makeMemento, ToolHistoryMemento} = historyFixture();
    let memento = makeMemento(0, true);
    assert.equal(memento.getDocumentWorkspace(), workspace);
    assert.equal(memento.getToolType(), "brush");
    history.pushNewMemento(memento);
    state.value = 10;
    state.type = "eraser";
    history.stepBackward();
    assert.equal(state.value, 0);
    assert.equal(state.type, "brush");
    state.type = null;
    history.stepForward();
    assert.equal(state.value, 10);
    assert.equal(state.type, "brush");
    assert.deepEqual(state.switches, ["brush", "brush"]);
    state.type = "eraser";
    memento.performUndo();
    assert.equal(state.value, 0);
    assert.equal(state.type, "brush");
    assert.throws(() => new ToolHistoryMemento(workspace, "Abstract", "").performUndo(), /Not implemented/);
});
