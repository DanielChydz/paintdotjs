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

function optionalUIFixture(defaultTool) {
    let state = {activated: [], listeners: [], selected: null, translations: {}};
    let actions = new Map();
    let globals = {
        app: {on: (...args) => state.listeners.push(args), setActiveToolFromType: type => state.activated.push(type)},
        i18n: key => state.translations[key] ?? key,
        window: {localStorage: {getItem: () => null}},
        ToolAction: function () {},
        ActionRegistry: {get: id => actions.get(id) || null, registerCallback: (id, callback) => actions.set(id, callback)},
        PanelRegistry: {get: () => ({get: () => ({getSelectedEntry: () => state.selected})})}
    };
    if (defaultTool !== undefined) {
        globals.AppSettingsStore = {get: () => defaultTool};
    }
    let context = vm.createContext(globals);
    for (let relative of [
        "engine/document/tool/ToolType.js", "interface/UIElement.js", "interface/item/Item.js",
        "interface/item/menu/MenuItem.js", "interface/item/menu/action/ActionItem.js",
        "interface/item/menu/LabelMenuItem.js", "interface/item/menu/action/drop/DropEntry.js",
        "interface/item/menu/action/drop/DropMenuItem.js", "interface/item/menu/action/drop/SelectorMenuItem.js",
        "interface/panel/footer/menu/ToolInfoItem.js", "interface/panel/header/tool/ToolSelector.js",
        "interface/panel/header/main/menu/EffectsMenu.js"
    ]) {
        let filename = path.resolve(__dirname, "../js/src", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    return {state, ...vm.runInContext("({ToolType, ToolSelector, ToolInfoItem, EffectsMenu})", context)};
}

test("tool selectors recover missing startup preferences and invoke their own tool entries", () => {
    for (let preference of [undefined, "removed-plugin-tool", "textTool"]) {
        let {state, ToolType, ToolSelector} = optionalUIFixture(preference);
        let selector = new ToolSelector();
        let expected = preference === "textTool" ? ToolType.TEXT : ToolType.PAINT_BRUSH;
        assert.equal(selector.getSelectedId(), expected.getId());
        assert.equal(state.activated.at(-1), expected);
        selector.entries.find(entry => entry.id === ToolType.RECTANGLE_SELECT.getId()).pressable();
        assert.equal(selector.getSelectedId(), ToolType.RECTANGLE_SELECT.getId());
        assert.equal(state.activated.at(-1), ToolType.RECTANGLE_SELECT);
        let selected = selector.getSelectedId();
        let switches = state.activated.length;
        assert.throws(() => selector.setSelectedId("unknown-tool"), /Tool not found: unknown-tool/);
        assert.equal(selector.getSelectedId(), selected, "Rejected tool id must preserve the selected entry");
        assert.equal(state.activated.length, switches);
    }
});

test("tool footer supports both direct and nested translated help text", () => {
    let {state, ToolInfoItem} = optionalUIFixture();
    state.selected = {id: "brush", getText: () => "Brush", getIconPath: () => "brush.png"};
    state.translations["brush.helpText"] = "Draw a stroke";
    let footer = new ToolInfoItem();
    assert.equal(footer.getText(), "Brush: Draw a stroke");
    assert.equal(footer.getIconPath(), "brush.png");
    state.translations["brush.helpText"] = {text: "Draw a stroke"};
    state.translations["brush.helpText.text"] = "Nested help";
    assert.equal(footer.getText(), "Brush: Nested help");
});

test("effect categories reject unregistered effects before building menu entries", () => {
    let {EffectsMenu} = optionalUIFixture();
    assert.throws(() => EffectsMenu.createCategory("custom", ["missingEffect"]), /Missing effect action: menu.effects.missingEffect/);
});

function colorsFixture(settings) {
    let context = vm.createContext({app: {}, window: {localStorage: {getItem: () => null}}});
    if (settings !== undefined) {
        context.AppSettingsStore = {get: (key, fallback) => Object.hasOwn(settings, key) ? settings[key] : fallback};
    }
    for (let relative of ["engine/util/Debounced.js", "engine/util/Color.js",
        "engine/document/event/EventHandler.js", "interface/window/Form.js", "interface/window/form/ColorsForm.js"]) {
        let filename = path.resolve(__dirname, "../js/src", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    return vm.runInContext("new ColorsForm()", context);
}

test("color preferences recover missing settings and invalid stored channels without sharing defaults", () => {
    for (let settings of [undefined, {"tools.primaryColor": "invalid", "tools.secondaryColor": 1.5},
        {"tools.primaryColor": 0xff123456, "tools.secondaryColor": 0x80102030, "windows.colorsForm": {expanded: true}}]) {
        let colors = colorsFixture(settings);
        let valid = settings?.["windows.colorsForm"]?.expanded === true;
        assert.equal(colors.mainColor.toPacked() >>> 0, valid ? 0xff123456 : 0xff000000);
        assert.equal(colors.secondaryColor.toPacked() >>> 0, valid ? 0x80102030 : 0xffffffff);
        assert.equal(colors.expanded, valid);
        assert.equal(colors.palette.length, 96);
        assert.notEqual(colors.palette[0], colors.defaultPalette[0]);
        colors.palette[0].setAlpha(0);
        assert.equal(colors.defaultPalette[0].getAlpha(), 255);
    }
});
