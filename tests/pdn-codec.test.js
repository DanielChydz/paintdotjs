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
const {gzipSync} = require("node:zlib");
const {test} = require("node:test");

function loadCodec(globals = {}) {
    let filename = path.resolve(__dirname, "../js/src/io/PdnDocumentCodec.js");
    let context = vm.createContext({
        Uint8Array, Uint8ClampedArray, DataView, TextEncoder, TextDecoder,
        Blob, Response, CompressionStream, DecompressionStream, ...globals
    });
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    return vm.runInContext("PdnDocumentCodec", context);
}

function pixelBlock(pixels, compressed, chunkSize = 512) {
    let parts = [Buffer.alloc(5)];
    parts[0][0] = compressed ? 0 : 1;
    parts[0].writeUInt32BE(chunkSize, 1);
    for (let offset = 0, index = 0; offset < pixels.length; offset += chunkSize, ++index) {
        let bytes = pixels.subarray(offset, offset + chunkSize);
        let payload = compressed ? gzipSync(bytes) : bytes;
        let header = Buffer.alloc(8);
        header.writeUInt32BE(index);
        header.writeUInt32BE(payload.length, 4);
        parts.push(header, payload);
    }
    return Buffer.concat(parts);
}

test("PDN headers encode magic, XML byte length and NRBF stream marker", () => {
    let codec = loadCodec();
    let bytes = codec.createHeader(123, 456, 7);
    assert(codec.isNativePdn(bytes));
    assert.equal(codec.isNativePdn(new Uint8Array(3)), false);
    assert.equal(codec.isNativePdn(new Uint8Array([0x50, 0x44, 0x4e, 0x32])), false);
    let length = bytes[4] + bytes[5] * 256 + bytes[6] * 65536;
    assert.equal(length, bytes.length - 9);
    assert.match(new TextDecoder().decode(bytes.subarray(7, 7 + length)), /width="123" height="456" layers="7"/);
    assert.deepEqual(bytes.slice(-2), new Uint8Array([0, 1]));
});

test("PDN compression round-trips arbitrary bytes and rejects missing codec support", async () => {
    let bytes = Uint8Array.from({length: 1025}, (_, index) => index % 256);
    let codec = loadCodec();
    let zipped = await codec.gzip(bytes);
    assert.deepEqual(zipped.subarray(0, 2), new Uint8Array([0x1f, 0x8b]));
    assert.deepEqual(await codec.gunzip(zipped), bytes);
    await assert.rejects(codec.gunzip(new Uint8Array([1, 2, 3])));
    await assert.rejects(loadCodec({CompressionStream: undefined}).gzip(bytes), /does not support.*compression/);
    await assert.rejects(loadCodec({DecompressionStream: undefined}).gunzip(zipped), /does not support.*decompression/);
});

test("PDN pixel blocks decode compressed and uncompressed multi-chunk payloads", async () => {
    let codec = loadCodec();
    let bytes = Uint8Array.from({length: 1030}, (_, index) => index % 256);
    for (let compressed of [false, true]) {
        let block = pixelBlock(bytes, compressed);
        let result = await codec.readPixelBlock(block, 0, bytes.length);
        assert.deepEqual(result.pixels, bytes);
        assert.equal(result.end, block.length);
        let chain = Buffer.concat([Buffer.from([99, 33, 0, 0, 0, 0]), block, block]);
        let blocks = await codec.findPixelBlocks(chain, 0, bytes.length, 2);
        assert.equal(blocks.length, 2);
        assert.deepEqual(blocks[0], bytes);
        assert.deepEqual(blocks[1], bytes);
        assert.equal((await codec.findPixelBlocks(block, 0, bytes.length, 2)).length, 0);
    }
});

