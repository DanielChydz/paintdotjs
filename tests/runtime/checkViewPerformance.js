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

module.exports = async function checkViewPerformance() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    app.setActiveTool(null);
    let counts = {compositions: 0, allocations: 0, resizes: 0};
    let create = Surface.create;
    let update = Document.prototype.update;
    let setWidth = app.canvas.setWidth;
    let setHeight = app.canvas.setHeight;
    let measure = async (name, operation) => {
        counts = {compositions: 0, allocations: 0, resizes: 0};
        await operation();
        await frame();
        require("electron").ipcRenderer.send("paintdotjs:test-phase", name + ": " + JSON.stringify(counts));
        return {...counts};
    };
    try {
        Surface.create = function (...args) {
            ++counts.allocations;
            return create.apply(this, args);
        };
        Document.prototype.update = function (...args) {
            ++counts.compositions;
            return update.apply(this, args);
        };
        app.canvas.setWidth = function (...args) {
            ++counts.resizes;
            return setWidth.apply(this, args);
        };
        app.canvas.setHeight = function (...args) {
            ++counts.resizes;
            return setHeight.apply(this, args);
        };
        let workspace;
        let created = await measure("new 1024x768 document", () => {
            workspace = app.createBlankDocumentInNewWorkspace(1024, 768);
        });
        check(created.compositions === 1 && created.allocations === 3 && created.resizes === 0,
            "Creating a document performed redundant compositions or surface allocations");
        check(workspace.getCompositionSurface().getColorAt(0, 0).getAlpha() === 255,
            "New background was not composited");
        workspace.setZoom(2);
        let composition = workspace.getCompositionSurface();
        let scrolled = await measure("100 scroll updates", () => {
            for (let index = 0; index < 100; ++index) {
                workspace.setViewPosition(100 + index, 80 + index);
            }
        });
        check(scrolled.compositions === 0 && scrolled.allocations === 0 && scrolled.resizes === 0,
            "Scrolling recomposited or reallocated document pixels");
        let position = workspace.toDocumentPosition(new Point(app.getViewWidth() / 2, app.getViewHeight() / 2), true);
        let resized = await measure("20 unchanged resize events", () => {
            for (let index = 0; index < 20; ++index) {
                app.onResize(app.getViewWidth(), app.getViewHeight());
            }
        });
        check(resized.compositions === 0 && resized.allocations === 0 && resized.resizes === 0,
            "Window resizing recomposited or reallocated the document");
        let after = workspace.toDocumentPosition(new Point(app.getViewWidth() / 2, app.getViewHeight() / 2), true);
        check(position.x === after.x && position.y === after.y && workspace.getZoom() === 2
            && workspace.getCompositionSurface() === composition, "Resize lost the document center or zoom");
        let originalWidth = app.view.style.width;
        let originalHeight = app.view.style.height;
        try {
            app.view.style.width = Math.max(120, app.getViewWidth() - 100) + "px";
            app.view.style.height = Math.max(120, app.getViewHeight() - 60) + "px";
            let changed = await measure("changed viewport dimensions", () => app.onResize(app.getViewWidth(), app.getViewHeight()));
            after = workspace.toDocumentPosition(new Point(app.getViewWidth() / 2, app.getViewHeight() / 2), true);
            check(Math.abs(position.x - after.x) < 1e-9 && Math.abs(position.y - after.y) < 1e-9
                && changed.compositions === 0 && changed.allocations === 0 && changed.resizes === 2,
            "A real viewport resize lost its center or reallocated document surfaces");
        } finally {
            app.view.style.width = originalWidth;
            app.view.style.height = originalHeight;
            app.onResize(app.getViewWidth(), app.getViewHeight());
        }
        let surface = workspace.getActiveLayer().getSurface();
        surface.context.fillStyle = "red";
        surface.context.fillRect(0, 0, 1, 1);
        workspace.getActiveLayer().invalidate(new Rectangle(0, 0, 1, 1));
        workspace.setViewPosition(40, 50);
        await frame();
        check(composition.getColorAt(0, 0).getRed() === 255 && composition.getColorAt(0, 0).getGreen() === 0,
            "Scrolling lost an invalidated pixel");
        workspace.setZoomToWindow(true);
        await measure("fit-to-window resize", () => app.onResize(app.getViewWidth(), app.getViewHeight()));
        check(workspace.isZoomToWindow() && workspace.viewportX === app.getViewWidth() / 2
            && workspace.viewportY === app.getViewHeight() / 2, "Fitted resize did not center the image");
        check(app.renderDirty === false, "Resize failed to present its invalidated frame");
        let other = app.createBlankDocumentInNewWorkspace(32, 32);
        let activeX = app.getViewX();
        let activeY = app.getViewY();
        workspace.setViewPosition(17, 23);
        check(app.getViewX() === activeX && app.getViewY() === activeY
            && app.getActiveDocumentWorkspace() === other, "An inactive document moved the active viewport");
        app.setActiveDocumentWorkspace(workspace);
        check(workspace.viewportX === 17 && workspace.viewportY === 23,
            "Activating a document discarded its saved viewport");
    } finally {
        Surface.create = create;
        Document.prototype.update = update;
        app.canvas.setWidth = setWidth;
        app.canvas.setHeight = setHeight;
    }
};
