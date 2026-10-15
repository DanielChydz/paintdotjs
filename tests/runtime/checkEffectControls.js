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

module.exports = async function checkEffectControls() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let {ipcRenderer} = require("electron");
    let phase = name => ipcRenderer.send("paintdotjs:test-phase", name);
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "Effect control timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let change = element => element.dispatchEvent(new Event("change", {bubbles: true}));
    let native = async (type, element, x, y, button = "left", modifiers = []) => {
        let bounds = element.getBoundingClientRect();
        await ipcRenderer.invoke("paintdotjs:test-input", {
            type, x: Math.round(bounds.left + bounds.width * x), y: Math.round(bounds.top + bounds.height * y),
            button, modifiers, clickCount: 1
        });
        await new Promise(resolve => setTimeout(resolve, 20));
    };
    let drag = async (element, start, end, modifiers = []) => {
        await native("mouseDown", element, ...start, "left", modifiers);
        await native("mouseMove", element, ...end, "left", [...modifiers, "leftbuttondown"]);
        await native("mouseUp", element, ...end, "left", modifiers);
    };
    let source = new ImageData(8, 6);
    for (let offset = 0; offset < source.data.length; offset += 4) {
        source.data.set([offset % 256, (offset + 40) % 256, (offset + 80) % 256, 255], offset);
    }
    let previews = [];
    let open = (definition, initialValues = BitmapEffectEngine.defaults(definition)) => {
        previews = [];
        let pending = EffectConfigDialog.open({
            title: definition.id, controls: definition.controls, values: initialValues,
            layout: definition.dialog, source, onPreview: value => previews.push(value === null ? null : structuredClone(value))
        });
        return pending;
    };
    let form = () => document.querySelector(".effect-config-dialog");
    let ready = async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await waitFor(() => previews.length > 0 && !form().hasAttribute("aria-busy"));
    };
    let submit = async pending => {
        await ready();
        form().requestSubmit();
        return pending;
    };
    let cancel = async pending => {
        form().querySelector(".app-dialog-close").click();
        check(await pending === null, "Cancelled effect committed values");
    };

    phase("generic effect sliders, checkbox, select and curves");
    let definition = {
        id: "generic-control-contract",
        controls: [
            BitmapEffectEngine.range("amount", "Amount", 0, 100, 25),
            BitmapEffectEngine.checkbox("enabled", "Enabled", true),
            {type: "select", key: "mode", label: "Mode", defaultValue: "a",
                choices: [{value: "a", label: "A"}, {value: "b", label: "B"}]},
            BitmapEffectEngine.curve("curve", [[0, 0], [255, 255]])
        ]
    };
    let pending = open(definition);
    await ready();
    let range = form().querySelector("input[type=range]");
    input(range, 60);
    change(range);
    let enabled = form().querySelector(".effect-config-checkbox input");
    enabled.checked = false;
    change(enabled);
    let select = form().querySelector("select");
    select.value = "b";
    change(select);
    let curve = form().querySelector(".effect-curve-editor");
    await drag(curve, [0.5, 0.5], [0.6, 0.3]);
    await native("mouseDown", curve, 0.6, 0.3, "right");
    await native("mouseUp", curve, 0.6, 0.3, "right");
    let result = await submit(pending);
    check(result.amount === 60 && result.enabled === false && result.mode === "b", "Generic controls lost submitted values");
    check(result.curve.length === 2, "Generic curve right-click did not remove its interior point");

    phase("specialized RGB curves, channel isolation and endpoint constraints");
    pending = open(BitmapEffectEngine.DEFINITIONS.curvesEffect);
    await ready();
    select = form().querySelector(".curves-transfer-select select");
    select.value = "rgb";
    change(select);
    let channels = [...form().querySelectorAll(".curves-channel-options input")];
    channels[1].checked = false;
    change(channels[1]);
    channels[2].checked = false;
    change(channels[2]);
    curve = form().querySelector(".effect-curve-editor");
    await drag(curve, [0.5, 0.5], [0.6, 0.3]);
    await ready();
    let values = previews.at(-1);
    check(values.redPoints.length === 3 && values.greenPoints.length === 2 && values.bluePoints.length === 2,
        "Curve edits changed deselected channels");
    check(Math.abs(values.redPoints[1][0] - 153) <= 2 && Math.abs(values.redPoints[1][1] - 179) <= 2,
        "Curve drag did not update input/output coordinates");
    await native("mouseMove", curve, 0.2, 0.8);
    check(form().querySelector(".curves-coordinates").textContent.includes("51"), "Curve hover omitted input coordinates");
    await native("mouseDown", curve, 0.6, 0.3, "right");
    await native("mouseUp", curve, 0.6, 0.3, "right");
    await ready();
    check(previews.at(-1).redPoints.length === 2, "Specialized curve did not remove its interior point");
    await drag(curve, [0.01, 0.99], [0.2, 0.8]);
    await ready();
    check(previews.at(-1).redPoints[0][0] === 0, "Curve endpoint moved away from x=0");
    let reset = [...form().querySelectorAll("button")].find(button => button.textContent === "Reset");
    reset.click();
    result = await submit(pending);
    check(result.redPoints.every((point, index) => point[0] === index * 255 && point[1] === index * 255),
        "Curve reset did not restore its identity transfer");

    phase("curve programmatic normalization and canceled native pointer edits");
    let curveValues = {curve: [[0, 0], [255, 255]]};
    let curveChanges = [];
    let curveCoordinates = [];
    let editor = new CurveEditor(curveValues, committed => curveChanges.push(committed), point => curveCoordinates.push(point));
    editor.draw();
    check(editor.canvas === null, "Drawing an unmounted curve allocated its canvas");
    let editorCanvas = editor.buildElement();
    editorCanvas.style.position = "fixed";
    editorCanvas.style.left = "20px";
    editorCanvas.style.top = "200px";
    editorCanvas.style.width = "354px";
    editorCanvas.style.height = "312px";
    editorCanvas.style.zIndex = "100000";
    document.body.appendChild(editorCanvas);
    try {
        editor.setChannels([{key: "curve", color: "#ff0000"}]);
        let suppliedPoints = [[128.4, "180.1"], [-4, -7], [255.8, 290]];
        let suppliedSnapshot = JSON.stringify(suppliedPoints);
        editor.setCurve("curve", suppliedPoints);
        check(JSON.stringify(curveValues.curve) === "[[0,0],[128,180],[255,255]]"
            && JSON.stringify(suppliedPoints) === suppliedSnapshot && curveChanges.length === 0,
        "Programmatic curve update did not sort, round, clamp and copy its points without emitting a user commit");
        editor.setChannels([]);
        editorCanvas.dispatchEvent(new PointerEvent("pointerdown", {button: 0, pointerId: 99, bubbles: true}));
        check(editor.dragging.length === 0 && !editorCanvas.hasPointerCapture(99),
            "Curve without selected channels started a captured edit");
        editor.setChannels([{key: "curve", color: "#ff0000"}]);
        let pointerId = null;
        editorCanvas.addEventListener("pointerdown", event => {
            pointerId = event.pointerId;
        }, {once: true});
        await native("mouseDown", editorCanvas, 0.5, 0.3);
        check(pointerId !== null && editor.dragging.length === 1, "Native curve press did not begin a captured edit");
        let pointerBeforeLeave = editor.pointerPoint;
        editor.onPointerLeave();
        check(editor.pointerPoint === pointerBeforeLeave && editor.dragging.length === 1,
            "Leaving a captured curve canceled its active edit");
        let changesBeforeCancel = curveChanges.length;
        editorCanvas.dispatchEvent(new PointerEvent("pointercancel", {pointerId, bubbles: true}));
        check(editor.dragging.length === 0 && !editorCanvas.hasPointerCapture(pointerId)
            && curveChanges.length === changesBeforeCancel, "Pointer cancellation retained capture/an active edit or duplicated its preview");
        let canceledPoints = JSON.stringify(curveValues.curve);
        await native("mouseMove", editorCanvas, 0.9, 0.1);
        await native("mouseUp", editorCanvas, 0.9, 0.1);
        check(JSON.stringify(curveValues.curve) === canceledPoints, "Canceled curve drag continued changing its transfer points");
        await native("mouseDown", editorCanvas, 0.01, 0.99, "right");
        await native("mouseUp", editorCanvas, 0.01, 0.99, "right");
        check(JSON.stringify(curveValues.curve) === canceledPoints, "Curve context menu removed a fixed endpoint");
        await drag(editorCanvas, [0.99, 0.01], [0.8, 0.2]);
        check(curveValues.curve.at(-1)[0] === 255, "Dragging the final curve endpoint moved it away from x=255");
        await native("mouseDown", editorCanvas, 0.5, 0.5);
        editor.setCurve("curve", [[0, 0], [255, 255]]);
        await native("mouseMove", editorCanvas, 0.6, 0.4, "left", ["leftbuttondown"]);
        check(editor.dragging.length === 0 && JSON.stringify(curveValues.curve) === "[[0,0],[255,255]]",
            "Replacing a curve during a gesture resurrected its removed point");
        await native("mouseUp", editorCanvas, 0.6, 0.4);
        await native("mouseMove", editorCanvas, 0.5, 0.5);
        check(editor.pointerPoint !== null && curveCoordinates.at(-1) !== null,
            "Hovering the curve omitted its pointer guides and coordinates");
        await native("mouseMove", editorCanvas, -0.1, 0.5);
        check(editor.pointerPoint === null && curveCoordinates.at(-1) === null && editor.dragging.length === 0,
            "Leaving the curve retained its pointer guides or coordinates");
    } finally {
        await native("mouseUp", editorCanvas, 0.5, 0.3);
        editorCanvas.remove();
    }

    phase("missing specialized curves receive independent identity channels");
    pending = open(BitmapEffectEngine.DEFINITIONS.curvesEffect, {channel: "luminosity"});
    result = await submit(pending);
    for (let key of ["points", "redPoints", "greenPoints", "bluePoints"]) {
        check(JSON.stringify(result[key]) === "[[0,0],[255,255]]", "Missing curve did not receive identity: " + key);
    }
    check(result.points !== result.redPoints && result.points[0] !== result.redPoints[0],
        "Default curve channels shared mutable point arrays");
    phase("levels channel switches, automatic extents and draggable gamma");
    pending = open(BitmapEffectEngine.DEFINITIONS.levelsEffect);
    await ready();
    let levelChannels = [...form().querySelectorAll(".levels-channels input")];
    for (let checkbox of levelChannels) {
        checkbox.checked = false;
        change(checkbox);
        checkbox.checked = true;
        change(checkbox);
    }
    let auto = [...form().querySelectorAll("button")].find(button => button.textContent === "Auto");
    auto.click();
    await ready();
    values = previews.at(-1);
    let extents = BitmapEffectEngine.channelExtents(source.data);
    check(values.inputLow === Math.min(...extents.min) && values.inputHigh === Math.max(...extents.max),
        "Automatic levels did not use actual source extents");
    let levelSections = [...form().querySelectorAll(".levels-column")];
    let inputNumbers = [...levelSections[0].querySelectorAll("input[type=number]")];
    input(inputNumbers[1], 180);
    input(inputNumbers[0], 100);
    await ready();
    check(previews.at(-1).inputLow === 99 && previews.at(-1).inputHigh === 100,
        "Lowering high levels through the low endpoint did not preserve order");
    input(inputNumbers[1], 120);
    await ready();
    check(previews.at(-1).inputLow === 120 && previews.at(-1).inputHigh === 121,
        "Raising low levels through the high endpoint did not preserve order");
    let tracks = [...form().querySelectorAll(".levels-vertical-track")];
    let beforeIgnoredTracks = JSON.stringify(previews.at(-1));
    for (let track of tracks) {
        track.dispatchEvent(new PointerEvent("pointermove", {pointerId: 99, bubbles: true}));
        track.dispatchEvent(new PointerEvent("pointerup", {pointerId: 99, bubbles: true}));
        track.dispatchEvent(new PointerEvent("pointerdown", {button: 2, pointerId: 99, bubbles: true}));
    }
    check(JSON.stringify(previews.at(-1)) === beforeIgnoredTracks, "Idle/right-button levels gestures changed the preview");
    await drag(tracks[0], [0.5, 0.98], [0.5, 0.8]);
    await drag(tracks[0], [0.5, 0.02], [0.5, 0.2]);
    await drag(tracks[1], [0.5, 0.5], [0.5, 0.4]);
    await drag(tracks[1], [0.5, 0.98], [0.5, 0.9]);
    await drag(tracks[1], [0.5, 0.02], [0.5, 0.1]);
    result = await submit(pending);
    check(result.inputLow > 0 && result.inputHigh < 255 && result.inputLow < result.inputHigh,
        "Input level handles did not retain ordered bounds");
    check(result.outputLow > 0 && result.outputHigh < 255 && result.gamma !== 1 && Number.isFinite(result.gamma),
        "Output/gamma level handles did not update their values");

    phase("rotation sphere, shift snapping, pan capture and exponential zoom");
    pending = open(BitmapEffectEngine.ROTATE_ZOOM);
    await ready();
    let sphere = form().querySelector(".rotate-roll-visual");
    check(sphere !== null, "Rotation sphere was not created");
    let ignoredSphere = JSON.stringify(previews.at(-1));
    for (let type of ["pointermove", "pointerup", "pointercancel", "pointerdown"]) {
        sphere.dispatchEvent(new PointerEvent(type, {button: 2, pointerId: 99, bubbles: true}));
    }
    check(JSON.stringify(previews.at(-1)) === ignoredSphere, "Idle/right-button sphere gestures changed orientation");
    await drag(sphere, [0.5, 0.5], [0.65, 0.6]);
    await ready();
    check(previews.at(-1).rollAmount > 0, "Sphere drag did not apply roll");
    await drag(sphere, [0.5, 0.5], [0.7, 0.55], ["shift"]);
    await drag(sphere, [0.97, 0.5], [0.7, 0.05], ["shift"]);
    await ready();
    check(Math.abs(previews.at(-1).angle % 15) < 1e-9, "Shift rotation did not snap to 15 degrees");
    sphere.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}));
    await ready();
    check(previews.at(-1).angle === 0 && previews.at(-1).rollAmount === 0, "Double-click did not reset orientation");
    let pan = form().querySelector(".rotate-pan-visual");
    let ignoredPan = JSON.stringify(previews.at(-1));
    pan.dispatchEvent(new PointerEvent("pointerdown", {button: 2, pointerId: 99, bubbles: true}));
    pan.dispatchEvent(new PointerEvent("pointerup", {pointerId: 99, bubbles: true}));
    check(JSON.stringify(previews.at(-1)) === ignoredPan, "Uncaptured pan gesture changed the preview");
    await drag(pan, [0.5, 0.5], [0.8, 0.7]);
    await ready();
    check(previews.at(-1).panX > 0 && previews.at(-1).panY > 0, "Pan capture did not update both axes");
    for (let slider of form().querySelectorAll("input[type=range]")) {
        input(slider, (Number(slider.min) + Number(slider.max)) / 2);
        change(slider);
    }
    result = await submit(pending);
    check(Number.isFinite(result.zoom) && result.zoom > 0, "Exponential zoom yielded an invalid scale");

    phase("slider thumb reset detection");
    pending = open(BitmapEffectEngine.DEFINITIONS.hueAndSaturationAdjustment);
    await ready();
    range = form().querySelector("input[type=range]");
    input(range, 30);
    let bounds = range.getBoundingClientRect();
    let ratio = (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min));
    let clientX = bounds.left + 7 + ratio * Math.max(0, bounds.width - 14);
    check(EffectConfigDialog.isPointerOverSliderThumb(range, {clientX}, 14), "Thumb hit testing missed its center");
    check(!EffectConfigDialog.isPointerOverSliderThumb(range, {clientX: bounds.left - 100}, 14), "Thumb hit testing included outside coordinates");
    range.dispatchEvent(new PointerEvent("pointerdown", {button: 1, clientX, bubbles: true}));
    range.dispatchEvent(new PointerEvent("pointerdown", {button: 0, clientX: bounds.left - 100, bubbles: true}));
    let context = new MouseEvent("contextmenu", {clientX, bubbles: true, cancelable: true});
    range.dispatchEvent(context);
    check(context.defaultPrevented && Number(range.value) === 30,
        "Thumb context menu was not suppressed or an unsupported press reset its value");
    for (let index = 0; index < 2; ++index) {
        range.dispatchEvent(new PointerEvent("pointerdown", {button: 2, clientX, bubbles: true, cancelable: true}));
    }
    check(Number(range.value) === 0, "Double thumb press did not restore its default");
    range.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}));
    await cancel(pending);
    phase("preview callback failures release busy state and preserve cancellation");
    for (let asynchronous of [false, true]) {
        let failure = new Error(asynchronous ? "asynchronous preview failure" : "synchronous preview failure");
        let failures = [];
        let originalConsoleError = console.error;
        try {
            console.error = (...args) => failures.push(args);
            pending = EffectConfigDialog.open({title: "Failure contract", controls: [], values: {},
                onPreview: () => {
                    if (asynchronous) {
                        return Promise.reject(failure);
                    }
                    throw failure;
                }});
            await waitFor(() => failures.length === 1 && !form().hasAttribute("aria-busy"));
            check(failures[0][0] === "Effect preview failed" && failures[0][1] === failure,
                "Preview failure lost its original diagnostic");
            let closeButton = form().querySelector(".app-dialog-close");
            closeButton.click();
            closeButton.click();
            check(await pending === null && form() === null, "Preview failure prevented idempotent cancellation");
        } finally {
            console.error = originalConsoleError;
        }
    }
    phase("late asynchronous effect completion cannot revive a closed dialog");
    let completePreview = null;
    pending = EffectConfigDialog.open({title: "Late preview contract", controls: [], values: {},
        onPreview: () => new Promise(resolve => { completePreview = resolve; })});
    await waitFor(() => completePreview !== null && form().hasAttribute("aria-busy"));
    let closedDialog = form();
    closedDialog.querySelector(".app-dialog-close").click();
    check(await pending === null, "Cancel did not settle an in-flight preview dialog");
    completePreview();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(!closedDialog.isConnected && !closedDialog.hasAttribute("aria-busy") && form() === null,
        "Late preview completion restored a closed dialog or its busy state");
    check(EffectConfigDialog.themeColor("--missing-effect-contract-color", "#123456") === "#123456",
        "Missing theme variable did not use its requested fallback");

};
