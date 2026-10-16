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

const fs = require("node:fs");
const path = require("node:path");
const PdnTemplateFactory = require("./resource/PdnTemplateFactory");

import("ms-nrbf-js").then(({serialize}) => {
    let output = path.resolve(__dirname, "../assets/pdn/templates");
    fs.mkdirSync(output, {recursive: true});
    for (let count = 1; count <= 64; ++count) {
        fs.writeFileSync(path.join(output, count + ".bin"), serialize(PdnTemplateFactory.create(count)));
    }
    console.log("Generated 64 independent PDN format schemas; no external app or resources used.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
