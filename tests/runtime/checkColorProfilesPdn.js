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

module.exports = async function checkColorProfilesPdn() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let rejects = async (operation, pattern) => {
        try {
            await operation();
        } catch (error) {
            check(pattern.test(error.message), "Unexpected failure: " + error.message);
            return;
        }
        throw new Error("Expected failure: " + pattern);
    };
    let wait = async (promise, label) => {
        let timer;
        try {
            return await Promise.race([promise, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error("Timed out: " + label)), 5000);
            })]);
        } finally {
            clearTimeout(timer);
        }
    };
    let bytes = text => Uint8Array.from(atob(text), value => value.charCodeAt(0));
    let profileBytes = bytes("AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACgAUAA0AMQAoYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABilwAAt4cAABjZWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAb6AAADj1AAADkHBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c");
    let taggedPng = bytes("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAABdmlDQ1BJQ0MgUHJvZmlsZQAAeJx1kbtLw1AUxn+2SkVbHHQQceig0sGCDxBHrUOXIqUq+FramLZCmoakRYqr4OJQcBBdfA3+B7oKrgqCoAgizo6+FpF4rim0iN5wc358936Hky/gSxhawWmegIJZslPxWHh+YTEceKaNLkIME0lrjjWZTCb4d33c0qTqTVT1+v/en6t9RXc0aGoVHtMsuyQs05BYK1mKt4S7tHx6RfhAeNCWAYUvlZ7x+ElxzuM3xfZsagp8qmc418CZBtbydkE4ItxXMMpabR71JUHdnJuR2iO7F4cUcWKEyVBmFYMSUammZPa3b+jHN01RPJq8LSrY4siRF++gqGXpqkvNiq7LY1BRuf/O08mOjnjdgzFoeXTd134IbMNX1XU/D1336wj8D3Bu1v2ZHTjbhO77uta3Dx0bcHpR14qS5/i7+KtW2k7/SH7ZvmwWXk4gtACd19C25GVVO+f4DmbX5Rddwe4eDMj9juVvZkRoMsoCq9YAAAARSURBVHicY7xjE/XfKeVNIwAUOgSG9nzjSAAAAABJRU5ErkJggg==");
    let profile = await window.portableImageCodec.inspectColorProfile(profileBytes);
    check(profile.rgb, "RGB profile was not recognized");
    for (let invalid of [new Uint8Array(0), new Uint8Array(128), profileBytes.slice(0, 128)]) {
        await rejects(() => window.portableImageCodec.inspectColorProfile(invalid), /Invalid ICC/);
    }
    let badSignature = profileBytes.slice();
    badSignature[36] = 0;
    await rejects(() => window.portableImageCodec.inspectColorProfile(badSignature), /Invalid ICC/);
    let decoded = await window.portableImageCodec.decode(taggedPng, "png");
    check(decoded.rgba[0] === 60 && decoded.rgba[1] === 220 && decoded.rgba[4] === 160
        && decoded.rgba[5] === 30 && decoded.rgba[7] === 128, "Import did not convert swapped-primary ICC to sRGB");
    let workspace = await DocumentIO.openImage(new window.File([taggedPng], "tagged.png", {type: "image/png"}));
    let model = workspace.getDocument();
    check(ColorProfileManager.get(model) !== null, "Import lost source ICC");
    let rendered = workspace.getActiveLayer().getSurface().context.getImageData(0, 0, 2, 1).data;
    check(rendered[0] === 60 && rendered[1] === 220, "Managed import did not reach the document");
    let readClipboard = DocumentIO.readClipboardImage;
    try {
        DocumentIO.readClipboardImage = async () => new Blob([taggedPng], {type: "image/png"});
        await DocumentIO.pasteIntoNewImage();
        check(ColorProfileManager.get(app.getActiveDocumentWorkspace().getDocument()) !== null,
            "Paste into new image lost ICC");
    } finally {
        DocumentIO.readClipboardImage = readClipboard;
    }
    let originalMetadata = JSON.stringify(model.metadata);
    ColorProfileManager.set(workspace, null);
    check(ColorProfileManager.get(model) === null, "sRGB preference not applied");
    await workspace.getHistory().stepBackward();
    check(JSON.stringify(model.metadata) === originalMetadata, "Undo lost ICC metadata");
    await workspace.getHistory().stepForward();
    check(ColorProfileManager.get(model) === null, "Redo lost ICC preference");
    ColorProfileManager.set(workspace, profile);
    // Uniform opaque pixels avoid conflating ICC conversion with lossy chroma subsampling.
    workspace.getActiveLayer().getSurface().context.fillStyle = "rgb(60,220,90)";
    workspace.getActiveLayer().getSurface().context.fillRect(0, 0, 2, 1);
    workspace.getActiveLayer().invalidate();
    workspace.updateComposition();
    for (let format of ["png", "jpeg", "webp", "tiff", "avif", "jxl"]) {
        let output = await DocumentIO.encodeWorkspace(workspace, format, {quality: 100, compression: "lzw"});
        let encoded = new Uint8Array(await output.arrayBuffer());
        let embedded = await window.portableImageCodec.readColorProfile(encoded, format);
        check(embedded !== null && embedded.data.length === profileBytes.length
            && embedded.data.every((byte, index) => byte === profileBytes[index]), "Export lost ICC: " + format);
        let roundtrip = await window.portableImageCodec.decode(encoded, format);
        let tolerance = ["jpeg", "avif", "jxl"].includes(format) ? 60 : 2;
        check(Math.abs(roundtrip.rgba[0] - rendered[0]) <= tolerance
            && Math.abs(roundtrip.rgba[1] - rendered[1]) <= tolerance, "Export failed color roundtrip: " + format);
    }
    await rejects(() => ImageEncoder.encode(workspace.getCompositionSurface().getCanvas(), "bmp", {colorProfile: profileBytes}), /does not support ICC/);
    workspace.getActiveLayer().properties.userMetadataItems = [{key: "custom-layer", value: "Żółw"}];
    let pdn = await DocumentIO.serializePdn(workspace);
    let saved = await DocumentIO.readPdn(new window.File([pdn], "profile.pdn"));
    check(JSON.stringify(saved.metadata) === JSON.stringify(model.metadata), "PDN lost source/export ICC");
    let reopened = await DocumentIO.createWorkspaceFromPdnData(saved, "profile.pdn");
    check(ColorProfileManager.get(reopened.getDocument()).data.every((byte, index) => byte === profileBytes[index]), "Reopen lost ICC");
    DocumentIO.resizeCanvas(reopened, 3, 2);
    check(ColorProfileManager.get(reopened.getDocument()) !== null, "Canvas resize lost profile");
    check(reopened.getActiveLayer().properties.userMetadataItems[0].value === "Żółw", "Resize lost layer metadata");
    let transformed = DocumentIO.transformDocument("flipHorizontal");
    check(transformed && ColorProfileManager.get(reopened.getDocument()) !== null, "Transform lost profile");
    let pending = ColorProfileDialog.open();
    check(ColorProfileDialog.open() === pending, "Profile dialog opened twice");
    document.querySelectorAll(".task-dialog-choice")[1].click();
    check(await wait(pending, "sRGB dialog"), "sRGB dialog action failed");
    pending = ColorProfileDialog.open();
    let input = document.querySelector(".task-dialog-content input[type=file]");
    let assign = async files => {
        Object.defineProperty(input, "files", {configurable: true, value: files});
        await input.onchange();
    };
    let apply = document.querySelector(".task-dialog-choice");
    check(apply.disabled, "Apply enabled before choosing a profile");
    await assign([]);
    await assign([new window.File(["invalid"], "bad.icc")]);
    check(apply.disabled && document.querySelector("[role=status]").textContent.includes("Could not load"), "Invalid ICC accepted");
    await assign([{size: 16 * 1024 * 1024 + 1}]);
    check(apply.disabled, "Oversized ICC accepted");
    let inspect = window.portableImageCodec.inspectColorProfile;
    try {
        window.portableImageCodec.inspectColorProfile = async () => ({...profile, rgb: false});
        await assign([new window.File([profileBytes], "cmyk.icc")]);
        check(apply.disabled, "Non-RGB export profile accepted");
        let resolveProfile;
        window.portableImageCodec.inspectColorProfile = () => new Promise(resolve => resolveProfile = resolve);
        let first = assign([new window.File([profileBytes], "slow.icc")]);
        await new Promise(resolve => setTimeout(resolve, 0));
        window.portableImageCodec.inspectColorProfile = inspect;
        await assign([new window.File([profileBytes], "swapped.icc")]);
        resolveProfile(profile);
        await first;
    } finally {
        window.portableImageCodec.inspectColorProfile = inspect;
    }
    await assign([new window.File([profileBytes], "swapped.icc")]);
    check(!apply.disabled, "Valid ICC could not be selected");
    apply.click();
    check(await wait(pending, "apply dialog") && ColorProfileManager.get(reopened.getDocument()) !== null,
        "Dialog lost chosen ICC");
    pending = ColorProfileDialog.open();
    document.querySelector(".task-dialog-choice").dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    check(await wait(pending, "cancel dialog") === false, "Dialog cancellation changed profile");
    ColorProfileManager.store(reopened.getDocument(), null, true);
    for (let rejectRead of [false, true]) {
        pending = ColorProfileDialog.open();
        let input = document.querySelector(".task-dialog-content input[type=file]");
        let complete;
        let read = new Promise((resolve, reject) => complete = rejectRead ? reject : resolve);
        Object.defineProperty(input, "files", {value: [{size: 10, arrayBuffer: () => read}]});
        let loading = input.onchange();
        document.querySelectorAll(".task-dialog-choice")[2].click();
        check(await wait(pending, "cancel during read") === false, "Pending profile read changed document");
        complete(rejectRead ? new Error("Read failed after cancellation") : profileBytes.buffer);
        await loading;
        check(ColorProfileManager.get(reopened.getDocument()) === null, "Late profile read changed document");
    }
    let many = app.createBlankDocumentInNewWorkspace(1, 1);
    many.getDocument().setResolution(300);
    many.getDocument().metadata.push({key: "Author", value: "Żółw"});
    for (let index = 0; index < 65; ++index) {
        let layer = index === 0 ? many.getActiveLayer() : Layer.createLayer(many, 1, 1, "Layer " + index);
        layer.properties.name = "Layer " + index;
        layer.properties.userMetadataItems = [{key: "index", value: String(index)}];
        layer.getSurface().context.fillStyle = "rgb(" + index + ",55,99)";
        layer.getSurface().context.fillRect(0, 0, 1, 1);
        if (index !== 0) {
            many.getDocument().addLayer(layer);
        }
    }
    let manyBlob = await DocumentIO.serializePdn(many);
    let manyData = await DocumentIO.readPdn(new window.File([manyBlob], "65-layers.pdn"));
    check(manyData.layers.length === 65 && manyData.resolution === 300, "65-layer PDN lost layers or resolution");
    for (let [index, layer] of manyData.layers.entries()) {
        check(layer.name === "Layer " + index && layer.canvas.getContext("2d").getImageData(0, 0, 1, 1).data[0] === index
            && layer.userMetadataItems[0].value === String(index), "65-layer PDN changed layer " + index);
    }
    let manyReopened = await DocumentIO.createWorkspaceFromPdnData(manyData, "65-layers.pdn");
    check(manyReopened.getDocument().getLayers().getLayerCount() === 65
        && manyReopened.getDocument().metadata.some(entry => entry.key === "Author" && entry.value === "Żółw"),
        "65-layer workspace lost document metadata");
    for (let entry of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(entry, false);
    }
    check(await ColorProfileDialog.open() === false, "Profile dialog needs an active document");
};
