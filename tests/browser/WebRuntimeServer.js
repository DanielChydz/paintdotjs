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
const http = require("node:http");
const path = require("node:path");

class WebRuntimeServer {
    constructor(root, host = "127.0.0.2", fixtures = true) {
        this.root = root;
        this.host = host;
        this.fixtures = fixtures;
        this.origin = null;
        this.workerVersion = 1;
        this.server = http.createServer((request, response) => {
            void this.handleRequest(request, response);
        });
    }

    async start() {
        await new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(0, this.host, resolve);
        });
        this.origin = "http://" + this.host + ":" + this.server.address().port;
        return this.origin;
    }

    async handleRequest(request, response) {
        try {
            let relative = decodeURIComponent(new URL(request.url, this.origin).pathname).slice(1);
            if (this.fixtures && relative === "__test__/update" && request.method === "POST") {
                ++this.workerVersion;
                response.writeHead(200).end();
                return;
            }
            if (this.fixtures && relative === "assets/update.json") {
                response.writeHead(200, {"Content-Type": "application/json", "Cache-Control": "no-store"})
                    .end(JSON.stringify({version: "9.0." + this.workerVersion}));
                return;
            }
            if (this.fixtures && relative === "service_worker.js") {
                response.writeHead(200, {"Content-Type": "text/javascript", "Cache-Control": "no-store",
                    "Service-Worker-Allowed": "/"})
                    .end("self.testVersion=" + this.workerVersion + ";"
                        + "self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));"
                        + "self.addEventListener('message',event=>{"
                        + "if(event.data.type==='SKIP_WAITING'){self.skipWaiting();}"
                        + "if(event.data.type==='GET_VERSION'){event.ports[0].postMessage(self.testVersion);}"
                        + "});");
                return;
            }
            let file = path.resolve(this.root, relative || "index.html");
            let allowed = relative === "" || relative === "index.html"
                || relative === "desktop-resources/asset-manifest.json"
                || relative === "run/test.png" || relative === "service_worker.js" || /^workbox-[a-f0-9]+\.js$/.test(relative)
                || /^(?:js|css|lib|assets|build\/web)\//.test(relative);
            if (!allowed || !file.startsWith(this.root + path.sep)) {
                response.writeHead(403).end();
                return;
            }
            let data = await fs.readFile(file);
            let mime = {
                ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
                ".wasm": "application/wasm", ".ttf": "font/ttf", ".woff2": "font/woff2"
            }[path.extname(file)] || "application/octet-stream";
            response.writeHead(200, {"Content-Type": mime, "Cache-Control": "no-store"}).end(data);
        } catch (error) {
            if (error.code === "ENOENT" || error.code === "EISDIR") {
                response.writeHead(404).end();
            } else {
                console.error("Browser fixture request failed", error);
                response.writeHead(500).end();
            }
        }
    }
}

module.exports = WebRuntimeServer;
