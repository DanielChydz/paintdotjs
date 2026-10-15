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

module.exports = async function checkMoveModes() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let same = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    phase("Move initialization falls back when idle scheduling is unavailable");
    let lifecycleWorkspace = app.createBlankDocumentInNewWorkspace(32, 32);
    app.setActiveTool(null);
    let firstLayer = lifecycleWorkspace.getActiveLayer();
    let secondLayer = Layer.createLayer(lifecycleWorkspace, 32, 32, "History target");
    lifecycleWorkspace.getDocument().addLayer(secondLayer);
    lifecycleWorkspace.setActiveLayer(firstLayer);
    let requestIdle = window.requestIdleCallback;
    try {
        window.requestIdleCallback = undefined;
        app.setActiveToolFromType(ToolType.MOVE);
        await new Promise(resolve => setTimeout(resolve, 10));
        check(MaskedSurface.gpuRenderer !== undefined, "Move did not prepare its renderer without idle scheduling");
    } finally {
        window.requestIdleCallback = requestIdle;
    }
    phase("retrying Move activation after a busy scratch surface does not duplicate event subscriptions");
    app.setActiveTool(null);
    let subscriptionCounts = () => [lifecycleWorkspace.getSelection().changing.listeners.length,
        lifecycleWorkspace.getSelection().changed.listeners.length, lifecycleWorkspace.getHistory().executing.listeners.length,
        lifecycleWorkspace.getHistory().executed.listeners.length];
    let beforeActivation = subscriptionCounts();
    lifecycleWorkspace.borrowScratchSurface("activation failure regression");
    let failedActivation;
    try {
        app.setActiveToolFromType(ToolType.MOVE);
    } catch (error) {
        failedActivation = error;
    }
    let retryMove = app.getActiveTool();
    check(failedActivation?.message.includes("activation failure regression") && !retryMove.isActive(),
        "Move did not reject activation while another operation owned the scratch surface");
    check(subscriptionCounts().every((value, index) => value === beforeActivation[index]),
        "Failed Move activation leaked selection/history listeners");
    let interruptedRenderArgs = retryMove.renderArgs;
    lifecycleWorkspace.returnScratchSurface();
    app.setActiveTool(retryMove);
    check(retryMove.isActive() && retryMove.renderArgs !== interruptedRenderArgs
        && subscriptionCounts().every((value, index) => value === beforeActivation[index] + 1),
    "Retried Move activation reused stale render arguments or registered duplicate listeners");
    app.setActiveTool(null);
    check(!lifecycleWorkspace.isScratchSurfaceBorrowed
        && subscriptionCounts().every((value, index) => value === beforeActivation[index]),
    "Deactivating retried Move retained scratch ownership or subscriptions");
    phase("abandoned failed Move activation disposes only its own render resources");
    let renderersBeforeAbandon = lifecycleWorkspace.getSurfaceBox().getRendererList().length;
    lifecycleWorkspace.borrowScratchSurface("abandoned activation owner");
    let abandonedFailure;
    try {
        app.setActiveToolFromType(ToolType.MOVE);
    } catch (error) {
        abandonedFailure = error;
    }
    let abandonedMove = app.getActiveTool();
    check(abandonedFailure?.message.includes("abandoned activation owner") && abandonedMove.renderArgs !== null,
        "Abandoned activation did not retain its partial render state for cleanup");
    abandonedMove.dispose();
    check(abandonedMove.renderArgs === null && abandonedMove.context === null
        && lifecycleWorkspace.getSurfaceBox().getRendererList().length === renderersBeforeAbandon
        && lifecycleWorkspace.isScratchSurfaceBorrowed
        && lifecycleWorkspace.borrowScratchSurfaceReason === "abandoned activation owner"
        && subscriptionCounts().every((value, index) => value === beforeActivation[index]),
    "Disposing failed Move activation leaked resources or released another owner's scratch surface");
    app.setActiveTool(null);
    lifecycleWorkspace.returnScratchSurface();
    app.setActiveToolFromType(ToolType.MOVE);
    let lifecycleMove = app.getActiveTool();
    let lifecycleSurface = firstLayer.getSurface();
    let idlePixels = lifecycleSurface.context.getImageData(0, 0, 32, 32).data;
    let idleHistorySize = lifecycleWorkspace.getHistory().undoStack.length;
    lifecycleMove.onMouseUp(4, 4, MouseButton.LEFT);
    check(!lifecycleMove.tracking && lifecycleWorkspace.getHistory().undoStack.length === idleHistorySize
        && same(lifecycleSurface.context.getImageData(0, 0, 32, 32).data, idlePixels),
        "Idle Move release created history or changed pixels");
    let emptyMerges = lifecycleMove.mergeDirtyRectangles([null, new Rectangle(4, 4, 0, 0)]);
    check(emptyMerges.length === 0, "Absent and empty dirty footprints produced a restore rectangle");
    phase("Move context undo restores its original active layer and render destination");
    let layerContext = new MoveContextHistoryMemento(lifecycleWorkspace, lifecycleMove.context, "Layer context", null);
    lifecycleMove.deactivateOnLayerChange = false;
    lifecycleWorkspace.setActiveLayer(secondLayer);
    lifecycleMove.deactivateOnLayerChange = true;
    let redoLayerContext = layerContext.performUndo();
    check(lifecycleWorkspace.getActiveLayer() === firstLayer && lifecycleMove.activeLayer === firstLayer
        && lifecycleMove.renderArgs.getSurface() === firstLayer.getSurface() && lifecycleMove.deactivateOnLayerChange,
        "Context undo did not restore the layer-specific Move state");
    redoLayerContext.performUndo();
    check(lifecycleWorkspace.getActiveLayer() === secondLayer && lifecycleMove.renderArgs.getSurface() === secondLayer.getSurface(),
        "Context redo did not restore the alternate layer render destination");
    app.setActiveTool(null);
    lifecycleWorkspace.setActiveLayer(firstLayer);
    phase("discarded pending paste buffers release only owned surfaces");
    let disposableMove = ToolType.MOVE.create();
    let pendingSource = document.createElement("canvas");
    pendingSource.width = 3;
    pendingSource.height = 2;
    let underlay = lifecycleSurface.clone();
    disposableMove.setPendingPaste(pendingSource, underlay);
    let ownedSource = disposableMove.pendingPasteSurface.getCanvas();
    let ownedUnderlay = disposableMove.pendingPasteUnderlay.getCanvas();
    disposableMove.dispose();
    disposableMove.dispose();
    check(ownedSource.width === 0 && ownedUnderlay.width === 0 && pendingSource.width === 3
        && underlay.getWidth() === 32 && disposableMove.context === null,
        "Move disposal retained owned paste buffers or disposed a caller-owned surface");
    underlay.dispose();
    phase("external selection changes finish active Move and selection-Move gestures");
    lifecycleSurface.clear();
    lifecycleSurface.context.fillStyle = "red";
    lifecycleSurface.context.fillRect(8, 8, 4, 4);
    let lifecycleOriginal = lifecycleSurface.context.getImageData(0, 0, 32, 32).data;
    let lifecycleSelection = lifecycleWorkspace.getSelection();
    lifecycleSelection.setContinuation(new Rectangle(0, 0, 32, 32), CombineMode.REPLACE);
    lifecycleSelection.commitContinuation();
    lifecycleWorkspace.getHistory().clearAll();
    ToolType.MOVE.setSetting("resampling", "nearest");
    app.setActiveToolFromType(ToolType.MOVE);
    lifecycleMove = app.getActiveTool();
    lifecycleMove.onMouseDown(16, 16, MouseButton.LEFT);
    lifecycleMove.flushHistoryMementos(null);
    check(lifecycleWorkspace.getHistory().undoStack.at(-1).getName() === lifecycleMove.getName(),
        "Explicitly flushed Move history did not default to its tool name");
    lifecycleMove.onMouseMove(18, 19);
    await new Promise(resolve => requestAnimationFrame(resolve));
    lifecycleSelection.reset();
    let lifecycleExpected = new Uint8ClampedArray(32 * 32 * 4);
    for (let y = 11; y < 15; ++y) {
        for (let x = 10; x < 14; ++x) {
            lifecycleExpected.set([255, 0, 0, 255], (y * 32 + x) * 4);
        }
    }
    check(!lifecycleMove.tracking && !lifecycleMove.context.lifted
        && same(lifecycleSurface.context.getImageData(0, 0, 32, 32).data, lifecycleExpected),
        "External selection reset did not finish Move at its presented pixel position");
    let lifecycleHistory = lifecycleWorkspace.getHistory();
    let lifecycleSteps = lifecycleHistory.undoStack.length;
    for (let index = 0; index < lifecycleSteps; ++index) {
        lifecycleHistory.stepBackward();
    }
    check(same(lifecycleSurface.context.getImageData(0, 0, 32, 32).data, lifecycleOriginal),
        "Selection-interrupted Move undo did not restore the original bitmap");
    app.setActiveTool(null);
    lifecycleSelection.reset();
    lifecycleSelection.setContinuation(new Rectangle(0, 0, 32, 32), CombineMode.REPLACE);
    lifecycleSelection.commitContinuation();
    app.setActiveToolFromType(ToolType.MOVE_SELECTION);
    let lifecycleSelectionMove = app.getActiveTool();
    let idleSelectionHistory = lifecycleWorkspace.getHistory().undoStack.length;
    lifecycleSelectionMove.onMouseUp(16, 16, MouseButton.LEFT);
    check(!lifecycleSelectionMove.tracking && lifecycleWorkspace.getHistory().undoStack.length === idleSelectionHistory,
        "Idle selection-Move release created an edit");
    lifecycleSelectionMove.onMouseDown(16, 16, MouseButton.LEFT);
    lifecycleSelectionMove.flushHistoryMementos(null);
    check(lifecycleWorkspace.getHistory().undoStack.at(-1).getName() === lifecycleSelectionMove.getName(),
        "Explicitly flushed selection-Move history lost its default tool name");
    lifecycleSelectionMove.onMouseMove(18, 19);
    lifecycleSelection.reset();
    check(!lifecycleSelectionMove.tracking && !lifecycleSelectionMove.context.lifted && lifecycleSelection.isEmpty(),
        "External selection reset retained an active selection-Move gesture");
    app.closeDocumentWorkspace(lifecycleWorkspace, false);
    phase("Move activation without an active layer retains an empty render destination");
    app.setActiveTool(null);
    let emptyWorkspace = app.createBlankDocumentInNewWorkspace(8, 8);
    app.setActiveTool(null);
    let removedLayer = emptyWorkspace.getActiveLayer();
    emptyWorkspace.getDocument().getLayers().removeLayer(removedLayer);
    app.setActiveToolFromType(ToolType.MOVE);
    check(emptyWorkspace.getActiveLayer() === null && app.getActiveTool().renderArgs === null
        && !app.getActiveTool().tracking, "Layerless Move activation retained a stale destination or started tracking");
    app.setActiveTool(null);
    check(new AddNewLayerAction().isActionExecutable(emptyWorkspace)
        && !new DeleteLayerAction().isActionExecutable(emptyWorkspace)
        && !new DuplicateLayerAction().isActionExecutable(emptyWorkspace)
        && !new LayerPropertiesAction().isActionExecutable(emptyWorkspace),
    "Layerless document disabled recovery or enabled commands requiring a layer");
    for (let id of ["menu.layers.goToTopLayer", "menu.layers.goToLayerAbove", "menu.layers.goToLayerBelow", "menu.layers.goToBottomLayer"]) {
        let action = ActionRegistry.get(id);
        check(!action.runIsActionExecutable(), "Layerless document enabled layer navigation: " + id);
        action.runPerformAction();
    }
    new AddNewLayerAction().runPerformAction();
    check(emptyWorkspace.getDocument().getLayers().size() === 1 && emptyWorkspace.getActiveLayer() !== null,
        "Add Layer did not recover an empty document");
    emptyWorkspace.getHistory().stepBackward();
    check(emptyWorkspace.getDocument().getLayers().size() === 0 && emptyWorkspace.getActiveLayer() === null,
        "Undoing the first layer did not recover the empty document");
    emptyWorkspace.getHistory().stepForward();
    check(emptyWorkspace.getDocument().getLayers().size() === 1 && emptyWorkspace.getActiveLayer() !== null
        && emptyWorkspace.getActiveLayer().getSurface().context.getImageData(0, 0, 8, 8).data.every(value => value === 0),
    "Redoing the first layer lost its active layer or transparent pixels");
    app.closeDocumentWorkspace(emptyWorkspace, false);
    removedLayer.dispose();
    ToolType.MOVE.setSetting("resampling", "nearest");
    ToolType.MOVE.setSetting("renderingQuality", "aliased");
    for (let [mode, start, end, rectangle, button] of [
        [MoveToolBaseMode.SCALE, [50, 48], [70, 48], [30, 40, 40, 16], MouseButton.LEFT],
        [MoveToolBaseMode.ROTATE, [50, 48], [40, 58], [32, 38, 16, 20], MouseButton.RIGHT]
    ]) {
        phase("pixel Move " + mode + " preserves exact nearest-neighbor output and history");
        let workspace = app.createBlankDocumentInNewWorkspace(128, 128);
        app.setActiveTool(null);
        workspace.setZoom(1);
        let surface = workspace.getActiveLayer().getSurface();
        surface.clear();
        surface.context.fillStyle = "red";
        surface.context.fillRect(30, 40, 20, 16);
        let original = surface.context.getImageData(0, 0, 128, 128).data;
        let selection = workspace.getSelection();
        selection.setContinuation(new Rectangle(30, 40, 20, 16), CombineMode.REPLACE);
        selection.commitContinuation();
        let history = workspace.getHistory();
        history.clearAll();
        history.pushNewMemento(new NullHistoryMemento("Original", "assets/icons/menu_file_new_icon.png"));
        app.setActiveToolFromType(ToolType.MOVE);
        let move = app.getActiveTool();
        move.onMouseDown(...start, button);
        check(move.context.currentMode === mode, "Pixel Move did not begin its requested transform mode");
        move.onMouseMove(...end);
        move.onMouseUp(...end, button);
        let expected = new Uint8ClampedArray(128 * 128 * 4);
        for (let y = rectangle[1]; y < rectangle[1] + rectangle[3]; ++y) {
            for (let x = rectangle[0]; x < rectangle[0] + rectangle[2]; ++x) {
                expected.set([255, 0, 0, 255], (y * 128 + x) * 4);
            }
        }
        let transformed = surface.context.getImageData(0, 0, 128, 128).data;
        check(same(transformed, expected), "Pixel Move preview differs from the independent integer transform: " + mode);
        let finish = PanelRegistry.get("toolMenu").createActionControl({label: "Finish", icon: "tool_strip_checked.png"});
        finish.click();
        check(!move.context.lifted && same(surface.context.getImageData(0, 0, 128, 128).data, expected),
            "Toolbar Finish did not commit the transformed bitmap: " + mode);
        let steps = history.undoStack.length - 1;
        for (let index = 0; index < steps; ++index) {
            history.stepBackward();
        }
        check(same(surface.context.getImageData(0, 0, 128, 128).data, original), "Transform undo lost original pixels: " + mode);
        DocumentIO.finishActiveTool(false);
        for (let index = 0; index < steps; ++index) {
            history.stepForward();
        }
        check(same(surface.context.getImageData(0, 0, 128, 128).data, expected), "Transform redo lost its output pixels: " + mode);
        app.closeDocumentWorkspace(workspace, false);
    }
};
