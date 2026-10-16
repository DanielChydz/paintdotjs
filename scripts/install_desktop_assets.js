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

// Optional offline asset deployment helper; never extracts a third-party release.
const fs = require("node:fs");
const AssetCatalog = require("./resource/AssetCatalog");

function installAssets({source, output, manifestPath}) {
    let manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    AssetCatalog.verify(source, manifest);
    fs.cpSync(source, output, {recursive: true});
    return {assetCount: Object.keys(manifest.files).length};
}

module.exports = {installAssets};
