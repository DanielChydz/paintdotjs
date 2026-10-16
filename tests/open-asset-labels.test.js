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

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");

function lookup(root, key) {
    return key.split(".").reduce((value, part) => value?.[part], root);
}

test("authored English resources resolve explicit application labels as text", () => {
    let root = path.resolve(__dirname, "..");
    let dictionary = JSON.parse(fs.readFileSync(path.join(root, "assets/lang/en.json")));
    assert.equal(fs.readFileSync(path.join(root, "artwork/en.json"), "utf8"),
        fs.readFileSync(path.join(root, "assets/lang/en.json"), "utf8"));
    let directory = path.join(root, "js/src");
    for (let entry of fs.readdirSync(directory, {recursive: true, withFileTypes: true})) {
        if (!entry.isFile() || !entry.name.endsWith(".js")) {
            continue;
        }
        let source = fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8");
        for (let match of source.matchAll(/i18n\(["']([a-zA-Z][a-zA-Z0-9_.]+)["']\s*[,)]/g)) {
            assert.equal(typeof lookup(dictionary, match[1]), "string", "Missing literal label: " + match[1]);
        }
    }
    for (let prefix of ["moveTool", "moveSelectionTool"]) {
        for (let mode of ["translate", "scale", "rotate"]) {
            assert.equal(typeof lookup(dictionary, prefix + ".historyMemento." + mode), "string");
        }
    }
    for (let channel of ["red", "green", "blue", "hue", "saturation", "value"]) {
        assert.equal(typeof lookup(dictionary, "colorsForm." + channel + "Label.text"), "string");
    }
});
