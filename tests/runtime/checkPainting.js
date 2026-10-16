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

module.exports = async function checkPainting() {
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
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(64, 64);
    let surface = workspace.getActiveLayer().getSurface();
    let history = workspace.getHistory();
    let pixels = () => surface.context.getImageData(0, 0, 64, 64).data;
    let colors = FormRegistry.get("colorsForm");
    colors.setMainColor(new Color(255, 0, 0));
    colors.setSecondaryColor(new Color(0, 0, 255));
    let start = (type, settings = {}, opaque = false) => {
        app.setActiveTool(null);
        workspace.getSelection().reset();
        surface.context.clearRect(0, 0, 64, 64);
        if (opaque) {
            surface.context.fillStyle = "white";
            surface.context.fillRect(0, 0, 64, 64);
        }
        history.clearAll();
        type.resetSettings();
        for (let [key, value] of Object.entries(settings)) {
            type.setSetting(key, value);
        }
        app.setActiveToolFromType(type);
        return app.getActiveTool();
    };
    let roundTrip = (before, after, name) => {
        check(!before.every((value, index) => value === after[index]), name + " did not change pixels");
        let steps = history.undoStack.length;
        check(steps > 0, name + " did not create history");
        for (let index = 0; index < steps; ++index) {
            history.stepBackward();
        }
        equal(pixels(), before, name + " undo lost original pixels");
        for (let index = 0; index < steps; ++index) {
            history.stepForward();
        }
        equal(pixels(), after, name + " redo lost painted pixels");
    };
    let stroke = (tool, button = MouseButton.LEFT, input = null) => {
        check(tool.onMouseDown(8, 8, button, input), "Stroke did not begin");
        check(tool.onMouseMove(36, 28, input), "Stroke did not move");
        check(tool.onMouseUp(36, 28, button, input), "Stroke did not finish");
        if (tool.pending) {
            check(tool.onKeyPress("Enter"), "Pending stroke did not commit");
        }
    };

    phase("brushes and bitmap history");
    for (let type of [ToolType.PENCIL, ToolType.PAINT_BRUSH, ToolType.ERASER]) {
        for (let antialias of [true, false]) {
            let tool = start(type, {width: 5, hardness: 55, smoothing: antialias, antialias},
                type === ToolType.ERASER);
            let before = pixels();
            check(tool.onMouseDown(8, 8, MouseButton.MIDDLE) === false, "Middle button painted");
            stroke(tool, MouseButton.LEFT, {pressure: 0.6, samples: [
                {x: 18, y: 12, pressure: 0.3}, {x: 36, y: 28, pressure: 0.8}
            ]});
            roundTrip(before, pixels(), type.getId() + " " + antialias);
            check(tool.onMouseMove(3, 3) === false, "Inactive stroke continued painting");
            check(tool.onMouseUp(3, 3, MouseButton.RIGHT) === false, "Inactive stroke finished twice");
        }
    }
    let pencil = start(ToolType.PENCIL);
    stroke(pencil);
    equal([...pixels().slice((8 * 64 + 8) * 4, (8 * 64 + 8) * 4 + 4)], [255, 0, 0, 255],
        "Pencil did not paint the exact primary color");

    phase("all built-in and custom shapes");
    let shapes = [
        "rectangle", "ellipse", "roundedRectangle", "triangle", "rightTriangle", "diamond",
        "trapezoid", "parallelogram", "pentagon", "hexagon", "heptagon", "octagon",
        "star3", "star4", "star5", "star6", "blockArrow", "notchedArrow", "pentagonArrow",
        "chevronArrow", "checkMark", "multiply", "heart", "lightningBolt", "gear",
        "rectangularCallout", "roundedCallout", "ellipticalCallout", "cloudCallout",
        ...ShapeCatalog.getCustomGroup().values
    ];
    for (let [index, shape] of shapes.entries()) {
        let tool = start(ToolType.SHAPES, {
            shape, width: index % 2 + 1, drawType: ["outline", "fill", "both"][index % 3],
            antialias: index % 2 === 0, dash: ["solid", "dash", "dot", "dashDot", "dashDotDot"][index % 5]
        });
        let before = pixels();
        stroke(tool, index % 2 === 0 ? MouseButton.LEFT : MouseButton.RIGHT);
        roundTrip(before, pixels(), shape);
        if (ShapeCatalog.has(shape)) {
            check(ShapeCatalog.getIconSource(shape).startsWith("data:image/svg+xml,"),
                "Custom shape icon is missing");
        }
    }
    phase("line caps and curve interpolation");
    for (let curveType of ["spline", "bezier", "polyline"]) {
        for (let cap of ["flat", "round", "arrow", "arrowFilled"]) {
            let tool = start(ToolType.LINE, {curveType, startCap: cap, endCap: cap, width: 3});
            let before = pixels();
            check(tool.onMouseDown(8, 8, MouseButton.LEFT), "Line did not start");
            tool.onMouseMove(36, 28);
            tool.onMouseUp(36, 28, MouseButton.LEFT);
            check(tool.pending && tool.curveControlPoints.length === 2, "Line controls were not created");
            let control = tool.curveControlPoints[0].clone();
            check(tool.onMouseDown(control.x, control.y, MouseButton.LEFT), "Curve control was not picked");
            tool.onMouseMove(control.x + 5, control.y - 3);
            tool.onMouseUp(control.x + 5, control.y - 3, MouseButton.LEFT);
            tool.onKeyPress("Escape");
            roundTrip(before, pixels(), curveType + " " + cap);
        }
    }
    phase("gradient variants");
    for (let gradientType of ["linear", "reflected", "diamond", "radial", "conical", "spiral", "spiralCounter"]) {
        for (let repeatMode of ["none", "wrapped", "reflected"]) {
            let tool = start(ToolType.GRADIENT, {gradientType, repeatMode});
            let before = pixels();
            stroke(tool);
            roundTrip(before, pixels(), gradientType + " " + repeatMode);
        }
    }
    phase("selection geometry and history");
    for (let type of [ToolType.RECTANGLE_SELECT, ToolType.ELLIPSE_SELECT, ToolType.LASSO_SELECT]) {
        let tool = start(type);
        let before = pixels();
        tool.onMouseDown(8, 8, MouseButton.LEFT);
        tool.onMouseMove(32, 8);
        tool.onMouseMove(32, 32);
        await new Promise(resolve => setTimeout(resolve, 60));
        tool.onMouseUp(32, 32, MouseButton.LEFT);
        check(!workspace.getSelection().isEmpty(), "Selection is empty: " + type.getId());
        let bounds = workspace.getSelection().getBounds();
        check(bounds.width > 0 && bounds.height > 0, "Selection has no area");
        check(BitmapEffectEngine.createSelectionMask(64, 64, workspace.getSelection())[20 * 64 + 25] === 255,
            "Selection excludes an interior point");
        equal(pixels(), before, "Selecting changed layer pixels");
        history.stepBackward();
        check(workspace.getSelection().isEmpty(), "Selection undo did not restore empty selection");
        history.stepForward();
        check(!workspace.getSelection().isEmpty(), "Selection redo did not restore selection");
    }

    phase("text editing and history");
    for (let align of ["left", "center", "right"]) {
        let tool = start(ToolType.TEXT, {fontFamily: "monospace", fontSize: 10, fontUnit: "pixels",
            align, bold: true, italic: true, underline: true, strikeout: true});
        let before = pixels();
        check(tool.onMouseDown(32, 10, MouseButton.LEFT), "Text editor did not open");
        tool.editor.value = "Test\npaint.js";
        tool.editor.dispatchEvent(new Event("input", {bubbles: true}));
        check(tool.previewBounds.width > 0 && tool.editor.isConnected, "Text preview is missing");
        tool.editor.setSelectionRange(1, 3);
        tool.editor.dispatchEvent(new Event("select"));
        tool.onMouseDown(40, 24, MouseButton.RIGHT);
        tool.onMouseMove(42, 28);
        tool.onMouseUp(42, 28, MouseButton.RIGHT);
        tool.syncEditorToViewport();
        tool.editor.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
        check(!tool.pending && tool.editor === null, "Finished text retained its editor");
        roundTrip(before, pixels(), "Text " + align);
    }
    app.setActiveTool(null);

    phase("deferred scrolling after item replacement, removal and teardown");
    for (let orientation of [ScrollOrientation.HORIZONTAL, ScrollOrientation.VERTICAL]) {
        let session = new ScrollSession();
        let list = new ScrollList(orientation, "test-scroll-list", session);
        let layers = Array.from({length: 4}, () => new BitmapLayer(workspace, 1, 1));
        list.items = layers.map(layer => new LayerItem(layer));
        list.appendTo(document.body, null);
        Object.assign(list.element.style, {width: "32px", height: "32px", position: "fixed",
            left: "0", top: "0", overflow: "auto"});
        await frame();
        let target = list.items[3];
        let calls = [];
        let scrollTo = list.element.scrollTo.bind(list.element);
        list.element.scrollTo = options => {
            calls.push(options);
            scrollTo(options);
        };
        list.scrollToItem(target);
        let replacement = new LayerItem(layers[3]);
        replacement.appendTo(target.element.parentNode, list);
        target.element.remove();
        target.element = null;
        list.items[3] = replacement;
        await frame();
        check(calls.length === 1, "Deferred scrolling did not resolve replacement by key");
        list.scrollToItem(replacement);
        list.items = [];
        await frame();
        check(calls.length === 1, "Removed item was scrolled");
        list.items = [replacement];
        list.scrollToItem(replacement);
        list.element.remove();
        list.element = null;
        await frame();
        check(calls.length === 1, "Destroyed list was scrolled");
        for (let layer of layers) {
            layer.dispose();
        }
    }
    app.closeDocumentWorkspace(workspace, false);
    return {ok: true};
};
