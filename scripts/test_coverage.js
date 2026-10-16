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
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const options = {cwd: root, stdio: "inherit"};

execFileSync(process.execPath, [path.join(root, "scripts/check_assets.js")], options);
execFileSync(process.execPath, [
    require.resolve("webpack-cli/bin/cli.js"),
    "--config", "webpack.config.js", "--devtool", "source-map"
], {...options, env: {...process.env, PAINTDOTJS_COVERAGE: "1"}});

let tests = fs.readdirSync(path.join(root, "tests"))
    .filter(filename => /\.test\.(?:c?js)$/.test(filename))
    .sort()
    .map(filename => path.join(root, "tests", filename));
if (tests.length === 0) {
    throw new Error("No runtime tests found.");
}
execFileSync(process.execPath, [
    require.resolve("c8/bin/c8.js"), process.execPath, "--test", ...tests
], options);

let report = JSON.parse(fs.readFileSync(path.join(root, "coverage/coverage-final.json"), "utf8"));
let config = JSON.parse(fs.readFileSync(path.join(root, ".c8rc.json"), "utf8"));
let expected = [];
for (let pattern of config.include) {
    if (pattern.endsWith("/**/*.js")) {
        let directory = path.join(root, pattern.slice(0, -8));
        for (let entry of fs.readdirSync(directory, {recursive: true, withFileTypes: true})) {
            if (entry.isFile() && entry.name.endsWith(".js")) {
                expected.push(path.join(entry.parentPath, entry.name));
            }
        }
    } else if (!pattern.includes("*")) {
        expected.push(path.join(root, pattern));
    } else {
        throw new Error(`Unsupported runtime coverage pattern: ${pattern}`);
    }
}
let missing = expected.filter(filename => report[filename] === undefined);
if (missing.length > 0) {
    throw new Error(`Runtime files missing from coverage:\n${missing.join("\n")}`);
}
console.log(`Verified coverage includes all ${expected.length} runtime source files.`);

for (let [filename, coverage] of Object.entries(report)) {
    for (let [id, hits] of Object.entries(coverage.b)) {
        for (let [index, count] of hits.entries()) {
            if (count === 0) {
                let location = coverage.branchMap[id].locations[index];
                console.error(`Uncovered branch: ${path.relative(root, filename)}:${location.start.line}:${location.start.column + 1}`);
            }
        }
    }
}
