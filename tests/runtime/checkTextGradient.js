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

module.exports = async function checkTextGradient() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(160, 120);
    let unrelated = app.createBlankDocumentInNewWorkspace(2, 2);
    app.setActiveDocumentWorkspace(workspace);
    let surface = workspace.getActiveLayer().getSurface();
    let history = workspace.getHistory();
    let colors = FormRegistry.get("colorsForm");
    colors.setMainColor(Color.fromRGBA(255, 0, 0, 255));
    colors.setSecondaryColor(Color.fromRGBA(0, 0, 255, 255));
    let start = (type, settings = {}) => {
        app.setActiveTool(null);
        workspace.getSelection().reset();
        history.clearAll();
        surface.context.clearRect(0, 0, 160, 120);
        type.resetSettings();
        for (let [key, value] of Object.entries(settings)) {
            type.setSetting(key, value);
        }
        app.setActiveToolFromType(type);
        return app.getActiveTool();
    };
    phase("actual gradient shaders against independent color geometry");
    let gradient = start(ToolType.GRADIENT);
    let first = new Point(8, 8);
    let last = new Point(16, 8);
    let types = ["linear", "reflected", "diamond", "radial", "conical", "spiral", "spiralCounter", "unknown"];
    let fraction = value => value - Math.floor(value);
    for (let type of types) {
        for (let repeat of ["none", "wrapped", "reflected", "unknown"]) {
            let canvas = gradient.renderGradientCanvas(32, 24, first, last, [1, 0, 0, 1], [0, 0, 1, 1], type, repeat);
            check(canvas !== null && gradient.gradientGl !== null, "SwiftShader gradient rendering is unavailable");
            let copy = document.createElement("canvas");
            copy.width = 32;
            copy.height = 24;
            copy.getContext("2d").drawImage(canvas, 0, 0);
            for (let [x, y] of [[3, 4], [11, 10], [22, 13], [30, 22]]) {
                let dx = (x + 0.5 - 8) / 8;
                let dy = (y + 0.5 - 8) / 8;
                let angle = Math.atan2(dy, dx) / (2 * Math.PI);
                let distance = Math.hypot(dx, dy);
                let t = type === "reflected" ? Math.abs(dx)
                    : type === "diamond" ? Math.abs(dx) + Math.abs(dy)
                    : type === "radial" ? distance
                    : type === "conical" ? fraction(angle + 1)
                    : type === "spiral" ? fraction(angle + distance + 1)
                    : type === "spiralCounter" ? fraction(-angle + distance + 1) : dx;
                t = repeat === "wrapped" ? fraction(t)
                    : repeat === "reflected" ? 1 - Math.abs((t - 2 * Math.floor(t / 2)) - 1)
                    : Math.max(0, Math.min(1, t));
                let pixel = copy.getContext("2d").getImageData(x, y, 1, 1).data;
                check(Math.abs(pixel[0] - Math.round(255 * (1 - t))) <= 1
                    && pixel[1] === 0 && Math.abs(pixel[2] - Math.round(255 * t)) <= 1 && pixel[3] === 255,
                "Gradient shader differs from its geometric oracle: " + type + "/" + repeat);
            }
        }
    }
    let program = gradient.gradientProgram;
    gradient.renderGradientCanvas(32, 24, first, last, [1, 0, 0, 1], [0, 0, 1, 1], "linear", "none");
    check(gradient.gradientProgram === program, "Gradient renderer recompiled an unchanged program");
    gradient.disposeGradientRenderer();
    check(gradient.gradientGl === null && gradient.gradientProgram === null && gradient.gradientCanvas === null,
        "Gradient disposal retained GPU resources");

    phase("transparency gradients preserve preview history for both paint buttons");
    colors.setMainColor(Color.fromRGBA(255, 0, 0, 128));
    colors.setSecondaryColor(Color.fromRGBA(0, 0, 255, 64));
    for (let button of [MouseButton.LEFT, MouseButton.RIGHT]) {
        gradient = start(ToolType.GRADIENT, {gradientMode: "transparency"});
        surface.context.fillStyle = "white";
        surface.context.fillRect(0, 0, 160, 120);
        let before = surface.context.getImageData(0, 0, 160, 120).data;
        gradient.onMouseDown(8, 8, button);
        gradient.onMouseMove(80, 8);
        gradient.onMouseUp(80, 8, button);
        gradient.commitPending();
        let after = surface.context.getImageData(0, 0, 160, 120).data;
        let expected = button === MouseButton.LEFT ? 128 : 191;
        check(Math.abs(after[(8 * 160 + 8) * 4 + 3] - expected) <= 2, "Transparency gradient reversed its starting alpha");
        let steps = history.undoStack.length;
        for (let index = 0; index < steps; ++index) {
            history.stepBackward();
        }
        check(surface.context.getImageData(0, 0, 160, 120).data.every((value, index) => value === before[index]),
            "Transparency gradient undo did not restore alpha");
        for (let index = 0; index < steps; ++index) {
            history.stepForward();
        }
        check(surface.context.getImageData(0, 0, 160, 120).data.every((value, index) => value === after[index]),
            "Transparency gradient redo did not restore alpha");
    }
    app.setActiveTool(null);
    let getContext = HTMLCanvasElement.prototype.getContext;
    try {
        HTMLCanvasElement.prototype.getContext = function (type, ...options) {
            return type === "webgl2" ? null : getContext.call(this, type, ...options);
        };
        for (let type of ["linear", "radial", "diamond"]) {
            gradient = start(ToolType.GRADIENT, {gradientType: type});
            gradient.onMouseDown(8, 8, MouseButton.LEFT);
            gradient.onMouseMove(80, 8);
            gradient.onMouseUp(80, 8, MouseButton.LEFT);
            check(gradient.gradientGl === null && surface.context.getImageData(12, 8, 1, 1).data[3] > 0,
                "Gradient did not fall back to Canvas when WebGL2 was unavailable");
            gradient.commitPending();
        }
    } finally {
        HTMLCanvasElement.prototype.getContext = getContext;
    }

    phase("multiline caret placement, viewport focus and text cancellation");
    colors.setMainColor(Color.fromRGBA(0, 0, 0, 255));
    let text = start(ToolType.TEXT, {fontFamily: "monospace", fontSize: 12, fontUnit: "pixels"});
    check(!text.onMouseDown(20, 20, MouseButton.MIDDLE) && !text.onMouseDown(20, 20, MouseButton.RIGHT),
        "Inactive text accepted a nonleft insertion");
    check(!text.onMouseMove(20, 20) && !text.onMouseUp(20, 20) && !text.onKeyPress("Escape"),
        "Inactive text consumed editing commands");
    check(!text.commitPending() && !text.cancelPending(), "Inactive text completed nonexistent previews");
    text.onSettingChanged();
    text.onMouseDown(30, 30, MouseButton.LEFT);
    await frame();
    text.editor.value = "abcd\nxy";
    text.editor.dispatchEvent(new Event("input"));
    let context = surface.context;
    context.save();
    context.font = text.getFontString();
    let glyphWidth = context.measureText("a").width;
    context.restore();
    text.placeCaretAt(new Point(30 + glyphWidth * 1.1, text.getTextTop() + 1));
    await frame();
    check(text.editor.selectionStart === 1 && !text.caretElement.hidden, "Click did not place the caret between measured glyphs");
    text.placeCaretAt(new Point(1000, text.getTextTop() + text.getLineHeight() + 1));
    await frame();
    check(text.editor.selectionStart === 7, "Multiline caret placement omitted the newline offset");
    text.onMouseDown(31, text.getTextTop() + 1, MouseButton.LEFT);
    await frame();
    check(text.pending && text.editor.value === "abcd\nxy", "Inside-text click restarted the editor");
    app.fire("document:update_viewport", unrelated);
    app.fire("app:resize");
    colors.setMainColor(Color.fromRGBA(200, 20, 30, 255));
    text.syncEditorToViewport();
    text.syncEditorToViewport();
    await frame();
    check(document.activeElement === text.editor && !text.caretElement.hidden, "Viewport synchronization lost text focus/caret");
    text.editor.blur();
    text.updateCaret();
    check(text.caretElement.hidden, "Blurred text retained its visible caret");
    text.focusEditor(null);
    await frame();
    check(document.activeElement === text.editor, "Text focus was not restored");
    check(text.usesContinuousPointerCoordinates(), "Pending text discarded fractional pointer routing");
    let editor = text.editor;
    for (let name of ["pointermove", "pointerup", "mousedown", "auxclick", "contextmenu"]) {
        editor.dispatchEvent(new MouseEvent(name, {button: 0, bubbles: true, cancelable: true}));
    }
    let middle = new PointerEvent("pointerdown", {button: 1, bubbles: true, cancelable: true});
    editor.dispatchEvent(middle);
    check(middle.defaultPrevented, "Middle mouse initiated text insertion");
    for (let event of [
        new MouseEvent("mousedown", {button: 1, bubbles: true, cancelable: true}),
        new MouseEvent("auxclick", {button: 1, bubbles: true, cancelable: true}),
        new ClipboardEvent("paste", {bubbles: true, cancelable: true}),
        new InputEvent("beforeinput", {inputType: "insertFromPaste", bubbles: true, cancelable: true})
    ]) {
        editor.dispatchEvent(event);
        check(event.defaultPrevented, "Middle-button paste protection missed " + event.type);
    }
    text.blockMiddlePasteUntil = 0;
    for (let event of [
        new ClipboardEvent("paste", {bubbles: true, cancelable: true}),
        new InputEvent("beforeinput", {inputType: "insertFromPaste", bubbles: true, cancelable: true}),
        new InputEvent("beforeinput", {inputType: "insertText", bubbles: true, cancelable: true})
    ]) {
        editor.dispatchEvent(event);
        check(!event.defaultPrevented, "Expired middle-button protection blocked ordinary typing/paste");
    }
    text.cancelPending();
    check(text.editor === null && text.originNub === null && history.undoStack.length === 0,
        "Text cancellation retained editors, handles or undo entries");
    check(surface.context.getImageData(0, 0, 160, 120).data.every(value => value === 0), "Text cancellation retained preview pixels");
    text.focusEditor();
    text.placeCaretAt(new Point());
    text.destroyNub();
    text.positionEditor();
    text.updateEditorStyle();
    text.updateEditorDimensions();
    check(!text.renderPreview(), "Inactive text rendered a preview");

    phase("text keyboard shortcuts, empty commits and native editor dragging");
    for (let key of [
        {key: "Escape"}, {key: "Enter", ctrlKey: true}, {key: "Enter", metaKey: true}, {key: "z", ctrlKey: true}
    ]) {
        text.onMouseDown(30, 30, MouseButton.LEFT);
        text.editor.value = "keyboard";
        text.editor.dispatchEvent(new Event("input"));
        text.editor.dispatchEvent(new KeyboardEvent("keydown", {...key, bubbles: true, cancelable: true}));
        check(document.querySelector(".error-form-stack") === null,
            "Text finishing shortcut raised an application error: " + document.querySelector(".error-form-stack")?.textContent);
        check(!text.pending && text.editor === null, "Text finishing shortcut retained its preview: " + key.key);
    }
    text.onMouseDown(30, 30, MouseButton.LEFT);
    let count = history.undoStack.length;
    text.commitPending();
    check(history.undoStack.length === count, "Empty text commit created pixel history");
    text.onMouseDown(30, 30, MouseButton.LEFT);
    text.editor.value = "drag";
    text.editor.dispatchEvent(new Event("input"));
    await frame();
    let {ipcRenderer} = require("electron");
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseMove", x: 500, y: 400});
    await frame();
    let rect = text.editor.getBoundingClientRect();
    let nativePoint = {x: Math.round(rect.left + 4), y: Math.round(rect.top + 4)};
    let oldOrigin = text.textOrigin.clone();
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseDown", ...nativePoint, button: "right", clickCount: 1});
    await new Promise(resolve => setTimeout(resolve, 20));
    check(text.tracking, "Native right-button editor drag did not capture the pointer: " + JSON.stringify({
        point: nativePoint, rect: rect.toJSON(), target: document.elementFromPoint(nativePoint.x, nativePoint.y)?.outerHTML.slice(0, 200)
    }));
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseMove", x: nativePoint.x + 10, y: nativePoint.y + 8,
        modifiers: ["rightbuttondown"]});
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseUp", x: nativePoint.x + 10, y: nativePoint.y + 8,
        button: "right", clickCount: 1});
    await new Promise(resolve => setTimeout(resolve, 20));
    check(!text.tracking && text.textOrigin.x > oldOrigin.x && text.textOrigin.y > oldOrigin.y,
        "Native editor drag did not move and release its text origin");
    for (let key of [{key: "a"}, {key: "a", ctrlKey: true}, {key: "c", metaKey: true},
        {key: "q", altKey: true}, {key: "F12"}, {key: "b", ctrlKey: true}]) {
        text.editor.dispatchEvent(new KeyboardEvent("keydown", {...key, bubbles: true, cancelable: true}));
    }
    text.cancelPending();
    app.closeDocumentWorkspace(unrelated, false);
    app.closeDocumentWorkspace(workspace, false);
};
