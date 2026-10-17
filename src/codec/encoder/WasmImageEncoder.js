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

class WasmImageEncoder {

    constructor(factory, wasmUrl) {
        this.factory = factory;
        this.wasmUrl = wasmUrl;
        this.modulePromise = null;
    }

    async initialize() {
        if (this.modulePromise === null) {
            this.modulePromise = fetch(this.wasmUrl).then(response => {
                if (!response.ok) {
                    throw new Error('Could not load the bundled image encoder');
                }
                return response.arrayBuffer();
            }).then(wasmBinary => this.factory({wasmBinary})).catch(error => {
                this.modulePromise = null;
                throw error;
            });
        }
        return this.modulePromise;
    }

    async encode(rgba, width, height, quality) {
        let size = width * height * 4;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
            || size > 0x1fffffff || rgba.length !== size || !Number.isFinite(quality) || quality < 0 || quality > 100) {
            throw new Error('Invalid image encoder dimensions, pixels or quality');
        }
        let codec = await this.initialize();
        let pixels = codec._malloc(size);
        if (pixels === 0) {
            throw new Error('Could not allocate image encoder memory');
        }
        try {
            codec.HEAPU8.set(rgba, pixels);
            if (codec._encode_rgba(pixels, width, height, Math.round(quality)) !== 0) {
                throw new Error(codec.UTF8ToString(codec._encoder_error()));
            }
            return codec.HEAPU8.slice(codec._encoded_data(), codec._encoded_data() + codec._encoded_size());
        } finally {
            codec._release_result();
            codec._free(pixels);
        }
    }
}

export default WasmImageEncoder;
