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

module.exports = async function checkPointerRouting() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let {ipcRenderer} = require("electron");
    let phase = name => ipcRenderer.send("paintdotjs:test-phase", name);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let waitFor = async predicate => {
        let deadline = performance.now() + 3000;
        while (!predicate()) {
            check(performance.now() < deadline, "Pointer routing timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(64, 64);
    workspace.setZoom(8);
    workspace.centerView();
    let surface = workspace.getActiveLayer().getSurface();
    surface.clear();
    let history = workspace.getHistory();
    history.clearAll();
    FormRegistry.get("colorsForm").setMainColor(new Color(255, 0, 0));
    app.setActiveToolFromType(ToolType.PENCIL);
    let toClient = (x, y) => {
        let point = workspace.toScreenPosition(new Point(x, y));
        return {x: Math.round(point.x + app.editor.offsetLeft),
            y: Math.round(point.y + app.editor.offsetTop + windowTop())};
    };
    let send = async (type, x, y, button = "left", modifiers = []) => {
        let point = toClient(x, y);
        await ipcRenderer.invoke("paintdotjs:test-input", {type, ...point, button, modifiers, clickCount: 1});
        await new Promise(resolve => setTimeout(resolve, 10));
    };
    let originalMove = app.getActiveTool().onMouseMove;
    let receivedInput = null;
    app.getActiveTool().onMouseMove = function (x, y, input) {
        receivedInput = input;
        return originalMove.call(this, x, y, input);
    };

    phase("native pointer drawing and undo");
    await send("mouseMove", 8, 8);
    await send("mouseDown", 8, 8);
    await waitFor(() => app.pointerDown);
    check(app.editor.hasPointerCapture(app.activePointerId), "Native pointer did not acquire capture");
    await send("mouseMove", 24, 24, "left", ["leftbuttondown"]);
    check(receivedInput?.pressure === 1 && receivedInput.pointerType === "mouse", "Mouse input lost its normalized pressure");
    await send("mouseUp", 24, 24);
    check(!app.pointerDown && app.autoScrollFrame === null, "Pointer release retained scrolling or ownership");
    check(surface.context.getImageData(8, 8, 1, 1).data[0] === 255
        && surface.context.getImageData(24, 24, 1, 1).data[3] === 255, "Native gesture did not paint document coordinates");
    check(history.undoStack.length === 1, "Native stroke did not create one history entry");
    history.stepBackward();
    check(surface.context.getImageData(8, 8, 1, 1).data[3] === 0, "Native stroke undo left pixels");
    history.stepForward();
    check(surface.context.getImageData(8, 8, 1, 1).data[3] === 255, "Native stroke redo lost pixels");

    phase("pen pressure, additional contacts and interrupted strokes");
    await send("mouseDown", 30, 30);
    let owner = app.activePointerId;
    let dispatch = (type, id, pressure = 0.25) => {
        let point = toClient(32, 32);
        let event = new PointerEvent(type, {pointerId: id, pointerType: "pen", pressure,
            clientX: point.x, clientY: point.y, button: 0, buttons: 1, bubbles: true, cancelable: true});
        app.editor.dispatchEvent(event);
        return event;
    };
    let secondContact = dispatch("pointerdown", owner + 100);
    check(secondContact.defaultPrevented && app.activePointerId === owner, "Additional contact took over the active stroke");
    dispatch("pointermove", owner + 100);
    dispatch("pointerup", owner + 100);
    check(app.pointerDown && app.activePointerId === owner, "Foreign pointer ended the active stroke");
    dispatch("pointermove", owner, 0.25);
    check(receivedInput.pressure === 0.25 && receivedInput.pointerType === "pen", "Pen pressure did not survive routing");
    AppSettingsStore.set("pen.pointerInput", false);
    dispatch("pointermove", owner, 0.75);
    check(receivedInput.pressure === 1, "Disabled pen input still used device pressure");
    AppSettingsStore.set("pen.pointerInput", true);
    dispatch("pointerdown", owner, 0.5);
    check(app.pointerDown && app.activePointerId === owner, "Repeated owner down did not restart the interrupted stroke");
    dispatch("pointercancel", owner);
    check(!app.pointerDown && app.autoScrollPointer === null, "Pointer cancellation retained the active stroke");
    await send("mouseUp", 32, 32);
    await send("mouseDown", 36, 36);
    owner = app.activePointerId;
    dispatch("lostpointercapture", owner);
    check(!app.pointerDown && app.autoScrollFrame === null, "Lost capture did not end the stroke");
    await send("mouseUp", 36, 36);

    phase("pan cursor restoration and pointer sample transforms");
    app.setCursor("crosshair");
    await send("mouseDown", 32, 32, "middle");
    check(app.panTool.isTracking(), "Middle button did not start panning");
    await send("mouseMove", 36, 34, "middle", ["middlebuttondown"]);
    await send("mouseUp", 36, 34, "middle");
    check(!app.panTool.isTracking() && app.cursorState.type === "css" && app.cursorState.value === "crosshair",
        "Pan did not restore the previous cursor");
    let point = workspace.toScreenPosition(new Point(12.5, 14.5));
    let sample = {x: point.x, y: point.y, pressure: 0.3, timeStamp: 123};
    let input = {pressure: 0.4, pointerType: "pen", samples: [sample]};
    let converted = app.toDocumentPointerInput(workspace, input);
    check(converted.samples[0].x === 12 && converted.samples[0].y === 14
        && converted.samples[0].pressure === 0.3 && converted.samples[0].timeStamp === 123
        && converted.samples[0] !== sample, "Integer tool sample conversion changed metadata or source samples");
    check(app.toDocumentPointerInput(workspace, undefined) === null, "Absent pointer input did not remain absent");
    check(app.toDocumentPointerInput(workspace, {pressure: 1}).samples.length === 0, "Absent coalesced samples were fabricated");
    app.setActiveToolFromType(ToolType.MOVE_SELECTION);
    let continuous = app.toToolDocumentPosition(workspace, point.x, point.y);
    check(continuous.x === 12.5 && continuous.y === 14.5, "Move coordinates lost fractional precision");
    converted = app.toDocumentPointerInput(workspace, input);
    check(converted.samples[0].x === 12.5 && converted.samples[0].y === 14.5, "Move sample coordinates lost fractional precision");

    phase("transform controls and keyboard nudging");
    let move = app.getActiveTool();
    workspace.getSelection().setContinuation(new Rectangle(16, 16, 16, 16), CombineMode.REPLACE);
    workspace.getSelection().commitContinuation();
    for (let [edge, vector] of [
        [MoveToolBaseEdge.TOP_LEFT, [-1, -1]], [MoveToolBaseEdge.TOP, [0, -1]],
        [MoveToolBaseEdge.TOP_RIGHT, [1, -1]], [MoveToolBaseEdge.RIGHT, [1, 0]],
        [MoveToolBaseEdge.BOTTOM_RIGHT, [1, 1]], [MoveToolBaseEdge.BOTTOM, [0, 1]],
        [MoveToolBaseEdge.BOTTOM_LEFT, [-1, 1]], [MoveToolBaseEdge.LEFT, [-1, 0]]
    ]) {
        let actual = move.getEdgeVector(edge);
        check(actual.x === vector[0] && actual.y === vector[1], "Transform handle vector is incorrect");
        check(move.flipEdgeVertically(move.flipEdgeVertically(edge)) === edge, "Vertical edge flip was not reversible");
    }
    check(move.flipEdgeVertically(MoveToolBaseEdge.NONE) === MoveToolBaseEdge.NONE, "No-edge flip changed its sentinel");
    for (let method of ["getEdgeVector", "flipEdgeVertically"]) {
        let rejected = false;
        try {
            move[method](-1);
        } catch (error) {
            check(error.message === "Invalid enum value", "Unexpected handle validation error");
            rejected = true;
        }
        check(rejected, "Unknown transform handle was accepted");
    }
    for (let [angle, expected] of [[-15, -15], [7, 0], [8, 15], [187, 180], [188, -165]]) {
        check(move.constrainAngle(angle) === expected, "Rotation snapping is incorrect");
    }
    for (let [horizontal, vertical, expected] of [[true, true, 2], [true, false, 3], [false, true, 2]]) {
        let scale = move.constrainScaling(new Rectangle(0, 0, 20, 10), 20, 10, 60, 20, horizontal, vertical);
        check(scale.width === expected && scale.height === expected, "Aspect-constrained scaling used an inactive dimension");
    }
    for (let key of [KeyButton.RIGHT, KeyButton.LEFT, KeyButton.UP, KeyButton.DOWN]) {
        check(move.onKeyPress(key), "Selection keyboard nudge was ignored");
    }
    app.controlKeyDown = true;
    check(move.onKeyPress(KeyButton.RIGHT), "Ctrl selection nudge was ignored");
    app.controlKeyDown = false;
    check(!("onPulse" in move), "Static transform handles retained the obsolete pulse hook");
    move.hideNubs();
    check(move.moveNubs.every(nub => !nub.isVisible()), "Hidden move handles remained visible");

    phase("viewport scroll, wheel zoom, rulers and grid");
    app.setActiveToolFromType(ToolType.PENCIL);
    workspace.setZoom(50);
    await frame();
    app.setViewPosition(100, 100);
    workspace.setViewPosition(app.getViewX(), app.getViewY());
    app.view.dispatchEvent(new WheelEvent("wheel", {deltaX: 5, deltaY: 10, bubbles: true, cancelable: true}));
    check(app.getViewX() === 105 && app.getViewY() === 110, "Wheel scrolling did not update both axes");
    app.view.dispatchEvent(new WheelEvent("wheel", {deltaY: 20, shiftKey: true, bubbles: true, cancelable: true}));
    check(app.getViewX() === 125 && app.getViewY() === 110, "Shift wheel did not scroll horizontally");
    window.dispatchEvent(new WheelEvent("wheel", {deltaY: -100000, ctrlKey: true, cancelable: true}));
    check(workspace.getZoom() === 100, "Wheel zoom exceeded its upper limit");
    window.dispatchEvent(new WheelEvent("wheel", {deltaY: 100000, ctrlKey: true, cancelable: true}));
    check(workspace.getZoom() === 0.01, "Wheel zoom exceeded its lower limit");
    workspace.setZoom(50);
    await frame();
    app.setViewX(100);
    app.setViewY(100);
    workspace.setViewPosition(app.getViewX(), app.getViewY());
    let viewBounds = app.getViewBounds();
    app.autoScrollPointer = {clientX: viewBounds.getRight() + 20, clientY: viewBounds.getBottom() + 20,
        x: app.getViewWidth() + 20, y: app.getViewHeight() + 20, pressure: 1, pointerType: "mouse"};
    check(app.autoScrollIfNecessary(0.01), "Outside pointer did not auto-scroll a large viewport");
    check(app.getViewX() > 100 && app.getViewY() > 100, "Auto-scroll did not advance both axes");
    AppSettingsStore.set("ui.autoScrollWhileDrawing", false);
    check(!app.autoScrollIfNecessary(0.01), "Disabled auto-scroll changed the viewport");
    AppSettingsStore.set("ui.autoScrollWhileDrawing", true);
    check(!app.autoScrollIfNecessary(0), "Zero-duration auto-scroll changed the viewport");
    app.stopAutoScroll();
    app.runAutoScrollFrame(performance.now());
    check(app.autoScrollFrame === null, "Released pointer restarted frame scheduling");
    workspace.setZoom(8);
    workspace.centerView();
    app.setGridVisible(true);
    app.setRulersVisible(true);
    check(app.isGridVisible() && app.isRulersVisible() && app.horizontalRuler.classList.contains("visible"),
        "Grid or ruler visibility did not update");
    for (let unit of ["pixel", "inch", "centimeter"]) {
        app.setMeasurementUnit(unit);
        app.renderRulers(workspace);
        check(app.horizontalRuler.width > 0 && app.verticalRuler.height > 0, "Ruler backing surfaces were empty");
    }
    app.setGridVisible(false);
    app.setRulersVisible(false);
    check(!app.isGridVisible() && !app.isRulersVisible(), "Grid or ruler remained enabled");
    check(app.getViewElement() === app.view && app.getEnvironmentElement() === app.environment,
        "Viewport accessors returned the wrong elements");
    app.closeDocumentWorkspace(workspace, false);
    check(!app.onMouseDown(0, 0, MouseButton.LEFT) && !app.onMouseMove(0, 0) && !app.onMouseUp(0, 0, MouseButton.LEFT),
        "Empty workspace consumed drawing input");
    app.setGridVisible(true);
    app.setRulersVisible(true);
    check(AppView.prototype.getActiveDocumentWorkspace.call(app) === null, "Base viewport unexpectedly owns a document");
    for (let method of ["onDocumentKeyPress", "onDocumentMouseDown", "onDocumentMouseMove", "onDocumentMouseUp"]) {
        check(AppView.prototype[method].call(app) === false, "Base viewport consumed an unimplemented input hook");
    }
    AppView.prototype.onModifierKeysChanged.call(app);
};
