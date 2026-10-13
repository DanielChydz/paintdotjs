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

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");
const root = path.resolve(__dirname, "..");

function ImageData(data, width, height) {
    if (typeof data === "number") {
        this.width = data;
        this.height = width;
        this.data = new Uint8ClampedArray(data * width * 4);
    } else {
        this.width = width;
        this.height = height;
        this.data = data;
    }
}

function loadContext(allocations = []) {
    let context = vm.createContext({
        ImageData,
        Uint8Array,
        Uint8ClampedArray,
        Float32Array: new Proxy(Float32Array, {
            construct(target, args) {
                allocations.push(args[0] * Float32Array.BYTES_PER_ELEMENT);
                return Reflect.construct(target, args);
            }
        }),
        Utility: {clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))},
        Region: {
            fromRectangles(rectangles) {
                return {getRectangles: () => rectangles, dispose() {}};
            }
        }
    });
    for (let filename of [
        "js/src/engine/util/Rectangle.js",
        "js/src/engine/document/history/HistoryMemento.js",
        "js/src/engine/document/history/memento/BitmapHistoryMemento.js",
        "js/src/engine/document/effect/BitmapEffectEngine.js"
    ]) {
        vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context, {filename});
    }
    return vm.runInContext("({BitmapEffectEngine, BitmapHistoryMemento, Rectangle})", context);
}

function pixels(width, height) {
    let data = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < data.length; ++offset) {
        data[offset] = (offset * 73 + Math.floor(offset / 7) * 19) % 256;
    }
    return new ImageData(data, width, height);
}

function referenceBoxBlur(source, radius) {
    let {width, height} = source;
    radius = Math.max(0, Math.round(radius));
    if (radius === 0) {
        return new Uint8ClampedArray(source.data);
    }
    let horizontal = new Float32Array(source.data.length);
    let output = new Uint8ClampedArray(source.data.length);
    let diameter = radius * 2 + 1;
    for (let y = 0; y < height; ++y) {
        let sums = [0, 0, 0, 0];
        for (let x = -radius; x <= radius; ++x) {
            let sx = Math.max(0, Math.min(width - 1, x));
            for (let c = 0; c < 4; ++c) {
                sums[c] += source.data[(y * width + sx) * 4 + c];
            }
        }
        for (let x = 0; x < width; ++x) {
            for (let c = 0; c < 4; ++c) {
                horizontal[(y * width + x) * 4 + c] = sums[c] / diameter;
                sums[c] += source.data[(y * width + Math.min(width - 1, x + radius + 1)) * 4 + c]
                    - source.data[(y * width + Math.max(0, x - radius)) * 4 + c];
            }
        }
    }
    for (let x = 0; x < width; ++x) {
        let sums = [0, 0, 0, 0];
        for (let y = -radius; y <= radius; ++y) {
            let sy = Math.max(0, Math.min(height - 1, y));
            for (let c = 0; c < 4; ++c) {
                sums[c] += horizontal[(sy * width + x) * 4 + c];
            }
        }
        for (let y = 0; y < height; ++y) {
            for (let c = 0; c < 4; ++c) {
                output[(y * width + x) * 4 + c] = sums[c] / diameter;
                sums[c] += horizontal[(Math.min(height - 1, y + radius + 1) * width + x) * 4 + c]
                    - horizontal[(Math.max(0, y - radius) * width + x) * 4 + c];
            }
        }
    }
    return output;
}

test("streaming box blur preserves pixels, alpha, edges and the source", () => {
    let {BitmapEffectEngine} = loadContext();
    for (let [width, height] of [[1, 1], [1, 9], [9, 1], [2, 7], [7, 2], [13, 11], [31, 48]]) {
        for (let radius of [0, 1, 2, 6, 14, 300]) {
            let source = pixels(width, height);
            let original = new Uint8ClampedArray(source.data);
            let result = BitmapEffectEngine.boxBlur(source, width, height, radius);
            assert.deepEqual(result.data, referenceBoxBlur(source, radius), `${width}x${height}, radius ${radius}`);
            assert.deepEqual(source.data, original);
            assert.equal(result.width, width);
            assert.equal(result.height, height);
        }
    }
});

test("box blur scratch storage is bounded by the sliding window", () => {
    let allocations = [];
    let {BitmapEffectEngine} = loadContext(allocations);
    let width = 512, height = 1024, radius = 6;
    BitmapEffectEngine.boxBlur(pixels(width, height), width, height, radius);
    assert.deepEqual(allocations, [width * 4 * 4 * (radius * 2 + 2)]);
    assert(allocations[0] < width * height * 16 / 50);
});

test("selection blending reuses the result without modifying the source", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(3, 1);
    let original = new Uint8ClampedArray(source.data);
    let rendered = new ImageData(new Uint8ClampedArray(12).fill(220), 3, 1);
    let expected = new Uint8ClampedArray(source.data);
    let mask = new Uint8Array([0, 128, 255]);
    for (let pixel = 0; pixel < 3; ++pixel) {
        for (let channel = 0; channel < 4; ++channel) {
            let offset = pixel * 4 + channel;
            expected[offset] += (rendered.data[offset] - expected[offset]) * mask[pixel] / 255;
        }
    }
    assert.equal(BitmapEffectEngine.maskResult(source, rendered, 3, 1, mask), rendered);
    assert.deepEqual(rendered.data, expected);
    assert.deepEqual(source.data, original);
});

test("shared effect snapshot avoids a second readback and preserves undo/redo", () => {
    let {BitmapHistoryMemento, Rectangle} = loadContext();
    let source = pixels(3, 2);
    let current = new Uint8ClampedArray(source.data);
    let reads = 0;
    let surface = {
        getWidth: () => source.width,
        getHeight: () => source.height,
        getBounds: () => new Rectangle(0, 0, source.width, source.height),
        context: {
            getImageData() {
                ++reads;
                return new ImageData(new Uint8ClampedArray(current), source.width, source.height);
            },
            putImageData(image) {
                current.set(image.data);
            }
        }
    };
    let layer = {getSurface: () => surface, invalidate() {}};
    let workspace = {getDocument: () => ({getLayers: () => ({getAt: () => layer})})};
    let memento = new BitmapHistoryMemento("Effect", "", workspace, 0, null, surface, source);
    assert.equal(reads, 0);
    assert.equal(memento.chunks[0].imageData, source);
    current.fill(123);
    let redo = memento.performUndo();
    assert.deepEqual(current, source.data);
    redo.performUndo();
    assert.deepEqual(current, new Uint8ClampedArray(current.length).fill(123));
    assert.equal(reads, 2);
    assert.throws(() => new BitmapHistoryMemento(
        "Effect", "", workspace, 0, null, surface, pixels(1, 1)
    ), /entire surface/);
    assert.throws(() => new BitmapHistoryMemento(
        "Effect", "", workspace, 0, null, surface,
        {width: source.width, height: source.height, data: new Uint8ClampedArray(1)}
    ), /entire surface/);
});
