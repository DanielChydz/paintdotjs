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
    let {app} = require("electron");
    app.setAppPath(root);
    app.setPath("userData", process.env.PAINTDOTJS_TEST_USER_DATA);
    let timeout = setTimeout(() => {
        console.error("Desktop regression checks timed out");
        app.exit(1);
    }, 60000);
    app.on("web-contents-created", (event, contents) => {
        contents.on("render-process-gone", (goneEvent, details) => {
            console.error("Renderer failed", details);
            app.exit(1);
        });
        contents.once("did-finish-load", async () => {
            try {
                await contents.executeJavaScript("(" + checkDesktop.toString() + ")()");
                clearTimeout(timeout);
                console.log("Desktop regression checks passed");
                app.exit(0);
            } catch (error) {
                console.error(error);
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
    test("desktop layer-name safety, document cleanup and worker cancellation", () => {
        let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintdotjs-desktop-test-"));
        try {
            let result = spawnSync("xvfb-run", [
                "-a", path.join(root, "node_modules/.bin/electron"),
                "--ozone-platform=x11", __filename
            ], {
                env: {...process.env, PAINTDOTJS_TEST_USER_DATA: directory},
                encoding: "utf8",
                timeout: 90000
            });
            assert.ifError(result.error);
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout, /Desktop regression checks passed/);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
}
