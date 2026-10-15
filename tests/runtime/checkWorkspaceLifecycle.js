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

module.exports = async function checkWorkspaceLifecycle() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    app.setActiveTool(null);
    phase("missing and closed workspaces are rejected without side effects");
    check(!app.closeDocumentWorkspace(null) && !app.isInitialWorkspaceUntouched(),
        "Missing workspace was closed or considered an untouched startup image");
    let missingListener = () => {};
    app.off("unregistered-lifecycle-event", missingListener);
    check(app.listeners["unregistered-lifecycle-event"] === undefined, "Removing an absent listener allocated an event bucket");
    let originalUnit = app.getMeasurementUnit();
    app.setMeasurementUnit("invalid");
    check(app.getMeasurementUnit() === originalUnit, "Invalid measurement unit replaced the current setting");
    phase("invalid persisted units fall back and startup initialization errors reach the reporter");
    let savedUnit = AppSettingsStore.get("workspace.measurementUnit", "pixel");
    AppSettingsStore.set("workspace.measurementUnit", "invalid");
    let isolated = new AppWorkspace();
    AppSettingsStore.set("workspace.measurementUnit", savedUnit);
    check(isolated.getMeasurementUnit() === "pixel", "Invalid persisted unit did not fall back to pixels");
    isolated.setMeasurementUnit("inch");
    check(isolated.toUnit(7) === isolated.measurementNumberFormatter.format(7),
        "Unit display without a document tried to apply a document resolution");
    let failure = new Error("initial registry failure");
    let reported = [];
    isolated.handleError = error => reported.push(error);
    let initializeRegistry = ActionRegistry.initialize;
    try {
        ActionRegistry.initialize = () => { throw failure; };
        isolated.initialize();
    } finally {
        ActionRegistry.initialize = initializeRegistry;
        isolated.horizontalRuler.remove();
        isolated.verticalRuler.remove();
        isolated.rulerCorner.remove();
        AppSettingsStore.set("workspace.measurementUnit", savedUnit);
    }
    check(reported.length === 1 && reported[0] === failure, "Workspace startup did not report the original registry error once");
    phase("an unfinished startup stroke prevents implicit document replacement");
    let initial = app.createBlankDocumentInNewWorkspace(32, 32, 96, true);
    app.setActiveToolFromType(ToolType.PENCIL);
    let pencil = app.getActiveTool();
    FormRegistry.get("colorsForm").setMainColor(new Color(255, 0, 0));
    pencil.onMouseDown(4, 5, MouseButton.LEFT);
    check(!initial.isDirty() && !app.isInitialWorkspaceUntouched(initial),
        "An uncommitted startup stroke was considered safe to discard");
    let second = app.createBlankDocumentInNewWorkspace(32, 32);
    check(app.getDocumentWorkspaces().includes(initial) && initial.isDirty()
        && initial.getActiveLayer().getSurface().getColorAt(4, 5).toPacked() === new Color(255, 0, 0).toPacked(),
        "Creating another document discarded or failed to finish the startup stroke");
    app.closeDocumentWorkspace(second, false);
    app.setActiveTool(null);
    phase("synchronous close confirmation keeps a dirty document until explicitly accepted");
    let originalConfirm = window.confirm;
    let prompts = [];
    let expectedTitle = initial.getFriendlyName();
    try {
        window.confirm = message => { prompts.push(message); return false; };
        check(!app.closeDocumentWorkspace(initial) && app.getActiveDocumentWorkspace() === initial,
            "Declining close discarded the active dirty document");
        window.confirm = message => { prompts.push(message); return true; };
        check(app.closeDocumentWorkspace(initial), "Accepting close retained a dirty document");
    } finally {
        window.confirm = originalConfirm;
    }
    check(prompts.length === 2 && prompts.every(message => message.includes(expectedTitle)),
        "Close confirmation did not identify the dirty document");
    check(!app.closeDocumentWorkspace(initial) && app.getDocumentWorkspaces().length === 0,
        "Closing a disposed workspace changed the open document collection");
    phase("workspace routing returns the tool result and contextual Escape deselects");
    let workspace = app.createBlankDocumentInNewWorkspace(32, 32);
    app.setActiveTool(null);
    let selection = workspace.getSelection();
    selection.setContinuation(new Rectangle(8, 8, 8, 8), CombineMode.REPLACE);
    selection.commitContinuation();
    workspace.getHistory().clearAll();
    check(app.onDocumentKeyPress("Escape", workspace) && selection.isEmpty(), "Contextual Escape did not deselect");
    workspace.getHistory().stepBackward();
    check(selection.getBounds().width === 8, "Escape deselection did not preserve reversible selection history");
    app.setActiveToolFromType(ToolType.MOVE_SELECTION);
    let before = selection.getBounds();
    check(app.onDocumentKeyPress(KeyButton.RIGHT, workspace), "Workspace did not report a handled tool key");
    let nudged = selection.getBounds();
    check(nudged.x === before.x + 1 && nudged.y === before.y && nudged.width === before.width
        && nudged.height === before.height && app.getActiveTool().context.currentMode === MoveToolBaseMode.TRANSLATE,
        "Workspace key routing resized or rotated the small selection instead of moving it by one pixel");
    app.setActiveTool(null);
    let nudgeHistory = workspace.getHistory();
    let nudgeSteps = nudgeHistory.undoStack.length;
    for (let index = 0; index < nudgeSteps; ++index) {
        nudgeHistory.stepBackward();
    }
    check(selection.getBounds().x === before.x && selection.getBounds().width === before.width,
        "Small selection nudge undo did not restore its original geometry");
    for (let index = 0; index < nudgeSteps; ++index) {
        nudgeHistory.stepForward();
    }
    check(selection.getBounds().x === nudged.x && selection.getBounds().width === nudged.width,
        "Small selection nudge redo resized or lost its translation");
    app.setActiveTool(null);
    phase("one-pixel bitmap nudges bypass overlapping scale handles and preserve exact undo/redo");
    let surface = workspace.getActiveLayer().getSurface();
    surface.clear();
    surface.context.fillStyle = "red";
    surface.context.fillRect(4, 4, 1, 1);
    selection.reset();
    selection.setContinuation(new Rectangle(4, 4, 1, 1), CombineMode.REPLACE);
    selection.commitContinuation();
    let originalPixels = surface.context.getImageData(0, 0, 32, 32).data;
    nudgeHistory.clearAll();
    ToolType.MOVE.setSetting("resampling", "nearest");
    app.setActiveToolFromType(ToolType.MOVE);
    check(app.onDocumentKeyPress(KeyButton.RIGHT, workspace), "One-pixel bitmap nudge was not handled");
    app.setActiveTool(null);
    let movedPixels = new Uint8ClampedArray(32 * 32 * 4);
    movedPixels.set([255, 0, 0, 255], (4 * 32 + 5) * 4);
    let currentPixels = () => surface.context.getImageData(0, 0, 32, 32).data;
    check(currentPixels().every((value, index) => value === movedPixels[index]), "One-pixel bitmap nudge altered pixels beyond its translation");
    nudgeSteps = nudgeHistory.undoStack.length;
    for (let index = 0; index < nudgeSteps; ++index) {
        nudgeHistory.stepBackward();
    }
    check(currentPixels().every((value, index) => value === originalPixels[index]), "One-pixel bitmap nudge undo lost its source pixel");
    for (let index = 0; index < nudgeSteps; ++index) {
        nudgeHistory.stepForward();
    }
    check(currentPixels().every((value, index) => value === movedPixels[index]), "One-pixel bitmap nudge redo did not restore its exact destination");
    app.setActiveToolFromType(ToolType.PAN);
    check(app.onDocumentMouseDown(5, 5, MouseButton.LEFT, workspace)
        && app.onDocumentMouseMove(6, 5, workspace)
        && app.onDocumentMouseUp(6, 5, MouseButton.LEFT, workspace), "Workspace did not propagate handled Pan events");
    check(!app.getActiveTool().tracking, "Routed Pan release left an active drag");
    phase("modal wheel events and cached ruler renders preserve document zoom");
    let dialogPromise = TaskDialog.show({title: "Wheel test", message: "Test", choices: [{value: "done", title: "Done"}]});
    let dialog = document.querySelector(".task-dialog");
    let zoom = workspace.getZoom();
    let wheel = new WheelEvent("wheel", {ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true});
    dialog.dispatchEvent(wheel);
    check(wheel.defaultPrevented && workspace.getZoom() === zoom, "Ctrl+wheel inside a modal zoomed the document");
    dialog.querySelector(".task-dialog-choice").click();
    await dialogPromise;
    workspace.setZoomToWindow(true);
    app.onResize(app.getViewWidth(), app.getViewHeight());
    check(workspace.isZoomToWindow(), "Resize disabled fit-to-window mode");
    app.setRulersVisible(true);
    app.renderRulers(workspace);
    let signature = app.rulerRenderSignature;
    app.renderRulers(workspace);
    check(app.rulerRenderSignature === signature, "Unchanged ruler render modified its cache signature");
    app.setRulersVisible(false);
    app.view.dispatchEvent(new WheelEvent("wheel", {deltaY: 50, bubbles: true, cancelable: true}));
    app.view.dispatchEvent(new WheelEvent("wheel", {ctrlKey: true, deltaY: 0, bubbles: true, cancelable: true}));
    app.startAutoScroll();
    let scheduledFrame = app.autoScrollFrame;
    app.startAutoScroll();
    check(app.autoScrollFrame === scheduledFrame, "Starting auto-scroll twice scheduled competing frames");
    app.stopAutoScroll();
    await frame();
    app.closeDocumentWorkspace(workspace, false);
};
