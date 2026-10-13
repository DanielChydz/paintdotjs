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

const {crc32, deflateRawSync} = require("node:zlib");

function zipBuffer(entries) {
    let local = [];
    let central = [];
    let offset = 0;
    for (let entry of entries) {
        let name = Buffer.from(entry.name);
        let data = Buffer.from(entry.data || "");
        let compressed = entry.deflate ? deflateRawSync(data) : data;
        let header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0800, 6);
        header.writeUInt16LE(entry.deflate ? 8 : 0, 8);
        header.writeUInt32LE(crc32(data), 14);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, compressed);

        let record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0);
        record.writeUInt16LE(3 << 8 | 20, 4);
        header.copy(record, 6, 4, 28);
        record.writeUInt32LE((entry.attributes || 0) >>> 0, 38);
        record.writeUInt32LE(offset, 42);
        central.push(record, name);
        offset += header.length + name.length + compressed.length;
    }
    let directory = Buffer.concat(central);
    let end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
}

module.exports = {zipBuffer};
