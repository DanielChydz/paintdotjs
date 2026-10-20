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

const path = require("node:path");
const root = path.resolve(__dirname, "..");
const desktopScenarios = [
    {name: "recent files, plugin help, busy operations and history failure recovery", file: "checkFirstBatchFeatures.js"},
    {name: "browser recent file handles persist and retain permissions", file: "checkFirstBatchFeaturesBrowser.js", browser: true},
    {name: "extension tool integration preserves text erase, tiny-canvas handles and nested menus", file: "checkExtensionTools.js"},
    {name: "plugin file formats integrate with document opening and native save previews", file: "checkPluginFiles.js"},
    {name: "extension settings, local catalog, import failures and keyboard focus behave correctly", file: "checkExtensionSettings.js"},
    {name: "plugin rendering, configuration, file types, workers and menus obey native contracts", file: "checkPluginContracts.js"},
    {name: "custom XAML geometries, native bounds and shape persistence obey their contracts", file: "checkExtensionGeometry.js"},
    {name: "upstream plugins, custom XAML shapes and ZIP icon packs integrate with the fork", file: "checkUpstreamFeatures.js"},
    {name: "desktop bundled open icons, font, licenses and independent branding", file: "checkOpenAssetsDesktop.js"},
    {name: "browser bundled open icons, font, licenses and independent branding", file: "checkOpenAssets.js", browser: true},
    {name: "desktop workspace lifecycle, close confirmation and contextual routing", file: "checkWorkspaceLifecycle.js"},
    {name: "desktop UI lifecycle, optional icons and modal guards", file: "checkUILifecycle.js"},
    {name: "desktop codecs, layer-name safety, document cleanup and worker cancellation", file: ""},
    {name: "desktop dialog submission, cancellation, effects and persistent settings", file: "checkDialogs.js"},
    {name: "desktop document import, image codecs, transformations and undo/redo", file: "checkDocumentIO.js"},
    {name: "desktop HEIC and JPEG XR saving preserves alpha, quality and odd dimensions", file: "checkModernCodecs.js"},
    {name: "browser HEIC and JPEG XR saving works without native dependencies", file: "checkModernCodecs.js", browser: true},
    {name: "desktop painting, shapes, selections, text, history and deferred scrolling", file: "checkPainting.js"},
    {name: "desktop pixel movement, resampling, flood fill, cloning and recoloring", file: "checkPixelTools.js"},
    {name: "desktop WebGL resampling matches the CPU reference", file: "checkGpu.js",
        extraArgs: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]},
    {name: "desktop save previews, native file writing, clipboard and close confirmation", file: "checkSavingClipboard.js"},
    {name: "desktop color palettes, font storage, dropdown navigation and error recovery", file: "checkControls.js"},
    {name: "desktop native pointer routing, interrupted strokes, viewport and transform controls", file: "checkPointerRouting.js"},
    {name: "desktop file import, resizing, paste overflow and save-all workflows", file: "checkFileWorkflows.js"},
    {name: "desktop settings mutations, shortcuts, font management and update outcomes", file: "checkSettingsControls.js"},
    {name: "desktop effect sliders, curves, levels and native rotation/pan controls", file: "checkEffectControls.js"},
    {name: "desktop transform handles, selection history, color sampling and zoom tools", file: "checkTransformTools.js"},
    {name: "desktop geometry set operations, viewport caches, number inputs and scroll reordering", file: "checkGeometryLayout.js"},
    {name: "desktop layer commands, selection fill/inversion and reversible history functions", file: "checkLayerActions.js"},
    {name: "desktop text caret, paste protection, keyboard commands and gradient shader oracles", file: "checkTextGradient.js",
        extraArgs: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]},
    {name: "desktop document strip, context commands, menu lifecycle and movable dialog bounds", file: "checkDocumentChrome.js"},
    {name: "desktop surfaces, blend modes, hatch patterns and sparse bitmap transaction restoration", file: "checkSurfaceTransactions.js"},
    {name: "desktop pending shape edits and selection combination/origin history", file: "checkPendingSelections.js",
        extraArgs: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]},
    {name: "desktop pixel Move scaling, rotation and toolbar finishing", file: "checkMoveModes.js"},
    {name: "desktop brush interruption, selection clipping and frame presentation", file: "checkBrushContracts.js"},
    {name: "desktop document invariants, scratch ownership and selection transforms", file: "checkDocumentContracts.js"},
    {name: "desktop toolbar option mutations and resizable floating-window state", file: "checkToolbarWindows.js"},
    {name: "browser runtime without Node integration and real PWA updates", file: "checkBrowser.js", browser: true}
];

