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

module.exports = async function checkExtensionTools() {
    let assert = require("node:assert/strict");
    let workspace = app.createBlankDocumentInNewWorkspace(32, 32);
    workspace.getSelection().setContinuation(new Rectangle(0, 0, 32, 32), CombineMode.REPLACE);
    workspace.getSelection().commitContinuation();
    app.setActiveToolFromType(ToolType.TEXT);
    let text = app.getActiveTool();
    text.onMouseDown(10, 10, MouseButton.LEFT);
    text.editor.value = "erase me";
    text.editor.dispatchEvent(new Event("input"));
    let location = text.originNub.getTransformedLocation();
    text.onMouseMove(location.x, location.y);
    text.onMouseMove(location.x, location.y + 1000);
    assert.equal(text.originNub.isPointTouching(new Point(location.x, location.y + 1000)), false);
    text.editor.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}));
    assert.equal(text.pending, false);
    assert.ok(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, 32, 32).data.every(value => value === 0));
    app.setActiveTool(null);
    let tiny = app.createBlankDocumentInNewWorkspace(1, 1);
    app.setActiveToolFromType(ToolType.TEXT);
    text = app.getActiveTool();
    text.onMouseDown(0, 0, MouseButton.LEFT);
    assert.equal(text.originNub.getLocation().x, 0.5);
    assert.equal(text.originNub.getLocation().y, 0.5);
    text.cancelPending();
    app.closeDocumentWorkspace(tiny, false);
    app.setActiveDocumentWorkspace(workspace);

    let child = new SubmenuDropEntry("fixture.child", []);
    let parent = new SubmenuDropEntry("fixture.parent", [child]);
    parent.close();
    assert.equal(child.submenuPopup, null);
    let adjustments = new AdjustmentsMenu();
    adjustments.appendTo(document.body, null);
    adjustments.open();
    adjustments.close();
    adjustments.getElement().remove();
    assert.equal(ActionRegistry.unregister("missing.fixture"), false);
    workspace.getSelection().setContinuation(new Rectangle(2, 2, 8, 8), CombineMode.REPLACE);
    workspace.getSelection().commitContinuation();
    app.setActiveToolFromType(ToolType.MOVE_SELECTION);
    let move = app.getActiveTool();
    move.onKeyPress(KeyButton.RIGHT);
    let info = new ToolInfoItem();
    for (let [angle, flipped] of [[90, false], [0, true], [90, true], [0, false]]) {
        let transform = new Matrix();
        transform.rotateAt(angle, new Point(0, 0));
        if (flipped) {
            transform.scale(-1, 1);
        }
        move.context.deltaTransform = transform;
        move.context.currentMode = MoveToolBaseMode.ROTATE;
        assert.equal(typeof info.getSelectionText(), "string");
    }
    move.drop();

    SettingsDialog.open("ui");
    let settings = SettingsDialog.instance;
    let emptySelect = settings.addSelect(null, "Empty", []);
    assert.equal(emptySelect.value, "");
    let fallbackSelect = settings.addSelect(null, "Fallback", [["a", "A"]]);
    assert.equal(fallbackSelect.value, "a");
    let entry = settings.getEntry("ui");
    entry.definition = {...entry.definition};
    assert.equal(entry.definition.id, "ui");
    entry.scrollToAddedRow(null);
    entry.scrollToAddedRow(document.createElement("div"));
    settings.close();

    let originalEnsure = FontManager.ensureLoaded;
    FontManager.ensureLoaded = async () => { throw new Error("font unavailable"); };
    try {
        AppSettingsStore.applyUiFont();
        await Promise.resolve();
    } finally {
        FontManager.ensureLoaded = originalEnsure;
    }
    app.closeDocumentWorkspace(workspace, false);
};
