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
    let open = definition => {
        previews = [];
        let pending = EffectConfigDialog.open({
            title: definition.id, controls: definition.controls, values: BitmapEffectEngine.defaults(definition),
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
    await drag(curve, [0, 1], [0.2, 0.8]);
    await ready();
    check(previews.at(-1).redPoints[0][0] === 0, "Curve endpoint moved away from x=0");
    let reset = [...form().querySelectorAll("button")].find(button => button.textContent === "Reset");
    reset.click();
    result = await submit(pending);
    check(result.redPoints.every((point, index) => point[0] === index * 255 && point[1] === index * 255),
        "Curve reset did not restore its identity transfer");

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
    let tracks = [...form().querySelectorAll(".levels-vertical-track")];
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
    for (let index = 0; index < 2; ++index) {
        range.dispatchEvent(new PointerEvent("pointerdown", {button: 2, clientX, bubbles: true, cancelable: true}));
    }
    check(Number(range.value) === 0, "Double thumb press did not restore its default");
    range.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}));
    await cancel(pending);
};
