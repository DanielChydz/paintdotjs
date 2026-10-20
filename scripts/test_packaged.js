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

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const PackagedApp = require("./packaging/PackagedApp");

async function testPackaged() {
    let profile = await fs.mkdtemp(path.join(os.tmpdir(), "paintjs-packaged-"));
    let executable = path.resolve(process.argv[2] || "dist/linux-unpacked/paintdotjs");
    let application = new PackagedApp(executable, profile);
    try {
        await application.open();
        for (let scenario of ["checkOpenAssets", "checkModernCodecs", "checkUpstreamFeatures", "checkPainting", "checkFirstBatchFeatures"]) {
            let run = require("../tests/runtime/" + scenario + ".js");
            // Archive creation is fixture tooling; the app only needs its bundled reader.
            let source = run.toString().replace('require("fflate")',
                "require(" + JSON.stringify(require.resolve("fflate")) + ")");
            let args = scenario === "checkOpenAssets"
                ? 'JSON.parse(require("node:fs").readFileSync(require("node:path").join(process.resourcesPath, "desktop/asset-manifest.json"), "utf8"))'
                : "";
            await application.evaluate("(" + source + ")(" + args + ").then(() => true)");
            console.log("Packaged check passed: " + scenario);
        }
    } finally {
        await application.close();
        await fs.rm(profile, {recursive: true, force: true});
    }
}

testPackaged().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
