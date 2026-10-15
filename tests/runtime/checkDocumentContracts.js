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
    phase("unattached renderer no-ops preserve all destination pixels");
    let unattachedBox = new SurfaceBox(app);
    check(unattachedBox.getScaleFactorRatio() === 1, "No-document render scale did not default to one");
    let destination = Surface.create(16, 12);
    destination.context.fillStyle = "#123456";
    destination.context.fillRect(0, 0, 16, 12);
    let rendererPixels = destination.context.getImageData(0, 0, 16, 12).data;
    let renderBounds = new Rectangle(0, 0, 16, 12);
    let previews = [new BrushPreviewRenderer(unattachedBox), new RotateCursorRenderer(unattachedBox),
        new RotateNubRenderer(unattachedBox)];
    unattachedBox.baseRenderer.render(destination, renderBounds);
    for (let preview of previews) {
        preview.render(destination, renderBounds);
    }
    previews[0].setPreview(new Point(4, 4), 5);
    previews[0].render(destination, renderBounds);
    unattachedBox.setSurface(destination);
    for (let preview of previews) {
        preview.location = null;
        preview.render(destination, renderBounds);
        preview.dispose();
    }
    check(destination.context.getImageData(0, 0, 16, 12).data.every((value, index) => value === rendererPixels[index]),
        "A renderer without geometry or a source changed destination pixels");
    let brushPreview = new BrushPreviewRenderer(unattachedBox);
    destination.clear();
    brushPreview.setPreview(new Point(4, 4), 3, "circle", 1, true);
    brushPreview.render(destination, renderBounds);
    let alignedOutline = destination.context.getImageData(0, 0, 16, 12).data;
    check(alignedOutline.some(value => value !== 0), "Brush preview did not render an outline");
    destination.clear();
    brushPreview.setPreview(new Point(4.5, 4.5), 3, "circle", 1, false);
    brushPreview.render(destination, renderBounds);
    check(destination.context.getImageData(0, 0, 16, 12).data.every((value, index) => value === alignedOutline[index]),
        "Continuous brush preview introduced a second half-pixel offset");
    brushPreview.setPreview(null, 3);
    destination.clear();
    brushPreview.render(destination, renderBounds);
    check(!brushPreview.isVisible() && destination.context.getImageData(0, 0, 16, 12).data.every(value => value === 0),
        "Clearing a brush preview retained visibility or pixels");
    brushPreview.dispose();
    let selected = new Selection();
    let edgeRenderer = new SelectionRenderer(unattachedBox, selected);
    let edgePath = new GraphicsPath();
    edgePath.addRectangle(new Rectangle(3.2, 3.2, 4, 4));
    destination.clear();
    edgeRenderer.renderingQuality = "aliased";
    edgeRenderer.renderPath(destination.context, renderBounds, edgePath, {});
    let edgePixels = destination.context.getImageData(0, 0, 16, 12).data;
    check(edgePixels[(3 * 16 + 5) * 4 + 3] === 255 && edgePixels[(5 * 16 + 5) * 4 + 3] === 0,
        "Aliased selection outline did not snap to opaque pixel centers or filled the interior: "
            + edgePixels[(3 * 16 + 5) * 4 + 3] + ", " + edgePixels[(5 * 16 + 5) * 4 + 3]);
    edgeRenderer.outlineAnimation = false;
    destination.clear();
    edgeRenderer.renderSelection(destination, renderBounds, edgePath);
    let staticOutline = destination.context.getImageData(0, 0, 16, 12).data;
    await new Promise(resolve => setTimeout(resolve, 45));
    destination.clear();
    edgeRenderer.renderSelection(destination, renderBounds, edgePath);
    check(destination.context.getImageData(0, 0, 16, 12).data.every((value, index) => value === staticOutline[index])
        && staticOutline.some(value => value !== 0), "Disabled marching ants changed their rendered outline over time");
    edgeRenderer.dispose();
    edgePath.dispose();
    selected.data.dispose();
    destination.dispose();
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
    phase("empty, offscreen and non-bitmap selection commands do not record edits");
    let originalSelection = workspace.getSelection();
    check(workspace.executeFunction(new EraseSelectionFunction()) === HistoryFunctionResult.SUCCESS, "Empty erase created history");
    originalSelection.setContinuation(new Rectangle(100, 100, 4, 4), CombineMode.REPLACE);
    originalSelection.commitContinuation();
    check(workspace.executeFunction(new EraseSelectionFunction()) === HistoryFunctionResult.SUCCESS, "Offscreen erase created history");
    workspace.activeLayer = new Layer(16, 12);
    check(workspace.executeFunction(new EraseSelectionFunction()) === HistoryFunctionResult.SUCCESS
        && workspace.executeFunction(new FillSelectionFunction(new Color(255, 0, 0))) === HistoryFunctionResult.SUCCESS,
        "Non-bitmap selection commands created history");
    workspace.activeLayer = layer;
    originalSelection.reset();
    let colorsForm = FormRegistry.get("colorsForm");
    FormRegistry.unregister("colorsForm");
    try {
        check(new FillSelectionAction().performAction(workspace) === undefined,
            "Fill without a color provider reported an edit");
    } finally {
        FormRegistry.forms.colorsForm = colorsForm;
    }
    check(workspace.getHistory().undoStack.length === historySize, "No-op selection command changed history");
    let farRegion = Region.fromRectangle(new Rectangle(100, 100, 4, 4));
    let noPixels = new BitmapHistoryMemento("offscreen", null, workspace, 0, farRegion);
    check(noPixels.chunks.length === 0 && noPixels.bounds.isEmpty(), "Offscreen bitmap snapshot retained pixel chunks");
    let noPixelsRedo = noPixels.performUndo();
    check(noPixelsRedo.chunks.length === 0 && noPixelsRedo.getId() === noPixels.getId(),
        "Empty bitmap undo did not preserve its identity or created pixel data");
    farRegion.dispose();
    let emptyFigure = new GraphicsPath([new VertexList()]);
    layer.getSurface().context.clearRect(0, 0, 16, 12);
    FillSelectionFunction.tracePath(layer.getSurface().context, emptyFigure);
    layer.getSurface().context.fill();
    check(layer.getSurface().context.getImageData(0, 0, 16, 12).data.every(value => value === 0),
        "Tracing an empty figure unexpectedly filled pixels");
    emptyFigure.dispose();
    phase("document invalidation clips rectangle arrays and preserves unit fallbacks");
    model.invalidate([new Rectangle(-2, -3, 5, 6), new Rectangle(100, 100, 1, 1)]);
    check(model.updateRegion.length === 1 && model.updateRegion[0].x === 0 && model.updateRegion[0].y === 0
        && model.updateRegion[0].width === 3 && model.updateRegion[0].height === 3,
        "Document invalidation did not clip or discard out-of-bounds rectangles");
    check(model.pixelToPhysical(27, "unknown") === 27, "Unknown measurement unit changed pixels");
    rejects(() => model.getLayers().indexOf(null), /layer is null/);
    phase("abstract action failures are explicit and do not record successful history");
    for (let action of [new Action("contract-action", null, null, null),
        new AppWorkspaceAction("contract-app-action", null, null, null),
        new DocumentWorkspaceAction("contract-document-action", null, null, null),
        new FileAction("contract-file-action", "contract", null, null)]) {
        rejects(() => action.runPerformAction(), /No action implementation provided/);
        rejects(() => action.createIconItem().pressable(), /No action implementation provided/);
        rejects(() => action.createDropEntry().pressable(), /No action implementation provided/);
        check(workspace.getHistory().undoStack.length === historySize, "Abstract action failure changed history");
    }
    let layerAction = new LayerAction("contract-layer-action", "contract", "contract", null);
    rejects(() => layerAction.runIsActionExecutable(), /No isLayerActionExecutable implementation/);
    phase("Move contexts dispose owned transforms and paths without invalidating history clones");
    for (let context of [new MoveToolBaseContext(), new MoveToolContext()]) {
        context.baseTransform = new Matrix();
        context.baseTransform.translate(3, 4);
        context.liftTransform = new Matrix();
        context.deltaTransform = new Matrix();
        context.startPath = new GraphicsPath();
        context.startPath.addRectangle(new Rectangle(1, 2, 3, 4));
        let resources = [context.baseTransform, context.liftTransform, context.deltaTransform, context.startPath];
        let historyClone = context.clone();
        context.dispose();
        context.dispose();
        check(context.baseTransform === null && context.liftTransform === null && context.deltaTransform === null
            && context.startPath === null && resources.slice(0, 3).every(matrix => matrix.elements === null)
            && resources[3].vertexLists === null,
        "Disposing a Move context retained owned transforms/path or was not idempotent");
        let clonePoint = new Point(1, 2);
        historyClone.baseTransform.transformPoints([clonePoint]);
        check(clonePoint.x === 4 && clonePoint.y === 6 && historyClone.startPath.getBounds().width === 3,
            "Disposing a Move context invalidated its independent history clone");
        historyClone.dispose();
    }
    phase("typed tool history rejects incompatible active tools before changing pixels");
    app.setActiveToolFromType(ToolType.PENCIL);
    let moveContext = new MoveToolContext();
    let selectionContext = new MoveToolBaseContext();
    let typedMementos = [new MoveContextHistoryMemento(workspace, moveContext, "move", null),
        new MoveSelectionContextHistoryMemento(workspace, selectionContext, "selection", null),
        new ShapeCommitHistoryMemento(workspace, null, null, "shape commit", null, true),
        new ShapeDrawHistoryMemento(workspace, "shape draw", null),
        new ShapeEditHistoryMemento(workspace, null, "shape edit", null)];
    for (let memento of typedMementos) {
        rejects(() => memento.onToolUndo(), /Current [Tt]ool is not/);
        memento.data?.context?.dispose();
    }
    moveContext.dispose();
    selectionContext.dispose();
    check(app.getActiveTool().getType() === ToolType.PENCIL && workspace.getHistory().undoStack.length === historySize,
        "Rejected typed history replaced the active tool or changed history");
    app.setActiveTool(null);
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
    phase("removing inactive or final layers preserves a valid active-layer reference");
    let detachedWorkspace = new DocumentWorkspace(app);
    detachedWorkspace.setDocument(new Document(2, 2));
    let detachedLayers = detachedWorkspace.getDocument().getLayers();
    let detachedRows = [];
    for (let index = 0; index < 4; ++index) {
        let row = Layer.createLayer(detachedWorkspace, 2, 2, "Detached " + index);
        detachedRows.push(row);
        detachedWorkspace.getDocument().addLayer(row);
    }
    detachedWorkspace.setActiveLayer(detachedRows[3]);
    detachedLayers.removeLayerAt(1);
    check(detachedWorkspace.getActiveLayer() === detachedRows[3], "Removing an inactive layer changed the active layer");
    detachedLayers.removeLayerAt(2);
    check(detachedWorkspace.getActiveLayer() === detachedRows[2], "Removing the last active row did not select its previous neighbor");
    detachedLayers.removeLayerAt(0);
    detachedLayers.removeLayerAt(0);
    check(detachedLayers.size() === 0 && detachedWorkspace.getActiveLayer() === null,
        "Removing the final layer retained a foreign active-layer reference");
    detachedWorkspace.dispose();
    for (let row of detachedRows) {
        row.dispose();
    }
    let zoomBeforeEmpty = workspace.getZoom();
    workspace.zoomToRectangle(null);
    workspace.zoomToRectangle(new Rectangle(2, 3, 0, 0));
    check(workspace.getZoom() === zoomBeforeEmpty, "Missing/empty zoom bounds changed the document zoom");
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
    let fallbackResolution = new Document(3, 4, "invalid");
    check(fallbackResolution.getResolution() === 96 && fallbackResolution.pixelToPhysical(96, "inch") === 1,
        "Invalid constructor resolution did not recover 96 DPI");
    let legacyLayer = new BitmapLayer(workspace, 1, 1, Color.fromRGBA(12, 34, 56, 255));
    legacyLayer.properties = new LayerProperties("Legacy", true, false);
    let legacyComposite = Surface.create(1, 1);
    legacyLayer.render(new RenderArgs(legacyComposite), new Rectangle(0, 0, 1, 1));
    check([...legacyComposite.context.getImageData(0, 0, 1, 1).data].join(",") === "12,34,56,255",
        "Layer without saved opacity lost its opaque default");
    legacyLayer.dispose();
    legacyComposite.dispose();
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
    rejects(() => nub.setTransform(null), /transform/);
    box.addRenderer(nub);
    check(nub.getLocation() === location && nub.angle === 30 && nub.getShape() === MoveNubShape.CIRCLE
        && box.getRendererList().includes(nub), "Renderer controls lost their configured geometry or registration");
    let painted = nub.getOurRectangle();
    let padded = nub.getOurRectangle(true);
    check(painted.x === 8 && painted.y === 18 && painted.width === 4 && painted.height === 4
        && padded.x === 4 && padded.y === 14 && padded.width === 12 && padded.height === 12,
        "Move handle rectangles did not convert their device-pixel padding through the zoom");
    check(nub.isPointTouching(new Point(12, 20), false) && !nub.isPointTouching(new Point(12.1, 20), false)
        && nub.isPointTouching(new Point(12.1, 20), true),
        "Unpadded handle hit testing ignored the exact painted radius or padded extent");
    nub.setHitTestPadding("invalid");
    check(nub.hitTestPadding === 0 && !nub.isPointTouching(new Point(12.1, 20), true),
        "Invalid handle padding did not recover an unpadded hit region");
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
