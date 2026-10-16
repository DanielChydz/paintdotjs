#!/usr/bin/env node
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

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function generateAssetManifest({source, output}) {
    let files = {};
    for (let entry of fs.readdirSync(source, {recursive: true, withFileTypes: true})) {
        if (entry.isFile()) {
            let filename = path.join(entry.parentPath, entry.name);
            let relative = path.relative(source, filename).split(path.sep).join("/");
            files[relative] = crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
        }
    }
    files = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(output, JSON.stringify({assetSet: "paintjs-open-v1", files}, null, 2) + "\n");
    return Object.keys(files).length;
}

if (require.main === module) {
    let root = path.resolve(__dirname, "..");
    console.log("Catalogued " + generateAssetManifest({source: path.join(root, "assets"),
        output: path.join(root, "desktop-resources/asset-manifest.json")}) + " bundled assets.");
}

module.exports = {generateAssetManifest};
