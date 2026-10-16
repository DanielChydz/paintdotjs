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

const path = require("node:path");
const AssetCatalog = require("./resource/AssetCatalog");
const manifest = require("../desktop-resources/asset-manifest.json");

async function ensureAssets() {
    AssetCatalog.verify(path.resolve(__dirname, "../assets"), manifest);
    return false;
}

if (require.main === module) {
    ensureAssets().then(() => console.log("Bundled open assets verified (no downloads)."))
        .catch(error => {
            console.error("Bundled assets are missing or modified: " + error.message);
            process.exitCode = 1;
        });
}

module.exports = {ensureAssets};
