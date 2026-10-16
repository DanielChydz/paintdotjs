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

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class AssetCatalog {
    static verify(directory, manifest) {
        if (manifest.assetSet !== "paintjs-open-v1") {
            throw new Error("Unsupported asset provenance; use the bundled open assets.");
        }
        for (let [relative, expected] of Object.entries(manifest.files)) {
            let filename = path.join(directory, relative);
            let actual = crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
            if (actual !== expected) {
                throw new Error("Asset checksum mismatch: " + relative);
            }
        }
        return directory;
    }
}

module.exports = AssetCatalog;
