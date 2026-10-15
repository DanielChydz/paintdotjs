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
const {pathToFileURL} = require("node:url");
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
        let absolute = path.join(root, filename);
        vm.runInContext(fs.readFileSync(absolute, "utf8"), context, {filename: pathToFileURL(absolute).href});
    }
    let api = vm.runInContext("({BitmapEffectEngine, BitmapHistoryMemento, Rectangle})", context);
    api.context = context;
    return api;
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

test("all registered effects are deterministic, dimension-preserving and leave their source intact", () => {
    let {BitmapEffectEngine} = loadContext();
    let definitions = [
        ...Object.values(BitmapEffectEngine.DEFINITIONS),
        ...Object.values(BitmapEffectEngine.EFFECTS)
    ];
    for (let definition of definitions) {
        let source = pixels(7, 5);
        let original = new Uint8ClampedArray(source.data);
        let values = BitmapEffectEngine.defaults(definition);
        let result = BitmapEffectEngine.apply(source, 7, 5, definition, values);
        let repeat = BitmapEffectEngine.apply(source, 7, 5, definition, values);
        assert.equal(result.width, 7, definition.id);
        assert.equal(result.height, 5, definition.id);
        assert.equal(result.data.length, 140, definition.id);
        assert.notEqual(result.data, source.data, definition.id);
        assert.deepEqual(result.data, repeat.data, definition.id);
        assert.deepEqual(source.data, original, definition.id);
        let emptyMask = new Uint8Array(35);
        let masked = BitmapEffectEngine.apply(source, 7, 5, definition, values, emptyMask);
        assert.deepEqual(masked.data, original, `${definition.id}: empty selection`);
    }
});

test("color inversion and alpha inversion match independent pixel formulas and are reversible", () => {
    let {BitmapEffectEngine} = loadContext();
    for (let id of ["invertColorsEffect", "invertAlphaEffect"]) {
        let definition = BitmapEffectEngine.DEFINITIONS[id];
        let source = pixels(4, 3);
        let result = BitmapEffectEngine.apply(source, 4, 3, definition, {});
        let expected = new Uint8ClampedArray(source.data);
        for (let offset = 0; offset < expected.length; ++offset) {
            if ((offset % 4 === 3) === (id === "invertAlphaEffect")) {
                expected[offset] = 255 - expected[offset];
            }
        }
        assert.deepEqual(result.data, expected);
        assert.deepEqual(BitmapEffectEngine.apply(result, 4, 3, definition, {}).data, source.data);
    }
});

test("neutral color adjustments preserve pixels exactly", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(4, 3);
    for (let [id, overrides] of [
        ["brightnessAndContrastAdjustment", {}], ["exposureEffect", {}],
        ["highlightsAndShadowsEffect", {}], ["hueAndSaturationAdjustment", {}],
        ["levelsEffect", {}], ["sepiaEffect", {intensity: 0}], ["temperatureAndTintEffect", {}],
        ["curvesEffect", {channel: "rgb"}]
    ]) {
        let definition = BitmapEffectEngine.DEFINITIONS[id];
        let values = {...BitmapEffectEngine.defaults(definition), ...overrides};
        assert.deepEqual(BitmapEffectEngine.apply(source, 4, 3, definition, values).data, source.data, id);
    }
});

test("partial selections blend transformed pixels and empty selections mean the entire image", () => {
    let {BitmapEffectEngine} = loadContext();
    let definition = BitmapEffectEngine.DEFINITIONS.invertColorsEffect;
    let source = pixels(3, 1);
    let mask = new Uint8Array([0, 128, 255]);
    let expected = new Uint8ClampedArray(source.data);
    for (let pixel = 0; pixel < 3; ++pixel) {
        for (let channel = 0; channel < 3; ++channel) {
            let offset = pixel * 4 + channel;
            expected[offset] += (255 - 2 * expected[offset]) * mask[pixel] / 255;
        }
    }
    assert.deepEqual(BitmapEffectEngine.apply(source, 3, 1, definition, {}, mask).data, expected);
    assert.equal(BitmapEffectEngine.createSelectionMask(3, 1, null), null);
    assert.equal(BitmapEffectEngine.createSelectionMask(3, 1, {isEmpty: () => true}), null);
    assert.equal(BitmapEffectEngine.createSelectionMask(3, 1, mask), mask);
});

