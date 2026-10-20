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
const DesktopPayload = require("./packaging/DesktopPayload");

async function prepareDesktop() {
    let root = path.resolve(__dirname, "..");
    let output = path.join(root, "build/desktop");
    fs.rmSync(output, {recursive: true, force: true});
    await new DesktopPayload().prepare(root, output);
    console.log("Prepared compact desktop payload (original sources preserved).");
}

if (require.main === module) {
    prepareDesktop().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = prepareDesktop;
