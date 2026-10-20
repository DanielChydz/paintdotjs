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
const {spawn} = require("node:child_process");
const {setTimeout: delay} = require("node:timers/promises");

class FirefoxSession {
    async open() {
        this.directory = await fs.mkdtemp(path.join(os.tmpdir(), "paintjs-firefox-"));
        this.downloads = path.join(this.directory, "downloads");
        await fs.mkdir(this.downloads);
        this.logs = "";
        this.driver = spawn(process.env.GECKODRIVER || "geckodriver", [
            "--host", "127.0.0.1", "--port", "0", "--profile-root", this.directory
        ], {stdio: ["ignore", "pipe", "pipe"],
            env: {...process.env, MOZ_ENABLE_WAYLAND: "0", GDK_BACKEND: "x11", WAYLAND_DISPLAY: ""}});
        this.driver.on("error", error => { this.startError = error; });
        for (let stream of [this.driver.stdout, this.driver.stderr]) {
            stream.on("data", data => { this.logs = (this.logs + data).slice(-32768); });
        }
        let deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            let match = this.logs.match(/Listening on 127\.0\.0\.1:(\d+)/);
            if (match !== null) {
                this.origin = "http://127.0.0.1:" + match[1];
                break;
            }
            if (this.startError || this.driver.exitCode !== null) {
                throw new Error("Could not start geckodriver: " + (this.startError || this.logs));
            }
            await delay(50);
        }
        if (!this.origin) {
            throw new Error("Timed out starting geckodriver: " + this.logs);
        }
        let firefox = {args: process.env.PAINTJS_FIREFOX_HEADLESS === "1" ? ["-headless"] : [], prefs: {
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
            "browser.download.folderList": 2,
            "browser.download.dir": this.downloads,
            "browser.download.useDownloadDir": true,
            "browser.download.always_ask_before_handling_new_types": false,
            "browser.helperApps.neverAsk.saveToDisk": "image/png,image/jpeg,image/tiff,application/octet-stream",
            "browser.download.start_downloads_in_tmp_dir": false
        }};
        if (process.env.FIREFOX_BINARY) {
            firefox.binary = process.env.FIREFOX_BINARY;
        }
        let session = await this.command("POST", "/session", {capabilities: {alwaysMatch: {
            browserName: "firefox", "moz:firefoxOptions": firefox
        }}});
        this.sessionId = session.sessionId;
        this.capabilities = session.capabilities;
        await this.request("POST", "/timeouts", {script: 90000, pageLoad: 60000});
        await this.request("POST", "/window/rect", {width: 1440, height: 1000});
    }

    async command(method, endpoint, data) {
        let response = await fetch(this.origin + endpoint, {
            method, headers: {"Content-Type": "application/json"},
            body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(100000)
        });
        let result = await response.json();
        if (!response.ok) {
            throw new Error("WebDriver " + endpoint + ": " + result.value.message);
        }
        return result.value;
    }

    request(method, endpoint, data) {
        return this.command(method, "/session/" + this.sessionId + endpoint, data);
    }

    async evaluate(source) {
        let result = await this.request("POST", "/execute/async", {
            script: "let done=arguments[arguments.length-1];"
                + "Promise.resolve().then(()=>window.eval(arguments[0]))"
                + ".then(value=>done({ok:true,value}),error=>done({ok:false,message:error.message,stack:error.stack}));",
            args: [source]
        });
        if (!result.ok) {
            throw new Error(result.message + "\n" + result.stack);
        }
        return result.value;
    }

    async navigate(url) {
        await this.request("POST", "/url", {url});
        await this.waitFor("typeof window.paintDotJsReady !== 'undefined'");
        await this.evaluate("window.paintDotJsReady.then(()=>{if(!window.app){throw new Error('Application did not start');}})");
    }

    async waitFor(expression) {
        let deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (await this.evaluate(expression)) {
                return;
            }
            await delay(50);
        }
        throw new Error("Timed out waiting for: " + expression);
    }

    async find(selector) {
        let element = await this.request("POST", "/element", {using: "css selector", value: selector});
        return element["element-6066-11e4-a52e-4f735466cecf"];
    }

    async chord(key, modifiers = ["\uE009"]) {
        let actions = modifiers.map(value => ({type: "keyDown", value}));
        actions.push({type: "keyDown", value: key}, {type: "keyUp", value: key});
        for (let value of [...modifiers].reverse()) {
            actions.push({type: "keyUp", value});
        }
        await this.request("POST", "/actions", {actions: [{type: "key", id: "keyboard", actions}]});
        await this.request("DELETE", "/actions");
    }

    async close() {
        try {
            if (this.sessionId) {
                await this.request("DELETE", "");
            }
        } finally {
            if (this.driver) {
                if (this.driver.exitCode === null) {
                    this.driver.kill();
                    await new Promise(resolve => {
                        this.driver.once("exit", resolve);
                        setTimeout(resolve, 2000).unref();
                    });
                }
                await delay(100);
            }
            if (this.directory) {
                await fs.rm(this.directory, {recursive: true, force: true});
            }
        }
    }
}

module.exports = FirefoxSession;
