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
    new AddNewLayerAction().runPerformAction();
    check(layers.size() === 2 && workspace.getActiveLayer() !== original, "New layer was not inserted and activated");
    let blank = workspace.getActiveLayer();
    check(pixels(blank).every(value => value === 0), "New layer is not transparent");
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
    app.closeDocumentWorkspace(workspace, false);
};
