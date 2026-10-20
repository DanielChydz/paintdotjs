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

const crypto = require("node:crypto");

class OptimizeWasmPlugin {
    constructor() {
        this.cache = new Map();
    }

    apply(compiler) {
        compiler.hooks.thisCompilation.tap("OptimizeWasmPlugin", compilation => {
            compilation.hooks.processAssets.tapPromise({
                name: "OptimizeWasmPlugin",
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE
            }, async assets => {
                let {default: binaryen} = await import("binaryen");
                // Match the existing Emscripten/browser instruction baseline.
                let features = ["MVP", "Atomics", "MutableGlobals", "NontrappingFPToInt", "SignExt",
                    "BulkMemory", "BulkMemoryOpt", "SIMD128"]
                    .reduce((flags, name) => flags | binaryen.Features[name], 0);
                binaryen.setOptimizeLevel(2);
                binaryen.setShrinkLevel(2);
                binaryen.setDebugInfo(false);
                for (let [name, asset] of Object.entries(assets)) {
                    if (!name.endsWith(".wasm")) {
                        continue;
                    }
                    let original = Buffer.from(asset.source());
                    let key = crypto.createHash("sha256").update(original).digest("hex");
                    let cached = this.cache.get(name);
                    if (cached?.key === key) {
                        compilation.updateAsset(name, new compiler.webpack.sources.RawSource(cached.bytes));
                        continue;
                    }
                    let module = binaryen.readBinary(original);
                    try {
                        module.setFeatures(features);
                        if (!module.validate()) {
                            throw new Error("Unsupported WASM features: " + name);
                        }
                        module.optimize();
                        let optimized = Buffer.from(module.emitBinary());
                        let before = new WebAssembly.Module(original);
                        let after = new WebAssembly.Module(optimized);
                        for (let contract of ["imports", "exports"]) {
                            if (JSON.stringify(WebAssembly.Module[contract](before).map(item => JSON.stringify(item)).sort()) !==
                                JSON.stringify(WebAssembly.Module[contract](after).map(item => JSON.stringify(item)).sort())) {
                                throw new Error("WASM contract changed: " + name + " / " + contract);
                            }
                        }
                        let bytes = optimized.length < original.length ? optimized : original;
                        this.cache.set(name, {key, bytes});
                        compilation.updateAsset(name, new compiler.webpack.sources.RawSource(bytes));
                    } finally {
                        module.dispose();
                    }
                }
            });
        });
    }
}

module.exports = OptimizeWasmPlugin;
