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

module.exports = async function checkSurfaceTransactions() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let rejects = (operation, pattern) => {
        let failure = null;
        try {
            operation();
        } catch (error) {
            failure = error;
        }
        check(failure !== null && pattern.test(failure.message), "Invalid surface/transaction input was not rejected correctly");
    };
    let equal = (actual, expected, message) => check(actual.length === expected.length
        && actual.every((value, index) => value === expected[index]), message);
    let channels = color => [color.red, color.green, color.blue, color.alpha];
    phase("surface pixel access, subwindows, clipping and disposed-source contracts");
    rejects(() => new Surface({}), /HTMLCanvasElement/);
    let source = Surface.create(8, 8, {willReadFrequently: true});
    let target = Surface.create(8, 8);
    source.clear(Color.fromRGBA(255, 0, 0, 255));
    let color = Color.fromRGBA(30, 60, 90, 255);
    source.setColorAt(2, 3, color);
    equal(channels(source.getColorAt(2, 3)), channels(color), "Surface.setColorAt did not write the provided Color channels");
    for (let operation of ["setColorAt", "getColorAt"]) {
        for (let point of [[-1, 0], [8, 0], [0, -1], [0, 8]]) {
            rejects(() => source[operation](...point, color), /out of bounds/);
        }
    }
    check(source.getCanvas() === source.canvas && source.getContext() === source.context, "Surface accessors lost their backing store");
    let window = source.createWindowFromRectangle(new Rectangle(1, 2, 2, 2));
    equal(channels(window.getColorAt(1, 1)), channels(color), "Subwindow copied the wrong source origin");
    rejects(() => source.createWindow(0, 0, 2, 0), /windowHeight/);
    rejects(() => source.createWindow(20, 20, 2, 2), /bounds parameters/);
    rejects(() => source.createWindow(0, 0, 0, 2), /bounds parameters/);
    target.copySurfaceRectangle(source, new Rectangle(0, 0, 8, 8));
    equal(channels(target.getColorAt(2, 3)), channels(color), "Rectangle surface copy shifted pixels");
    target.copySurfaceRectangle(source, new Rectangle(20, 20, 2, 2));
    equal(channels(target.getColorAt(2, 3)), channels(color), "Empty rectangle surface copy changed pixels");
    source.clearRegion(1, 1, 2, 2);
    target.copyRegionFromExact(source, new Rectangle(1.1, 1.1, 1.8, 1.8));
    check(target.getColorAt(1, 1).alpha === 0 && target.getColorAt(0, 0).alpha === 255, "Exact ROI copy cleared pixels outside its bounds");
    target.copyRegionFrom(source, new Rectangle(20, 20, 2, 2));
    target.copyRegionFromExact(source, new Rectangle(20, 20, 2, 2));
    let clone = source.clone();
    equal(channels(clone.getColorAt(2, 3)), channels(color), "Surface clone lost nonuniform pixels");
    phase("default surface compositing and standalone viewport border colors");
    target.clear(Color.fromRGBA(0, 0, 255, 255));
    source.render(new RenderArgs(target), new Rectangle(2, 3, 1, 1));
    equal(channels(target.getColorAt(2, 3)), channels(color), "Default source-over did not copy opaque source pixels");
    equal(channels(target.getColorAt(0, 0)), [0, 0, 255, 255], "Default surface render escaped its clipping rectangle");
    let borderSource = Surface.create(4, 4);
    let borderTarget = Surface.create(10, 10);
    borderSource.clear(Color.fromRGBA(0, 255, 0, 255));
    let renderer = new SurfaceBoxBaseRenderer({getSurface: () => borderSource,
        getApp: () => ({getActiveDocumentWorkspace: () => null})});
    let previous = new Map(["canvas.customBorder", "canvas.borderColor", "canvas.dropShadow"]
        .map(key => [key, AppSettingsStore.get(key)]));
    let rootStyle = document.documentElement.style;
    let previousOutline = rootStyle.getPropertyValue("--canvas-outline-color");
    try {
        AppSettingsStore.set("canvas.dropShadow", false);
        for (let [custom, css, expected] of [[true, "#abcdef", [18, 52, 86, 255]],
            [false, " ", [80, 80, 80, 255]]]) {
            AppSettingsStore.set("canvas.customBorder", custom);
            AppSettingsStore.set("canvas.borderColor", "#123456");
            rootStyle.setProperty("--canvas-outline-color", css);
            renderer.render(borderTarget, new Rectangle(2.5, 2.5, 4, 4));
            equal(channels(borderTarget.getColorAt(2, 4)), expected, "Standalone canvas border used the wrong color");
            equal(channels(borderTarget.getColorAt(4, 4)), [0, 255, 0, 255], "Standalone renderer changed image pixels");
            check(borderTarget.getColorAt(0, 0).alpha === 0, "Standalone renderer painted outside the viewport");
        }
    } finally {
        for (let [key, value] of previous) {
            AppSettingsStore.set(key, value);
        }
        if (previousOutline === "") {
            rootStyle.removeProperty("--canvas-outline-color");
        } else {
            rootStyle.setProperty("--canvas-outline-color", previousOutline);
        }
        borderSource.dispose();
        borderTarget.dispose();
        renderer.dispose();
    }
    let sourceCanvas = source.getCanvas();
    source.dispose();
    source.dispose();
    check(sourceCanvas.width === 0 && sourceCanvas.height === 0 && source.context === null, "Surface disposal retained its pixel backing");
    for (let method of ["copySurface", "copySurfaceRectangle", "copyRegionFrom", "copyRegionFromExact"]) {
        rejects(() => target[method](source, new Rectangle(0, 0, 2, 2)), /disposed/);
        rejects(() => source[method](target, new Rectangle(0, 0, 2, 2)), /disposed/);
    }
    rejects(() => source.createWindow(0, 0, 2, 2), /disposed/);
    window.dispose();
    target.dispose();
    clone.dispose();

    phase("custom layer blends use exact alpha compositing and clipped bounds");
    let foreground = Surface.create(1, 1, {willReadFrequently: true});
    let background = Surface.create(1, 1, {willReadFrequently: true});
    for (let mode of ["reflect", "glow", "negation", "xor", "unknown"]) {
        for (let sourceAlpha of [0, 128, 255]) {
            for (let targetAlpha of [0, 128, 255]) {
                foreground.clear(Color.fromRGBA(80, 255, 0, sourceAlpha));
                background.clear(Color.fromRGBA(100, 0, 255, targetAlpha));
                let front = channels(foreground.getColorAt(0, 0));
                let back = channels(background.getColorAt(0, 0));
                let sa = front[3] / 255 * 0.5;
                let ba = back[3] / 255;
                let alpha = sa + ba * (1 - sa);
                foreground.render(new RenderArgs(background), new Rectangle(0, 0, 1, 1), 0.5, {canvasOperation: null, value: mode});
                let actual = channels(background.getColorAt(0, 0));
                check(Math.abs(actual[3] - Math.round(alpha * 255)) <= 1, "Custom layer blend changed its alpha equation");
                if (sourceAlpha === 0) {
                    equal(actual, back, "Zero-alpha custom blend changed its backdrop");
                } else if (alpha > 0) {
                    for (let channel = 0; channel < 3; ++channel) {
                        let b = back[channel], f = front[channel];
                        let blended = mode === "reflect" ? (f === 255 ? 255 : Math.min(255, b * b / (255 - f)))
                            : mode === "glow" ? (b === 255 ? 255 : Math.min(255, f * f / (255 - b)))
                            : mode === "negation" ? 255 - Math.abs(255 - b - f)
                            : mode === "xor" ? b ^ f : f;
                        let expected = (sa * (1 - ba) * f + sa * ba * blended + (1 - sa) * ba * b) / alpha;
                        check(Math.abs(actual[channel] - expected) <= 3, "Custom layer blend differs from its premultiplied oracle: " + mode);
                    }
                }
            }
        }
    }
    foreground.renderCustomBlend(background.context, new Rectangle(10, 10, 1, 1), 1, "xor");
    foreground.dispose();
    background.dispose();

    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(768, 8);
    app.setActiveTool(null);
    let tool = new Tool(ToolType.PENCIL);
    let hiddenRgb = new Uint8ClampedArray([200, 50, 80, 0]);
    check(tool.matchesColorTolerance(hiddenRgb, 0, [0, 0, 0, 0], 0, true)
        && !tool.matchesColorTolerance(hiddenRgb, 0, [0, 0, 0, 0], 0, false),
        "Zero-alpha tolerance did not respect premultiplied versus straight color semantics");
    tool.onActivate();
    let layer = workspace.getActiveLayer();
    let surface = layer.getSurface();
    let history = workspace.getHistory();
    history.clearAll();
    phase("abstract move and selection hooks fail explicitly without changing history");
    let moveBase = new MoveToolBase(ToolType.MOVE);
    for (let hook of ["onLift", "onDrop", "preRender", "render", "pushContextHistoryMemento"]) {
        rejects(() => moveBase[hook](), /Not implemented/);
    }
    rejects(() => moveBase.getEdgeVector("unknown-edge"), /Invalid enum/);
    let selectionBase = new SelectionTool(ToolType.RECTANGLE_SELECT);
    check(selectionBase.mustMoveForEmit(), "Default selection contract emits without a pointer movement");
    for (let hook of ["getCursorImgDown", "getCursorImgUp", "getCursorImgUpPlus", "getCursorImgUpMinus"]) {
        rejects(() => selectionBase[hook](), /Not implemented/);
    }
    check(history.undoStack.length === 0 && workspace.getSelection().isEmpty(),
        "Unimplemented abstract hooks changed selection or history");
    phase("base tool input, workspace and missing-color-form contracts");
    check(tool.isActive() && tool.getType() === ToolType.PENCIL && !tool.usesContinuousPointerCoordinates(),
        "Base tool activation/type/coordinate contract changed");
    check(tool.getName() === ToolType.PENCIL.getName() && tool.getImage() === ToolType.PENCIL.getIconSrc(),
        "Base tool did not expose its configured name/icon");
    check(tool.getDocumentWorkspace() === workspace && tool.getSelection() === workspace.getSelection()
        && tool.getSurfaceBox() === workspace.getSurfaceBox() && tool.getActiveLayer() === layer,
    "Base tool lost its active workspace, selection, surface box or layer");
    tool.setActiveLayerIndex(0);
    tool.setActiveLayer(layer);
    check(tool.getActiveLayerIndex() === 0 && workspace.getActiveLayer() === layer, "Base tool layer setters selected a different layer");
    check(!tool.onKeyPress("Escape") && !tool.onMouseDown(1, 2, MouseButton.LEFT)
        && !tool.onMouseMove(1, 2) && !tool.onMouseUp(1, 2, MouseButton.LEFT),
    "Base tool consumed unimplemented input");
    tool.onModifierKeysChanged();
    ToolType.PENCIL.setSetting("blendMode", "unrecognized");
    check(tool.getCompositeOperation() === "source-over", "Unknown paint blend lost its normal-compositing fallback");
    ToolType.PENCIL.setSetting("blendMode", "normal");
    let colorForm = FormRegistry.get("colorsForm");
    FormRegistry.unregister("colorsForm");
    try {
        equal(channels(tool.getColor()), [0, 0, 0, 255], "Missing color form lost the primary black fallback");
        equal(channels(tool.getColor(MouseButton.RIGHT)), [255, 255, 255, 255], "Missing color form lost the secondary white fallback");
    } finally {
        FormRegistry.forms.colorsForm = colorForm;
    }
    let pickedColor = tool.getColor();
    check(pickedColor !== colorForm.mainColor, "Base tool returned the mutable color-form instance");
    equal(channels(pickedColor), channels(colorForm.mainColor), "Base tool color copy changed its channels");
    phase("software paint blending agrees with native Canvas for supported separable modes");
    let canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    let context = canvas.getContext("2d", {willReadFrequently: true});
    let blendMismatches = [];
    for (let [mode, operation] of [
        ["normal", "source-over"], ["multiply", "multiply"], ["screen", "screen"], ["overlay", "overlay"],
        ["darken", "darken"], ["lighten", "lighten"], ["colorDodge", "color-dodge"], ["colorBurn", "color-burn"],
        ["hardLight", "hard-light"], ["softLight", "soft-light"], ["difference", "difference"], ["exclusion", "exclusion"]
    ]) {
        ToolType.PENCIL.setSetting("blendMode", mode);
        check(tool.getCompositeOperation() === operation, "Tool blend operation has wrong Canvas mapping");
        for (let back of [0, 32, 127, 200, 255]) {
            for (let front of [0, 32, 127, 200, 255]) {
                let data = new Uint8ClampedArray([back, back, back, 255]);
                tool.blendPixel(data, 0, Color.fromRGBA(front, front, front, 255));
                context.globalCompositeOperation = "copy";
                context.fillStyle = `rgb(${back},${back},${back})`;
                context.fillRect(0, 0, 1, 1);
                context.globalCompositeOperation = operation;
                context.fillStyle = `rgb(${front},${front},${front})`;
                context.fillRect(0, 0, 1, 1);
                let expected = context.getImageData(0, 0, 1, 1).data;
                if (!data.every((value, index) => Math.abs(value - expected[index]) <= 1)) {
                    blendMismatches.push({mode, back, front, software: data[0], canvas: expected[0]});
                }
            }
        }
    }
    check(blendMismatches.length === 0, "Software blending differs from Canvas: " + JSON.stringify(blendMismatches));
    phase("software hue, saturation, color and luminosity match native colored compositing");
    let colorMismatches = [];
    let mismatchCount = 0;
    let palette = [[0, 0, 0], [255, 255, 255], [50, 100, 150], [200, 100, 20], [40, 210, 90]];
    for (let mode of ["hue", "saturation", "color", "luminosity"]) {
        for (let back of palette) {
            for (let front of palette) {
                for (let [backAlpha, frontAlpha] of [[255, 255], [255, 128], [128, 255], [64, 128], [0, 255], [255, 0], [0, 0]]) {
                    let data = new Uint8ClampedArray([...back, backAlpha]);
                    tool.blendPixel(data, 0, Color.fromRGBA(...front, frontAlpha), mode);
                    context.globalCompositeOperation = "copy";
                    context.fillStyle = `rgba(${back.join(",")},${backAlpha / 255})`;
                    context.fillRect(0, 0, 1, 1);
                    context.globalCompositeOperation = mode;
                    context.fillStyle = `rgba(${front.join(",")},${frontAlpha / 255})`;
                    context.fillRect(0, 0, 1, 1);
                    let expected = context.getImageData(0, 0, 1, 1).data;
                    if (!data.every((value, index) => Math.abs(value - expected[index]) <= 2)) {
                        ++mismatchCount;
                        if (colorMismatches.length < 8) {
                            colorMismatches.push({mode, back, front, backAlpha, frontAlpha,
                                software: Array.from(data), canvas: Array.from(expected)});
                        }
                    }
                }
            }
        }
    }
    check(mismatchCount === 0, "Nonseparable software/Canvas mismatch count " + mismatchCount + ": " + JSON.stringify(colorMismatches));
    ToolType.PENCIL.setSetting("blendMode", "unknown");
    check(tool.getCompositeOperation() === "source-over", "Unknown blending mode lost its normal fallback");
    let transparent = new Uint8ClampedArray(4);
    tool.blendPixel(transparent, 0, Color.fromRGBA(20, 30, 40, 0), "normal");
    equal(transparent, new Uint8ClampedArray(4), "Blending transparent pixels produced hidden RGB");
    phase("all hatch tiles retain periodicity and match Canvas patterns");
    let styles = ["horizontal", "vertical", "forwardDiagonal", "backwardDiagonal", "cross", "diagonalCross",
        "lightDownwardDiagonal", "lightUpwardDiagonal", "darkDownwardDiagonal", "darkUpwardDiagonal",
        "wideDownwardDiagonal", "wideUpwardDiagonal", "lightHorizontal", "lightVertical", "narrowHorizontal",
        "narrowVertical", "darkHorizontal", "darkVertical", "dashedDownwardDiagonal", "dashedUpwardDiagonal",
        "dashedHorizontal", "dashedVertical", "smallConfetti", "largeConfetti", "zigZag", "wave", "diagonalBrick",
        "horizontalBrick", "weave", "plaid", "divot", "dottedGrid", "dottedDiamond", "shingle", "trellis",
        "sphere", "smallGrid", "smallCheckerBoard", "largeCheckerBoard", "outlinedDiamond", "solidDiamond",
        "percent0", "percent25", "percent50", "percent100"];
    let counts = {horizontal: 16, vertical: 16, cross: 28, lightHorizontal: 8, lightVertical: 8,
        darkHorizontal: 32, darkVertical: 32, smallGrid: 28, smallCheckerBoard: 32, largeCheckerBoard: 32,
        outlinedDiamond: 12, solidDiamond: 25, percent0: 0, percent25: 16, percent50: 32, percent100: 64};
    let tile = document.createElement("canvas");
    tile.width = 8;
    tile.height = 8;
    let tileContext = tile.getContext("2d", {willReadFrequently: true});
    let red = Color.fromRGBA(255, 0, 0, 255), blue = Color.fromRGBA(0, 0, 255, 255);
    for (let style of styles) {
        ToolType.PENCIL.setSetting("fillStyle", style);
        tileContext.fillStyle = tool.createFillStyle(tileContext, red, blue);
        tileContext.fillRect(0, 0, 8, 8);
        let pixels = tileContext.getImageData(0, 0, 8, 8).data;
        let count = 0;
        for (let y = 0; y < 8; ++y) {
            for (let x = 0; x < 8; ++x) {
                let foreground = tool.isHatchForeground(x, y, style);
                count += Number(foreground);
                check(tool.isHatchForeground(x - 8, y + 8, style) === foreground, "Hatch tile is not periodic: " + style);
                check(pixels[(y * 8 + x) * 4] === (foreground ? 255 : 0), "Canvas hatch disagrees with its pixel sampler: " + style);
                check(tool.getFillColorAt(x, y, red, blue) === (foreground ? red : blue), "Fill-color lookup disagrees with its hatch tile");
            }
        }
        if (Object.hasOwn(counts, style)) {
            check(count === counts[style], "Hatch has an incorrect exact foreground count: " + style);
        }
    }
    ToolType.PENCIL.setSetting("fillStyle", "solid");
    check(tool.createFillStyle(tileContext, red, blue) === red.toHex() && tool.getFillColorAt(0, 0, red, blue) === red,
        "Solid fill did not retain its foreground color");

    phase("sparse tile snapshots, complete cancellation and bitmap history");
    surface.clear(Color.fromRGBA(20, 40, 60, 255));
    let before = surface.context.getImageData(0, 0, 768, 8).data;
    let full = new Rectangle(0, 0, 768, 8);
    check(tool.takeBitmapTransactionMemento() === null && !tool.commitBitmapTransaction() && !tool.cancelBitmapTransaction(),
        "Inactive bitmap transaction produced history or cancellation");
    rejects(() => tool.updateBitmapTransaction(full, () => {}), /No bitmap transaction/);
    tool.markBitmapTransactionDirty(full);
    for (let commit of [false, true]) {
        tool.beginBitmapTransaction(false);
        rejects(() => tool.beginBitmapTransaction(), /already active/);
        tool.saveRegion(null, new Rectangle(256, 0, 256, 8));
        tool.saveRegion(null, full);
        check(tool.bitmapTransaction.savedRectangles.length === 3, "Sparse save did not split its previously saved middle tile");
        surface.context.fillStyle = "red";
        surface.context.fillRect(0, 0, 768, 8);
        tool.markBitmapTransactionDirty(full);
        if (commit) {
            let after = surface.context.getImageData(0, 0, 768, 8).data;
            check(tool.commitBitmapTransaction(), "Sparse transaction did not produce a memento");
            history.stepBackward();
            equal(surface.context.getImageData(0, 0, 768, 8).data, before, "Sparse transaction undo lost original tiles");
            history.stepForward();
            equal(surface.context.getImageData(0, 0, 768, 8).data, after, "Sparse transaction redo lost changed tiles");
            history.stepBackward();
        } else {
            check(tool.cancelBitmapTransaction(), "Sparse transaction did not cancel");
            equal(surface.context.getImageData(0, 0, 768, 8).data, before, "Sparse transaction cancellation lost original tiles");
        }
    }
    tool.beginBitmapTransaction();
    tool.updateBitmapTransaction(new Rectangle(0, 0, 2, 2), restored => restored.context.clearRect(0, 0, 2, 2));
    tool.updateBitmapTransaction(new Rectangle(2, 0, 2, 2), restored => restored.context.clearRect(2, 0, 2, 2));
    check(surface.getColorAt(0, 0).alpha === 255 && surface.getColorAt(2, 0).alpha === 0, "Moving transaction preview did not restore its previous ROI");
    tool.cancelBitmapTransaction();
    equal(surface.context.getImageData(0, 0, 768, 8).data, before, "Full-snapshot transaction cancellation lost pixels");
    tool.beginBitmapTransaction();
    tool.markBitmapTransactionDirty(new Rectangle(1000, 1000, 2, 2));
    check(!tool.commitBitmapTransaction(), "Offscreen-only transaction created history");
    let region = Region.fromRectangle(new Rectangle(0, 0, 2, 2));
    tool.saveRegion(region, region.getBounds());
    surface.context.clearRect(0, 0, 2, 2);
    tool.restoreSavedRegion();
    check(surface.getColorAt(0, 0).alpha === 255 && tool.savedRegion === null, "Saved-region restore lost its source pixels or retained state");
    region.dispose();
    phase("saved-region replacement, offscreen saves and deactivation rollback");
    tool.savedTiles = null;
    tool.saveRegion(null, new Rectangle(1000, 1000, 2, 2));
    check(tool.savedTiles === null, "Offscreen save allocated a tile mask");
    let firstRegion = Region.fromRectangle(new Rectangle(0, 0, 768, 8));
    let secondRegion = Region.fromRectangle(new Rectangle(256, 0, 256, 8));
    tool.saveRegion(firstRegion, firstRegion.getBounds());
    check(tool.savedRegion !== firstRegion, "Saved region retained caller-owned geometry");
    tool.saveRegion(secondRegion, secondRegion.getBounds());
    check(tool.savedRegion.getBounds().width === 256, "Replacing a saved region kept its previous extent");
    tool.beginBitmapTransaction();
    check(tool.savedRegion === null, "Beginning a transaction retained a stale saved region");
    tool.saveRegion(secondRegion, secondRegion.getBounds());
    tool.updateBitmapTransaction(new Rectangle(256, 0, 256, 8), destination => destination.context.clearRect(256, 0, 256, 8));
    tool.onDeactivate();
    equal(surface.context.getImageData(0, 0, 768, 8).data, before, "Deactivation did not roll back the active bitmap preview");
    check(tool.bitmapTransaction === null && tool.savedRegion === null && tool.savedTiles === null,
        "Deactivation retained bitmap transaction state");
    firstRegion.dispose();
    secondRegion.dispose();
    check(!tool.isActive(), "Deactivated base tool retained its active state");
    phase("actual paint-bucket dodge/burn boundary pixels");
    for (let [mode, backdrop, paint, expected] of [
        ["colorDodge", 0, 255, 0], ["colorBurn", 255, 0, 255]
    ]) {
        app.setActiveTool(null);
        ToolType.PAINT_BUCKET.resetSettings();
        ToolType.PAINT_BUCKET.setSetting("blendMode", mode);
        ToolType.PAINT_BUCKET.setSetting("antialias", false);
        surface.clear(Color.fromRGBA(backdrop, backdrop, backdrop, 255));
        FormRegistry.get("colorsForm").setMainColor(Color.fromRGBA(paint, paint, paint, 255));
        app.setActiveToolFromType(ToolType.PAINT_BUCKET);
        check(app.getActiveTool().onMouseDown(2, 2, MouseButton.LEFT), "Boundary bucket fill did not start");
        equal(channels(surface.getColorAt(2, 2)), [expected, expected, expected, 255],
            "Actual paint bucket disagrees with Canvas at its " + mode + " boundary");
    }
    phase("actual nonseparable bucket fills preserve selection clipping and pixel-exact undo/redo");
    for (let mode of ["hue", "saturation", "color", "luminosity"]) {
        for (let backdrop of [[0, 0, 0, 255], [50, 100, 150, 255], [200, 100, 20, 128], [40, 210, 90, 64], [255, 255, 255, 255], [0, 0, 0, 0]]) {
            for (let paint of [[200, 100, 20, 255], [40, 210, 90, 128], [255, 255, 255, 0]]) {
                app.setActiveTool(null);
                workspace.getSelection().reset();
                workspace.getSelection().setContinuation(new Rectangle(1, 1, 4, 4), CombineMode.REPLACE);
                workspace.getSelection().commitContinuation();
                history.clearAll();
                ToolType.PAINT_BUCKET.resetSettings();
                ToolType.PAINT_BUCKET.setSetting("blendMode", mode);
                ToolType.PAINT_BUCKET.setSetting("antialias", false);
                ToolType.PAINT_BUCKET.setSetting("renderingQuality", "aliased");
                surface.clear(Color.fromRGBA(...backdrop));
                let before = surface.context.getImageData(0, 0, 768, 8).data;
                FormRegistry.get("colorsForm").setMainColor(Color.fromRGBA(...paint));
                context.globalCompositeOperation = "copy";
                context.fillStyle = `rgba(${backdrop.slice(0, 3).join(",")},${backdrop[3] / 255})`;
                context.fillRect(0, 0, 1, 1);
                context.globalCompositeOperation = mode;
                context.fillStyle = `rgba(${paint.slice(0, 3).join(",")},${paint[3] / 255})`;
                context.fillRect(0, 0, 1, 1);
                let expected = context.getImageData(0, 0, 1, 1).data;
                app.setActiveToolFromType(ToolType.PAINT_BUCKET);
                check(app.getActiveTool().onMouseDown(2, 2, MouseButton.LEFT), "Nonseparable bucket fill did not start: " + mode);
                app.setActiveTool(null);
                let after = surface.context.getImageData(0, 0, 768, 8).data;
                for (let y = 0; y < 8; ++y) {
                    for (let x = 0; x < 768; ++x) {
                        let offset = (y * 768 + x) * 4;
                        let selected = x >= 1 && x < 5 && y >= 1 && y < 5;
                        check(after.slice(offset, offset + 4).every((value, channel) => selected
                            ? Math.abs(value - expected[channel]) <= 2 : value === before[offset + channel]),
                        "Actual " + mode + " fill differs from Canvas or changed an unselected pixel");
                    }
                }
                if (history.undoStack.length > 0) {
                    history.stepBackward();
                    equal(surface.context.getImageData(0, 0, 768, 8).data, before, "Nonseparable bucket undo did not restore exact source pixels");
                    history.stepForward();
                    equal(surface.context.getImageData(0, 0, 768, 8).data, after, "Nonseparable bucket redo did not restore exact filled pixels");
                }
            }
        }
    }
    app.closeDocumentWorkspace(workspace, false);
};
