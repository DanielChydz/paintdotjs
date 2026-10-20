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

// Repeatable CPU/allocation benchmark; no pass/fail wall-clock thresholds.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {performance} = require("node:perf_hooks");
const root = path.resolve(__dirname, "..");
let allocations = 0;
let context = vm.createContext({
    Uint8Array, Uint8ClampedArray,
    ImageData: function(data, width, height) {
        if (typeof data === "number") {
            this.width = data;
            this.height = width;
            this.data = new Uint8ClampedArray(data * width * 4);
        } else {
            this.width = width;
            this.height = height;
            this.data = data;
        }
        allocations += this.data.byteLength;
    }
});
for (let relative of ["util/Point", "util/Rectangle", "util/Size", "util/Scanline",
    "document/selection/MatrixOrder", "document/selection/Matrix", "document/selection/VertexList",
    "document/selection/GraphicsPath", "util/Region", "util/Utility",
    "document/effect/BitmapEffectEngine"]) {
    let filename = path.join(root, "js/src/engine", relative + ".js");
    let baseline = process.env.PAINTJS_BENCH_BASELINE;
    if (baseline && fs.existsSync(path.join(baseline, path.relative(root, filename)))) {
        filename = path.join(baseline, path.relative(root, filename));
    }
    vm.runInContext(fs.readFileSync(filename, "utf8"), context);
}
const api = vm.runInContext("({BitmapEffectEngine, GraphicsPath, Rectangle, Region})", context);
const measure = (name, operation) => {
    let times = [];
    let bytes;
    let result;
    operation();
    for (let sample = 0; sample < 3; ++sample) {
        if (global.gc) {
            global.gc();
        }
        allocations = 0;
        let started = performance.now();
        result = operation();
        times.push(performance.now() - started);
        bytes = allocations;
    }
    times.sort((a, b) => a - b);
    console.log(JSON.stringify({name, medianMs: +times[1].toFixed(2), imageDataBytes: bytes, result}));
};
const size = Number(process.env.PAINTJS_BENCH_SIZE || 1024);
let source = {width: size, height: size, data: new Uint8ClampedArray(size * size * 4)};
for (let i = 0; i < source.data.length; ++i) {
    source.data[i] = (Math.imul(i, 1664525) + (i >>> 6)) & 255;
}
measure(`morphology-${size}-15x15`, () => {
    let rendered = api.BitmapEffectEngine.morphology(source, size, size,
        {mode: "dilate", width: 15, height: 15, linked: false});
    return rendered.data[0] + rendered.data.at(-1);
});
let selection = new api.GraphicsPath();
for (let x = 0; x < 512; x += 4) {
    selection.addRectangle(new api.Rectangle(x, 0, 2, 8192));
}
measure("selection-region-128-strips-8192-rows", () => api.Region.fromPath(selection).size());
