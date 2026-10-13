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
const ResourceReader = require("../scripts/resource/ResourceReader");

test("resource reader consumes bytes and signed/unsigned little-endian integers", () => {
    let buffer = Buffer.alloc(10);
    buffer.writeInt32LE(-2147483648, 2);
    buffer.writeUInt32LE(4294967295, 6);
    let reader = new ResourceReader(buffer, "fixture.resources");
    assert.equal(reader.filename, "fixture.resources");
    assert.equal(reader.offset, 0);
    assert.deepEqual(reader.bytes(2), buffer.subarray(0, 2));
    assert.equal(reader.int32(), -2147483648);
    assert.equal(reader.uint32(), 4294967295);
    assert.equal(reader.offset, buffer.length);
    assert.equal(reader.bytes(0).length, 0);
    assert.throws(() => reader.bytes(1), /Unexpected end.*fixture\.resources/);
    assert.throws(() => reader.int32(), /Unexpected end/);
    assert.throws(() => reader.uint32(), /Unexpected end/);
    assert.equal(reader.offset, buffer.length);
});

test("resource reader rejects invalid lengths without changing position", () => {
    let reader = new ResourceReader(Buffer.from([1, 2, 3]), "length.resources");
    reader.bytes(1);
    for (let length of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
        assert.throws(() => reader.bytes(length), /Invalid read length.*length\.resources/);
        assert.equal(reader.offset, 1);
    }
    assert.deepEqual(reader.bytes(2), Buffer.from([2, 3]));
});

test("resource reader seeks absolutely and relatively without corrupting failed seeks", () => {
    let reader = new ResourceReader(Buffer.from([10, 20, 30]), "seek.resources");
    reader.seek(2);
    reader.seek(-1, true);
    assert.equal(reader.bytes(1)[0], 20);
    reader.seek(0, true);
    assert.equal(reader.offset, 2);
    for (let relative of [false, true]) {
        for (let offset of [-4, 4, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
            assert.throws(() => reader.seek(offset, relative), /Invalid seek.*seek\.resources/);
            assert.equal(reader.offset, 2);
        }
    }
    reader.seek(3);
    reader.seek(-3, true);
    assert.equal(reader.offset, 0);
});

test("resource reader decodes every 7-bit integer width up to UINT32_MAX", () => {
    for (let [bytes, expected] of [
        [[0], 0], [[127], 127], [[128, 1], 128], [[255, 127], 16383],
        [[128, 128, 1], 16384], [[128, 128, 128, 1], 2097152],
        [[128, 128, 128, 128, 1], 268435456], [[255, 255, 255, 255, 15], 4294967295]
    ]) {
        let reader = new ResourceReader(Buffer.from(bytes), "integer.resources");
        assert.equal(reader.sevenBitInt(), expected);
        assert.equal(reader.offset, bytes.length);
    }
});

test("resource reader rejects truncated and overflowing 7-bit integers", () => {
    for (let bytes of [[], [128], [128, 128], [128, 128, 128, 128]]) {
        let reader = new ResourceReader(Buffer.from(bytes), "truncated.resources");
        assert.throws(() => reader.sevenBitInt(), /Unexpected end.*truncated\.resources/);
    }
    for (let last of [16, 31, 127, 128, 255]) {
        let reader = new ResourceReader(Buffer.from([128, 128, 128, 128, last]), "overflow.resources");
        assert.throws(() => reader.sevenBitInt(), /Invalid 7-bit integer.*overflow\.resources/);
    }
});

test("resource reader decodes empty, UTF-8 and UTF-16LE strings and rejects truncation", () => {
    for (let [value, encoding] of [["", "utf8"], ["Za\u017c\u00f3\u0142\u0107 \ud83d\ude80", "utf8"], ["abc \ud83d\ude80", "utf16le"]]) {
        let bytes = Buffer.from(value, encoding);
        let reader = new ResourceReader(Buffer.concat([Buffer.from([bytes.length]), bytes]), "string.resources");
        assert.equal(encoding === "utf8" ? reader.string() : reader.string(encoding), value);
        assert.equal(reader.offset, reader.buffer.length);
    }
    let reader = new ResourceReader(Buffer.from([4, 65, 66]), "short.resources");
    assert.throws(() => reader.string(), /Unexpected end/);
    assert.equal(reader.offset, 1);
});