async function checkDesktop() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let counts = () => ["document:update_viewport", "document:invalidated"]
        .map(event => app.listeners[event].length);
    let baseline = counts();
    let codecCanvas = document.createElement("canvas");
    codecCanvas.width = 3;
    codecCanvas.height = 2;
    let codecContext = codecCanvas.getContext("2d");
    codecContext.fillStyle = "rgb(32, 96, 192)";
    codecContext.fillRect(0, 0, 3, 2);
    let png = new Uint8Array(await (await new Promise(resolve => codecCanvas.toBlob(resolve))).arrayBuffer());
    let blurred = BitmapEffectEngine.gaussianBlur(codecContext.getImageData(0, 0, 3, 2), 3, 2, 3);
    check(blurred.data.every((value, index) => value === [32, 96, 192, 255][index % 4]),
        "Native Gaussian blur changed a constant opaque image");
    let codecPixels = codecContext.getImageData(0, 0, 3, 2);
    for (let tiling of ["transparent", "wrap", "mirror"]) {
        for (let sampling of ["linear", "point"]) {
            let definition = BitmapEffectEngine.ROTATE_ZOOM;
            let values = {...BitmapEffectEngine.defaults(definition), tiling, sampling};
            let identity = BitmapEffectEngine.apply(codecPixels, 3, 2, definition, values);
            check(identity.data.every((value, index) => value === codecPixels.data[index]),
                "Neutral rotate/zoom changed pixels");
            let translated = BitmapEffectEngine.apply(codecPixels, 3, 2, definition, {...values, panX: 20});
            check(translated.data.every((value, index) =>
                value === (tiling === "transparent" ? 0 : codecPixels.data[index])),
            "Rotate/zoom did not honor its tiling mode");
        }
    }
    let selection = new Selection();
    try {
        selection.setContinuation(new Rectangle(0, 0, 1, 2), CombineMode.REPLACE);
        let mask = BitmapEffectEngine.createSelectionMask(3, 2, selection);
        check(mask.every((value, index) => value === (index % 3 === 0 ? 255 : 0)),
            "Rectangular selection mask has incorrect coverage");
        selection.setContinuation(new Rectangle(0, 0, 3, 2), CombineMode.REPLACE);
        check(BitmapEffectEngine.createSelectionMask(3, 2, selection) === null,
            "Full selection did not use the unmasked fast path");
    } finally {
        selection.data.dispose();
    }
    for (let format of ["png", "avif"]) {
        let encoded = await window.portableImageCodec.encode(png, format, 100);
        let decoded = await window.portableImageCodec.decode(encoded, format);
        check(decoded.width === 3 && decoded.height === 2 && decoded.rgba.length === 24, "Codec dimensions differ");
        for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
            check(decoded.rgba[offset + 3] === 255, "Codec lost opaque alpha");
            if (format === "png") {
                check(decoded.rgba[offset] === 32 && decoded.rgba[offset + 1] === 96
                    && decoded.rgba[offset + 2] === 192, "Lossless PNG pixels differ");
            }
        }
    }
    for (let operation of ["encode", "decode"]) {
        let rejected = false;
        try {
            await window.portableImageCodec[operation](png, "unsupported", 100);
        } catch (error) {
            check(error.message.includes("Unsupported image format"), "Wrong codec rejection");
            rejected = true;
        }
        check(rejected, "Unknown codec format was accepted");
    }
    codecCanvas.width = 0;
    codecCanvas.height = 0;
    for (let iteration = 0; iteration < 3; ++iteration) {
        let workspace = app.createBlankDocumentInNewWorkspace(512, 512);
        let canvases = [
            workspace.getActiveLayer().getSurface().canvas,
            workspace.compositionSurface.canvas,
            workspace.scratchSurface.canvas
        ];
        workspace.getHistory().pushNewMemento(new BitmapHistoryMemento("Test", "", workspace, 0));
        check(app.closeDocumentWorkspace(workspace, false), "Document did not close");
        check(counts().every((count, index) => count === baseline[index]), "Document leaked app listeners");
        check(canvases.every(canvas => canvas.width === 0 && canvas.height === 0), "Canvas backing store was retained");
        check(workspace.document === null && workspace.history.undoStack.length === 0, "Closed history was retained");
    }
    let workspace = app.createBlankDocumentInNewWorkspace(512, 512);
    let layer = workspace.getActiveLayer();
    let payload = '<img src="invalid:" onerror="globalThis.__layerTestMarker=1">';
    layer.properties.name = payload;
    let element = new LayerItem(layer).buildElement();
    document.body.appendChild(element);
    await new Promise(resolve => setTimeout(resolve, 30));
    check(element.querySelector("span").textContent === payload, "Layer name changed");
    check(element.querySelector("img") === null && !globalThis.__layerTestMarker, "Layer name executed HTML");
    element.remove();

    let create = Surface.create, allocations = 0;
    Surface.create = (...args) => {
        ++allocations;
        return create(...args);
    };
    let clone;
    try {
        clone = layer.clone();
    } finally {
        Surface.create = create;
    }
    check(allocations === 1, "Clone allocated an extra surface");
    clone.dispose();

    let nativeWorker = Worker, active = 0, peak = 0, workers = 0;
    window.Worker = new Proxy(nativeWorker, {
        construct(target, args) {
            let worker = Reflect.construct(target, args);
            ++workers;
            ++active;
            peak = Math.max(peak, active);
            let terminate = worker.terminate.bind(worker), terminated = false;
            worker.terminate = () => {
                if (!terminated) {
                    terminated = true;
                    --active;
                }
                terminate();
            };
            return worker;
        }
    });
    let open = EffectConfigDialog.open;
    try {
        let surface = layer.getSurface();
        let source = surface.context.getImageData(0, 0, 512, 512);
        for (let offset = 0; offset < source.data.length; offset += 4) {
            source.data[offset] = (offset * 13) % 256;
            source.data[offset + 1] = (offset * 17 + 33) % 256;
            source.data[offset + 2] = (offset * 19 + 77) % 256;
            source.data[offset + 3] = 255;
        }
        surface.context.putImageData(source, 0, 0);
        let definition = BitmapEffectEngine.EFFECTS.squareBlurEffect;
        let values = {...BitmapEffectEngine.defaults(definition), radius: 2};
        EffectConfigDialog.open = async options => {
            let first = options.onPreview({...values, radius: 1});
            let second = options.onPreview({...values, radius: 3});
            options.onPreview(null);
            check(surface.context.getImageData(0, 0, 512, 512).data
                .every((value, index) => value === source.data[index]), "Preview-off did not restore source");
            let third = options.onPreview({...values, radius: 5});
            await Promise.all([first, second, third]);
            return values;
        };
        let memento = await new BitmapEffectAction(definition).performAction(workspace);
        let expected = BitmapEffectEngine.apply(source, 512, 512, definition, values);
        let actual = surface.context.getImageData(0, 0, 512, 512);
        check(actual.data.every((value, index) => value === expected.data[index]), "Worker output differs");
        check(memento.chunks[0].imageData.data.every((value, index) => value === source.data[index]), "Undo snapshot changed");
        check(workers === 4 && peak === 1 && active === 0, "Worker cancellation leaked or queued work");
    } finally {
        window.Worker = nativeWorker;
        EffectConfigDialog.open = open;
    }
    app.closeDocumentWorkspace(workspace, false);
    check(counts().every((count, index) => count === baseline[index]), "Final workspace leaked");
}

