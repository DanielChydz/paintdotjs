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

import {
    AlphaAction,
    ColorType,
    ColorProfile,
    ColorSpace,
    CompressionMethod,
    ImageMagick,
    MagickColors,
    MagickFormat,
    initializeImageMagick
} from '@imagemagick/magick-wasm'
import srgbProfileUrl from '../assets/profiles/sRGB.icc'
import magickWasmUrl from '@imagemagick/magick-wasm/magick.wasm'
import DdsDecoder from './dds/DdsDecoder'
import WasmImageEncoder from './codec/encoder/WasmImageEncoder'
import JpegXrCodec from './codec/JpegXrCodec'
import heicEncoderFactory from '../lib/codecs/heic-encoder'
import heicEncoderWasm from '../lib/codecs/heic-encoder.wasm'
import jxrEncoderFactory from '../lib/codecs/jxr-encoder'
import jxrEncoderWasm from '../lib/codecs/jxr-encoder.wasm'

let imageMagickPromise = null;
let srgbProfile = null;
let heicEncoder = new WasmImageEncoder(heicEncoderFactory, heicEncoderWasm);
let jxrEncoder = new JpegXrCodec(jxrEncoderFactory, jxrEncoderWasm);

const initializePortableCodecs = () => {
    if (imageMagickPromise === null) {
        imageMagickPromise = fetch(magickWasmUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Could not load the bundled image codecs');
                }
                return response.arrayBuffer();
            })
            .then(async bytes => {
                await initializeImageMagick(new Uint8Array(bytes));
                let response = await fetch(srgbProfileUrl);
                if (!response.ok) {
                    throw new Error('Could not load the working color profile');
                }
                srgbProfile = new ColorProfile(new Uint8Array(await response.arrayBuffer()));
            });
    }
    return imageMagickPromise;
};

const magickFormat = format => ({
    png: MagickFormat.Png,
    jpeg: MagickFormat.Jpeg,
    jpg: MagickFormat.Jpeg,
    jpe: MagickFormat.Jpeg,
    webp: MagickFormat.WebP,
    gif: MagickFormat.Gif,
    bmp: MagickFormat.Bmp,
    avif: MagickFormat.Avif,
    heic: MagickFormat.Heic,
    heif: MagickFormat.Heif,
    jxl: MagickFormat.Jxl,
    dds: MagickFormat.Dds,
    tiff: MagickFormat.Tiff,
    tif: MagickFormat.Tiff,
    tga: MagickFormat.Tga
})[format] || MagickFormat.Unknown;

const decodeJpegXr = async bytes => {
    const decoded = await jxrEncoder.decode(bytes);
    const info = decoded.pixelInfo;
    if ((info.channels !== 3 && info.channels !== 4) || info.colorFormat !== 'RGB') {
        throw new Error('This JPEG XR pixel format is not supported');
    }
    let samples;
    let sample = null;
    if (info.bitDepth === '8') {
        samples = decoded.bytes;
        sample = index => samples[index] / 255;
    } else if (info.bitDepth === '16') {
        samples = new Uint16Array(decoded.bytes.buffer, decoded.bytes.byteOffset, decoded.bytes.byteLength / 2);
        sample = index => samples[index] / 65535;
    } else if (info.bitDepth === '32Float') {
        samples = new Float32Array(decoded.bytes.buffer, decoded.bytes.byteOffset, decoded.bytes.byteLength / 4);
        sample = index => Math.max(0, samples[index]) / (1 + Math.max(0, samples[index]));
    } else {
        throw new Error('This JPEG XR bit depth is not supported: ' + info.bitDepth);
    }
    const rgba = new Uint8ClampedArray(decoded.width * decoded.height * 4);
    const linearColor = info.bitDepth === '32Float';
    for (let source = 0, target = 0; target < rgba.length; source += info.channels, target += 4) {
        const alpha = info.hasAlpha ? Math.max(0, Math.min(1, sample(source + 3))) : 1;
        const color = channel => {
            const value = sample(source + channel);
            const unpremultiplied = info.premultipledAlpha && alpha > 0 ? value / alpha : value;
            const normalized = Math.max(0, Math.min(1, unpremultiplied));
            return Math.round((linearColor ? Math.pow(normalized, 1 / 2.2) : normalized) * 255);
        };
        rgba[target] = color(info.bgr ? 2 : 0);
        rgba[target + 1] = color(1);
        rgba[target + 2] = color(info.bgr ? 0 : 2);
        rgba[target + 3] = Math.round(alpha * 255);
    }
    return {width: decoded.width, height: decoded.height, rgba};
};

export async function inspectColorProfile(bytes) {
    await initializePortableCodecs();
    if (bytes.length < 128 || bytes.length > 16 * 1024 * 1024
        || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) !== bytes.length
        || new TextDecoder().decode(bytes.subarray(36, 40)) !== 'acsp') {
        throw new Error('Invalid ICC profile');
    }
    let profile = new ColorProfile(bytes);
    return {data: new Uint8Array(bytes), description: profile.description || 'ICC profile',
        rgb: profile.colorSpace === ColorSpace.sRGB || profile.colorSpace === ColorSpace.RGB};
}

