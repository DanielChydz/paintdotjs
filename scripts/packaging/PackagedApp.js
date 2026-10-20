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
const path = require("node:path");
const {spawn} = require("node:child_process");
const {setTimeout: delay} = require("node:timers/promises");

class PackagedApp {
    constructor(executable, profile) {
        this.executable = executable;
        this.profile = profile;
        this.pending = new Map();
        this.sequence = 0;
        this.logs = "";
    }

    async open() {
        this.process = spawn("xvfb-run", ["-a", this.executable, "--ozone-platform=x11",
            "--user-data-dir=" + this.profile, "--remote-debugging-port=0"],
        {detached: true, stdio: ["ignore", "pipe", "pipe"],
            env: {...process.env, XDG_CONFIG_HOME: path.join(this.profile, "config"),
                XDG_CACHE_HOME: path.join(this.profile, "cache")}});
        this.process.on("error", error => { this.startError = error; });
        for (let stream of [this.process.stdout, this.process.stderr]) {
            stream.on("data", data => { this.logs = (this.logs + data).slice(-65536); });
        }
        let deadline = Date.now() + 60000;
        let page;
        while (Date.now() < deadline) {
            if (this.startError || (this.process.exitCode !== null || this.process.signalCode !== null)) {
                throw new Error("Packaged application did not start: " + this.logs, {cause: this.startError});
            }
            try {
                let port = (await fs.readFile(path.join(this.profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
                let pages = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
                page = pages.find(item => item.type === "page" && item.url.startsWith("paintjs:"));
            } catch {
                // Chromium has not yet written its debugging endpoint.
            }
            if (page) {
                break;
            }
            await delay(100);
        }
        if (!page) {
            throw new Error("Packaged application timed out: " + this.logs);
        }
        this.socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            this.socket.addEventListener("open", resolve, {once: true});
            this.socket.addEventListener("error", reject, {once: true});
        });
        this.socket.addEventListener("message", event => {
            let message = JSON.parse(event.data);
            let pending = this.pending.get(message.id);
            if (pending) {
                this.pending.delete(message.id);
                pending.resolve(message);
            }
        });
        this.socket.addEventListener("close", () => {
            for (let pending of this.pending.values()) {
                pending.reject(new Error("Packaged renderer disconnected: " + this.logs));
            }
            this.pending.clear();
        });
        // First-run asset initialization can reload the page after CDP connects.
        // Retry only the readiness probe; never replay a scenario after an error.
        let packaged;
        while (true) {
            try {
                packaged = await this.evaluate(`(async () => {
                    while (window.paintDotJsReady === undefined) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    await window.paintDotJsReady;
                    return require('electron').ipcRenderer !== undefined && isApp;
                })()`);
                break;
            } catch (error) {
                if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message)
                    || Date.now() >= deadline) {
                    throw error;
                }
                await delay(100);
            }
        }
        if (!packaged) {
            throw new Error("Wrong application platform");
        }
    }

    async evaluate(expression) {
        let id = ++this.sequence;
        let timer;
        try {
            let response = await new Promise((resolve, reject) => {
                this.pending.set(id, {resolve, reject});
                timer = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error("Packaged check timed out: " + this.logs));
                }, 60000);
                this.socket.send(JSON.stringify({id, method: "Runtime.evaluate",
                    params: {expression, awaitPromise: true, returnByValue: true}}));
            });
            if (response.error || response.result.exceptionDetails) {
                throw new Error(JSON.stringify(response.error || response.result.exceptionDetails));
            }
            return response.result.result.value;
        } finally {
            clearTimeout(timer);
        }
    }

    async close() {
        this.socket?.close();
        if (this.process?.pid) {
            try {
                process.kill(-this.process.pid, "SIGTERM");
            } catch (error) {
                if (error.code !== "ESRCH") {
                    throw error;
                }
            }
            if (this.process.exitCode === null && this.process.signalCode === null) {
                await new Promise(resolve => this.process.once("exit", resolve));
            }
        }
    }
}

module.exports = PackagedApp;
