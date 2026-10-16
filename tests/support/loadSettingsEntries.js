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
const vm = require("node:vm");
const {pathToFileURL} = require("node:url");

module.exports = function loadSettingsEntries(context) {
    let directory = path.resolve(__dirname, "../../js/src/interface/window/settings/entry");
    let files = fs.readdirSync(directory).filter(name => name !== "SettingsEntry.js" && name !== "SettingsEntryRegistry.js");
    for (let name of ["SettingsEntry.js", ...files, "SettingsEntryRegistry.js"]) {
        let filename = path.join(directory, name);
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
};
