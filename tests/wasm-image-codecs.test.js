const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const encoderClass = import('../src/codec/encoder/WasmImageEncoder.js');
const jpegXrClass = import('../src/codec/JpegXrCodec.js');

test('checked-in codec modules match the pinned sources and build recipe', () => {
    let root = path.resolve(__dirname, '..');
    let checksums = fs.readFileSync(path.join(root, 'lib/codecs/SHA256SUMS'), 'utf8').trim().split('\n');
    for (let line of checksums) {
        let [expected, filename] = line.split(/\s+/);
        let bytes = fs.readFileSync(path.join(root, filename));
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, filename);
    }
    for (let name of ['heic', 'jxr']) {
        let bytes = fs.readFileSync(path.join(root, `lib/codecs/${name}-encoder.wasm`));
        assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
    }
});

function moduleFixture() {
    let freed = [];
    let module = {
        HEAPU8: new Uint8Array(256),
        _malloc: () => 16,
        _free: pointer => freed.push(pointer),
        _release_result: () => freed.push('output'),
        _encode_rgba: () => 0,
        _decode_image: () => 0,
        _encoded_data: () => 64,
        _encoded_size: () => 4,
        _encoder_error: () => 120,
        UTF8ToString: () => 'Native codec failed',
        _image_width: () => 1,
        _image_height: () => 1,
        _image_channels: () => 4,
        _image_color: () => 7,
        _image_depth: () => 1,
        _image_flags: () => 0x70,
        _image_bits: () => 32
    };
    return {module, freed};
}

test('WASM encoder loads once, copies pixels/results across memory growth and releases both allocations', async t => {
    let {default: Encoder} = await encoderClass;
    let {module, freed} = moduleFixture();
    let loads = 0;
    t.mock.method(global, 'fetch', async url => {
        assert.equal(url, 'local-codec.wasm');
        loads++;
        return {ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer};
    });
    let factoryCalls = 0;
    let encoder = new Encoder(async ({wasmBinary}) => {
        factoryCalls++;
        assert.deepEqual(new Uint8Array(wasmBinary), new Uint8Array([1, 2]));
        return module;
    }, 'local-codec.wasm');
    await Promise.all([encoder.initialize(), encoder.initialize()]);
    assert.equal(loads, 1);
    assert.equal(factoryCalls, 1);
    module._encode_rgba = (pointer, width, height, quality) => {
        assert.deepEqual([pointer, width, height, quality], [16, 1, 1, 91]);
        assert.deepEqual([...module.HEAPU8.slice(pointer, pointer + 4)], [1, 2, 3, 4]);
        module.HEAPU8 = new Uint8Array(512);
        module.HEAPU8.set([5, 6, 7, 8], 64);
        return 0;
    };
    let result = await encoder.encode(new Uint8Array([1, 2, 3, 4]), 1, 1, 90.5);
    module.HEAPU8.fill(0);
    assert.deepEqual([...result], [5, 6, 7, 8]);
    assert.deepEqual(freed, ['output', 16]);
});

test('WASM encoders reject invalid inputs before loading and recover from failed downloads/initialization', async t => {
    let {default: Encoder} = await encoderClass;
    let encoder = new Encoder(() => { throw new Error('Factory failed'); }, 'codec.wasm');
    let fetch = t.mock.method(global, 'fetch', async () => ({ok: false}));
    for (let [width, height, size, quality] of [[0, 1, 0, 90], [1, 0, 0, 90], [1.5, 1, 6, 90],
        [1, 1.5, 6, 90], [1, 1, 3, 90], [1, 1, 4, NaN], [1, 1, 4, -1], [1, 1, 4, 101],
        [32768, 32768, 0, 90]]) {
        await assert.rejects(encoder.encode(new Uint8Array(size), width, height, quality), /Invalid image/);
    }
    assert.equal(fetch.mock.callCount(), 0);
    await assert.rejects(encoder.initialize(), /Could not load/);
    assert.equal(encoder.modulePromise, null);
    fetch.mock.mockImplementation(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(0)}));
    await assert.rejects(encoder.initialize(), /Factory failed/);
    assert.equal(encoder.modulePromise, null);
    encoder.factory = async () => moduleFixture().module;
    await encoder.initialize();
    assert.equal(fetch.mock.callCount(), 3);
});

test('WASM encode errors release memory and allocation failures never invoke the native encoder', async () => {
    let {default: Encoder} = await encoderClass;
    let {module, freed} = moduleFixture();
    let encoder = new Encoder(null, null);
    encoder.modulePromise = Promise.resolve(module);
    module._encode_rgba = () => 1;
    await assert.rejects(encoder.encode(new Uint8Array(4), 1, 1, 90), /Native codec failed/);
    assert.deepEqual(freed, ['output', 16]);
    module._malloc = () => 0;
    await assert.rejects(encoder.encode(new Uint8Array(4), 1, 1, 90), /allocate/);
    assert.deepEqual(freed, ['output', 16]);
});

test('JPEG XR bridge preserves metadata, copies results and frees memory after decode failure', async () => {
    let {default: Codec} = await jpegXrClass;
    let {module, freed} = moduleFixture();
    let codec = new Codec(null, null);
    codec.modulePromise = Promise.resolve(module);
    module.HEAPU8.set([20, 30, 40, 50], 64);
    let decoded = await codec.decode(new Uint8Array([9, 10]));
    assert.deepEqual([...module.HEAPU8.slice(16, 18)], [9, 10]);
    assert.deepEqual(decoded.pixelInfo, {channels: 4, colorFormat: 'RGB', bitsPerPixel: 32, bitDepth: '8',
        hasAlpha: true, premultipledAlpha: true, bgr: true});
    assert.deepEqual([decoded.width, decoded.height], [1, 1]);
    module.HEAPU8.fill(0);
    assert.deepEqual([...decoded.bytes], [20, 30, 40, 50]);
    module._image_flags = () => 0;
    module._image_color = () => 4;
    decoded = await codec.decode(new Uint8Array([1]));
    assert.equal(decoded.pixelInfo.colorFormat, 'CMYK');
    module._image_color = () => 6;
    decoded = await codec.decode(new Uint8Array([1]));
    assert.equal(decoded.pixelInfo.colorFormat, 'Unsupported');
    assert.equal(decoded.pixelInfo.hasAlpha, false);
    assert.equal(decoded.pixelInfo.premultipledAlpha, false);
    assert.equal(decoded.pixelInfo.bgr, false);
    module._decode_image = () => 1;
    await assert.rejects(codec.decode(new Uint8Array([1])), /Native codec failed/);
    assert.deepEqual(freed, ['output', 16, 'output', 16, 'output', 16, 'output', 16]);
    module._malloc = () => 0;
    await assert.rejects(codec.decode(new Uint8Array([1])), /allocate/);
});
