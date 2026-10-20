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

module.exports = async function checkCameraCapture() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let waitFor = async predicate => {
        let deadline = performance.now() + 8000;
        while (!await predicate()) {
            check(performance.now() < deadline, "Camera capture timed out: " + document.querySelector(".camera-content p")?.textContent);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let button = title => [...document.querySelectorAll(".camera-dialog button")].find(item => item.textContent === title);
    let phase = name => {
        if (isApp) {
            require("electron").ipcRenderer.send("paintdotjs:test-phase", "camera: " + name);
        }
    };
    let cancel = async promise => {
        button("Cancel").click();
        check(await promise === null, "Cancelled camera returned a photo");
        check(document.querySelector(".camera-dialog") === null, "Camera dialog remained mounted");
    };
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    app.setActiveTool(null);
    let menu = new FileMenu();
    phase("native preview and import");
    let cameraEntry = menu.entries.find(item => item.id === "menu.file.camera");
    check(cameraEntry !== undefined, "File menu omitted the camera command");
    cameraEntry.pressable();
    let imported = DocumentIO.cameraImportPromise;
    check(DocumentIO.acquireFromCamera() === imported, "Duplicate acquisition opened a second import");
    await waitFor(() => document.querySelector(".camera-dialog") !== null);
    let promise = CameraDialog.activePromise;
    check(CameraDialog.open() === promise, "Camera dialog allowed a second instance");
    check(button("Take Photo").disabled, "Capture was enabled before camera permission");
    let form = document.querySelector(".camera-dialog");
    form.dispatchEvent(new Event("submit", {cancelable: true}));
    button("Start Camera").click();
    await waitFor(() => !button("Take Photo").disabled);
    let video = document.querySelector(".camera-dialog video");
    let tracks = video.srcObject.getTracks();
    let width = video.videoWidth;
    let height = video.videoHeight;
    check(width > 0 && height > 0 && tracks.every(track => track.kind === "video"),
        "Real getUserMedia did not produce video-only preview frames");
    button("Take Photo").click();
    phase("waiting for imported photo");
    await waitFor(() => document.querySelector(".camera-dialog") === null);
    await imported;
    let workspace = app.getActiveDocumentWorkspace();
    check(workspace !== null && workspace.getWidth() === width && workspace.getHeight() === height
        && workspace.isDirty() && workspace.getFriendlyName() === "Camera.png",
    "Photo did not open as an unsaved image document at native camera dimensions");
    check(workspace.getActiveLayer().getSurface().getColorAt(0, 0).getAlpha() === 255
        && tracks.every(track => track.readyState === "ended"), "Capture lost pixels or retained the camera device");

    let media = navigator.mediaDevices;
    let getUserMedia = media.getUserMedia;
    let toBlob = HTMLCanvasElement.prototype.toBlob;
    let getContext = HTMLCanvasElement.prototype.getContext;
    let mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    let play = HTMLVideoElement.prototype.play;
    let requests = [];
    let synthetic = () => {
        let canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 6;
        canvas.getContext("2d").fillRect(0, 0, 8, 6);
        return canvas.captureStream(10);
    };
    try {
        for (let name of ["NotAllowedError", "SecurityError", "NotFoundError", "OverconstrainedError", "NotReadableError", "AbortError"]) {
            phase(name);
            media.getUserMedia = async constraints => {
                requests.push(constraints);
                throw new DOMException("Synthetic failure", name);
            };
            promise = CameraDialog.open();
            button("Start Camera").click();
            await waitFor(() => document.querySelector(".camera-content [role=alert]") !== null);
            check(!button("Start Camera").disabled && button("Take Photo").disabled
                && document.querySelector(".camera-content p").textContent === CameraDialog.errorMessage({name, message: "Synthetic failure"}),
            "Camera permission/device failure was not actionable: " + name);
            await cancel(promise);
        }
        check(requests.every(request => request.audio === false && request.video === true), "Camera requested microphone access");
        Object.defineProperty(navigator, "mediaDevices", {configurable: true, value: undefined});
        promise = CameraDialog.open();
        check(button("Start Camera").disabled && document.querySelector(".camera-content p").textContent.includes("HTTPS"),
            "Unsupported context did not explain camera requirements");
        await cancel(promise);
        Object.defineProperty(navigator, "mediaDevices", {configurable: true, value: media});

        let allow;
        phase("cancelled pending permission");
        media.getUserMedia = () => new Promise(resolve => allow = resolve);
        promise = CameraDialog.open();
        button("Start Camera").click();
        button("Start Camera").onclick();
        let pendingVideo = document.querySelector(".camera-dialog video");
        await cancel(promise);
        let late = synthetic();
        allow(late);
        await waitFor(() => late.getTracks().every(track => track.readyState === "ended"));
        pendingVideo.dispatchEvent(new Event("loadeddata"));
        check(pendingVideo.srcObject === null, "Late camera permission revived a closed dialog");

        media.getUserMedia = async () => synthetic();
        phase("disconnection and cancelled encoding");
        promise = CameraDialog.open();
        button("Start Camera").click();
        await waitFor(() => !button("Take Photo").disabled);
        video = document.querySelector(".camera-dialog video");
        tracks = video.srcObject.getTracks();
        tracks[0].dispatchEvent(new Event("ended"));
        check(button("Take Photo").disabled && !button("Start Camera").disabled
            && tracks.every(track => track.readyState === "ended"), "Disconnection retained a usable capture/device");
        button("Start Camera").click();
        await waitFor(() => !button("Take Photo").disabled);
        video = document.querySelector(".camera-dialog video");
        tracks = video.srcObject.getTracks();
        let finishBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback) {
            finishBlob = callback;
        };
        form = document.querySelector(".camera-dialog");
        button("Take Photo").click();
        form.dispatchEvent(new Event("submit", {cancelable: true}));
        video.dispatchEvent(new Event("loadeddata"));
        button("Cancel").dispatchEvent(new KeyboardEvent("keydown", {key: "a", bubbles: true}));
        check(document.querySelector(".camera-dialog") !== null, "Ordinary key closed the camera");
        button("Cancel").dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
        check(await promise === null && tracks.every(track => track.readyState === "ended"), "Escape leaked the camera during encoding");
        finishBlob(new Blob(["late"], {type: "image/png"}));
        await new Promise(resolve => setTimeout(resolve, 0));
        check(app.getDocumentWorkspaces().length === 1, "Cancelled encoding imported a second document");
        form.dispatchEvent(new Event("submit", {cancelable: true}));

        HTMLCanvasElement.prototype.toBlob = function (callback) {
            callback(null);
        };
        phase("encoding and allocation failures");
        promise = CameraDialog.open();
        button("Start Camera").click();
        await waitFor(() => !button("Take Photo").disabled);
        button("Take Photo").click();
        await waitFor(() => document.querySelector(".camera-content [role=alert]") !== null);
        check(document.querySelector(".camera-content p").textContent.includes("encode"), "Photo encoding failure was hidden");
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return type === "2d" ? null : getContext.call(this, type, ...args);
        };
        button("Take Photo").click();
        await waitFor(() => document.querySelector(".camera-content p").textContent.includes("allocate"));
        HTMLCanvasElement.prototype.getContext = getContext;
        document.querySelector(".camera-dialog .app-dialog-close").click();
        check(await promise === null, "Title close returned a photo");

        HTMLCanvasElement.prototype.toBlob = toBlob;
        phase("playback failure and page exit");
        HTMLVideoElement.prototype.play = async () => { throw new Error("Playback failed"); };
        promise = CameraDialog.open();
        button("Start Camera").click();
        await waitFor(() => document.querySelector(".camera-content [role=alert]") !== null);
        check(document.querySelector(".camera-dialog video").srcObject === null, "Playback failure retained the stream");
        await cancel(promise);
        HTMLVideoElement.prototype.play = play;
        promise = CameraDialog.open();
        button("Start Camera").click();
        await waitFor(() => !button("Take Photo").disabled);
        tracks = document.querySelector(".camera-dialog video").srcObject.getTracks();
        window.dispatchEvent(new Event("pagehide"));
        check(await promise === null && tracks.every(track => track.readyState === "ended"), "Page exit did not release the camera");
    } finally {
        media.getUserMedia = getUserMedia;
        if (mediaDescriptor === undefined) {
            delete navigator.mediaDevices;
        } else {
            Object.defineProperty(navigator, "mediaDevices", mediaDescriptor);
        }
        HTMLCanvasElement.prototype.toBlob = toBlob;
        HTMLCanvasElement.prototype.getContext = getContext;
        HTMLVideoElement.prototype.play = play;
        document.querySelector(".camera-dialog .app-dialog-close")?.click();
    }
    let open = CameraDialog.open;
    let openImage = DocumentIO.openImage;
    let handleError = app.handleError;
    let errors = [];
    try {
        CameraDialog.open = async () => null;
        await DocumentIO.acquireFromCamera();
        check(app.getDocumentWorkspaces().length === 1, "Cancelled acquisition created a document");
        CameraDialog.open = async () => new Blob();
        DocumentIO.openImage = async () => { throw new Error("Photo import failed"); };
        app.handleError = error => errors.push(error);
        await DocumentIO.acquireFromCamera();
        check(errors.length === 1 && errors[0].message === "Photo import failed"
            && DocumentIO.cameraImportPromise === null, "Photo import failure was hidden or blocked future imports");
    } finally {
        CameraDialog.open = open;
        DocumentIO.openImage = openImage;
        app.handleError = handleError;
    }
};
