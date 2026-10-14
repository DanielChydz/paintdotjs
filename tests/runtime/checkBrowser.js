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

module.exports = async function checkBrowser() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let waitFor = async predicate => {
        let deadline = performance.now() + 10000;
        while (!predicate()) {
            check(performance.now() < deadline, "Browser/PWA update timed out");
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    };
    check(typeof require === "undefined" && isApp === false, "Browser test accidentally used desktop mode");
    check(window.isSecureContext && "serviceWorker" in navigator, "Secure browser APIs are unavailable");
    let requestResult = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    let store = await getObjectStore("readwrite");
    await requestResult(store.put({fileName: "runtime-test-file", bytes: new Uint8Array([1, 2, 3])}));
    store = await getObjectStore("readonly");
    let saved = await requestResult(store.get("runtime-test-file"));
    check(saved.fileName === "runtime-test-file" && saved.bytes[2] === 3,
        "Browser file-system store did not persist its structured-cloned bytes");
    store = await getObjectStore("readwrite");
    await requestResult(store.delete("runtime-test-file"));
    let webFile = File.of("runtime-test", "image.bin");
    check(!await webFile.exists(), "A new WebFile unexpectedly exists");
    await webFile.write(new Uint8Array([0, 42, 255]));
    check(await webFile.exists(), "WebFile write did not persist its record");
    let webBytes = await webFile.read();
    check(webBytes instanceof Uint8Array && webBytes.length === 3 && webBytes[1] === 42,
        "WebFile did not read its original bytes from IndexedDB");
    store = await getObjectStore("readwrite");
    await requestResult(store.delete(webFile.getPath()));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    AboutDialog.open();
    let about = document.querySelector(".project-info-about");
    check(about !== null && !about.parentElement.classList.contains("dialog-backdrop-app"),
        "Browser about dialog used desktop styling");
    AboutDialog.open();
    check(document.querySelectorAll(".project-info-about").length === 1, "About dialog was duplicated");
    WelcomeDialog.open(true);
    check(document.querySelector(".project-info-welcome") === null, "Welcome replaced an already-open about dialog");
    about.querySelector(".app-dialog-close").click();
    let savedDismissal = localStorage.getItem(WelcomeDialog.storageKey);
    try {
        localStorage.removeItem(WelcomeDialog.storageKey);
        check(!WelcomeDialog.isDismissed(), "Unset welcome preference was treated as dismissed");
        WelcomeDialog.open();
        let welcome = AboutDialog.instance;
        check(welcome instanceof WelcomeDialog && welcome.welcome
            && document.querySelector(".project-info-welcome") !== null, "Browser welcome did not build the shared welcome dialog");
        welcome.dontShowAgain.checked = true;
        welcome.dialog.querySelector(".project-info-primary-button").click();
        check(WelcomeDialog.isDismissed() && AboutDialog.instance === null,
            "Closing welcome did not save its dismissal or release the modal");
        WelcomeDialog.open();
        check(AboutDialog.instance === null, "Dismissed welcome reopened without force");
        WelcomeDialog.open(true);
        check(AboutDialog.instance instanceof WelcomeDialog, "Forced welcome ignored the saved dismissal");
        AboutDialog.instance.dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
        check(AboutDialog.instance === null, "Escape did not close the forced welcome");
        let storageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
        try {
            Object.defineProperty(window, "localStorage", {configurable: true, get: () => {
                throw new DOMException("Storage blocked", "SecurityError");
            }});
            check(!WelcomeDialog.isDismissed(), "Restricted storage suppressed welcome");
            WelcomeDialog.dismiss();
        } finally {
            Object.defineProperty(window, "localStorage", storageDescriptor);
        }
    } finally {
        if (savedDismissal === null) {
            localStorage.removeItem(WelcomeDialog.storageKey);
        } else {
            localStorage.setItem(WelcomeDialog.storageKey, savedDismissal);
        }
    }
    let pending = NewFileDialog.open(32, 16);
    let form = document.querySelector(".new-file-dialog");
    check(!form.parentElement.classList.contains("dialog-backdrop-app"), "Browser new-file styling is wrong");
    form.requestSubmit();
    let dimensions = await pending;
    check(dimensions.width === 32 && dimensions.height === 16, "Browser new-file dialog lost dimensions");
    let workspace = app.createBlankDocumentInNewWorkspace(32, 16);
    workspace.setDirty(true);
    let registration = await navigator.serviceWorker.ready;
    await waitFor(() => navigator.serviceWorker.controller !== null);
    let channel = new MessageChannel();
    let version = new Promise(resolve => {
        channel.port1.onmessage = event => resolve(event.data);
    });
    registration.active.postMessage({type: "GET_VERSION"}, [channel.port2]);
    check(await version === 1, "Initial worker is not active");
    channel.port1.close();
    await fetch("/__test__/update", {method: "POST"});
    await registration.update();
    await waitFor(() => document.querySelector(".update-prompt-dialog") !== null);
    let update = document.querySelector(".update-prompt-dialog");
    check(update.textContent.includes("9.0.2"), "Available update version was not displayed");
    update.querySelectorAll(".task-dialog-choice")[0].click();
    await waitFor(() => document.querySelector(".update-prompt-dialog") === null);
    check(registration.waiting !== null && app.hasUnsavedDocuments(), "Later installed an update or lost work");

    await fetch("/__test__/update", {method: "POST"});
    await registration.update();
    await waitFor(() => document.querySelector(".update-prompt-dialog") !== null);
    document.querySelectorAll(".update-prompt-dialog .task-dialog-choice")[1].click();
    await waitFor(() => document.querySelector(".task-dialog-message")?.textContent.includes("Save your open work"));
    let confirm = document.querySelector(".task-dialog-message").closest(".task-dialog");
    confirm.querySelectorAll(".task-dialog-choice")[2].click();
    await waitFor(() => document.querySelector(".task-dialog") === null);
    check(workspace.document !== null && workspace.isDirty(), "Cancelled update lost unsaved work");
    check(navigator.serviceWorker.controller.state === "activated", "Update replaced active worker after cancel");

    window.dispatchEvent(new Event("beforeunload", {cancelable: true}));
    await waitFor(() => document.querySelector(".unsaved-changes-dialog") !== null);
    document.querySelectorAll(".unsaved-changes-dialog .task-dialog-choice")[2].click();
    await waitFor(() => !DocumentIO.webCloseDialogOpen);
    check(workspace.document !== null && workspace.isDirty(), "Browser close cancellation lost work");
    app.closeDocumentWorkspace(workspace, false);
    return {ok: true};
};
