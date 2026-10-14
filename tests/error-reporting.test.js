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
const {EventEmitter} = require("node:events");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

test("global error reporting installs once, preserves console diagnostics and captures rejection/message events", () => {
    let window = new EventEmitter();
    window.addEventListener = window.on;
    let diagnostics = [];
    let reports = [];
    let console = {error: (...args) => diagnostics.push(args)};
    let context = vm.createContext({window, console, Error, Form: function () {}});
    let filename = path.resolve(__dirname, "../js/src/interface/window/form/ErrorForm.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    filename = path.resolve(__dirname, "../js/src/engine/AppView.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let ErrorForm = vm.runInContext("ErrorForm", context);
    let applicationView = Object.create(vm.runInContext("AppView.prototype", context));
    ErrorForm.show = report => reports.push(report);
    let early = new Error("Before installation");
    applicationView.handleError(early);
    assert.equal(reports[0].source, "Application error");
    assert.equal(reports[0].message, early.message);
    assert.equal(diagnostics.length, 0);
    ErrorForm.install();
    let wrappedConsole = console.error;
    ErrorForm.install();
    assert.equal(console.error, wrappedConsole);
    assert.equal(window.listenerCount("error"), 1);
    assert.equal(window.listenerCount("unhandledrejection"), 1);
    let failure = new Error("Console detail");
    console.error("Operation failed", failure);
    assert.deepEqual(diagnostics.at(-1), ["Operation failed", failure]);
    assert.equal(reports.at(-1).source, "Console error");
    assert.equal(reports.at(-1).message, "Operation failed Console detail");
    assert.equal(reports.at(-1).stack, failure.stack);
    for (let error of [failure, null]) {
        let prevented = false;
        window.emit("error", {error, message: "Message without Error", preventDefault: () => prevented = true});
        assert.equal(prevented, true);
        assert.equal(reports.at(-1).source, "Uncaught error");
        assert.equal(reports.at(-1).message, error === null ? "Message without Error" : failure.message);
    }
    let prevented = false;
    window.emit("unhandledrejection", {reason: failure, preventDefault: () => prevented = true});
    assert.equal(prevented, true);
    assert.equal(reports.at(-1).source, "Unhandled promise rejection");
    assert.equal(reports.at(-1).message, failure.message);
    assert.equal(diagnostics.at(-1)[0], failure);
});
