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

module.exports = async function checkDocumentChrome() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!(await predicate())) {
            check(performance.now() < deadline, "Document chrome timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let strip = PanelRegistry.get("documentStrip");
    strip.showDocumentList();
    check(!strip.documentListOpen, "Empty document strip opened a list");
    let workspaces = [];
    for (let index = 0; index < 14; ++index) {
        workspaces.push(app.createBlankDocumentInNewWorkspace(index % 2 === 0 ? 16 : 8, index % 2 === 0 ? 8 : 16));
    }
    await frame();
    phase("mounting a document strip with existing documents preserves their selected identity");
    let originalStripId = strip.element.id;
    let listenerSnapshot = new Set(Object.values(app.listeners).flat());
    let addDocumentListener = document.addEventListener;
    let addedDocumentListeners = [];
    let mountedStrip = null;
    try {
        strip.element.id = "original-document-strip";
        mountedStrip = new DocumentStrip();
        strip.element.id = originalStripId;
        mountedStrip.element.id = "late-mounted-document-strip";
        document.addEventListener = function (...args) {
            addedDocumentListeners.push(args);
            return addDocumentListener.apply(this, args);
        };
        mountedStrip.initialize(null);
        document.body.appendChild(mountedStrip.element);
        document.addEventListener = addDocumentListener;
        await frame();
        check(mountedStrip.documentsListItem.items.length === 14
            && mountedStrip.documentsListItem.selectedItem.getDocumentWorkspace() === app.getActiveDocumentWorkspace(),
        "Late-mounted document strip omitted existing documents or their active selection");
        let activeBeforePlaceholder = app.getActiveDocumentWorkspace();
        mountedStrip.documentsListItem.selectCallback(new DocumentItem(null));
        check(app.getActiveDocumentWorkspace() === activeBeforePlaceholder,
            "Placeholder selection discarded the active document");
    } finally {
        strip.element.id = originalStripId;
        document.addEventListener = addDocumentListener;
        for (let args of addedDocumentListeners) {
            document.removeEventListener(...args);
        }
        for (let [name, listeners] of Object.entries(app.listeners)) {
            for (let listener of [...listeners]) {
                if (!listenerSnapshot.has(listener)) {
                    app.off(name, listener);
                }
            }
        }
        if (mountedStrip !== null) {
            mountedStrip.resizeObserver?.disconnect();
            cancelAnimationFrame(mountedStrip.navigationFrame);
            mountedStrip.element.remove();
        }
    }
    phase("document-list selection, thumbnail refresh and reordered workspace identity");
    strip.documentListButton.click();
    await frame();
    check(strip.documentListOpen && strip.documentListPopup.querySelectorAll(".document-list-entry").length === 14,
        "Open-image list omitted documents");
    let entries = strip.documentListPopup.querySelectorAll(".document-list-entry");
    check(entries[13].classList.contains("selected") && entries[13].getAttribute("aria-selected") === "true",
        "Document list did not expose active selection");
    entries[2].click();
    check(app.getActiveDocumentWorkspace() === workspaces[2] && !strip.documentListOpen, "Document-list click did not activate and close");
    strip.toggleDocumentList();
    strip.toggleDocumentList();
    check(!strip.documentListOpen, "Document-list toggle did not close");
    strip.showDocumentList();
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "a", bubbles: true}));
    check(strip.documentListOpen, "Ordinary key closed document list");
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    check(!strip.documentListOpen && document.activeElement === strip.documentListButton, "Escape did not close/focus document-list button");
    strip.showDocumentList();
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
    check(!strip.documentListOpen, "Outside pointer retained document list");
    strip.showDocumentList();
    let named = workspaces[0];
    named.setFileInfo("<literal-name>.png", null, null, "png", {});
    check(strip.documentListPopup.textContent.includes("<literal-name>.png") && strip.documentListPopup.querySelector("literal-name") === null,
        "Document-list name was interpreted as markup");
    let item = strip.getItemByDocumentWorkspace(named);
    named.setDirty(true);
    check(item.dirtyIndicator.style.visibility === "visible", "Dirty document lost its strip marker");
    named.setDirty(false);
    check(item.dirtyIndicator.style.visibility === "hidden", "Saved document retained its dirty marker");
    let layer = named.getActiveLayer();
    layer.getSurface().context.fillStyle = "lime";
    layer.getSurface().context.fillRect(0, 0, 16, 8);
    layer.invalidate();
    await new Promise(resolve => setTimeout(resolve, 120));
    strip.updatePopupThumbnail(named);
    let preview = strip.documentListPopup.querySelector(".document-list-entry canvas");
    check(preview.getContext("2d").getImageData(2, 2, 1, 1).data[1] === 255, "Popup thumbnail did not refresh changed pixels");
    phase("document strip ignores nonbitmap renders and delayed updates for closed documents");
    let documentOrder = [...app.getDocumentWorkspaces()];
    app.fire("document:render_layer_region", new Layer(16, 8), new Rectangle(0, 0, 1, 1));
    check(app.getDocumentWorkspaces().every((workspace, index) => workspace === documentOrder[index]),
        "Nonbitmap render changed the open document order");
    let transient = app.createBlankDocumentInNewWorkspace(8, 8);
    let staleItem = strip.getItemByDocumentWorkspace(transient);
    transient.getActiveLayer().invalidate();
    app.closeDocumentWorkspace(transient, false);
    strip.showDocumentList();
    strip.updatePopupThumbnail(transient);
    let orderAfterClose = [...app.getDocumentWorkspaces()];
    strip.documentsListItem.itemSwapper(staleItem, item);
    await new Promise(resolve => setTimeout(resolve, 120));
    check(strip.getItemByDocumentWorkspace(transient) === null
        && strip.documentListPopup.querySelectorAll(".document-list-entry").length === 14
        && app.getDocumentWorkspaces().every((workspace, index) => workspace === orderAfterClose[index]),
    "Stale tab drag or delayed thumbnail update revived or reordered a closed document");
    let staleInsertionIndex = strip.documentsListItem.items.length;
    strip.documentsListItem.add(staleItem);
    try {
        strip.documentsListItem.itemSwapper(staleItem, item);
        check(strip.documentsListItem.items[staleInsertionIndex] === staleItem
            && app.getDocumentWorkspaces().every((workspace, index) => workspace === orderAfterClose[index]),
        "Strip swapped an explicitly supplied row whose workspace was already closed");
    } finally {
        strip.documentsListItem.items.splice(staleInsertionIndex, 1);
    }
    await DocumentContextMenu.runForWorkspace(transient, () => {
        throw new Error("Closed context target executed its callback");
    });
    let contextTarget = null;
    await DocumentContextMenu.runForWorkspace(named, () => contextTarget = app.getActiveDocumentWorkspace());
    check(contextTarget === named, "Context command did not activate its live target before execution");
    let independentItem = new DocumentItem(named);
    independentItem.initialize(null);
    let inactiveContext = new MouseEvent("contextmenu", {cancelable: true, bubbles: true});
    independentItem.getElement().dispatchEvent(inactiveContext);
    check(!inactiveContext.defaultPrevented && DocumentContextMenu.popup === null,
        "Document tab without a context callback intercepted the native context event");
    let second = strip.documentsListItem.items[1];
    strip.documentsListItem.itemSwapper(item, second);
    check(app.getDocumentWorkspaces()[1] === named && strip.documentsListItem.items[1].getDocumentWorkspace() === named,
        "Strip reordering did not reorder its workspaces");
    strip.hideDocumentList();
    let list = strip.documentsListItem.getElement();
    list.scrollLeft = 0;
    strip.updateNavigation();
    check(strip.previousButton.hidden && !strip.nextButton.hidden, "Overflow navigation did not expose the next document");
    strip.nextButton.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    strip.updateNavigation();
    check(list.scrollLeft > 0 && !strip.previousButton.hidden, "Next-document navigation did not scroll");
    strip.previousButton.click();
    strip.scheduleNavigationUpdate();
    strip.scheduleNavigationUpdate();
    await frame();

    phase("native held document navigation repeats and releases its timers");
    let originalScroll = strip.scrollByDocument;
    let scrollCalls = 0;
    let navigationButton = strip.nextButton;
    let nativeButton = async type => {
        let bounds = navigationButton.getBoundingClientRect();
        await require("electron").ipcRenderer.invoke("paintdotjs:test-input", {
            type, x: Math.round(bounds.left + bounds.width / 2),
            y: Math.round(bounds.top + bounds.height / 2), button: "left", clickCount: 1
        });
    };
    strip.scrollByDocument = function (direction) {
        ++scrollCalls;
        return originalScroll.call(this, direction);
    };
    try {
        list.scrollTo({left: 0, behavior: "instant"});
        strip.updateNavigation();
        await nativeButton("mouseDown");
        await waitFor(() => scrollCalls >= 3);
        await nativeButton("mouseUp");
        await frame();
        let releasedCalls = scrollCalls;
        await new Promise(resolve => setTimeout(resolve, 180));
        check(scrollCalls === releasedCalls && list.scrollLeft > 0, "Released document navigation kept repeating or did not scroll");
        list.scrollTo({left: 0, behavior: "instant"});
        strip.updateNavigation();
        scrollCalls = 0;
        await nativeButton("mouseDown");
        await waitFor(() => scrollCalls === 1);
        await nativeButton("mouseUp");
        await new Promise(resolve => setTimeout(resolve, 550));
        check(scrollCalls === 1, "Short document-navigation press leaked its delayed repeat");
        let rightPress = new PointerEvent("pointerdown", {button: 2, bubbles: true, cancelable: true});
        navigationButton.dispatchEvent(rightPress);
        check(scrollCalls === 1 && !rightPress.defaultPrevented, "Nonprimary document navigation performed a scroll");
    } finally {
        await nativeButton("mouseUp");
        strip.scrollByDocument = originalScroll;
    }

    phase("context commands use the clicked workspace and restore previous focus after closing");
    let fs = require("node:fs");
    let filePath = require("node:path").join(require("node:process").env.PAINTDOTJS_TEST_USER_DATA, "context-save.png");
    named.setFileInfo("context-save.png", null, filePath, "png", {});
    app.setActiveDocumentWorkspace(workspaces[2]);
    item = strip.getItemByDocumentWorkspace(named);
    item.element.dispatchEvent(new MouseEvent("contextmenu", {clientX: 10000, clientY: 10000, bubbles: true, cancelable: true}));
    check(app.getActiveDocumentWorkspace() === named && document.querySelector(".document-context-menu") !== null,
        "Tab context menu did not activate its clicked document");
    let commands = () => [...document.querySelectorAll(".document-context-menu .drop-entry")];
    commands()[0].click();
    await frame();
    check(await navigator.clipboard.readText() === filePath && DocumentContextMenu.popup === null, "Copy Path did not copy or close its menu");
    check(await DocumentIO.getClipboardImageSize() === null, "Text clipboard unexpectedly supplied image dimensions");
    await require("electron").ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseMove", x: 10, y: 10});
    await waitFor(() => document.hasFocus());
    let clipboardCanvas = named.getActiveLayer().getSurface().getCanvas();
    let clipboardImage = await new Promise(resolve => clipboardCanvas.toBlob(resolve));
    await navigator.clipboard.write([new ClipboardItem({"image/png": clipboardImage})]);
    await waitFor(async () => {
        try {
            let items = await navigator.clipboard.read();
            let imageItem = items.find(item => item.types.includes("image/png"));
            if (imageItem === undefined) {
                return false;
            }
            let decodedClipboard = await createImageBitmap(await imageItem.getType("image/png"));
            let ready = decodedClipboard.width === 16 && decodedClipboard.height === 8;
            decodedClipboard.close();
            return ready;
        } catch (error) {
            if (error.name === "InvalidStateError") {
                return false;
            }
            throw error;
        }
    });
    let clipboardSize = await DocumentIO.getClipboardImageSize();
    check(clipboardSize !== null && clipboardSize.width === 16 && clipboardSize.height === 8,
        "Real desktop image clipboard did not supply its dimensions through the shared browser API");
    let desktopActions = window.desktopFileActions;
    try {
        window.desktopFileActions = undefined;
        await DocumentContextMenu.copyPath(filePath);
        check(await navigator.clipboard.readText() === filePath, "Browser context Copy Path lost the full path");
    } finally {
        window.desktopFileActions = desktopActions;
    }
    let showFolder = window.desktopFileActions.showItemInFolder;
    let folder = null;
    try {
        window.desktopFileActions.showItemInFolder = path => folder = path;
        DocumentContextMenu.show(10, 10, named);
        commands()[1].click();
        check(folder === filePath, "Open Containing Folder used the wrong path");
    } finally {
        window.desktopFileActions.showItemInFolder = showFolder;
    }
    named.setDirty(true);
    DocumentContextMenu.show(10, 10, named);
    commands()[2].click();
    await waitFor(() => !named.isDirty());
    check(fs.readFileSync(filePath).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "Context Save did not write a PNG file");
    let saveActive = DocumentIO.saveActive;
    let forceSaveAs = null;
    try {
        DocumentIO.saveActive = async force => forceSaveAs = force;
        DocumentContextMenu.show(10, 10, named);
        commands()[3].click();
        await frame();
        check(forceSaveAs === true, "Context Save As did not force its file picker");
    } finally {
        DocumentIO.saveActive = saveActive;
    }
    for (let action of ["escape", "outside", "close-owner"]) {
        DocumentContextMenu.show(10, 10, named);
        document.dispatchEvent(new KeyboardEvent("keydown", {key: "a"}));
        check(DocumentContextMenu.popup !== null, "Ordinary key dismissed context menu");
        if (action === "escape") {
            document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
        } else if (action === "outside") {
            document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
        } else {
            DocumentContextMenu.popup.requestClose();
        }
        check(DocumentContextMenu.popup === null && DocumentContextMenu.escapeListener === null,
            "Context-menu dismissal retained popup/listeners");
    }
    named.setDirty(true);
    DocumentContextMenu.show(10, 10, named, workspaces[2]);
    commands()[4].click();
    await waitFor(() => document.querySelector(".unsaved-changes-dialog") !== null);
    document.querySelectorAll(".unsaved-changes-dialog .task-dialog-choice")[2].click();
    await frame();
    check(app.getDocumentWorkspaces().includes(named), "Cancelled context Close lost its document");
    named.setDirty(false);
    DocumentContextMenu.show(10, 10, named, workspaces[2]);
    commands()[4].click();
    await waitFor(() => !app.getDocumentWorkspaces().includes(named));
    check(app.getActiveDocumentWorkspace() === workspaces[2], "Closing a context tab did not restore previous workspace");
    let called = false;
    await DocumentContextMenu.runForWorkspace(named, () => called = true);
    check(!called, "Context operation ran for a closed document");

    phase("top-level hover switching, effect submenus and popup anchoring");
    let main = PanelRegistry.get("mainMenu");
    let file = main.get("menu.file");
    let view = main.get("menu.view");
    let effects = main.get("menu.effects");
    file.element.click();
    file.open();
    view.element.dispatchEvent(new MouseEvent("mouseenter"));
    check(view.isOpen() && !file.isOpen() && main.openDropMenu === view, "Hover switching retained its old top-level menu");
    for (let unit of ["pixel", "inch", "centimeter"]) {
        app.setMeasurementUnit(unit);
        view.updateMeasurementUnitChecks();
        check(view.get("measurementUnit." + unit).classNames.includes("checked-drop-entry"), "View menu did not check its selected unit");
    }
    effects.element.dispatchEvent(new MouseEvent("mouseenter"));
    check(effects.isOpen() && !view.isOpen(), "Effects menu did not replace View menu");
    let firstCategory = effects.effectEntries[0];
    let secondCategory = effects.effectEntries[1];
    firstCategory.element.dispatchEvent(new MouseEvent("mouseenter"));
    check(firstCategory.submenuElement !== null && firstCategory.element.getAttribute("aria-expanded") === "true",
        "Effect category hover did not open its submenu");
    firstCategory.open();
    secondCategory.element.click();
    check(firstCategory.submenuElement === null && secondCategory.submenuElement !== null, "Effect submenu did not close its sibling");
    effects.close();
    file.open();
    file.dropMenuPopup.requestClose();
    check(!file.isOpen() && DropMenuPopup.activePopup === null, "Popup close-owner callback retained its registered menu");
    check(secondCategory.submenuElement === null && DropMenuPopup.activePopup === null, "Closing Effects retained a nested submenu");
    let popup = new DropMenuPopup("runtime-position", {className: "runtime-popup"});
    popup.positionAt(100, 100);
    popup.positionAtAnchor({left: 0, right: 1, top: 0, bottom: 1});
    let label = document.createElement("span");
    label.textContent = "Popup";
    popup.open([label]);
    popup.positionAtAnchor({left: 30, right: 80, top: 50, bottom: 70}, {alignEnd: true, dropUp: true});
    check(parseFloat(popup.element.style.left) >= 2 && parseFloat(popup.element.style.top) >= 2, "Popup anchor escaped viewport bounds");
    let replacement = new DropMenuPopup("runtime-replacement");
    replacement.open([]);
    check(popup.element === null && DropMenuPopup.activePopup === replacement, "Exclusive popup did not close its predecessor");
    replacement.requestClose();

    phase("dialog dragging ignores controls, clamps and persists position");
    let host = document.createElement("div");
    host.style.cssText = "position:fixed;left:100px;top:100px;width:300px;height:200px;z-index:10000";
    document.body.appendChild(host);
    {
        let dialog = document.createElement("div");
        dialog.style.cssText = "position:fixed;left:140px;top:140px;width:100px;height:80px";
        host.appendChild(dialog);
        {
            let handle = document.createElement("div");
            handle.style.height = "20px";
            dialog.appendChild(handle);
            {
                let button = document.createElement("button");
                button.textContent = "Close";
                handle.appendChild(button);
                let mover = new DialogMover(dialog, handle, host, "runtime-mover");
                button.dispatchEvent(new MouseEvent("mousedown", {button: 0, bubbles: true}));
                handle.dispatchEvent(new MouseEvent("mousedown", {button: 2, bubbles: true}));
                check(!mover.dragging, "Dialog drag intercepted a control or right mouse button");
                mover.move({clientX: 1000, clientY: 1000});
                handle.dispatchEvent(new MouseEvent("mousedown", {button: 0, clientX: 150, clientY: 150, bubbles: true, cancelable: true}));
                document.dispatchEvent(new MouseEvent("mousemove", {clientX: 1000, clientY: 1000, cancelable: true}));
                check(dialog.style.left === "300px" && dialog.style.top === "220px", "Dialog escaped its lower bounds");
                document.dispatchEvent(new MouseEvent("mouseup"));
                check(!mover.dragging && AppSettingsStore.get("dialogs.runtime-mover").left === 300, "Dialog drag did not stop/persist");
                mover.setPosition(-100, -100);
                check(dialog.style.left === "100px" && dialog.style.top === "100px", "Dialog escaped its upper bounds");
                window.dispatchEvent(new Event("resize"));
                mover.destroy();
                check(!handle.classList.contains("movable-dialog-handle"), "Destroying dialog drag retained its handle");
                let restored = new DialogMover(dialog, handle, host, "runtime-mover");
                check(dialog.style.left === "300px" && dialog.style.top === "220px", "Dialog position was not restored");
                restored.destroy();
                dialog.style.position = "";
                let transient = new DialogMover(dialog, handle, host);
                transient.clampToBounds();
                transient.destroy();
            }
        }
    }
    host.remove();
    phase("document tab close releases clean documents and routes failed closes without removing a tab");
    let closing = app.createBlankDocumentInNewWorkspace(16, 16);
    let closingCanvas = closing.getActiveLayer().getSurface().getCanvas();
    strip.getItemByDocumentWorkspace(closing).getElement().querySelector(".window-close-button").click();
    await waitFor(() => !app.getDocumentWorkspaces().includes(closing));
    check(closing.document === null && closingCanvas.width === 0, "Tab close retained its document or canvas");
    let failedClose = app.createBlankDocumentInNewWorkspace(16, 16);
    let closeDocument = DocumentIO.closeDocumentWorkspace;
    let handleError = app.handleError;
    let reported = [];
    let failure = new Error("Injected close failure");
    try {
        DocumentIO.closeDocumentWorkspace = async () => {
            throw failure;
        };
        app.handleError = error => reported.push(error);
        strip.getItemByDocumentWorkspace(failedClose).getElement().querySelector(".window-close-button").click();
        await waitFor(() => reported.length === 1);
        check(reported[0] === failure && app.getDocumentWorkspaces().includes(failedClose)
            && failedClose.getActiveLayer().getSurface().getCanvas().width === 16,
            "Failed tab close removed its document or bypassed error reporting");
    } finally {
        DocumentIO.closeDocumentWorkspace = closeDocument;
        app.handleError = handleError;
    }
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    strip.updateNavigation();
    check(strip.documentListButton.hidden && strip.element.style.width === "0px", "Empty strip retained document controls/space");
    phase("unmounted document strips tolerate late lookups and navigation updates");
    let unmountedStrip = new DocumentStrip();
    unmountedStrip.updateNavigation();
    unmountedStrip.hideDocumentList();
    check(unmountedStrip.getItemByDocumentWorkspace(null) === null,
        "Unmounted document strip did not return a missing-item result");
    let unmountedItem = new DocumentItem(failedClose);
    unmountedItem.renderThumbnail();
    let destination = document.createElement("canvas");
    destination.width = 7;
    destination.height = 5;
    unmountedStrip.copyThumbnail(unmountedItem, destination);
    check(destination.width === 7 && destination.height === 5,
        "Missing source thumbnail changed the destination canvas");
    return {ok: true};

};
