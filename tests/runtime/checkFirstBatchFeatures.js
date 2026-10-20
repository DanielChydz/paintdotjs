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

module.exports = async function checkFirstBatchFeatures() {
    let check = (condition, message) => { if (!condition) { throw new Error(message); } };
    let reject = async (operation, pattern) => {
        let error;
        try { await operation(); } catch (failure) { error = failure; }
        check(error !== undefined && pattern.test(error.message), "Expected rejection: " + pattern);
    };
    await RecentFilesStore.clear();
    await RecentFilesStore.remember("unavailable.png", null);
    check(RecentFilesStore.entries.length === 0, "Pathless downloads must not become broken recent entries");
    for (let i = 0; i < 12; ++i) {
        await RecentFilesStore.remember("name" + i + ".png", "/tmp/name" + i + ".png");
    }
    check(RecentFilesStore.entries.length === 10, "Recent file limit was ignored");
    await RecentFilesStore.remember("name4.png", "/tmp/name4.png");
    check(RecentFilesStore.entries[0].name === "name4.png" && RecentFilesStore.entries.length === 10,
        "Recent duplicates were not promoted");
    RecentFilesStore.initialization = null;
    await RecentFilesStore.load();
    check(RecentFilesStore.entries.length === 10, "Recent files did not persist");
    let menu = new FileMenu();
    menu.initialize(null);
    document.body.appendChild(menu.element);
    menu.open();
    let recent = menu.entries[2];
    recent.setEnabledFromActionExecutable();
    await recent.open();
    check(recent.submenuElement.textContent.includes("name4.png"), "Recent submenu did not show persisted files");
    let reportRecent = app.handleError;
    try {
        await new Promise(resolve => {
            app.handleError = error => { check(error instanceof Error, "Missing file lost its diagnostic"); resolve(); };
            recent.entries[0].pressable();
        });
    } finally { app.handleError = reportRecent; }
    recent.close();
    menu.close();
    await recent.open(); // Closed parent must not reopen asynchronously.
    await RecentFilesStore.clear();
    menu.open();
    await recent.open();
    check(recent.submenuElement.textContent.includes("No recent files"), "Empty recent list is not usable");
    recent.entries.at(-1).pressable();
    await RecentFilesStore.pending;
    menu.close();
    menu.element.remove();

    // Storage failures must settle without blocking normal document opening.
    let warn = console.warn;
    let warnings = [];
    console.warn = (...args) => warnings.push(args);
    let open = indexedDB.open;
    try {
        indexedDB.open = () => {
            let request = {error: new Error("storage denied")};
            queueMicrotask(() => request.onerror());
            return request;
        };
        RecentFilesStore.initialization = null;
        await RecentFilesStore.load();
        await RecentFilesStore.remember("optional.png", "/tmp/optional.png");
        await reject(() => RecentFilesStore.clear(), /storage denied/);
        let report = app.handleError;
        try {
            await new Promise(resolve => {
                app.handleError = error => { check(/storage denied/.test(error.message), "Clear failure lost its diagnostic"); resolve(); };
                recent.entries.at(-1).pressable();
            });
        } finally { app.handleError = report; }
        check(warnings.length === 2, "Storage failure escaped its optional history boundary");
    } finally {
        indexedDB.open = open;
        console.warn = warn;
        RecentFilesStore.initialization = null;
    }
    await RecentFilesStore.load();
    check(!await RecentFilesStore.sameHandle({isSameEntry: async () => { throw new Error("revoked"); }}, {}),
        "A stale handle prevented new recent entries");
    await reject(() => RecentFilesStore.request("readwrite", store => {
        let request = store.clear();
        store.transaction.abort();
        return request;
    }), /aborted/);
    await reject(() => RecentFilesStore.request("readwrite", store => {
        let entry = {id: "duplicate", name: "duplicate", path: "/tmp/duplicate", handle: null, time: 1};
        store.add(entry);
        return store.add(entry);
    }), /exist|constraint/i);

    let workspace = app.createBlankDocumentInNewWorkspace(16, 16);
    let layer = workspace.getActiveLayer();
    layer.getSurface().context.fillStyle = "#2864aa";
    layer.getSurface().context.fillRect(0, 0, 16, 16);
    let blob = await new Promise(resolve => layer.getSurface().canvas.toBlob(resolve));
    let entry;
    if (isApp) {
        let fs = require("node:fs");
        let directory = fs.mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "paintjs-recent-"));
        let filename = require("node:path").join(directory, "recent.png");
        fs.writeFileSync(filename, new Uint8Array(await blob.arrayBuffer()));
        try {
            let file = await window.desktopFileActions.readFile(filename);
            check(window.desktopFileActions.getPathForFile(file) === filename, "Recent file lost its native path");
            await DocumentIO.openFiles([file]);
            entry = RecentFilesStore.entries[0];
            await DocumentIO.openRecent(entry);
            fs.unlinkSync(filename);
            await reject(() => DocumentIO.openRecent(entry), /ENOENT/);
        } finally { fs.rmSync(directory, {recursive: true, force: true}); }
    } else {
        let directory = await navigator.storage.getDirectory();
        let handle = await directory.getFileHandle("recent.png", {create: true});
        let writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        await RecentFilesStore.remember("path-only.png", "/tmp/path-only.png");
        await RecentFilesStore.remember("recent.png", null, handle);
        let other = await directory.getFileHandle("other.png", {create: true});
        await RecentFilesStore.remember("recent.png", null, other);
        check(RecentFilesStore.entries.filter(file => file.handle !== null).length === 2,
            "Distinct handles with the same name were collapsed");
        await RecentFilesStore.remember("recent.png", null, handle);
        await directory.removeEntry("other.png");
        RecentFilesStore.initialization = null;
        await RecentFilesStore.load();
        entry = RecentFilesStore.entries[0];
        check(await handle.isSameEntry(entry.handle), "File handle did not survive structured-clone persistence");
        await DocumentIO.openRecent(entry);
        await directory.removeEntry("recent.png");
        await reject(() => DocumentIO.openRecent(entry), /not be found|not found/i);
    }
    await reject(() => DocumentIO.openRecent({path: null, handle: {requestPermission: async () => "denied"}}), /Permission/);
    await RecentFilesStore.clear();

    let help = new HelpMenu();
    help.entries.find(item => item.id === "menu.help.plugins").pressable();
    check(SettingsDialog.instance.activeSection === "plugins", "Plugin help did not open the existing plugin manager");
    SettingsDialog.instance.close();

    window.dispatchEvent(new CustomEvent("paintdotjs:setting-changed", {detail: {path: "ui.animations", value: true}}));
    AppSettingsStore.set("updates.automatic", false);
    AppSettingsStore.set("updates.automatic", true);

    let order = [];
    let first = BusyDialog.run(app, () => {
        check(ModalDialogController.isActive(), "Busy operation did not lock editing");
        order.push(1);
        return 42;
    });
    let second = BusyDialog.run(app, () => { order.push(2); });
    check(document.querySelector(".busy-dialog") !== null && order.length === 0,
        "CPU work started before the busy status could paint");
    check(await first === 42, "Busy operation lost its result");
    await second;
    check(order.join() === "1,2" && app.busyOperation === null, "Busy operations overlapped or retained their lock");
    await reject(() => BusyDialog.run(app, () => { throw new Error("busy failure"); }), /busy failure/);
    check(!ModalDialogController.isActive(), "Busy failure left an input-blocking overlay");

    if (isApp) {
        let large = app.createBlankDocumentInNewWorkspace(1024, 1024);
        app.setActiveToolFromType(ToolType.MOVE);
        let tool = app.getActiveTool();
        let mouseUp = app.onDocumentMouseUp;
        let handleError = app.handleError;
        let reported = [];
        try {
            app.onDocumentMouseUp = () => { tool.tracking = false; return true; };
            tool.tracking = true;
            app.onMouseUp(0, 0, MouseButton.LEFT);
            check(app.busyOperation !== null, "Large transform did not schedule a painted busy state");
            await app.busyOperation;
            app.handleError = error => reported.push(error);
            app.onDocumentMouseUp = () => { tool.tracking = false; throw new Error("final render failure"); };
            tool.tracking = true;
            app.onMouseUp(0, 0, MouseButton.LEFT);
            await reject(() => app.busyOperation, /final render failure/);
            await Promise.resolve();
            check(reported.length === 1 && !ModalDialogController.isActive(), "Failed final render retained the busy state");
        } finally {
            tool.tracking = false;
            app.onDocumentMouseUp = mouseUp;
            app.handleError = handleError;
        }
        large.setDirty(false);
        app.closeDocumentWorkspace(large, false);
    }

    app.setActiveDocumentWorkspace(workspace);
    let errors = [];
    let report = app.handleError;
    app.handleError = error => errors.push(error);
    try {
        let oldPixels = [...layer.getSurface().context.getImageData(0, 0, 16, 16).data];
        let before = workspace.history.undoStack.length;
        let originalFill = layer.getSurface().context.fillRect;
        layer.getSurface().context.fillRect = () => { throw new Error("allocation failed"); };
        workspace.selection.setContinuation(new Rectangle(0, 0, 8, 8), CombineMode.REPLACE);
        workspace.selection.commitContinuation();
        try {
            check(workspace.executeFunction(new FillSelectionFunction(new Color(200, 20, 20))) === HistoryFunctionResult.OUT_OF_MEMORY,
                "Allocation failure did not report a memory result");
        } finally { layer.getSurface().context.fillRect = originalFill; }
        check([...layer.getSurface().context.getImageData(0, 0, 16, 16).data].every((value, i) => value === oldPixels[i]),
            "Failed fill destroyed pixels instead of restoring its existing snapshot");
        check(workspace.history.undoStack.length === before && errors.length === 1,
            "Failed fill recorded history or reported twice");
        let operation = {execute: () => {
            new SelectionHistoryMemento("failure", null, workspace);
            workspace.selection.reset();
            new BitmapLayer(workspace, 4, 4);
            throw new Error("ordinary failure");
        }};
        check(workspace.executeFunction(operation) === HistoryFunctionResult.NON_FATAL_ERROR, "Nonfatal error was misclassified");
        check(!workspace.selection.isEmpty(), "Failed operation lost its selection");
        let clone = layer.clone;
        layer.clone = () => { throw new Error("allocation failed"); };
        try { workspace.executeFunction(new DuplicateLayerFunction(0)); }
        finally { layer.clone = clone; }
        let create = Surface.create;
        let failedCanvas;
        Surface.create = (...args) => {
            let surface = create(...args);
            failedCanvas = surface.canvas;
            surface.context.drawImage = () => { throw new Error("allocation failed"); };
            return surface;
        };
        try { workspace.executeFunction(new DuplicateLayerFunction(0)); }
        finally { Surface.create = create; }
        check(failedCanvas.width === 0 && failedCanvas.height === 0, "Failed clone retained its partial surface");
        let canvas = document.createElement("canvas");
        canvas.getContext = () => null;
        await reject(() => new Surface(canvas), /allocation/);
        check(canvas.width === 300 && canvas.height === 150, "Failed wrapping modified the caller's canvas");
        await reject(() => Surface.create(1n, 2), /BigInt/);
        let slice = workspace.history.undoStack.slice;
        workspace.history.undoStack.slice = () => { throw new Error("allocation failed"); };
        try { workspace.executeFunction(new HistoryFunction()); }
        finally { workspace.history.undoStack.slice = slice; }
        let rollback = HistoryFunctionTransaction.prototype.rollback;
        HistoryFunctionTransaction.prototype.rollback = () => { throw new Error("recovery failure"); };
        try { workspace.executeFunction({execute: () => { throw new Error("original failure"); }}); }
        finally { HistoryFunctionTransaction.prototype.rollback = rollback; }
        check(errors.at(-1) instanceof AggregateError, "Recovery failure hid the original error");
        app.handleError = () => { throw new Error("reporter failure"); };
        try {
            await reject(() => workspace.executeFunction(new HistoryFunction()), /reporter failure/);
            check(workspace.historyTransaction === undefined, "Reporter failure retained the failed transaction");
        } finally { app.handleError = error => errors.push(error); }
    } finally { app.handleError = report; }
    workspace.setDirty(false);
};
