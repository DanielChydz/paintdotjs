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
    phase("abstract action failures are explicit and do not record successful history");
    for (let action of [new Action("contract-action", null, null, null),
        new AppWorkspaceAction("contract-app-action", null, null, null),
        new DocumentWorkspaceAction("contract-document-action", null, null, null),
        new FileAction("contract-file-action", "contract", null, null)]) {
        rejects(() => action.runPerformAction(), /No action implementation provided/);
        check(workspace.getHistory().undoStack.length === historySize, "Abstract action failure changed history");
    }
    let layerAction = new LayerAction("contract-layer-action", "contract", "contract", null);
    rejects(() => layerAction.runIsActionExecutable(), /No isLayerActionExecutable implementation/);
    phase("registered selection commands execute actual functions and preserve exact fill/erase pixels");
    let repeat = new RepeatEffectAction();
    let effectsMenu = PanelRegistry.get("mainMenu").get("menu.effects");
    check(effectsMenu.repeatEntry.getIconPath() === "effect_icon.png", "Unavailable Repeat did not use its generic effect icon");
    check(!repeat.isActionExecutable(workspace) && repeat.performAction(workspace) === null,
        "Repeat without a remembered effect changed the document");
    new SelectAllAction().runPerformAction();
    check(workspace.getSelection().getBounds().width === 16 && workspace.getSelection().getBounds().height === 12,
        "Select All command did not select the document bounds");
    let colors = FormRegistry.get("colorsForm");
    colors.setMainColor(new Color(200, 100, 50));
    new FillSelectionAction().runPerformAction();
    let filled = layer.getSurface().context.getImageData(0, 0, 16, 12).data;
    check(filled.every((value, index) => value === [200, 100, 50, 255][index % 4]),
        "Fill command did not replace selected pixels with the active paint color");
    let effect = new BitmapEffectAction(BitmapEffectEngine.DEFINITIONS.invertColorsEffect);
    let effectMemento = await effect.performAction(workspace, {});
    check(effectMemento instanceof HistoryMemento && !repeat.isActionExecutable(workspace),
        "An adjustment incorrectly enabled Repeat Effect");
    let inverted = layer.getSurface().context.getImageData(0, 0, 16, 12).data;
    check(inverted.every((value, index) => value === [55, 155, 205, 255][index % 4]),
        "Invert effect did not transform the filled pixels");
    check(await effect.performAction(workspace, {}) instanceof HistoryMemento,
        "A second invert adjustment did not return its history");
    check(layer.getSurface().context.getImageData(0, 0, 16, 12).data.every((value, index) => value === filled[index]),
        "Repeating invert did not recover the exact pre-effect pixels");
    let redEye = new BitmapEffectAction(BitmapEffectEngine.EFFECTS.redEyeRemoveEffect);
    check(await redEye.performAction(workspace, {tolerance: 100, saturation: 90}) instanceof HistoryMemento
        && repeat.isActionExecutable(workspace), "A completed effect did not enable Repeat");
    check(effectsMenu.repeatEntry.getIconPath() === "red_eye_remove_effect.png", "Repeat icon did not identify its remembered effect");
    effectsMenu.open();
    check(effectsMenu.entries[0] === effectsMenu.repeatEntry
        && effectsMenu.dropMenuElement.querySelector('img[src$="red_eye_remove_effect.png"]') !== null,
        "Effects menu did not render the remembered effect's Repeat entry");
    effectsMenu.close();
    let corrected = layer.getSurface().context.getImageData(0, 0, 16, 12).data;
    check(corrected.every((value, index) => value === [75, 100, 50, 255][index % 4]),
        "Red-eye removal did not replace excessive red while preserving the other channels");
    check(await repeat.performAction(workspace) instanceof HistoryMemento, "Repeat did not execute the remembered effect");
    check(layer.getSurface().context.getImageData(0, 0, 16, 12).data.every((value, index) => value === corrected[index]),
        "Repeating red-eye removal changed already-corrected pixels");
    new EraseSelectionAction().runPerformAction();
    check(layer.getSurface().context.getImageData(0, 0, 16, 12).data.every(value => value === 0),
        "Erase command did not clear its selected pixels");
    new SelectAllAction().runPerformAction();
    new InvertSelectionAction().runPerformAction();
    check(workspace.getSelection().isEmpty(), "Invert Selection command did not invert a full-document selection");
    new SelectAllAction().runPerformAction();
    new DeselectAction().runPerformAction();
    check(workspace.getSelection().isEmpty(), "Deselect command retained selected pixels");
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
    phase("unsaved document preview thumbnails activate their actual document workspace");
    let other = app.createBlankDocumentInNewWorkspace(64, 32);
    workspace.setDirty(true);
    other.setDirty(true);
    let unsaved = DocumentIO.showUnsavedChangesDialog([workspace, other], true);
    let unsavedDialog = document.querySelector(".task-dialog");
    let thumbnails = [...unsavedDialog.querySelectorAll(".unsaved-changes-thumbnail")];
    check(thumbnails.length === 2 && thumbnails[1].classList.contains("selected"),
        "Unsaved preview did not identify the active document");
    thumbnails[0].click();
    check(app.getActiveDocumentWorkspace() === workspace && thumbnails[0].classList.contains("selected")
        && !thumbnails[1].classList.contains("selected"), "Unsaved thumbnail did not activate its workspace exclusively");
    let firstPreview = thumbnails[0].querySelector("canvas");
    check(firstPreview.width === 16 && firstPreview.height === 12, "Unsaved preview changed an already-small canvas size");
    unsavedDialog.querySelector(".app-dialog-close").click();
    check(await unsaved === "cancel" && workspace.isDirty() && other.isDirty(),
        "Canceling an unsaved preview changed document dirty state");
    app.closeDocumentWorkspace(other, false);
    phase("document resolution and layer/renderer contracts preserve geometry");
    model.setResolution(48);
    check(model.getResolution() === 48 && model.pixelToPhysical(48, "inch") === 1,
        "Document resolution setter did not update physical conversion");
    model.setResolution(-2);
    check(model.getResolution() === 0.01, "Document resolution did not enforce its lower bound");
    model.setResolution("invalid");
    check(model.getResolution() === 96, "Invalid document resolution lost its default");
    let abstractLayer = new Layer(3, 4);
    rejects(() => abstractLayer.render(null, new Rectangle(0, 0, 3, 4)), /Not implemented/);
    rejects(() => abstractLayer.clone(), /Not implemented/);
    let list = new LayerList(model);
    list.addLayer(abstractLayer);
    list.clear();
    check(list.size() === 0 && list.getAt(0) === null && abstractLayer.getWidth() === 3,
        "Clearing a standalone layer list changed the source layer or retained its reference");
    workspace.setZoom(2);
    let box = new SurfaceBox(app);
    let nub = new MoveNubRenderer(box);
    let location = new Point(10, 20);
    nub.setLocation(location);
    nub.setAngle(30);
    nub.setShape(MoveNubShape.CIRCLE);
    box.addRenderer(nub);
    check(nub.getLocation() === location && nub.angle === 30 && nub.getShape() === MoveNubShape.CIRCLE
        && box.getRendererList().includes(nub), "Renderer controls lost their configured geometry or registration");
    let painted = nub.getOurRectangle();
    let padded = nub.getOurRectangle(true);
    check(painted.x === 8 && painted.y === 18 && painted.width === 4 && painted.height === 4
        && padded.x === 4 && padded.y === 14 && padded.width === 12 && padded.height === 12,
        "Move handle rectangles did not convert their device-pixel padding through the zoom");
    box.removeRenderer(nub);
    check(!box.getRendererList().includes(nub), "Removing a renderer retained its registration");
    nub.dispose();
    workspace.setZoom(1);
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
    phase("selection Move settings and disposal release the renderer/context resources");
    app.setActiveTool(null);
    let baselineRenderers = workspace.getSurfaceBox().getRendererList().length;
    app.setActiveToolFromType(ToolType.MOVE_SELECTION);
    let selectionMove = app.getActiveTool();
    ToolType.MOVE_SELECTION.setSetting("renderingQuality", "aliased");
    selectionMove.onSettingChanged("renderingQuality");
    check(workspace.getSelectionRenderer().renderingQuality === "aliased", "Selection Move setting did not update selection-edge quality");
    selectionMove.onSettingChanged("unrelated");
    app.setActiveTool(null);
    selectionMove.dispose();
    selectionMove.dispose();
    check(selectionMove.context === null && workspace.getSurfaceBox().getRendererList().length === baselineRenderers,
        "Disposing selection Move retained its context or canvas renderers");
    phase("Pan activation and Gradient preview bounds retain their public tool contracts");
    app.setActiveToolFromType(ToolType.PAN);
    check(app.getActiveTool().isActive() && !app.getActiveTool().isTracking(), "Pan activation unexpectedly began a gesture");
    app.setActiveToolFromType(ToolType.GRADIENT);
    let gradientBounds = app.getActiveTool().getPreviewBounds();
    check(gradientBounds.x === 0 && gradientBounds.y === 0 && gradientBounds.width === 128 && gradientBounds.height === 128,
        "Gradient preview bounds did not cover the active layer");
    app.setActiveTool(null);
    let baseForm = new Form("runtime-base-form");
    let baseWindow = new WebWindow();
    baseWindow.setSize(120, 90);
    baseForm.initializeDefault(baseWindow);
    baseForm.initialize(baseWindow);
    check(baseWindow.getWidth() === 120 && baseWindow.getHeight() === 90
        && baseForm.getWindow() === baseWindow && baseWindow.content.tagName === "DIV",
        "Base form initialization changed default geometry or lost its content/window");
    app.closeDocumentWorkspace(workspace, false);
};
