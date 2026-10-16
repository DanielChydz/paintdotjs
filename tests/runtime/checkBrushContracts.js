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
    phase("preview lifecycle guards and idle tools leave pixels and renderers untouched");
    let renderersBefore = workspace.getSurfaceBox().getRendererList().length;
    for (let type of [ToolType.PAINT_BRUSH, ToolType.ERASER]) {
        let unactivated = type.create();
        unactivated.updateBrushPreview(4, 4, null, false);
        unactivated.destroyBrushPreview();
        unactivated.destroyBrushPreview();
        check(unactivated.brushPreview === null, "Unactivated brush allocated or retained a preview");
    }
    let idleClone = ToolType.CLONE_STAMP.create();
    idleClone.updatePreviews(4, 4);
    idleClone.updateSourcePreview();
    let legacyAnchor = {point: new Point(2, 3), layer: workspace.getActiveLayer()};
    CloneStampTool.anchors.set(workspace, legacyAnchor);
    check(idleClone.getAnchor() === legacyAnchor && legacyAnchor.mode === "absolute" && legacyAnchor.offset === null,
        "Legacy absolute clone anchor did not migrate without changing its position");
    CloneStampTool.anchors.delete(workspace);
    let idlePicker = ToolType.COLOR_PICKER.create();
    idlePicker.updatePixelPreview(4, 4);
    check(!idlePicker.onMouseUp(4, 4, MouseButton.LEFT), "Idle picker consumed a mouse release");
    let idlePan = ToolType.PAN.create();
    check(!idlePan.onMouseMove(4, 4) && !idlePan.onMouseUp(4, 4, MouseButton.LEFT),
        "Idle Pan consumed a gesture without a press");
    check(workspace.getSurfaceBox().getRendererList().length === renderersBefore && same(pixels(), baseline),
        "Unactivated preview operations changed renderer ownership or pixels");
    for (let type of [ToolType.MAGIC_WAND, ToolType.PAINT_BUCKET]) {
        app.setActiveToolFromType(type);
        let flood = app.getActiveTool();
        check(!flood.onKeyPress("Escape") && !flood.onMouseDown(100, 100, MouseButton.LEFT),
            "Idle/offscreen flood gesture created an operation");
        check(!flood.pending && same(pixels(), baseline), "Offscreen flood gesture changed pending state or pixels");
    }
    ToolType.COLOR_PICKER.setSetting("afterClick", "none");
    app.setActiveToolFromType(ToolType.COLOR_PICKER);
    let picker = app.getActiveTool();
    picker.onMouseDown(4, 4, MouseButton.LEFT);
    check(picker.onMouseMove(5, 5), "Tracked picker failed to sample a new pixel");
    check(!picker.onMouseUp(5, 5, MouseButton.RIGHT) && picker.tracking,
        "Unrelated button release ended the picker gesture");
    picker.onMouseUp(5, 5, MouseButton.LEFT);
    check(!picker.tracking && FormRegistry.get("colorsForm").mainColor.toPacked() === surface.getColorAt(5, 5).toPacked(),
        "Picker release did not preserve its sampled color or ended with a tracked gesture");
    app.setActiveTool(null);
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
    phase("unsampled base drawing uses lazy bitmap snapshots and exact segment restoration");
    ToolType.PAINT_BRUSH.setSetting("width", 1);
    ToolType.PAINT_BRUSH.setSetting("antialias", false);
    ToolType.PAINT_BRUSH.setSetting("smoothing", false);
    let unsampled = new DrawingTool(ToolType.PAINT_BRUSH);
    app.setActiveTool(unsampled);
    unsampled.onMouseDown(10, 10, MouseButton.LEFT);
    unsampled.onMouseMove(14, 10);
    check(!unsampled.bitmapTransaction.fullSnapshot, "Unsampled drawing unexpectedly allocated a full-canvas snapshot");
    unsampled.onMouseUp(14, 10, MouseButton.LEFT);
    let segmentExpected = new Uint8ClampedArray(32 * 32 * 4);
    for (let x = 10; x <= 14; ++x) {
        segmentExpected.set([255, 0, 0, 255], (10 * 32 + x) * 4);
    }
    check(same(pixels(), segmentExpected), "Unsampled base drawing did not produce an exact one-pixel red segment");
    history.stepBackward();
    check(same(pixels(), baseline), "Unsampled drawing undo retained segment pixels");
    history.stepForward();
    check(same(pixels(), segmentExpected), "Unsampled drawing redo did not restore its segment");
    app.setActiveTool(null);
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
    let evenSprite = brush.getBrushSprite(32, 1, new Color(255, 0, 0));
    check(evenSprite.canvas.width % 2 === 1 && evenSprite.canvas.width >= 32,
        "Even brush diameter did not retain an odd centered sprite");
    let center = Math.floor(evenSprite.canvas.width / 2);
    check(same(evenSprite.canvas.getContext("2d").getImageData(center, center, 1, 1).data, [255, 0, 0, 255])
        && evenSprite.canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3] === 0,
        "Hard brush sprite did not retain its opaque center and transparent corner");
    phase("subpixel pressure stamp area and unsampled secondary-color strokes");
    let fullDab = Surface.create(24, 24);
    let smallDab = Surface.create(24, 24);
    brush.drawBrushStamp(fullDab.context, 10.5, 10.5, 1, 1, 1, new Color(255, 0, 0));
    brush.drawBrushStamp(smallDab.context, 10.5, 10.5, 1, .5, 1, new Color(255, 0, 0));
    let fullPixels = fullDab.context.getImageData(0, 0, 24, 24).data;
    let smallPixels = smallDab.context.getImageData(0, 0, 24, 24).data;
    check(fullPixels.some((value, index) => index % 4 === 3 && value > 0), "Pressure stamp oracle was empty");
    check(smallPixels.every((value, index) => index % 4 !== 3 || Math.abs(value - fullPixels[index] / 4) <= 1),
        "A half-pixel pressure stamp did not preserve quarter-pixel area through alpha");
    fullDab.dispose();
    smallDab.dispose();
    let basic = new DrawingTool(ToolType.PAINT_BRUSH, 1, false, false);
    app.setActiveTool(basic);
    for (let [key, value] of Object.entries({width: 1, fillStyle: "solid", antialias: true})) {
        ToolType.PAINT_BRUSH.setSetting(key, value);
    }
    FormRegistry.get("colorsForm").setSecondaryColor(new Color(0, 0, 255));
    surface.clear();
    basic.onMouseDown(10, 10, MouseButton.RIGHT);
    basic.onMouseMove(15, 10);
    basic.onMouseUp(15, 10, MouseButton.RIGHT);
    let basicPixel = surface.getColorAt(12, 10);
    check(basicPixel.blue >= 254 && basicPixel.red === 0 && basicPixel.alpha > 0,
        "An unsampled antialiased right-button stroke missed its snapped secondary color: " + [basicPixel.red, basicPixel.green, basicPixel.blue, basicPixel.alpha]);
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    let spaced = app.getActiveTool();
    for (let [key, value] of Object.entries({width: 10, spacing: 100, smoothing: false})) {
        ToolType.PAINT_BRUSH.setSetting(key, value);
    }
    surface.clear();
    spaced.onMouseDown(8, 8, MouseButton.LEFT);
    spaced.onMouseMove(8.25, 8);
    check(Math.abs(spaced.distanceSinceLastSample - .25) < 1e-9,
        "A segment shorter than brush spacing did not retain its unsampled distance");
    spaced.onMouseUp(8.25, 8, MouseButton.LEFT);
    surface.context.putImageData(new ImageData(new Uint8ClampedArray(expected), 32, 32), 0, 0);
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
