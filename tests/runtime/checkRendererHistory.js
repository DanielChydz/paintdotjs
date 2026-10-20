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

module.exports = async function checkRendererHistory() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(64, 64);
    app.setActiveTool(null);
    let selection = workspace.getSelection();
    selection.setContinuation(new Rectangle(12, 12, 16, 16), CombineMode.REPLACE);
    selection.commitContinuation();

    // Fade real selection pixels with a deterministic clock and no extra timer.
    let renderer = workspace.getSelectionRenderer();
    renderer.setSelectionTinting(false);
    renderer.setRenderingQuality("aliased");
    let destination = Surface.create(64, 64);
    let bounds = new Rectangle(0, 0, 64, 64);
    let now = Date.now;
    let time = 1000;
    let animations = AppSettingsStore.get("ui.animations", true);
    try {
        AppSettingsStore.set("ui.animations", true);
        Date.now = () => time;
        renderer.setOutlineAnimation(true);
        renderer.resetOutlineWhiteOpacity();
        renderer.render(destination, bounds);
        let dark = [...destination.context.getImageData(0, 0, 64, 64).data];
        check(renderer.whiteOpacity === 0 && renderer.isAnimationActive(), "Reset did not hide the white outline while animating");
        time += 100;
        destination.clear();
        renderer.render(destination, bounds);
        check(renderer.whiteOpacity === 127.5, "White outline did not fade back gradually");
        time += 150;
        destination.clear();
        renderer.render(destination, bounds);
        let bright = [...destination.context.getImageData(0, 0, 64, 64).data];
        check(renderer.whiteOpacity === 255 && !same(dark, bright), "White fade did not restore the actual rendered outline");
        AppSettingsStore.set("ui.animations", false);
        check(!renderer.isAnimationActive() && renderer.whiteOpacity === 255,
            "Global animation preference did not immediately stop the selection fade");
        AppSettingsStore.set("ui.animations", true);
        renderer.resetOutlineWhiteOpacity();
        renderer.setOutlineAnimation(false);
        renderer.resetOutlineWhiteOpacity();
        destination.clear();
        renderer.render(destination, bounds);
        let staticPixels = [...destination.context.getImageData(0, 0, 64, 64).data];
        time += 1000;
        destination.clear();
        renderer.render(destination, bounds);
        check(renderer.whiteOpacity === 255 && !renderer.isAnimationActive()
            && same(staticPixels, [...destination.context.getImageData(0, 0, 64, 64).data]),
        "Disabled animation hid or animated the static outline");
    } finally {
        Date.now = now;
        AppSettingsStore.set("ui.animations", animations);
        destination.dispose();
    }

    // Overlay mutations must repaint without recompositing the document.
    let box = workspace.getSurfaceBox();
    let nub = new MoveNubRenderer(box);
    nub.setLocation(new Point(8, 8));
    box.addRenderer(nub);
    await frame();
    await frame();
    let revision = workspace.compositionRevision;
    let canvas = app.canvas;
    let before = [...canvas.context.getImageData(0, 0, canvas.width, canvas.height).data];
    app.renderDirty = false;
    let location = new Point(48, 48);
    nub.setLocation(location);
    check(app.renderDirty, "Moving an overlay without mouse input did not request presentation");
    await frame();
    await frame();
    check(!same(before, [...canvas.context.getImageData(0, 0, canvas.width, canvas.height).data])
        && workspace.compositionRevision === revision, "Moving a handle did not repaint or recomposited document pixels");
    app.renderDirty = false;
    nub.setLocation(location);
    nub.setAngle(30);
    check(app.renderDirty, "Canvas control angle did not invalidate presentation");
    app.renderDirty = false;
    nub.setAngle(30);
    nub.setShape(nub.getShape());
    check(!app.renderDirty, "Unchanged control geometry invalidated presentation");
    nub.setShape(MoveNubShape.COMPASS);
    check(app.renderDirty, "Handle shape did not invalidate presentation");
    app.renderDirty = false;
    let transform = new Matrix();
    transform.translate(2, 3);
    nub.setTransform(transform);
    check(app.renderDirty && nub.getTransformedLocation().x === 50, "Handle transform did not update geometry and presentation");
    let rotate = new RotateNubRenderer(box);
    box.addRenderer(rotate);
    app.renderDirty = false;
    rotate.setAngle(45);
    check(app.renderDirty, "Rotation anchor angle did not invalidate");
    app.renderDirty = false;
    rotate.setAngle(45);
    rotate.setLocation(location);
    check(app.renderDirty, "Rotation anchor location did not invalidate");
    app.renderDirty = false;
    rotate.setLocation(location);
    rotate.setVisible(true);
    check(!app.renderDirty, "Unchanged location or visibility requested redundant presentation");
    let indicator = new RotateCursorRenderer(box);
    box.addRenderer(indicator);
    indicator.setIndicator(new Point(20, 20), 1);
    indicator.setVisible(true);
    for (let control of [nub, rotate, indicator]) {
        control.dispose();
        control.dispose();
        control.invalidate();
        check(!box.getRendererList().includes(control) && control.surfaceBox === null,
            "Disposed handle retained its registration or owner");
    }

    // A renderer owns its path/subscription; the box only borrows its surface.
    let temporaryBox = new SurfaceBox(app);
    let borrowed = Surface.create(4, 4);
    temporaryBox.setSurface(borrowed);
    let temporarySelection = new Selection();
    let baseline = temporarySelection.changed.listeners.length;
    let temporary = new SelectionRenderer(temporaryBox, temporarySelection);
    temporaryBox.addRenderer(temporary);
    temporaryBox.addRenderer(temporary);
    temporarySelection.setContinuation(new Rectangle(0, 0, 2, 2), CombineMode.REPLACE);
    temporarySelection.commitContinuation();
    let path = temporary.selectedPath;
    let disposals = 0;
    let disposePath = path.dispose.bind(path);
    path.dispose = () => { ++disposals; disposePath(); };
    temporaryBox.dispose();
    temporaryBox.dispose();
    check(temporarySelection.changed.listeners.length === baseline && disposals === 1
        && temporaryBox.getRendererList().length === 0 && temporaryBox.getSurface() === null
        && borrowed.canvas.width === 4, "Renderer teardown leaked listeners/paths or disposed a borrowed surface");
    temporarySelection.reset();
    check(temporary.selectedPath === null && temporary.selection === null, "Disposed selection renderer reacted to selection changes");
    let staleSettingsCalls = 0;
    temporary.resetOutlineWhiteOpacity = () => { ++staleSettingsCalls; };
    window.dispatchEvent(new CustomEvent("paintdotjs:setting-changed", {detail: {path: "ui.animations"}}));
    check(staleSettingsCalls === 0, "Disposed selection renderer retained a global settings subscription");
    let empty = new SelectionRenderer(temporaryBox, temporarySelection);
    empty.dispose();
    temporarySelection.data.dispose();
    borrowed.dispose();

    // Temporary selection previews follow the same ownership contract.
    app.setActiveToolFromType(ToolType.RECTANGLE_SELECT);
    let selectionTool = app.getActiveTool();
    let previewRenderer = selectionTool.newSelectionRenderer;
    let previewSelection = selectionTool.newSelection;
    app.setActiveTool(null);
    check(previewRenderer.disposed && previewSelection.changed.listeners.length === 0
        && !box.getRendererList().includes(previewRenderer), "Changing tools retained the temporary selection renderer");

    // Each gesture and Finish has a stable series, independent of adjacent gestures.
    for (let type of [ToolType.MOVE_SELECTION, ToolType.MOVE]) {
        app.setActiveTool(null);
        selection.reset();
        selection.setContinuation(new Rectangle(12, 12, 16, 16), CombineMode.REPLACE);
        selection.commitContinuation();
        let surface = workspace.getActiveLayer().getSurface();
        surface.clear(Color.fromRGBA(0, 0, 0, 0));
        surface.context.fillStyle = "#e04020";
        surface.context.fillRect(12, 12, 16, 16);
        workspace.getDocument().invalidate();
        let history = workspace.getHistory();
        history.clearAll();
        history.pushNewMemento(new NullHistoryMemento("Start", null));
        check(history.undoStack[0].getSeriesGuid() === null, "Unrelated history acquired a transform series");
        app.setActiveToolFromType(type);
        let tool = app.getActiveTool();
        let drag = (startX, startY, endX, endY) => {
            tool.beginTransform(startX, startY, MouseButton.LEFT, true);
            tool.onMouseUp(endX, endY, MouseButton.LEFT);
            return history.undoStack.at(-1);
        };
        let first = drag(20, 20, 22, 20);
        let afterFirst = [...surface.context.getImageData(0, 0, 64, 64).data];
        let firstBounds = selection.getBounds();
        let second = drag(22, 20, 22, 23);
        let afterSecond = [...surface.context.getImageData(0, 0, 64, 64).data];
        let secondBounds = selection.getBounds();
        check(first.getSeriesGuid() !== null && second.getSeriesGuid() !== first.getSeriesGuid(),
            "Independent gestures shared a history series");
        let firstId = first.getSeriesGuid();
        let secondId = second.getSeriesGuid();
        history.stepBackward();
        check(history.redoStack[0].getSeriesGuid() === secondId && selection.getBounds().x === firstBounds.x
            && selection.getBounds().y === firstBounds.y && same(afterFirst, [...surface.context.getImageData(0, 0, 64, 64).data]),
        "Undo changed series identity or crossed a gesture boundary");
        history.stepForward();
        check(history.undoStack.at(-1).getSeriesGuid() === secondId && selection.getBounds().x === secondBounds.x
            && selection.getBounds().y === secondBounds.y && same(afterSecond, [...surface.context.getImageData(0, 0, 64, 64).data]),
        "Redo changed series identity or pixels");
        tool.drop();
        let finish = history.undoStack.at(-1);
        check(finish.getSeriesGuid() !== null && finish.getSeriesGuid() !== secondId,
            "Finish lost its series after replacing the tool context");
        history.stepBackward();
        check(history.redoStack[0].getSeriesGuid() === finish.getSeriesGuid(), "Undo Finish lost its series");
        history.stepForward();
        check(history.undoStack.at(-1).getSeriesGuid() === finish.getSeriesGuid()
            && first.getSeriesGuid() === firstId, "Redo Finish changed existing gesture identity");
    }
    app.setActiveTool(null);
    let ownedBox = workspace.getSurfaceBox();
    let selected = workspace.getSelection();
    let selectedRenderer = workspace.getSelectionRenderer();
    let ownedCanvas = workspace.compositionSurface.canvas;
    let listenerCount = selected.changed.listeners.length;
    app.closeDocumentWorkspace(workspace, false);
    check(selectedRenderer.disposed && selected.changed.listeners.length === listenerCount - 1
        && ownedBox.getRendererList().length === 0 && ownedCanvas.width === 0,
        "Closing a document retained renderers, their selection subscription or composition surface");
};
