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

module.exports = async function checkDocumentIO() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let equal = (actual, expected, message) => check(actual.length === expected.length
        && actual.every((value, index) => value === expected[index]),
    message + "; actual: " + JSON.stringify([...actual]) + "; expected: " + JSON.stringify([...expected]));
    let rejects = async (operation, expected) => {
        let rejected = false;
        try {
            await operation();
        } catch (error) {
            check(expected.test(error.message), "Unexpected failure: " + error.message);
            rejected = true;
        }
        check(rejected, "Invalid document was accepted");
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    check(DocumentIO.transformDocument("flipHorizontal") === false, "Transform succeeded without a document");
    check(DocumentIO.transformActiveLayer("flipVertical") === false, "Layer transform succeeded without a layer");
    check(DocumentIO.cropToSelection() === false && DocumentIO.flattenDocument() === false,
        "Crop/flatten succeeded without a document");
    let workspace = app.createBlankDocumentInNewWorkspace(3, 2);
    let surface = workspace.getActiveLayer().getSurface();
    let pixels = new ImageData(new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
        0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 255, 255
    ]), 3, 2);
    surface.context.putImageData(pixels, 0, 0);
    let source = surface.getCanvas();
    phase("image formats");
    for (let format of ["png", "jpeg", "webp", "bmp", "gif", "tiff", "tga", "dds", "avif", "jxl"]) {
        let blob = await ImageEncoder.encode(source, format, {quality: 100, subsampling: "4:4:4"});
        check(blob.size > 0 && blob.type === SaveImageDialog.find(format).mime, "Invalid encoded MIME: " + format);
        let bytes = new Uint8Array(await blob.arrayBuffer());
        let decoded = await window.portableImageCodec.decode(bytes, format);
        check(decoded.width === 3 && decoded.height === 2, "Image dimensions changed: " + format);
        if (["png", "bmp", "tiff", "tga", "dds"].includes(format)) {
            equal(decoded.rgba, pixels.data, "Lossless image pixels changed: " + format);
        }
        let image = await DocumentIO.loadImage(new window.File([blob], "fixture." + format, {type: blob.type}));
        check(image.width === 3 && image.height === 2, "Document image loader lost dimensions: " + format);
        if (typeof image.close === "function") {
            image.close();
        }
    }
    await rejects(() => ImageEncoder.encode(source, "invalid"), /Unsupported image format/);
    await rejects(() => DocumentIO.loadImage(new Blob(["not an image"])), /Unsupported image format|could not be decoded/i);
    let png = await ImageEncoder.encode(source, "png");
    let imageElement = await DocumentIO.loadImageElement(png);
    check(imageElement.width === 3 && imageElement.height === 2, "Image-element fallback lost dimensions");
    await rejects(() => DocumentIO.loadImageElement(new Blob(["invalid"])), /Unsupported image format/);
    check(DocumentIO.getImageFormat(null) === null, "Empty image acquired a format");
    check(DocumentIO.getImageFormat({name: "PICTURE.TIFF"}) === "tiff", "File extension was not normalized");
    check(DocumentIO.getImageFormat({type: "image/avif"}) === "avif", "Image MIME was not recognized");

    phase("GIF code-width growth and dictionary reset preserve every palette pixel");
    let gifCanvas = document.createElement("canvas");
    gifCanvas.width = 256;
    gifCanvas.height = 128;
    let gifPixels = new ImageData(256, 128);
    let random = 0x12345678;
    for (let offset = 0; offset < gifPixels.data.length; offset += 4) {
        random ^= random << 13;
        random ^= random >>> 17;
        random ^= random << 5;
        let index = random & 255;
        gifPixels.data.set([Math.round((index >> 5) * 255 / 7),
            Math.round(((index >> 2) & 7) * 255 / 7), (index & 3) * 85, 255], offset);
    }
    gifCanvas.getContext("2d").putImageData(gifPixels, 0, 0);
    let gif = await ImageEncoder.encode(gifCanvas, "gif");
    let gifDecoded = await window.portableImageCodec.decode(new Uint8Array(await gif.arrayBuffer()), "gif");
    check(gifDecoded.width === 256 && gifDecoded.height === 128, "Large GIF lost its dimensions");
    equal(gifDecoded.rgba, gifPixels.data, "GIF dictionary rollover changed decoded palette pixels");
    let emptyCodes = ImageEncoder.gifLzw(new Uint8Array());
    equal(emptyCodes, [0, 3, 2], "Empty GIF LZW stream did not contain the clear and end codes");
    gifCanvas.width = 0;
    gifCanvas.height = 0;
    await rejects(() => ImageEncoder.canvasToBlob(gifCanvas, "image/png"), /Could not encode image\/png/);

    phase("native JPEG fallback flattens transparent pixels onto white without portable codecs");
    let portable = window.portableImageCodec;
    let transparent = document.createElement("canvas");
    transparent.width = 2;
    transparent.height = 2;
    try {
        window.portableImageCodec = undefined;
        let jpeg = await ImageEncoder.encode(transparent, "jpeg", {quality: 100});
        check(jpeg.type === "image/jpeg", "Native JPEG fallback returned the wrong MIME");
        let jpegImage = await createImageBitmap(jpeg);
        let decodedCanvas = document.createElement("canvas");
        decodedCanvas.width = 2;
        decodedCanvas.height = 2;
        decodedCanvas.getContext("2d").drawImage(jpegImage, 0, 0);
        check(decodedCanvas.getContext("2d").getImageData(0, 0, 2, 2).data.every(value => value === 255),
            "Native JPEG fallback retained transparent black instead of opaque white");
        jpegImage.close();
        await rejects(() => ImageEncoder.encode(transparent, "jxl"), /JXL encoding is not available/);
        await rejects(() => ImageEncoder.encode(transparent, "heic"), /HEIC encoding is not available/);
        await rejects(() => ImageEncoder.encode(transparent, "jxr"), /JXR encoding is not available/);
        check(ImageEncoder.mimeFor("unknown") === "application/octet-stream", "Unknown codec MIME fallback changed");
    } finally {
        window.portableImageCodec = portable;
        transparent.width = 0;
        transparent.height = 0;
    }

    phase("empty legacy PDN layer lists receive a background and invalid dimensions fail before creation");
    let countBeforeInvalid = app.getDocumentWorkspaces().length;
    for (let [width, height] of [[0, 3], [4.5, 3], [4, 0], [4, Infinity]]) {
        await rejects(() => DocumentIO.createWorkspaceFromPdnData({width, height, layers: []}, "invalid.pdn"), /Invalid \.pdn canvas size/);
        check(app.getDocumentWorkspaces().length === countBeforeInvalid, "Invalid PDN dimensions created a workspace");
    }
    let emptyPdn = await DocumentIO.createWorkspaceFromPdnData({width: 4, height: 3, layers: [], activeLayer: 99}, "empty-legacy.pdn");
    check(emptyPdn.getDocument().getLayers().size() === 1 && emptyPdn.getActiveLayer().properties.isBackground
        && emptyPdn.getActiveLayerIndex() === 0 && emptyPdn.getDocument().getResolution() === 96
        && !emptyPdn.isDirty(), "Empty PDN did not receive a saved background layer");
    check(emptyPdn.getActiveLayer().getSurface().context.getImageData(0, 0, 4, 3).data.every(value => value === 255),
        "Fallback PDN background was not opaque white");
    app.closeDocumentWorkspace(emptyPdn, false);
    app.setActiveDocumentWorkspace(workspace);

    phase("native PDN");
    workspace.getActiveLayer().properties.name = "Name \u017c <literal>";
    workspace.getActiveLayer().properties.opacity = 117;
    let file = new window.File([await DocumentIO.serializePdn(workspace)], "fixture.pdn");
    let decoded = await DocumentIO.readPdn(file);
    check(decoded.width === 3 && decoded.height === 2 && decoded.layers.length === 1,
        "PDN round-trip lost document structure");
    check(decoded.layers[0].name === "Name \u017c <literal>" && decoded.layers[0].opacity === 117,
        "PDN round-trip lost layer properties");
    equal(decoded.layers[0].canvas.getContext("2d").getImageData(0, 0, 3, 2).data,
        pixels.data, "PDN round-trip lost BGRA channel order");
    let imported = await DocumentIO.openPdn(file);
    check(imported.getDocument().getLayers().getLayerCount() === 1 && !imported.isDirty(),
        "PDN import initialized an incorrect workspace");
    app.closeDocumentWorkspace(imported, false);
    let legacy = {
        format: "paint.js.pdn/1", width: 3, height: 2, resolution: 120, activeLayer: 0,
        layers: [{name: "Legacy", png: source.toDataURL(), visible: false, opacity: 77}]
    };
    decoded = await DocumentIO.readPdn(new Blob([JSON.stringify(legacy)]));
    check(decoded.resolution === 120 && decoded.layers[0].visible === false, "Legacy PDN metadata was lost");
    imported = await DocumentIO.createWorkspaceFromPdnData(decoded, "legacy.pdn");
    check(imported.getActiveLayer().properties.opacity === 77, "Legacy PDN opacity was lost");
    app.closeDocumentWorkspace(imported, false);
    await rejects(() => DocumentIO.readPdn(new Blob(["invalid"])), /Unsupported .pdn document format/);
    await rejects(() => DocumentIO.readPdn(new Blob(['{"format":"other","layers":[]}'])),
        /Unsupported .pdn document format/);
    await rejects(() => DocumentIO.createWorkspaceFromPdnData({width: -1, height: 1}, "bad.pdn"),
        /Invalid .pdn canvas size/);

    phase("transforms and history");
    app.setActiveDocumentWorkspace(workspace);
    for (let [type, order, width, height] of [
        ["flipHorizontal", [2, 1, 0, 5, 4, 3], 3, 2],
        ["flipVertical", [3, 4, 5, 0, 1, 2], 3, 2],
        ["rotate180", [5, 4, 3, 2, 1, 0], 3, 2],
        ["rotate90CW", [3, 0, 4, 1, 5, 2], 2, 3],
        ["rotate90CCW", [2, 5, 1, 4, 0, 3], 2, 3]
    ]) {
        let before = workspace.getDocument();
        check(DocumentIO.transformDocument(type), "Document transform did not run: " + type);
        check(workspace.getDocument().getWidth() === width && workspace.getDocument().getHeight() === height,
            "Rotated document dimensions are incorrect");
        let expected = new Uint8ClampedArray(pixels.data.length);
        order.forEach((pixel, index) => expected.set(pixels.data.subarray(pixel * 4, pixel * 4 + 4), index * 4));
        equal(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, width, height).data,
            expected, "Incorrect transformed pixels: " + type);
        workspace.getHistory().stepBackward();
        check(workspace.getDocument() === before, "Undo did not restore the original document");
        workspace.getHistory().stepForward();
        equal(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, width, height).data,
            expected, "Redo changed transformed pixels");
        workspace.getHistory().stepBackward();
    }
    for (let type of ["flipHorizontal", "flipVertical", "rotate180"]) {
        check(DocumentIO.transformActiveLayer(type), "Layer transform did not run");
        workspace.getHistory().stepBackward();
        equal(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, 3, 2).data,
            pixels.data, "Layer undo did not restore pixels");
    }
    let target = document.createElement("canvas");
    target.width = 6;
    target.height = 4;
    let context = target.getContext("2d");
    for (let resampling of ["nearestNeighbor", "linearLowQuality", "linear", "cubicSmooth", "bestQuality"]) {
        DocumentIO.drawResizedImage(context, source, 6, 4, resampling, false);
        check(context.getImageData(0, 0, 1, 1).data[3] === 255, "Resizing lost opaque alpha");
    }
    DocumentIO.drawResizedImage(context, source, 6, 4, "linear", true);
    check(context.getImageData(0, 0, 1, 1).data[3] === 255, "Gamma-correct resizing lost alpha");
    await rejects(() => DocumentIO.drawTransformed(context, source, 3, 2, "invalid"), /Unknown transform/);
    for (let [anchor, x, y] of [
        ["topLeft", 0, 0], ["top", 1, 0], ["topRight", 3, 0],
        ["left", 0, 1], ["center", 1, 1], ["right", 3, 1],
        ["bottomLeft", 0, 3], ["bottom", 1, 3], ["bottomRight", 3, 3]
    ]) {
        let offset = DocumentIO.getCanvasResizeOffset(3, 2, 6, 5, anchor);
        check(offset.x === x && offset.y === y, "Canvas anchoring failed: " + anchor);
    }
    check(DocumentIO.cropToSelection() === false, "An empty selection was cropped");
    workspace.getSelection().setContinuation(new Rectangle(1, 0, 2, 2), CombineMode.REPLACE);
    check(DocumentIO.cropToSelection(), "Selected rectangle was not cropped");
    equal(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, 2, 2).data,
        new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255]),
        "Crop did not preserve selected pixels");
    workspace.getHistory().stepBackward();
    check(workspace.getDocument().getWidth() === 3, "Crop undo lost the original dimensions");
    target.width = 0;
    target.height = 0;
    app.closeDocumentWorkspace(workspace, false);
};
