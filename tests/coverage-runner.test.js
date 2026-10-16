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
const {test} = require("node:test");

test("coverage runner reports uncovered branch locations without hiding missing runtime files", () => {
    let root = path.resolve(__dirname, "..");
    let filename = path.join(root, "js/fixture.js");
    let report = {[filename]: {b: {0: [0, 1]}, branchMap: {0: {locations: [
        {start: {line: 12, column: 4}}, {start: {line: 16, column: 0}}
    ]}}}};
    let config = {include: ["js/fixture.js"]};
    let errors = [];
    let commands = [];
    let load = name => {
        if (name === "node:fs") {
            return {
                readdirSync: () => ["fixture.test.js"],
                readFileSync: name => JSON.stringify(name.endsWith(".c8rc.json") ? config : report)
            };
        }
        if (name === "node:child_process") {
            return {execFileSync: (...args) => commands.push(args)};
        }
        return require(name);
    };
    load.resolve = require.resolve;
    let run = () => vm.runInNewContext(fs.readFileSync(path.join(root, "scripts/test_coverage.js"), "utf8"), {
        require: load, __dirname: path.join(root, "scripts"), process,
        console: {log() {}, error: message => errors.push(message)}
    });
    run();
    assert.equal(commands.length, 3);
    assert.deepEqual(errors, ["Uncovered branch: js/fixture.js:12:5"]);
    config.include.push("js/missing.js");
    assert.throws(run, /Runtime files missing from coverage:[\s\S]*js\/missing\.js/);
});
