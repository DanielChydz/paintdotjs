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

test("Windows system settings links are disabled outside the Windows desktop", () => {
    for (let platform of ["linux", "darwin", "freebsd", "win32", null]) {
        let buttons = [];
        let opened = [];
        let globals = {
            isApp: platform !== null,
            AppSettingsStore: {apply() {}, watchSystemColorScheme() {}},
            window: {
                addEventListener() {},
                open: (...args) => opened.push(args)
            }
        };
        if (platform !== null) {
            globals.process = {platform};
        }
        let context = vm.createContext(globals);
        let filename = path.resolve(__dirname, "../js/src/interface/window/dialog/SettingsDialog.js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
        let settings = vm.runInContext("new SettingsDialog()", context);
        for (let method of ["addHeading", "addCheckbox", "addNote", "addSectionHeading"]) {
            settings[method] = () => {};
        }
        settings.addButton = (label, callback, options) => buttons.push({label, callback, ...options});
        settings.renderPen();
        settings.renderColorManagement();
        assert.equal(buttons.length, 2);
        for (let button of buttons) {
            assert.equal(button.disabled, platform !== "win32", `${platform}: ${button.label}`);
            assert.equal(button.tooltip, "Available in the Windows desktop app");
            if (!button.disabled) {
                button.callback();
            }
        }
        assert.deepEqual(opened, platform === "win32" ? [
            ["ms-settings:pen", "_blank", "noopener"],
            ["ms-settings:display", "_blank", "noopener"]
        ] : []);
    }
});
