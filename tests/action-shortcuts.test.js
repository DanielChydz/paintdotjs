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

function actionFixture() {
    let state = {workspace: {}, active: null, changes: [], selected: [], now: 5000, saved: null};
    let app = {
        getActiveDocumentWorkspace: () => state.workspace,
        getActiveTool: () => state.active === null ? null : {getType: () => state.active},
        setActiveToolFromType: type => {
            state.active = type;
            state.selected.push(type.getId());
        },
        fire: (...args) => state.changes.push(args)
    };
    let context = vm.createContext({
        window: {
            app,
            localStorage: {
                getItem: () => {
                    if (state.storageError) {
                        throw state.storageError;
                    }
                    return state.saved;
                },
                setItem: (key, value) => {
                    assert.equal(key, "paintdotjs.shortcuts.v1");
                    if (state.storageError) {
                        throw state.storageError;
                    }
                    state.saved = value;
                }
            }
        },
        PanelRegistry: {get: () => state.panel ?? null},
        i18n: key => key === "toolsControl.toolToolTip.format" ? "{0} ({1})" : "translated:" + key,
        clock: () => state.now
    });
    vm.runInContext("Date.now = clock", context);
    for (let relative of [
        "util/ShortcutKey.js", "document/history/action/Action.js",
        "document/history/action/CallbackAction.js", "document/history/action/actions/ToolAction.js",
        "document/history/action/ActionRegistry.js"
    ]) {
        let filename = path.resolve(__dirname, "../js/src/engine", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let api = vm.runInContext("({ShortcutKey, Action, CallbackAction, ToolAction, ActionRegistry})", context);
    let tool = (id, shortcut = "S", skip = true) => ({
        getId: () => id, getHotKey: () => shortcut, getSkipIfActiveOnHotKey: () => skip
    });
    let event = (key, modifiers = {}) => ({
        key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...modifiers
    });
    return {state, context, app, tool, event, ...api};
}

test("tool chords cycle in both directions, reset after two seconds and skip active tools", () => {
    let {state, tool, event, ToolAction, ActionRegistry} = actionFixture();
    let types = ["rectangleTool", "ellipseTool", "lassoTool"].map(id => tool(id));
    let actions = types.map(type => ActionRegistry.register(new ToolAction(type)));
    assert.equal(ActionRegistry.dispatch(event("s")), true);
    assert.equal(state.active, types[0]);
    state.now += 100;
    ActionRegistry.dispatch(event("S"));
    assert.equal(state.active, types[1]);
    state.now += 100;
    ActionRegistry.dispatch(event("s", {shiftKey: true}));
    assert.equal(state.active, types[0]);
    state.now += 100;
    ActionRegistry.dispatch(event("s", {shiftKey: true}));
    assert.equal(state.active, types[2]);
    state.now += 2001;
    ActionRegistry.dispatch(event("s"));
    assert.equal(state.active, types[0]);
    state.now += 2001;
    ActionRegistry.dispatch(event("s"));
    assert.equal(state.active, types[1]);
    for (let [index, action] of actions.entries()) {
        assert.equal(action.getShortcutChord(), new Array(index + 1).fill("S").join(", "));
        assert.equal(action.getToolType(), types[index]);
        assert.equal(action.getTooltipText(), "translated:" + types[index].getId() + ".name (" + action.getShortcutChord() + ")");
    }
    state.active = types[0];
    let before = state.selected.length;
    ActionRegistry.dispatchToolActions([actions[0]], false);
    state.now += 2001;
    ActionRegistry.dispatchToolActions([actions[0]], true);
    assert.equal(state.selected.length, before);
    let repeatable = ActionRegistry.register(new ToolAction(tool("repeatTool", "R", false)));
    state.active = repeatable.getToolType();
    ActionRegistry.dispatchToolActions([repeatable], false);
    assert.equal(state.selected.at(-1), "repeatTool");
    state.workspace = null;
    assert.equal(ActionRegistry.dispatch(event("s")), false);
    actions[0].runPerformAction();
    assert.equal(state.selected.at(-1), "repeatTool");
    state.workspace = {};
    state.panel = {get: key => {
        assert.equal(key, "toolStripChooser.chooseToolButton");
        return {setSelectedId: id => state.selected.push("selector:" + id)};
    }};
    actions[0].runPerformAction();
    assert.equal(state.selected.at(-1), "selector:rectangleTool");
    state.panel = {get: () => null};
    actions[0].runPerformAction();
    assert.equal(state.active, types[0]);
    assert.equal(ActionRegistry.dispatch(event("s", {ctrlKey: true})), false);
    let shifted = new ToolAction(tool("shiftedTool", "Shift+Q"));
    assert.equal(shifted.matchesShortcutEvent(event("q", {shiftKey: true})), true);
    assert.equal(shifted.matchesShortcutEvent(event("q")), false);
    let unassigned = new ToolAction(tool("noKeyTool", null));
    assert.equal(unassigned.matchesShortcutEvent(event("s")), false);
    assert.equal(unassigned.getShortcutChord(), "Not assigned");
});

test("shortcut changes resolve regular conflicts, preserve tool groups and restore defaults", () => {
    let {state, tool, event, ShortcutKey, ToolAction, ActionRegistry} = actionFixture();
    let notified = [];
    let listener = action => notified.push(action);
    ActionRegistry.addChangedListener(listener);
    let first = ActionRegistry.register(new ToolAction(tool("firstTool", "S")));
    let second = ActionRegistry.register(new ToolAction(tool("secondTool", "M")));
    assert.equal(ActionRegistry.setShortcut("secondTool", "S"), null);
    assert.equal(first.getShortcutKey().toString(), "S");
    assert.equal(second.getShortcutKey().toString(), "S");
    let performed = 0;
    let callback = ActionRegistry.registerCallback("menu.edit.test", () => ++performed, () => "Test", null, "X");
    assert.equal(ActionRegistry.setShortcut(callback.getActionId(), ShortcutKey.fromCombo("S")), first);
    assert.equal(first.getShortcutKey().isEmpty(), true);
    assert.equal(second.getShortcutKey().isEmpty(), true);
    assert.equal(ActionRegistry.dispatch(event("s")), true);
    assert.equal(performed, 1);
    assert.equal(callback.getDisplayName(), "Test");
    assert.equal(ActionRegistry.registerCallback(callback.getActionId(), () => {
        throw new Error("Duplicate registration replaced the original callback");
    }, "Wrong"), callback);
    assert.equal(ActionRegistry.setShortcut("missing", "A"), null);
    ActionRegistry.resetShortcut("missing");
    ActionRegistry.resetShortcut(callback.getActionId());
    assert.equal(callback.getShortcutKey().toString(), "X");
    assert.equal(Object.hasOwn(JSON.parse(state.saved), callback.getActionId()), false);
    ActionRegistry.resetAllShortcuts();
    assert.equal(first.getShortcutKey().toString(), "S");
    assert.equal(second.getShortcutKey().toString(), "M");
    assert.equal(state.saved, "{}");
    assert.equal(notified.at(-1), null);
    let count = notified.length;
    ActionRegistry.removeChangedListener(listener);
    ActionRegistry.setShortcut(first.getActionId(), null);
    assert.equal(notified.length, count);
    assert.equal(ActionRegistry.get("missing"), null);
    assert.equal(ActionRegistry.getActions().get(first.getActionId()), first);
    assert.equal(ActionRegistry.getActionList().length, 3);
    assert.ok(state.changes.every(args => args[0] === "app:shortcut_changed"));
});

test("shortcut storage handles invalid/unavailable data and applies overrides to late registrations", () => {
    let {state, context, app, ActionRegistry, ShortcutKey, event, Action, CallbackAction} = actionFixture();
    state.saved = "{broken";
    ActionRegistry.loadOverrides();
    assert.equal(Object.keys(ActionRegistry.shortcutOverrides).length, 0);
    state.saved = '{"menu.settings":"Ctrl+X"}';
    ActionRegistry.loadOverrides();
    let settings = ActionRegistry.registerCallback("menu.settings", () => {}, "Settings");
    assert.equal(settings.getDefaultShortcutKey().toString(), "Alt+X");
    assert.equal(settings.getShortcutKey().toString(), "Ctrl+X");
    state.storageError = new Error("Storage blocked");
    ActionRegistry.loadOverrides();
    assert.equal(Object.keys(ActionRegistry.shortcutOverrides).length, 0);
    ActionRegistry.setShortcut("menu.settings", "Q");
    assert.equal(settings.getShortcutKey().toString(), "Q");
    context.window.app = undefined;
    ActionRegistry.notifyChanged(settings);
    context.window.app = null;
    ActionRegistry.notifyChanged(settings);
    context.window.app = app;
    let disabled = new CallbackAction("disabled", () => assert.fail("Disabled callback ran"), "", () => false);
    disabled.runPerformAction();
    assert.equal(disabled.getDisplayName(), "disabled");
    assert.equal(new CallbackAction("named", () => {}, "Name").getDisplayName(), "Name");
    let action = new Action("custom", null, "description", "Ctrl++");
    assert.equal(action.getDisplayName(), "custom");
    assert.equal(action.getDescriptionTranslationId(), "description");
    assert.equal(action.getTooltipText(), null);
    assert.equal(action.matchesShortcutEvent(event("+", {ctrlKey: true, shiftKey: true})), true);
    assert.equal(action.runIsActionExecutable(), true);
    assert.throws(() => action.runPerformAction(), /No action implementation provided for custom/);
    for (let [id, category] of [
        ["menu.file.save", "File"], ["paintTool", "Tools"],
        ["measurementUnit.pixel", "View"], ["other", "General"]
    ]) {
        assert.equal(new Action(id, null, null, null).getCategory(), category);
    }
    assert.equal(ShortcutKey.fromEvent(event("Control", {ctrlKey: true})).isEmpty(), true);
    assert.equal(ShortcutKey.fromEvent(event("Spacebar", {metaKey: true})).toString(), "Meta+Space");
    assert.equal(ShortcutKey.normalizeKey(undefined), null);
    assert.equal(ShortcutKey.normalizeKey(null), null);
    assert.equal(ShortcutKey.fromCombo("control + alt + command + Del").toString(), "Ctrl+Alt+Meta+Del");
    assert.equal(ShortcutKey.fromCombo(" ").isEmpty(), true);
    assert.equal(ShortcutKey.fromCombo("Q").equals({}), false);
    for (let [key, display] of [["Left", "Left"], ["Right", "Right"], ["Up", "Up"], ["Down", "Down"], ["Esc", "Esc"]]) {
        assert.equal(ShortcutKey.fromCombo(key).toString(), display);
    }
});