test("levels apply the reference transfer function only to enabled color channels", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(9, 3);
    for (let enabled of [[true, false, true], [false, true, false], [false, false, false]]) {
        let values = {
            inputLow: 30, inputHigh: 200, gamma: 2, outputLow: 15, outputHigh: 220,
            red: enabled[0], green: enabled[1], blue: enabled[2]
        };
        let expected = new Uint8ClampedArray(source.data);
        for (let offset = 0; offset < expected.length; ++offset) {
            if (enabled[offset % 4]) {
                let normalized = Math.max(0, Math.min(1, (expected[offset] - 30) / 170));
                expected[offset] = 15 + Math.sqrt(normalized) * 205;
            }
        }
        assert.deepEqual(BitmapEffectEngine.applyLevels(source, 9, 3, values).data, expected);
    }
});

test("curve defaults are independent and linear curves have exact lookup values", () => {
    let {BitmapEffectEngine} = loadContext();
    let definition = BitmapEffectEngine.DEFINITIONS.curvesEffect;
    let first = BitmapEffectEngine.defaults(definition);
    first.points[0][1] = 99;
    assert.equal(BitmapEffectEngine.defaults(definition).points[0][1], 0);
    assert.equal(definition.controls.find(control => control.key === "points").defaultValue[0][1], 0);
    let identity = BitmapEffectEngine.createCurveLookup([[255, 255], [0, 0]]);
    let inverse = BitmapEffectEngine.createCurveLookup([[255, 0], [128, 127], [0, 255]]);
    for (let value = 0; value < 256; ++value) {
        assert.equal(identity[value], value);
        assert.equal(inverse[value], 255 - value);
    }
});

test("HSL conversion round-trips grayscale, primary colors and representative RGB values", () => {
    let {BitmapEffectEngine} = loadContext();
    for (let rgb of [
        [0, 0, 0], [255, 255, 255], [128, 128, 128],
        [255, 0, 0], [0, 255, 0], [0, 0, 255],
        [234, 51, 87], [26, 181, 76], [137, 62, 204]
    ]) {
        let hsl = BitmapEffectEngine.rgbToHsl(...rgb);
        assert(hsl.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
        let result = BitmapEffectEngine.hslToRgb(...hsl);
        for (let channel = 0; channel < 3; ++channel) {
            assert(Math.abs(result[channel] - rgb[channel]) < 1e-10);
        }
    }
});

test("noise respects disabled intensity/coverage, preserves alpha and responds to its seed", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(32, 16);
    let values = {intensity: 70, saturation: 100, coverage: 50, seed: 2};
    let first = BitmapEffectEngine.addNoise(source, 32, 16, values);
    let second = BitmapEffectEngine.addNoise(source, 32, 16, {...values, seed: 3});
    assert.notDeepEqual(first.data, source.data);
    assert.notDeepEqual(first.data, second.data);
    for (let offset = 3; offset < source.data.length; offset += 4) {
        assert.equal(first.data[offset], source.data[offset]);
    }
    for (let override of [{intensity: 0}, {coverage: 0}]) {
        assert.deepEqual(BitmapEffectEngine.addNoise(source, 32, 16, {...values, ...override}).data, source.data);
    }
    assert.equal(BitmapEffectEngine.getGaussianNoiseTable(), BitmapEffectEngine.getGaussianNoiseTable());
});

test("zero-radius CPU blurs preserve pixels without sharing the source buffer", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(3, 2);
    for (let result of [
        BitmapEffectEngine.gaussianBlur(source, 3, 2, 0),
        BitmapEffectEngine.discBlur(source, 3, 2, 0),
        BitmapEffectEngine.percentileBlur(source, 3, 2, 0, 50),
        BitmapEffectEngine.surfaceBlur(source, 3, 2, 0, 15)
    ]) {
        assert.deepEqual(result.data, source.data);
        assert.notEqual(result.data, source.data);
    }
    assert.equal(BitmapEffectEngine.nativeGaussianBlur(source, 3, 2, 1), null);
});

