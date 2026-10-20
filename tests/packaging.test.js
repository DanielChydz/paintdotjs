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

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const DesktopPayload = require("../scripts/packaging/DesktopPayload");

test("desktop minification preserves globals, reflection, closures, CSS URLs and runtime catalog", async () => {
    let root = await fs.mkdtemp(path.join(os.tmpdir(), "paintjs-payload-"));
    try {
        for (let directory of ["js", "lib/codecs", "css", "scripts/resource"]) {
            await fs.mkdir(path.join(root, directory), {recursive: true});
        }
        await fs.writeFile(path.join(root, "js/model.js"), `/*! Copyright fixture */
            class DocumentModel { constructor(value) { this.value = value; } }
            function pluginEntry(first, unused) { return new DocumentModel(first); }
            function workerEntry() { return (value => value + 3)(4); }
        `);
        await fs.writeFile(path.join(root, "js/view.js"), `
            globalThis.result = [pluginEntry.name, pluginEntry.length,
                pluginEntry(42).constructor.name, pluginEntry(42).value,
                eval("(" + workerEntry.toString() + ")()")];
        `);
        await fs.writeFile(path.join(root, "css/theme.css"),
            '.icon { background: url("../assets/icons/test.png"); --label: "hello world"; width: calc(100% - 2px); }');
        await fs.writeFile(path.join(root, "lib/data.bin"), new Uint8Array([0, 3, 255]));
        await fs.writeFile(path.join(root, "lib/codecs/unused.js"), "duplicate codec");
        await fs.writeFile(path.join(root, "scripts/resource/AssetCatalog.js"), "module.exports = 42;");
        let output = path.join(root, "output");
        await new DesktopPayload().prepare(root, output);
        let context = vm.createContext({});
        for (let name of ["model.js", "view.js"]) {
            vm.runInContext(await fs.readFile(path.join(output, "js", name), "utf8"), context);
        }
        assert.deepEqual(Array.from(context.result), ["pluginEntry", 2, "DocumentModel", 42, 7]);
        assert.match(await fs.readFile(path.join(output, "js/model.js"), "utf8"), /Copyright fixture/);
        let css = await fs.readFile(path.join(output, "css/theme.css"), "utf8");
        assert.match(css, /\.\.\/assets\/icons\/test\.png/);
        assert.match(css, /hello world/);
        assert.match(css, /calc\(100% - 2px\)/);
        assert.deepEqual(await fs.readFile(path.join(output, "lib/data.bin")), Buffer.from([0, 3, 255]));
        await assert.rejects(fs.access(path.join(output, "lib/codecs")));
        assert.equal(require(path.join(output, "scripts/resource/AssetCatalog.js")), 42);
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

test("WASM size optimization preserves executable exports and reuses results on rebuild", async () => {
    let webpack = require("webpack");
    let OptimizeWasmPlugin = require("../scripts/webpack/OptimizeWasmPlugin");
    let {default: binaryen} = await import("binaryen");
    let root = await fs.mkdtemp(path.join(os.tmpdir(), "paintjs-wasm-"));
    let plugin = new OptimizeWasmPlugin();
    let compiler;
    try {
        let module = binaryen.parseText('(module (func (export "answer") (result i32) (i32.add (i32.const 40) (i32.const 2))))');
        try {
            await fs.writeFile(path.join(root, "fixture.wasm"), module.emitBinary());
        } finally {
            module.dispose();
        }
        await fs.writeFile(path.join(root, "entry.js"), 'import url from "./fixture.wasm"; globalThis.fixtureUrl = url;');
        compiler = webpack({mode: "production", context: root, entry: "./entry.js",
            output: {path: path.join(root, "output"), assetModuleFilename: "[name][ext]"},
            optimization: {minimize: false},
            module: {rules: [{test: /\.wasm$/, type: "asset/resource"}]},
            plugins: [plugin]});
        let run = () => new Promise((resolve, reject) => {
            compiler.run((error, stats) => {
                if (error || stats.hasErrors()) {
                    reject(error || new Error(stats.toString()));
                } else {
                    resolve();
                }
            });
        });
        await run();
        let first = [...plugin.cache.values()][0];
        let optimized = await fs.readFile(path.join(root, "output/fixture.wasm"));
        let {instance} = await WebAssembly.instantiate(optimized);
        assert.equal(instance.exports.answer(), 42);
        assert.ok(optimized.length < (await fs.stat(path.join(root, "fixture.wasm"))).size);
        await run();
        assert.equal([...plugin.cache.values()][0], first);
        assert.deepEqual(await fs.readFile(path.join(root, "output/fixture.wasm")), optimized);
    } finally {
        if (compiler) {
            await new Promise((resolve, reject) => compiler.close(error => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            }));
        }
        await fs.rm(root, {recursive: true, force: true});
    }
});
