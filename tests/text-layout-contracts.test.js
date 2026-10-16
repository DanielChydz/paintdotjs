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

function textFixture(model = {}, settings = {}) {
    let workspace = {getDocument: () => model};
    let context = vm.createContext({app: {getActiveDocumentWorkspace: () => workspace}});
    for (let relative of ["util/MouseButton", "util/Point", "util/Rectangle", "document/tool/Tool",
        "document/tool/tool/DrawingTool", "document/tool/tool/TextTool"]) {
        let filename = path.resolve(__dirname, "../js/src/engine", relative + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let TextTool = vm.runInContext("TextTool", context);
    let Point = vm.runInContext("Point", context);
    let tool = new TextTool({getSetting: (key, fallback) => settings[key] ?? fallback});
    return {tool, Point};
}

test("text sizing supports legacy model resolution and recovers absent or invalid DPI", () => {
    for (let [model, expected] of [[{resolution: 72}, 12], [{}, 16], [{resolution: "invalid"}, 16],
        [{resolution: 144, getResolution: () => null}, 24], [{getResolution: () => 0}, 16]]) {
        let {tool} = textFixture(model);
        assert.equal(tool.getFontSize(), expected);
        assert.equal(tool.getTextTop(), 0);
    }
    assert.equal(textFixture({resolution: 144}, {fontUnit: "pixels", fontSize: 19}).tool.getFontSize(), 19);
    assert.equal(textFixture({}, {fontFamily: "system-ui"}).tool.getFontString(), "16px system-ui, sans-serif",
        "The native system UI family must remain a CSS generic keyword rather than a quoted font name");
});

test("legacy width-only text metrics retain aligned multiline layout bounds", () => {
    for (let [align, left, right] of [["left", 100, 130], ["center", 85, 115], ["right", 70, 100]]) {
        let {tool, Point} = textFixture();
        tool.textOrigin = new Point(100, 40);
        let layout = tool.measureTextLayout({measureText: text => ({width: text.length * 10})}, ["abc", "x"], 20, 24, align);
        assert.deepEqual([layout.width, layout.left, layout.right, layout.top, layout.bottom], [30, left, right, 20, 68]);
        assert.equal(layout.lines.length, 2);
        assert.equal(layout.lines[1].width, 10);
    }
});

test("text native undo remains available when the optional application command registry is absent", () => {
    let {tool} = textFixture();
    let prevented = 0;
    let stopped = 0;
    tool.onEditorKeyDown({key: "z", ctrlKey: true, preventDefault: () => ++prevented, stopPropagation: () => ++stopped});
    assert.equal(prevented, 0);
    assert.equal(stopped, 1);
    assert.equal(tool.pending, false);
});
