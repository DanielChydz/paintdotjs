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

const {app} = require("electron");
const path = require("node:path");
const AssetCatalog = require("../../../scripts/resource/AssetCatalog");
const manifest = require("../../../desktop-resources/asset-manifest.json");

function findInstalledAssets() {
    // Bundled, verified resources only. Do not reuse an old downloaded cache or
    // PAINTDOTJS_ASSETS_DIR override that may contain proprietary artwork.
    let directory = app.isPackaged
        ? path.join(process.resourcesPath, "assets")
        : path.join(app.getAppPath(), "assets");
    try {
        return AssetCatalog.verify(directory, manifest);
    } catch (_) {
        return null;
    }
}

async function ensureDesktopAssets() {
    let directory = findInstalledAssets();
    if (directory === null) {
        throw new Error("Bundled open assets are missing or corrupt. Reinstall paint.js or restore the repository assets.");
    }
    return directory;
}

module.exports = {ensureDesktopAssets, findInstalledAssets};
