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

class DdsDecoder {

    static decode(bytes) {
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError("DDS input must be a Uint8Array");
        }

        if (bytes.length < 4 || bytes[0] !== 0x44 || bytes[1] !== 0x44
            || bytes[2] !== 0x53 || bytes[3] !== 0x20) {
            return null;
        }
        if (bytes.length < 128) {
            throw new Error("Truncated DDS header");
        }
        let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint32(4, true) !== 124 || view.getUint32(76, true) !== 32) {
            throw new Error("Invalid DDS header size");
        }
        let flags = view.getUint32(80, true);
        if ((flags & 0x40) === 0 || (flags & 0x4) !== 0 || view.getUint32(88, true) !== 32) {
            return null;
        }
        let red = view.getUint32(92, true);
        let green = view.getUint32(96, true);
        let blue = view.getUint32(100, true);
        let hasAlpha = (flags & 1) !== 0;
        let rgbaOrder = red === 0xff && green === 0xff00 && blue === 0xff0000;
        let bgraOrder = red === 0xff0000 && green === 0xff00 && blue === 0xff;
        if ((!rgbaOrder && !bgraOrder) || (hasAlpha && view.getUint32(104, true) !== 0xff000000)) {
            return null;
        }
        let width = view.getUint32(16, true);
        let height = view.getUint32(12, true);
        let rowBytes = width * 4;
        let rowStride = (view.getUint32(8, true) & 8) !== 0 ? view.getUint32(20, true) : rowBytes;
        let length = rowStride * height;
        if (width === 0 || height === 0 || rowStride < rowBytes || !Number.isSafeInteger(length)) {
            throw new Error("Invalid DDS dimensions or row pitch");
        }
        if (length > bytes.length - 128) {
            throw new Error("Truncated DDS pixels");
        }
        let rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                let source = 128 + y * rowStride + x * 4;
                let target = (y * width + x) * 4;
                rgba[target] = bytes[source + (rgbaOrder ? 0 : 2)];
                rgba[target + 1] = bytes[source + 1];
                rgba[target + 2] = bytes[source + (rgbaOrder ? 2 : 0)];
                rgba[target + 3] = hasAlpha ? bytes[source + 3] : 255;
            }
        }
        return {width, height, rgba};
    }
}

export default DdsDecoder;
