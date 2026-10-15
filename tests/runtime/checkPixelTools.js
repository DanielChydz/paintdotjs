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

module.exports = async function checkPixelTools() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let equal = (actual, expected, message) => {
        let mismatch = actual.findIndex((value, index) => value !== expected[index]);
        check(actual.length === expected.length && mismatch === -1,
            message + "; first differing byte: " + mismatch);
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let modifier = (key, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup",
        {key, bubbles: true, cancelable: true}));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(64, 64);
    let surface = workspace.getActiveLayer().getSurface();
    let history = workspace.getHistory();
    let pixels = () => surface.context.getImageData(0, 0, 64, 64).data;
    let at = (x, y) => [...pixels().slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    let colors = FormRegistry.get("colorsForm");
    colors.setMainColor(new Color(255, 0, 0));
    colors.setSecondaryColor(new Color(0, 0, 255));
    let prepare = settings => {
        app.setActiveTool(null);
        workspace.getSelection().reset();
        surface.context.clearRect(0, 0, 64, 64);
        surface.context.fillStyle = "blue";
        surface.context.fillRect(0, 0, 32, 64);
        surface.context.fillRect(48, 0, 16, 64);
        history.clearAll();
        for (let [type, values] of settings) {
            type.resetSettings();
            for (let [key, value] of Object.entries(values)) {
                type.setSetting(key, value);
            }
        }
    };
    let undoRedo = (before, after, name) => {
        let steps = history.undoStack.length;
        check(steps > 0, name + " did not create history");
        for (let index = 0; index < steps; ++index) {
            history.stepBackward();
        }
        equal(pixels(), before, name + " undo changed original pixels");
        for (let index = 0; index < steps; ++index) {
            history.stepForward();
        }
        equal(pixels(), after, name + " redo changed final pixels");
    };

    phase("contiguous and global paint bucket");
    for (let floodMode of ["contiguous", "global"]) {
        prepare([[ToolType.PAINT_BUCKET, {tolerance: 0, floodMode, antialias: false}]]);
        let before = pixels();
        app.setActiveToolFromType(ToolType.PAINT_BUCKET);
        let tool = app.getActiveTool();
        check(tool.onMouseDown(-1, -1, MouseButton.LEFT) === false, "Out-of-bounds fill was accepted");
        tool.onMouseDown(10, 10, MouseButton.LEFT);
        equal(at(10, 10), [255, 0, 0, 255], "Fill missed its seed");
        equal(at(50, 10), floodMode === "global" ? [255, 0, 0, 255] : [0, 0, 255, 255],
            "Fill crossed a disconnected transparent barrier");
        equal(at(40, 10), [0, 0, 0, 0], "Fill changed a nonmatching pixel");
        tool.onKeyPress("Enter");
        undoRedo(before, pixels(), "Fill " + floodMode);
        tool.onMouseDown(10, 10, MouseButton.RIGHT);
        tool.cancelPending();
        equal(at(10, 10), [255, 0, 0, 255], "Cancelling fill lost committed pixels");
    }
    phase("wand selection set operations");
    for (let floodMode of ["contiguous", "global"]) {
        for (let combineMode of ["replace", "union", "exclude", "intersect", "xor"]) {
            prepare([[ToolType.MAGIC_WAND, {tolerance: 0, floodMode, combineMode}]]);
            let selection = workspace.getSelection();
            if (combineMode !== "replace") {
                selection.setContinuation(new Rectangle(0, 0, 16, 64), CombineMode.REPLACE);
                selection.commitContinuation();
            }
            let original = BitmapEffectEngine.createSelectionMask(64, 64, selection);
            let before = pixels();
            app.setActiveToolFromType(ToolType.MAGIC_WAND);
            let tool = app.getActiveTool();
            tool.onMouseDown(10, 10, MouseButton.LEFT);
            tool.onKeyPress("Enter");
            let actual = BitmapEffectEngine.createSelectionMask(64, 64, selection);
            // An empty selection uses the application's unmasked convention.
            let selected = (x, y) => !selection.isEmpty() && (actual === null || actual[y * 64 + x] === 255);
            check(selected(8, 10) === ["replace", "union", "intersect"].includes(combineMode),
                "Wand overlap is wrong: " + combineMode);
            check(selected(24, 10) === ["replace", "union", "xor"].includes(combineMode),
                "Wand nonoverlap is wrong: " + combineMode);
            check(selected(50, 10) === (floodMode === "global"
                && ["replace", "union", "xor"].includes(combineMode)), "Wand flood mode is wrong");
            equal(pixels(), before, "Wand changed pixels");
            history.stepBackward();
            let restored = BitmapEffectEngine.createSelectionMask(64, 64, selection);
            if (original === null) {
                check(restored === null, "Wand undo did not restore empty selection");
            } else {
                equal(restored, original, "Wand undo changed the selection");
            }
            history.stepForward();
        }
    }

    phase("editable bucket/wand origins, composited sampling and preview cancellation");
    for (let type of [ToolType.PAINT_BUCKET, ToolType.MAGIC_WAND]) {
        prepare([[type, {tolerance: 0, floodMode: "contiguous", alphaMode: "straight", sampleMode: "layer"}]]);
        let base = pixels();
        app.setActiveToolFromType(type);
        let tool = app.getActiveTool();
        check(!tool.onMouseDown(8, 8, MouseButton.MIDDLE), "Middle button started a flood operation");
        check(!tool.onMouseMove(8, 8) && !tool.onMouseUp(8, 8), "Inactive flood operation tracked input");
        check(!tool.renderPending() && !tool.commitPending() && !tool.cancelPending(),
            "Inactive flood operation reported a completed transaction");
        tool.onSettingChanged("tolerance");
        tool.onMouseDown(8, 8, MouseButton.LEFT);
        check(tool.pending && tool.sampleSnapshot !== null, "Flood preview did not retain its source snapshot");
        let point = tool.originNub.getTransformedLocation();
        tool.onMouseDown(point.x, point.y, MouseButton.LEFT);
        check(tool.tracking, "Origin handle did not start dragging");
        tool.onMouseMove(40.5, 8.5);
        tool.onMouseUp(40.5, 8.5);
        check(!tool.tracking && tool.origin.x === 40 && tool.origin.y === 8, "Flood origin drag lost pointer offset");
        if (type === ToolType.PAINT_BUCKET) {
            equal(at(8, 8), [0, 0, 255, 255], "Origin drag retained old fill pixels");
            equal(at(40, 8), [255, 0, 0, 255], "Origin drag did not fill its new region");
        } else {
            let mask = BitmapEffectEngine.createSelectionMask(64, 64, workspace.getSelection());
            check(mask[8 * 64 + 40] === 255 && mask[8 * 64 + 8] === 0, "Wand drag retained its old region");
        }
        point = tool.originNub.getTransformedLocation();
        tool.onMouseDown(point.x, point.y, MouseButton.RIGHT);
        tool.onMouseUp(-10, -10);
        if (type === ToolType.PAINT_BUCKET) {
            equal(pixels(), base, "Offscreen origin did not restore the prior fill");
        } else {
            check(workspace.getSelection().isEmpty(), "Offscreen wand origin did not clear its preview");
        }
        check(!tool.onKeyPress("x"), "Unknown flood shortcut was consumed");
        tool.cancelPending();
        equal(pixels(), base, "Flood cancellation changed base pixels");
        check(tool.sampleSnapshot === null && tool.originNub === null, "Flood cancellation retained snapshot/handle storage");
        check(history.undoStack.length === 0, "Cancelled flood created history");

        let overlay = new BitmapLayer(workspace, 64, 64);
        overlay.getSurface().context.fillStyle = "green";
        overlay.getSurface().context.fillRect(0, 0, 16, 64);
        let originalLayer = workspace.getActiveLayer();
        workspace.getDocument().addLayer(overlay);
        workspace.setActiveLayer(originalLayer);
        workspace.updateComposition();
        type.setSetting("sampleMode", "image");
        tool.onMouseDown(8, 8, MouseButton.LEFT);
        if (type === ToolType.PAINT_BUCKET) {
            equal(at(8, 8), [255, 0, 0, 255], "Image sampling did not fill the seed");
            equal(at(24, 8), [0, 0, 255, 255], "Image sampling ignored the composited color boundary");
        } else {
            let mask = BitmapEffectEngine.createSelectionMask(64, 64, workspace.getSelection());
            check(mask[8 * 64 + 8] === 255 && mask[8 * 64 + 24] === 0,
                "Wand image sampling ignored the composited color boundary");
        }
        let oldCanvas = tool.sampleSnapshot.canvas;
        type.setSetting("sampleMode", "layer");
        tool.onSettingChanged("sampleMode");
        check(oldCanvas.width === 0 && oldCanvas.height === 0, "Changing flood sample mode retained the old canvas");
        if (type === ToolType.PAINT_BUCKET) {
            equal(at(24, 8), [255, 0, 0, 255], "Layer sampling did not expand the editable fill");
        } else {
            let mask = BitmapEffectEngine.createSelectionMask(64, 64, workspace.getSelection());
            check(mask[8 * 64 + 24] === 255, "Layer sampling did not expand the editable wand selection");
        }
        type.setSetting("sampleMode", "image");
        workspace.updateComposition();
        tool.onSettingChanged("sampleMode");
        tool.cancelPending();
        equal(pixels(), base, "Sampling-mode changes contaminated the original pixels");
        tool.onMouseDown(8, 8, MouseButton.LEFT);
        tool.onMouseDown(50, 8, MouseButton.LEFT);
        check(history.undoStack.length === 1 && tool.pending, "A new flood seed did not commit the previous preview");
        app.setActiveTool(null);
        check(history.undoStack.length === 2 && tool.sampleSnapshot === null, "Deactivation did not commit/release the flood preview");
        history.clearAll();
        workspace.getDocument().getLayers().removeLayer(overlay);
        overlay.dispose();
    }

    phase("wand modifier overrides, stencil caching and exact set-operation masks");
    for (let [control, alt, button, mode] of [
        [true, false, MouseButton.LEFT, "union"], [false, true, MouseButton.LEFT, "exclude"],
        [true, false, MouseButton.RIGHT, "xor"], [false, true, MouseButton.RIGHT, "intersect"]
    ]) {
        prepare([[ToolType.MAGIC_WAND, {tolerance: 0, combineMode: "replace", floodMode: "contiguous"}]]);
        let selection = workspace.getSelection();
        selection.setContinuation(new Rectangle(0, 0, 16, 64), CombineMode.REPLACE);
        selection.commitContinuation();
        let before = BitmapEffectEngine.createSelectionMask(64, 64, selection);
        app.controlKeyDown = control;
        app.altKeyDown = alt;
        app.shiftKeyDown = true;
        app.setActiveToolFromType(ToolType.MAGIC_WAND);
        let tool = app.getActiveTool();
        tool.onMouseDown(8, 8, button);
        let mask = BitmapEffectEngine.createSelectionMask(64, 64, selection);
        for (let y = 0; y < 64; ++y) {
            for (let x = 0; x < 64; ++x) {
                let base = x < 16;
                let flooded = x < 32 || x >= 48;
                let expected = mode === "union" ? base || flooded : mode === "exclude" ? base && !flooded
                    : mode === "xor" ? base !== flooded : base && flooded;
                let selected = !selection.isEmpty() && (mask === null || mask[y * 64 + x] === 255);
                check(selected === expected, "Modifier/Shift wand mask differs: " + mode);
            }
        }
        tool.onKeyPress("Escape");
        equal(BitmapEffectEngine.createSelectionMask(64, 64, selection), before, "Wand Escape lost its base selection");
        check(tool.baseSelectionData === null && tool.baseSelectionStencil === null, "Wand Escape retained base data");
        app.controlKeyDown = false;
        app.altKeyDown = false;
        app.shiftKeyDown = false;
    }
    let clippingPath = new GraphicsPath();
    clippingPath.addRectangle(new Rectangle(-3, -3, 10, 10));
    clippingPath.addRectangle(new Rectangle(2, 2, 2, 2));
    clippingPath.getVertexLists().push(new VertexList());
    let stencil = MagicWandTool.createSelectionStencil(clippingPath, 8, 8);
    for (let y = 0; y < 8; ++y) {
        for (let x = 0; x < 8; ++x) {
            check(!!stencil.get(x, y) === (x < 7 && y < 7 && !(x >= 2 && x < 4 && y >= 2 && y < 4)),
                "Clipped selection stencil filled its hole or overflow");
        }
    }
    clippingPath.setPixelStencil(stencil);
    equal(MagicWandTool.createSelectionStencil(clippingPath, 8, 8).bitArray, stencil.bitArray,
        "Cached selection stencil changed bytes");
    let unchanged = new Uint8Array(stencil.bitArray);
    MagicWandTool.combineStencils(stencil, null, CombineMode.UNION);
    equal(stencil.bitArray, unchanged, "A null base stencil changed the selection");
    clippingPath.dispose();

    phase("recolor sampling and brush coverage");
    for (let recolorSampling of ["once", "secondary"]) {
        for (let antialias of [true, false]) {
            prepare([[ToolType.RECOLOR, {width: 10, hardness: 100, tolerance: 0,
                smoothing: false, recolorSampling, antialias}]]);
            let before = pixels();
            app.setActiveToolFromType(ToolType.RECOLOR);
            let tool = app.getActiveTool();
            tool.onMouseDown(10, 10, MouseButton.LEFT);
            tool.onMouseMove(20, 20);
            tool.onMouseUp(20, 20, MouseButton.LEFT);
            equal(at(10, 10), [255, 0, 0, 255], "Recolor did not replace blue");
            equal(at(50, 10), [0, 0, 255, 255], "Recolor painted outside its stroke");
            undoRedo(before, pixels(), "Recolor " + recolorSampling + " " + antialias);
        }
    }
    phase("aligned clone stamp");
    prepare([[ToolType.CLONE_STAMP, {width: 8, hardness: 100, smoothing: false, antialias: false}]]);
    let before = pixels();
    app.setActiveToolFromType(ToolType.CLONE_STAMP);
    let cloneTool = app.getActiveTool();
    check(cloneTool.usesContinuousPointerCoordinates(), "Clone sampling unexpectedly rounded pointer coordinates");
    let toolbar = PanelRegistry.get("toolMenu");
    toolbar.updateSetting(ToolType.CLONE_STAMP, "width", 9);
    check(cloneTool.getWidth() === 9 && cloneTool.previewPoint === null, "Clone width did not update before the first pointer sample");
    cloneTool.onMouseDown(40, 12, MouseButton.LEFT);
    cloneTool.showMissingAnchorWarning();
    check(document.querySelectorAll(".clone-stamp-warning-dialog").length === 1 && cloneTool.missingAnchorDialogOpen,
        "Missing clone source did not produce exactly one warning");
    document.querySelector(".clone-stamp-warning-dialog .task-dialog-choice").click();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(!cloneTool.missingAnchorDialogOpen && history.undoStack.length === 0, "Canceled clone warning retained state or history");
    equal(pixels(), before, "Missing clone source changed pixels");
    toolbar.updateSetting(ToolType.CLONE_STAMP, "width", 8);
    check(cloneTool.previewPoint.x === 40 && cloneTool.destinationPreview !== null,
        "Clone setting change lost its existing pointer preview");
    let targetLayer = workspace.getActiveLayer();
    let sourceLayer = new BitmapLayer(workspace, 64, 64);
    workspace.getDocument().addLayer(sourceLayer);
    workspace.setActiveLayer(sourceLayer);
    cloneTool = app.getActiveTool();
    modifier("Control", true);
    cloneTool.onMouseDown(10, 10, MouseButton.LEFT);
    cloneTool.onMouseUp(10, 10, MouseButton.LEFT);
    modifier("Control", false);
    workspace.setActiveLayer(targetLayer);
    workspace.getDocument().getLayers().removeLayer(sourceLayer);
    cloneTool = app.getActiveTool();
    cloneTool.onMouseDown(40, 12, MouseButton.LEFT);
    check(cloneTool.getAnchor() === null && cloneTool.missingAnchorDialogOpen, "Deleted clone source layer retained an invalid anchor");
    document.querySelector(".clone-stamp-warning-dialog .task-dialog-choice").click();
    await new Promise(resolve => setTimeout(resolve, 0));
    equal(pixels(), before, "Deleted clone source layer changed destination pixels");
    modifier("Control", true);
    cloneTool.onMouseDown(10, 10, MouseButton.LEFT);
    cloneTool.onMouseMove(12, 12);
    cloneTool.onMouseUp(12, 12, MouseButton.LEFT);
    modifier("Control", false);
    cloneTool.onMouseDown(40, 12, MouseButton.LEFT);
    cloneTool.onMouseMove(42, 16);
    cloneTool.onMouseUp(42, 16, MouseButton.LEFT);
    equal(at(40, 12), [0, 0, 255, 255], "Clone stamp did not sample the anchor");
    check(cloneTool.getAnchor().mode === "relative", "Clone source did not become aligned");
    undoRedo(before, pixels(), "Clone stamp");

    phase("spaced recoloring keeps the gaps between separate dabs untouched");
    prepare([[ToolType.RECOLOR, {width: 4, spacing: 400, hardness: 100, tolerance: 0,
        smoothing: false, recolorSampling: "secondary", antialias: false}]]);
    let spacedBefore = pixels();
    app.setActiveToolFromType(ToolType.RECOLOR);
    let spacedRecolor = app.getActiveTool();
    spacedRecolor.onMouseDown(4, 10, MouseButton.LEFT);
    spacedRecolor.onMouseUp(20, 10, MouseButton.LEFT);
    equal(at(4, 10), [255, 0, 0, 255], "Spaced recolor lost its first dab");
    equal(at(12, 10), [0, 0, 255, 255], "Spaced recolor filled the gap between dabs");
    equal(at(20, 10), [255, 0, 0, 255], "Spaced recolor lost its final dab");
    undoRedo(spacedBefore, pixels(), "Spaced recolor");
    app.setActiveToolFromType(ToolType.RECOLOR);
    let offscreenRecolor = app.getActiveTool();
    let beforeOffscreenRecolor = pixels();
    offscreenRecolor.onMouseDown(-100, -100, MouseButton.LEFT);
    offscreenRecolor.onMouseUp(-90, -90, MouseButton.LEFT);
    equal(pixels(), beforeOffscreenRecolor, "Offscreen recolor modified document pixels");
    phase("integer pixel translation and move history");
    for (let resampling of ["nearest", "linear", "multisampleLinear", "anisotropic", "highQualityCubic"]) {
        prepare([[ToolType.MOVE, {resampling}]]);
        surface.context.clearRect(0, 0, 64, 64);
        surface.context.fillStyle = "red";
        surface.context.fillRect(20, 20, 4, 4);
        let before = pixels();
        let selection = workspace.getSelection();
        selection.setContinuation(new Rectangle(16, 16, 32, 32), CombineMode.REPLACE);
        selection.commitContinuation();
        app.setActiveToolFromType(ToolType.MOVE);
        let tool = app.getActiveTool();
        tool.onMouseDown(32, 32, MouseButton.LEFT);
        check(tool.tracking && tool.context.currentMode === MoveToolBaseMode.TRANSLATE,
            "Move did not choose translation");
        tool.onMouseMove(34, 36);
        tool.onMouseUp(34, 36, MouseButton.LEFT);
        DocumentIO.finishActiveTool();
        let expected = new Uint8ClampedArray(before.length);
        for (let y = 0; y < 60; ++y) {
            for (let x = 0; x < 62; ++x) {
                expected.set(before.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4),
                    ((y + 4) * 64 + x + 2) * 4);
            }
        }
        equal(pixels(), expected, "Integer move resampled or left old pixels");
        undoRedo(before, pixels(), "Move " + resampling);
    }

    phase("CPU resampling against independent bilinear reference");
    app.setActiveTool(null);
    let source = Surface.create(2, 2);
    source.context.putImageData(new ImageData(new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 255, 255
    ]), 2, 2), 0, 0);
    let path = new GraphicsPath();
    path.addRectangle(new Rectangle(0, 0, 2, 2));
    let masked = new MaskedSurface(source, path, true);
    let target = Surface.create(8, 8);
    let transform = new Matrix();
    transform.scale(4, 4, MatrixOrder.APPEND);
    for (let gamma of [false, true]) {
        target.context.clearRect(0, 0, 8, 8);
        masked.renderResampled(target, transform, ResamplingAlgorithm.LINEAR, gamma, "high");
        let value = target.context.getImageData(3, 3, 1, 1).data;
        let linear = [0.53125, 0.375, 0.375];
        let expected = linear.map(channel => Math.round(255 * (gamma
            ? (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055)
            : channel)));
        check(expected.every((channel, index) => Math.abs(value[index] - channel) <= 1)
            && value[3] === 255, "Bilinear/gamma reference differs: " + gamma + " " + [...value]);
    }
    for (let sampling of [ResamplingAlgorithm.HIGH_QUALITY_CUBIC,
        ResamplingAlgorithm.MULTISAMPLE_LINEAR, ResamplingAlgorithm.ANISOTROPIC]) {
        target.context.clearRect(0, 0, 8, 8);
        masked.renderResampled(target, transform, sampling, false, "high");
        check(target.context.getImageData(3, 3, 1, 1).data[3] === 255,
            "Resampling made an opaque interior transparent");
    }
    let copy = masked.clone();
    check(copy.surface !== masked.surface && copy.path !== masked.path, "Masked clone shares owned state");
    equal(copy.getSourcePixels().data, masked.getSourcePixels().data, "Masked clone changed source pixels");
    copy.dispose();
    check(masked.surface.width === 2, "Disposing clone destroyed original");
    masked.dispose();
    path.dispose();
    transform.dispose();
    target.dispose();
    source.dispose();
    app.closeDocumentWorkspace(workspace, false);
    return {ok: true};
};
