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
    tool.onActivate();
    let layer = workspace.getActiveLayer();
    let surface = layer.getSurface();
    let history = workspace.getHistory();
    history.clearAll();
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
    tool.onDeactivate();
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
    app.closeDocumentWorkspace(workspace, false);
};
