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

module.exports = async function checkTransformTools() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let near = (actual, expected, message) => check(Math.abs(actual - expected) < 0.01, message + ": " + actual + " != " + expected);
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(128, 128);
    workspace.setZoom(4);
    let surface = workspace.getActiveLayer().getSurface();
    let selection = workspace.getSelection();
    let reset = () => {
        app.setActiveTool(null);
        selection.reset();
        selection.setContinuation(new Rectangle(32, 40, 40, 20), CombineMode.REPLACE);
        selection.commitContinuation();
        workspace.getHistory().clearAll();
        app.shiftKeyDown = false;
        app.altKeyDown = false;
        app.setActiveToolFromType(ToolType.MOVE_SELECTION);
        return app.getActiveTool();
    };
    phase("all scale handles, opposite anchors, shift and centered scaling");
    for (let modifiers of ["none", "shift", "alt", "both"]) {
        for (let edge of [
            MoveToolBaseEdge.TOP_LEFT, MoveToolBaseEdge.TOP, MoveToolBaseEdge.TOP_RIGHT,
            MoveToolBaseEdge.RIGHT, MoveToolBaseEdge.BOTTOM_RIGHT, MoveToolBaseEdge.BOTTOM,
            MoveToolBaseEdge.BOTTOM_LEFT, MoveToolBaseEdge.LEFT
        ]) {
            let tool = reset();
            app.shiftKeyDown = modifiers === "shift" || modifiers === "both";
            app.altKeyDown = modifiers === "alt" || modifiers === "both";
            let point = tool.moveNubs[edge].getTransformedLocation();
            let direction = tool.getEdgeVector(edge);
            tool.onMouseDown(point.x, point.y, MouseButton.LEFT);
            check(tool.context.currentMode === MoveToolBaseMode.SCALE, "Handle did not begin scaling");
            let delta = new Point(direction.x * 10, direction.y * 5);
            tool.onMouseMove(point.x + delta.x, point.y + delta.y);
            tool.onMouseUp(point.x + delta.x, point.y + delta.y, MouseButton.LEFT);
            let bounds = selection.getBounds();
            let centered = app.altKeyDown ? 2 : 1;
            let expectedWidth = direction.x === 0 ? 40 : 40 + 10 * centered;
            let expectedHeight = direction.y === 0 ? 20 : 20 + 5 * centered;
            if (app.shiftKeyDown) {
                if (direction.x === 0) {
                    expectedWidth = expectedHeight * 2;
                } else {
                    expectedHeight = expectedWidth / 2;
                }
            }
            near(bounds.width, expectedWidth, "Handle width is incorrect: " + modifiers + "/" + edge);
            near(bounds.height, expectedHeight, "Handle height is incorrect: " + modifiers + "/" + edge);
            if (app.altKeyDown) {
                near(bounds.x + bounds.width / 2, 52, "Centered scaling moved its x anchor");
                near(bounds.y + bounds.height / 2, 50, "Centered scaling moved its y anchor");
            }
            let expected = [bounds.x, bounds.y, bounds.width, bounds.height];
            DocumentIO.finishActiveTool(false);
            let steps = workspace.getHistory().undoStack.length;
            check(steps > 0, "Scaling did not create history");
            for (let index = 0; index < steps; ++index) {
                workspace.getHistory().stepBackward();
            }
            bounds = selection.getBounds();
            near(bounds.x, 32, "Scaling undo lost x");
            near(bounds.y, 40, "Scaling undo lost y");
            near(bounds.width, 40, "Scaling undo lost width");
            near(bounds.height, 20, "Scaling undo lost height");
            DocumentIO.finishActiveTool(false);
            for (let index = 0; index < steps; ++index) {
                workspace.getHistory().stepForward();
            }
            bounds = selection.getBounds();
            for (let [index, actual] of [bounds.x, bounds.y, bounds.width, bounds.height].entries()) {
                near(actual, expected[index], "Scaling redo lost transformed bounds");
            }
        }
    }
    phase("rotation gestures, snapped angles, reflection and transform cloning");
    for (let angle of [30, 60, 90, 120, 180, -45, -90]) {
        let tool = reset();
        app.shiftKeyDown = true;
        tool.onMouseDown(72, 50, MouseButton.RIGHT);
        let target = new Point(52 + 20 * Math.cos(angle * Math.PI / 180), 50 + 20 * Math.sin(angle * Math.PI / 180));
        tool.onMouseMove(target.x, target.y);
        tool.rotateNub.render(surface, new Rectangle(0, 0, 128, 128));
        tool.onMouseUp(target.x, target.y, MouseButton.RIGHT);
        near(Utility.getAngleOfTransform(selection.getInterimTransform()), angle, "Snapped selection rotation used a different angle");
        let clone = tool.context.clone();
        check(clone.baseTransform !== tool.context.baseTransform && clone.startPath !== tool.context.startPath,
            "Move context clone retained mutable transforms or paths");
        check(clone.getMatrixElements(null) === null && clone.getMatrixElements(clone.baseTransform) === clone.baseTransform.getElements(),
            "Move context matrix accessor lost null/value semantics");
        clone.dispose();
    }
    let tool = reset();
    let flip = new Matrix();
    flip.scale(-1, 1);
    flip.translate(104, 0);
    selection.setInterimTransform(flip);
    tool.positionNubs(MoveToolBaseMode.SCALE);
    let handle = tool.moveNubs[MoveToolBaseEdge.TOP].getTransformedLocation();
    tool.onMouseDown(handle.x, handle.y, MouseButton.LEFT);
    tool.onMouseMove(handle.x, handle.y - 5);
    tool.onMouseUp(handle.x, handle.y - 5, MouseButton.LEFT);
    near(selection.getBounds().height, 25, "Reflected top handle scaled in the wrong direction");
    reset();
    tool = app.getActiveTool();
    check(tool.updateRotationIndicator(new Point(52, 36)), "Padded rotation region was not detected");
    tool.rotateIndicator.render(surface, new Rectangle(0, 0, 128, 128));
    check(!tool.updateRotationIndicator(new Point(52, 50)), "Inside selection showed a rotation indicator");
    check(!tool.updateRotationIndicator(new Point(120, 120)), "Distant pointer showed a rotation indicator");

    phase("brush preview geometry, pixel sampling and alpha averaging");
    app.setActiveTool(null);
    selection.reset();
    surface.clear();
    surface.context.putImageData(new ImageData(new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 255,
        0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0,
        0, 0, 255, 255, 0, 0, 0, 0, 255, 255, 0, 255
    ]), 3, 3), 20, 20);
    let colors = FormRegistry.get("colorsForm");
    ToolType.COLOR_PICKER.resetSettings();
    app.setActiveToolFromType(ToolType.COLOR_PICKER);
    tool = app.getActiveTool();
    check(!tool.onMouseDown(20, 20, MouseButton.MIDDLE), "Middle picker click sampled a color");
    check(tool.onMouseMove(20, 20), "Picker hover did not update preview");
    let previewTarget = Surface.create(256, 256);
    surface.clear();
    surface.context.fillStyle = "red";
    surface.context.fillRect(20, 20, 1, 1);
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseUp(20, 20, MouseButton.LEFT);
    check(colors.mainColor.toHex() === "#ff0000ff", "Picker did not read the active layer");
    tool.onMouseDown(0, 0, MouseButton.RIGHT);
    tool.onMouseUp(0, 0, MouseButton.RIGHT);
    check(colors.secondaryColor.toHex() === "#00000000", "Transparent picker sample acquired RGB or alpha");
    ToolType.COLOR_PICKER.setSetting("sampleSize", 3);
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseUp(20, 20, MouseButton.LEFT);
    check(colors.mainColor.getRed() === 255 && colors.mainColor.getAlpha() === Math.round(255 / 9),
        "Picker did not average alpha independently from premultiplied RGB");
    tool.updatePixelPreview(-10, -10);
    check(!tool.pixelPreview.isVisible(), "Outside picker hover retained its preview");
    for (let shape of ["square", "circle"]) {
        for (let size of [1, 5]) {
            tool.pixelPreview.setPreview(new Point(20, 20), size, shape, 0.5, false);
            previewTarget.clear();
            tool.pixelPreview.render(previewTarget, new Rectangle(0, 0, 256, 256));
            check(previewTarget.context.getImageData(0, 0, 256, 256).data.some((value, index) => index % 4 === 3 && value > 0),
                "Brush preview rendered no outline");
        }
    }
    workspace.updateComposition();
    ToolType.COLOR_PICKER.setSetting("sampleMode", "image");
    tool.pickColor(20, 20, MouseButton.LEFT);
    check(!tool.pickColor(-1, 0, MouseButton.LEFT) && !tool.pickColor(0, -1, MouseButton.LEFT)
        && !tool.pickColor(128, 0, MouseButton.LEFT) && !tool.pickColor(0, 128, MouseButton.LEFT),
    "Picker sampled outside canvas bounds");
    ToolType.COLOR_PICKER.setSetting("afterClick", "pencil");
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseUp(20, 20, MouseButton.LEFT);
    check(app.getActiveTool().getType() === ToolType.PENCIL, "Picker did not switch to Pencil after click");
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    app.setActiveToolFromType(ToolType.COLOR_PICKER);
    ToolType.COLOR_PICKER.setSetting("afterClick", "previous");
    tool = app.getActiveTool();
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseUp(20, 20, MouseButton.LEFT);
    check(app.getActiveTool().getType() === ToolType.PAINT_BRUSH, "Picker did not restore the previous tool");

    phase("zoom clicks, drag rectangle, button mismatch and grid rendering");
    app.setActiveToolFromType(ToolType.ZOOM);
    tool = app.getActiveTool();
    workspace.setZoom(1);
    check(!tool.onMouseMove(0, 0) && !tool.onMouseUp(0, 0, MouseButton.LEFT)
        && !tool.onMouseDown(0, 0, MouseButton.MIDDLE), "Idle zoom accepted an invalid gesture");
    tool.onMouseDown(64, 64, MouseButton.LEFT);
    check(!tool.onMouseUp(64, 64, MouseButton.RIGHT), "Mismatched zoom release finished its gesture");
    tool.onMouseUp(64, 64, MouseButton.LEFT);
    near(workspace.getZoom(), 2, "Zoom-in click did not double zoom");
    tool.onMouseDown(64, 64, MouseButton.RIGHT);
    tool.onMouseUp(64, 64, MouseButton.RIGHT);
    near(workspace.getZoom(), 1, "Zoom-out click did not halve zoom");
    tool.onMouseDown(40, 40, MouseButton.LEFT);
    tool.onMouseMove(80, 80);
    tool.onMouseUp(80, 80, MouseButton.LEFT);
    check(workspace.getZoom() > 1, "Zoom rectangle did not increase magnification");
    let grid = workspace.getGridRenderer();
    let tiny = Surface.create(16, 16);
    for (let scale of [1, 3, 101]) {
        tiny.clear();
        grid.render(tiny, new Rectangle(0, 0, 128 * scale, 128 * scale));
        let alpha = tiny.context.getImageData(0, 0, 16, 16).data.some((value, index) => index % 4 === 3 && value > 0);
        check(alpha === (scale > 2), "Pixel grid ignored its zoom threshold");
    }
    tiny.dispose();
    previewTarget.dispose();
    app.closeDocumentWorkspace(workspace, false);
};
