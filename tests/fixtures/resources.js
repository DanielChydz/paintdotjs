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

const {crc32, deflateSync} = require("node:zlib");

function int32(value) {
    let buffer = Buffer.alloc(4);
    buffer.writeInt32LE(value);
    return buffer;
}

function sevenBitInt(value) {
    let bytes = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        bytes.push(value ? byte | 0x80 : byte);
    } while (value);
    return Buffer.from(bytes);
}

function string(value, encoding = "utf8") {
    let buffer = Buffer.from(value, encoding);
    return Buffer.concat([sevenBitInt(buffer.length), buffer]);
}

function resourceBuffer(entries, options = {}) {
    let metadata = Buffer.concat([
        string("System.Resources.ResourceReader, mscorlib"),
        string("System.Resources.RuntimeResourceSet, mscorlib")
    ]);
    let types = options.types || ["Fixture.Type"];
    let header = Buffer.concat([
        Buffer.from([0xce, 0xca, 0xef, 0xbe]),
        int32(options.managerVersion ?? 1), int32(metadata.length), metadata,
        int32(options.version ?? 2), int32(options.resourceCount ?? entries.length),
        int32(options.typeCount ?? types.length), ...types.map(type => string(type))
    ]);
    let names = [];
    let values = [];
    let positions = [];
    let nameLength = 0;
    let dataLength = 0;
    for (let entry of entries) {
        let type = entry.type ?? 1;
        let name = Buffer.concat([string(entry.name, "utf16le"), int32(dataLength)]);
        let value = Buffer.concat([
            sevenBitInt(type),
            type === 1 ? string(entry.value) : type === 0 ? Buffer.alloc(0) : Buffer.from([1])
        ]);
        positions.push(int32(nameLength));
        names.push(name);
        values.push(value);
        nameLength += name.length;
        dataLength += value.length;
    }
    let padding = Buffer.alloc((8 - header.length % 8) % 8);
    let dataOffset = header.length + padding.length + entries.length * 8 + 4 + nameLength;
    return Buffer.concat([
        header, padding, Buffer.alloc(entries.length * 4), ...positions,
        int32(dataOffset), ...names, ...values
    ]);
}

function pngBuffer(size, color) {
    let chunk = (type, data) => {
        let name = Buffer.from(type);
        let length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        let checksum = Buffer.alloc(4);
        checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
        return Buffer.concat([length, name, data, checksum]);
    };
    let header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 6;
    let pixels = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; ++y) {
        for (let x = 0; x < size; ++x) {
            for (let channel = 0; channel < 4; ++channel) {
                pixels[y * (size * 4 + 1) + 1 + x * 4 + channel] = color[channel];
            }
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))
    ]);
}

function icoBuffer(images) {
    let header = Buffer.alloc(6);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = 6 + images.length * 16;
    let entries = [];
    for (let image of images) {
        let entry = Buffer.alloc(16);
        entry[0] = image.size === 256 ? 0 : image.size;
        entry[1] = image.size === 256 ? 0 : image.size;
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(image.data.length, 8);
        entry.writeUInt32LE(offset, 12);
        entries.push(entry);
        offset += image.data.length;
    }
    return Buffer.concat([header, ...entries, ...images.map(image => image.data)]);
}

module.exports = {resourceBuffer, pngBuffer, icoBuffer};
