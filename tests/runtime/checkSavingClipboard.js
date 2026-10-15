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

module.exports = async function checkSavingClipboard() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "Save/clipboard workflow timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let equal = (actual, expected, message) => check(actual.length === expected.length
        && actual.every((value, index) => value === expected[index]), message);
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let change = (element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("change", {bubbles: true}));
    };
    let cancel = form => form.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    let form = () => document.querySelector(".save-config-dialog");
    let ready = () => form() !== null && !form().querySelector("button[type=submit]").disabled;
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(32, 16);
    let surface = workspace.getActiveLayer().getSurface();
    surface.context.fillStyle = "red";
    surface.context.fillRect(8, 4, 8, 4);
    let canvas = surface.canvas;
    let encode = (format, options) => ImageEncoder.encode(canvas, format, options);

    phase("save dialog formats and real previews");
    for (let format of ["png", "jpeg", "webp", "bmp", "gif", "tiff", "tga", "dds", "avif", "jxl"]) {
        let pending = SaveImageDialog.open({canvas, encode, initialFormat: format});
        check(SaveImageDialog.open({}) === pending, "Duplicate save dialog was opened");
        await waitFor(ready);
        let dialog = form();
        let preview = dialog.querySelector(".save-config-preview-stage img");
        await waitFor(() => preview.naturalWidth === 32 && preview.complete
            && Number.isFinite(parseFloat(preview.style.width)));
        await new Promise(resolve => requestAnimationFrame(resolve));
        check(preview.naturalHeight === 16, "Save preview lost image dimensions");
        let frame = dialog.querySelector(".save-config-preview-frame");
        let bounds = frame.getBoundingClientRect();
        let width = parseFloat(preview.style.width);
        frame.dispatchEvent(new WheelEvent("wheel", {deltaY: -100, clientX: bounds.left + 20,
            clientY: bounds.top + 20, bubbles: true, cancelable: true}));
        check(parseFloat(preview.style.width) > width, "Save preview wheel did not zoom: "
            + format + " " + width + " -> " + preview.style.width);
        for (let key of ["0", "1"]) {
            frame.dispatchEvent(new KeyboardEvent("keydown", {key, ctrlKey: true, bubbles: true,
                cancelable: true}));
        }
        frame.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}));
        frame.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}));
        if (format === "jpeg") {
            let quality = dialog.querySelector("input[type=number]");
            input(quality, 150);
            check(quality.value === "100", "JPEG quality was not clamped");
            input(dialog.querySelector("input[type=range]"), 77);
            check(quality.value === "77", "JPEG quality slider/number disagree");
            change(dialog.querySelector(".save-config-chroma"), "4:4:4");
            dialog.querySelector(".save-config-defaults").click();
            check(quality.value === "95", "JPEG defaults were not restored");
            input(quality, 81);
            change(dialog.querySelector(".save-config-chroma"), "4:4:4");
        }
        check(dialog.checkValidity(), "Save settings are not valid");
        dialog.requestSubmit();
        let result = await pending;
        check(result.format === format && result.blob.size > 0, "Save result lost its format/blob");
        if (format === "jpeg") {
            check(result.options.quality === 81 && result.options.subsampling === "4:4:4",
                "Save result lost JPEG options");
        }
    }
    phase("rapid save-format changes preserve per-format quality and submit fresh encoded bytes");
    let switching = SaveImageDialog.open({canvas, encode, initialFormat: "jpeg"});
    await waitFor(ready);
    let switchingDialog = form();
    let formatPicker = [...switchingDialog.querySelectorAll("select")]
        .find(select => [...select.options].some(option => option.value === "png"));
    let switchingQuality = switchingDialog.querySelector('input[type="number"]');
    let chroma = switchingDialog.querySelector(".save-config-chroma");
    input(switchingQuality, 31);
    change(formatPicker, "png");
    check(switchingQuality.closest("[hidden]") !== null && chroma.closest("[hidden]") !== null,
        "Lossless PNG format retained lossy quality/chroma controls");
    change(formatPicker, "webp");
    check(switchingQuality.closest("[hidden]") === null && chroma.closest("[hidden]") !== null,
        "WebP format did not expose quality independently of JPEG chroma");
    input(switchingQuality, 57);
    change(formatPicker, "jpeg");
    check(switchingQuality.value === "31" && chroma.closest("[hidden]") === null,
        "Returning to JPEG lost its independent quality or chroma controls");
    switchingDialog.requestSubmit();
    let switched = await switching;
    let signature = new Uint8Array(await switched.blob.arrayBuffer()).slice(0, 2);
    check(switched.format === "jpeg" && switched.options.quality === 31 && switched.blob.type === "image/jpeg"
        && signature[0] === 255 && signature[1] === 216, "Immediate format-change submission reused stale format/options/encoded bytes");
    let switchedImage = await createImageBitmap(switched.blob);
    check(switchedImage.width === 32 && switchedImage.height === 16, "Switched JPEG encoding lost image dimensions");
    switchedImage.close();
    phase("save cancellation and failed encoding");
    for (let action of ["escape", "close", "cancel"]) {
        let pending = SaveImageDialog.open({canvas, encode});
        let dialog = form();
        if (action === "escape") {
            cancel(dialog);
        } else if (action === "close") {
            dialog.querySelector(".app-dialog-close").click();
        } else {
            [...dialog.querySelectorAll("button")].find(button => button.textContent === "Cancel").click();
        }
        check(await pending === null, "Cancelled save returned data");
    }
    phase("canceling a queued quality change prevents another encoding");
    let queuedEncodes = 0;
    let queuedSave = SaveImageDialog.open({canvas, initialFormat: "jpeg", encode: (format, options) => {
        ++queuedEncodes;
        return encode(format, options);
    }});
    await waitFor(ready);
    let queuedQuality = form().querySelector("input[type=number]");
    input(queuedQuality, "");
    check(queuedQuality.value === "0", "Empty save quality did not normalize to zero");
    input(queuedQuality, 71);
    cancel(form());
    check(await queuedSave === null, "Canceling queued quality returned save data");
    await new Promise(resolve => setTimeout(resolve, 140));
    check(queuedEncodes === 1 && form() === null, "Canceled quality timer started another encoding or revived its dialog");
    let pending = SaveImageDialog.open({canvas, encode: async () => {
        throw new Error("Injected encoder failure");
    }});
    await waitFor(() => form().querySelector(".save-config-status").textContent === "Injected encoder failure");
    check(form().querySelector("button[type=submit]").disabled, "Failed encoding enabled save");
    form().requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(form() !== null, "Failed encoding submitted a success-shaped result");
    cancel(form());
    check(await pending === null, "Failed preview could not be cancelled");

    phase("stale save previews");
    let release;
    pending = SaveImageDialog.open({canvas, encode: () => new Promise(resolve => {
        release = resolve;
    })});
    await waitFor(() => typeof release === "function");
    cancel(form());
    check(await pending === null, "In-flight save did not cancel");
    release(await encode("png", {}));
    await new Promise(resolve => setTimeout(resolve, 30));
    check(form() === null, "Late encoder result revived a closed dialog");

    phase("out-of-order save results retain the current format and report large file sizes");
    let realPng = await encode("png", {});
    for (let [staleFailure, padding, unit] of [[false, 2048, "KB"], [true, 2 * 1024 * 1024, "MB"]]) {
        let requests = [];
        pending = SaveImageDialog.open({canvas, initialFormat: "jpeg", encode: (format, values) => new Promise((resolve, reject) => {
            requests.push({format, values, resolve, reject});
        })});
        await waitFor(() => requests.length === 1);
        let dialog = form();
        let picker = [...dialog.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "png"));
        change(picker, "png");
        await waitFor(() => requests.length === 2);
        check(requests[0].format === "jpeg" && requests[1].format === "png", "Save generations used the wrong formats");
        let latest = new Blob([realPng, new Uint8Array(padding)], {type: "image/png"});
        requests[1].resolve(latest);
        await waitFor(ready);
        await waitFor(() => dialog.querySelector(".save-config-preview-stage img").naturalWidth === 32);
        let label = dialog.querySelector(".save-config-preview-heading").textContent;
        check(label.includes(unit), "Save file-size label did not use " + unit);
        if (staleFailure) {
            requests[0].reject(new Error("Obsolete JPEG encoding failed"));
        } else {
            requests[0].resolve(await encode("jpeg", {}));
        }
        await new Promise(resolve => setTimeout(resolve, 0));
        check(ready() && dialog.querySelector(".save-config-status").textContent === ""
            && dialog.querySelector(".save-config-preview-heading").textContent === label,
        "An obsolete encoder result replaced the current preview or error state");
        dialog.requestSubmit();
        let saved = await pending;
        check(saved.format === "png" && saved.blob === latest, "Out-of-order encoder completion submitted stale bytes");
    }
    phase("late preview failures and repeated stale close callbacks cannot affect a newer save dialog");
    let failLate;
    pending = SaveImageDialog.open({canvas, encode: () => new Promise((resolve, reject) => failLate = reject)});
    await waitFor(() => typeof failLate === "function");
    let staleClose = form().querySelector(".app-dialog-close");
    staleClose.click();
    check(await pending === null, "Closing an in-flight preview returned data");
    let next = SaveImageDialog.open({canvas, encode});
    await waitFor(ready);
    let currentDialog = form();
    staleClose.click();
    failLate(new Error("Late failed encoder"));
    await new Promise(resolve => setTimeout(resolve, 0));
    check(form() === currentDialog && ready() && currentDialog.querySelector(".save-config-status").textContent === "",
        "A stale close callback or rejected preview affected the newer dialog");
    cancel(currentDialog);
    check(await next === null, "The newer save dialog could not be canceled");

    phase("large save previews retain manual zoom on resize and toggle back to fit");
    let largeCanvas = document.createElement("canvas");
    largeCanvas.width = 1600;
    largeCanvas.height = 900;
    largeCanvas.getContext("2d").fillRect(0, 0, 1600, 900);
    pending = SaveImageDialog.open({canvas: largeCanvas, initialFormat: "jpeg",
        encode: (format, options) => ImageEncoder.encode(largeCanvas, format, options)});
    await waitFor(ready);
    let zoomDialog = form();
    let zoomImage = zoomDialog.querySelector(".save-config-preview-stage img");
    let zoomFrame = zoomDialog.querySelector(".save-config-preview-frame");
    await waitFor(() => zoomImage.naturalWidth === 1600 && parseFloat(zoomImage.style.width) < 1600);
    zoomFrame.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}));
    check(parseFloat(zoomImage.style.width) === 1600, "Double click did not restore actual image size");
    let previousPreviewUrl = zoomImage.src;
    input(zoomDialog.querySelector("input[type=number]"), 71);
    await waitFor(() => ready() && zoomImage.src !== previousPreviewUrl && zoomImage.complete);
    check(parseFloat(zoomImage.style.width) === 1600, "Re-encoding the image discarded manual preview zoom");
    let originalFrameWidth = zoomFrame.style.width;
    zoomFrame.style.width = "250px";
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    check(parseFloat(zoomImage.style.width) === 1600, "Viewport resize discarded manual save-preview zoom");
    zoomFrame.style.width = originalFrameWidth;
    zoomFrame.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let fittedWidth = 1600 * Math.max(.01, Math.min(1,
        (zoomFrame.clientWidth - 64) / 1600, (zoomFrame.clientHeight - 64) / 900));
    check(Math.abs(parseFloat(zoomImage.style.width) - fittedWidth) < 1,
        "Double click did not return a manually zoomed preview to fit");
    cancel(zoomDialog);
    check(await pending === null, "Zoomed preview cancellation returned save data");

    phase("late fallback PNG conversion cannot replace a newer preview or revive a closed dialog");
    let canvasToBlob = ImageEncoder.canvasToBlob;
    for (let action of ["change-format", "close"]) {
        let resolveFallback;
        try {
            ImageEncoder.canvasToBlob = (input, type) => {
                check(input === canvas && type === "image/png", "Fallback preview converted the wrong source or type");
                return new Promise(resolve => resolveFallback = resolve);
            };
            pending = SaveImageDialog.open({canvas, initialFormat: "tiff", encode: async () => realPng});
            await waitFor(() => typeof resolveFallback === "function");
            let fallbackDialog = form();
            if (action === "close") {
                cancel(fallbackDialog);
                check(await pending === null, "In-flight fallback conversion prevented cancellation");
            } else {
                let picker = [...fallbackDialog.querySelectorAll("select")]
                    .find(select => [...select.options].some(option => option.value === "png"));
                change(picker, "png");
                await waitFor(ready);
                await waitFor(() => fallbackDialog.querySelector("img").complete);
            }
            let currentPreview = fallbackDialog.querySelector(".save-config-preview-stage img").src;
            resolveFallback(await canvasToBlob(canvas, "image/png"));
            await new Promise(resolve => setTimeout(resolve, 30));
            check(fallbackDialog.querySelector(".save-config-preview-stage img").src === currentPreview,
                "Obsolete fallback conversion changed the preview image");
            if (action === "change-format") {
                fallbackDialog.requestSubmit();
                let result = await pending;
                check(result.format === "png" && result.blob === realPng,
                    "Obsolete fallback conversion changed the saved format/blob");
            } else {
                check(form() === null, "Late fallback conversion revived a closed save dialog");
            }
        } finally {
            ImageEncoder.canvasToBlob = canvasToBlob;
        }
    }

    phase("native file write");
    let fs = require("node:fs");
    let filePath = require("node:path").join(require("node:process").env.PAINTDOTJS_TEST_USER_DATA, "saved.png");
    workspace.setFileInfo("saved.png", null, filePath, "png", {});
    workspace.setDirty(true);
    check(await DocumentIO.saveActive(), "Native save failed");
    check(!workspace.isDirty(), "Successful save left the document dirty");
    let bytes = fs.readFileSync(filePath);
    equal(bytes.subarray(0, 8), [137, 80, 78, 71, 13, 10, 26, 10], "Saved file is not PNG");
    let decoded = await window.portableImageCodec.decode(bytes, "png");
    equal(decoded.rgba, surface.context.getImageData(0, 0, 32, 16).data, "Saved PNG changed pixels");

    phase("merged whole-document copy preserves composited pixels when system clipboard permission is denied");
    app.setActiveTool(null);
    workspace.getSelection().reset();
    let mergedExpected = surface.context.getImageData(0, 0, 32, 16).data;
    let mergedLayer = Layer.createLayer(workspace, 32, 16, "Merged copy marker");
    mergedLayer.getSurface().context.fillStyle = "#00ff00";
    mergedLayer.getSurface().context.fillRect(0, 0, 1, 1);
    workspace.getDocument().addLayer(mergedLayer);
    mergedExpected.set([0, 255, 0, 255], 0);
    let writeClipboard = navigator.clipboard.write;
    let deniedCopies = 0;
    try {
        navigator.clipboard.write = async () => {
            ++deniedCopies;
            throw new DOMException("Clipboard write denied", "NotAllowedError");
        };
        check(await DocumentIO.copySelection(true), "Permission-denied merged copy lost its in-app clipboard");
    } finally {
        navigator.clipboard.write = writeClipboard;
    }
    let mergedCopy = await window.portableImageCodec.decode(new Uint8Array(await DocumentIO.internalClipboard.arrayBuffer()), "png");
    equal(mergedCopy.rgba, mergedExpected, "Whole-canvas merged clipboard changed composition pixels");
    check(deniedCopies === 1 && mergedCopy.width === 32 && mergedCopy.height === 16
        && DocumentIO.internalClipboardInfo.bounds.x === 0 && DocumentIO.internalClipboardInfo.bounds.y === 0,
        "Merged copy lost its full-canvas bounds or bypassed the clipboard write boundary");
    workspace.getDocument().getLayers().removeLayer(mergedLayer);
    mergedLayer.dispose();
    phase("selection outlines and pixel clipboard");
    let selection = workspace.getSelection();
    check(!DocumentIO.copySelectionOutline() && !DocumentIO.pasteSelectionOutline(),
        "Empty selection/outline clipboard reported a successful outline operation");
    selection.setContinuation(new Rectangle(8, 4, 8, 4), CombineMode.REPLACE);
    selection.commitContinuation();
    check(DocumentIO.copySelectionOutline(), "Selection outline was not copied");
    let previousOutline = DocumentIO.internalSelectionPath;
    check(DocumentIO.copySelectionOutline() && previousOutline.vertexLists === null
        && DocumentIO.internalSelectionPath !== previousOutline, "Replacing an outline clipboard retained the old path");
    selection.reset();
    check(DocumentIO.pasteSelectionOutline(), "Selection outline was not pasted");
    check(selection.getBounds().width === 8 && selection.getBounds().height === 4,
        "Pasted selection lost its geometry");
    workspace.getHistory().stepBackward();
    check(selection.isEmpty(), "Selection paste undo failed");
    workspace.getHistory().stepForward();
    check(await DocumentIO.copySelection(), "Selection pixels were not copied");
    let blob = DocumentIO.internalClipboard;
    let clipboard = await window.portableImageCodec.decode(new Uint8Array(await blob.arrayBuffer()), "png");
    check(clipboard.width === 8 && clipboard.height === 4, "Clipboard crop has wrong dimensions");
    check(clipboard.rgba.every((value, index) => value === [255, 0, 0, 255][index % 4]),
        "Clipboard crop changed selected pixels");
    check(await DocumentIO.cutSelection(), "Cut failed");
    check(surface.context.getImageData(8, 4, 1, 1).data[3] === 0, "Cut did not erase selected pixels");
    workspace.getHistory().stepBackward();
    equal(surface.context.getImageData(8, 4, 1, 1).data, [255, 0, 0, 255], "Cut undo lost pixels");
    let layerCount = workspace.getDocument().getLayers().getLayerCount();
    check(await DocumentIO.pasteIntoNewLayer(), "Paste into layer failed");
    check(workspace.getDocument().getLayers().getLayerCount() === layerCount + 1,
        "Paste did not add a layer");
    equal(workspace.getActiveLayer().getSurface().context.getImageData(8, 4, 1, 1).data,
        [255, 0, 0, 255], "Paste lost its copied origin");
    workspace.getHistory().stepBackward();
    check(workspace.getDocument().getLayers().getLayerCount() === layerCount, "Paste-layer undo failed");
    workspace.getHistory().stepForward();
    check(await DocumentIO.pasteIntoNewImage(), "Paste into image failed");
    let pasted = app.getActiveDocumentWorkspace();
    check(pasted.getDocument().getWidth() === 8 && pasted.getDocument().getHeight() === 4,
        "New pasted document has incorrect dimensions");
    check(pasted.isDirty(), "New pasted document was marked saved");
    app.closeDocumentWorkspace(pasted, false);
    app.setActiveDocumentWorkspace(workspace);

    phase("fully offscreen copy/cut preserves clipboard identity, pixels and history");
    let savedClipboard = DocumentIO.internalClipboard;
    let savedClipboardInfo = DocumentIO.internalClipboardInfo;
    let activeSurface = workspace.getActiveLayer().getSurface();
    let beforeOffscreen = activeSurface.context.getImageData(0, 0, 32, 16).data;
    selection.reset();
    selection.setContinuation(new Rectangle(100, 100, 4, 4), CombineMode.REPLACE);
    selection.commitContinuation();
    let beforeHistory = workspace.getHistory().undoStack.length;
    check(!await DocumentIO.copySelection() && !await DocumentIO.cutSelection(),
        "Copy/cut accepted a selection with no pixels inside the canvas");
    check(DocumentIO.internalClipboard === savedClipboard && DocumentIO.internalClipboardInfo === savedClipboardInfo,
        "Offscreen copy replaced a valid clipboard image or its origin metadata");
    equal(activeSurface.context.getImageData(0, 0, 32, 16).data, beforeOffscreen, "Offscreen cut changed layer pixels");
    check(workspace.getHistory().undoStack.length === beforeHistory, "Offscreen copy/cut recorded a history entry");
    app.setActiveToolFromType(ToolType.PENCIL);
    check(app.getActiveTool().isActive(), "Crop regression requires an active pencil tool");
    let beforeCropDocument = workspace.getDocument();
    check(DocumentIO.cropToSelection() === false, "Offscreen crop reported a document change");
    check(app.getActiveTool() !== null && app.getActiveTool().getType() === ToolType.PENCIL,
        "Offscreen crop disabled the active tool");
    check(workspace.getDocument() === beforeCropDocument && workspace.getHistory().undoStack.length === beforeHistory,
        "Offscreen crop replaced the document or recorded history");
    equal(activeSurface.context.getImageData(0, 0, 32, 16).data, beforeOffscreen, "Offscreen crop changed pixels");
    selection.reset();

    phase("dirty document close and modal choice");
    workspace.setDirty(true);
    pending = DocumentIO.closeDocumentWorkspace(workspace);
    check(await DocumentIO.closeDocumentWorkspace(workspace) === false, "Concurrent close was accepted");
    let dialog = document.querySelector(".unsaved-changes-dialog");
    check(dialog.textContent.includes("saved.png"), "Close confirmation lost the filename");
    let choices = [...dialog.querySelectorAll(".task-dialog-choice")];
    choices[2].click();
    check(await pending === false && workspace.document !== null, "Cancel closed the dirty document");
    pending = DocumentIO.closeDocumentWorkspace(workspace);
    document.querySelectorAll(".unsaved-changes-dialog .task-dialog-choice")[1].click();
    check(await pending === true && workspace.document === null, "Discard did not close the document");
    check(await DocumentIO.closeDocumentWorkspace(workspace) === false, "Closed document closed twice");
    check(await DocumentIO.closeDocumentWorkspace(null) === false, "Null workspace was closed");
    return {ok: true};
};
