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
    let propertiesFile = path.resolve(__dirname, "../js/src/engine/document/layer/LayerProperties.js");
    vm.runInContext(fs.readFileSync(propertiesFile, "utf8"), context, {filename: pathToFileURL(propertiesFile).href});
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
    for (let count of [0, 65536]) {
        await assert.rejects(codec.encode({getLayers: () => ({list: () => new Array(count)})}), /1 to 65535 layers/);
    }
    assert.throws(() => codec.patchTemplate(new Uint8Array(100), 3, 2, [{}]), /template validation failed/);
    assert.throws(() => codec.patchLayerProperties(new Uint8Array(100), [{}]), /layer.*template/i);
    let classWithId = new Uint8Array(13);
    classWithId[0] = 1;
    assert.equal(codec.findBlendModeValueOffset(classWithId, 0), 9);
    assert.throws(() => codec.findBlendModeValueOffset(new Uint8Array([2]), 0), /Unsupported.*record/);
});

function templateFetch(url) {
    let match = /^assets\/pdn\/templates\/(\d+)\.bin$/.exec(url);
    assert.ok(match, "Unexpected codec fetch: " + url);
    let bytes = fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates", match[1] + ".bin"));
    return Promise.resolve(new Response(bytes));
}

function codecCanvasGlobals() {
    return {
        document: {createElement: () => ({
            getContext() {
                return {putImageData: image => this.pixels = image.data};
            }
        })},
        ImageData: function(data, width, height) {
            this.data = data;
            this.width = width;
            this.height = height;
        }
    };
}

