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
const {pathToFileURL} = require("node:url");

class DesktopCoverageCollector {

    constructor(contents, directory, root, expectWorkers = true) {
        this.contents = contents;
        this.directory = directory;
        this.root = root;
        this.sessions = new Map();
        this.sequence = 0;
        this.workerScripts = 0;
        this.expectWorkers = expectWorkers;
        this.error = null;
        contents.debugger.on("message", (_event, method, params) => {
            if (method === "Target.attachedToTarget" && params.targetInfo.type === "worker") {
                let session = {id: params.sessionId, url: params.targetInfo.url};
                session.ready = this.startWorker(session.id).catch(error => {
                    this.error = error;
                    console.error("Worker coverage setup failed", error);
                });
                this.sessions.set(session.id, session);
            } else if (method === "Target.detachedFromTarget") {
                this.sessions.delete(params.sessionId);
            }
        });
    }

    async start() {
        this.contents.debugger.attach("1.3");
        await this.command("Profiler.enable");
        await this.command("Profiler.startPreciseCoverage", {callCount: true, detailed: true});
        await this.command("Target.setAutoAttach", {
            autoAttach: true, waitForDebuggerOnStart: true, flatten: true
        });
    }

    command(method, params = {}, sessionId = undefined) {
        return this.contents.debugger.sendCommand(method, params, sessionId);
    }

    async startWorker(sessionId) {
        await this.command("Debugger.enable", {}, sessionId);
        await this.command("Profiler.enable", {}, sessionId);
        await this.command("Profiler.startPreciseCoverage", {callCount: true, detailed: true}, sessionId);
        await this.command("Runtime.runIfWaitingForDebugger", {}, sessionId);
    }

    installWorkerHook() {
        return this.contents.executeJavaScript("(" + (function () {
            let OriginalWorker = window.Worker;
            window.Worker = new Proxy(OriginalWorker, {
                construct(target, args) {
                    let worker = Reflect.construct(target, args);
                    let terminate = worker.terminate.bind(worker);
                    worker.terminate = () => {
                        let error = require("electron").ipcRenderer.sendSync(
                            "paintdotjs:test-worker-coverage", String(args[0]));
                        if (error !== null) {
                            throw new Error(error);
                        }
                        terminate();
                    };
                    return worker;
                }
            });
        }).toString() + ")()");
    }

    write(result) {
        fs.mkdirSync(this.directory, {recursive: true});
        let filename = `coverage-renderer-${process.pid}-${this.contents.id}-${this.sequence++}.json`;
        fs.writeFileSync(path.join(this.directory, filename), JSON.stringify({result}));
    }

    async captureWorkers(url) {
        for (let session of this.sessions.values()) {
            if (session.url !== url) {
                continue;
            }
            await session.ready;
            if (this.error !== null) {
                throw this.error;
            }
            let coverage = await this.command("Profiler.takePreciseCoverage", {}, session.id);
            for (let script of coverage.result) {
                if (!script.url.startsWith("blob:")) {
                    continue;
                }
                let {scriptSource} = await this.command("Debugger.getScriptSource", {
                    scriptId: script.scriptId
                }, session.id);
                let filename = path.join(this.root, "js/src/engine/document/effect/BitmapEffectEngine.js");
                let original = fs.readFileSync(filename, "utf8");
                let start = original.indexOf("class BitmapEffectEngine");
                let engine = original.slice(start).trim();
                let workerStart = scriptSource.indexOf(engine);
                if (workerStart === -1) {
                    throw new Error("Cannot map worker coverage to the original effect engine.");
                }
                let workerEnd = workerStart + engine.length;
                let functions = [];
                for (let fn of script.functions) {
                    let root = fn.ranges[0];
                    if (root.startOffset === 0 && root.endOffset === scriptSource.length) {
                        functions.push({...fn, ranges: [{
                            startOffset: 0, endOffset: original.length, count: root.count
                        }]});
                    } else if (root.startOffset >= workerStart && root.endOffset <= workerEnd) {
                        functions.push({...fn, ranges: fn.ranges.map(range => ({
                            ...range,
                            startOffset: range.startOffset - workerStart + start,
                            endOffset: range.endOffset - workerStart + start
                        }))});
                    }
                }
                this.write([{...script, url: pathToFileURL(filename).href, functions}]);
                ++this.workerScripts;
            }
        }
    }

    async finish() {
        if (this.error !== null) {
            throw this.error;
        }
        if (this.expectWorkers && this.workerScripts === 0) {
            throw new Error("No effect worker coverage was collected.");
        }
        let coverage = await this.command("Profiler.takePreciseCoverage");
        let scripts = [];
        for (let script of coverage.result) {
            if (!script.url.startsWith("paintjs://app/")) {
                continue;
            }
            let pathname = decodeURIComponent(new URL(script.url).pathname);
            scripts.push({...script, url: pathToFileURL(path.join(this.root, pathname)).href});
        }
        this.write(scripts);
        await this.command("Profiler.stopPreciseCoverage");
        this.contents.debugger.detach();
    }
}

module.exports = DesktopCoverageCollector;
