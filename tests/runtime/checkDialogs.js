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

module.exports = async function checkDialogs() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let change = element => element.dispatchEvent(new Event("change", {bubbles: true}));
    let activePhase = "";
    let phase = name => {
        activePhase = name;
        require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    };
    let submit = element => {
        check(element.checkValidity(), "Invalid dialog inputs: " + [...element.querySelectorAll("input")]
            .filter(input => !input.checkValidity()).map(input => input.outerHTML).join(", "));
        element.requestSubmit();
    };
    let resultOf = async promise => {
        let timer;
        try {
            return await Promise.race([promise, new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("Dialog did not resolve during " + activePhase
                    + "; remaining dialogs: "
                    + [...document.querySelectorAll(".app-dialog")].map(item => item.className).join(", "))), 3000);
            })]);
        } finally {
            clearTimeout(timer);
        }
    };
    let cancel = () => ModalDialogController.getActiveBackdrop().querySelector(".app-dialog")
        .dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    let waitFor = async predicate => {
        let deadline = performance.now() + 3000;
        while (!predicate()) {
            check(performance.now() < deadline, "Dialog update timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };

    phase("new-file");
    AppSettingsStore.set("workspace.newFileMaintainAspectRatio", false);
    let pending = NewFileDialog.open(120, 60);
    check(NewFileDialog.open(1, 1) === pending, "Duplicate new-file dialog was opened");
    let form = document.querySelector(".new-file-dialog");
    let numbers = [...form.querySelectorAll("input[type=number]")];
    input(numbers[0], 240);
    check(Number(numbers[1].value) === 60, "Unlinked dimensions changed together");
    let aspect = form.querySelector("input[type=checkbox]");
    aspect.checked = true;
    change(aspect);
    input(numbers[1], 120);
    check(Number(numbers[0].value) === 480, "New-file aspect ratio was not preserved");
    input(numbers[2], 120);
    input(numbers[3], 2);
    check(Number(numbers[0].value) === 240 && Number(numbers[1].value) === 60,
        "New-file print dimensions did not convert using DPI");
    input(numbers[4], 1);
    check(Number(numbers[0].value) === 480 && Number(numbers[1].value) === 120,
        "Print-height changes did not preserve the aspect ratio");
    submit(form);
    let created = await resultOf(pending);
    check(created.width === 480 && created.height === 120 && created.resolution === 120,
        "New-file dialog returned incorrect dimensions");
    check(AppSettingsStore.get("workspace.newFileMaintainAspectRatio") === true, "Aspect preference was not saved");
    for (let action of ["escape", "close", "backdrop", "cancel"]) {
        phase("new-file cancellation " + action);
        pending = NewFileDialog.open();
        form = document.querySelector(".new-file-dialog");
        if (action === "escape") {
            cancel();
        } else if (action === "backdrop") {
            form.parentElement.click();
            check(form.isConnected && form.classList.contains("modal-dialog-attention"),
                "Backdrop click did not preserve and highlight the modal");
            cancel();
        } else if (action === "close") {
            form.querySelector(".app-dialog-close").click();
        } else {
            [...form.querySelectorAll("button")].find(button => button.textContent === "Cancel").click();
        }
        check(await resultOf(pending) === null, "New-file cancellation returned a document");
    }

    for (let mode of ["resize", "canvas"]) {
        phase("image-size " + mode);
        pending = ImageSizeDialog.open(mode, {width: 120, height: 60, resolution: 96, layerCount: 2});
        check(ImageSizeDialog.open(mode, {}) === pending, "Duplicate image-size dialog was opened");
        form = document.querySelector(".image-size-dialog");
        let percentage = form.querySelector("input[type=radio]");
        percentage.checked = true;
        change(percentage);
        numbers = [...form.querySelectorAll("input[type=number]")];
        input(numbers[0], "");
        check(Number(numbers[1].value) === 120 && Number(numbers[2].value) === 60,
            "Empty resize percentage did not recover the original dimensions");
        input(numbers[0], 200);
        check(Number(numbers[1].value) === 240 && Number(numbers[2].value) === 120,
            "Percentage resizing returned wrong dimensions");
        let inactiveSummary = form.querySelector(".image-size-summary").textContent;
        let inactiveWidth = numbers[1].value;
        let inactivePrintHeight = numbers[5].value;
        check(numbers[1].disabled && numbers[5].disabled, "Percentage mode left absolute controls enabled");
        input(numbers[1], 5000);
        check(numbers[0].value === "200" && numbers[2].value === "120"
            && form.querySelector(".image-size-summary").textContent === inactiveSummary,
        "Programmatic input on disabled pixel width recalculated percentage-mode dimensions");
        numbers[1].value = inactiveWidth;
        input(numbers[5], 10);
        check(numbers[0].value === "200" && numbers[1].value === "240" && numbers[2].value === "120"
            && form.querySelector(".image-size-summary").textContent === inactiveSummary,
        "Programmatic input on disabled print height recalculated percentage-mode dimensions");
        numbers[5].value = inactivePrintHeight;
        submit(form);
        let result = await resultOf(pending);
        check(result.width === 240 && result.height === 120, "Image-size result lost the chosen dimensions");
        check(mode === "resize" ? typeof result.resampling === "string" : typeof result.anchor === "string",
            "Image-size result is missing mode-specific properties");
        pending = ImageSizeDialog.open(mode, {width: 120, height: 60});
        cancel();
        check(await resultOf(pending) === null, "Image-size cancellation returned a resize");
    }

    phase("absolute resize preserves aspect from height and converts centimeter resolution");
    pending = ImageSizeDialog.open("resize", {width: 120, height: 60, resolution: 96});
    form = document.querySelector(".image-size-dialog");
    let absolute = form.querySelectorAll("input[type=radio]")[1];
    absolute.checked = true;
    change(absolute);
    let maintainResize = form.querySelector("input[type=checkbox]");
    maintainResize.checked = true;
    change(maintainResize);
    numbers = [...form.querySelectorAll("input[type=number]")];
    let inactivePercentage = numbers[0].value;
    input(numbers[0], 250);
    check(numbers[1].value === "120" && numbers[2].value === "60",
        "Programmatic input on disabled percentage changed absolute dimensions");
    numbers[0].value = inactivePercentage;
    input(numbers[2], 30);
    check(numbers[1].value === "60" && numbers[2].value === "30", "Changing resize height broke the maintained ratio");
    input(numbers[3], "");
    let resolutionUnits = [...form.querySelectorAll("select")].find(select =>
        [...select.options].some(option => option.value === "centimeter"));
    resolutionUnits.value = "centimeter";
    change(resolutionUnits);
    input(numbers[3], 40);
    maintainResize.checked = false;
    change(maintainResize);
    input(numbers[2], "");
    check(numbers[2].value === "1" && numbers[1].value === "60", "Empty unlinked height did not clamp independently");
    submit(form);
    let absoluteResult = await resultOf(pending);
    check(absoluteResult.width === 60 && absoluteResult.height === 1 && Math.abs(absoluteResult.resolution - 101.6) < .001,
        "Absolute resize lost clamped dimensions or centimeter-to-inch DPI conversion");

    phase("new image normalizes empty dimensions and resolution through pixel and print fields");
    AppSettingsStore.set("workspace.newFileMaintainAspectRatio", false);
    pending = NewFileDialog.open(120, 60);
    form = document.querySelector(".new-file-dialog");
    numbers = [...form.querySelectorAll("input[type=number]")];
    input(numbers[0], "");
    check(numbers[0].value === "1", "Empty new-image width did not normalize to one pixel");
    input(numbers[2], "");
    input(numbers[3], 1);
    check(numbers[0].value === "96", "Empty new-image resolution did not use 96 DPI for print conversion");
    submit(form);
    let normalizedNew = await resultOf(pending);
    check(normalizedNew.width === 96 && normalizedNew.height === 60 && normalizedNew.resolution === 96,
        "New-image submission lost its normalized size or fallback resolution");

    phase("layer-properties");
    let properties = new LayerProperties("Original", true, false, 255, "normal");
    let previews = [];
    pending = LayerPropertiesDialog.open(properties, value => previews.push(value));
    form = document.querySelector(".layer-properties-dialog");
    input(form.querySelector("input[type=text]"), "Renamed <literal>");
    input(form.querySelector("input[type=number]"), 128);
    let visible = form.querySelector("input[type=checkbox]");
    visible.checked = false;
    change(visible);
    let blend = form.querySelector("select");
    blend.value = blend.options[1].value;
    change(blend);
    submit(form);
    let updated = await resultOf(pending);
    check(updated.name === "Renamed <literal>" && updated.opacity === 128 && updated.visible === false,
        "Layer properties were not applied");
    check(updated.blendMode === blend.value && previews.length > 0, "Blend mode or live preview was lost");
    check(properties.name === "Original" && properties.opacity === 255, "Dialog mutated the original properties");
    pending = LayerPropertiesDialog.open(properties);
    cancel();
    check(await resultOf(pending) === null, "Layer cancellation committed changes");

    phase("blank layer names, empty opacity and stale close callbacks preserve dialog ownership");
    pending = LayerPropertiesDialog.open(new LayerProperties(null, true, false, 255));
    form = document.querySelector(".layer-properties-dialog");
    check(form.querySelector("input[type=text]").value === "", "Missing layer name did not show an empty field");
    let staleLayerClose = form.querySelector(".app-dialog-close");
    cancel();
    check(await resultOf(pending) === null, "Unnamed layer cancellation returned properties");
    pending = LayerPropertiesDialog.open(properties);
    form = document.querySelector(".layer-properties-dialog");
    staleLayerClose.click();
    check(form.isConnected, "Stale close callback removed a newer layer dialog");
    input(form.querySelector("input[type=text]"), "   ");
    input(form.querySelector("input[type=number]"), "");
    check(form.querySelector("input[type=range]").value === "0", "Empty layer opacity did not normalize to zero");
    submit(form);
    updated = await resultOf(pending);
    check(updated.name === "Original" && updated.opacity === 0 && properties.opacity === 255,
        "Blank layer name lost its prior name or empty opacity mutated the source properties");

    let source = new ImageData(8, 6);
    for (let offset = 0; offset < source.data.length; ++offset) {
        source.data[offset] = offset % 4 === 3 ? 255 : offset % 256;
    }
    for (let definition of [
        BitmapEffectEngine.DEFINITIONS.brightnessAndContrastAdjustment,
        BitmapEffectEngine.DEFINITIONS.posterizeAdjustment,
        BitmapEffectEngine.EFFECTS.radialBlurEffect,
        BitmapEffectEngine.DEFINITIONS.hueAndSaturationAdjustment,
        BitmapEffectEngine.DEFINITIONS.curvesEffect,
        BitmapEffectEngine.DEFINITIONS.levelsEffect,
        BitmapEffectEngine.ROTATE_ZOOM
    ]) {
        phase("effect " + definition.id);
        let values = BitmapEffectEngine.defaults(definition);
        let previews = [];
        pending = EffectConfigDialog.open({
            title: definition.id, controls: definition.controls, values,
            layout: definition.dialog, source, onPreview: value => {
                previews.push(value);
                return Promise.resolve();
            }
        });
        form = document.querySelector(".effect-config-dialog");
        check(form !== null, "Effect dialog did not open");
        await waitFor(() => previews.length > 0 && !form.hasAttribute("aria-busy"));
        let number = form.querySelector("input[type=number]");
        if (number !== null) {
            input(number, number.max);
            number.dispatchEvent(new Event("change", {bubbles: true}));
            await waitFor(() => previews.length > 1 && !form.hasAttribute("aria-busy"));
        }
        let select = form.querySelector("select");
        if (select !== null) {
            select.value = select.options[select.options.length - 1].value;
            change(select);
        }
        for (let reset of form.querySelectorAll(".effect-row-reset")) {
            reset.click();
        }
        let preview = form.querySelector("footer input[type=checkbox]");
        if (preview !== null) {
            preview.checked = false;
            change(preview);
            await waitFor(() => previews.at(-1) === null);
            preview.checked = true;
            change(preview);
        }
        submit(form);
        let result = await resultOf(pending);
        check(result !== null && Object.keys(values).every(key => key in result),
            "Effect dialog returned incomplete settings");
        check(document.querySelector(".effect-config-dialog") === null, "Effect dialog leaked after submission");
        pending = EffectConfigDialog.open({
            title: definition.id, controls: definition.controls, values,
            layout: definition.dialog, source, onPreview() {}
        });
        cancel();
        check(await resultOf(pending) === null, "Effect cancellation committed settings");
    }

    phase("settings");
    SettingsDialog.open();
    let settings = SettingsDialog.instance;
    for (let [section] of settings.sections) {
        settings.selectSection(section);
        check(settings.activeSection === section && settings.page.textContent.trim().length > 0,
            "Settings section was empty: " + section);
    }
    settings.selectSection("keyboard");
    input(settings.search, "not-an-existing-action");
    check(settings.shortcutList.querySelectorAll(".shortcut-row").length === 0,
        "Shortcut search did not filter unrelated actions");
    input(settings.search, "");
    check(settings.shortcutList.children.length > 0, "Clearing shortcut search did not restore actions");
    settings.close();
    check(document.querySelector(".settings-dialog") === null, "Settings dialog leaked after closing");
    SettingsDialog.open("canvas");
    settings.dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    check(settings.backdrop === null, "Escape did not close settings");
    let emptyTask = TaskDialog.show({title: "No available actions", message: "Close this dialog"});
    let emptyTaskElement = document.querySelector(".task-dialog");
    check(emptyTaskElement.querySelectorAll(".task-dialog-choice").length === 0, "An actionless task dialog invented a choice");
    emptyTaskElement.querySelector(".app-dialog-close").click();
    check(await emptyTask === null, "Closing an actionless task dialog did not cancel");
    phase("task dialog Escape and title close retain their cancellation values");
    for (let method of ["escape", "close"]) {
        let pending = TaskDialog.show({title: "Cancelable task", message: "Cancel this task",
            cancelValue: method === "escape" ? "cancelled" : undefined, choices: [{value: "continue", title: "Continue"}]});
        let dialog = document.querySelector(".task-dialog");
        let closeButton = dialog.querySelector(".app-dialog-close");
        dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "a", bubbles: true, cancelable: true}));
        check(dialog.isConnected, "Ordinary task-dialog typing canceled the dialog");
        if (method === "escape") {
            dialog.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
        } else {
            closeButton.click();
        }
        check(await resultOf(pending) === (method === "escape" ? "cancelled" : null),
            "Task-dialog cancellation lost its configured value");
        closeButton.click();
        check(!dialog.isConnected, "A repeated close reattached the task dialog");
    }
    check(document.querySelector(".app-dialog-backdrop") === null, "Dialog backdrop leaked");
};