test("brightness/contrast follows its transfer formula including threshold contrast", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(7, 3);
    let definition = BitmapEffectEngine.DEFINITIONS.brightnessAndContrastAdjustment;
    for (let contrast of [-100, -50, 50, 100]) {
        let brightness = 10;
        let expected = new Uint8ClampedArray(source.data);
        for (let offset = 0; offset < source.data.length; offset += 4) {
            let intensity = Math.round(source.data[offset] * .299
                + source.data[offset + 1] * .587 + source.data[offset + 2] * .114);
            for (let channel = 0; channel < 3; ++channel) {
                if (contrast === 100) {
                    expected[offset + channel] = intensity + brightness < 128 ? 0 : 255;
                } else {
                    let adjustment = contrast < 0
                        ? (intensity - 127) * (contrast + 100) / 100 + 127 - intensity + brightness
                        : (intensity - 127 + brightness) * 100 / (100 - contrast) + 127 - intensity;
                    expected[offset + channel] += adjustment;
                }
            }
        }
        assert.deepEqual(BitmapEffectEngine.apply(source, 7, 3, definition, {brightness, contrast}).data, expected);
    }
});

test("auto-level ignores transparent pixels and preserves uniform channels", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = new ImageData(new Uint8ClampedArray([
        0, 0, 0, 0, 20, 80, 120, 255, 120, 80, 220, 128
    ]), 3, 1);
    let definition = BitmapEffectEngine.DEFINITIONS.autoLevel;
    let result = BitmapEffectEngine.apply(source, 3, 1, definition, {});
    assert.deepEqual(result.data.slice(4), new Uint8ClampedArray([0, 80, 0, 255, 255, 80, 255, 128]));
    assert.equal(result.data[3], 0);
});

test("unlinked posterization uses each channel's own palette size", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(9, 3);
    let definition = BitmapEffectEngine.DEFINITIONS.posterizeAdjustment;
    let values = {red: 2, green: 3, blue: 4, alpha: 5, linked: false};
    let expected = new Uint8ClampedArray(source.data);
    let levels = [2, 3, 4, 5];
    for (let offset = 0; offset < expected.length; ++offset) {
        let intervals = levels[offset % 4] - 1;
        expected[offset] = Math.round(Math.round(expected[offset] / 255 * intervals) * 255 / intervals);
    }
    assert.deepEqual(BitmapEffectEngine.apply(source, 9, 3, definition, values).data, expected);
});

test("transparent quantization is a no-op and zero-blur shadow-only output has expected alpha", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = pixels(5, 3);
    let shadow = BitmapEffectEngine.dropShadow(source, 5, 3, {
        blur: 0, distance: 0, angle: 0, opacity: .5, shadowOnly: true
    });
    let expected = new Uint8ClampedArray(source.data.length);
    for (let offset = 3; offset < expected.length; offset += 4) {
        expected[offset] = source.data[offset] / 2;
        source.data[offset] = 0;
    }
    assert.deepEqual(shadow.data, expected);
    let definition = BitmapEffectEngine.EFFECTS.quantizeEffect;
    assert.deepEqual(BitmapEffectEngine.apply(source, 5, 3, definition,
        BitmapEffectEngine.defaults(definition)).data, source.data);
});

