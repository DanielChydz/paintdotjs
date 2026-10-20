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

// Pixel layouts follow the pinned jxrlib PixelFormatLookup table.
class JpegXrPixels {

    static half(value) {
        let sign = value & 0x8000 ? -1 : 1;
        let exponent = (value >>> 10) & 31;
        let fraction = value & 1023;
        if (exponent === 31) {
            return fraction === 0 ? sign * Infinity : NaN;
        }
        return sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
    }

    static sample(view, offset, depth) {
        switch (depth) {
            case "8": return view.getUint8(offset) / 255;
            case "16": return view.getUint16(offset, true) / 65535;
            case "16Fixed": return view.getInt16(offset, true) / 8192;
            case "16Float": return this.half(view.getUint16(offset, true));
            case "32": return view.getUint32(offset, true) / 4294967295;
            case "32Fixed": return view.getInt32(offset, true) / 16777216;
            case "32Float": return view.getFloat32(offset, true);
            default: throw new Error("Unsupported JPEG XR sample depth: " + depth);
        }
    }

    static color(value, linear) {
        // Preserve the existing HDR-to-SDR mapping. Alpha is always linear
        // coverage and must never go through tone mapping or gamma correction.
        if (Number.isNaN(value) || value <= 0) {
            return 0;
        }
        if (value === Infinity) {
            return 255;
        }
        let normalized = linear ? value / (1 + value) : Math.min(1, value);
        return Math.round((linear ? normalized ** (1 / 2.2) : normalized) * 255);
    }

    static convert(decoded) {
        let {width, height, bytes, pixelInfo: info} = decoded;
        let {colorFormat, bitDepth, bitsPerPixel, hasAlpha} = info;
        let colors = {Gray: 1, RGB: 3, CMYK: 4, RGBE: 4}[colorFormat];
        if (colors === undefined || info.channels !== colors + (hasAlpha ? 1 : 0)
            || (colorFormat === "RGBE" && (hasAlpha || bitDepth !== "8" || bitsPerPixel !== 32))) {
            throw new Error("This JPEG XR pixel format is not supported");
        }
        let sampleBytes = {"8": 1, "16": 2, "16Fixed": 2, "16Float": 2,
            "32": 4, "32Fixed": 4, "32Float": 4}[bitDepth];
        let packed = ["5", "565", "10"].includes(bitDepth);
        let stride = bitsPerPixel / 8;
        if ((packed && (colorFormat !== "RGB" || hasAlpha || bitsPerPixel !== (bitDepth === "10" ? 32 : 16)))
            || (!packed && (sampleBytes === undefined || stride < info.channels * sampleBytes
                || stride % sampleBytes !== 0))) {
            throw new Error("This JPEG XR bit depth or layout is not supported: " + bitDepth);
        }
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
            || width > 32768 || height > 32768
            || bytes.length !== width * height * stride) {
            throw new Error("Invalid JPEG XR pixel buffer");
        }
        let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let rgba = new Uint8ClampedArray(width * height * 4);
        let linear = ["16Fixed", "16Float", "32Fixed", "32Float"].includes(bitDepth) || colorFormat === "RGBE";
        for (let source = 0, target = 0; target < rgba.length; source += stride, target += 4) {
            let alpha = hasAlpha ? Math.max(0, Math.min(1,
                this.sample(view, source + colors * sampleBytes, bitDepth))) : 1;
            let packedValue = packed ? (stride === 2 ? view.getUint16(source, true) : view.getUint32(source, true)) : 0;
            for (let channel = 0; channel < 3; ++channel) {
                let value;
                if (packed) {
                    let greenBits = bitDepth === "565" ? 6 : bitDepth === "10" ? 10 : 5;
                    let bits = channel === 1 ? greenBits : bitDepth === "10" ? 10 : 5;
                    let shift = channel === 0 ? greenBits + bits : channel === 1 ? (bitDepth === "10" ? 10 : 5) : 0;
                    value = ((packedValue >>> shift) & ((1 << bits) - 1)) / ((1 << bits) - 1);
                } else if (colorFormat === "RGBE") {
                    let exponent = bytes[source + 3];
                    value = exponent === 0 ? 0 : bytes[source + channel] * 2 ** (exponent - 136);
                } else {
                    let component = colorFormat === "Gray" ? 0 : info.bgr ? 2 - channel : channel;
                    value = this.sample(view, source + component * sampleBytes, bitDepth);
                    if (colorFormat === "CMYK") {
                        // Unprofiled subtractive fallback; no printer profile
                        // can be inferred from four component values alone.
                        value = (1 - value) * (1 - this.sample(view, source + 3 * sampleBytes, bitDepth));
                    }
                }
                if (info.premultipledAlpha) {
                    value = alpha > 0 ? value / alpha : 0;
                }
                rgba[target + channel] = this.color(value, linear);
            }
            rgba[target + 3] = Math.round(alpha * 255);
        }
        return {width, height, rgba};
    }
}

export default JpegXrPixels;
