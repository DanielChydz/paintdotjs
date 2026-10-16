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
const vm = require("node:vm");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

function fixture() {
    let context = vm.createContext({console: {warn() {}}});
    for (let name of ["ShapeCatalog", "PaintDotNetShapeParser"]) {
        let filename = path.resolve("js/src/engine/document/tool/shape", name + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8") + `\nthis.${name} = ${name};`, context,
            {filename: pathToFileURL(filename).href});
    }
    return context;
}

test("shape number lists reject embedded garbage and normalize XML value whitespace", () => {
    let {PaintDotNetShapeParser: parser} = fixture();
    for (let value of ["1garbage,2", "0,0,10px,20", "1;2", "NaN,1", "Infinity,1"]) {
        assert.throws(() => parser.parseNumbers(value, null, "coordinates", "bad.xaml"), /invalid/);
    }
    assert.deepEqual(Array.from(parser.parseNumbers(" -1.5, +2e2 .25 ", 3, "coordinates", "valid.xaml")), [-1.5, 200, 0.25]);
    assert.equal(parser.parseBoolean(" true ", false, "flag", "valid.xaml"), true);
    assert.equal(parser.parseBoolean(" false ", true, "flag", "valid.xaml"), false);
    assert.equal(parser.parseFillRule(" EvenOdd ", "nonzero", "valid.xaml"), "evenodd");
});

test("shape catalog handles unavailable geometry APIs and failed SVG measurement without leaking nodes", () => {
    let context = fixture();
    let {ShapeCatalog: catalog} = context;
    assert.equal(catalog.measurePath("M0 0 L1 1"), null);
    context.document = {};
    assert.equal(catalog.measurePath("M0 0 L1 1"), null);
    let removed = 0;
    context.document = {body: {appendChild() {}}, createElementNS: () => ({style: {},
        setAttribute() {}, appendChild() {}, remove: () => ++removed,
        getBBox: () => { throw new Error("SVG measurement unavailable"); }})};
    assert.equal(catalog.measurePath("M0 0 L1 1"), null);
    assert.equal(removed, 1);
    catalog.register({id: "fixture", sourceId: "fixture", path: "M0 0", viewBox: [0, 0, 1, 1]});
    assert.equal(catalog.createPath("fixture", {}), null);
    context.Path2D = function () {};
    assert.equal(catalog.createPath("fixture", {}), null);
    catalog.unregister("missing");
    assert.equal(catalog.has("fixture"), true);
});
