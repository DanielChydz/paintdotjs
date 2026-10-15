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

function toolFixture(options = {}) {
    let storage = new Map(Object.entries(options.storage || {}));
    let state = {readError: false, writeError: false, removeError: false, ...options};
    function ToolAction() {}
    let context = vm.createContext({
        window: {localStorage: {
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
            },
            removeItem: key => {
                if (state.removeError) {
                    throw new Error("Storage denied");
                }
                storage.delete(key);
            }
        }},
        i18n: key => "Translated " + key,
        ToolAction,
        ActionRegistry: {get: () => state.action ?? null}
    });
    let filename = path.resolve(__dirname, "../js/src/engine/document/tool/ToolType.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let type = vm.runInContext("ToolType", context);
    return {type, state, storage, ToolAction};
}

test("legacy tool settings migrate resampling and caps without replacing explicit choices", () => {
    for (let [resampling, expected] of [["bilinear", "linear"], ["bicubic", "highQualityCubic"], ["nearest", "nearest"]]) {
        let {type} = toolFixture({storage: {
            "paintdotjs.toolSettings.moveTool": JSON.stringify({resampling}),
            "paintdotjs.toolSettings.lineTool": JSON.stringify({startCap: "round", endCap: "flat"})
        }});
        assert.equal(type.MOVE.getSetting("resampling"), expected);
        assert.equal(type.LINE.getSetting("startCap"), "flat");
    }
    let {type} = toolFixture({storage: {
        "paintdotjs.toolSettings.lineTool": JSON.stringify({startCap: "round", endCap: "arrow"})
    }});
    assert.equal(type.LINE.getSetting("startCap"), "round");
    assert.equal(type.LINE.getSetting("endCap"), "arrow");
});

test("shared rendering quality migrates selection preferences and persists across tool settings", () => {
    for (let storage of [
        {"paintdotjs.selectionRenderingQuality": "aliased"},
        {"paintdotjs.toolSettings.moveSelectionTool": JSON.stringify({renderingQuality: "aliased"})},
        {"paintdotjs.toolSettings.rectangleSelectTool": JSON.stringify({renderingQuality: "aliased"})}
    ]) {
        let {type, storage: persisted} = toolFixture({storage});
        assert.equal(type.MOVE.getSetting("renderingQuality"), "aliased");
        type.MOVE.setSetting("renderingQuality", "high");
        assert.equal(type.RECTANGLE_SELECT.getSetting("renderingQuality"), "high");
        assert.equal(persisted.get("paintdotjs.selectionRenderingQuality"), "high");
        type.PAINT_BRUSH.setSetting("renderingQuality", "aliased");
        assert.equal(type.TEXT.getSetting("renderingQuality"), "aliased");
        type.PAINT_BRUSH.resetSettings();
        assert.equal(type.TEXT.getSetting("renderingQuality"), "high");
    }
    let {type} = toolFixture({storage: {"paintdotjs.selectionRenderingQuality": "invalid"}});
    assert.equal(type.MOVE.getSetting("renderingQuality"), "high");
});

test("tool settings remain usable when persistence fails or contains malformed JSON", () => {
    for (let options of [{readError: true}, {storage: {"paintdotjs.toolSettings.moveTool": "{broken"}}]) {
        let {type, state} = toolFixture(options);
        assert.equal(type.MOVE.getSetting("resampling"), "highQualityCubic");
        state.writeError = true;
        type.MOVE.setSetting("resampling", "nearest");
        assert.equal(type.MOVE.getSetting("resampling"), "nearest");
        type.MOVE.setSetting("renderingQuality", "aliased");
        assert.equal(type.LINE.getSetting("renderingQuality"), "aliased");
        state.removeError = true;
        type.MOVE.resetSettings();
        assert.equal(type.MOVE.getSetting("resampling"), "highQualityCubic");
    }
});

test("custom tool descriptors retain metadata, factory identity and action tooltip fallbacks", () => {
    let {type, state, storage, ToolAction} = toolFixture();
    let tool = new type("customTool", "custom", descriptor => ({descriptor}), "Q", true);
    assert.equal(tool.create().descriptor, tool);
    assert.equal(tool.getId(), "customTool");
    assert.equal(tool.getHotKey(), "Q");
    assert.equal(tool.getSkipIfActiveOnHotKey(), true);
    assert.equal(tool.getIconName(), "custom");
    assert.equal(tool.getIconSrc(), "assets/icons/custom_icon.png");
    assert.equal(tool.getTooltipText(), "Translated customTool.name");
    state.action = new ToolAction();
    state.action.getTooltipText = () => "Shortcut tooltip";
    assert.equal(tool.getTooltipText(), "Shortcut tooltip");
    assert.equal(tool.getSetting("missing"), null);
    assert.equal(tool.getSetting("renderingQuality", "custom-fallback"), "custom-fallback");
    tool.setSettings({width: 3});
    tool.setSetting("width", 8);
    assert.equal(JSON.parse(storage.get("paintdotjs.toolSettings.customTool")).width, 8);
    tool.resetSettings();
    assert.equal(tool.getSetting("width"), 3);
    assert.equal(storage.has("paintdotjs.toolSettings.customTool"), false);
    assert.equal(type.getById("missing"), null);
});

test("invalid legacy per-tool selection quality falls back without retaining malformed preferences", () => {
    let {type} = toolFixture({storage: {
        "paintdotjs.toolSettings.rectangleSelectTool": JSON.stringify({renderingQuality: "invalid"})
    }});
    for (let tool of [type.RECTANGLE_SELECT, type.MOVE, type.MOVE_SELECTION, type.LASSO_SELECT, type.ELLIPSE_SELECT, type.MAGIC_WAND]) {
        assert.equal(tool.getSetting("renderingQuality"), "high");
    }
});
