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

module.exports = async function checkExportOptions() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let waitFor = async predicate => {
        let deadline = performance.now() + 10000;
        while (!predicate()) {
            check(performance.now() < deadline, "Export options preview timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let rejects = async (operation, pattern) => {
        let error = null;
        try {
            await operation();
        } catch (failure) {
            error = failure;
        }
        check(error !== null && pattern.test(error.message), "Invalid export options were accepted: " + error?.message);
    };
    let independentDecode = (bytes, format) => {
        let fs = require("node:fs");
        let path = require("node:path");
        let directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "paintjs-export-oracle-"));
        try {
            let filename = path.join(directory, "image." + format);
            fs.writeFileSync(filename, bytes);
            let result = require("node:child_process").spawnSync("ffmpeg", [
                "-v", "error", "-i", filename, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"
            ], {timeout: 10000});
            check(result.error === undefined && result.status === 0,
                "Independent FFmpeg decoding failed: " + result.error + " " + result.stderr);
            return new Uint8Array(result.stdout);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    };
    let equal = (actual, expected, tolerance, label) => {
        check(actual.length === expected.length, label + " changed pixel count");
        for (let index = 0; index < actual.length; ++index) {
            check(Math.abs(actual[index] - expected[index]) <= tolerance,
                label + " changed channel " + index + ": " + actual[index] + " vs " + expected[index]);
        }
    };
    let canvas = document.createElement("canvas");
    canvas.width = 5;
    canvas.height = 7;
    let context = canvas.getContext("2d");
    let pixels = context.createImageData(5, 7);
    for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data.set([32 + index % 180, 80, 192, (index / 4) % 4 * 85], index);
    }
    context.putImageData(pixels, 0, 0);
    let expected = context.getImageData(0, 0, 5, 7).data;
    let opaque = ImageEncoder.getPixels(canvas, true).data;
    let png = new Uint8Array(await (await ImageEncoder.encode(canvas, "png")).arrayBuffer());
    let tiffTag = (bytes, tag) => {
        let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let little = view.getUint16(0) === 0x4949;
        let ifd = view.getUint32(4, little);
        for (let index = 0; index < view.getUint16(ifd, little); ++index) {
            let entry = ifd + 2 + index * 12;
            if (view.getUint16(entry, little) === tag) {
                return view.getUint16(entry + 8, little);
            }
        }
        return null;
    };
    for (let colorMode of ["rgba", "rgb"]) {
        for (let [compression, tag] of [["none", 1], ["lzw", 5], ["zip", 8]]) {
            let blob = await ImageEncoder.encode(canvas, "tiff", {compression, colorMode});
            let bytes = new Uint8Array(await blob.arrayBuffer());
            check(tiffTag(bytes, 259) === tag && tiffTag(bytes, 277) === (colorMode === "rgba" ? 4 : 3),
                "TIFF writer ignored compression or channel count: " + compression + "/" + colorMode);
            let decoded = await window.portableImageCodec.decode(bytes, "tiff");
            check(decoded.width === 5 && decoded.height === 7, "TIFF dimensions changed");
            let reference = colorMode === "rgba" ? expected : opaque;
            equal(decoded.rgba, reference, colorMode === "rgba" ? 0 : 1, "TIFF round trip");
            if (isApp) {
                equal(independentDecode(bytes, "tiff"), reference, colorMode === "rgba" ? 0 : 1, "Independent TIFF");
            }
        }
    }
    for (let options of [{compression: "bad"}, {colorMode: "bad"}]) {
        await rejects(() => ImageEncoder.encode(canvas, "tiff", options), /Unsupported TIFF/);
        await rejects(() => window.portableImageCodec.encode(png, "tiff", 100, options), /Unsupported TIFF/);
    }
    // The portable API has defaults independently of the native writer.
    await window.portableImageCodec.encode(png, "tiff", 100);
    let formats = [{format: "tiff", values: ["rgb", "zip"], keys: ["colorMode", "compression"]}];
    for (let {format, values, keys} of formats) {
        let savedOptions = AppSettingsStore.get("fileTypes.saveOptions", {});
        let open = () => SaveImageDialog.open({canvas, initialFormat: format,
            encode: (id, options) => ImageEncoder.encode(canvas, id, options)});
        let pending = open();
        let dialog = document.querySelector(".save-config-dialog");
        let ready = () => !dialog.querySelector("button[type=submit]").disabled;
        await waitFor(ready);
        let select = [...dialog.querySelectorAll(".save-config-plugin-controls select")];
        check(select.length === values.length, "Save dialog omitted format options: " + format);
        for (let [index, value] of values.entries()) {
            select[index].value = value;
            select[index].dispatchEvent(new Event("change", {bubbles: true}));
        }
        dialog.requestSubmit();
        let result = await pending;
        check(keys.every((key, index) => result.options[key] === values[index]), "Save dialog ignored format options");
        pending = open();
        dialog = document.querySelector(".save-config-dialog");
        await waitFor(ready);
        select = [...dialog.querySelectorAll(".save-config-plugin-controls select")];
        check(select.every((item, index) => item.value === values[index]), "Save options did not persist by format");
        dialog.querySelector(".save-config-defaults").click();
        select = [...dialog.querySelectorAll(".save-config-plugin-controls select")];
        check(select.every(item => item.value === item.options[0].value), "Format defaults were not restored");
        dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
        check(await pending === null, "Cancelling export returned a save result");
        AppSettingsStore.set("fileTypes.saveOptions", savedOptions);
    }
};