test("PDN pixel blocks reject invalid tags, chunk indexes, truncation and decoded sizes", async () => {
    let codec = loadCodec();
    let valid = pixelBlock(Buffer.from([1, 2, 3, 4]), false);
    for (let [offset, value, expected] of [
        [0, 2, /Invalid pixel block/], [1, 0, /Invalid pixel block/],
        [5, 1, /Invalid pixel chunk index/], [9, 0, /Truncated pixel chunk/],
        [9, 100, /Truncated pixel chunk/], [9, 3, /Invalid pixel chunk size/]
    ]) {
        let bytes = Buffer.from(valid);
        if (offset === 0) {
            bytes[0] = value;
        } else {
            bytes.writeUInt32BE(value, offset);
        }
        await assert.rejects(codec.readPixelBlock(bytes, 0, 4), expected);
    }
    await assert.rejects(codec.readPixelBlock(valid.subarray(0, 8), 0, 4), /Invalid pixel chunk index/);
    assert.equal((await codec.findPixelBlocks(new Uint8Array(20).fill(33), 0, 4, 1)).length, 0);
});

test("PDN byte replacement respects endianness, boundaries and nonmatching values", () => {
    let codec = loadCodec();
    let bytes = new Uint8Array(21);
    let view = new DataView(bytes.buffer);
    view.setUint32(0, 257, true);
    view.setUint32(4, 99, true);
    view.setUint32(8, 257, true);
    assert.equal(codec.replaceUint32(bytes, 257, 123), 2);
    assert.equal(view.getUint32(0, true), 123);
    assert.equal(view.getUint32(4, true), 99);
    assert.equal(view.getUint32(8, true), 123);
    view.setBigUint64(1, 9007199254740993n, true);
    view.setBigUint64(10, 9007199254740993n, true);
    assert.equal(codec.replaceUint64(bytes, 9007199254740993n, 123456789012345n), 2);
    assert.equal(view.getBigUint64(1, true), 123456789012345n);
    assert.equal(view.getBigUint64(10, true), 123456789012345n);
    for (let value of [0, 1, 2147483648, 4294967295]) {
        codec.writeUint32BE(bytes, 3, value);
        assert.equal(codec.readUint32BE(bytes, 3), value);
        assert.equal(view.getUint32(3, false), value);
    }
    assert.equal(codec.findByteSequence(new Uint8Array([1, 2, 1, 3]), new Uint8Array([1, 3])), 2);
    assert.equal(codec.findByteSequence(new Uint8Array([1, 2]), new Uint8Array([3])), -1);
    assert.deepEqual(codec.concat([new Uint8Array([1]), new Uint8Array(0), new Uint8Array([2, 3])]),
        new Uint8Array([1, 2, 3]));
});

test("PDN 7-bit string prefixes skip valid byte lengths and reject truncated/overflowing lengths", () => {
    let codec = loadCodec();
    for (let length of [0, 1, 127, 128, 16383, 16384]) {
        let prefix = codec.encode7BitInt(length);
        let bytes = codec.concat([prefix, new Uint8Array(length)]);
        assert.equal(codec.skipLengthPrefixedString(bytes, 0), bytes.length);
    }
    for (let bytes of [[], [128], [4, 65], [128, 128, 128, 128, 128], [255, 255, 255, 255, 15]]) {
        assert.throws(() => codec.skipLengthPrefixedString(new Uint8Array(bytes), 0), /Truncated NRBF|Invalid NRBF/);
    }
});

test("PDN encode/decode surface missing decoder, invalid layer counts and invalid templates", async () => {
    let codec = loadCodec();
    await assert.rejects(codec.decode(new Uint8Array(20)), /decoder is unavailable/);
    for (let count of [0, 65]) {
        await assert.rejects(codec.encode({getLayers: () => ({list: () => new Array(count)})}), /1 to 64 layers/);
    }
    assert.throws(() => codec.patchTemplate(new Uint8Array(100), 3, 2, [{}]), /template validation failed/);
    assert.throws(() => codec.patchLayerProperties(new Uint8Array(100), [{}]), /layer.*template/i);
    let classWithId = new Uint8Array(13);
    classWithId[0] = 1;
    assert.equal(codec.findBlendModeValueOffset(classWithId, 0), 9);
    assert.throws(() => codec.findBlendModeValueOffset(new Uint8Array([2]), 0), /Unsupported.*record/);
});
