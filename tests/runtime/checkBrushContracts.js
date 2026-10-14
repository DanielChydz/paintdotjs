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

module.exports = async function checkBrushContracts() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let same = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(32, 32);
    app.setActiveTool(null);
    let surface = workspace.getActiveLayer().getSurface();
    surface.clear();
    let pixels = () => surface.context.getImageData(0, 0, 32, 32).data;
    let baseline = pixels();
    let selection = workspace.getSelection();
    selection.setContinuation(new Rectangle(8, 8, 8, 8), CombineMode.REPLACE);
    selection.commitContinuation();
    let history = workspace.getHistory();
    history.clearAll();
    FormRegistry.get("colorsForm").setMainColor(new Color(255, 0, 0));
    phase("pencil clipping follows the actual selection boundary and survives undo/redo");
    app.setActiveToolFromType(ToolType.PENCIL);
    let pencil = app.getActiveTool();
    pencil.onMouseDown(5, 10, MouseButton.LEFT);
    pencil.onMouseUp(20, 10, MouseButton.LEFT);
    let expected = new Uint8ClampedArray(32 * 32 * 4);
    for (let x = 8; x < 16; ++x) {
        expected.set([255, 0, 0, 255], (10 * 32 + x) * 4);
    }
    check(same(pixels(), expected), "Pencil stroke escaped its selection clip or lost selected pixels");
    history.stepBackward();
    check(same(pixels(), baseline), "Clipped pencil undo did not restore untouched pixels");
    history.stepForward();
    check(same(pixels(), expected), "Clipped pencil redo lost its exact selected pixels");
    app.setActiveTool(null);
    selection.reset();
    surface.clear();
    history.clearAll();
    phase("brush frames present aliased one-pixel dabs and recover from a second press");
    ToolType.PAINT_BRUSH.setSetting("width", 1);
    ToolType.PAINT_BRUSH.setSetting("antialias", false);
    ToolType.PAINT_BRUSH.setSetting("smoothing", false);
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    let brush = app.getActiveTool();
    brush.onMouseDown(10, 10, MouseButton.LEFT);
    await frame();
    check(brush.presentationFrame === null && surface.getColorAt(10, 10).red === 255,
        "Animation frame did not present the aliased brush dab");
    brush.onMouseDown(20, 20, MouseButton.LEFT);
    check(history.undoStack.length === 1 && brush.tracking, "A second brush press did not commit its interrupted first stroke");
    brush.onMouseUp(20, 20, MouseButton.LEFT);
    expected.fill(0);
    expected.set([255, 0, 0, 255], (10 * 32 + 10) * 4);
    expected.set([255, 0, 0, 255], (20 * 32 + 20) * 4);
    check(same(pixels(), expected), "Interrupted brush strokes lost a dab or painted extra pixels");
    brush.onMouseDown(25, 25, MouseButton.LEFT);
    app.setActiveToolFromType(ToolType.PENCIL);
    expected.set([255, 0, 0, 255], (25 * 32 + 25) * 4);
    check(!brush.tracking && brush.bitmapTransaction === null && same(pixels(), expected),
        "Changing tools did not finish the tracked brush stroke");
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    brush = app.getActiveTool();
    phase("brush rejects offscreen presentation and rolls back an orphaned transaction before painting");
    brush.onMouseDown(100, 100, MouseButton.LEFT);
    await frame();
    check(brush.pendingStrokeBounds === null && same(pixels(), expected), "Offscreen brush frame changed the canvas");
    brush.onMouseUp(100, 100, MouseButton.LEFT);
    brush.beginBitmapTransaction();
    brush.markBitmapTransactionDirty(new Rectangle(0, 0, 1, 1));
    surface.context.fillStyle = "blue";
    surface.context.fillRect(0, 0, 1, 1);
    brush.onMouseDown(5, 5, MouseButton.LEFT);
    brush.onMouseUp(5, 5, MouseButton.LEFT);
    expected.set([255, 0, 0, 255], (5 * 32 + 5) * 4);
    check(same(pixels(), expected), "Recovering an orphaned brush transaction failed to restore the old preview");
    let sprite = brush.getBrushSprite(33, 1, new Color(255, 0, 0));
    check(sprite.canvas.width % 2 === 1 && sprite.canvas.width >= 33,
        "Brush sprite did not retain its odd centered supersampling extent");
    check(brush.getBrushSprite(33, 1, new Color(255, 0, 0)) === sprite, "Brush sprite cache failed to reuse an unchanged profile");
    phase("brush and eraser setting changes preserve hover visibility outside the canvas");
    for (let type of [ToolType.PAINT_BRUSH, ToolType.ERASER]) {
        app.setActiveToolFromType(type);
        let hovering = app.getActiveTool();
        hovering.onSettingChanged();
        check(!hovering.brushPreview.isVisible(), "A setting without a hover point showed the brush preview");
        hovering.onMouseMove(10, 10, {pressure: 0.5});
        type.setSetting("width", 7);
        hovering.onSettingChanged();
        check(hovering.brushPreview.isVisible() && hovering.brushPreview.diameter === 7,
            "Changing width did not refresh the active hover preview");
        hovering.onMouseMove(100, 100);
        check(!hovering.brushPreview.isVisible(), "Hover outside the canvas retained a visible preview");
        type.setSetting("width", 9);
        hovering.onSettingChanged();
        check(!hovering.brushPreview.isVisible(), "Changing width revived a stale preview after leaving the canvas");
        check(same(pixels(), expected), "Hover or a width change modified painted pixels");
    }
    app.closeDocumentWorkspace(workspace, false);
};
