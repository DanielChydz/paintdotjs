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

module.exports = async function checkToolbarWindows() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let input = (element, value, type = "input") => {
        element.value = String(value);
        element.dispatchEvent(new Event(type, {bubbles: true}));
    };
    let key = (element, value, modifiers = {}) => element.dispatchEvent(
        new KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true, ...modifiers}));
    let mouse = (target, type, x, y, button = 0) => target.dispatchEvent(new MouseEvent(
        type, {clientX: x, clientY: y, button, bubbles: true, cancelable: true}));
    let tick = () => new Promise(resolve => setTimeout(resolve, 150));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(128, 128);
    workspace.setZoom(4);
    let toolbar = PanelRegistry.get("toolMenu");
    let option = name => toolbar.optionsElement.querySelector('[data-option-key="' + name + '"]');

    phase("toolbar sizes, presets, keyboard stepping and outside-click cleanup");
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    let widthGroup = option("width");
    let widthInput = widthGroup.querySelector("input");
    input(widthInput, 23);
    check(ToolType.PAINT_BRUSH.getSetting("width") === 23, "Width input did not update tool settings");
    input(widthInput, "");
    check(ToolType.PAINT_BRUSH.getSetting("width") === 23, "Incomplete width input changed settings");
    input(widthInput, "invalid");
    key(widthInput, "ArrowUp");
    check(ToolType.PAINT_BRUSH.getSetting("width") === 24, "Invalid width stepping lost the previous value");
    widthGroup.querySelector('[title^="Decrease"]').click();
    widthGroup.querySelector('[title^="Increase"]').click();
    check(ToolType.PAINT_BRUSH.getSetting("width") === 24, "Size +/- buttons lost their step");
    key(widthInput, "Enter");
    check(widthInput.selectionStart === 0 && widthInput.selectionEnd === widthInput.value.length,
        "Enter did not select the accepted size");
    let arrow = widthGroup.querySelector(".tool-size-arrow");
    arrow.click();
    check(toolbar.sizeMenu !== null && toolbar.sizeMenu.children[0].textContent === "24",
        "Nonpreset size was not included as the current menu value");
    check(arrow.getAttribute("aria-expanded") === "true", "Size menu did not update accessibility state");
    mouse(widthInput, "pointerdown", 0, 0);
    check(toolbar.sizeMenu !== null, "Clicking the owner closed its size menu");
    toolbar.sizeMenu.querySelectorAll("button")[1].click();
    check(ToolType.PAINT_BRUSH.getSetting("width") === 1 && toolbar.sizeMenu === null,
        "Choosing a preset did not update/close the size menu");
    arrow.click();
    arrow.click();
    check(toolbar.sizeMenu === null, "Repeated size-arrow click did not close the menu");
    key(widthInput, "ArrowDown", {altKey: true});
    check(toolbar.sizeMenu !== null, "Alt+Down did not open the size menu");
    key(widthInput, "Escape");
    check(toolbar.sizeMenu === null && arrow.getAttribute("aria-expanded") === "false",
        "Escape did not close the size menu");
    arrow.click();
    document.body.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
    check(toolbar.sizeMenu === null, "Outside pointer did not close the size menu");
    input(widthInput, "", "change");
    check(ToolType.PAINT_BRUSH.getSetting("width") === 1, "Empty committed width did not clamp to its minimum");
    let bottomControl = toolbar.createSizeControl(ToolType.PAINT_BRUSH,
        {key: "width", label: "Size", min: 1, max: 2000, step: 1, presets: [1, 5, 10]});
    bottomControl.style.position = "fixed";
    bottomControl.style.bottom = "0";
    document.body.appendChild(bottomControl);
    bottomControl.querySelector(".tool-size-arrow").click();
    check(toolbar.sizeMenu.style.bottom !== "" && toolbar.sizeMenu.style.top === "",
        "A bottom-edge size menu did not open upward");
    toolbar.closeSizeMenu();
    bottomControl.remove();
    let plainSize = toolbar.createSizeControl(ToolType.PAINT_BRUSH,
        {key: "width", label: "", min: 1, max: 2000, step: 1, presets: null});
    check(plainSize.querySelector('input[type="number"]') !== null, "A size without presets did not use a numeric field");

    phase("toolbar tolerance meters, selection quality, shape radius and font toggles");
    app.setActiveToolFromType(ToolType.PAINT_BUCKET);
    let tolerance = option("tolerance");
    input(tolerance.querySelector("input"), 55);
    check(ToolType.PAINT_BUCKET.getSetting("tolerance") === 55
        && tolerance.querySelector(".tool-slider-fill").style.width === "55%", "Tolerance meter is stale");
    tolerance.querySelector('[title^="Decrease"]').click();
    check(ToolType.PAINT_BUCKET.getSetting("tolerance") === 54, "Tolerance decrease did not update settings");
    tolerance.querySelector('[title^="Increase"]').click();
    check(ToolType.PAINT_BUCKET.getSetting("tolerance") === 55, "Tolerance increase did not update settings");
    app.setActiveToolFromType(ToolType.RECTANGLE_SELECT);
    option("combineMode").querySelectorAll("button")[1].click();
    check(ToolType.RECTANGLE_SELECT.getSetting("combineMode") === "union", "Selection mode button did not update settings");
    toolbar.updateSetting(ToolType.RECTANGLE_SELECT, "renderingQuality", "aliased");
    check(ToolType.RECTANGLE_SELECT.getSetting("renderingQuality") === "aliased"
        && app.getActiveTool().newSelectionRenderer !== null, "Selection quality did not reach the active tool");
    toolbar.updateSetting(ToolType.RECTANGLE_SELECT, "selectionMode", "fixedSize");
    check(option("selectionWidth") !== null && option("selectionHeight") !== null,
        "Fixed-size selection did not rebuild its dimension controls");
    toolbar.updateSetting(ToolType.RECTANGLE_SELECT, "selectionMode", "normal");
    app.setActiveToolFromType(ToolType.SHAPES);
    option("shape").querySelector("button").click();
    let shapePicker = ToolOptionDropdown.active;
    let shapeButtons = [...shapePicker.menu.querySelectorAll(".tool-shape-grid button")];
    let shapeEntries = shapePicker.options.shapeGroups.flatMap(group => group.values)
        .map(value => shapePicker.options.values.find(entry => entry[0] === value));
    check(shapeButtons.length === shapeEntries.length && shapeButtons.length > 20,
        "Shape picker omitted grouped catalog entries");
    for (let [index, button] of shapeButtons.entries()) {
        check(button.title === shapeEntries[index][1] && button.getAttribute("aria-label") === button.title
            && button.querySelector("img").getAttribute("src") !== "", "Grouped shape lost its accessible label/icon");
    }
    let selectedShape = shapeEntries.find(entry => entry[0] !== ToolType.SHAPES.getSetting("shape"));
    shapeButtons.find(button => button.title === selectedShape[1]).click();
    check(shapePicker.menu === null && ToolType.SHAPES.getSetting("shape") === selectedShape[0],
        "Grouped shape selection did not update the actual tool and close the picker");
    option("shape").querySelector("button").click();
    shapePicker = ToolOptionDropdown.active;
    check(shapePicker.menu.querySelectorAll(".tool-shape-grid button[active]").length === 1
        && shapePicker.menu.querySelector(".tool-shape-grid button[active]").title === selectedShape[1],
    "Reopened shape picker did not identify its current selection");
    shapePicker.close();
    let partialChanges = [];
    let partialShapes = new ToolOptionDropdown({
        value: "custom", values: [["custom", "Custom shape"]], width: 64, shapeGrid: true,
        shapeGroups: [{label: "Custom", values: ["removed", "custom"]}],
        onChange: value => partialChanges.push(value)
    });
    document.body.appendChild(partialShapes.getElement());
    try {
        partialShapes.open();
        await tick();
        let customButtons = [...partialShapes.menu.querySelectorAll(".tool-shape-grid button")];
        check(customButtons.length === 1 && customButtons[0].title === "Custom shape",
            "Partial shape metadata did not skip an unavailable entry");
        let fallbackIcon = customButtons[0].querySelector("img");
        await fallbackIcon.decode();
        let svg = new DOMParser().parseFromString(
            decodeURIComponent(fallbackIcon.src.slice(fallbackIcon.src.indexOf(",") + 1)), "image/svg+xml");
        check(fallbackIcon.naturalWidth > 0 && svg.querySelector("parsererror") === null
            && svg.documentElement.getAttribute("viewBox") === "0 0 32 32"
            && svg.querySelector("rect")?.getAttribute("width") === "24",
        "Unknown custom shape did not render a valid self-contained rectangle fallback icon");
        customButtons[0].click();
        check(partialShapes.menu === null && partialChanges.length === 1 && partialChanges[0] === "custom",
            "Custom grouped shape did not dispatch its selection and close");
    } finally {
        partialShapes.close();
        partialShapes.getElement().remove();
    }
    toolbar.updateSetting(ToolType.SHAPES, "shape", "roundedRectangle");
    let radius = option("radius").querySelector("input");
    input(radius, 7);
    check(ToolType.SHAPES.getSetting("radius") === 7, "Radius input did not update settings");
    input(radius, "");
    check(ToolType.SHAPES.getSetting("radius") === 7, "Incomplete radius changed settings");
    input(radius, 9999, "change");
    check(ToolType.SHAPES.getSetting("radius") === 2000 && Number(radius.value) === 2000,
        "Committed radius was not clamped");
    app.setActiveToolFromType(ToolType.TEXT);
    for (let name of ["bold", "italic", "underline", "strikeout"]) {
        let button = option(name).querySelector("button");
        let previous = !!ToolType.TEXT.getSetting(name);
        button.click();
        check(ToolType.TEXT.getSetting(name) === !previous && button.getAttribute("aria-pressed") === String(!previous),
            "Font toggle did not update its setting/accessibility state");
        button.click();
        check(ToolType.TEXT.getSetting(name) === previous, "Font toggle was not reversible");
    }
    window.dispatchEvent(new Event("paintdotjs:fonts-changed"));
    option("fontFamily").querySelector("button").click();
    let fontPicker = ToolOptionDropdown.active;
    window.dispatchEvent(new Event("paintdotjs:fonts-changed"));
    check(ToolOptionDropdown.active === fontPicker && fontPicker.menu !== null,
        "Font-change notification replaced an open font picker");
    fontPicker.close();
    let originalLoader = FontManager.ensureLoaded;
    let originalWarn = console.warn;
    let warnings = [];
    try {
        FontManager.ensureLoaded = async () => null;
        toolbar.updateSetting(ToolType.TEXT, "fontFamily", "sans-serif");
        await tick();
        FontManager.ensureLoaded = async () => ({status: "loaded"});
        toolbar.updateSetting(ToolType.TEXT, "fontFamily", "serif");
        await tick();
        console.warn = (...args) => warnings.push(args);
        FontManager.ensureLoaded = async () => {
            throw new Error("font load failed");
        };
        toolbar.updateSetting(ToolType.TEXT, "fontFamily", "monospace");
        await tick();
        check(warnings.length === 1 && warnings[0][1].message === "font load failed",
            "Font loader failure was not explicitly reported");
    } finally {
        FontManager.ensureLoaded = originalLoader;
        console.warn = originalWarn;
    }

    phase("finish controls commit actual editable shapes and paint strokes");
    app.setActiveToolFromType(ToolType.SHAPES);
    toolbar.updateSetting(ToolType.SHAPES, "shape", "rectangle");
    let tool = app.getActiveTool();
    tool.onMouseDown(16, 16, MouseButton.LEFT);
    tool.onMouseMove(40, 40);
    tool.onMouseUp(40, 40, MouseButton.LEFT);
    check(tool.pending, "Shape was not pending before toolbar finishing");
    toolbar.optionsElement.querySelector(".tool-finish-button").click();
    check(!tool.pending && tool.bitmapTransaction === null, "Toolbar Finish did not commit the shape");
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    tool = app.getActiveTool();
    tool.onMouseDown(50, 50, MouseButton.LEFT);
    tool.onMouseMove(60, 60);
    toolbar.createActionControl({label: "Finish", icon: "tool_strip_checked.png"}).click();
    check(tool.bitmapTransaction === null, "Toolbar Finish did not commit an in-progress brush stroke");
    tool.onMouseUp(60, 60, MouseButton.LEFT);
    app.setActiveTool(null);
    toolbar.createActionControl({label: "Finish", icon: "tool_strip_checked.png"}).click();
    let rejected = false;
    try {
        toolbar.createOptionControl(ToolType.PENCIL, {kind: "invalid"}, document.createElement("span"));
    } catch (error) {
        check(error.message.includes("Unknown tool option kind"), "Wrong unsupported-control error");
        rejected = true;
    }
    check(rejected, "Unknown toolbar control kind was accepted");

    phase("select-control callbacks update actual tool settings and panel registry cleanup removes identity");
    let blendControl = toolbar.createSelectControl(ToolType.PENCIL, {key: "blendMode", label: "Blend",
        values: [["normal", "Normal"], ["multiply", "Multiply"]], width: 130});
    document.body.appendChild(blendControl);
    try {
        blendControl.click();
        ToolOptionDropdown.active.menu.querySelectorAll("button")[1].click();
        check(ToolType.PENCIL.getSetting("blendMode") === "multiply" && ToolOptionDropdown.active === null,
            "Select control callback did not persist the selected tool setting and close");
        ToolType.PENCIL.setSetting("blendMode", "normal");
    } finally {
        ToolOptionDropdown.closeActive();
        blendControl.remove();
    }
    let registered = new StripPanel("runtime-registry-panel", {});
    PanelRegistry.register(registered);
    check(PanelRegistry.get(registered.id) === registered && PanelRegistry.list().includes(registered),
        "Panel registry did not retain the registered panel identity");
    PanelRegistry.unregister(registered.id);
    check(PanelRegistry.get(registered.id) === undefined && !PanelRegistry.list().includes(registered),
        "Panel registry unregister left a stale panel reference");
    phase("floating-window resizing, anchored movement, focus and persisted state");
    let floating = new WebWindow("runtime-layout-test");
    floating.setTitle("Runtime window");
    floating.setSize(240, 180);
    floating.setPosition(100, 100);
    let content = document.createElement("div");
    content.textContent = "Runtime content";
    floating.setContent(content);
    floating.setResizable(true, 120, 90);
    floating.create();
    floating.enablePersistence();
    let restored = new WebWindow("runtime-restored-test");
    restored.setSize(120, 90);
    AppSettingsStore.set("windows.runtime-restored-test", {width: 200, height: 150, anchorX: 0.25, anchorY: 0.5, visible: false});
    check(!restored.restoreState() && restored.getWidth() === 200 && restored.getHeight() === 150
        && Math.abs(restored.anchorX - 0.25) < 0.001 && Math.abs(restored.anchorY - 0.5) < 0.001,
    "Restoring a hidden floating window lost its dimensions, visibility or anchor");
    AppSettingsStore.set("windows.runtime-restored-test", {width: -1, height: NaN, anchorX: Infinity, anchorY: "bad"});
    check(restored.restoreState() && restored.width === 200 && restored.height === 150,
        "Invalid persisted window dimensions replaced valid geometry");
    AppSettingsStore.set("windows.runtime-restored-test", "invalid");
    check(restored.restoreState(), "Malformed persisted window state prevented opening");
    let anonymous = new WebWindow();
    anonymous.setSize(120, 90);
    check(anonymous.restoreState(), "A window without a persistence ID failed to open");
    check(floating.isOpen() && floating.windowElement.querySelectorAll(".window-resize-handle").length === 8,
        "Floating window did not create all resize handles");
    floating.setTitle("Updated title");
    check(floating.titleElement.textContent === "Updated title", "Open-window title did not update");
    let replacement = document.createElement("span");
    replacement.textContent = "Replacement";
    floating.setContent(replacement);
    check(floating.contentElement.firstChild === replacement, "Open-window content did not update");
    for (let direction of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
        floating.setSize(240, 180);
        floating.setPosition(100, 100);
        let handle = floating.windowElement.querySelector(".window-resize-" + direction);
        mouse(handle, "mousedown", 100, 100, 2);
        check(!floating.resizing, "Right button started window resizing");
        mouse(handle, "mousedown", 100, 100);
        check(floating.resizing && floating.resizeDirection === direction, "Resize handle selected the wrong direction");
        let dx = direction.includes("w") ? -30 : direction.includes("e") ? 30 : 0;
        let dy = direction.includes("n") ? -20 : direction.includes("s") ? 20 : 0;
        mouse(document, "mousemove", 100 + dx, 100 + dy);
        mouse(document, "mouseup", 100 + dx, 100 + dy);
        check(floating.getWidth() === (dx === 0 ? 240 : 270)
            && floating.getHeight() === (dy === 0 ? 180 : 200), "Window resize dimensions differ: " + direction);
        check(floating.x === (direction.includes("w") ? 70 : 100)
            && floating.y === (direction.includes("n") ? 80 : 100), "Window resize changed its opposite anchor");
        check(!floating.resizing && !document.body.classList.contains("window-resizing"),
            "Resize release retained gesture state");
    }
    floating.setSize(240, 180);
    floating.setPosition(100, 100);
    mouse(floating.windowElement.querySelector(".window-resize-nw"), "mousedown", 100, 100);
    mouse(document, "mousemove", 600, 600);
    mouse(document, "mouseup", 600, 600);
    check(floating.width === 120 && floating.height === 90 && floating.x === 220 && floating.y === 190,
        "Window minimum-size clamp moved the opposite corner");
    floating.setSize(240, 180);
    floating.setPosition(2, 2);
    mouse(floating.windowElement.querySelector(".window-resize-nw"), "mousedown", 100, 100);
    mouse(document, "mousemove", 0, 0);
    mouse(document, "mouseup", 0, 0);
    check(floating.x === 0 && floating.y === 0, "Resizing through overlay edges escaped the visible area");
    floating.setSize(240, 180);
    floating.setPosition(100, 100);
    mouse(floating.titleBarElement, "mousedown", 110, 110);
    mouse(document, "mousemove", 170, 160);
    mouse(document, "mouseup", 170, 160);
    check(!floating.dragging && Number.isFinite(floating.x) && Number.isFinite(floating.y),
        "Window dragging retained gesture state or invalid geometry");
    floating.setAnchor(0.25, 0.3);
    window.dispatchEvent(new Event("resize"));
    await tick();
    let saved = AppSettingsStore.get("windows.runtime-layout-test");
    check(saved.width === 240 && saved.height === 180 && saved.visible === true,
        "Window size/open state was not persisted");
    check(Math.abs(saved.anchorX - 0.25) < 0.001 && Math.abs(saved.anchorY - 0.3) < 0.001,
        "Window resize changed its fractional anchor");
    floating.setResizable(false);
    check(floating.windowElement.querySelectorAll(".window-resize-handle").length === 0,
        "Disabling window resize left its handles");
    floating.setResizable(true);
    check(floating.windowElement.querySelectorAll(".window-resize-handle").length === 8,
        "Enabling resize duplicated or lost handles");
    floating.closeButtonElement.click();
    check(!floating.isOpen() && floating.windowElement === null
        && AppSettingsStore.get("windows.runtime-layout-test").visible === false,
    "Closing the window retained its frame or visible persistence flag");
    floating.resizeToPointer(0, 0);
    floating.notifyOpenState();
    floating.createResizeHandles();

    phase("component callbacks, strip lifecycle and registered footer zoom controls");
    let checkbox = new CheckboxItem();
    let slider = new SliderItem("runtime-slider");
    let panel = new StripPanel("runtime-components", {items: [checkbox, slider]});
    panel.appendTo(document.body, null);
    try {
        check(checkbox.getElement().type === "checkbox" && checkbox.getElement().id === "",
            "Anonymous checkbox gained an invalid identifier");
        let stopped = new MouseEvent("mousedown", {bubbles: true, cancelable: true});
        checkbox.getElement().dispatchEvent(stopped);
        check(stopped.defaultPrevented, "Checkbox mousedown did not suppress the enclosing drag");
        checkbox.getElement().checked = true;
        checkbox.getElement().dispatchEvent(new Event("input", {bubbles: true}));
        check(checkbox.isChecked() && !checkbox.isClickable(), "Checkbox without callback did not retain its value");
        let checkedValues = [];
        checkbox.setChangeCallback(value => checkedValues.push(value));
        checkbox.getElement().checked = false;
        checkbox.getElement().dispatchEvent(new Event("input", {bubbles: true}));
        check(checkedValues.length === 1 && checkedValues[0] === false, "Checkbox callback did not receive the changed boolean");
        let range = slider.getElement().querySelector("input");
        check(range.value === "50" && range.min === "0" && range.max === "100" && range.step === "1",
            "Default slider bounds/value changed");
        slider.onChange("75");
        let sliderValues = [];
        slider.setChangeCallback(value => sliderValues.push(value));
        input(range, 25);
        check(sliderValues.length === 1 && sliderValues[0] === "25", "Slider input callback lost its range value");
        slider.updateCurrentValue(32.7);
        check(range.value === "33", "Slider display did not round its supplied value");
        slider.updateCurrentValue();
        check(range.value === "50" && !slider.isClickable(), "Default slider reset changed its value/clickability");
        let ticks = new SliderItem("runtime-ticks");
        ticks.getTicks = () => [0, 50, 100];
        panel.add(ticks);
        check(panel.get("runtime-ticks") === ticks && panel.getItemList().length === 3
            && ticks.getElement().querySelectorAll(".slider-tick").length === 3,
        "Adding a slider lost its strip registration or tick marks");
        panel.updateItemsEnabledState();
        panel.remove("runtime-ticks");
        check(panel.get("runtime-ticks") === undefined && panel.getItemList().length === 2
            && !ticks.getElement().isConnected, "Removing a strip item left its DOM or registration");
        let invalidConfiguration = false;
        try {
            new StripPanel("runtime-invalid", {items: [undefined]});
        } catch (error) {
            invalidConfiguration = error.message.includes("Undefined item");
        }
        check(invalidConfiguration, "Undefined strip item was accepted");
        check(new StripPanel("runtime-empty", {}).getItemList().length === 0, "An empty strip gained items");

        let text = new TextFieldItem("runtime-text-field");
        text.setText("Initial text");
        text.setAutoSelect(true);
        let changedText = [];
        let submittedText = [];
        text.setChangeCallback(value => changedText.push(value));
        text.setSubmitCallback(value => submittedText.push(value));
        panel.add(text);
        await tick();
        check(document.activeElement === text.getElement() && text.getElement().selectionStart === 0
            && text.getElement().selectionEnd === 12, "Text auto-selection did not focus/select its initial value");
        text.getElement().click();
        check(text.getElement().selectionStart === 12 && text.getElement().selectionEnd === 12,
            "Initial text click did not place the caret at the end");
        text.getElement().setSelectionRange(2, 2);
        text.getElement().click();
        check(text.getElement().selectionStart === 2, "Later text click forcibly reset the caret");
        input(text.getElement(), "Changed");
        text.getElement().dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
        check(changedText.join() === "Changed" && submittedText.join() === "Changed"
            && text.getText() === "Changed" && !text.isClickable(), "Text callbacks lost the current value");
        text.setChangeCallback(null);
        text.setSubmitCallback(null);
        input(text.getElement(), "No callback");
        text.getElement().dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
        check(text.getText() === "No callback" && changedText.length === 1 && submittedText.length === 1,
            "Cleared text callbacks were still invoked");
        let number = new NumberItem("runtime-number-item");
        number.setMin(-5);
        number.setMax(20);
        number.setStep(0.5);
        number.setValue(3);
        panel.add(number);
        number.setMin(-10);
        number.setMax(30);
        number.setStep(2);
        number.setText(7);
        number.setEnabled(true);
        check(number.input.min === "-10" && number.input.max === "30" && number.input.step === "2"
            && number.input.value === "7" && number.getValue() === 7 && !number.input.disabled,
        "Number item setters did not update its existing input");
        let numericValues = [];
        number.setChangeCallback(value => numericValues.push(value));
        input(number.input, 9);
        check(number.getValue() === 9 && numericValues[0] === 9, "Number input callback did not convert its value to a number");
        number.setEnabled(false);
        check(number.input.disabled && !NumberInput.stepInput(number.input, 1), "Disabled number item accepted stepping");

        let colorSlider = new ColorSliderItem("runtime-default-color-slider");
        panel.add(colorSlider);
        let spectrum = colorSlider.canvas.getContext("2d").getImageData(0, 0, 85, 10).data;
        check(spectrum.every((value, index) => value === (index % 4 === 3 ? 255 : 0)) && !colorSlider.isClickable(),
            "Default color slider did not render an opaque black spectrum");
        let sliderPercentages = [];
        colorSlider.setChangeCallback(value => sliderPercentages.push(value));
        colorSlider.setPercentage(0.4);
        check(colorSlider.getPercentage() === 0.4 && colorSlider.cursor.style.left === "40%"
            && sliderPercentages[0] === 0.4, "Color slider did not synchronize its cursor and callback");
        let circle = new ColorCircleItem("runtime-color-circle");
        panel.add(circle);
        let wheelColor = new Color(20, 40, 60, 128);
        circle.setColor(wheelColor);
        check(circle.getColor() === wheelColor, "Color wheel did not retain its selected color");

        let failedIcons = [new LabelMenuItem("runtime-missing-label-icon"), new DropEntry("runtime-missing-drop-icon", null)];
        for (let item of failedIcons) {
            item.withIconPathKey("missing-runtime-regression-icon");
            panel.add(item);
        }
        let iconDeadline = performance.now() + 5000;
        while (failedIcons.some(item => item.getElement().querySelector("img").style.opacity !== "0")) {
            check(performance.now() < iconDeadline, "Missing icon did not settle its native error handler");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        check(failedIcons.every(item => item.getElement().isConnected), "Missing icon removed its containing menu entry");

        let selector = new SelectorMenuItem("runtime-empty-selector");
        panel.add(selector);
        selector.selectNextEntry();
        check(selector.getSelectedEntry() === null && selector.getSelectedId() === null,
            "Empty selector cycling created a nonexistent selection");
        let firstEntry = new DropEntry("runtime-selector-one").withNoIcon();
        let secondEntry = new DropEntry("runtime-selector-two", () => selector.setSelectedId("runtime-selector-two")).withNoIcon();
        selector.add(firstEntry);
        selector.add(secondEntry);
        selector.selectNextEntry();
        check(selector.getSelectedId() === "runtime-selector-two", "Selector cycle did not invoke the next entry callback");
        selector.selectNextEntry();
        check(selector.getSelectedId() === "runtime-selector-one", "Selector cycle did not select an entry without a callback");
        selector.remove(secondEntry);
        selector.remove(secondEntry);
        check(selector.entries.length === 1, "Removing an unavailable entry removed an unrelated menu item");
        let emptyDropdownChanges = [];
        let emptyDropdown = new ToolOptionDropdown({value: null, values: [], width: 80,
            cycleOnMainClick: true, onChange: value => emptyDropdownChanges.push(value)});
        document.body.appendChild(emptyDropdown.getElement());
        try {
            emptyDropdown.getElement().click();
            check(emptyDropdown.value === null && emptyDropdownChanges.length === 0,
                "Clicking an empty cycling dropdown reported a nonexistent value");
        } finally {
            emptyDropdown.element.remove();
        }

        let form = FormRegistry.list()[0];
        let formWindow = form.getWindow();
        let wasOpen = formWindow.isOpen();
        let toggle = new ToggleFormItem("runtime-toggle", form.id);
        panel.add(toggle);
        toggle.toggle();
        check(formWindow.isOpen() === !wasOpen && toggle.isActive() === !wasOpen,
            "Window toggle did not synchronize its open/active state");
        check(toggle.getElement().hasAttribute("active") === !wasOpen, "Window toggle retained stale active styling");
        toggle.toggle();
        check(formWindow.isOpen() === wasOpen && toggle.isActive() === wasOpen, "Window toggle did not restore the original state");
        let missingToggle = new ToggleFormItem("runtime-missing-toggle", "missing-runtime-form");
        panel.add(missingToggle);
        missingToggle.toggle();
        app.fire("app:window_open_state_changed", floating, false);
        check(!missingToggle.isActive(), "Missing form toggle reacted to an unrelated window");
    } finally {
        panel.getElement().remove();
    }

    let footer = PanelRegistry.get("footerMenu");
    let percentage = footer.get("zoomPercentageItem");
    let actualSize = footer.get("menuViewActualSize");
    let zoomIn = footer.get("menuViewZoomIn");
    let zoomOut = footer.get("menuViewZoomOut");
    let units = footer.get("measurementUnit");
    app.setMeasurementUnit("pixel");
    let separator = units.getElement().children[0].getBoundingClientRect();
    units.getElement().dispatchEvent(new MouseEvent("click", {clientX: separator.left - 1, bubbles: true}));
    check(app.getMeasurementUnit() === "inch" && units.getSelectedId() === "measurementUnit.inch",
        "Measurement label click did not cycle to inches");
    separator = units.getElement().children[0].getBoundingClientRect();
    units.getElement().dispatchEvent(new MouseEvent("click", {clientX: separator.right + 1, bubbles: true}));
    check(units.isOpen(), "Measurement arrow click did not open the unit menu");
    units.entries[2].getElement().click();
    check(app.getMeasurementUnit() === "centimeter" && !units.isOpen(), "Unit menu did not apply centimeters and close");
    units.selectNextEntry();
    check(app.getMeasurementUnit() === "pixel", "Measurement cycling did not wrap to pixels");
    let zoomSlider = footer.get("menuViewZoomSlider");
    input(zoomSlider.getElement().querySelector("input"), 151);
    check(Math.abs(workspace.getZoom() - 10.471285480508996) < 1e-10,
        "Footer zoom slider did not use logarithmic scaling above 100%");
    input(zoomSlider.getElement().querySelector("input"), 51);
    check(workspace.getZoom() === 0.51, "Footer zoom slider did not use percentage scaling below 100%");
    workspace.setZoom(1);
    zoomIn.getElement().click();
    check(workspace.getZoom() === 1.25, "Footer zoom-in multiplier changed");
    zoomOut.getElement().click();
    check(Math.abs(workspace.getZoom() - 1.0625) < 1e-9, "Footer zoom-out multiplier changed");
    check(percentage.isDropUp(), "Footer percentage picker did not open upward");
    percentage.textField.setText("125%");
    percentage.close();
    check(workspace.getZoom() === 1.25 && percentage.getText() === "125%", "Footer percentage did not apply its numeric value");
    percentage.textField.setText("invalid");
    percentage.close();
    check(workspace.getZoom() === 1.25, "Invalid percentage changed the document zoom");
    actualSize.getElement().click();
    check(workspace.isZoomToWindow() && actualSize.getText() === i18n("menu.view.zoomToWindow.text"),
        "Footer actual-size toggle did not select fit-to-window");
    actualSize.getElement().click();
    check(!workspace.isZoomToWindow() && workspace.getZoom() === 1
        && actualSize.getText() === i18n("menu.view.actualSize.text"), "Footer fit toggle did not return to 100%");
    let detachedSize = new ViewActualSizeItem();
    detachedSize.updateZoomBasis();
    detachedSize.initialize(null);
    detachedSize.getElement().querySelector("img").remove();
    workspace.setZoomToWindow(true);
    detachedSize.updateZoomBasis();
    workspace.setZoomToWindow(false);
    app.closeDocumentWorkspace(workspace, false);
    zoomIn.getElement().click();
    zoomOut.getElement().click();
    zoomSlider.onChange(151);
    check(zoomSlider.getCurrentValue() === 100, "Empty-workspace zoom slider lost its default value");
    actualSize.toggleZoomBasis();
    percentage.close();
    check(percentage.getText() === "100%", "Footer percentage without a document lost its default");
};
