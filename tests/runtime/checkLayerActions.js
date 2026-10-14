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

module.exports = async function checkLayerActions() {
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
        check(failure !== null && pattern.test(failure.message), "Invalid history operation was accepted or failed incorrectly");
    };
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(8, 8);
    let layers = workspace.getDocument().getLayers();
    let history = workspace.getHistory();
    let original = workspace.getActiveLayer();
    let pixels = layer => layer.getSurface().context.getImageData(0, 0, 8, 8).data;
    let samePixels = (first, second) => first.every((value, index) => value === second[index]);
    let undoRedo = (undone, redone) => {
        history.stepBackward();
        undone();
        history.stepForward();
        redone();
    };
    phase("add, duplicate and delete preserve layer identity and pixels");
    history.clearAll();
    original.getSurface().context.fillStyle = "#123456";
    original.getSurface().context.fillRect(0, 0, 8, 8);
    let originalPixels = new Uint8ClampedArray(pixels(original));
    workspace.performAction(new AddNewLayerAction());
    check(layers.size() === 2 && workspace.getActiveLayer() !== original, "New layer was not inserted and activated");
    let blank = workspace.getActiveLayer();
    check(pixels(blank).every(value => value === 0) && history.undoStack.length === 1,
        "New layer is not transparent or its action added a duplicate/undefined history entry");
    undoRedo(
        () => check(layers.size() === 1 && layers.getAt(0) === original, "Adding-layer undo removed the wrong layer"),
        () => check(layers.size() === 2, "Adding-layer redo lost the new layer")
    );
    workspace.setActiveLayer(original);
    new DuplicateLayerAction().runPerformAction();
    check(layers.size() === 3, "Duplicate command did not add a layer");
    let duplicate = workspace.getActiveLayer();
    check(duplicate !== original && samePixels(pixels(duplicate), originalPixels), "Duplicate did not clone the selected layer pixels");
    undoRedo(
        () => check(layers.size() === 2 && layers.getAt(0) === original && !layers.list().includes(duplicate),
            "Duplicate undo removed the original instead of the duplicate"),
        () => check(layers.size() === 3 && layers.getAt(0) === original && samePixels(pixels(layers.getAt(1)), originalPixels),
            "Duplicate redo failed to restore copied pixels above the original")
    );
    workspace.setActiveLayerIndex(1);
    new DeleteLayerAction().runPerformAction();
    check(layers.size() === 2 && layers.getAt(0) === original, "Delete command removed the wrong layer");
    undoRedo(() => check(layers.size() === 3, "Deleting-layer undo did not restore its layer"),
        () => check(layers.size() === 2, "Deleting-layer redo did not remove its layer"));

    phase("adjacent and nonadjacent swaps, layer controls and properties history");
    workspace.setActiveLayerIndex(0);
    for (let command of [new MoveActiveLayerUpAction(), new MoveActiveLayerDownAction(),
        new MoveLayerToTopAction(), new MoveLayerToBottomAction()]) {
        let up = command instanceof MoveActiveLayerUpAction || command instanceof MoveLayerToTopAction;
        workspace.setActiveLayerIndex(up ? 0 : 1);
        let active = workspace.getActiveLayer();
        let before = [...layers.list()];
        check(command.runIsActionExecutable(), "Valid layer movement is disabled");
        command.runPerformAction();
        check(layers.getAt(up ? 1 : 0) === active, "Layer movement did not reach the expected index");
        undoRedo(
            () => check(layers.list().every((layer, index) => layer === before[index]), "Layer movement undo changed ordering"),
            () => check(layers.getAt(up ? 1 : 0) === active, "Layer movement redo changed its target")
        );
        workspace.setActiveLayerIndex(up ? 1 : 0);
        check(!command.runIsActionExecutable(), "Boundary layer movement is enabled");
        check(command.performAction(workspace) === null, "Boundary layer movement created history");
    }
    workspace.executeFunction(new AddNewBlankLayerFunction());
    let beforeSwap = [...layers.list()];
    workspace.executeFunction(new SwapLayerFunction(0, 2));
    check(layers.getAt(0) === beforeSwap[2] && layers.getAt(2) === beforeSwap[0], "Nonadjacent swap has wrong endpoints");
    undoRedo(
        () => check(layers.list().every((layer, index) => layer === beforeSwap[index]), "Nonadjacent swap undo changed ordering"),
        () => check(layers.getAt(0) === beforeSwap[2], "Nonadjacent swap redo lost the first endpoint")
    );
    let visibility = workspace.getActiveLayer().isVisible();
    let toggle = new ToggleLayerVisibilityAction();
    check(toggle.runIsActionExecutable(), "Visibility toggle is disabled");
    toggle.runPerformAction();
    check(workspace.getActiveLayer().isVisible() === !visibility, "Visibility command did not toggle its active layer");
    toggle.runPerformAction();
    let properties = new LayerPropertiesHistoryMemento("Properties", null, workspace, 0);
    let oldName = layers.getAt(0).properties.name;
    layers.getAt(0).properties.name = "Changed";
    history.pushNewMemento(properties);
    undoRedo(() => check(layers.getAt(0).properties.name === oldName, "Properties undo did not restore the original name"),
        () => check(layers.getAt(0).properties.name === "Changed", "Properties redo did not restore the changed name"));
    for (let index of [-1, layers.size()]) {
        rejects(() => new DeleteLayerFunction(index).execute(workspace), /layerIndex/);
        rejects(() => new DuplicateLayerFunction(index).execute(workspace), /layerIndex/);
        rejects(() => new MergeLayerDownFunction(index).execute(workspace), /layerIndex/);
        rejects(() => new SwapLayerFunction(index, 0).execute(workspace), /index1/);
        rejects(() => new SwapLayerFunction(0, index).execute(workspace), /index1/);
        rejects(() => new SwapLayerHistoryMemento("invalid", null, workspace, index, 0), /out of range/);
        rejects(() => new SwapLayerHistoryMemento("invalid", null, workspace, 0, index), /out of range/);
    }
    workspace.setActiveLayerIndex(2);
    let requestedSource = layers.getAt(0);
    requestedSource.getSurface().context.fillStyle = "lime";
    requestedSource.getSurface().context.fillRect(0, 0, 8, 8);
    let requestedPixels = new Uint8ClampedArray(pixels(requestedSource));
    workspace.executeFunction(new DuplicateLayerFunction(0));
    check(samePixels(pixels(layers.getAt(1)), requestedPixels), "Indexed duplication copied the active layer instead of its requested source");
    undoRedo(
        () => check(layers.getAt(0) === requestedSource && layers.size() === 3, "Indexed duplicate undo removed its source"),
        () => check(layers.size() === 4 && samePixels(pixels(layers.getAt(1)), requestedPixels), "Indexed duplicate redo lost its source pixels")
    );

    phase("actual layer-properties preview, cancellation and single history commit");
    workspace.setActiveLayerIndex(0);
    for (let outcome of ["cancel", "unchanged", "save"]) {
        let layer = workspace.getActiveLayer();
        let before = layer.properties.clone();
        let previousCount = history.undoStack.length;
        workspace.performAction(new LayerPropertiesAction());
        let dialog = document.querySelector(".layer-properties-dialog");
        check(dialog !== null, "Layer-properties action did not open its dialog");
        if (outcome !== "unchanged") {
            let name = dialog.querySelector('input[type="text"]');
            name.value = "Previewed layer";
            name.dispatchEvent(new Event("input", {bubbles: true}));
            let opacity = dialog.querySelector('input[type="range"]');
            opacity.value = "127";
            opacity.dispatchEvent(new Event("input", {bubbles: true}));
            check(layer.properties.name === "Previewed layer" && layer.properties.opacity === 127,
                "Properties dialog did not preview the actual layer");
        }
        if (outcome === "cancel") {
            [...dialog.querySelectorAll("button")].find(button => button.textContent === "Cancel").click();
        } else {
            dialog.requestSubmit();
        }
        await new Promise(resolve => setTimeout(resolve, 0));
        let memento = history.undoStack.length > previousCount ? history.undoStack.at(-1) : null;
        if (outcome === "save") {
            check(memento instanceof LayerPropertiesHistoryMemento && history.undoStack.length === previousCount + 1,
                "Changed properties did not commit exactly one history entry through the shared dispatcher");
            undoRedo(
                () => check(LayerProperties.areEqual(layer.properties, before), "Properties action undo lost its original state"),
                () => check(layer.properties.name === "Previewed layer" && layer.properties.opacity === 127,
                    "Properties action redo lost its committed state")
            );
        } else {
            check(memento === null && LayerProperties.areEqual(layer.properties, before),
                "Cancelled/unchanged properties modified the layer or created history");
        }
    }

    phase("shared action dispatcher propagates synchronous errors and reports rejected asynchronous actions");
    let previousCount = history.undoStack.length;
    let originalHandleError = app.handleError;
    let handledErrors = [];
    try {
        app.handleError = error => handledErrors.push(error);
        let failure = new Error("Asynchronous document action failed");
        workspace.performAction({performAction: () => Promise.reject(failure)});
        await new Promise(resolve => setTimeout(resolve, 0));
        check(handledErrors.length === 1 && handledErrors[0] === failure,
            "Rejected document action did not reach the application's error reporter exactly once");
        rejects(() => workspace.performAction({performAction: () => {
            throw new Error("Synchronous document action failed");
        }}), /Synchronous document action failed/);
        check(history.undoStack.length === previousCount, "Failed document action changed history");
    } finally {
        app.handleError = originalHandleError;
    }

    phase("actual layer-row double click selects its target and excludes visibility controls");
    let layerForm = FormRegistry.get("layerForm");
    let layerToEdit = layers.getAt(1);
    let layerItem = layerForm.getItemByLayer(layerToEdit);
    let previousLayer = workspace.getActiveLayer();
    layerItem.getElement().querySelector("input").dispatchEvent(new MouseEvent("dblclick", {bubbles: true}));
    check(document.querySelector(".layer-properties-dialog") === null && workspace.getActiveLayer() === previousLayer,
        "Visibility checkbox double click opened properties or selected a different layer");
    layerItem.thumbnail.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}));
    check(document.querySelector(".layer-properties-dialog") !== null && workspace.getActiveLayer() === layerToEdit,
        "Layer-row double click did not open properties for its clicked layer");
    document.querySelector(".layer-properties-dialog .app-dialog-close").click();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(history.undoStack.length === previousCount, "Canceled layer-row properties added history");

    phase("registered view and layer-navigation commands reach their document targets");
    let command = id => {
        let action = ActionRegistry.get(id);
        check(action !== null && action.runIsActionExecutable(), "Command is unavailable: " + id);
        action.runPerformAction();
    };
    workspace.setZoomToWindow(false);
    workspace.setZoom(2);
    command("menu.view.zoomIn");
    check(workspace.getZoom() === 2.5, "Zoom-in command used the wrong factor");
    command("menu.view.zoomOut");
    check(workspace.getZoom() === 2, "Zoom-out command used the wrong factor");
    command("menu.view.actualSize");
    check(workspace.getZoom() === 1, "Actual-size command did not reset zoom");
    command("menu.view.zoomToWindow");
    check(workspace.isZoomToWindow(), "Fit-to-window command did not enable fitting");
    workspace.getSelection().setContinuation(new Rectangle(1, 1, 3, 3), CombineMode.REPLACE);
    workspace.getSelection().commitContinuation();
    command("menu.view.zoomToSelection");
    check(workspace.getZoom() > 1, "Zoom-to-selection did not magnify a small selected region");
    let grid = app.isGridVisible();
    command("menu.view.grid");
    check(app.isGridVisible() === !grid && workspace.isGridVisible() === !grid, "Registered grid command did not toggle");
    command("menu.view.grid");
    let rulers = app.isRulersVisible();
    command("menu.view.rulers");
    check(app.isRulersVisible() === !rulers && workspace.isRulersVisible() === !rulers, "Registered rulers command did not toggle");
    command("menu.view.rulers");
    for (let unit of ["inch", "centimeter", "pixel"]) {
        command("measurementUnit." + unit);
        check(app.getMeasurementUnit() === unit, "Registered measurement command did not update units");
    }
    workspace.setActiveLayerIndex(0);
    command("menu.layers.goToLayerAbove");
    check(workspace.getActiveLayerIndex() === 1, "Layer-above command selected the wrong index");
    command("menu.layers.goToTopLayer");
    check(workspace.getActiveLayerIndex() === layers.size() - 1, "Top-layer command selected the wrong index");
    command("menu.layers.goToLayerBelow");
    check(workspace.getActiveLayerIndex() === layers.size() - 2, "Layer-below command selected the wrong index");
    command("menu.layers.goToBottomLayer");
    check(workspace.getActiveLayerIndex() === 0, "Bottom-layer command selected the wrong index");
    workspace.getSelection().reset();

    phase("merged layer pixels and reversible compound history");
    history.clearAll();
    while (layers.size() > 1) {
        layers.getAt(layers.size() - 1).dispose();
        layers.removeLayerAt(layers.size() - 1);
    }
    workspace.setActiveLayerIndex(0);
    let bottom = workspace.getActiveLayer();
    bottom.setVisible(true);
    bottom.getSurface().context.fillStyle = "red";
    bottom.getSurface().context.fillRect(0, 0, 8, 8);
    workspace.executeFunction(new AddNewBlankLayerFunction());
    let top = workspace.getActiveLayer();
    top.getSurface().context.fillStyle = "blue";
    top.getSurface().context.fillRect(0, 0, 4, 8);
    let merge = new MergeLayerDownAction();
    check(merge.runIsActionExecutable(), "Valid layer merge is disabled");
    merge.runPerformAction();
    check(layers.size() === 1 && pixels(bottom)[2] === 255 && pixels(bottom)[4 * 7] === 255, "Merge did not composite both layers");
    undoRedo(
        () => check(layers.size() === 2 && pixels(bottom)[0] === 255 && pixels(bottom)[2] === 0,
            "Merge undo did not restore the bottom pixels and deleted top"),
        () => check(layers.size() === 1 && pixels(bottom)[2] === 255, "Merge redo did not restore composite pixels")
    );
    check(!merge.runIsActionExecutable() && merge.performAction(workspace) === null, "Bottom-layer merge was permitted");
    check(!new DeleteLayerAction().runIsActionExecutable(), "Deleting the only layer is enabled");

    phase("selection fill replaces alpha, preserves holes and supports inversion/undo");
    let selection = workspace.getSelection();
    let rectangle = new Rectangle(1, 1, 6, 6);
    let path = new GraphicsPath();
    path.addRectangle(rectangle);
    let hole = new VertexList([], true);
    hole.addRectangle(3, 3, 2, 2);
    path.getVertexLists().push(hole);
    selection.setContinuationPath(path, CombineMode.REPLACE);
    selection.commitContinuation();
    workspace.setActiveLayer(bottom);
    let priorFill = new Uint8ClampedArray(pixels(bottom));
    let color = Color.fromRGBA(30, 60, 90, 128);
    workspace.executeFunction(new FillSelectionFunction(color));
    let filled = new Uint8ClampedArray(pixels(bottom));
    let offset = (2 * 8 + 2) * 4;
    check(filled[offset + 3] === 128 && Math.abs(filled[offset] - 30) <= 1, "Selection fill blended instead of replacing alpha");
    offset = (3 * 8 + 3) * 4;
    check(filled.slice(offset, offset + 4).every((value, index) => value === priorFill[offset + index]), "Selection fill painted its hole");
    undoRedo(() => check(samePixels(pixels(bottom), priorFill), "Selection fill undo changed original pixels"),
        () => check(samePixels(pixels(bottom), filled), "Selection fill redo changed filled pixels"));
    let colors = FormRegistry.get("colorsForm");
    colors.mainColor = Color.fromRGBA(200, 100, 50, 255);
    colors.secondaryColor = Color.fromRGBA(50, 100, 200, 255);
    for (let secondary of [false, true]) {
        new FillSelectionAction(secondary).runPerformAction();
        let offset = (2 * 8 + 2) * 4;
        check(pixels(bottom)[offset] === (secondary ? 50 : 200), "Fill command selected the wrong paint color");
    }
    workspace.executeFunction(new InvertSelectionFunction());
    let inverse = selection.createPath();
    check(inverse.getBounds().width === 8 && inverse.getBounds().height === 8, "Selection inversion lost document bounds");
    inverse.dispose();
    workspace.executeFunction(new SelectAllFunction());
    workspace.executeFunction(new InvertSelectionFunction());
    check(selection.isEmpty(), "Inverting Select All did not produce an empty selection");
    check(new InvertSelectionFunction().execute(workspace) === null, "Empty selection inversion created a memento");
    check(new FillSelectionFunction(color).execute(workspace) === null, "Empty selection fill created a memento");
    workspace.executeFunction(new SelectAllFunction());
    workspace.executeFunction(new DeselectFunction());
    check(selection.isEmpty(), "Deselect function retained a selection");
    let singleUse = new SelectAllFunction();
    singleUse.execute(workspace);
    rejects(() => singleUse.execute(workspace), /Already executed/);
    selection.setContinuation(new Rectangle(20, 20, 2, 2), CombineMode.REPLACE);
    selection.commitContinuation();
    check(new FillSelectionFunction(color).execute(workspace) === null, "Fully offscreen selection fill created a memento");

    phase("document flatten preserves composite pixels and restores layer identities through undo/redo");
    check(DocumentIO.flattenDocument() === false, "Flattening a one-layer image changed its document");
    workspace.getSelection().reset();
    bottom.properties.opacity = 255;
    bottom.properties.visible = true;
    bottom.getSurface().context.fillStyle = "#ff0000";
    bottom.getSurface().context.fillRect(0, 0, 8, 8);
    bottom.invalidate();
    new AddNewLayerAction().runPerformAction();
    let overlay = workspace.getActiveLayer();
    overlay.getSurface().context.fillStyle = "rgba(0,0,255,0.5)";
    overlay.getSurface().context.fillRect(0, 0, 8, 8);
    overlay.invalidate();
    let beforeDocument = workspace.getDocument();
    let beforeBottom = new Uint8ClampedArray(pixels(bottom));
    let beforeOverlay = new Uint8ClampedArray(pixels(overlay));
    history.clearAll();
    history.pushNewMemento(new NullHistoryMemento("Original layers", "assets/icons/menu_file_new_icon.png"));
    app.setActiveToolFromType(ToolType.PENCIL);
    check(DocumentIO.flattenDocument(), "Two-layer flatten did not replace the document");
    let flattenedDocument = workspace.getDocument();
    let flattenedLayer = workspace.getActiveLayer();
    let flattenedPixels = new Uint8ClampedArray(pixels(flattenedLayer));
    check(flattenedDocument !== beforeDocument && flattenedDocument.getLayers().size() === 1
        && flattenedDocument.getWidth() === 8 && flattenedDocument.getHeight() === 8,
    "Flatten lost image dimensions or retained the source layers");
    for (let offset = 0; offset < flattenedPixels.length; offset += 4) {
        check(flattenedPixels[offset] === 127 && flattenedPixels[offset + 1] === 0
            && flattenedPixels[offset + 2] === 128 && flattenedPixels[offset + 3] === 255,
        "Flattened pixels differ from the independent source-over composite");
    }
    check(workspace.getSelection().isEmpty() && workspace.isDirty()
        && app.getActiveTool().getType() === ToolType.PENCIL, "Flatten did not clear selection, mark dirty or restore the active tool");
    undoRedo(() => {
        check(workspace.getDocument() === beforeDocument && beforeDocument.getLayers().size() === 2
            && beforeDocument.getLayers().getAt(0) === bottom && beforeDocument.getLayers().getAt(1) === overlay,
        "Flatten undo lost original layer identities");
        check(samePixels(pixels(bottom), beforeBottom) && samePixels(pixels(overlay), beforeOverlay),
            "Flatten undo changed either source layer's pixels");
    }, () => {
        check(workspace.getDocument() === flattenedDocument && workspace.getActiveLayer() === flattenedLayer,
            "Flatten redo did not restore the flattened document/layer");
        check(samePixels(pixels(flattenedLayer), flattenedPixels), "Flatten redo changed composite pixels");
    });
    phase("actual History window undo, redo and row selection preserve document identity");
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "Layer/history UI did not settle");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let historyForm = FormRegistry.get("historyForm");
    await waitFor(() => historyForm.stripPanel.get("menu.edit.undo").isEnabled());
    historyForm.stripPanel.get("menu.edit.undo").getElement().click();
    check(workspace.getDocument() === beforeDocument, "History window Undo did not restore the layered document");
    await waitFor(() => historyForm.stripPanel.get("menu.edit.redo").isEnabled());
    historyForm.stripPanel.get("menu.edit.redo").getElement().click();
    check(workspace.getDocument() === flattenedDocument, "History window Redo did not restore the flattened document");
    await waitFor(() => historyForm.historyListItem.items.filter(item => item.getType() === ItemType.UNDO).length >= 2);
    let previousItem = historyForm.historyListItem.items.filter(item => item.getType() === ItemType.UNDO).at(-2);
    check(previousItem.getMemento() === previousItem.getKey() && previousItem.getText() === null,
        "History row did not retain its memento identity");
    previousItem.getElement().click();
    check(workspace.getDocument() === beforeDocument, "Selecting an earlier history row did not restore its document state");
    app.closeDocumentWorkspace(workspace, false);

    phase("layer visibility chooses the nearest visible layer and keeps an all-hidden active layer");
    workspace = app.createBlankDocumentInNewWorkspace(16, 16);
    workspace.executeFunction(new AddNewBlankLayerFunction());
    workspace.executeFunction(new AddNewBlankLayerFunction());
    layers = workspace.getDocument().getLayers();
    let first = layers.getAt(0);
    let middle = layers.getAt(1);
    let last = layers.getAt(2);
    layerForm = FormRegistry.get("layerForm");
    let originalPreference = AppSettingsStore.get("ui.autoSelectVisibleLayer", false);
    let hide = async layer => {
        await waitFor(() => layerForm.getItemByLayer(layer) !== null);
        let item = layerForm.getItemByLayer(layer);
        let input = item.getElement().querySelector("input");
        input.checked = false;
        input.dispatchEvent(new Event("input", {bubbles: true}));
        check(!layer.isVisible(), "Layer checkbox did not hide its own layer");
    };
    try {
        AppSettingsStore.set("ui.autoSelectVisibleLayer", true);
        await waitFor(() => layerForm.getItemByLayer(middle) !== null);
        layerForm.getItemByLayer(middle).getElement().click();
        check(workspace.getActiveLayer() === middle, "Clicking a layer row did not select its actual layer");
        await hide(middle);
        check(workspace.getActiveLayer() === first, "Hiding the middle layer did not prefer the visible layer below");
        first.setVisible(false);
        middle.setVisible(true);
        workspace.setActiveLayer(middle);
        await hide(middle);
        check(workspace.getActiveLayer() === last, "Hiding a layer with an invisible lower neighbor did not choose the visible upper neighbor");
        middle.setVisible(true);
        await hide(last);
        check(workspace.getActiveLayer() === middle, "Hiding the top layer did not choose its visible lower neighbor");
        await hide(middle);
        check(workspace.getActiveLayer() === middle && layers.list().every(layer => !layer.isVisible()),
            "Hiding every layer selected a missing layer or restored hidden visibility");
    } finally {
        AppSettingsStore.set("ui.autoSelectVisibleLayer", originalPreference);
    }
    app.closeDocumentWorkspace(workspace, false);
};