if (process.versions.electron) {
    let scenario = desktopScenarios.find(item => item.file === (process.env.PAINTDOTJS_TEST_SCENARIO || ""));
    if (scenario === undefined) {
        throw new Error("Unknown desktop regression scenario.");
    }
    let checkScenario = scenario.file === "" ? checkDesktop : require("./runtime/" + scenario.file);
    let {app, BrowserWindow, ipcMain} = require("electron");
    let browserOrigin = null;
    let lastPhase = "loading";
    ipcMain.on("paintdotjs:test-phase", (_event, phase) => {
        lastPhase = phase;
    });
    ipcMain.handle("paintdotjs:test-input", (event, input) => {
        let window = BrowserWindow.fromWebContents(event.sender);
        window.show();
        window.focus();
        event.sender.sendInputEvent(input);
    });
    let coverage = new Map();
    if (process.env.NODE_V8_COVERAGE) {
        let loadURL = BrowserWindow.prototype.loadURL;
        BrowserWindow.prototype.loadURL = function (...args) {
            if (!coverage.has(this.webContents.id)) {
                return loadURL.apply(this, args);
            }
            return loadURL.call(this, "about:blank")
                .then(() => coverage.get(this.webContents.id).collector.start())
                .then(() => loadURL.apply(this, args));
        };
        ipcMain.on("paintdotjs:test-worker-coverage", async (event, url) => {
            try {
                await coverage.get(event.sender.id).collector.captureWorkers(url);
                event.returnValue = null;
            } catch (error) {
                console.error("Worker coverage collection failed", error);
                event.returnValue = error.message;
            }
        });
    }
    app.setAppPath(root);
    app.setPath("userData", process.env.PAINTDOTJS_TEST_USER_DATA);
    let timeout = setTimeout(() => {
        console.error("Desktop regression checks timed out during " + lastPhase);
        app.exit(1);
    }, 60000);
    app.on("web-contents-created", (event, contents) => {
        if (scenario.browser && browserOrigin === null) {
            contents.once("did-finish-load", async () => {
                try {
                    let WebRuntimeServer = require("./browser/WebRuntimeServer.js");
                    let server = new WebRuntimeServer(root);
                    browserOrigin = await server.start();
                    let browser = new BrowserWindow({show: false, width: 1280, height: 900,
                        webPreferences: {nodeIntegration: false, contextIsolation: true, sandbox: true}});
                    lastPhase = "browser runtime";
                    await browser.loadURL(browserOrigin + "/index.html?skipWelcome=1");
                } catch (error) {
                    console.error("Browser fixture startup failed", error);
                    app.exit(1);
                }
            });
            return;
        }
        if (process.env.NODE_V8_COVERAGE) {
            let DesktopCoverageCollector = require("./coverage/DesktopCoverageCollector.js");
            let collector = new DesktopCoverageCollector(
                contents, process.env.NODE_V8_COVERAGE, root, scenario.file === "", browserOrigin);
            coverage.set(contents.id, {collector});
        }
        contents.on("render-process-gone", (goneEvent, details) => {
            console.error("Renderer failed", details);
            app.exit(1);
        });
        contents.on("did-finish-load", async () => {
            if (contents.getURL() === "about:blank") {
                return;
            }
            try {
                let collector = coverage.get(contents.id)?.collector;
                if (collector !== undefined && !scenario.browser) {
                    await collector.installWorkerHook();
                }
                await contents.executeJavaScript("(" + (async function (run) {
                    let errors = [];
                    let onError = event => errors.push(event.error?.stack || event.message);
                    let onRejection = event => errors.push(String(event.reason));
                    window.addEventListener("error", onError);
                    window.addEventListener("unhandledrejection", onRejection);
                    try {
                        await window.paintDotJsReady;
                        await run();
                        await new Promise(resolve => setTimeout(resolve, 0));
                        if (errors.length > 0) {
                            throw new Error(errors.join("\n"));
                        }
                    } catch (error) {
                        throw new Error(error?.stack || error?.message || String(error));
                    } finally {
                        window.removeEventListener("error", onError);
                        window.removeEventListener("unhandledrejection", onRejection);
                    }
                }).toString() + ")(" + checkScenario.toString() + ")");
                if (process.env.PAINTDOTJS_TEST_CAPTURE_DIR && /^checkOpenAssets/.test(scenario.file)) {
                    let capture = await contents.capturePage();
                    let filename = path.join(process.env.PAINTDOTJS_TEST_CAPTURE_DIR, scenario.browser ? "web.png" : "app.png");
                    require("node:fs").writeFileSync(filename, capture.toPNG());
                }
                if (collector !== undefined) {
                    await collector.finish();
                }
                clearTimeout(timeout);
                console.log("Desktop regression checks passed");
                app.exit(0);
            } catch (error) {
                console.error("Desktop scenario failed during " + lastPhase, error);
                app.exit(1);
            }
        });
    });
    require(path.join(root, "js/platform/desktop/main.js"));
} else {
    let {test} = require("node:test");
    let assert = require("node:assert/strict");
    let fs = require("node:fs");
    let os = require("node:os");
    let {spawnSync} = require("node:child_process");
    for (let scenario of desktopScenarios) {
        test(scenario.name, () => {
        if (scenario.file !== "") {
            assert.equal(typeof require("./runtime/" + scenario.file), "function");
        }
        let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-desktop-test-"));
        try {
            let result = spawnSync("xvfb-run", [
                "-a", path.join(root, "node_modules/.bin/electron"),
                "--ozone-platform=x11", ...(scenario.extraArgs || []), __filename
            ], {
                env: {...process.env, PAINTDOTJS_TEST_USER_DATA: directory,
                    PAINTDOTJS_TEST_SCENARIO: scenario.file},
                encoding: "utf8",
                timeout: 90000
            });
            assert.equal(result.error, undefined, result.stdout + result.stderr);
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout, /Desktop regression checks passed/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
        });
    }
}
