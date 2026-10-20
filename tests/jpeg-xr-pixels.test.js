const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const pixelClass = import('../src/codec/JpegXrPixels.js');

test('real JPEG XR fixtures decode all supported layouts and reject ambiguous N-channel data', async t => {
    let {default: Codec} = await import('../src/codec/JpegXrCodec.js');
    let directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paintjs-jxr-test-'));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    let modulePath = path.join(directory, 'jxr.mjs');
    await fs.copyFile(path.resolve(__dirname, '../lib/codecs/jxr-encoder.js'), modulePath);
    let {default: factory} = await import(pathToFileURL(modulePath));
    let module = await factory({wasmBinary: await fs.readFile(path.resolve(__dirname, '../lib/codecs/jxr-encoder.wasm'))});
    let codec = new Codec(null, null);
    codec.modulePromise = Promise.resolve(module);
    let fixtureRoot = path.join(__dirname, 'fixtures/jxr');
    let expected = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'expected.json'), 'utf8'));
    for (let [name, pixels] of Object.entries(expected)) {
        let bytes = await fs.readFile(path.join(fixtureRoot, name));
        if (name === 'nchannel.jxr') {
            await assert.rejects(codec.decodeRgba(bytes), /pixel format is not supported/);
            continue;
        }
        let decoded = await codec.decodeRgba(bytes);
        assert.deepEqual([decoded.width, decoded.height], [3, 2], name);
        for (let i = 0; i < pixels.length; ++i) {
            assert.ok(Math.abs(decoded.rgba[i] - pixels[i]) <= 1,
                `${name} component ${i}: ${decoded.rgba[i]} != ${pixels[i]}`);
        }
    }
    await assert.rejects(codec.decodeRgba(new Uint8Array(128)), /JPEG XR decoding failed/);
    let recovered = await codec.decodeRgba(await fs.readFile(path.join(fixtureRoot, 'rgba32.jxr')));
    assert.equal(recovered.rgba[3], 255);
});

test('JPEG XR sample conversions cover signed fixed point, IEEE half, HDR and alpha boundaries', async () => {
    let {default: Pixels} = await pixelClass;
    for (let [bits, value] of [[0, 0], [0x8000, -0], [1, 2 ** -24], [0x3c00, 1], [0xbc00, -1],
        [0x7c00, Infinity], [0xfc00, -Infinity]]) {
        assert.equal(Pixels.half(bits), value);
    }
    assert.ok(Number.isNaN(Pixels.half(0x7e00)));
    assert.equal(Pixels.color(NaN, true), 0);
    assert.equal(Pixels.color(-1, false), 0);
    assert.equal(Pixels.color(Infinity, true), 255);
    assert.equal(Pixels.color(2, false), 255);
    let storage = new Uint8Array(16);
    let view = new DataView(storage.buffer);
    view.setUint32(0, 4294967295, true);
    assert.equal(Pixels.sample(view, 0, '32'), 1);
    view.setInt16(0, -8192, true);
    assert.equal(Pixels.sample(view, 0, '16Fixed'), -1);
    view.setInt32(0, -16777216, true);
    assert.equal(Pixels.sample(view, 0, '32Fixed'), -1);
    assert.throws(() => Pixels.sample(view, 0, 'bad'), /Unsupported/);
    let info = {channels: 4, colorFormat: 'RGB', bitDepth: '32Float', bitsPerPixel: 128,
        hasAlpha: true, premultipledAlpha: true, bgr: false};
    new Float32Array(storage.buffer).set([Infinity, NaN, -1, .5]);
    let converted = Pixels.convert({width: 1, height: 1, bytes: storage, pixelInfo: info});
    assert.deepEqual([...converted.rgba], [255, 0, 0, 128]);
    let uint32 = new Uint32Array([0, 4294967295, 2147483648]);
    converted = Pixels.convert({width: 1, height: 1, bytes: new Uint8Array(uint32.buffer),
        pixelInfo: {channels: 3, colorFormat: 'RGB', bitDepth: '32', bitsPerPixel: 96, hasAlpha: false}});
    assert.deepEqual([...converted.rgba], [0, 255, 128, 255]);
});

test('JPEG XR rejects inconsistent channel models, depths, strides and truncated buffers', async () => {
    let {default: Pixels} = await pixelClass;
    let base = {channels: 3, colorFormat: 'RGB', bitDepth: '8', bitsPerPixel: 24, hasAlpha: false};
    let invalid = [
        {colorFormat: 'Unknown'}, {channels: 4},
        {colorFormat: 'RGBE', channels: 5, hasAlpha: true, bitsPerPixel: 32},
        {colorFormat: 'RGBE', channels: 4, bitDepth: '16', bitsPerPixel: 64},
        {colorFormat: 'RGBE', channels: 4, bitsPerPixel: 40},
        {bitDepth: '1'}, {bitDepth: '16', bitsPerPixel: 56}, {bitsPerPixel: 16},
        {bitDepth: '5', bitsPerPixel: 32}, {bitDepth: '10', bitsPerPixel: 16},
        {bitDepth: '565', bitsPerPixel: 16, colorFormat: 'Gray', channels: 1},
        {bitDepth: '5', bitsPerPixel: 16, channels: 4, hasAlpha: true}, {bitsPerPixel: 25}
    ];
    for (let override of invalid) {
        assert.throws(() => Pixels.convert({width: 1, height: 1, bytes: new Uint8Array(3),
            pixelInfo: {...base, ...override}}), /not supported/);
    }
    for (let override of [{width: 0}, {height: 0}, {width: 1.5}, {height: NaN},
        {width: 32769}, {height: 32769}, {bytes: new Uint8Array(2)}]) {
        assert.throws(() => Pixels.convert({width: 1, height: 1, bytes: new Uint8Array(3),
            pixelInfo: base, ...override}), /Invalid JPEG XR/);
    }
});
