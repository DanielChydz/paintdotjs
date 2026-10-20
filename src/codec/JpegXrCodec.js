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

import WasmImageEncoder from './encoder/WasmImageEncoder.js';
import JpegXrPixels from './JpegXrPixels.js';

class JpegXrCodec extends WasmImageEncoder {

    async decodeRgba(bytes) {
        return JpegXrPixels.convert(await this.decode(bytes));
    }

    async decode(bytes) {
        let codec = await this.initialize();
        let input = codec._malloc(bytes.length);
        if (input === 0) {
            throw new Error('Could not allocate JPEG XR decoder memory');
        }
        try {
            codec.HEAPU8.set(bytes, input);
            if (codec._decode_image(input, bytes.length) !== 0) {
                throw new Error(codec.UTF8ToString(codec._encoder_error()));
            }
            let flags = codec._image_flags();
            return {
                width: codec._image_width(),
                height: codec._image_height(),
                bytes: codec.HEAPU8.slice(codec._encoded_data(), codec._encoded_data() + codec._encoded_size()),
                pixelInfo: {
                    channels: codec._image_channels(),
                    colorFormat: ({0: 'Gray', 4: 'CMYK', 7: 'RGB', 8: 'RGBE'})[codec._image_color()] || 'Unsupported',
                    bitsPerPixel: codec._image_bits(),
                    bitDepth: ['1', '8', '16', '16Fixed', '16Float', '32', '32Fixed', '32Float', '5', '10', '565'][codec._image_depth()],
                    hasAlpha: (flags & 0x10) !== 0,
                    premultipledAlpha: (flags & 0x20) !== 0,
                    bgr: (flags & 0x40) !== 0
                }
            };
        } finally {
            codec._release_result();
            codec._free(input);
        }
    }
}

export default JpegXrCodec;
