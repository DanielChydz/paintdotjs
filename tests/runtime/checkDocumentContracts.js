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

module.exports = async function checkDocumentContracts() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let rejects = (operation, pattern) => {
        let failure;
        try {
            operation();
        } catch (error) {
            failure = error;
        }
        check(failure && pattern.test(failure.message), "Expected validation failure: " + pattern);
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    phase("untouched startup image is replaced even while no tool is active");
    app.setActiveTool(null);
    let startup = app.createBlankDocumentInNewWorkspace(8, 8, 96, true);
    let startupCanvas = startup.getActiveLayer().getSurface().getCanvas();
    check(app.isInitialWorkspaceUntouched(startup), "An untouched startup image was treated as edited when no tool was active");
    let replacementWorkspace = app.createBlankDocumentInNewWorkspace(12, 10);
    check(app.getDocumentWorkspaces().length === 1 && app.getActiveDocumentWorkspace() === replacementWorkspace
        && startupCanvas.width === 0 && startup.document === null,
    "Creating an image retained the untouched startup workspace or its canvas");
    app.closeDocumentWorkspace(replacementWorkspace, false);
    let workspace = app.createBlankDocumentInNewWorkspace(16, 12);
    app.setActiveTool(null);
    let model = workspace.getDocument();
    let layer = workspace.getActiveLayer();
    phase("scratch borrowing and failed history operations preserve ownership and history");
    rejects(() => workspace.returnScratchSurface(), /not borrowed/);
    let scratch = workspace.borrowScratchSurface("contract test");
    rejects(() => workspace.borrowScratchSurface("second owner"), /already borrowed: contract test/);
    rejects(() => workspace.onDocumentChanged(), /currently borrowed: contract test/);
    check(workspace.scratchSurface === scratch && workspace.isScratchSurfaceBorrowed,
        "Failed borrowing replaced the owned scratch surface");
    workspace.returnScratchSurface();
    check(!workspace.isScratchSurfaceBorrowed && workspace.borrowScratchSurfaceReason === null,
        "Returning a scratch surface retained ownership");
    let historySize = workspace.getHistory().undoStack.length;
    rejects(() => workspace.executeFunction(new HistoryFunction()), /Not implemented/);
    check(workspace.getHistory().undoStack.length === historySize, "Rejected history operation recorded an entry");
    phase("layer validation rejects missing and foreign active layers before document replacement");
    workspace.activeLayer = null;
    rejects(() => workspace.getActiveLayerIndex(), /No active layer/);
    workspace.activeLayer = layer;
    let foreign = Layer.createLayer(workspace, 16, 12, "Foreign");
    workspace.activeLayer = foreign;
    rejects(() => workspace.getActiveLayerIndex(), /Active layer "Foreign" not in document/);
    workspace.activeLayer = layer;
    let replacement = new Document(16, 12);
    rejects(() => workspace.setDocumentAndActiveLayer(replacement, foreign), /must belong/);
    check(workspace.getDocument() === model && workspace.getActiveLayer() === layer,
        "Invalid document/layer pair changed workspace identity");
    rejects(() => workspace.onLayerInserted(99), /does not exist/);
    let isolated = new DocumentWorkspace(app);
    isolated.setDocument(new Document(2, 2));
    isolated.activeLayer = foreign;
    rejects(() => isolated.getActiveLayerIndex(), /No layers in document/);
    isolated.activeLayer = null;
    isolated.dispose();
    foreign.dispose();
    phase("selection transforms commit both figures and return independent identity fallbacks");
    let selection = new Selection();
    try {
        rejects(() => selection.pop(), /depth is 0/);
        selection.clipRectangle = new Rectangle(2, 3, 4, 5);
        let emptyRegion = selection.createRegion();
        let bounds = emptyRegion.getBounds();
        check(bounds.x === 2 && bounds.y === 3 && bounds.width === 4 && bounds.height === 5,
            "Empty selection did not use its clipping rectangle");
        emptyRegion.dispose();
        selection.setContinuation(new Rectangle(1, 2, 4, 3), CombineMode.REPLACE);
        selection.commitContinuation();
        let translation = new Matrix();
        translation.translate(7, 9);
        selection.setInterimTransform(translation);
        selection.commitInterimTransform();
        bounds = selection.getBounds();
        check(bounds.x === 8 && bounds.y === 11 && bounds.width === 4 && bounds.height === 3
            && selection.getInterimTransform().isIdentity(), "Selection commit lost its transform or geometry");
        selection.data.cumulativeTransform.dispose();
        selection.data.cumulativeTransform = null;
        let cumulative = selection.getCumulativeTransformCopy();
        check(cumulative.isIdentity(), "Missing cumulative transform did not yield identity");
        selection.resetCumulativeTransform();
        check(selection.data.cumulativeTransform.isIdentity(), "Reset did not recreate the missing cumulative transform");
        selection.data.interimTransform.dispose();
        selection.data.interimTransform = null;
        let interim = selection.getInterimTransformCopy();
        check(interim.isIdentity() && interim !== cumulative, "Missing transform copies did not produce independent identity matrices");
        cumulative.dispose();
        interim.dispose();
        translation.dispose();
    } finally {
        selection.data.dispose();
    }
    app.closeDocumentWorkspace(workspace, false);
    phase("moving without a selection selects the canvas and ignores overlapping presses");
    workspace = app.createBlankDocumentInNewWorkspace(128, 128);
    app.setActiveTool(null);
    workspace.getActiveLayer().getSurface().clear();
    let surface = workspace.getActiveLayer().getSurface();
    surface.context.fillStyle = "red";
    surface.context.fillRect(30, 40, 20, 16);
    let original = surface.context.getImageData(0, 0, 128, 128).data;
    workspace.getHistory().clearAll();
    ToolType.MOVE.setSetting("resampling", "nearest");
    workspace.setZoom(1);
    app.setActiveToolFromType(ToolType.MOVE);
    let move = app.getActiveTool();
    move.onMouseMove(64, 64);
    check(!move.tracking && workspace.getSelection().isEmpty(), "Idle Move created a selection or a transaction");
    check(!move.onKeyPress("F12"), "Unsupported Move key started a gesture");
    move.onMouseDown(64, 64, MouseButton.MIDDLE);
    check(!move.tracking && workspace.getSelection().isEmpty(), "Middle-button Move began a bitmap gesture");
    move.onMouseDown(64, 64, MouseButton.LEFT);
    let selectedBounds = workspace.getSelection().getBounds();
    check(move.tracking && selectedBounds.width === 128 && selectedBounds.height === 128,
        "Move without a selection did not select the complete canvas");
    check(!move.onKeyPress(KeyButton.RIGHT), "A key nudge interrupted a tracked Move gesture");
    let start = move.context.startMouseXY.clone();
    move.onMouseDown(80, 80, MouseButton.LEFT);
    check(move.context.startMouseXY.equals(start), "A second press replaced the tracked gesture origin");
    move.onMouseUp(69, 67, MouseButton.LEFT);
    DocumentIO.finishActiveTool(false);
    let expected = new Uint8ClampedArray(128 * 128 * 4);
    for (let y = 43; y < 59; ++y) {
        for (let x = 35; x < 55; ++x) {
            expected.set([255, 0, 0, 255], (y * 128 + x) * 4);
        }
    }
    let actual = surface.context.getImageData(0, 0, 128, 128).data;
    check(actual.every((value, index) => value === expected[index]), "Whole-canvas Move did not preserve translated pixels");
    let history = workspace.getHistory();
    let steps = history.undoStack.length;
    for (let index = 0; index < steps; ++index) {
        history.stepBackward();
    }
    actual = surface.context.getImageData(0, 0, 128, 128).data;
    check(actual.every((value, index) => value === original[index]), "Whole-canvas Move undo lost its original pixels");
    DocumentIO.finishActiveTool(false);
    workspace.getSelection().reset();
    app.setActiveToolFromType(ToolType.MOVE);
    move = app.getActiveTool();
    move.onMouseDown(64, 64, MouseButton.RIGHT);
    check(move.context.currentMode === MoveToolBaseMode.ROTATE && !workspace.getSelection().isEmpty(),
        "Right-button Move without a selection did not begin rotation of the canvas");
    move.onMouseUp(64, 64, MouseButton.RIGHT);
    DocumentIO.finishActiveTool(false);
    actual = surface.context.getImageData(0, 0, 128, 128).data;
    check(actual.every((value, index) => value === original[index]), "Stationary whole-canvas rotation changed pixels");
    app.closeDocumentWorkspace(workspace, false);
};