test("PDN legacy blend-mode repairs recover real templates for every supported enum and long layer names", async () => {
    let {deserialize} = await import("ms-nrbf-js");
    let codec = loadCodec({fetch: templateFetch, Nrbf: {deserialize}, ...codecCanvasGlobals()});
    for (let count of [1, 3]) {
        let template = new Uint8Array(fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates", count + ".bin")));
        for (let mode = 0; mode <= 13; ++mode) {
            let layers = Array.from({length: count}, (_, index) => ({properties: {
                name: index === 0 ? "Long name " + "x".repeat(140) : "Layer " + index,
                visible: index !== 1, isBackground: index === 0, opacity: index === 0 ? undefined : 127,
                blendMode: mode
            }}));
            let graph = codec.patchTemplate(template, 2, 1, layers);
            let broken = graph.slice();
            for (let layer of layers) {
                let name = new TextEncoder().encode(layer.properties.name);
                let offset = codec.findByteSequence(broken, name) + name.length + 8;
                new DataView(broken.buffer).setInt32(offset, mode, true);
            }
            let repaired = await codec.repairLegacyBlendModeRecords(broken, count);
            assert.deepEqual(repaired, graph);
            let decoded = deserialize(repaired);
            assert.equal(decoded.members.width, 2);
            assert.equal(decoded.members.height, 1);
            assert.equal(decoded.members.layers.members["ArrayList+_size"], count);
            let entries = decoded.members.layers.members["ArrayList+_items"];
            for (let index = 0; index < count; ++index) {
                let properties = entries[index].members["Layer+properties"].members;
                assert.equal(properties.name, layers[index].properties.name);
                assert.equal(properties.blendMode.members.value__, mode);
                assert.equal(properties.opacity, index === 0 ? 255 : 127);
            }
            let pixelBytes = Buffer.from([7, 19, 201, 255, 33, 42, 55, 255]);
            let container = codec.concat([codec.createHeader(2, 1, count), broken,
                ...Array.from({length: count}, () => pixelBlock(pixelBytes, false))]);
            let loaded = await codec.decode(container);
            assert.equal(loaded.layers.length, count);
            assert.equal(loaded.width, 2);
            for (let index = 0; index < count; ++index) {
                assert.equal(loaded.layers[index].name, layers[index].properties.name);
                assert.deepEqual(loaded.layers[index].canvas.pixels, new Uint8ClampedArray([201, 19, 7, 255, 55, 42, 33, 255]));
            }
        }
    }
});

test("PDN legacy recovery rejects unrecognized records without altering the supplied graph", async () => {
    let codec = loadCodec({fetch: templateFetch});
    for (let count of [0, 65, 1.5, NaN]) {
        assert.equal(await codec.repairLegacyBlendModeRecords(new Uint8Array(0), count), null);
    }
    assert.equal(codec.readLayerCountFromHeader(new TextEncoder().encode("<pdnImage/>")), 0);
    assert.equal(codec.readLayerCountFromHeader(new TextEncoder().encode('<pdnImage layers="3"/>')), 3);
    let template = new Uint8Array(fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates/1.bin")));
    let marker = new TextEncoder().encode("PDJ_LAYER_0000");
    let markerOffset = codec.findByteSequence(template, marker);
    let recordOffset = markerOffset + marker.length + 8;
    let broken = template.slice();
    new DataView(broken.buffer).setInt32(recordOffset, 3, true);
    for (let bytes of [
        new Uint8Array(0), broken.subarray(0, recordOffset + 3),
        (() => {
            let invalid = broken.slice();
            new DataView(invalid.buffer).setInt32(recordOffset, 14, true);
            return invalid;
        })(),
        (() => {
            let invalid = broken.slice();
            new DataView(invalid.buffer).setInt32(recordOffset, -1, true);
            return invalid;
        })()
    ]) {
        let original = bytes.slice();
        assert.equal(await codec.repairLegacyBlendModeRecords(bytes, 1), null);
        assert.deepEqual(bytes, original);
    }
    assert.equal(await loadCodec({fetch: async () => new Response("", {status: 404})})
        .repairLegacyBlendModeRecords(broken, 1), null);
    for (let mutation of [
        bytes => bytes.fill(0),
        bytes => bytes[markerOffset - 6] = 0
    ]) {
        let invalid = template.slice();
        mutation(invalid);
        assert.equal(await loadCodec({fetch: async () => new Response(invalid)})
            .repairLegacyBlendModeRecords(broken, 1), null);
    }
});

test("PDN decode validates malformed object structures and propagates unrecoverable NRBF failures", async () => {
    let validRoot = () => ({members: {width: 1, height: 1, layers: {members: {
        "ArrayList+_size": 1, "ArrayList+_items": [{members: {"Layer+properties": {members: {}}}}]
    }}}});
    let header = loadCodec().createHeader(1, 1, 1);
    let bytes = Buffer.concat([header, pixelBlock(Buffer.from([0, 0, 255, 255]), false)]);
    let codec = loadCodec({Nrbf: {deserialize: validRoot}, ...codecCanvasGlobals()});
    await assert.rejects(codec.decode(new Uint8Array(10)), /truncated/);
    let badMarker = Buffer.from(bytes);
    badMarker[header.length - 1] = 2;
    await assert.rejects(codec.decode(badMarker), /Unsupported.*encoding/);
    let badHeaderLength = Buffer.from(bytes);
    badHeaderLength[6] = 255;
    await assert.rejects(codec.decode(badHeaderLength), /Unsupported.*encoding/);
    for (let [key, value] of [["width", 0], ["width", 1.5], ["width", 32769],
        ["height", 0], ["height", 1.5], ["height", 32769]]) {
        let root = validRoot();
        root.members[key] = value;
        await assert.rejects(loadCodec({Nrbf: {deserialize: () => root}}).decode(bytes), /Invalid.*structure/);
    }
    for (let [count, entries] of [[0, []], [2, [{}]]]) {
        let root = validRoot();
        root.members.layers.members["ArrayList+_size"] = count;
        root.members.layers.members["ArrayList+_items"] = entries;
        await assert.rejects(loadCodec({Nrbf: {deserialize: () => root}}).decode(bytes), /Invalid.*structure/);
    }
    await assert.rejects(codec.decode(header), /Could not decode.*pixels/);
    for (let entry of [null, undefined]) {
        let root = validRoot();
        root.members.layers.members["ArrayList+_items"] = [entry];
        await assert.rejects(loadCodec({Nrbf: {deserialize: () => root}}).decode(bytes), /Invalid.*entry/);
    }
    let decoded = await codec.decode(bytes);
    assert.equal(decoded.layers[0].name, "Layer 1");
    assert.equal(decoded.layers[0].opacity, 255);
    assert.equal(decoded.layers[0].blendMode, "normal");
    let failure = new Error("bad NRBF stream");
    codec = loadCodec({Nrbf: {deserialize: () => {
        throw failure;
    }}, fetch: templateFetch});
    await assert.rejects(codec.decode(bytes), actual => actual === failure);
    await assert.rejects(loadCodec({fetch: async () => new Response("", {status: 404})})
        .encode({getWidth: () => 1, getHeight: () => 1, getLayers: () => ({list: () => [{properties: {}}]})}),
    /Could not load.*template/);
});

test("PDN blend enum metadata walks each NRBF binary type and rejects multiple members", () => {
    let codec = loadCodec();
    let encoder = new TextEncoder();
    let string = text => Buffer.concat([Buffer.from([text.length]), encoder.encode(text)]);
    for (let type of [0, 7, 3, 4, 1]) {
        let extra = type === 0 || type === 7 ? Buffer.from([8])
            : type === 3 ? string("System.Int32")
            : type === 4 ? Buffer.concat([string("EnumType"), Buffer.alloc(4)]) : Buffer.alloc(0);
        let bytes = Buffer.concat([
            Buffer.from([5]), Buffer.alloc(4), string("BlendMode"),
            Buffer.from([1, 0, 0, 0]), string("value__"), Buffer.from([type]), extra,
            Buffer.from([1, 0, 0, 0]), Buffer.from([13, 0, 0, 0])
        ]);
        let offset = codec.findBlendModeValueOffset(bytes, 0);
        assert.equal(offset, bytes.length - 4);
        assert.equal(bytes.readInt32LE(offset), 13);
    }
    let malformed = Buffer.concat([Buffer.from([5]), Buffer.alloc(4), string("BlendMode"), Buffer.from([2, 0, 0, 0])]);
    assert.throws(() => codec.findBlendModeValueOffset(malformed, 0), /Invalid.*enum/);
});

test("PDN headers reject invalid dimensions and unsafe XML values before serialization", () => {
    let codec = loadCodec();
    for (let [width, height, layers] of [
        [0, 2, 1], [2, 0, 1], [1.5, 2, 1], [2, 1.5, 1],
        [32769, 2, 1], [2, 32769, 1], [Infinity, 2, 1], [2, Infinity, 1],
        [2, 2, 0], [2, 2, 65536], [2, 2, 1.5], ['2" invalid="true', 2, 1]
    ]) {
        assert.throws(() => codec.createHeader(width, height, layers), /Invalid Paint.NET header dimensions or layer count/);
    }
    let largest = codec.createHeader(32768, 32768, 64);
    let length = largest[4] + largest[5] * 256 + largest[6] * 65536;
    assert.ok(length < 200);
    assert.match(new TextDecoder().decode(largest.subarray(7, 7 + length)), /width="32768" height="32768" layers="64"/);
});

test("PDN template patching supplies stable names for unnamed layers", async () => {
    let {deserialize} = await import("ms-nrbf-js");
    let codec = loadCodec();
    let template = new Uint8Array(fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates/3.bin")));
    let layers = [null, "", "Named"].map(name => ({properties: {name, visible: true, opacity: 255, blendMode: "normal"}}));
    let graph = codec.patchTemplate(template, 2, 1, layers);
    let entries = deserialize(graph).members.layers.members["ArrayList+_items"];
    assert.deepEqual(entries.slice(0, 3).map(entry => entry.members["Layer+properties"].members.name), ["Layer 1", "Layer 2", "Named"]);
    assert.equal(layers[0].properties.name, null);
    assert.equal(layers[1].properties.name, "");
});


test("independent PDN schemas cover all supported layer counts and reproduce committed graphs", async () => {
    let {serialize, deserialize} = await import("ms-nrbf-js");
    let PdnTemplateFactory = require("../scripts/resource/PdnTemplateFactory");
    let codec = loadCodec();
    for (let count of [0, -1, 65536, 1.5]) {
        assert.throws(() => PdnTemplateFactory.create(count), /1 to 65535 layers/);
    }
    for (let count = 1; count <= 64; ++count) {
        let graph = serialize(PdnTemplateFactory.create(count));
        assert.deepEqual(graph, fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates", count + ".bin")),
            "Committed PDN schema has drifted from its independent source: " + count);
        let layers = Array.from({length: count}, (_, index) => ({properties: {
            name: "Independent layer " + index, visible: true, opacity: 77, blendMode: "multiply"
        }}));
        let patched = codec.patchTemplate(new Uint8Array(graph), 2, 1, layers);
        let root = deserialize(patched);
        assert.equal(root.members.width, 2);
        assert.equal(root.members.height, 1);
        let objects = root.members.layers.members["ArrayList+_items"];
        assert.equal(objects.length, count);
        for (let [index, layer] of objects.entries()) {
            assert.equal(layer.members.surface.members.width, 2);
            assert.equal(layer.members.surface.members.height, 1);
            assert.equal(layer.members["Layer+properties"].members.name, layers[index].properties.name);
            assert.equal(layer.members["Layer+properties"].members.opacity, 77);
        }
    }
    assert.equal(codec.isLayerNameRecord(new Uint8Array(0), -1), false);
    let malformed = new Uint8Array(16).fill(0x80);
    assert.equal(codec.isLayerNameRecord(malformed, 0), false);
});


test("legacy blend repair retains negative enum object ids without old template bytes", async () => {
    let codec = loadCodec({fetch: templateFetch});
    let template = new Uint8Array(fs.readFileSync(path.resolve(__dirname, "../assets/pdn/templates/2.bin")));
    let marker = new TextEncoder().encode("PDJ_LAYER_0000");
    let enumStart = codec.findByteSequence(template, marker) + marker.length + 8;
    let enumEnd = codec.findBlendModeValueOffset(template, enumStart) + 4;
    let firstEnum = Buffer.from(template.subarray(enumStart, enumEnd));
    firstEnum.writeInt32LE(-30, 1);
    let int32 = value => {
        let bytes = Buffer.alloc(4);
        bytes.writeInt32LE(value);
        return bytes;
    };
    // Independently construct the old writer's record contract. No original
    // Paint.NET graph/resource bytes are inputs to this fixture.
    let parts = [Buffer.from("isDisposed\0userMetadataItems")];
    for (let [index, id] of [28, 33].entries()) {
        let name = Buffer.from("Legacy " + index);
        parts.push(Buffer.from([6]), int32(id), Buffer.from([name.length]), name,
            Buffer.from([9]), int32(123), Buffer.from([1, 0, 117]));
        parts.push(index === 0 ? firstEnum : Buffer.concat([Buffer.from([1]), int32(-35), int32(-30), int32(0)]));
    }
    let original = new Uint8Array(Buffer.concat(parts));
    for (let mode = 0; mode < 14; ++mode) {
        let broken = original.slice();
        let expected = original.slice();
        for (let id of [28, 33]) {
            let signature = Buffer.concat([Buffer.from([6]), int32(id)]);
            let nameStart = codec.findByteSequence(original, signature);
            let record = codec.skipLengthPrefixedString(original, nameStart + 5) + 8;
            new DataView(broken.buffer).setInt32(record, mode, true);
            new DataView(expected.buffer).setInt32(codec.findBlendModeValueOffset(original, record), mode, true);
        }
        let snapshot = broken.slice();
        let repaired = await codec.repairLegacyBlendModeRecords(broken, 2);
        assert.deepEqual(repaired, expected, "Legacy enum identity or unaffected bytes changed for mode " + mode);
        assert.deepEqual(broken, snapshot, "Recovery mutated the caller's graph");
    }
});


test("PDN generated graphs round trip more than 64 bitmap layers and document/layer metadata", async () => {
    let {serialize, deserialize} = await import("ms-nrbf-js");
    let Factory = require("../src/pdn/PdnObjectGraph");
    let codec = loadCodec({Nrbf: {serialize, deserialize, createDocumentGraph: (...args) => Factory.create(...args)},
        ...codecCanvasGlobals()});
    let metadata = [{key: "Author", value: "Żółw & <test>"}, {key: "custom", value: "x".repeat(300)}];
    let layers = Array.from({length: 65}, (_, index) => ({
        properties: {name: "Layer " + index, visible: index % 2 === 0, isBackground: index === 0,
            opacity: index, blendMode: "multiply", userMetadataItems: [{key: "tag", value: String(index)}]},
        getSurface: () => ({getCanvas: () => ({width: 1, height: 1,
            getContext: () => ({getImageData: () => ({data: new Uint8Array([index, 55, 99, 255])})})})})
    }));
    let blob = await codec.encode({metadata, getWidth: () => 1, getHeight: () => 1,
        getResolution: () => 300, getLayers: () => ({list: () => layers})});
    let saved = await codec.decode(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(saved.layers.length, 65);
    assert.equal(saved.resolution, 300);
    assert.deepEqual(Array.from(saved.metadata.slice(0, 2), entry => ({...entry})), metadata);
    for (let [index, layer] of saved.layers.entries()) {
        assert.equal(layer.name, "Layer " + index);
        assert.equal(layer.visible, index % 2 === 0);
        assert.equal(layer.isBackground, index === 0);
        assert.equal(layer.opacity, index);
        assert.equal(layer.blendMode, "multiply");
        assert.deepEqual(Array.from(layer.canvas.pixels), [index, 55, 99, 255]);
        assert.deepEqual(Array.from(layer.userMetadataItems, entry => ({...entry})), [{key: "tag", value: String(index)}]);
    }
    let unnamed = {...layers[0], properties: {}};
    let defaultBlob = await codec.encode({metadata, getWidth: () => 1, getHeight: () => 1,
        getLayers: () => ({list: () => [unnamed]})});
    let defaultLayer = (await codec.decode(new Uint8Array(await defaultBlob.arrayBuffer()))).layers[0];
    assert.equal(defaultLayer.name, "Layer 1");
    assert.equal(defaultLayer.opacity, 255);
    assert.equal(defaultLayer.blendMode, "normal");
    assert.throws(() => codec.readMetadata({}), /metadata structure/);
    for (let entry of [null, {members: {key: 5, value: "a"}}, {members: {key: "x", value: false}}]) {
        assert.throws(() => codec.readMetadata([entry]), /metadata entry/);
    }
    let graph = Factory.create(1, {width: 1, height: 1});
    graph.members.layers.members["ArrayList+_items"][0].typeName = "PaintDotNet.FutureLayer";
    let bytes = codec.concat([codec.createHeader(1, 1, 1), serialize(graph), pixelBlock(new Uint8Array(4), false)]);
    await assert.rejects(codec.decode(bytes), /Unsupported Paint.NET layer type/);
    graph = Factory.create(1, {width: 1, height: 1, metadata: [{key: "paint.js.resolution", value: "NaN"}]});
    bytes = codec.concat([codec.createHeader(1, 1, 1), serialize(graph), pixelBlock(new Uint8Array(4), false)]);
    await assert.rejects(codec.decode(bytes), /resolution metadata/);
});