export async function readColorProfile(bytes, format) {
    await initializePortableCodecs();
    return ImageMagick.read(bytes, magickFormat(format), image => {
        let profile = image.getColorProfile();
        if (profile === null) {
            return null;
        }
        return {data: new Uint8Array(profile.data), description: profile.description || 'ICC profile',
            rgb: profile.colorSpace === ColorSpace.sRGB || profile.colorSpace === ColorSpace.RGB};
    });
}

export async function decode(bytes, format) {
    if (format === 'dds') {
        const decoded = DdsDecoder.decode(bytes);
        if (decoded !== null) {
            return decoded;
        }
    }
    if (format === 'jxr' || format === 'wdp' || format === 'wmp') {
        return decodeJpegXr(bytes);
    }
    await initializePortableCodecs();
    const inputFormat = magickFormat(format);
    if (inputFormat === MagickFormat.Unknown) {
        throw new Error('Unsupported image format: ' + format);
    }
    return ImageMagick.read(bytes, inputFormat, image => {
        image.autoOrient();
        if (image.getColorProfile() !== null && !image.transformColorSpace(srgbProfile)) {
            throw new Error('Could not convert the embedded ICC profile to sRGB');
        }
        image.depth = 8;
        return image.write(MagickFormat.Rgba, rgba => ({
            width: image.width,
            height: image.height,
            rgba: new Uint8ClampedArray(rgba)
        }));
    });
}

export async function encode(pngBytes, format, quality, options = {}) {
    await initializePortableCodecs();
    if (['heic', 'heif', 'jxr', 'wdp', 'wmp'].includes(format)) {
        let decoded = await decode(pngBytes, 'png');
        let encoder = format === 'heic' || format === 'heif' ? heicEncoder : jxrEncoder;
        return encoder.encode(decoded.rgba, decoded.width, decoded.height, quality);
    }
    const outputFormat = magickFormat(format);
    if (outputFormat === MagickFormat.Unknown) {
        throw new Error('Unsupported image format: ' + format);
    }
    return ImageMagick.read(pngBytes, MagickFormat.Png, image => {
        image.quality = quality;
        if (options.colorProfile !== undefined) {
            let target = new ColorProfile(options.colorProfile);
            if (!image.transformColorSpace(srgbProfile, target)) {
                throw new Error('Could not convert sRGB to the export ICC profile');
            }
            // Keep even the working profile embedded instead of replacing it
            // with an implicit PNG sRGB chunk.
            image.settings.setDefine(MagickFormat.Png, 'include-chunk', 'iCCP');
        }
        if (outputFormat === MagickFormat.Tiff) {
            let compression = options.compression ?? 'none';
            let colorMode = options.colorMode ?? 'rgba';
            let methods = {none: CompressionMethod.NoCompression, lzw: CompressionMethod.LZW, zip: CompressionMethod.Zip};
            if (!Object.hasOwn(methods, compression) || !['rgb', 'rgba'].includes(colorMode)) {
                throw new Error('Unsupported TIFF export options');
            }
            image.depth = 8;
            image.settings.compression = methods[compression];
            if (colorMode === 'rgb') {
                image.backgroundColor = MagickColors.White;
                image.alpha(AlphaAction.Remove);
            }
            image.colorType = colorMode === 'rgba' ? ColorType.TrueColorAlpha : ColorType.TrueColor;
        }
        if (outputFormat === MagickFormat.Dds) {
            let compression = options.compression ?? 'none';
            let methods = {none: CompressionMethod.NoCompression, bc1: CompressionMethod.DXT1, bc3: CompressionMethod.DXT5};
            if (!Object.hasOwn(methods, compression)) {
                throw new Error('Unsupported DDS compression');
            }
            image.depth = 8;
            image.settings.compression = methods[compression];
            image.settings.setDefine(MagickFormat.Dds, 'compression', {none: 'none', bc1: 'dxt1', bc3: 'dxt5'}[compression]);
            image.settings.setDefine(MagickFormat.Dds, 'mipmaps', '0');
            if (compression === 'bc1') {
                image.backgroundColor = MagickColors.White;
                image.alpha(AlphaAction.Remove);
            }
            image.colorType = compression === 'bc1' ? ColorType.TrueColor : ColorType.TrueColorAlpha;
        }
        if (outputFormat === MagickFormat.Jpeg && options.subsampling) {
            image.settings.setDefine(MagickFormat.Jpeg, 'sampling-factor', options.subsampling);
            image.setArtifact('jpeg:sampling-factor', options.subsampling);
        }
        return image.write(outputFormat, bytes => new Uint8Array(bytes));
    });
}
