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
const {test} = require("node:test");
const decoder = import("../src/dds/DdsDecoder.js");

function dds({bgra = false, alpha = true, pitch = 8, pitchFlag = true} = {}) {
    let bytes = new Uint8Array(128 + pitch * 2);
    let view = new DataView(bytes.buffer);
    bytes.set([0x44, 0x44, 0x53, 0x20]);
    view.setUint32(4, 124, true);
    view.setUint32(8, pitchFlag ? 0x100f : 0x1007, true);
    view.setUint32(12, 2, true);
    view.setUint32(16, 2, true);
    view.setUint32(20, pitch, true);
    view.setUint32(76, 32, true);
    view.setUint32(80, alpha ? 0x41 : 0x40, true);
    view.setUint32(88, 32, true);
    view.setUint32(92, bgra ? 0xff0000 : 0xff, true);
    view.setUint32(96, 0xff00, true);
    view.setUint32(100, bgra ? 0xff : 0xff0000, true);
    view.setUint32(104, alpha ? 0xff000000 : 0, true);
    for (let y = 0; y < 2; ++y) {
        for (let x = 0; x < 2; ++x) {
            let rgba = [x * 100 + 13, y * 100 + 27, 215 - x * 20, y * 100 + x * 10];
            bytes.set(bgra ? [rgba[2], rgba[1], rgba[0], rgba[3]] : rgba, 128 + y * pitch + x * 4);
        }
    }
    return bytes;
}

test("DDS decoder reads RGBA/BGRA, alpha, opaque RGBX and padded rows without changing input", async () => {
    let {default: DdsDecoder} = await decoder;
    for (let bgra of [false, true]) {
        for (let alpha of [false, true]) {
            for (let pitch of [8, 12]) {
                let bytes = dds({bgra, alpha, pitch});
                let before = bytes.slice();
                let result = DdsDecoder.decode(bytes);
                assert.equal(result.width, 2);
                assert.equal(result.height, 2);
                assert.deepEqual(result.rgba, new Uint8ClampedArray([
                    13, 27, 215, alpha ? 0 : 255, 113, 27, 195, alpha ? 10 : 255,
                    13, 127, 215, alpha ? 100 : 255, 113, 127, 195, alpha ? 110 : 255
                ]));
                assert.deepEqual(bytes, before);
            }
        }
    }
    assert.deepEqual(DdsDecoder.decode(dds({pitchFlag: false})).rgba, DdsDecoder.decode(dds()).rgba);
    let bytes = dds();
    let embedded = new Uint8Array(bytes.length + 7);
    embedded.set(bytes, 7);
    assert.deepEqual(DdsDecoder.decode(embedded.subarray(7)).rgba, DdsDecoder.decode(bytes).rgba);
});

test("DDS decoder delegates compressed, DX10, alternate masks and other bit depths", async () => {
    let {default: DdsDecoder} = await decoder;
    assert.equal(DdsDecoder.decode(new Uint8Array(0)), null);
    for (let index = 0; index < 4; ++index) {
        let bytes = dds();
        bytes[index] = 0;
        assert.equal(DdsDecoder.decode(bytes), null);
    }
    for (let [offset, value] of [
        [80, 4], [80, 0x45], [88, 24], [92, 0xffff], [100, 0xffff], [104, 0xff00000]
    ]) {
        let bytes = dds();
        new DataView(bytes.buffer).setUint32(offset, value, true);
        assert.equal(DdsDecoder.decode(bytes), null);
    }
});

test("DDS decoder rejects malformed headers, unsafe dimensions, bad pitch and truncated pixels", async () => {
    let {default: DdsDecoder} = await decoder;
    for (let value of [null, undefined, [], new ArrayBuffer(128)]) {
        assert.throws(() => DdsDecoder.decode(value), /must be a Uint8Array/);
    }
    assert.throws(() => DdsDecoder.decode(dds().subarray(0, 127)), /Truncated DDS header/);
    assert.throws(() => DdsDecoder.decode(dds().subarray(0, -1)), /Truncated DDS pixels/);
    for (let [offset, value, expected] of [
        [4, 123, /header size/], [76, 31, /header size/],
        [12, 0, /dimensions/], [16, 0, /dimensions/], [20, 4, /row pitch/],
        [12, 0xffffffff, /Truncated DDS pixels/]
    ]) {
        let bytes = dds();
        new DataView(bytes.buffer).setUint32(offset, value, true);
        assert.throws(() => DdsDecoder.decode(bytes), expected);
    }
    let bytes = dds();
    let view = new DataView(bytes.buffer);
    view.setUint32(12, 0xffffffff, true);
    view.setUint32(20, 0xffffffff, true);
    assert.throws(() => DdsDecoder.decode(bytes), /dimensions or row pitch/);
});
