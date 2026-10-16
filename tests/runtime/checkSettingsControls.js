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

module.exports = async function checkSettingsControls() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let change = element => element.dispatchEvent(new Event("change", {bubbles: true}));
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "Settings control timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let choose = title => {
        let button = [...document.querySelectorAll(".task-dialog-choice")]
            .find(candidate => candidate.querySelector("strong")?.textContent === title);
        check(button !== undefined, "Missing settings choice: " + title);
        button.click();
    };
    let button = title => [...SettingsDialog.instance.page.querySelectorAll("button")]
        .find(candidate => candidate.textContent === title);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    app.createBlankDocumentInNewWorkspace(16, 16);

    phase("settings UI preferences and language persistence");
    SettingsDialog.open("ui");
    let settings = SettingsDialog.instance;
    let originalBackdrop = settings.backdrop;
    SettingsDialog.open("canvas");
    check(settings.backdrop === originalBackdrop && settings.activeSection === "canvas"
        && document.querySelectorAll(".settings-dialog").length === 1, "Reopening settings created a second modal");
    SettingsDialog.open("ui");
    settings.dialog.querySelector('[data-section="canvas"]')?.click();
    settings.selectSection("invalid");
    check(settings.activeSection === "ui", "Unknown settings section did not use UI");
    let checkboxes = [...settings.page.querySelectorAll("input[type=checkbox]")];
    for (let [index, path] of [
        [0, "ui.animations"], [1, "ui.translucentWindows"], [2, "ui.overscroll"],
        [3, "ui.autoScrollWhileDrawing"], [4, "ui.autoSelectVisibleLayer"]
    ]) {
        checkboxes[index].checked = !checkboxes[index].checked;
        change(checkboxes[index]);
        check(AppSettingsStore.get(path) === checkboxes[index].checked, "Checkbox did not persist: " + path);
    }
    let selects = [...settings.page.querySelectorAll("select")];
    for (let scheme of ["blue", "light", "dark", "default"]) {
        selects[0].value = scheme;
        change(selects[0]);
        check(document.documentElement.dataset.colorSchemePreference === scheme, "Color scheme did not reach the document");
    }
    let language = selects.find(select => [...select.options].some(option => option.value === "auto"));
    language.value = [...language.options].find(option => option.value !== Language.preference).value;
    change(language);
    check(AppSettingsStore.get("ui.language") === language.value && !button("Reload now").disabled
        && settings.status.textContent.includes("Reload"), "Pending language change did not enable reload");
    language.value = Language.preference;
    change(language);
    check(button("Reload now").disabled, "Restored language did not disable reload");

    phase("Windows system links are unavailable on Linux");
    for (let [section, label] of [["pen", "Open Windows Pen & Ink settings"], ["colorManagement", "Open Windows display settings"]]) {
        settings.selectSection(section);
        let systemButton = button(label);
        check(systemButton.disabled && systemButton.title === "Available in the Windows desktop app",
            "Linux settings exposed an active Windows-only system link");
    }

    phase("canvas border RGB, wheel, brightness and disabled controls");
    settings.selectSection("canvas");
    let customBorder = [...settings.page.querySelectorAll("input[type=checkbox]")][1];
    let editor = settings.page.querySelector(".settings-canvas-color-editor");
    let wheel = editor.querySelector(".settings-canvas-color-wheel");
    customBorder.checked = true;
    change(customBorder);
    check(!editor.classList.contains("disabled") && AppSettingsStore.get("canvas.customBorder"),
        "Custom border controls stayed disabled");
    let rgb = [...editor.querySelectorAll("input[type=number]")];
    for (let [index, value] of [300, -10, 34].entries()) {
        input(rgb[index], value);
    }
    check(AppSettingsStore.get("canvas.borderColor") === "#ff0022", "Border RGB channels were not clamped/persisted");
    let swatch = editor.querySelector("input[type=color]");
    input(swatch, "#336699");
    check(AppSettingsStore.get("canvas.borderColor") === "#336699", "Color swatch did not persist");
    let brightness = editor.querySelector("input[type=range]");
    input(brightness, 200);
    check(AppSettingsStore.get("canvas.borderColor") !== "#336699", "Border brightness did not change its color");
    let bounds = wheel.getBoundingClientRect();
    for (let offset of [[bounds.width, bounds.height / 2], [bounds.width / 2, 0]]) {
        wheel.dispatchEvent(new PointerEvent("pointerdown", {clientX: bounds.left + offset[0],
            clientY: bounds.top + offset[1], bubbles: true}));
    }
    check(/^#[0-9a-f]{6}$/.test(AppSettingsStore.get("canvas.borderColor")), "Wheel produced an invalid color");
    editor.querySelector(".settings-inline-reset").click();
    check(AppSettingsStore.get("canvas.borderColor") === "#808080", "Border reset did not restore neutral gray");
    customBorder.checked = false;
    change(customBorder);
    wheel.dispatchEvent(new PointerEvent("pointerdown", {clientX: bounds.left, clientY: bounds.top, bubbles: true}));
    check(AppSettingsStore.get("canvas.borderColor") === "#808080" && swatch.disabled, "Disabled wheel changed the border color");
    let checkerboard = settings.page.querySelector(".settings-canvas-brightness");
    input(checkerboard.querySelector("input[type=range]"), 0.5);
    check(AppSettingsStore.get("canvas.checkerboardBrightness") === 50
        && document.documentElement.style.getPropertyValue("--checkerboard-brightness") === "0.5",
    "Checkerboard slider did not reach the renderer style");
    let output = checkerboard.querySelector("input[type=number]");
    output.value = 2;
    change(output);
    check(AppSettingsStore.get("canvas.checkerboardBrightness") === 100, "Checkerboard upper bound was not clamped");
    output.value = 0.1;
    change(output);
    check(AppSettingsStore.get("canvas.checkerboardBrightness") === 25, "Checkerboard lower bound was not clamped");
    output.value = "";
    change(output);
    check(AppSettingsStore.get("canvas.checkerboardBrightness") === 75 && output.value === "0.75",
        "Empty checkerboard brightness did not recover its default");
    checkerboard.querySelector(".settings-inline-reset").click();
    check(AppSettingsStore.get("canvas.checkerboardBrightness") === 75, "Checkerboard reset did not restore its default");

    phase("tool defaults and shortcut editing");
    settings.selectSection("tools");
    ToolType.PAINT_BRUSH.setSetting("width", 13);
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    let defaults = settings.page.querySelector("select");
    defaults.value = ToolType.PENCIL.getId();
    change(defaults);
    check(AppSettingsStore.get("tools.defaultTool") === ToolType.PENCIL.getId(), "Default tool setting did not persist");
    button("Reset tool settings").click();
    check(ToolType.PAINT_BRUSH.getSetting("width") !== 13 && settings.status.textContent.includes("reset"),
        "Tool reset did not clear a modified option");
    settings.selectSection("keyboard");
    input(settings.search, "file.new");
    let row = settings.shortcutList.querySelector(".shortcut-settings-row");
    check(row !== null, "Shortcut search did not find File/New");
    let id = row.querySelector("label").title;
    let capture = row.querySelector("input");
    capture.focus();
    check(capture.value === "Press shortcut…", "Shortcut focus did not enter capture mode");
    capture.dispatchEvent(new KeyboardEvent("keydown", {key: "F9", ctrlKey: true, bubbles: true, cancelable: true}));
    row = settings.shortcutList.querySelector(".shortcut-settings-row");
    check(row.querySelector("input").value.includes("F9"), "Shortcut capture did not register its key");
    row.querySelector("button").click();
    row = settings.shortcutList.querySelector(".shortcut-settings-row");
    capture = row.querySelector("input");
    capture.focus();
    capture.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
    check(document.activeElement !== capture && settings.backdrop !== null, "Shortcut Escape closed settings instead of capture");
    capture.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}));
    check(settings.status.textContent.includes("cleared") && ActionRegistry.getActionList()
        .find(action => action.getActionId() === id).getShortcutKey().isEmpty(), "Delete did not clear its shortcut");
    let unassignedCapture = [...settings.shortcutList.querySelectorAll("input")].find(field => field.value === "Not assigned");
    check(unassignedCapture !== undefined && unassignedCapture !== null, "No unassigned shortcut row was available after clearing");
    unassignedCapture.focus();
    unassignedCapture.blur();
    check(unassignedCapture.value === "Not assigned", "Blur did not restore the unassigned shortcut label");
    button("Reset all shortcuts").click();
    check(settings.status.textContent.includes("defaults"), "Reset-all shortcut action did not report completion");

    phase("actual font import, progress, drag/drop and removal");
    settings.selectSection("fonts");
    await FontManager.initialize();
    let fs = require("node:fs");
    let path = require("node:child_process").execFileSync("fc-match", ["--format=%{file}", "sans-serif"], {encoding: "utf8"}).trim();
    let bytes = fs.readFileSync(path);
    let fontFile = new window.File([bytes], "SettingsFont.ttf", {type: "font/ttf"});
    check(await settings.importFonts([new window.File(["x"], "ignored.png")]) === null
        && settings.status.textContent.includes("Choose"), "Invalid font selection did not explain accepted formats");
    let adding = settings.importFonts([fontFile]);
    check(settings.fontImporting && settings.fontAddButton.disabled && !settings.fontImportPanel.hidden,
        "Font progress did not reflect an in-flight import");
    check(await settings.importFonts([fontFile]) === null && settings.status.textContent.includes("Wait"),
        "Concurrent font import was accepted");
    let result = await adding;
    check(result.added.length === 1 && !settings.fontImporting && settings.fontImportPanel.hidden,
        "Font import did not settle progress state");
    await waitFor(() => settings.fontList.querySelector(".settings-font-row") !== null);
    check(settings.fontList.querySelector("strong").textContent === "SettingsFont", "Font settings did not show imported metadata");
    check(settings.getEntry("fonts").formatFileSize(10) === "10 B" && settings.getEntry("fonts").formatFileSize(1536) === "1.5 KB"
        && settings.getEntry("fonts").formatFileSize(1572864) === "1.5 MB", "Font-size display used incorrect units");
    let clearing = settings.getEntry("fonts").clearAllFonts();
    choose("Cancel");
    await clearing;
    check(FontManager.getFonts().length === 1, "Cancelled clear deleted fonts");
    settings.fontList.querySelector(".settings-font-remove").click();
    await waitFor(() => FontManager.getFonts().length === 0 && settings.status.textContent.includes("Removed"));
    let originalInputClick = HTMLInputElement.prototype.click;
    let fontInput = null;
    try {
        HTMLInputElement.prototype.click = function () {
            if (this.type === "file") {
                fontInput = this;
            } else {
                originalInputClick.call(this);
            }
        };
        settings.fontAddButton.click();
        check(fontInput !== null && fontInput.multiple && fontInput.accept === FontManager.getAcceptedFileTypes(),
            "Add-fonts button did not request the supported multiple-file picker");
        let selectedFonts = new DataTransfer();
        selectedFonts.items.add(fontFile);
        fontInput.files = selectedFonts.files;
        fontInput.dispatchEvent(new Event("change", {bubbles: true}));
        await waitFor(() => !settings.fontImporting && FontManager.getFonts().length === 1 && fontInput.value === "");
        check(fontInput.files.length === 0, "Successful font import did not reset the picker for repeated selections");
        settings.fontClearButton.click();
        choose("Clear All Fonts");
        await waitFor(() => FontManager.getFonts().length === 0 && settings.status.textContent.includes("Removed 1"));
    } finally {
        HTMLInputElement.prototype.click = originalInputClick;
    }
    let transfer = new DataTransfer();
    transfer.items.add(fontFile);
    let dropZone = settings.fontDropZone;
    let fontsBeforeEmptyDrop = FontManager.getFonts().length;
    await dropZone.ondrop(new DragEvent("drop", {bubbles: true, cancelable: true}));
    check(FontManager.getFonts().length === fontsBeforeEmptyDrop, "A drop without a transfer payload changed installed fonts");
    dropZone.dispatchEvent(new DragEvent("dragenter", {dataTransfer: transfer, bubbles: true, cancelable: true}));
    check(dropZone.classList.contains("drag-over"), "Font drag did not show hover feedback: "
        + dropZone.className + "; effect=" + transfer.dropEffect);
    dropZone.dispatchEvent(new DragEvent("dragleave", {dataTransfer: transfer, bubbles: true, cancelable: true}));
    check(!dropZone.classList.contains("drag-over"), "Font drag exit retained its feedback");
    dropZone.dispatchEvent(new DragEvent("drop", {dataTransfer: transfer, bubbles: true, cancelable: true}));
    await waitFor(() => !settings.fontImporting && FontManager.getFonts().length === 1);
    clearing = settings.getEntry("fonts").clearAllFonts();
    choose("Clear All Fonts");
    await clearing;
    check(FontManager.getFonts().length === 0 && settings.status.textContent.includes("Removed 1"), "Confirmed font clear did not delete metadata");
    await settings.getEntry("fonts").clearAllFonts();

    phase("font import failures, batched preview rows and storage error recovery");
    let oldAlert = window.alert;
    let alerts = [];
    let openFontDatabase = FontManager.openDatabase;
    let oldWarn = console.warn;
    let fontWarnings = [];
    try {
        window.alert = message => alerts.push(message);
        let failed = await settings.importFonts([new window.File(["invalid font bytes"], "Broken.ttf", {type: "font/ttf"})]);
        check(failed.added.length === 0 && failed.errors.length === 1 && FontManager.getFonts().length === 0
            && settings.status.textContent.includes("could not be added") && alerts.at(-1).includes("Broken.ttf"),
        "Corrupt font import did not surface its file or left invalid metadata");
        let batch = Array.from({length: 21}, (_, index) => new window.File([bytes],
            "Preview" + String(index).padStart(2, "0") + ".ttf", {type: "font/ttf"}));
        let imported = await settings.importFonts(batch);
        check(imported.added.length === 21 && settings.status.textContent === "Added 21 fonts.",
            "Font batch did not report all successfully imported files");
        await waitFor(() => settings.fontList.querySelectorAll(".settings-font-row").length === 21);
        await waitFor(() => settings.fontList.querySelector(".settings-font-preview").style.fontFamily.includes("paintjs-"));
        check([...settings.fontList.querySelectorAll("strong")].map(label => label.textContent).join(",")
            === batch.map(file => file.name.replace(/\.ttf$/, "")).join(","),
        "Chunked font rendering lost its alphabetical order or a row");
        FontManager.openDatabase = async () => {
            throw new Error("Font database temporarily unavailable");
        };
        let lazyFont = FontManager.getFonts()[0];
        document.fonts.delete(FontManager.faces.get(lazyFont.id));
        FontManager.faces.delete(lazyFont.id);
        console.warn = (...args) => fontWarnings.push(args);
        settings.page.scrollTop = 0;
        settings.getEntry("fonts").renderFontRows();
        await waitFor(() => fontWarnings.some(args => args[0].includes(lazyFont.name)));
        check(settings.fontList.querySelector(".settings-font-preview").style.fontFamily === ""
            && FontManager.getFonts().length === 21, "Failed font preview removed metadata or installed an unavailable font");
        let remove = settings.fontList.querySelector(".settings-font-remove");
        remove.click();
        await waitFor(() => settings.status.textContent.includes("Could not remove"));
        check(!remove.disabled && FontManager.getFonts().length === 21
            && alerts.at(-1).includes("temporarily unavailable"), "Failed removal deleted metadata or left its button disabled");
        let clearing = settings.getEntry("fonts").clearAllFonts();
        choose("Clear All Fonts");
        await clearing;
        check(FontManager.getFonts().length === 21 && !settings.fontClearButton.disabled
            && settings.status.textContent === "Could not clear the custom fonts.",
        "Failed clear removed fonts or prevented retry");
        FontManager.openDatabase = openFontDatabase;
        clearing = settings.getEntry("fonts").clearAllFonts();
        choose("Clear All Fonts");
        await clearing;
        check(FontManager.getFonts().length === 0, "Retry after a storage failure did not clear fonts");
    } finally {
        FontManager.openDatabase = openFontDatabase;
        console.warn = oldWarn;
        window.alert = oldAlert;
    }

    phase("deterministic desktop update bridge outcomes");
    settings.selectSection("updates");
    let updateButton = button("Check now");
    let oldUpdater = window.desktopUpdater;
    try {
        for (let [outcome, expected] of [
            [{supported: false, managed: false}, "packaged desktop"],
            [{supported: false, managed: true, updateAvailable: true, version: "9.0.0"}, "available"],
            [{supported: false, managed: true, updateAvailable: false}, "manually"],
            [{supported: true, version: "9.0.0"}, "Downloading"],
            [{supported: true, version: window.PDJVERSION}, "latest"],
            [{supported: true}, "latest"]
        ]) {
            window.desktopUpdater = {check: async () => outcome};
            await settings.getEntry("updates").checkForUpdates(updateButton);
            check(settings.status.textContent.includes(expected) && !updateButton.disabled && updateButton.textContent === "Check now",
                "Update outcome did not restore controls or communicate status: " + expected);
        }
    } finally {
        window.desktopUpdater = oldUpdater;
    }
    phase("diagnostics report unavailable browser capabilities without failing");
    let diagnosticProperties = ["platform", "language", "hardwareConcurrency", "deviceMemory"];
    let navigatorDescriptors = diagnosticProperties.map(name => Object.getOwnPropertyDescriptor(navigator, name));
    let pointerDescriptor = Object.getOwnPropertyDescriptor(window, "PointerEvent");
    let canvasContext = HTMLCanvasElement.prototype.getContext;
    try {
        for (let name of diagnosticProperties) {
            Object.defineProperty(navigator, name, {configurable: true, value: ""});
        }
        delete window.PointerEvent;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === "webgl" || type === "webgl2") {
                return null;
            }
            return canvasContext.call(this, type, ...args);
        };
        settings.selectSection("diagnostics");
        let cells = [...settings.page.querySelectorAll(".settings-diagnostics-table span")].map(cell => cell.textContent);
        for (let name of ["Platform", "Language", "Logical processors", "Device memory"]) {
            check(cells[cells.indexOf(name) + 1] === "Unknown", "Diagnostics omitted unavailable capability: " + name);
        }
        for (let name of ["Pointer events", "WebGL"]) {
            check(cells[cells.indexOf(name) + 1] === "Unavailable", "Diagnostics falsely advertised capability: " + name);
        }
        settings.selectSection("graphics");
        check(settings.page.textContent.includes("Graphics acceleration is not available."),
            "Graphics settings falsely advertised unavailable acceleration");
    } finally {
        diagnosticProperties.forEach((name, index) => {
            if (navigatorDescriptors[index] === undefined) {
                delete navigator[name];
            } else {
                Object.defineProperty(navigator, name, navigatorDescriptors[index]);
            }
        });
        Object.defineProperty(window, "PointerEvent", pointerDescriptor);
        HTMLCanvasElement.prototype.getContext = canvasContext;
    }
    phase("diagnostic clipboard and settings cleanup");
    settings.selectSection("diagnostics");
    button("Copy to clipboard").click();
    await waitFor(() => settings.status.textContent.includes("copied"));
    check((await navigator.clipboard.readText()).includes("Logical processors:"), "Copied diagnostics omitted runtime information");
    settings.dialog.querySelector(".app-dialog-close").click();
    check(settings.backdrop === null, "Title-bar close leaked settings");
    settings.close();
    settings.selectSection("canvas");
    settings.setStatus("closed");
    SettingsDialog.open("ui");
    settings.dialog.querySelector("footer button").click();
    check(settings.backdrop === null, "Footer close leaked settings");
};
