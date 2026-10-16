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

function documentFixture(options = {}) {
    let state = {now: 1000000, dirty: false, closes: 0, created: [], opened: [], revoked: [],
        alerts: [], clipboard: [], elements: [], images: [], timers: [], updates: 0, ...options};
    let window = new EventEmitter();
    window.addEventListener = window.on;
    window.close = () => ++state.closes;
    window.location = {replace: url => state.location = url};
    window.open = () => state.printWindow || null;
    let document = new EventEmitter();
    document.addEventListener = document.on;
    document.hidden = false;
    document.createElement = tag => {
        let element = {tag, click: () => state.clicked = element};
        if (tag === "canvas") {
            element.getContext = () => ({putImageData: image => state.decodedImage = image});
        }
        state.elements.push(element);
        return element;
    };
    function HTMLImageElement() {}
    function Image() {
        state.images.push(this);
    }
    function ImageData(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
    let app = {
        hasUnsavedDocuments: () => state.dirty,
        getActiveTool: () => null,
        getActiveDocumentWorkspace: () => state.workspace || null,
        getDocumentWorkspaces: () => state.workspace ? [state.workspace] : [],
        createBlankDocumentInNewWorkspace: (...args) => state.created.push(args)
    };
    let context = vm.createContext({
        window, document, HTMLImageElement, Image, ImageData, TypeError, console, Blob, Uint8Array, TextDecoder,
        isApp: !!options.isApp, Date: {now: () => state.now},
        navigator: {clipboard: {read: async () => {
            if (state.clipboardError) {
                throw state.clipboardError;
            }
            return state.clipboard;
        }}},
        setTimeout: (callback, delay) => state.timers.push({callback, delay}),
        URL: {
            createObjectURL: blob => {
                state.opened.push(blob);
                return "blob:fixture-" + state.opened.length;
            },
            revokeObjectURL: url => state.revoked.push(url)
        },
        alert: message => state.alerts.push(message),
        NewFileDialog: {open: async (...args) => {
            state.newDimensions = args;
            return state.newResult || null;
        }},
        ImageEncoder: {canvasToBlob: async (canvas, type) => {
            assert.equal(type, "image/png");
            state.encodedCanvas = canvas;
            return new Blob(["fixture"]);
        }},
        TaskDialog: {show: async settings => {
            state.dialog = settings;
            return state.choice || "cancel";
        }}
    });
    let filename = path.resolve(__dirname, "../js/src/io/DocumentIO.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let io = vm.runInContext("DocumentIO", context);
    io.initialize(app);
    let event = fields => ({defaultPrevented: false, preventDefault() {
        this.defaultPrevented = true;
    }, ...fields});
    let runTimer = async delay => {
        let index = state.timers.findIndex(timer => timer.delay === delay);
        assert.notEqual(index, -1, "Missing scheduled callback");
        await state.timers.splice(index, 1)[0].callback();
    };
    return {state, io, context, app, window, document, event, runTimer, HTMLImageElement};
}

test("document event boundaries ignore UI drags and empty clipboard/drop payloads", () => {
    let fixture = documentFixture();
    let {state, io, app, window, document, event, HTMLImageElement} = fixture;
    io.initialize({});
    assert.equal(io.app, app);
    assert.equal(window.listenerCount("beforeunload"), 1);
    let imageDrag = event({target: new HTMLImageElement()});
    document.emit("dragstart", imageDrag);
    assert.equal(imageDrag.defaultPrevented, true);
    let ordinaryDrag = event({target: {}});
    document.emit("dragstart", ordinaryDrag);
    assert.equal(ordinaryDrag.defaultPrevented, false);
    for (let dataTransfer of [null, {types: ["text/plain"]}, {types: ["Files"]}]) {
        let drag = event({dataTransfer});
        document.emit("dragover", drag);
        assert.equal(drag.defaultPrevented, dataTransfer?.types.includes("Files") || false);
        if (drag.defaultPrevented) {
            assert.equal(dataTransfer.dropEffect, "copy");
        }
    }
    io.handleDroppedFiles = files => state.dropped = files;
    for (let dataTransfer of [null, {}, {files: []}, {files: ["external-image"]}]) {
        let drop = event({dataTransfer});
        document.emit("drop", drop);
        assert.equal(drop.defaultPrevented, !!dataTransfer?.files?.length);
    }
    assert.deepEqual([...state.dropped], ["external-image"]);
    io.pasteBlob = blob => state.pasted = blob;
    for (let fields of [
        {clipboardData: null}, {clipboardData: {}},
        {defaultPrevented: true, clipboardData: {items: [{type: "image/png"}]}},
        {clipboardData: {items: [{type: "text/plain"}]}},
        {clipboardData: {items: [{type: "image/png", getAsFile: () => null}]}}
    ]) {
        document.emit("paste", event(fields));
        assert.equal(state.pasted, undefined);
    }
    let paste = event({clipboardData: {items: [{type: "image/png", getAsFile: () => "image-blob"}]}});
    document.emit("paste", paste);
    assert.equal(paste.defaultPrevented, true);
    assert.equal(state.pasted, "image-blob");
});

test("browser unload protects dirty work and deduplicates scheduled close dialogs", async () => {
    for (let [isApp, dirty, allowed] of [[true, true, false], [false, false, false],
        [false, true, true], [false, true, false]]) {
        let fixture = documentFixture({isApp, dirty});
        fixture.io.allowWebCloseUntil = allowed ? fixture.state.now + 1000 : 0;
        let unload = fixture.event();
        fixture.window.emit("beforeunload", unload);
        let protectedWork = !isApp && dirty && !allowed;
        assert.equal(unload.defaultPrevented, protectedWork);
        assert.equal(fixture.state.timers.length, protectedWork ? 1 : 0);
        if (protectedWork) {
            fixture.io.scheduleWebCloseDialog();
            assert.equal(fixture.state.timers.length, 1);
            fixture.state.dirty = false;
            await fixture.runTimer(0);
            assert.equal(fixture.io.webCloseDialogOpen, false);
            assert.equal(fixture.io.webCloseDialogScheduled, false);
        }
    }
    let fixture = documentFixture({dirty: true});
    fixture.io.webCloseDialogOpen = true;
    fixture.io.scheduleWebCloseDialog();
    assert.equal(fixture.state.timers.length, 0);
    fixture.io.webCloseDialogOpen = false;
    fixture.io.scheduleWebCloseDialog();
    fixture.io.webCloseDialogOpen = true;
    await fixture.runTimer(0);
    assert.equal(fixture.state.closes, 0);
});

test("browser close saves/discards only after approval and resets flags after save errors", async () => {
    for (let [choice, saveResult, exits] of [["cancel", true, false], ["save", false, false],
        ["save", true, true], ["discard", true, true]]) {
        let fixture = documentFixture({dirty: true});
        let calls = 0;
        fixture.io.showUnsavedChangesDialog = async (workspaces, immediate) => {
            assert.equal(immediate, false);
            assert.equal(workspaces.length, 0);
            return choice;
        };
        fixture.io.saveAll = async () => {
            ++calls;
            return saveResult;
        };
        fixture.io.scheduleWebCloseDialog();
        await fixture.runTimer(0);
        assert.equal(fixture.io.webCloseDialogOpen, false);
        assert.equal(calls, choice === "save" ? 1 : 0);
        assert.equal(fixture.state.closes, exits ? 1 : 0);
        if (exits) {
            assert.equal(fixture.io.allowWebCloseUntil, fixture.state.now + 10000);
            await fixture.runTimer(100);
            assert.equal(fixture.state.location, "about:blank");
        }
    }
    let fixture = documentFixture({dirty: true});
    fixture.io.showUnsavedChangesDialog = async () => "save";
    fixture.io.saveAll = async () => {
        throw new Error("disk full");
    };
    fixture.io.scheduleWebCloseDialog();
    await assert.rejects(fixture.runTimer(0), /disk full/);
    assert.equal(fixture.io.webCloseDialogOpen, false);
    assert.equal(fixture.state.closes, 0);
    fixture.document.hidden = true;
    fixture.io.exitWebApp();
    await fixture.runTimer(100);
    assert.equal(fixture.state.location, undefined);
});

test("document clipboard dimensions validate native results and release decoded images", async () => {
    let fixture = documentFixture();
    for (let size of [null, {}, {width: 0, height: 4}, {width: 4, height: -1},
        {width: Infinity, height: 4}, {width: 4, height: NaN}, {width: "4", height: 4}]) {
        fixture.window.desktopFileActions = {getClipboardImageSize: () => size};
        assert.equal(await fixture.io.getClipboardImageSize(), null);
    }
    fixture.window.desktopFileActions = {getClipboardImageSize: () => ({width: 2.6, height: 4.4})};
    let size = await fixture.io.getClipboardImageSize();
    assert.deepEqual([size.width, size.height], [3, 4]);
    fixture.window.desktopFileActions.getClipboardImageSize = () => {
        throw new Error("unsupported native reader");
    };
    assert.equal(await fixture.io.getClipboardImageSize(), null);
    fixture.state.clipboard = [{types: ["text/plain"]}, {types: ["image/png"], getType: async () => "png"}];
    for (let image of [{width: 16, height: 8}, {width: 0, height: 8}, {width: 16, height: 0}]) {
        let closed = 0;
        fixture.io.loadImage = async () => ({...image, close: () => ++closed});
        size = await fixture.io.getClipboardImageSize();
        assert.equal(size === null, image.width === 0 || image.height === 0);
        assert.equal(closed, 1);
    }
    fixture.io.loadImage = async () => ({width: 16, height: 8});
    assert.equal((await fixture.io.getClipboardImageSize()).width, 16);
    fixture.io.loadImage = async () => {
        throw new Error("corrupt image");
    };
    assert.equal(await fixture.io.getClipboardImageSize(), null);
    fixture.io.internalClipboard = "internal";
    fixture.state.clipboardError = new Error("permission denied");
    assert.equal(await fixture.io.readClipboardImage(), "internal");
    delete fixture.context.navigator.clipboard;
    assert.equal(await fixture.io.readClipboardImage(), "internal");
});

test("new-document defaults respect active image and clipboard dimensions and cancellation", async () => {
    let fixture = documentFixture();
    await fixture.io.createNewDocument();
    assert.deepEqual(fixture.state.newDimensions, [800, 600]);
    assert.equal(fixture.state.created.length, 0);
    fixture.state.workspace = {getDocument: () => ({getWidth: () => 64, getHeight: () => 32})};
    fixture.state.newResult = {width: 48, height: 24, resolution: 144};
    await fixture.io.createNewDocument();
    assert.deepEqual(fixture.state.newDimensions, [64, 32]);
    assert.deepEqual(fixture.state.created[0], [48, 24, 144]);
    fixture.window.desktopFileActions = {getClipboardImageSize: () => ({width: 16, height: 8})};
    await fixture.io.createNewDocument();
    assert.deepEqual(fixture.state.newDimensions, [16, 8]);
});

test("printing handles blocked windows and revokes object URLs after successful print", async () => {
    let fixture = documentFixture();
    assert.equal(await fixture.io.printActive(), false);
    let canvas = {width: 8, height: 4};
    fixture.state.workspace = {
        updateComposition: () => ++fixture.state.updates,
        getCompositionSurface: () => ({getCanvas: () => canvas})
    };
    assert.equal(await fixture.io.printActive(), false);
    assert.equal(fixture.state.alerts.length, 1);
    assert.deepEqual(fixture.state.revoked, ["blob:fixture-1"]);
    let image = {};
    let written = [];
    let actions = [];
    fixture.state.printWindow = {
        document: {open: () => actions.push("open"), write: text => written.push(text),
            close: () => actions.push("close"), getElementById: id => {
                assert.equal(id, "printImage");
                return image;
            }},
        focus: () => actions.push("focus"), print: () => actions.push("print")
    };
    assert.equal(await fixture.io.printActive(), true);
    assert.equal(written.length, 1);
    assert.ok(written[0].includes("<title>Print</title>"));
    assert.equal(image.src, "blob:fixture-2");
    image.onload();
    assert.deepEqual(actions, ["open", "close", "focus", "print"]);
    assert.deepEqual(fixture.state.revoked, ["blob:fixture-1", "blob:fixture-2"]);
    assert.equal(fixture.state.encodedCanvas, canvas);
    assert.equal(fixture.state.updates, 2);
});

test("document local-path and download boundaries preserve fallbacks and cleanup", async () => {
    let fixture = documentFixture();
    for (let file of [null, undefined, {}, {path: ""}, {path: 123}]) {
        assert.equal(fixture.io.getLocalFilePath(file), null);
    }
    assert.equal(fixture.io.getLocalFilePath({path: "/images/local.png"}), "/images/local.png");
    fixture.window.desktopFileActions = {getPathForFile: () => "/images/native.png"};
    assert.equal(fixture.io.getLocalFilePath({}), "/images/native.png");
    fixture.window.desktopFileActions.getPathForFile = () => "";
    assert.equal(fixture.io.getLocalFilePath({}), null);
    fixture.window.desktopFileActions.getPathForFile = () => {
        throw new Error("synthetic File");
    };
    assert.equal(fixture.io.getLocalFilePath({path: "/images/fallback.png"}), "/images/fallback.png");
    let blob = new Blob(["bytes"]);
    fixture.io.downloadBlob(blob, "test.png");
    assert.equal(fixture.state.clicked.download, "test.png");
    assert.equal(fixture.state.clicked.href, "blob:fixture-1");
    assert.equal(fixture.state.opened[0], blob);
    await fixture.runTimer(1000);
    assert.deepEqual(fixture.state.revoked, ["blob:fixture-1"]);
});

test("file pickers retry rejected filters, honor cancellation and surface unexpected failures", async () => {
    let fixture = documentFixture();
    let files = [{name: "first.png"}, {name: "second.pdn"}];
    let handles = files.map(file => ({getFile: async () => file}));
    let pickerCalls = [];
    fixture.window.showOpenFilePicker = async options => {
        pickerCalls.push(options);
        if (pickerCalls.length === 1) {
            throw new TypeError("unsupported extension filter");
        }
        return handles;
    };
    fixture.io.openFiles = async selected => fixture.state.selected = selected;
    await fixture.io.openFilePicker();
    assert.equal(pickerCalls.length, 2);
    assert.equal(pickerCalls[0].multiple, true);
    assert.equal(pickerCalls[1].types, undefined);
    assert.deepEqual([...fixture.state.selected], files);
    assert.equal(fixture.io.openedFileHandles.get(files[1]), handles[1]);
    fixture.window.showOpenFilePicker = async () => {
        throw Object.assign(new Error("cancelled"), {name: "AbortError"});
    };
    await fixture.io.openFilePicker();
    assert.equal(fixture.state.clicked, undefined);
    for (let name of ["SecurityError", "NotAllowedError"]) {
        fixture.window.showOpenFilePicker = async () => {
            throw Object.assign(new Error("permission"), {name});
        };
        await fixture.io.openFilePicker();
        let input = fixture.state.clicked;
        assert.equal(input.tag, "input");
        assert.equal(input.multiple, true);
        assert.ok(input.accept.includes(".pdn"));
        input.onchange();
        assert.equal(fixture.state.selected.length, 0);
        input.files = files;
        input.onchange();
        assert.deepEqual([...fixture.state.selected], files);
    }
    fixture.window.showOpenFilePicker = async () => {
        throw new Error("unexpected picker failure");
    };
    await assert.rejects(fixture.io.openFilePicker(), /unexpected picker failure/);
});

test("layer and document import loops report failed files while continuing subsequent imports", async () => {
    let fixture = documentFixture();
    fixture.io.openLayerFilePicker();
    assert.equal(fixture.state.clicked, undefined);
    fixture.state.workspace = {};
    let imported = [];
    fixture.io.addFileAsLayer = async file => {
        imported.push(file.name);
        if (file.name === "bad.png") {
            throw new Error("bad image");
        }
    };
    fixture.io.openLayerFilePicker();
    let input = fixture.state.clicked;
    await input.onchange();
    assert.equal(imported.length, 0);
    input.files = [{name: "one.png"}, {name: "bad.png"}, {name: "three.png"}];
    await input.onchange();
    assert.deepEqual(imported, ["one.png", "bad.png", "three.png"]);
    assert.equal(fixture.state.alerts[0], 'Could not add "bad.png" as a layer: bad image');
    imported = [];
    fixture.io.openPdn = async file => imported.push("pdn:" + file.name);
    fixture.io.openImage = async file => {
        imported.push("image:" + file.name);
        if (file.name === "bad.png") {
            throw new Error("bad import");
        }
    };
    await fixture.io.openFiles([{name: "one.PDN"}, {name: "bad.png"}, {name: "three.png"}]);
    assert.deepEqual(imported, ["pdn:one.PDN", "image:bad.png", "image:three.png"]);
    assert.equal(fixture.state.alerts[1], 'Could not open "bad.png": bad import');
});

test("font/image drops import fonts without forwarding them to the image decoder", async () => {
    let fixture = documentFixture();
    let font = {name: "Example.ttf"};
    let image = {name: "image.png"};
    let calls = [];
    fixture.context.FontManager = {
        isFontFile: file => file.name.endsWith(".ttf"),
        importFiles: async files => {
            calls.push(["managed", ...files]);
            return {added: [], errors: [{file: font, error: new Error("invalid font")}]};
        }
    };
    fixture.context.SettingsDialog = {
        open: page => calls.push(["settings", page]),
        instance: {importFonts: async files => calls.push(["settings-import", ...files])}
    };
    await fixture.io.handleDroppedFiles([font]);
    assert.deepEqual(calls, [["settings", "fonts"], ["settings-import", font]]);
    fixture.io.openFiles = async files => calls.push(["images", ...files]);
    fixture.state.choice = "open";
    await fixture.io.handleDroppedFiles([font, image]);
    assert.deepEqual(calls.at(-1), ["images", image]);
    assert.ok(fixture.state.alerts[0].includes("Example.ttf: invalid font"));
    assert.equal(fixture.state.dialog.message, "What would you like to do with the file?");
    fixture.state.choice = "cancel";
    let count = calls.length;
    await fixture.io.handleDroppedFiles([image, {name: "other.png"}]);
    assert.equal(calls.length, count);
    assert.equal(fixture.state.dialog.message, "What would you like to do with the files?");
});

test("image-element decoding cleans URLs and portable-codec fallback preserves errors and pixels", async () => {
    let fixture = documentFixture();
    let blob = new Blob(["image"]);
    let loading = fixture.io.loadImageElement(blob);
    let image = fixture.state.images[0];
    assert.equal(image.src, "blob:fixture-1");
    image.onload();
    assert.equal(await loading, image);
    assert.deepEqual(fixture.state.revoked, ["blob:fixture-1"]);
    loading = fixture.io.loadImageElement(blob);
    fixture.state.images[1].onerror();
    await assert.rejects(loading, /Unsupported image format/);
    assert.deepEqual(fixture.state.revoked, ["blob:fixture-1", "blob:fixture-2"]);
    let failure = new Error("native decoder unavailable");
    fixture.context.createImageBitmap = async () => {
        throw failure;
    };
    await assert.rejects(fixture.io.loadImage(blob), error => error === failure);
    let encoded = Object.assign(new Blob(["dds"]), {name: "image.dds"});
    let rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    fixture.window.portableImageCodec = {decode: async (bytes, format) => {
        assert.equal(format, "dds");
        assert.equal(new TextDecoder().decode(bytes), "dds");
        return {width: 1, height: 1, rgba};
    }};
    let canvas = await fixture.io.loadImage(encoded);
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
    assert.equal(fixture.state.decodedImage.data, rgba);
    await assert.rejects(fixture.io.loadImage(blob), error => error === failure);
    fixture.window.portableImageCodec.decode = async () => {
        throw new Error("portable decoder failure");
    };
    await assert.rejects(fixture.io.loadImage(encoded), /portable decoder failure/);
    delete fixture.context.createImageBitmap;
    fixture.io.loadImageElement = async () => {
        throw failure;
    };
    await assert.rejects(fixture.io.loadImage(blob), error => error === failure);
    fixture.io.loadImageElement = async () => image;
    assert.equal(await fixture.io.loadImage(blob), image);
});

function savingFixture(options = {}) {
    let fixture = documentFixture(options);
    let {state, context, io} = fixture;
    let filename = path.resolve(__dirname, "../js/src/interface/window/dialog/SaveImageDialog.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let SaveImageDialog = vm.runInContext("SaveImageDialog", context);
    let canvas = {width: 16, height: 12};
    state.encoded = [];
    state.writes = [];
    state.downloads = [];
    state.dirty = true;
    let workspace = {
        fileName: options.fileName ?? "image.png",
        fileFormat: options.fileFormat === undefined ? "png" : options.fileFormat,
        fileHandle: options.fileHandle ?? null,
        saveOptions: options.saveOptions ?? null,
        getDocument: () => ({getLayers: () => ({getLayerCount: () => options.layers ?? 1})}),
        getFriendlyName: () => options.friendlyName ?? "image.png",
        getFilePath: () => options.filePath ?? null,
        updateComposition: () => ++state.updates,
        getCompositionSurface: () => ({getCanvas: () => canvas}),
        setFileInfo: (...args) => state.fileInfo = args,
        setDirty: dirty => state.dirty = dirty,
        isDirty: () => state.dirty
    };
    state.workspace = workspace;
    context.i18n = key => key === "untitled.friendlyName" ? "Untitled" : key;
    context.ImageEncoder.encode = async (input, format, values) => {
        assert.equal(input, canvas);
        state.encoded.push({format, options: {...values}});
        return new Blob(["encoded:" + format]);
    };
    io.serializePdn = async selected => {
        assert.equal(selected, workspace);
        state.serialized = (state.serialized || 0) + 1;
        return new Blob(["layered:pdn"]);
    };
    io.downloadBlob = (blob, name) => state.downloads.push({blob, name});
    io.flattenDocument = () => ++state.flattened;
    state.flattened = 0;
    SaveImageDialog.open = async settings => {
        state.saveDialog = settings;
        return state.saveResult ?? null;
    };
    let handle = (name, hiddenPath = false) => ({
        name,
        createWritable: async () => ({
            write: async blob => {
                if (state.writeError) {
                    throw state.writeError;
                }
                state.writes.push(blob);
            },
            close: async () => state.writerClosed = true
        }),
        getFile: async () => {
            if (hiddenPath) {
                throw new Error("Browser hides the local path");
            }
            return {path: "/images/" + name};
        }
    });
    return {...fixture, SaveImageDialog, workspace, canvas, handle};
}

test("saving chooses lossless layered output and default quality without losing file identity", async () => {
    let fixture = savingFixture();
    fixture.state.workspace = null;
    assert.equal(await fixture.io.saveActive(), false);
    fixture.state.workspace = fixture.workspace;
    assert.equal(await fixture.io.saveActive(), true);
    assert.equal(fixture.state.downloads[0].name, "image.png");
    assert.equal(await fixture.state.downloads[0].blob.text(), "encoded:png");
    assert.deepEqual(fixture.state.fileInfo.slice(0, 4), ["image.png", null, null, "png"]);
    assert.equal(fixture.state.dirty, false);
    for (let options of [
        {fileFormat: null, layers: 2, fileName: "Untitled", friendlyName: "Untitled"},
        {fileFormat: "png", layers: 2},
        {fileFormat: "webp", saveOptions: {}},
        {fileFormat: "webp", saveOptions: {quality: 42}}
    ]) {
        fixture = savingFixture(options);
        assert.equal(await fixture.io.saveActive(), true);
        if (options.layers === 2) {
            assert.equal(fixture.state.fileInfo[3], "pdn");
            assert.equal(fixture.state.serialized, 1);
            assert.equal(fixture.state.encoded.length, 0);
            assert.equal(fixture.state.flattened, 0);
        } else {
            assert.equal(fixture.state.encoded[0].options.quality, options.saveOptions.quality ?? 90);
        }
    }
});

test("save configuration and flatten consent preserve dirty work on cancellation", async () => {
    for (let choice of ["cancel", "flatten"]) {
        let fixture = savingFixture({layers: 2});
        assert.equal(await fixture.io.saveActive(true), false);
        assert.equal(fixture.state.downloads.length, 0);
        let blob = new Blob(["configured preview"]);
        fixture.state.saveResult = {format: "png", options: {}, blob};
        fixture.state.choice = choice;
        let result = await fixture.io.saveActive(true);
        assert.equal(result, choice === "flatten");
        assert.equal(fixture.state.flattened, choice === "flatten" ? 1 : 0);
        assert.equal(fixture.state.dirty, choice !== "flatten");
        if (result) {
            assert.equal(fixture.state.downloads[0].blob, blob);
            assert.equal(fixture.state.encoded.length, 0);
        }
        assert.equal(await (await fixture.state.saveDialog.encode("pdn", {})).text(), "layered:pdn");
        assert.equal(await (await fixture.state.saveDialog.encode("png", {compression: 9})).text(), "encoded:png");
        assert.equal(fixture.state.encoded.at(-1).options.compression, 9);
    }
    let fixture = savingFixture({fileFormat: "jpeg"});
    assert.equal(await fixture.io.saveActive(), false);
    assert.equal(fixture.state.saveDialog.initialFormat, "jpeg");
    fixture.state.saveResult = {format: "jpeg", options: {quality: 81}, blob: null};
    assert.equal(await fixture.io.saveActive(), true);
    assert.equal(fixture.state.encoded[0].options.quality, 81);
});

test("saving handles existing file handles, restricted MIME pickers and explicit write failures", async () => {
    for (let hidden of [false, true]) {
        let fixture = savingFixture();
        fixture.workspace.fileHandle = fixture.handle("IMAGE.PNG", hidden);
        assert.equal(await fixture.io.saveActive(), true);
        assert.equal(fixture.state.writerClosed, true);
        assert.equal(fixture.state.writes.length, 1);
        assert.equal(fixture.state.fileInfo[2], hidden ? null : "/images/IMAGE.PNG");
        assert.equal(fixture.state.downloads.length, 0);
    }
    let fixture = savingFixture();
    fixture.workspace.fileHandle = fixture.handle("wrong.jpg");
    let pickerCalls = [];
    fixture.window.showSaveFilePicker = async settings => {
        pickerCalls.push(settings);
        if (pickerCalls.length === 1) {
            throw new TypeError("MIME rejected");
        }
        return fixture.handle("chosen.png");
    };
    assert.equal(await fixture.io.saveActive(), true);
    assert.equal(pickerCalls.length, 2);
    assert.ok(pickerCalls[0].types[0].accept["image/png"].includes(".png"));
    assert.equal(pickerCalls[1].types, undefined);
    assert.equal(fixture.state.fileInfo[0], "chosen.png");
    for (let name of ["AbortError", "NotAllowedError"]) {
        fixture = savingFixture();
        let failure = Object.assign(new Error("Picker blocked"), {name});
        fixture.window.showSaveFilePicker = async () => {
            throw failure;
        };
        if (name === "AbortError") {
            assert.equal(await fixture.io.saveActive(), false);
        } else {
            await assert.rejects(fixture.io.saveActive(), error => error === failure);
        }
        assert.equal(fixture.state.dirty, true);
        assert.equal(fixture.state.fileInfo, undefined);
    }
    fixture = savingFixture();
    fixture.workspace.fileHandle = fixture.handle("image.png");
    fixture.state.writeError = new Error("Disk full");
    await assert.rejects(fixture.io.saveActive(), error => error === fixture.state.writeError);
    assert.equal(fixture.state.dirty, true);
    assert.equal(fixture.state.writerClosed, undefined);
    assert.equal(fixture.state.fileInfo, undefined);
});

test("native save writes encoded bytes to matching paths and propagates filesystem errors", async () => {
    for (let name of ["image.png", ""]) {
        let fixture = savingFixture({filePath: "/images/native.png", fileName: name});
        fixture.window.desktopFileActions = {writeFile: async (pathname, buffer) => {
            assert.equal(pathname, "/images/native.png");
            assert.equal(new TextDecoder().decode(buffer), "encoded:png");
            fixture.state.nativeWritten = true;
        }};
        assert.equal(await fixture.io.saveActive(), true);
        assert.equal(fixture.state.nativeWritten, true);
        assert.equal(fixture.state.fileInfo[0], name || "image.png");
        assert.equal(fixture.state.fileInfo[2], "/images/native.png");
        assert.equal(fixture.state.downloads.length, 0);
    }
    let fixture = savingFixture({filePath: "/images/native.png"});
    let failure = new Error("Filesystem denied");
    fixture.window.desktopFileActions = {writeFile: async () => {
        throw failure;
    }};
    await assert.rejects(fixture.io.saveActive(), error => error === failure);
    assert.equal(fixture.state.dirty, true);
});

test("save-all filters clean workspaces and restores the original selection after cancellation or failure", async () => {
    for (let outcome of ["success", "cancel", "failure"]) {
        let fixture = savingFixture();
        let first = fixture.workspace;
        let clean = {isDirty: () => false};
        let second = {isDirty: () => true};
        let all = [clean, first, second];
        let saved = [];
        fixture.app.getDocumentWorkspaces = () => all;
        fixture.app.setActiveDocumentWorkspace = workspace => fixture.state.workspace = workspace;
        let failure = new Error("Save failed");
        fixture.io.saveActive = async () => {
            saved.push(fixture.state.workspace);
            if (fixture.state.workspace === second) {
                if (outcome === "failure") {
                    throw failure;
                }
                return outcome !== "cancel";
            }
            return true;
        };
        if (outcome === "failure") {
            await assert.rejects(fixture.io.saveAll(), error => error === failure);
        } else {
            assert.equal(await fixture.io.saveAll(), outcome === "success");
        }
        assert.deepEqual(saved, [first, second]);
        assert.equal(fixture.state.workspace, first);
        saved.length = 0;
        all = [clean, first];
        assert.equal(await fixture.io.saveAll(true), true);
        assert.deepEqual(saved, [clean, first]);
        assert.equal(fixture.state.workspace, first);
    }
});

function loadClipboardGeometry(context) {
    for (let name of ["Point", "Size", "Rectangle"]) {
        let filename = path.resolve(__dirname, "../js/src/engine/util", name + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    return vm.runInContext("({Point, Rectangle})", context);
}

test("clipboard entry points report missing images and propagate decoding failures", async () => {
    let fixture = documentFixture();
    for (let method of ["pasteFromClipboard", "pasteIntoNewImage", "pasteIntoNewLayer", "copySelection", "cutSelection"]) {
        assert.equal(await fixture.io[method](), false);
    }
    assert.equal(fixture.state.alerts.length, 3);
    assert.ok(fixture.state.alerts.every(message => message.includes("does not contain an image")));
    let blob = new Blob(["external image"]);
    fixture.io.internalClipboard = blob;
    fixture.io.pasteBlob = async received => {
        assert.equal(received, blob);
        return true;
    };
    assert.equal(await fixture.io.pasteFromClipboard(), true);
    let failure = new Error("Image decoder rejected bytes");
    fixture.io.loadImage = async () => {
        throw failure;
    };
    await assert.rejects(fixture.io.pasteIntoNewImage(), error => error === failure);
    assert.equal(fixture.state.created.length, 0);
    fixture.io.internalClipboard = null;
    fixture.state.workspace = {getActiveLayer: () => null, getSelection: () => ({isEmpty: () => true})};
    assert.equal(await fixture.io.copySelection(), false);
    assert.equal(await fixture.io.cutSelection(), false);
    assert.equal(await fixture.io.pasteIntoNewLayer(), false);
});

test("clipboard source coordinates follow pixel identity and narrow/offscreen viewport bounds", async () => {
    let fixture = documentFixture();
    let {Rectangle} = loadClipboardGeometry(fixture.context);
    let image = {width: 4, height: 3};
    let blob = new Blob(["copied"]);
    let bounds = new Rectangle(12, 8, 4, 3);
    let coordinates = value => [value.x, value.y, value.width, value.height];
    fixture.io.internalClipboard = blob;
    fixture.io.internalClipboardInfo = {width: 4, height: 3, bounds, pixelDigest: "same-pixels"};
    let result = await fixture.io.getClipboardSourceBounds(blob, image);
    assert.deepEqual(coordinates(result), [12, 8, 4, 3]);
    assert.notEqual(result, bounds);
    result.x = 99;
    assert.equal(bounds.x, 12);
    fixture.io.getImagePixelDigest = async () => "same-pixels";
    result = await fixture.io.getClipboardSourceBounds(new Blob(["re-encoded"]), image);
    assert.deepEqual(coordinates(result), [12, 8, 4, 3]);
    fixture.io.getImagePixelDigest = async () => "different-pixels";
    result = await fixture.io.getClipboardSourceBounds(new Blob(["external"]), image);
    assert.deepEqual(coordinates(result), [0, 0, 4, 3]);
    for (let [visible, source, size, expected] of [
        [[10.1, 20.1, 0.2, 0.2], [0, 0], [1, 1], [10, 20]],
        [[10, 20, 10, 10], [0, 0], [4, 3], [10, 20]],
        [[10, 20, 10, 10], [99, 99], [4, 3], [16, 27]],
        [[0, 0, 200, 200], [98, 98], [4, 3], [96, 97]],
        [[-10, -10, 20, 20], [-20, -20], [200, 200], [0, 0]]
    ]) {
        let workspace = {getVisibleDocumentRect: () => new Rectangle(...visible),
            getDocument: () => ({getWidth: () => 100, getHeight: () => 100})};
        let position = fixture.io.getPastePosition(workspace, new Rectangle(...source, ...size), ...size);
        assert.deepEqual([position.x, position.y], expected);
    }
});

test("pixel digest uses SHA-256 when available and a stable byte-sensitive fallback otherwise", async () => {
    let fixture = documentFixture();
    let pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 128, 0, 255]);
    fixture.context.HTMLCanvasElement = function () {};
    let source = new fixture.context.HTMLCanvasElement();
    source.width = 2;
    source.height = 1;
    source.getContext = () => ({getImageData: (x, y, width, height) => {
        assert.deepEqual([x, y, width, height], [0, 0, 2, 1]);
        return {data: pixels};
    }});
    fixture.context.crypto = require("node:crypto").webcrypto;
    let expected = require("node:crypto").createHash("sha256").update(pixels).digest("hex");
    assert.equal(await fixture.io.getImagePixelDigest(source, 2, 1), expected);
    delete fixture.context.crypto;
    let fallback = await fixture.io.getImagePixelDigest(source, 2, 1);
    assert.equal(fallback, "650a4d2addfd2a18");
    assert.equal(await fixture.io.getImagePixelDigest(source, 2, 1), fallback);
    pixels[1] = 1;
    assert.notEqual(await fixture.io.getImagePixelDigest(source, 2, 1), fallback);
    assert.equal(fixture.state.elements.length, 0, "Matching canvas dimensions must reuse the original canvas");
});

test("document close releases its reentry lock after a canceled save or rejected dialog", async () => {
    let fixture = savingFixture();
    let {io, workspace, app, state, context} = fixture;
    io.createUnsavedChangesPreview = () => "preview";
    app.setActiveDocumentWorkspace = selected => state.workspace = selected;
    let closes = 0;
    app.closeDocumentWorkspace = selected => {
        assert.equal(selected, workspace);
        ++closes;
        return true;
    };
    assert.equal(await io.closeDocumentWorkspace(null), false);
    assert.equal(await io.closeDocumentWorkspace({}), false);
    let resolveChoice;
    context.TaskDialog.show = () => new Promise(resolve => resolveChoice = resolve);
    let first = io.closeDocumentWorkspace(workspace);
    assert.equal(await io.closeDocumentWorkspace(workspace), false);
    resolveChoice("save");
    io.saveActive = async () => false;
    assert.equal(await first, false);
    assert.equal(io.closingWorkspaces.size, 0);
    assert.equal(closes, 0);
    let failure = new Error("Dialog failed");
    context.TaskDialog.show = async () => {
        throw failure;
    };
    await assert.rejects(io.closeDocumentWorkspace(workspace), error => error === failure);
    assert.equal(io.closingWorkspaces.size, 0);
    context.TaskDialog.show = async () => "discard";
    assert.equal(await io.closeDocumentWorkspace(workspace), true);
    assert.equal(closes, 1);
});

test("legacy PDN documents reject null and malformed JSON with the documented format error", async () => {
    let fixture = documentFixture();
    let filename = path.resolve(__dirname, "../js/src/io/PdnDocumentCodec.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), fixture.context, {filename: pathToFileURL(filename).href});
    for (let value of ["null", "false", "42", '"text"', "[]", "{broken", "{}",
        JSON.stringify({format: "paint.js.pdn/1", layers: null})]) {
        await assert.rejects(fixture.io.readPdn(new Blob([value])), /Unsupported \.pdn document format/);
    }
    let decoded = await fixture.io.readPdn(new Blob([JSON.stringify({
        format: "paint.js.pdn/1", width: 4, height: 3, resolution: 0, activeLayer: 0, layers: []
    })]));
    assert.equal(decoded.width, 4);
    assert.equal(decoded.height, 3);
    assert.equal(decoded.resolution, 96);
    assert.equal(decoded.layers.length, 0);
    assert.equal(fixture.state.created.length, 0, "Reading PDN metadata must not create a workspace");
});

test("drop operations own their file list while font importing waits for storage", async () => {
    let fixture = documentFixture();
    let font = {name: "Example.ttf"};
    let image = {name: "image.png"};
    let completeImport;
    let imported = [];
    fixture.context.FontManager = {
        isFontFile: file => file.name.endsWith(".ttf"),
        importFiles: () => new Promise(resolve => { completeImport = resolve; })
    };
    fixture.context.SettingsDialog = {open: () => assert.fail("Mixed drop should still open its image")};
    fixture.state.choice = "open";
    fixture.io.openFiles = async files => imported.push(...files);
    let files = [font, image];
    let dropped = fixture.io.handleDroppedFiles(files);
    files.length = 0;
    completeImport({added: [{name: "Example"}], errors: []});
    await dropped;
    assert.deepEqual(imported, [image]);
    fixture.state.dialog = null;
    await fixture.io.handleDroppedFiles([]);
    assert.equal(fixture.state.dialog, null, "An empty drop should not open a choice dialog");
});


test("document defaults accept legacy DPI and recover unavailable colors", () => {
    let {io, context} = documentFixture();
    for (let [model, expected] of [[{resolution: 144}, 144], [{}, 96],
        [{getResolution: () => null, resolution: 72}, 72], [{resolution: 0}, 96],
        [{getResolution: () => -10}, .01]]) {
        assert.equal(io.getDocumentResolution(model), expected);
    }
    for (let colors of [null, {}, {mainColor: {}, secondaryColor: {}},
        {mainColor: {toHex: () => ""}, secondaryColor: {toHex: () => ""}}]) {
        context.FormRegistry = {get: () => colors};
        assert.equal(io.getCanvasFillStyle("primary"), "#ff0000ff");
        assert.equal(io.getCanvasFillStyle("secondary"), "#ffffffff");
    }
});

test("size dialogs avoid replacing identical documents", async () => {
    let fixture = documentFixture();
    let model = {getWidth: () => 8, getHeight: () => 6, getResolution: () => 144,
        getLayers: () => ({getLayerCount: () => 2})};
    fixture.state.workspace = {getDocument: () => model};
    fixture.context.ImageSizeDialog = {open: async (mode, values) => {
        assert.ok(["resize", "canvas"].includes(mode));
        assert.deepEqual([values.width, values.height, values.resolution, values.layerCount], [8, 6, 144, 2]);
        return {width: 8, height: 6, resolution: 144};
    }};
    assert.equal(await fixture.io.resizeImage(), false);
    assert.equal(await fixture.io.changeCanvasSize(), false);
    assert.equal(fixture.state.workspace.getDocument(), model);
});

test("saving infers PNG for a single-layer document with no format or extension", async () => {
    let fixture = savingFixture({fileFormat: null, fileName: "Untitled", friendlyName: "Untitled"});
    assert.equal(await fixture.io.saveActive(), true);
    assert.equal(fixture.state.encoded[0].format, "png");
    assert.equal(fixture.state.fileInfo[3], "png");
});

test("save format lookup handles missing names and unknown identifiers", () => {
    let {SaveImageDialog} = savingFixture();
    for (let name of [undefined, null, "", "unrecognized.xyz"]) {
        assert.equal(SaveImageDialog.fromFileName(name).id, "png");
        assert.equal(SaveImageDialog.fromFileName(name, "pdn").id, "pdn");
    }
    assert.equal(SaveImageDialog.find("obsolete-format").id, "png");
    assert.equal(SaveImageDialog.fromFileName("PHOTO.JPE").id, "jpeg");
});

test("decoder rejection without an Error still produces a useful format error", async () => {
    let {io, context} = documentFixture();
    context.createImageBitmap = async () => { throw null; };
    await assert.rejects(io.loadImage(new Blob(["invalid"])), /Unsupported image format/);
});
