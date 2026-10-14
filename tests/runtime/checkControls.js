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

module.exports = async function checkControls() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            check(performance.now() < deadline, "Control update timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let input = (element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", {bubbles: true}));
    };
    let packed = color => color.toPacked();
    let choose = title => {
        let button = [...document.querySelectorAll(".task-dialog button")]
            .find(candidate => candidate.textContent.trim() === title);
        check(button !== undefined, "Missing task choice: " + title);
        button.click();
    };
    let rejects = async (operation, pattern) => {
        let rejected = false;
        try {
            await operation();
        } catch (error) {
            check(pattern.test(error.message), "Unexpected control error: " + error.message);
            rejected = true;
        }
        check(rejected, "Invalid control operation was accepted");
    };

    phase("color controls");
    let colors = FormRegistry.get("colorsForm");
    colors.setExpanded(true);
    check(colors.expanded && colors.sliderPanel.style.display === "block", "Expanded color controls stayed hidden");
    colors.moreLessButtonElement.click();
    check(!colors.expanded && colors.sliderPanel.style.display === "none", "Less button did not hide extended color controls");
    colors.moreLessButtonElement.click();
    check(colors.expanded && colors.sliderPanel.style.display === "block", "More button did not restore extended color controls");
    colors.setMainColor(new Color(20, 40, 60, 80));
    colors.setSecondaryColor(new Color(90, 110, 130, 150));
    colors.secondaryColorItem.getElement().click();
    check(!colors.selectedIsPrimary, "Secondary color was not selected");
    colors.mainColorItem.getElement().click();
    check(colors.selectedIsPrimary, "Primary color was not selected");
    for (let [field, value, getter] of [
        [colors.redField, 123, "getRed"], [colors.greenField, 124, "getGreen"],
        [colors.blueField, 125, "getBlue"], [colors.alphaField, 126, "getAlpha"]
    ]) {
        input(field.input, value);
        check(colors.getSelectedColor()[getter]() === value, "Color field did not update its channel");
    }
    input(colors.hexField.getElement(), "112233");
    check(colors.hexField.getText() === "112233" && colors.mainColor.getRed() === 17
        && colors.mainColor.getGreen() === 34 && colors.mainColor.getBlue() === 51
        && colors.mainColor.getAlpha() === 126, "Hex field did not preserve alpha");
    let beforeInvalid = packed(colors.mainColor);
    input(colors.hexField.getElement(), "zz");
    check(packed(colors.mainColor) === beforeInvalid, "Invalid hex changed the color");
    for (let [slider, getter] of [
        [colors.redSlider, "getRed"], [colors.greenSlider, "getGreen"],
        [colors.blueSlider, "getBlue"], [colors.alphaSlider, "getAlpha"]
    ]) {
        slider.setPercentage(0.5);
        check(colors.getSelectedColor()[getter]() === 128, "Color slider did not update its channel");
        let bounds = slider.canvas.getBoundingClientRect();
        slider.onMouseEvent(bounds.left - 5);
        check(slider.getPercentage() === 0, "Slider did not clamp its left boundary");
        slider.onMouseEvent(bounds.right + 5);
        check(slider.getPercentage() === 1, "Slider did not clamp its right boundary");
    }
    for (let [field, value] of [[colors.hueField, 180], [colors.saturationField, 70], [colors.lightnessField, 60]]) {
        input(field.input, value);
        check(field.getValue() === value, "HSV input lost its precise value");
    }
    for (let slider of [colors.hueSlider, colors.saturationSlider, colors.lightnessSlider]) {
        slider.setPercentage(0.25);
        check(slider.getPercentage() === 0.25, "HSV slider lost its precise value");
    }
    let circle = colors.colorCircle;
    let circleBounds = circle.canvas.getBoundingClientRect();
    circle.onMouseEvent(circleBounds.left + 90, circleBounds.top + 90, MouseButton.LEFT);
    check(colors.mainColor.getHsvSaturation() === 0, "Color-circle center was not achromatic");
    circle.onMouseEvent(circleBounds.left + 300, circleBounds.top + 20, MouseButton.LEFT);
    check(colors.mainColor.getHsvSaturation() === 1, "Outside wheel gesture did not clamp to its edge");
    colors.setMainColor(Color.BLACK.copy());
    circle.onMouseEvent(circleBounds.left + 180, circleBounds.top + 90, MouseButton.LEFT);
    check(colors.mainColor.getRed() === 255 && colors.mainColor.getGreen() === 0, "Black wheel selection remained invisible");
    let primary = packed(colors.mainColor);
    let secondary = packed(colors.secondaryColor);
    document.getElementById("swapColorsButton").click();
    check(packed(colors.mainColor) === secondary && packed(colors.secondaryColor) === primary, "Swap colors lost a channel");
    document.getElementById("blackAndWhiteButton").click();
    check(packed(colors.mainColor) === packed(Color.BLACK) && packed(colors.secondaryColor) === packed(Color.WHITE),
        "Reset colors did not restore black and white");
    await rejects(() => colors.setMainColor({}), /Not a color/);
    await rejects(() => colors.setSecondaryColor({}), /Not a color/);

    phase("palette parsing and persistence");
    let palette = colors.parsePalette("; comment\n#80402010 ; translucent\n112233\ninvalid\n");
    check(palette.length === 96 && palette[0].toHex() === "#40201080"
        && palette[1].toHex() === "#112233ff" && palette[95].toPacked() === Color.WHITE.toPacked(),
    "Palette parsing changed AARRGGBB channels or padding");
    check(colors.parsePalette("invalid").length === 0, "Invalid palette created colors");
    check(colors.parsePalette(Array(100).fill("FF123456").join("\n")).length === 96, "Palette exceeded its slot limit");
    check(colors.paletteEquals(palette, colors.parsePalette(colors.serializePalette(palette))), "Palette serialization did not round-trip");
    check(!colors.paletteEquals(palette, []) && !colors.paletteEquals(palette, colors.defaultPalette), "Palette equality ignored its channels");
    check(!colors.setPalette(null) && !colors.setPalette([]), "Empty palette replaced the current palette");
    check(colors.setPalette(palette, "QA"), "Valid palette was rejected");
    check(colors.loadCurrentPalette()[0].toPacked() === palette[0].toPacked(), "Saved palette did not reload");
    colors.setSelectedIsPrimary(true);
    for (let [index, button] of [[0, MouseButton.LEFT], [32, MouseButton.RIGHT]]) {
        let press = new MouseEvent("mousedown", {button, bubbles: true, cancelable: true});
        colors.paletteElements[index].dispatchEvent(press);
        check(press.defaultPrevented, "Palette mousedown did not suppress enclosing drag/default behavior");
        check(packed(button === MouseButton.LEFT ? colors.mainColor : colors.secondaryColor) === packed(palette[index]),
            "Actual palette event selected the wrong color or paint button");
        let menu = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});
        colors.paletteElements[index].dispatchEvent(menu);
        check(menu.defaultPrevented, "Palette context menu was not suppressed");
    }
    colors.onPaletteColorClick(0, MouseButton.LEFT);
    check(packed(colors.mainColor) === packed(palette[0]), "Left palette selection chose the wrong color");
    colors.onPaletteColorClick(1, MouseButton.RIGHT);
    check(packed(colors.secondaryColor) === packed(palette[1]), "Right palette selection chose the wrong color");
    colors.setSelectedIsPrimary(false);
    colors.onPaletteColorClick(0, MouseButton.RIGHT);
    check(packed(colors.mainColor) === packed(palette[0]), "Secondary-selected right click did not update primary");
    colors.setSelectedColor(new Color(1, 2, 3, 4));
    colors.toggleColorAddMode();
    colors.onPaletteColorClick(3, MouseButton.LEFT);
    check(!colors.colorAddMode && colors.currentPaletteName === null && colors.palette[3].toHex() === "#01020304",
        "Add-color mode did not store and exit");
    colors.onPaletteColorClick(-1, MouseButton.LEFT);
    colors.onPaletteColorClick(96, MouseButton.LEFT);
    colors.toggleColorAddMode(true);
    colors.toggleColorAddMode(false);
    let files = [
        new window.File(["FFABCDEF"], "QA.txt"), new window.File(["00112233"], "Alpha.TXT"),
        new window.File(["invalid"], "Invalid.txt"), new window.File(["FF000000"], "Ignored.png")
    ];
    check(await colors.importPaletteFiles(files) === 2, "Palette import did not filter invalid files");
    check(await colors.importPaletteFiles([files[2], files[3]]) === 0, "Empty import reported success");
    check(Object.keys(colors.getUserPalettes()).length === 2, "Imported palettes were not persisted");
    let directoryPicker = Object.getOwnPropertyDescriptor(window, "showDirectoryPicker");
    let inputClick = HTMLInputElement.prototype.click;
    try {
        window.showDirectoryPicker = async options => {
            check(options.mode === "read", "Palette directory requested write access");
            return {values: async function* () {
                yield {kind: "directory", name: "Nested"};
                yield {kind: "file", name: "Ignored.png"};
                yield {kind: "file", name: "Folder Palette.TXT", getFile: async () => new window.File(["FF123456"], "Folder Palette.TXT")};
            }};
        };
        await colors.openPalettesFolder();
        check(colors.parsePalette(colors.getUserPalettes()["Folder Palette"])[0].toHex() === "#123456ff",
            "Directory palette import lost its filename/color or included unsupported entries");
        window.showDirectoryPicker = async () => {
            throw new DOMException("Canceled directory", "AbortError");
        };
        await colors.openPalettesFolder();
        window.showDirectoryPicker = async () => {
            throw new Error("Directory permission denied");
        };
        await rejects(() => colors.openPalettesFolder(), /Directory permission denied/);
        window.showDirectoryPicker = undefined;
        let folderInput = null;
        HTMLInputElement.prototype.click = function () {
            if (this.type === "file") {
                folderInput = this;
            } else {
                inputClick.call(this);
            }
        };
        await colors.openPalettesFolder();
        check(folderInput !== null && folderInput.webkitdirectory && folderInput.multiple
            && folderInput.accept === ".txt,text/plain", "Fallback palette picker lost its directory/type configuration");
        let transfer = new DataTransfer();
        folderInput.files = transfer.files;
        await folderInput.onchange();
        transfer.items.add(files[2]);
        folderInput.files = transfer.files;
        let importing = folderInput.onchange();
        await waitFor(() => document.querySelector(".task-dialog-message")?.textContent.includes("does not contain any valid palette files"));
        choose("OK");
        await importing;
        transfer = new DataTransfer();
        transfer.items.add(new window.File(["FF654321"], "Fallback Palette.txt"));
        folderInput.files = transfer.files;
        await folderInput.onchange();
        check(colors.parsePalette(colors.getUserPalettes()["Fallback Palette"])[0].toHex() === "#654321ff",
            "Fallback directory picker did not import its actual FileList");
    } finally {
        HTMLInputElement.prototype.click = inputClick;
        if (directoryPicker === undefined) {
            delete window.showDirectoryPicker;
        } else {
            Object.defineProperty(window, "showDirectoryPicker", directoryPicker);
        }
    }
    for (let name of [null, "", "QA <b>Palette</b>.txt"]) {
        let saving = colors.saveCurrentPaletteAs();
        let nameInput = document.querySelector(".task-dialog input");
        check(nameInput !== null, "Palette name field was not created");
        if (name !== null) {
            input(nameInput, name);
        }
        choose(name === null ? "Cancel" : "Save");
        await saving;
    }
    let entries = colors.createPaletteMenuEntries();
    for (let entry of entries.filter(entry => entry instanceof DropEntry)) {
        entry.initialize(colors);
        let label = entry.getElement().querySelector(".text");
        check(label.textContent === entry.getText(), "Palette name was interpreted as markup: " + entry.getText());
        check(label.querySelector("b") === null, "Palette name created HTML elements");
    }
    let formattedEntry = new DropEntry(null, () => {}).withNoIcon();
    formattedEntry.getText = () => "<b>Trusted formatting</b>";
    formattedEntry.initialize(colors);
    check(formattedEntry.getElement().querySelector(".text b")?.textContent === "Trusted formatting",
        "Palette protection changed the formatting of other menu entries");
    check(colors.createRainbowPalette().length === 96 && colors.createSmallPalette().length === 96,
        "Generated palette lost slots");
    colors.setExpanded(false);
    check(colors.sliderPanel.style.display === "none", "Collapsed controls remained visible");

    phase("font persistence and lazy loading");
    let fs = require("node:fs");
    let {execFileSync} = require("node:child_process");
    let fontPath = execFileSync("fc-match", ["--format=%{file}", "sans-serif"], {encoding: "utf8"}).trim();
    let fontBytes = fs.readFileSync(fontPath);
    await FontManager.initialize();
    check(!FontManager.isInitializing(), "Font initialization did not finish");
    await rejects(() => FontManager.addFont(new window.File(["x"], "invalid.png")), /Unsupported font/);
    await rejects(() => FontManager.addFont(new window.File([], "empty.ttf")), /font file is empty/);
    let progress = [];
    let imported = await FontManager.importFiles([
        new window.File([fontBytes], "QA'Sans.ttf", {type: "font/ttf"}),
        new window.File(["not a font"], "Broken.ttf"), new window.File(["x"], "Ignored.png")
    ], state => progress.push({...state}));
    check(imported.added.length === 1 && imported.errors.length === 1
        && progress.at(-1).completed === 2 && progress.at(-1).total === 2, "Font import did not account for actual outcomes");
    let font = imported.added[0];
    check(!("data" in font) && font.size === fontBytes.length, "Font metadata retained its binary payload");
    check(FontManager.isCustomFont(font.id) && FontManager.isCustomFont(font.family), "Imported font was not registered");
    check(await FontManager.ensureLoaded("not-a-font") === null, "Unknown family loaded a face");
    let face = await FontManager.ensureLoaded(font.family);
    check(face.status === "loaded" && document.fonts.has(face), "Imported FontFace did not load");
    document.fonts.delete(face);
    FontManager.faces.clear();
    FontManager.records = [];
    await FontManager.loadStoredFonts();
    check(FontManager.records.length === 1 && FontManager.faces.size === 0, "Metadata reload eagerly decoded a font");
    let [loaded, shared] = await Promise.all([FontManager.ensureLoaded(font.id), FontManager.ensureLoaded(font.family)]);
    check(loaded === shared && loaded.status === "loaded", "Concurrent font requests did not share the loaded face");
    let fontDatabase = await FontManager.openDatabase();
    await rejects(() => FontManager.runRequest(fontDatabase, "readwrite", store => {
        let request = store.put({id: "aborted-font-storage-probe"});
        request.addEventListener("success", () => store.transaction.abort());
        return request;
    }), /Font storage transaction failed/);
    fontDatabase = await FontManager.openDatabase();
    let storedFont = await FontManager.runRequest(fontDatabase, "readonly", store => store.get(font.id), false);
    check(storedFont.id === font.id && storedFont.data.byteLength === fontBytes.length,
        "Font storage rollback removed an earlier committed font");
    let committed = false;
    let probeId = "committed-font-storage-probe";
    await FontManager.runRequest(fontDatabase, "readwrite", store => {
        store.transaction.addEventListener("complete", () => {
            committed = true;
        });
        return store.put({...storedFont, id: probeId});
    }, false);
    check(committed, "Font storage acknowledged a write before transaction commit");
    let probe = await FontManager.runRequest(fontDatabase, "readonly", store => store.get(probeId), false);
    check(probe.id === probeId && probe.data.byteLength === fontBytes.length, "Committed font bytes did not survive a subsequent read");
    let assert = require("node:assert/strict");
    await assert.rejects(() => FontManager.runRequest(fontDatabase, "readwrite", store => store.add(storedFont), false),
        error => error.name === "ConstraintError");
    await assert.rejects(() => FontManager.runRequest(fontDatabase, "readonly", store => {
        let request = store.get(font.id);
        store.transaction.abort();
        return request;
    }, false), error => error.name === "AbortError");
    await FontManager.runRequest(fontDatabase, "readwrite", store => store.delete(probeId));
    let originalDatabaseName = FontManager.databaseName;
    let incompatibleDatabaseName = originalDatabaseName + "-version-regression";
    let settleRequest = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Test font database operation was blocked"));
    });
    try {
        let newerDatabase = await settleRequest(indexedDB.open(incompatibleDatabaseName, FontManager.databaseVersion + 1));
        newerDatabase.close();
        FontManager.databaseName = incompatibleDatabaseName;
        await assert.rejects(() => FontManager.openDatabase(), error => error.name === "VersionError");
    } finally {
        FontManager.databaseName = originalDatabaseName;
        await settleRequest(indexedDB.deleteDatabase(incompatibleDatabaseName));
    }

    phase("dropdown selection and font keyboard navigation");
    let changes = [];
    let dropdown = new ToolOptionDropdown({
        value: "one", values: [["one", "One"], ["two", "Two", "reset_icon.png"]],
        width: 120, cycleOnMainClick: true, menuCheckmarks: true,
        onChange: value => changes.push(value)
    });
    document.body.appendChild(dropdown.getElement());
    dropdown.getElement().click();
    check(dropdown.value === "two" && changes.at(-1) === "two", "Split dropdown did not cycle");
    dropdown.arrow.click();
    check(dropdown.menu !== null && dropdown.element.getAttribute("aria-expanded") === "true", "Dropdown did not open");
    dropdown.menu.querySelector("button").click();
    check(dropdown.value === "one" && dropdown.menu === null, "Dropdown selection did not close");
    dropdown.open();
    dropdown.open();
    check(dropdown.menu === null, "Repeated opening did not toggle closed");
    dropdown.replaceValues([["three", "Three"]]);
    check(dropdown.value === "three" && dropdown.valueLabel.textContent === "Three", "Replacement values left a stale selection");
    dropdown.replaceValues([]);
    check(dropdown.value === null, "Empty replacement values retained a selection");
    let fontChoices = FontManager.getTextToolChoices();
    let fontDropdown = new ToolOptionDropdown({
        value: "Arial", values: fontChoices, width: 160, fontPreview: true, fitSelected: true,
        leadingIcon: "text_icon.png", onChange: value => changes.push(value)
    });
    document.body.appendChild(fontDropdown.getElement());
    fontDropdown.open();
    await waitFor(() => fontDropdown.fontEntryButtons.size === fontChoices.length);
    let key = value => document.dispatchEvent(new KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true}));
    key("m");
    check(document.activeElement === fontDropdown.fontEntryButtons.get("monospace"), "Font prefix did not focus its match");
    key("ArrowUp");
    check(fontDropdown.value === "serif" && document.activeElement === fontDropdown.fontEntryButtons.get("serif"),
        "Font arrow did not move selection");
    key("Enter");
    check(fontDropdown.menu === null && changes.at(-1) === "serif", "Font Enter did not accept selection");
    fontDropdown.open();
    await waitFor(() => fontDropdown.fontEntryButtons.size === fontChoices.length);
    key("q");
    key("a");
    check(document.activeElement === fontDropdown.fontEntryButtons.get(font.family), "Custom font prefix did not focus its row");
    fontDropdown.replaceValues([["Arial", "Arial"], ["monospace", "Monospace"]]);
    await waitFor(() => fontDropdown.fontEntryButtons.size === 2);
    key("Escape");
    check(fontDropdown.menu === null && document.activeElement === fontDropdown.element, "Font Escape did not restore focus");
    fontDropdown.open();
    fontDropdown.close();
    await new Promise(resolve => requestAnimationFrame(resolve));
    check(fontDropdown.fontEntryButtons.size === 0, "Deferred rendering retained closed font rows");
    dropdown.close();
    dropdown.element.remove();
    fontDropdown.element.remove();
    ToolType.TEXT.setSetting("fontFamily", font.family);
    check(await FontManager.removeFont(font.id), "Stored font was not removed");
    check(ToolType.TEXT.getSetting("fontFamily") === "Segoe UI" && FontManager.getFonts().length === 0,
        "Removing selected font did not restore a built-in family");
    check(!await FontManager.removeFont(font.id), "Missing font removal reported success");
    await FontManager.addFont(new window.File([fontBytes], "Another.ttf"));
    check(await FontManager.removeAllFonts() === 1 && await FontManager.removeAllFonts() === 0,
        "Bulk font removal did not report its real count");

    phase("error recovery form");
    let report = ErrorForm.fromError(new Error("<b>Literal error</b>"), "QA");
    ErrorForm.show(report);
    let errorForm = ErrorForm.instance;
    check(errorForm.getWindow().isOpen() && errorForm.getTitle() === "paint.js Error", "Error form did not open");
    check(document.querySelector(".error-form-message").textContent === report.message
        && document.querySelector(".error-form-message b") === null, "Error message was interpreted as markup");
    await errorForm.copyError();
    check(errorForm.saveStatus.textContent === "Error copied to clipboard.", "Error copy did not confirm its outcome");
    let copied = await navigator.clipboard.readText();
    check(copied.includes(report.message) && copied.includes("Source: QA"), "Copied error omitted its details");
    ErrorForm.show(report);
    check(ErrorForm.instance === errorForm, "Duplicate error replaced the active form");
    ErrorForm.show({source: "Other", message: "Second error", stack: ""});
    check(ErrorForm.instance === errorForm && document.querySelector(".error-form-stack").textContent === "No stack trace is available.",
        "Error form did not refresh its details");
    check(ErrorForm.stringify(undefined) === "undefined" && ErrorForm.stringify("text") === "text", "Error serialization lost primitive values");
    let circular = {};
    circular.self = circular;
    check(ErrorForm.stringify(circular) === "[object Object]", "Circular error did not use its safe fallback");
    check(ErrorForm.fromConsoleArguments([], "QA").message === "Unknown console error", "Empty console error lost its fallback");
    check(ErrorForm.fromError(null, "QA").message === "null", "Non-Error report lost its value");
    errorForm.ignoreButton.click();
    check(!errorForm.getWindow().isOpen(), "Ignore did not close the error form");
    errorForm.ignore();
};
