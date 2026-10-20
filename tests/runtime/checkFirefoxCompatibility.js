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

module.exports = async function checkFirefoxCompatibility() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let rejects = async operation => {
        try {
            await operation();
        } catch (error) {
            check(/Invalid RGBA/.test(error.message), "Unexpected raw input error: " + error.message);
            return;
        }
        throw new Error("Invalid raw encoder input was accepted");
    };
    AboutDialog.instance?.close();
    app.setActiveTool(null);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(5, 3);
    let canvas = workspace.getActiveLayer().getSurface().getCanvas();
    let context = canvas.getContext("2d");
    let pixels = context.createImageData(5, 3);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
        pixels.data.set([37 + offset, 81, 191, (offset / 4) % 4 * 85], offset);
    }
    context.putImageData(pixels, 0, 0);
    let expected = context.getImageData(0, 0, 5, 3);
    for (let format of ["png", "tiff", "jxr", "heic"]) {
        let bytes = await window.portableImageCodec.encodePixels(expected, format, 100);
        let decoded = await window.portableImageCodec.decode(bytes, format);
        check(decoded.width === 5 && decoded.height === 3, "Raw encoder dimensions: " + format);
        check(decoded.rgba.every((value, index) => index % 4 === 3 || format !== "heic"
            ? value === expected.data[index] : true), "Raw encoder changed lossless channels: " + format);
    }
    for (let format of ["tiff", "jxr"]) {
        let blob = await ImageEncoder.encode(canvas, format, {quality: 100});
        let decoded = await window.portableImageCodec.decode(new Uint8Array(await blob.arrayBuffer()), format);
        check(decoded.rgba.every((value, index) => value === expected.data[index]),
            "Canvas export lost exact transparent RGBA: " + format);
    }
    for (let override of [{width: 0}, {height: 0}, {width: 1.5}, {height: NaN},
        {width: 32769}, {height: 32769}, {width: 16384, height: 16384},
        {data: new Uint8Array(60)}, {data: new Uint8ClampedArray(1)}]) {
        await rejects(() => window.portableImageCodec.encodePixels({width: 5, height: 3,
            data: new Uint8ClampedArray(60), ...override}, "png", 100));
    }
    let legacy = window.portableImageCodec.encodePixels;
    try {
        window.portableImageCodec.encodePixels = undefined;
        let opaque = document.createElement("canvas");
        opaque.width = opaque.height = 1;
        opaque.getContext("2d").fillRect(0, 0, 1, 1);
        let blob = await ImageEncoder.encodePortable(opaque, "tiff", {});
        check(blob.size > 0, "Legacy portable encoder fallback failed");
    } finally {
        window.portableImageCodec.encodePixels = legacy;
    }
    if (!isApp) {
        let shortcut = new KeyboardEvent("keydown", {key: "v", ctrlKey: true, bubbles: true, cancelable: true});
        window.dispatchEvent(shortcut);
        check(!shortcut.defaultPrevented, "Browser Ctrl+V still prevents native paste");
        let action = ActionRegistry.get("menu.edit.paste");
        let previous = action.getShortcutKey();
        try {
            action.setShortcutKey("Ctrl+Alt+P");
            let rebound = new KeyboardEvent("keydown", {key: "v", ctrlKey: true, bubbles: true, cancelable: true});
            window.dispatchEvent(rebound);
            check(rebound.defaultPrevented, "Paste routing ignored a custom shortcut");
        } finally {
            action.setShortcutKey(previous);
        }
    }
    app.closeDocumentWorkspace(workspace, false);
    return true;
};
