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
const FirefoxSession = require("./browser/FirefoxSession");
const FirefoxFileClipboardChecks = require("./browser/FirefoxFileClipboardChecks");
const WebRuntimeServer = require("../tests/browser/WebRuntimeServer");

async function testFirefox() {
    let root = path.resolve(__dirname, "..");
    let server = new WebRuntimeServer(root, "127.0.0.1");
    let pwa = new WebRuntimeServer(root);
    let production = new WebRuntimeServer(path.join(root, "pages-dist"), "127.0.0.2", false);
    let firefox = new FirefoxSession();
    try {
        await server.start();
        await pwa.start();
        await production.start();
        await firefox.open();
        console.log("Testing real Firefox " + firefox.capabilities.browserVersion);
        await firefox.navigate(server.origin + "/?skipWelcome");
        console.log("Capabilities: " + JSON.stringify(await firefox.evaluate(`({
            secure: isSecureContext, openPicker: typeof showOpenFilePicker, savePicker: typeof showSaveFilePicker,
            clipboardRead: typeof navigator.clipboard?.read, clipboardWrite: typeof navigator.clipboard?.write,
            webgl: !!document.createElement('canvas').getContext('webgl2')
        })`)));
        for (let name of ["checkFirefoxCompatibility", "checkOpenAssets", "checkExportOptions", "checkModernCodecs",
            "checkColorProfilesPdn", "checkLargeDocumentsJpegXr", "checkPainting", "checkPixelTools",
            "checkLayerActions", "checkTransformTools", "checkCameraCapture"]) {
            let scenario = require("../tests/runtime/" + name + ".js");
            await firefox.evaluate("(" + scenario.toString() + ")().then(()=>true)");
            console.log("Firefox check passed: " + name);
        }
        let native = new FirefoxFileClipboardChecks(firefox);
        await native.checkFiles();
        console.log("Firefox check passed: real file inputs, downloads and PDN reopen");
        await native.checkClipboard();
        console.log("Firefox check passed: trusted Ctrl+C/Ctrl+V and native text/image clipboard");
        await firefox.evaluate(`
            window.firefoxStoredFile=File.of('firefox-test','persistent.bin');
            window.firefoxStoredFile.write(new Uint8Array([0,42,255]));
        `);
        await firefox.evaluate("Promise.all(app.getDocumentWorkspaces().map(workspace=>workspace.setDirty(false)))");
        await firefox.navigate(server.origin + "/?skipWelcome");
        let persisted = await firefox.evaluate("File.of('firefox-test','persistent.bin').read().then(bytes=>[...bytes])");
        if (JSON.stringify(persisted) !== "[0,42,255]") {
            throw new Error("Firefox IndexedDB did not survive a page reload");
        }
        console.log("Firefox check passed: IndexedDB persistence across reload");
        await firefox.evaluate("app.getDocumentWorkspaces().forEach(workspace=>workspace.setDirty(false))");
        await firefox.navigate(pwa.origin + "/?skipWelcome");
        // The fixture advertises version 9.x, so dismiss any initial update
        // offer before the shared install/later/unsaved-work update scenario.
        await firefox.evaluate(`navigator.serviceWorker.ready.then(async()=>{
            await new Promise(resolve=>setTimeout(resolve,300));
            document.querySelector('.update-prompt-dialog .task-dialog-choice')?.click();
        })`);
        let browser = require("../tests/runtime/checkBrowser.js");
        await firefox.evaluate("(" + browser.toString() + ")().then(()=>true)");
        console.log("Firefox check passed: PWA worker update, cancellation and unsaved work");
        console.log("Firefox: installing production offline cache");
        await firefox.navigate(production.origin + "/");
        await firefox.evaluate("localStorage.setItem('paintdotjs.welcome.dismissed','true');document.querySelector('.project-info-primary-button')?.click()");
        await firefox.waitFor("navigator.serviceWorker.getRegistration().then(registration=>!!registration?.active)");
        await firefox.navigate(production.origin + "/");
        await firefox.waitFor("navigator.serviceWorker.controller!==null");
        console.log("Firefox: disconnecting production server");
        production.server.closeAllConnections();
        await new Promise(resolve => production.server.close(resolve));
        await firefox.navigate(production.origin + "/");
        let offline = await firefox.evaluate(`(async()=>{
            let pixels=new ImageData(new Uint8ClampedArray([230,30,50,255]),1,1);
            let encoded=await window.portableImageCodec.encodePixels(pixels,'jxr',100);
            let decoded=await window.portableImageCodec.decode(encoded,'jxr');
            return decoded.rgba[0]===230 && decoded.rgba[3]===255;
        })()`);
        if (!offline) {
            throw new Error("Production PWA could not reopen and load WASM offline");
        }
        console.log("Firefox check passed: production Workbox offline reload and lazy WASM codec");
        let screenshot = await firefox.request("GET", "/screenshot");
        let report = process.env.PAINTJS_FIREFOX_REPORT || path.join(root, ".tmp/firefox-report");
        await fs.mkdir(report, {recursive: true});
        await fs.writeFile(path.join(report, "firefox.png"), Buffer.from(screenshot, "base64"));
        await fs.writeFile(path.join(report, "capabilities.json"), JSON.stringify(firefox.capabilities, null, 2));
        console.log("Firefox regression checks passed");
    } finally {
        if (process.env.PAINTJS_FIREFOX_REPORT) {
            await fs.mkdir(process.env.PAINTJS_FIREFOX_REPORT, {recursive: true});
            await fs.writeFile(path.join(process.env.PAINTJS_FIREFOX_REPORT, "geckodriver.log"), firefox.logs || "");
        }
        await firefox.close();
        for (let fixture of [server, pwa, production]) {
            fixture.server.closeAllConnections();
        }
        await Promise.all([new Promise(resolve => server.server.close(resolve)),
            new Promise(resolve => pwa.server.close(resolve)),
            new Promise(resolve => production.server.close(resolve))]);
    }
}

testFirefox().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
