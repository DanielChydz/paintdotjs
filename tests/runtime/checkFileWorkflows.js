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

module.exports = async function checkFileWorkflows() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "File workflow timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let change = (element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("change", {bubbles: true}));
    };
    let choose = title => {
        let button = [...document.querySelectorAll(".task-dialog-choice")]
            .find(candidate => candidate.querySelector("strong")?.textContent === title);
        check(button !== undefined, "Missing file workflow choice: " + title);
        button.click();
    };
    let pixels = workspace => {
        let model = workspace.getDocument();
        return workspace.getActiveLayer().getSurface().context
            .getImageData(0, 0, model.getWidth(), model.getHeight()).data;
    };
    let equal = (actual, expected, message) => {
        check(actual.length === expected.length && actual.every((value, index) => value === expected[index]), message);
    };
    let closeAll = () => {
        for (let workspace of [...app.getDocumentWorkspaces()]) {
            app.closeDocumentWorkspace(workspace, false);
        }
    };
    let reject = async (operation, pattern) => {
        let rejected = false;
        try {
            await operation();
        } catch (error) {
            check(pattern.test(error.message), "Unexpected file workflow error: " + error.message);
            rejected = true;
        }
        check(rejected, "Invalid file operation succeeded");
    };
    closeAll();
    check(!await DocumentIO.resizeImage() && !await DocumentIO.changeCanvasSize()
        && !await DocumentIO.saveActive() && !await DocumentIO.printActive(), "Empty workspace accepted a document command");

    phase("actual image and layered PDN imports");
    let canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 2;
    let context = canvas.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = "blue";
    context.fillRect(2, 0, 2, 2);
    let expected = context.getImageData(0, 0, 4, 2).data;
    let png = await ImageEncoder.encode(canvas, "png");
    let file = new window.File([png], "Source.PNG", {type: "image/png"});
    let workspace = await DocumentIO.openImage(file);
    check(workspace.fileName === "Source.PNG" && workspace.getActiveLayer().properties.name === "Source"
        && !workspace.isDirty(), "Image import lost filename or saved state");
    equal(pixels(workspace), expected, "Image import changed pixels");
    await DocumentIO.addFileAsLayer(file);
    check(workspace.getDocument().getLayers().getLayerCount() === 2 && workspace.isDirty(), "Image layer import lost its layer");
    let pdn = new window.File([await DocumentIO.serializePdn(workspace)], "Layers.pdn");
    await DocumentIO.addFileAsLayer(pdn);
    check(workspace.getDocument().getLayers().getLayerCount() === 4, "PDN layer import did not preserve every layer");
    closeAll();
    await DocumentIO.addFileAsLayer(pdn);
    workspace = app.getActiveDocumentWorkspace();
    check(workspace.getDocument().getLayers().getLayerCount() === 2, "PDN layer import without a document did not open its layers");
    closeAll();
    await DocumentIO.addFileAsLayer(file);
    workspace = app.getActiveDocumentWorkspace();
    check(workspace.getDocument().getWidth() === 4 && workspace.getDocument().getLayers().getLayerCount() === 2,
        "Image layer import without a document lost canvas/layer structure");
    closeAll();
    workspace = app.createBlankDocumentInNewWorkspace(2, 1);
    await DocumentIO.addFileAsLayer(file);
    check(workspace.getDocument().getWidth() === 4 && workspace.getDocument().getHeight() === 2,
        "Larger imported layer did not expand its canvas");
    equal(pixels(workspace), expected, "Expanded layer import lost its pixels");

    phase("drop actions and explicit import failures");
    let alerts = [];
    let originalAlert = window.alert;
    window.alert = message => alerts.push(message);
    try {
        let invalid = new window.File(["invalid"], "Broken.png");
        await DocumentIO.openFiles([invalid, file, pdn]);
        check(alerts.length === 1 && alerts[0].includes("Broken.png"), "Failed import did not name the rejected file");
        check(app.getDocumentWorkspaces().length === 3, "Batch import stopped after a rejected file");
        for (let title of ["Cancel", "Open", "Add layer"]) {
            let before = app.getDocumentWorkspaces().length;
            let active = app.getActiveDocumentWorkspace();
            let layers = active.getDocument().getLayers().getLayerCount();
            let pending = DocumentIO.handleDroppedFiles([file]);
            await waitFor(() => document.querySelector(".task-dialog") !== null);
            choose(title);
            await pending;
            if (title === "Open") {
                check(app.getDocumentWorkspaces().length === before + 1, "Drop-open did not create a document");
            } else if (title === "Add layer") {
                check(active.getDocument().getLayers().getLayerCount() === layers + 1, "Drop-layer did not add a layer");
            } else {
                check(app.getDocumentWorkspaces().length === before, "Cancelled drop created a document");
            }
        }
        let pending = DocumentIO.handleDroppedFiles([invalid, file]);
        choose("Add layers");
        await pending;
        check(alerts.at(-1).includes("Could not add") && alerts.at(-1).includes("Broken.png"),
            "Drop-layer failure did not surface its filename");
    } finally {
        window.alert = originalAlert;
    }

    phase("resize and canvas dialogs preserve pixels and undo state");
    closeAll();
    workspace = await DocumentIO.openImage(file);
    for (let command of ["resizeImage", "changeCanvasSize"]) {
        let pending = DocumentIO[command]();
        document.querySelector(".image-size-dialog .app-dialog-close").click();
        check(!await pending, "Cancelled resize changed the document");
    }
    let originalDocument = workspace.getDocument();
    let resizing = DocumentIO.resizeImage();
    let form = document.querySelector(".image-size-dialog");
    let choices = [...form.querySelectorAll("input[type=radio]")];
    choices[1].checked = true;
    choices[1].dispatchEvent(new Event("change", {bubbles: true}));
    let maintain = form.querySelector(".image-size-maintain input");
    maintain.checked = false;
    maintain.dispatchEvent(new Event("change", {bubbles: true}));
    let numbers = [...form.querySelectorAll("input[type=number]")];
    input(numbers[1], 8);
    input(numbers[2], 4);
    change(form.querySelector(".image-size-resampling-row select"), "nearestNeighbor");
    form.requestSubmit();
    check(await resizing, "Resize dialog did not resize the document");
    check(workspace.getDocument().getWidth() === 8 && workspace.getDocument().getHeight() === 4, "Resize used incorrect dimensions");
    let resized = pixels(workspace);
    for (let y = 0; y < 4; ++y) {
        for (let x = 0; x < 8; ++x) {
            equal(resized.subarray((y * 8 + x) * 4, (y * 8 + x + 1) * 4),
                expected.subarray((Math.floor(y / 2) * 4 + Math.floor(x / 2)) * 4,
                    (Math.floor(y / 2) * 4 + Math.floor(x / 2) + 1) * 4), "Nearest resize did not replicate source pixels");
        }
    }
    workspace.getHistory().stepBackward();
    check(workspace.getDocument() === originalDocument, "Resize undo lost the original document");
    workspace.getHistory().stepForward();
    equal(pixels(workspace), resized, "Resize redo lost resized pixels");
    workspace.getHistory().stepBackward();
    for (let [fill, rgba] of [
        ["transparent", [0, 0, 0, 0]], ["white", [255, 255, 255, 255]],
        ["black", [0, 0, 0, 255]], ["primary", [17, 34, 51, 255]], ["secondary", [68, 85, 102, 255]]
    ]) {
        FormRegistry.get("colorsForm").setMainColor(new Color(17, 34, 51));
        FormRegistry.get("colorsForm").setSecondaryColor(new Color(68, 85, 102));
        let pending = DocumentIO.changeCanvasSize();
        form = document.querySelector(".image-size-dialog");
        numbers = [...form.querySelectorAll("input[type=number]")];
        input(numbers[1], 8);
        input(numbers[2], 4);
        let selects = [...form.querySelectorAll("select")];
        change(selects.find(select => [...select.options].some(option => option.value === "bottomRight")), "bottomRight");
        change(form.querySelector(".image-size-fill-row select"), fill);
        form.requestSubmit();
        check(await pending, "Canvas dialog did not resize");
        let layer = workspace.getActiveLayer().getSurface();
        equal(layer.context.getImageData(0, 0, 1, 1).data, rgba, "Canvas padding fill is incorrect: " + fill);
        equal(layer.context.getImageData(4, 2, 4, 2).data, expected, "Anchored canvas resize moved or changed source pixels");
        workspace.getHistory().stepBackward();
        equal(pixels(workspace), expected, "Canvas resize undo lost source pixels");
    }
    check(DocumentIO.getCanvasFillStyle("unknown") === null, "Unknown canvas fill acquired a color");

    phase("large paste cancellation, clipping, overflow and atomic undo");
    for (let choice of ["Cancel", "Keep canvas size", "Expand canvas"]) {
        closeAll();
        workspace = app.createBlankDocumentInNewWorkspace(2, 1);
        let surface = workspace.getActiveLayer().getSurface();
        surface.context.fillStyle = "green";
        surface.context.fillRect(0, 0, 2, 1);
        workspace.getHistory().clearAll();
        let before = pixels(workspace);
        let pasting = DocumentIO.pasteBlob(png);
        await waitFor(() => document.querySelector(".task-dialog") !== null);
        choose(choice);
        let pasted = await pasting;
        if (choice === "Cancel") {
            check(!pasted && workspace.getHistory().undoStack.length === 0, "Cancelled paste altered history");
            equal(pixels(workspace), before, "Cancelled paste changed pixels");
            continue;
        }
        check(pasted && app.getActiveTool() instanceof MoveTool, "Paste did not create an editable bitmap");
        DocumentIO.finishActiveTool(false);
        check(workspace.getDocument().getWidth() === (choice === "Expand canvas" ? 4 : 2), "Paste canvas choice was ignored");
        let after = pixels(workspace);
        check(after[0] === 255 && after[1] === 0, "Pasted source was not drawn");
        let steps = workspace.getHistory().undoStack.length;
        for (let index = 0; index < steps; ++index) {
            workspace.getHistory().stepBackward();
        }
        check(workspace.getDocument().getWidth() === 2 && workspace.getDocument().getHeight() === 1,
            "Paste undo did not restore original dimensions");
        equal(pixels(workspace), before, "Paste undo lost its original underlay");
        for (let index = 0; index < steps; ++index) {
            workspace.getHistory().stepForward();
        }
        equal(pixels(workspace), after, "Paste redo lost committed pixels");
    }
    closeAll();
    check(await DocumentIO.pasteBlob(png), "Paste without a document failed");
    workspace = app.getActiveDocumentWorkspace();
    check(workspace.getDocument().getWidth() === 4 && workspace.getDocument().getHeight() === 2,
        "Paste without a document used incorrect dimensions");
    DocumentIO.finishActiveTool(false);
    equal(pixels(workspace), expected, "Paste without a document changed pixels");

    phase("file picker capabilities and actual writable handle bytes");
    let fs = require("node:fs/promises");
    let filePath = require("node:path").join(require("node:process").env.PAINTDOTJS_TEST_USER_DATA, "handle.png");
    let oldOpenPicker = window.showOpenFilePicker;
    let oldSavePicker = window.showSaveFilePicker;
    let calls = [];
    let handle = {
        name: "handle.png",
        getFile: async () => new window.File([await fs.readFile(filePath)], "handle.png", {type: "image/png"}),
        createWritable: async () => {
            let chunks = [];
            return {
                write: async blob => chunks.push(Buffer.from(await blob.arrayBuffer())),
                close: async () => fs.writeFile(filePath, Buffer.concat(chunks))
            };
        }
    };
    try {
        let openCalls = 0;
        window.showOpenFilePicker = async options => {
            ++openCalls;
            if (options.types !== undefined) {
                throw new TypeError("Uncommon extension fixture");
            }
            return [{getFile: async () => file}];
        };
        await DocumentIO.openFilePicker();
        check(openCalls === 2 && app.getActiveDocumentWorkspace().fileHandle !== null,
            "Open picker did not retry unsupported type filters or retain its handle");
        workspace = app.getActiveDocumentWorkspace();
        workspace.setFileInfo("Source.PNG", null, null, "png", {});
        workspace.setDirty(true);
        window.showSaveFilePicker = async options => {
            calls.push(options);
            if (options.types !== undefined) {
                throw new TypeError("Uncommon MIME fixture");
            }
            return handle;
        };
        check(await DocumentIO.saveActive(), "Writable handle save did not complete");
        check(calls.length === 2 && !workspace.isDirty() && workspace.fileHandle === handle,
            "Save picker retry did not retain its handle/saved state");
        let saved = await DocumentIO.loadImage(await handle.getFile());
        let restored = document.createElement("canvas");
        restored.width = 4;
        restored.height = 2;
        restored.getContext("2d").drawImage(saved, 0, 0);
        equal(restored.getContext("2d").getImageData(0, 0, 4, 2).data, expected, "Writable handle changed encoded pixels");
        saved.close();
        window.showSaveFilePicker = async () => {
            throw new DOMException("Cancelled", "AbortError");
        };
        workspace.setFileInfo("other.png", {name: "wrong.pdn"}, null, "png", {});
        workspace.setDirty(true);
        check(!await DocumentIO.saveActive() && workspace.isDirty(), "Cancelled replacement handle save cleared dirty state");
        window.showSaveFilePicker = async () => {
            throw new Error("Explicit picker failure");
        };
        await reject(() => DocumentIO.saveActive(), /Explicit picker failure/);
        for (let name of ["AbortError", "UnexpectedError"]) {
            window.showOpenFilePicker = async () => {
                throw new DOMException("Open failure", name);
            };
            if (name === "AbortError") {
                let count = app.getDocumentWorkspaces().length;
                await DocumentIO.openFilePicker();
                check(app.getDocumentWorkspaces().length === count, "Cancelled open created a document");
            } else {
                await reject(() => DocumentIO.openFilePicker(), /Open failure/);
            }
        }
    } finally {
        window.showOpenFilePicker = oldOpenPicker;
        window.showSaveFilePicker = oldSavePicker;
    }

    phase("save all restores original workspace and propagates write failure");
    closeAll();
    let path = require("node:path");
    let first = await DocumentIO.openImage(file);
    let second = await DocumentIO.openImage(file);
    for (let [index, current] of [first, second].entries()) {
        current.setFileInfo("saved-" + index + ".png", null,
            path.join(require("node:process").env.PAINTDOTJS_TEST_USER_DATA, "all-" + index + ".png"), "png", {});
        current.setDirty(true);
    }
    app.setActiveDocumentWorkspace(first);
    check(await DocumentIO.saveAll() && app.getActiveDocumentWorkspace() === first && !first.isDirty() && !second.isDirty(),
        "Save-all did not save every dirty document and restore its original workspace");
    check(await DocumentIO.saveAll(true), "Save-all rejected clean documents");
    second.setFileInfo("missing.png", null,
        path.join(require("node:process").env.PAINTDOTJS_TEST_USER_DATA, "missing-directory", "missing.png"), "png", {});
    second.setDirty(true);
    await reject(() => DocumentIO.saveAll(), /ENOENT/);
    check(app.getActiveDocumentWorkspace() === first && second.isDirty(), "Save-all failure lost original focus or dirty state");
    closeAll();
    check(await DocumentIO.saveAll(), "Empty save-all did not finish");
    canvas.width = 0;
    canvas.height = 0;
};
