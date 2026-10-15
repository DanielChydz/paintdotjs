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

module.exports = async function checkPendingSelections() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let near = (actual, expected, message) => check(Math.abs(actual - expected) < 0.01,
        message + ": " + actual + " != " + expected);
    let equalBytes = (actual, expected, message) => check(actual.length === expected.length
        && actual.every((value, index) => value === expected[index]), message);
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(128, 128);
    workspace.setZoom(4);
    let surface = workspace.getActiveLayer().getSurface();
    let selection = workspace.getSelection();
    let history = workspace.getHistory();
    let pixels = () => surface.context.getImageData(0, 0, 128, 128).data;
    let reset = (type, settings = {}) => {
        app.setActiveTool(null);
        selection.reset();
        surface.clear();
        history.clearAll();
        app.shiftKeyDown = false;
        app.altKeyDown = false;
        app.controlKeyDown = false;
        Object.assign(type.settings, settings);
        app.setActiveToolFromType(type);
        return app.getActiveTool();
    };
    let draw = (type = ToolType.SHAPES) => {
        let tool = reset(type, {shape: "rectangle", drawType: "fill", width: 2});
        tool.onMouseDown(32, 40, MouseButton.LEFT);
        tool.onMouseMove(72, 60);
        tool.onMouseUp(72, 60, MouseButton.LEFT);
        check(tool.pending, "Drawing did not remain editable");
        return tool;
    };
    let roundTripEdit = (before, after, label) => {
        check(after.some((value, index) => value !== before[index]), label + " did not change pixels");
        check(history.undoStack.length === 2, label + " did not record one edit");
        history.stepBackward();
        check(app.getActiveTool().pending, label + " undo discarded editable state");
        equalBytes(pixels(), before, label + " undo differs");
        history.stepForward();
        equalBytes(pixels(), after, label + " redo differs");
    };

    phase("pending shape scaling, translation, rotation and reversible edit state");
    let edges = [
        MoveToolBaseEdge.TOP_LEFT, MoveToolBaseEdge.TOP, MoveToolBaseEdge.TOP_RIGHT,
        MoveToolBaseEdge.RIGHT, MoveToolBaseEdge.BOTTOM_RIGHT, MoveToolBaseEdge.BOTTOM,
        MoveToolBaseEdge.BOTTOM_LEFT, MoveToolBaseEdge.LEFT
    ];
    for (let edge of edges) {
        let stationary = draw();
        let stationaryPixels = pixels();
        let point = stationary.moveNubs[edge].getTransformedLocation();
        stationary.onMouseDown(point.x + 0.4, point.y + 0.4, MouseButton.LEFT);
        stationary.onMouseUp(point.x + 0.4, point.y + 0.4, MouseButton.LEFT);
        near(stationary.startPoint.x, 32, "Stationary handle changed the shape start x");
        near(stationary.startPoint.y, 40, "Stationary handle changed the shape start y");
        near(stationary.endPoint.x, 72, "Stationary handle changed the shape end x");
        near(stationary.endPoint.y, 60, "Stationary handle changed the shape end y");
        equalBytes(pixels(), stationaryPixels, "Stationary handle changed pixels");
    }
    for (let shift of [false, true]) {
        for (let edge of edges) {
            let tool = draw();
            let before = pixels();
            app.shiftKeyDown = shift;
            let point = tool.moveNubs[edge].getTransformedLocation();
            let direction = MoveToolBase.prototype.getEdgeVector.call(tool, edge);
            let target = new Point(point.x + direction.x * 10, point.y + direction.y * 9);
            tool.onMouseMove(point.x, point.y);
            tool.onMouseDown(point.x, point.y, MouseButton.LEFT);
            check(tool.interactionMode === MoveToolBaseMode.SCALE, "Pending handle did not scale");
            tool.onMouseMove(target.x, target.y);
            tool.onMouseUp(target.x, target.y, MouseButton.LEFT);
            let corner = direction.x !== 0 && direction.y !== 0;
            near(tool.endPoint.x - tool.startPoint.x, shift && corner ? 58 : direction.x === 0 ? 40 : 50,
                "Pending scale width");
            near(tool.endPoint.y - tool.startPoint.y, direction.y === 0 ? 20 : 29,
                "Pending scale height");
            roundTripEdit(before, pixels(), "Scale " + edge + "/" + shift);
        }
    }
    phase("pending shape hover identifies the padded rotation region");
    let hovered = draw();
    hovered.onMouseMove(52, 36);
    check(hovered.rotateIndicator.isVisible() && app.cursorState.value === "hand_open_cursor",
        "Pending shape hover did not advertise the padded rotation region");
    hovered.onMouseMove(0, 0);
    check(!hovered.rotateIndicator.isVisible() && app.cursorState.value === "crosshair",
        "Leaving the pending shape retained its rotation indicator");
    phase("collapsed shape transforms remain finite and cannot be picked through an inverse");
    let collapsed = draw();
    collapsed.shapeTransform.scale(0, 0);
    collapsed.renderPreview();
    check(!collapsed.hitTestPendingShape(new Point(0, 0)), "Singular shape transform was treated as pickable");
    collapsed.cancelPending();
    check(pixels().every(value => value === 0), "Canceling a collapsed shape retained preview pixels");

    phase("pending shape history works when the optional color form is absent");
    app.setActiveTool(null);
    let optionalColors = FormRegistry.get("colorsForm");
    FormRegistry.unregister("colorsForm");
    try {
        let monochrome = draw();
        let monochromePixels = pixels();
        check(monochrome.colorsForm === null && monochrome.capturePendingState().colors === null
            && surface.context.getImageData(50, 50, 1, 1).data[3] === 255
            && surface.context.getImageData(50, 50, 1, 1).data[0] === 0,
        "Absent color form did not use opaque black shape defaults");
        monochrome.commitPending();
        history.stepBackward();
        check(app.getActiveTool().pending && app.getActiveTool().restoredColors === null,
            "Undoing monochrome shape commit invented a saved color form state");
        equalBytes(pixels(), monochromePixels, "Monochrome shape undo changed its pixels");
        history.stepForward();
        equalBytes(pixels(), monochromePixels, "Monochrome shape redo changed its pixels");
    } finally {
        app.setActiveTool(null);
        FormRegistry.forms.colorsForm = optionalColors;
    }
    let tool = draw();
    let before = pixels();
    tool.onMouseMove(52, 50);
    tool.onMouseDown(52, 50, MouseButton.LEFT);
    check(tool.interactionMode === MoveToolBaseMode.TRANSLATE, "Pending shape did not translate");
    tool.onMouseMove(62.2, 57.3);
    tool.onMouseUp(62.2, 57.3, MouseButton.LEFT);
    let moved = Utility.transformOnePoint(tool.shapeTransform, tool.startPoint);
    near(moved.x, 42, "Translation did not snap x");
    near(moved.y, 47, "Translation did not snap y");
    roundTripEdit(before, pixels(), "Translation");
    tool = draw();
    tool.shapeTransform.rotateAt(30, new Point(52.5, 50.5));
    tool.shapeTransform.translate(8, 6);
    tool.renderPreview();
    MoveToolBase.prototype.positionNubs.call(tool, MoveToolBaseMode.TRANSLATE);
    before = pixels();
    let transformedHandle = tool.moveNubs[MoveToolBaseEdge.BOTTOM_RIGHT].getTransformedLocation();
    let transformedDelta = Utility.transformOneVector(tool.shapeTransform, new Point(10, 9));
    tool.onMouseDown(transformedHandle.x + 0.3, transformedHandle.y + 0.2, MouseButton.LEFT);
    tool.onMouseMove(transformedHandle.x + 0.3 + transformedDelta.x,
        transformedHandle.y + 0.2 + transformedDelta.y);
    tool.onMouseUp(transformedHandle.x + 0.3 + transformedDelta.x,
        transformedHandle.y + 0.2 + transformedDelta.y, MouseButton.LEFT);
    near(tool.endPoint.x, 82, "Transformed scaling lost local x displacement");
    near(tool.endPoint.y, 69, "Transformed scaling lost local y displacement");
    roundTripEdit(before, pixels(), "Transformed scaling with off-center press");
    for (let shift of [false, true]) {
        tool = draw();
        before = pixels();
        app.shiftKeyDown = shift;
        tool.onMouseDown(72.5, 50.5, MouseButton.RIGHT);
        check(tool.interactionMode === MoveToolBaseMode.ROTATE, "Pending shape did not rotate");
        let angle = shift ? 37 : 60;
        let target = new Point(52.5 + 20 * Math.cos(angle * Math.PI / 180),
            50.5 + 20 * Math.sin(angle * Math.PI / 180));
        tool.onMouseMove(target.x, target.y);
        tool.onMouseUp(target.x, target.y, MouseButton.RIGHT);
        near(Utility.getAngleOfTransform(tool.shapeTransform), shift ? 30 : angle, "Pending rotation angle");
        roundTripEdit(before, pixels(), "Rotation " + shift);
    }

    phase("line path-property handles and transformed gradient endpoints");
    for (let index = 0; index < 4; ++index) {
        tool = draw(ToolType.LINE);
        before = pixels();
        let point = tool.curveNubs[index].getTransformedLocation();
        tool.onMouseMove(point.x, point.y);
        tool.onMouseDown(point.x, point.y, MouseButton.LEFT);
        check(tool.interactionMode === "curve" && tool.curveControlIndex === index,
            "Curve handle selected the wrong property");
        let target = new Point(point.x + 3.1, point.y + 7.1);
        tool.onMouseMove(target.x, target.y);
        tool.onMouseUp(target.x, target.y, MouseButton.LEFT);
        let edited = [tool.startPoint, ...tool.curveControlPoints, tool.endPoint][index];
        near(edited.x, Math.round(target.x), "Curve property x");
        near(edited.y, Math.round(target.y), "Curve property y");
        roundTripEdit(before, pixels(), "Curve point " + index);
    }
    for (let index = 0; index < 2; ++index) {
        tool = draw(ToolType.GRADIENT);
        tool.shapeTransform.translate(8, 6);
        tool.renderPreview();
        tool.positionGradientNubs();
        before = pixels();
        let point = tool.gradientNubs[index].getTransformedLocation();
        tool.onMouseMove(point.x, point.y);
        tool.onMouseDown(point.x, point.y, MouseButton.LEFT);
        check(tool.interactionMode === "gradientPoint" && tool.gradientControlIndex === index,
            "Gradient handle selected the wrong endpoint");
        let target = new Point(point.x + 5.2, point.y - 3.2);
        tool.onMouseMove(target.x, target.y);
        tool.onMouseUp(target.x, target.y, MouseButton.LEFT);
        let edited = index === 0 ? tool.startPoint : tool.endPoint;
        near(edited.x, Math.round(target.x - 8), "Gradient inverse transform x");
        near(edited.y, Math.round(target.y - 6), "Gradient inverse transform y");
        roundTripEdit(before, pixels(), "Gradient endpoint " + index);
    }

    phase("aliased rectangles, constrained drawing, restored settings and cancellation");
    let colors = FormRegistry.get("colorsForm");
    colors.mainColor = Color.fromRGBA(255, 0, 0, 255);
    colors.secondaryColor = Color.fromRGBA(0, 0, 255, 255);
    for (let drawType of ["outline", "fill", "both", "fillOutline"]) {
        for (let button of [MouseButton.LEFT, MouseButton.RIGHT]) {
            tool = reset(ToolType.SHAPES, {shape: "rectangle", width: 1, antialias: false,
                drawType, fillStyle: "solid", blendMode: "normal"});
            check(tool.getWidth() === 1 && tool.getSetting("antialias") === false,
                "Aliased rectangle fixture settings were not applied: " + tool.getWidth());
            tool.onMouseDown(20, 20, button);
            tool.onMouseMove(40, 40);
            tool.onMouseUp(40, 40, button);
            let bitmap = pixels();
            for (let y = 0; y < 128; ++y) {
                for (let x = 0; x < 128; ++x) {
                    let inside = x >= 20 && x < 41 && y >= 20 && y < 41;
                    let border = inside && (x === 20 || x === 40 || y === 20 || y === 40);
                    let fill = inside && (drawType !== "outline" || border);
                    let secondary = (drawType === "both" || drawType === "fillOutline") && !border;
                    let blue = secondary ? button === MouseButton.LEFT : button === MouseButton.RIGHT;
                    let offset = (y * 128 + x) * 4;
                    check(bitmap[offset + 3] === (fill ? 255 : 0),
                        "Aliased rectangle alpha oracle differs: " + drawType + "/" + button + " at " + x + "," + y
                            + ", actual " + bitmap[offset + 3] + ", points " + tool.endPoint.x + "," + tool.endPoint.y);
                    if (fill) {
                        check(bitmap[offset] === (blue ? 0 : 255) && bitmap[offset + 1] === 0
                            && bitmap[offset + 2] === (blue ? 255 : 0), "Rectangle outline/interior colors differ");
                    }
                }
            }
            let captured = tool.capturePendingState();
            tool.cancelPending();
            check(pixels().every(value => value === 0), "Cancelling a rectangle left pixels behind");
            tool.restorePendingState(captured);
            equalBytes(pixels(), bitmap, "Restoring a rectangle changed its pixels");
            tool.onSettingChanged("drawType", "fill");
            check(tool.getSetting("drawType") === "fill", "Restored shape ignored a setting change");
            colors.mainColor = Color.fromRGBA(0, 255, 0, 255);
            colors.secondaryColor = Color.fromRGBA(255, 255, 0, 255);
            tool.onColorsChanged();
            check(tool.getColor().getGreen() === 255 && tool.getColor(MouseButton.RIGHT).getRed() === 255,
                "Restored colors ignored a palette change");
            tool.commitStroke();
            check(!tool.pending, "Stroke finishing did not commit a pending shape");
            check(!tool.commitPending() && !tool.cancelPending(), "Inactive shape finished twice");
            colors.mainColor = Color.fromRGBA(255, 0, 0, 255);
            colors.secondaryColor = Color.fromRGBA(0, 0, 255, 255);
        }
    }
    for (let [type, end] of [[ToolType.SHAPES, new Point(60, 48)],
        [ToolType.LINE, new Point(60, 48)], [ToolType.GRADIENT, new Point(60, 48)]]) {
        tool = reset(type, {shape: "rectangle", drawType: "fill", width: 2, antialias: true});
        app.shiftKeyDown = true;
        app.altKeyDown = true;
        check(!tool.onMouseDown(32, 40, MouseButton.MIDDLE), "Middle button started a shape");
        tool.onMouseDown(32, 40, MouseButton.LEFT);
        tool.onMouseMove(end.x, end.y);
        if (type === ToolType.SHAPES) {
            near(tool.startPoint.x, 4, "Centered square start x");
            near(tool.startPoint.y, 12, "Centered square start y");
            near(tool.endPoint.x, 60, "Centered square end x");
            near(tool.endPoint.y, 68, "Centered square end y");
        } else {
            let origin = type === ToolType.GRADIENT ? new Point(32, 40) : tool.startPoint;
            let angle = Math.atan2(tool.endPoint.y - origin.y, tool.endPoint.x - origin.x) * 180 / Math.PI;
            near(angle, 15, "Shift did not constrain line/gradient direction");
        }
        check(!tool.onMouseUp(end.x, end.y, MouseButton.RIGHT), "Wrong button ended shape drawing");
        tool.onMouseUp(end.x, end.y, MouseButton.LEFT);
        check(!tool.onKeyPress("x"), "Unknown shape shortcut was consumed");
        tool.onKeyPress("Escape");
        check(!tool.pending, "Escape did not finish the constrained shape");
    }
    tool = reset(ToolType.SHAPES);
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseUp(20, 20, MouseButton.LEFT);
    check(!tool.pending && tool.bitmapTransaction === null, "Zero-length shape was not cancelled");
    check(!tool.hitTestPendingShape(new Point(20, 20)), "Inactive shape was hittable");
    tool = draw();
    check(tool.usesContinuousPointerCoordinates(), "Pending shapes lost continuous pointer coordinates");
    tool.onMouseMove(120, 120);
    tool.onMouseDown(100.7, 100.8, MouseButton.LEFT);
    check(tool.startPoint.x === 100 && tool.startPoint.y === 100 && !tool.pending,
        "Starting outside an existing shape did not commit it and floor new coordinates");
    tool.cancelPending();

    phase("selection combination modifiers and configured modes with independent masks");
    let oldRect = new Rectangle(16, 16, 32, 24);
    let newRect = new Rectangle(32, 24, 33, 33);
    let contains = (rect, x, y) => x >= rect.x && x < rect.x + rect.width
        && y >= rect.y && y < rect.y + rect.height;
    let assertMask = (predicate, label) => {
        let mask = BitmapEffectEngine.createSelectionMask(128, 128, selection);
        for (let y = 0; y < 128; ++y) {
            for (let x = 0; x < 128; ++x) {
                check((mask === null || mask[y * 128 + x] > 127) === predicate(x, y),
                    label + " differs at " + x + "," + y);
            }
        }
    };
    let startSelection = (mode = "replace", type = ToolType.RECTANGLE_SELECT) => {
        let active = reset(type, {combineMode: mode, selectionMode: "normal", renderingQuality: "high"});
        selection.setContinuation(oldRect, CombineMode.REPLACE);
        selection.commitContinuation();
        return active;
    };
    let gesture = async (active, start, end, button = MouseButton.LEFT) => {
        active.onMouseDown(start.x, start.y, button);
        active.onMouseMove(end.x, end.y);
        await new Promise(resolve => setTimeout(resolve, 60));
        active.onMouseUp(end.x, end.y, button);
    };
    for (let configured of [false, true]) {
        for (let mode of ["replace", "union", "exclude", "xor", "intersect"]) {
            tool = startSelection(configured ? mode : "replace");
            app.controlKeyDown = !configured && (mode === "union" || mode === "xor");
            app.altKeyDown = !configured && (mode === "exclude" || mode === "intersect");
            let button = !configured && (mode === "xor" || mode === "intersect") ? MouseButton.RIGHT : MouseButton.LEFT;
            tool.onModifierKeysChanged();
            await gesture(tool, new Point(newRect.x, newRect.y), new Point(64, 56), button);
            let expected = (x, y) => {
                let old = contains(oldRect, x, y);
                let added = contains(newRect, x, y);
                switch (mode) {
                    case "union": return old || added;
                    case "exclude": return old && !added;
                    case "xor": return old !== added;
                    case "intersect": return old && added;
                    default: return added;
                }
            };
            assertMask(expected, "Selection " + mode + "/" + configured);
            check(history.undoStack.length === 1, "Selection combination did not record history");
            history.stepBackward();
            assertMask((x, y) => contains(oldRect, x, y), "Combination undo");
            history.stepForward();
            assertMask(expected, "Combination redo");
        }
    }

    phase("empty/disjoint selection transitions, coalesced trace and moving origin");
    for (let [mode, start, end, unchanged] of [
        ["exclude", new Point(80, 80), new Point(100, 100), true],
        ["intersect", new Point(80, 80), new Point(100, 100), false],
        ["union", new Point(-10, -10), new Point(-10, -10), true],
        ["intersect", new Point(-10, -10), new Point(-10, -10), false],
        ["exclude", new Point(-10, -10), new Point(-5, -5), true],
        ["replace", new Point(-10, -10), new Point(-10, -10), false]
    ]) {
        tool = startSelection(mode);
        await gesture(tool, start, end);
        if (unchanged) {
            assertMask((x, y) => contains(oldRect, x, y), mode + " reset");
            check(history.undoStack.length === 0, mode + " reset recorded history");
        } else {
            check(selection.isEmpty(), mode + " failed to clear");
            history.stepBackward();
            assertMask((x, y) => contains(oldRect, x, y), mode + " clear undo");
        }
    }
    tool = startSelection();
    tool.onMouseDown(32, 24, MouseButton.LEFT);
    tool.onMouseMove(64, 56);
    tool.onMouseDown(64, 56, MouseButton.RIGHT);
    check(tool.moveOriginMode, "Second button did not move selection origin");
    tool.onMouseMove(69, 63);
    tool.onMouseUp(69, 63, MouseButton.RIGHT);
    check(tool.tracking && !tool.moveOriginMode, "Origin release ended the primary gesture");
    await new Promise(resolve => setTimeout(resolve, 60));
    tool.onMouseUp(69, 63, MouseButton.LEFT);
    let shifted = new Rectangle(37, 31, 33, 33);
    assertMask((x, y) => contains(shifted, x, y), "Moved origin");
    tool = startSelection("replace", ToolType.LASSO_SELECT);
    tool.onMouseDown(20, 20, MouseButton.LEFT);
    tool.onMouseMove(40, 40, {samples: [{x: 40.8, y: 20.3}, {x: 40.2, y: 20.7}]});
    check(tool.tracePoints.length === 3 && tool.tracePoints[1].x === 40 && tool.tracePoints[1].y === 20,
        "Coalesced lasso samples were lost or duplicate pixel points were retained");
    tool.onMouseMove(20, 40);
    tool.onMouseMove(20, 20);
    await new Promise(resolve => setTimeout(resolve, 60));
    app.setActiveTool(null);
    assertMask((x, y) => contains(new Rectangle(20, 20, 20, 20), x, y), "Lasso deactivation commit");
    phase("fixed-size/ratio rectangles and opposite-diameter constrained ellipses");
    for (let [mode, start, end, width, height] of [
        ["fixedSize", new Point(120, 120), new Point(127, 127), 12, 8],
        ["fixedRatio", new Point(20, 20), new Point(60, 60), 40, 20],
        ["fixedRatio", new Point(60, 60), new Point(40, 52), 16, 8],
        ["fixedRatio", new Point(60, 60), new Point(40, 20), 20, 10],
        ["fixedRatio", new Point(60, 60), new Point(80, 40), 20, 10],
        ["fixedRatio", new Point(60, 60), new Point(40, 80), 20, 10]
    ]) {
        tool = reset(ToolType.RECTANGLE_SELECT, {selectionMode: mode,
            selectionWidth: mode === "fixedSize" ? 12 : 2, selectionHeight: mode === "fixedSize" ? 8 : 1});
        await gesture(tool, start, end);
        let bounds = selection.getBounds();
        near(bounds.width, width, "Selection mode width " + mode);
        near(bounds.height, height, "Selection mode height " + mode);
        if (mode === "fixedSize") {
            near(bounds.x, 116, "Fixed-size selection was not clamped horizontally");
            near(bounds.y, 120, "Fixed-size selection was not clamped vertically");
        }
    }
    tool = reset(ToolType.RECTANGLE_SELECT, {selectionMode: "normal"});
    app.shiftKeyDown = true;
    await gesture(tool, new Point(20, 20), new Point(60, 30));
    near(selection.getBounds().width, 11, "Constrained rectangle width");
    near(selection.getBounds().height, 11, "Constrained rectangle height");
    tool = reset(ToolType.ELLIPSE_SELECT);
    app.shiftKeyDown = true;
    let ellipse = tool.createShape([new Point(40, 40), new Point(64, 58)]);
    let center = new Point(52, 49);
    for (let point of ellipse) {
        near(Math.hypot(point.x - center.x, point.y - center.y), 15, "Constrained circle radius/center");
    }
    for (let bounds of [new Rectangle(0, 0, 0, 1), new Rectangle(0, 0, 1, 0)]) {
        check(tool.flattenEllipse(bounds, 0.01).length === 0, "Degenerate ellipse produced vertices");
    }
    app.controlKeyDown = true;
    tool.onModifierKeysChanged();
    app.controlKeyDown = false;
    app.altKeyDown = true;
    tool.onModifierKeysChanged();
    tool = reset(ToolType.LASSO_SELECT);
    app.controlKeyDown = true;
    tool.onModifierKeysChanged();
    app.controlKeyDown = false;
    app.altKeyDown = true;
    tool.onModifierKeysChanged();
    check(!tool.onMouseDown(20, 20, MouseButton.MIDDLE), "Middle button began a lasso gesture");
    app.controlKeyDown = false;
    app.altKeyDown = false;
    app.shiftKeyDown = false;
    phase("antialiased rectangles keep independent interior and outline colors");
    colors.setMainColor(new Color(255, 0, 0));
    colors.setSecondaryColor(new Color(0, 0, 255));
    tool = reset(ToolType.SHAPES, {shape: "rectangle", drawType: "both", width: 3,
        antialias: true, fillStyle: "solid"});
    check(!tool.onKeyPress("Escape"), "Idle shape consumed Escape without an editable preview");
    check(!tool.beginCurveControlInteraction(new Point(100, 100))
        && !tool.beginGradientControlInteraction(new Point(100, 100)),
        "Idle non-curve shape exposed specialized control handles");
    tool.onMouseDown(32, 40, MouseButton.LEFT);
    tool.onMouseUp(72, 60, MouseButton.LEFT);
    let borderColor = surface.getColorAt(33, 50);
    let interiorColor = surface.getColorAt(50, 50);
    check(borderColor.toPacked() === new Color(255, 0, 0).toPacked()
        && interiorColor.toPacked() === new Color(0, 0, 255).toPacked()
        && surface.getColorAt(20, 50).alpha === 0,
        "Antialiased rectangle mixed its outline/interior colors or painted outside its bounds");
    let editableRectangle = pixels();
    tool.commitPending();
    let shapeSteps = history.undoStack.length;
    for (let index = 0; index < shapeSteps; ++index) {
        history.stepBackward();
    }
    check(pixels().every(value => value === 0), "Outlined rectangle undo retained preview pixels");
    for (let index = 0; index < shapeSteps; ++index) {
        history.stepForward();
    }
    equalBytes(pixels(), editableRectangle, "Outlined rectangle redo changed its separate geometries");
    phase("unknown persisted shapes retain the rectangular fallback");
    tool = reset(ToolType.SHAPES, {shape: "unknown-saved-shape", drawType: "fill", width: 1, antialias: true});
    tool.onMouseDown(32, 40, MouseButton.LEFT);
    tool.onMouseUp(72, 60, MouseButton.LEFT);
    check(surface.getColorAt(50, 50).alpha === 255 && surface.getColorAt(20, 50).alpha === 0,
        "Unknown saved shape failed to render its bounded rectangular fallback");
    tool.cancelPending();
    phase("line cap combinations and endpoint hit testing preserve editable geometry");
    tool = reset(ToolType.LINE, {width: 4, antialias: true, startCap: "filledArrow", endCap: "flat", fillStyle: "solid"});
    tool.onMouseDown(32, 40, MouseButton.LEFT);
    tool.onMouseUp(72, 60, MouseButton.LEFT);
    check(tool.hitTestPendingShape(new Point(50, 49)) && !tool.hitTestPendingShape(new Point(100, 100)),
        "Line body hit testing did not distinguish its segment from distant points");
    check(!tool.beginCurveControlInteraction(new Point(100, 100)), "Distant point hit a curve control");
    check(surface.getColorAt(50, 49).alpha > 0, "Filled-arrow line omitted its main segment");
    tool.cancelPending();
    tool = reset(ToolType.GRADIENT, {gradientType: "linear", gradientRepeat: "none"});
    tool.onMouseDown(32, 40, MouseButton.LEFT);
    tool.onMouseUp(72, 60, MouseButton.LEFT);
    check(!tool.beginGradientControlInteraction(new Point(120, 120)), "Distant point hit a gradient control");
    tool.cancelPending();
    app.closeDocumentWorkspace(workspace, false);
};
