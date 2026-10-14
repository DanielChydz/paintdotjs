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
};