function effectActionFixture(mode = "success", mask = null) {
    let {context, BitmapEffectEngine, BitmapHistoryMemento, Rectangle} = loadContext();
    let source = pixels(8, 6);
    let displayed = new Uint8ClampedArray(source.data);
    let state = {mode, workers: [], urls: [], revoked: [], errors: [], busy: false, applied: []};
    let surface = {
        getWidth: () => 8, getHeight: () => 6, getBounds: () => new Rectangle(0, 0, 8, 6),
        context: {
            getImageData: () => new ImageData(new Uint8ClampedArray(displayed), 8, 6),
            putImageData: image => displayed = new Uint8ClampedArray(image.data)
        }
    };
    function BitmapLayer() {
        this.getSurface = () => surface;
        this.invalidate = () => state.invalidations = (state.invalidations || 0) + 1;
    }
    let layer = new BitmapLayer();
    let workspace = {
        getActiveLayer: () => layer, getActiveLayerIndex: () => 0,
        getSelection: () => mask,
        getApp: () => ({fire: (...args) => state.applied.push(args)})
    };
    function Worker(url) {
        if (state.mode === "create") {
            throw new Error("worker creation denied");
        }
        assert.ok(state.urls.includes(url));
        state.workers.push(this);
        this.terminate = () => this.terminated = true;
        this.postMessage = (message, transfers) => {
            assert.notEqual(message.sourceBuffer, source.data.buffer);
            assert.equal(transfers.length, mask === null ? 1 : 2);
            assert.equal(transfers[0], message.sourceBuffer);
            if (mask !== null) {
                assert.notEqual(message.selectionBuffer, mask.buffer);
                assert.equal(transfers[1], message.selectionBuffer);
            }
            if (state.mode === "throw") {
                throw new Error("postMessage denied");
            }
            let delivered = structuredClone(message, {transfer: transfers});
            this.message = delivered;
            this.reply = () => {
                let definition = BitmapEffectEngine.EFFECTS[delivered.effectId];
                let result = BitmapEffectEngine.apply(
                    new ImageData(new Uint8ClampedArray(delivered.sourceBuffer), 8, 6),
                    8, 6, definition, delivered.values,
                    delivered.selectionBuffer === null ? null : new Uint8Array(delivered.selectionBuffer)
                );
                this.onmessage({data: result.data.buffer});
            };
            if (state.mode !== "manual") {
                queueMicrotask(() => {
                    if (state.mode === "error") {
                        this.onerror({error: new Error("worker rendering failed")});
                    } else if (state.mode === "message") {
                        this.onerror({message: "worker message failure"});
                    } else if (state.mode === "emptyError") {
                        this.onerror({});
                    } else {
                        this.reply();
                    }
                });
            }
        };
    }
    Object.assign(context, {
        Worker, BitmapLayer, structuredClone, Blob,
        i18n: key => key,
        URL: {
            createObjectURL: blob => {
                assert.equal(blob.type, "text/javascript");
                let url = "blob:effect-" + state.urls.length;
                state.urls.push(url);
                return url;
            },
            revokeObjectURL: url => state.revoked.push(url)
        },
        console: {error: (...args) => state.errors.push(args)},
        document: {documentElement: {classList: {toggle: (name, busy) => {
            assert.equal(name, "effect-rendering");
            state.busy = busy;
        }}}},
        EffectConfigDialog: {open: settings => state.open(settings)}
    });
    for (let relative of [
        "engine/util/ShortcutKey.js", "engine/document/history/action/Action.js",
        "engine/document/history/action/actions/DocumentWorkspaceAction.js",
        "engine/document/history/action/actions/document/effect/BitmapEffectAction.js"
    ]) {
        let filename = path.resolve(root, "js/src", relative);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    let BitmapEffectAction = vm.runInContext("BitmapEffectAction", context);
    let definition = BitmapEffectEngine.EFFECTS.oilPaintingEffect;
    let values = BitmapEffectEngine.defaults(definition);
    let flush = () => new Promise(resolve => setImmediate(resolve));
    return {context, state, source, surface, layer, workspace, BitmapEffectEngine,
        BitmapHistoryMemento, BitmapEffectAction, definition, values, flush, pixels: () => displayed};
}

test("effect action workers transfer independent snapshots and report/fallback on each worker failure", async () => {
    for (let mode of ["success", "error", "message", "emptyError", "throw", "create"]) {
        for (let selected of [false, true]) {
            let mask = selected ? Uint8Array.from({length: 48}, (_, index) => index % 2 ? 255 : 0) : null;
            let fixture = effectActionFixture(mode, mask);
            let {BitmapEffectAction, BitmapEffectEngine, BitmapHistoryMemento, definition, values, state, workspace, source} = fixture;
            let before = new Uint8ClampedArray(source.data);
            let expected = BitmapEffectEngine.apply(source, 8, 6, definition, values, mask).data;
            let memento = await new BitmapEffectAction(definition).performAction(workspace, values);
            assert.ok(memento instanceof BitmapHistoryMemento);
            assert.deepEqual(fixture.pixels(), expected);
            assert.deepEqual(source.data, before);
            assert.equal(state.busy, false);
            assert.deepEqual(state.revoked, state.urls);
            assert.ok(state.workers.every(worker => worker.terminated));
            assert.equal(state.errors.length, mode === "success" ? 0 : 1);
            assert.equal(state.applied.length, 1);
            let remembered = BitmapEffectAction.getLastEffect();
            assert.equal(remembered.definition, definition);
            assert.notEqual(remembered.values, values);
        }
    }
});

test("effect previews cancel stale workers, reject current errors and restore original pixels on dialog cancellation", async () => {
    let fixture = effectActionFixture("manual");
    let {state, workspace, definition, values, BitmapEffectAction, source} = fixture;
    state.open = async settings => {
        let first = settings.onPreview(values);
        assert.equal(state.busy, true);
        let oldWorker = state.workers[0];
        let second = settings.onPreview({...values, brushSize: 3});
        assert.equal(oldWorker.terminated, true);
        await first;
        oldWorker.reply();
        oldWorker.onerror({error: new Error("stale failure")});
        assert.equal(state.busy, true);
        let current = state.workers[1];
        current.onerror({message: "current failure"});
        await assert.rejects(second, /current failure/);
        let third = settings.onPreview(values);
        state.workers[2].reply();
        await third;
        assert.notDeepEqual(fixture.pixels(), source.data);
        let fourth = settings.onPreview(values);
        assert.equal(settings.onPreview(null), null);
        await fourth;
        assert.deepEqual(fixture.pixels(), source.data);
        assert.equal(state.busy, false);
        return null;
    };
    assert.equal(await new BitmapEffectAction(definition).performAction(workspace), null);
    assert.deepEqual(fixture.pixels(), source.data);
    assert.deepEqual(state.revoked, state.urls);
    assert.ok(state.workers.every(worker => worker.terminated));
    assert.equal(state.applied.length, 0);
    assert.equal(BitmapEffectAction.getLastEffect(), null);
});

test("effect actions clone remembered values, skip nonbitmap layers and repeat successfully without a dialog", async () => {
    let fixture = effectActionFixture();
    let {context, state, workspace, definition, values, BitmapEffectAction} = fixture;
    assert.equal(await new BitmapEffectAction(definition).performAction({getActiveLayer: () => ({})}), null);
    assert.equal(BitmapEffectAction.repeatLast(workspace), null);
    assert.equal(BitmapEffectAction.getRememberedValues(definition), null);
    for (let unavailable of [false, true]) {
        context.structuredClone = unavailable ? undefined : structuredClone;
        let original = {points: [[1, 2]], flag: true};
        let copy = BitmapEffectAction.cloneValues(original);
        assert.notEqual(copy, original);
        copy.points[0][0] = 9;
        assert.equal(original.points[0][0], 1);
        assert.equal(BitmapEffectAction.cloneValues(null), null);
        assert.equal(BitmapEffectAction.cloneValues(undefined), undefined);
    }
    state.open = async settings => {
        await settings.onPreview(values);
        return values;
    };
    await new BitmapEffectAction(definition).performAction(workspace);
    let remembered = BitmapEffectAction.getRememberedValues(definition);
    remembered.brushSize = 999;
    assert.notEqual(BitmapEffectAction.getRememberedValues(definition).brushSize, 999);
    state.open = () => {
        throw new Error("Repeating an effect must not open a dialog");
    };
    assert.ok(await BitmapEffectAction.repeatLast(workspace));
    assert.deepEqual(state.revoked, state.urls);
});

test("immediate adjustments and worker-free effect previews use the same pixels and history contract", async () => {
    for (let repeated of [undefined, {}]) {
        let fixture = effectActionFixture();
        let {BitmapEffectAction, BitmapEffectEngine, workspace, source, state} = fixture;
        let definition = BitmapEffectEngine.DEFINITIONS.invertColorsEffect;
        assert.equal(definition.controls.length, 0);
        let expected = BitmapEffectEngine.apply(source, 8, 6, definition, {}).data;
        let memento = await new BitmapEffectAction(definition).performAction(workspace, repeated);
        assert.ok(memento instanceof fixture.BitmapHistoryMemento);
        assert.deepEqual(fixture.pixels(), expected);
        assert.equal(state.workers.length, 0);
        assert.equal(state.applied.length, 1);
        assert.equal(BitmapEffectAction.getLastEffect(), null);
    }
    let fixture = effectActionFixture();
    let {context, state, BitmapEffectAction, BitmapEffectEngine, definition, values, source, workspace} = fixture;
    context.Worker = undefined;
    state.open = async settings => {
        assert.equal(settings.onPreview(values), null);
        assert.deepEqual(fixture.pixels(), BitmapEffectEngine.apply(source, 8, 6, definition, values).data);
        settings.onPreview(null);
        assert.deepEqual(fixture.pixels(), source.data);
        return values;
    };
    await new BitmapEffectAction(definition).performAction(workspace);
    assert.deepEqual(fixture.pixels(), BitmapEffectEngine.apply(source, 8, 6, definition, values).data);
    assert.equal(state.workers.length, 0);
    assert.equal(BitmapEffectAction.getRememberedValues(BitmapEffectEngine.EFFECTS.bokehEffect), null);
});

test("gamma-aware filtering preserves alpha and transforms color in and out of working space", () => {
    let {BitmapEffectEngine} = loadContext();
    let source = new ImageData(new Uint8ClampedArray([0, 64, 255, 128, 255, 0, 64, 0]), 2, 1);
    let before = new Uint8ClampedArray(source.data);
    let calls = 0;
    let result = BitmapEffectEngine.withGamma(source, 2, 1, 1, linear => {
        ++calls;
        assert.notEqual(linear, source);
        assert.deepEqual(Array.from(linear.data), [0, 128, 255, 128, 255, 0, 128, 0]);
        linear.data[0] = 128;
        linear.data[1] = 255;
        return linear;
    });
    assert.equal(calls, 1);
    assert.deepEqual(Array.from(result.data), [64, 255, 255, 128, 255, 0, 64, 0]);
    assert.deepEqual(source.data, before);
    assert.equal(BitmapEffectEngine.withGamma(source, 2, 1, 0, input => input), source);
});

test("Gaussian filtering falls back to bounded CPU output when native canvas capabilities fail", () => {
    let {BitmapEffectEngine, context} = loadContext();
    let source = pixels(5, 3);
    let expected = BitmapEffectEngine.gaussianBlur(source, 5, 3, 4);
    for (let contexts of [
        [null, {filter: "none"}], [{}, null], [{}, {}],
        [{}, {filter: "none"}, null]
    ]) {
        let index = 0;
        context.document = {createElement: () => ({getContext: () => contexts[index++]})};
        assert.deepEqual(BitmapEffectEngine.gaussianBlur(source, 5, 3, 4).data, expected.data);
    }
    context.document = {createElement: () => {
        throw new Error("Canvas allocation rejected");
    }};
    assert.deepEqual(BitmapEffectEngine.gaussianBlur(source, 5, 3, 4).data, expected.data);
    assert.deepEqual(source.data, pixels(5, 3).data);
});

test("box-blur definitions expose their parameter bounds and execute the configured radius", () => {
    let {BitmapEffectEngine} = loadContext();
    let definition = BitmapEffectEngine.blurDefinition("customBlur", "blur.png", "Radius", 0, 10, 2);
    assert.equal(definition.id, "customBlur");
    assert.equal(definition.icon, "blur.png");
    assert.equal(definition.controls.length, 1);
    assert.equal(definition.controls[0].key, "radius");
    assert.equal(definition.controls[0].min, 0);
    assert.equal(definition.controls[0].max, 10);
    assert.equal(BitmapEffectEngine.defaults(definition).radius, 2);
    let source = pixels(4, 3);
    let result = BitmapEffectEngine.apply(source, 4, 3, definition, {radius: 2});
    assert.deepEqual(result.data, referenceBoxBlur(source, 2));
});

test("Gaussian rendering falls back when an existing filter property rejects blur", () => {
    let {BitmapEffectEngine, context} = loadContext();
    let source = pixels(5, 3);
    let expected = BitmapEffectEngine.gaussianBlur(source, 5, 3, 4);
    let requestedFilters = [];
    let snapshots = 0;
    let output = {
        get filter() { return "none"; },
        set filter(value) { requestedFilters.push(value); },
        drawImage() { assert.fail("An unsupported filter must not produce a filtered image"); }
    };
    let contexts = [{drawImage() {}}, output, {putImageData: input => {
        assert.equal(input, source);
        ++snapshots;
    }}];
    let index = 0;
    context.document = {createElement: () => ({getContext: () => contexts[index++ % contexts.length]})};
    assert.deepEqual(BitmapEffectEngine.gaussianBlur(source, 5, 3, 4).data, expected.data);
    assert.equal(snapshots, 1);
    assert.equal(requestedFilters.length, 1);
    assert.match(requestedFilters[0], /^blur\([\d.]+px\)$/);
    assert.deepEqual(source.data, pixels(5, 3).data);
});

test("legacy shared RGB curves and boosted saturation preserve exact channel and alpha contracts", () => {
    let {BitmapEffectEngine: effects} = loadContext();
    let source = new ImageData(new Uint8ClampedArray([192, 64, 64, 73]), 1, 1);
    let curves = effects.apply(source, 1, 1, effects.DEFINITIONS.curvesEffect,
        {channel: "rgb", points: [[0, 255], [255, 0]]});
    assert.deepEqual([...curves.data], [63, 191, 191, 73]);
    let saturated = effects.apply(source, 1, 1, effects.DEFINITIONS.hueAndSaturationAdjustment,
        {hue: 0, saturation: 150, lightness: 0});
    assert.deepEqual([...saturated.data], [255, 1, 1, 73]);
    assert.deepEqual([...source.data], [192, 64, 64, 73]);
});

test("effect defaults copy mixed array controls and isolate nested point arrays", () => {
    let {BitmapEffectEngine: effects} = loadContext();
    let definition = {controls: [{key: "mixed", defaultValue: [7, [8, 9]]}]};
    let defaults = effects.defaults(definition);
    assert.equal(JSON.stringify(defaults.mixed), "[7,[8,9]]");
    defaults.mixed[0] = 10;
    defaults.mixed[1][0] = 11;
    assert.deepEqual(definition.controls[0].defaultValue, [7, [8, 9]]);
});

test("rectangular erosion and linked dilation use independent neighborhood extrema on every channel", () => {
    let {BitmapEffectEngine: effects} = loadContext();
    let source = pixels(5, 4);
    for (let [mode, linked] of [["erode", false], ["dilate", true]]) {
        let result = effects.morphology(source, 5, 4, {mode, width: 3, height: 5, linked});
        for (let y = 0; y < 4; ++y) {
            for (let x = 0; x < 5; ++x) {
                for (let channel = 0; channel < 4; ++channel) {
                    let samples = [];
                    for (let sy = Math.max(0, y - (linked ? 1 : 2)); sy <= Math.min(3, y + (linked ? 1 : 2)); ++sy) {
                        for (let sx = Math.max(0, x - 1); sx <= Math.min(4, x + 1); ++sx) {
                            samples.push(source.data[(sy * 5 + sx) * 4 + channel]);
                        }
                    }
                    assert.equal(result.data[(y * 5 + x) * 4 + channel],
                        mode === "erode" ? Math.min(...samples) : Math.max(...samples));
                }
            }
        }
    }
    assert.deepEqual(source.data, pixels(5, 4).data);
});

test("sketch extremes, square oil kernels and thin outlines retain constant-image contracts", () => {
    let {BitmapEffectEngine: effects} = loadContext();
    let source = new ImageData(new Uint8ClampedArray(Array(12).fill([32, 64, 96, 77]).flat()), 4, 3);
    assert.deepEqual(effects.oilPaint(source, 4, 3, {brush: 2, granularity: .5, kernel: "square"}).data, source.data);
    assert.deepEqual(effects.sharpen(source, 4, 3, 2, 1).data, source.data);
    for (let thickness of [1, 3]) {
        let outlined = effects.outline(source, 4, 3, {thickness, intensity: 100});
        assert.deepEqual([...outlined.data], Array(12).fill([0, 0, 0, 77]).flat());
    }
    let black = new ImageData(new Uint8ClampedArray([0, 0, 0, 51]), 1, 1);
    assert.deepEqual([...effects.pencilSketch(black, 1, 1, {tip: 1, range: -1}).data], [255, 255, 255, 51]);
});

test("invalid Gaussian quality falls back to the documented middle-quality output", () => {
    let {BitmapEffectEngine: effects} = loadContext();
    let source = pixels(7, 5);
    let expected = effects.gaussianBlur(source, 7, 5, 3, 0, 2);
    for (let quality of [0, "invalid"]) {
        assert.deepEqual(effects.gaussianBlur(source, 7, 5, 3, 0, quality).data, expected.data);
    }
    assert.deepEqual(source.data, pixels(7, 5).data);
});
