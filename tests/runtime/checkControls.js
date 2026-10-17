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
    colors.window.setSize(492, 371);
    colors.postInitialize();
    let panelBounds = colors.sliderPanel.getBoundingClientRect();
    check(panelBounds.right <= colors.sliderPanel.parentElement.getBoundingClientRect().right,
        "Expanded color controls extend beyond the window");
    for (let channel of colors.sliderPanel.querySelectorAll(".channel")) {
        let label = channel.querySelector(".text");
        let slider = channel.querySelector(".color-slider").getBoundingClientRect();
        let field = channel.querySelector(".pdn-number-input").getBoundingClientRect();
        check(label.getBoundingClientRect().right + 4 <= slider.left,
            "Color label overlaps its slider: " + label.textContent);
        check(slider.width >= 85 && field.right <= panelBounds.right + 1,
            "Color channel controls are compressed or clipped: " + label.textContent);
        check(label.scrollWidth <= Math.ceil(label.getBoundingClientRect().width),
            "Color label is clipped: " + label.textContent);
    }
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
    phase("color wheel and slider DOM gestures update the selected color and stop after release");
    let colorGesture = (element, start, end) => {
        element.dispatchEvent(new MouseEvent("mousedown", {clientX: start[0], clientY: start[1], button: 0, bubbles: true}));
        document.dispatchEvent(new MouseEvent("mousemove", {clientX: end[0], clientY: end[1], buttons: 1, bubbles: true}));
        document.dispatchEvent(new MouseEvent("mouseup", {clientX: end[0], clientY: end[1], button: 0, bubbles: true}));
    };
    colorGesture(circle.canvas, [circleBounds.left + 90, circleBounds.top + 90],
        [circleBounds.left + 179, circleBounds.top + 90]);
    check(colors.mainColor.getRed() === 255 && colors.mainColor.getGreen() < 5,
        "Wheel DOM drag did not select its red edge");
    let redBounds = colors.redSlider.canvas.getBoundingClientRect();
    colorGesture(colors.redSlider.getElement(), [redBounds.right, redBounds.top], [redBounds.left, redBounds.top]);
    check(colors.mainColor.getRed() === 0, "Slider DOM drag did not reach its zero endpoint");
    let releasedColor = packed(colors.mainColor);
    document.dispatchEvent(new MouseEvent("mousemove", {clientX: redBounds.right, clientY: redBounds.top, bubbles: true}));
    check(packed(colors.mainColor) === releasedColor, "Released color controls retained a drag listener");
    let primary = packed(colors.mainColor);
    let secondary = packed(colors.secondaryColor);
    document.getElementById("swapColorsButton").click();
    check(packed(colors.mainColor) === secondary && packed(colors.secondaryColor) === primary, "Swap colors lost a channel");
    document.getElementById("blackAndWhiteButton").click();
    check(packed(colors.mainColor) === packed(Color.BLACK) && packed(colors.secondaryColor) === packed(Color.WHITE),
        "Reset colors did not restore black and white");
    await rejects(() => colors.setMainColor({}), /Not a color/);
    await rejects(() => colors.setSecondaryColor({}), /Not a color/);

    phase("reentrant color notifications do not recurse or duplicate model changes");
    let colorCallback = colors.colorCircle.changeCallback;
    let colorNotifications = 0;
    let modelChanges = 0;
    let onModelColor = () => ++modelChanges;
    colors.changed.add(onModelColor);
    try {
        colors.colorCircle.setChangeCallback(color => {
            ++colorNotifications;
            colorCallback(color);
            colors.updateElements("circle");
        });
        colors.setSelectedIsPrimary(true);
        colorNotifications = 0;
        modelChanges = 0;
        colors.setMainColor(Color.fromRGBA(31, 47, 63, 79));
        check(colorNotifications === 1 && modelChanges === 1 && !colors.updating
            && colors.mainColor.toHex() === "#1f2f3f4f" && colors.redField.getValue() === 31
            && colors.greenField.getValue() === 47 && colors.blueField.getValue() === 63,
        "Reentrant color rendering changed model channels, duplicated events or retained the update lock");
    } finally {
        colors.colorCircle.setChangeCallback(colorCallback);
        colors.changed.remove(onModelColor);
    }
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
    check(await colors.importPaletteFiles([new window.File(["FF112233"], ".txt")]) === 1
        && colors.parsePalette(colors.getUserPalettes()["Imported Palette"])[0].toHex() === "#112233ff",
        "Palette without a basename did not receive its imported name");
    let iconlessPaletteEntry = colors.createPaletteMenuEntry("colors.palette.iconless", "Plain palette", null, () => {});
    iconlessPaletteEntry.initialize(colors);
    check(!iconlessPaletteEntry.hasIcon() && iconlessPaletteEntry.getText() === "Plain palette",
        "Iconless palette entry lost its label or displayed an icon");
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

    phase("palette recovery from invalid and unavailable browser storage");
    let storedPalette = localStorage.getItem("paintdotjs.colors.currentPalette");
    let storedUsers = localStorage.getItem("paintdotjs.colors.userPalettes");
    let storageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    try {
        localStorage.setItem("paintdotjs.colors.currentPalette", "invalid");
        let recovered = colors.loadCurrentPalette();
        check(colors.paletteEquals(recovered, colors.defaultPalette) && recovered[0] !== colors.defaultPalette[0],
            "Invalid stored palette did not recover independent default colors");
        for (let value of ["null", "17", '"palette"', "{"]) {
            localStorage.setItem("paintdotjs.colors.userPalettes", value);
            check(Object.keys(colors.getUserPalettes()).length === 0, "Malformed user palette root was accepted");
        }
        Object.defineProperty(window, "localStorage", {configurable: true, get() {
            throw new DOMException("Palette storage denied", "SecurityError");
        }});
        check(colors.paletteEquals(colors.loadCurrentPalette(), colors.defaultPalette)
            && Object.keys(colors.getUserPalettes()).length === 0,
        "Unavailable palette storage did not recover readable defaults");
        check(colors.setPalette([Color.fromRGBA(12, 34, 56, 78)], "In memory")
            && colors.palette.length === 96 && colors.palette[0].toHex() === "#0c22384e"
            && colors.palette[95].toPacked() === Color.WHITE.toPacked(),
        "Denied persistence discarded an in-memory palette or its padding");
        colors.saveUserPalettes({Temporary: "FF010203"});
    } finally {
        Object.defineProperty(window, "localStorage", storageDescriptor);
        for (let [key, value] of [["paintdotjs.colors.currentPalette", storedPalette],
            ["paintdotjs.colors.userPalettes", storedUsers]]) {
            if (value === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
        }
    }

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
    fontChoices = [...fontChoices.filter(entry => entry[0] !== font.family),
        fontChoices.find(entry => entry[0] === font.family)];
    let fontDropdown = new ToolOptionDropdown({
        value: "sans-serif", values: fontChoices, width: 160, fontPreview: true, fitSelected: true,
        leadingIcon: "text_icon.png", onChange: value => changes.push(value)
    });
    document.body.appendChild(fontDropdown.getElement());
    fontDropdown.open();
    let fontBeforeUp = fontDropdown.value;
    fontDropdown.menu.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true}));
    check(fontDropdown.value !== fontBeforeUp, "ArrowUp on an open font control did not move to the preceding font");
    fontDropdown.menu.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true}));
    check(fontDropdown.value === fontBeforeUp, "ArrowDown did not reverse the preceding ArrowUp font selection");
    let previewResults = fontDropdown.menu;
    previewResults.id = "font-preview-viewport-contract";
    previewResults.style.maxHeight = "80px";
    let previewLayout = document.createElement("style");
    previewLayout.textContent = "#font-preview-viewport-contract .tool-font-dropdown-results > button:last-child {margin-top:250px}";
    previewResults.appendChild(previewLayout);
    await waitFor(() => fontDropdown.fontEntryButtons.size === fontChoices.length);
    let customPreviewButton = fontDropdown.fontEntryButtons.get(font.family);
    await new Promise(resolve => setTimeout(resolve, 50));
    check(customPreviewButton.querySelector(".tool-font-dropdown-preview").style.fontFamily === ""
        && customPreviewButton.getBoundingClientRect().top > previewResults.getBoundingClientRect().bottom + 100,
    "Lazy custom preview loaded before entering the observed viewport margin");
    customPreviewButton.scrollIntoView({block: "nearest"});
    await waitFor(() => customPreviewButton.querySelector(".tool-font-dropdown-preview").style.fontFamily.includes(font.family));
    check(fontDropdown.menu !== null, "Lazy custom font preview closed its dropdown");
    let key = value => document.dispatchEvent(new KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true}));
    key("m");
    check(document.activeElement === fontDropdown.fontEntryButtons.get("monospace"), "Font prefix did not focus its match");
    key("ArrowUp");
    check(fontDropdown.value === "serif" && document.activeElement === fontDropdown.fontEntryButtons.get("serif"),
        "Font arrow did not move selection");
    for (let options of [{key: "F12"}, {key: "m", ctrlKey: true}, {key: "m", metaKey: true},
        {key: "m", altKey: true}, {key: "m", isComposing: true}]) {
        let ignored = new KeyboardEvent("keydown", {cancelable: true, ...options});
        fontDropdown.onFontTypeahead(ignored);
        check(!ignored.defaultPrevented && fontDropdown.value === "serif" && fontDropdown.menu !== null,
            "Font typeahead consumed a modified/nonprintable key or changed its selection");
    }
    key("Enter");
    check(fontDropdown.menu === null && changes.at(-1) === "serif", "Font Enter did not accept the focused row");
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
    phase("font picker chunking, unmatched typeahead and delayed prefix reset");
    let manyChoices = Array.from({length: 30}, (_, index) => ["preview-family-" + index, "Preview " + index]);
    fontDropdown.replaceValues(manyChoices);
    fontDropdown.open();
    await waitFor(() => fontDropdown.fontEntryButtons.size === 30);
    key("p");
    check(fontDropdown.pendingFontJumpValue === null && document.activeElement === fontDropdown.fontEntryButtons.get("preview-family-0"),
        "Chunked font picker did not focus the first prefix match");
    key("!");
    check(fontDropdown.menu !== null && fontDropdown.fontTypeaheadValue === "!",
        "Unmatched font key closed the picker or failed to begin a new lookup");
    await waitFor(() => fontDropdown.fontTypeaheadTimer === null);
    check(fontDropdown.fontTypeaheadValue === "", "Font lookup prefix did not expire");
    fontDropdown.element.focus();
    fontDropdown.pendingFontJumpValue = "preview-family-25";
    fontDropdown.moveFontSelection(1);
    check(fontDropdown.value === "preview-family-26", "Arrow navigation did not use the pending late-chunk jump");
    fontDropdown.element.focus();
    fontDropdown.pendingFontJumpValue = null;
    fontDropdown.moveFontSelection(-1);
    check(fontDropdown.value === "preview-family-25", "Arrow navigation did not use its selected fallback");
    fontDropdown.element.focus();
    fontDropdown.value = "removed-family";
    fontDropdown.moveFontSelection(1);
    check(fontDropdown.value === "preview-family-1", "Missing font selection did not begin navigation at the first row");
    fontDropdown.replaceValues([]);
    fontDropdown.moveFontSelection(1);
    check(fontDropdown.value === null, "An empty font picker gained a selected value");
    fontDropdown.pendingFontJumpValue = "not-rendered";
    fontDropdown.focusPendingFontEntry();
    check(fontDropdown.pendingFontJumpValue === "not-rendered", "Missing font row consumed a pending focus jump");
    fontDropdown.close();
    fontDropdown.onFontTypeahead(new KeyboardEvent("keydown", {key: "a"}));
    check(fontDropdown.menu === null, "Closed font picker reacted to a key");
    dropdown.options.menuCheckmarks = false;
    dropdown.options.menuIcons = true;
    dropdown.replaceValues([["one", "One", "reset_icon.png"], ["two", "Two"]]);
    dropdown.open();
    check(dropdown.menu.querySelector("button img").getAttribute("src") === "assets/icons/reset_icon.png",
        "Icon menu did not show its configured icon");
    dropdown.cycle();
    check(dropdown.menu === null && dropdown.value === "two", "Cycling an open dropdown did not close its menu");
    dropdown.close();
    phase("font picker diagnostics recover from unavailable lazy font storage");
    let openFontDatabase = FontManager.openDatabase;
    let warnFont = console.warn;
    let pickerWarnings = [];
    let fontStorageFailure = new Error("Picker font storage temporarily unavailable");
    document.fonts.delete(FontManager.faces.get(font.id));
    FontManager.faces.delete(font.id);
    try {
        FontManager.openDatabase = async () => { throw fontStorageFailure; };
        console.warn = (...args) => pickerWarnings.push(args);
        fontDropdown.replaceValues([[font.family, font.name]]);
        fontDropdown.selectEntry([font.family, font.name]);
        await waitFor(() => pickerWarnings.some(args => args[0].startsWith("Could not load selected font")));
        fontDropdown.open();
        await waitFor(() => pickerWarnings.some(args => args[0].startsWith("Could not load font preview")));
        check(pickerWarnings.length === 2 && pickerWarnings.every(args => args[1] === fontStorageFailure),
            "Font picker lost the original storage error or produced duplicate diagnostics");
        check(fontDropdown.value === font.family && fontDropdown.menu !== null,
            "Font storage failure changed the selection or prevented opening its menu");
    } finally {
        fontDropdown.close();
        FontManager.openDatabase = openFontDatabase;
        console.warn = warnFont;
    }
    check((await FontManager.ensureLoaded(font.family)).status === "loaded", "Font picker could not recover after storage became available");
    dropdown.element.remove();
    fontDropdown.element.remove();
    ToolType.TEXT.setSetting("fontFamily", font.family);
    phase("loaded custom fonts update text that became pending during activation");
    let previousToolType = app.getActiveTool()?.getType() || null;
    app.setActiveToolFromType(ToolType.TEXT);
    let customText = app.getActiveTool();
    customText.onMouseDown(20, 20, MouseButton.LEFT);
    customText.editor.value = "Custom face";
    customText.editor.dispatchEvent(new Event("input"));
    await new Promise(resolve => requestAnimationFrame(resolve));
    check(customText.pending && customText.editor.style.fontFamily.includes(font.family)
        && (await FontManager.ensureLoaded(font.family)).status === "loaded",
        "A custom font finishing activation lost its pending text or font family");
    customText.cancelPending();
    app.setActiveTool(null);
    if (previousToolType !== null) {
        app.setActiveToolFromType(previousToolType);
    }
    check(await FontManager.removeFont(font.id), "Stored font was not removed");
    check(ToolType.TEXT.getSetting("fontFamily") === "sans-serif" && FontManager.getFonts().length === 0,
        "Removing selected font did not restore a built-in family");
    check(!await FontManager.removeFont(font.id), "Missing font removal reported success");
    await FontManager.addFont(new window.File([fontBytes], "Another.ttf"));
    check(await FontManager.removeAllFonts() === 1 && await FontManager.removeAllFonts() === 0,
        "Bulk font removal did not report its real count");

    phase("palette management and Help commands use the current menu model");
    colors.swatchElement.getElement().click();
    check(colors.swatchElement.isOpen() && colors.swatchElement.entries.length > 0,
        "Palette management button did not build its current entries");
    colors.swatchElement.close();
    let help = PanelRegistry.get("settingsMenu").get("menu.help");
    let oldOpen = window.open;
    let opened = [];
    try {
        window.open = (...args) => opened.push(args);
        for (let [id, url] of [
            ["helpTopics", "https://www.getpaint.net/doc/latest/index.html"],
            ["pdnWebsite", "https://www.getpaint.net/"],
            ["pdnSearch", "https://www.google.com/search?q=site%3Agetpaint.net+Paint.NET"],
            ["donate", "https://www.getpaint.net/donate.html"],
            ["forum", "https://forums.getpaint.net/"],
            ["tutorials", "https://forums.getpaint.net/forum/20-publishing-only/"],
            ["sendFeedback", "https://github.com/LabyStudio/paintdotjs/issues"]
        ]) {
            help.open();
            help.entries.find(entry => entry.id === "menu.help." + id).getElement().click();
            check(!help.isOpen() && opened.at(-1).join("|") === [url, "_blank", "noopener,noreferrer"].join("|"),
                "Help command opened an unexpected URL or retained its menu: " + id);
        }
    } finally {
        help.close();
        window.open = oldOpen;
    }
    phase("tool grid clicks select an actual registered tool");
    let toolForm = FormRegistry.get("mainToolBarForm");
    toolForm.getWindow().contentElement.querySelector('img[src$="pencil_tool_icon.png"]').parentElement.click();
    check(app.getActiveTool().getType() === ToolType.PENCIL, "Tool grid button did not activate Pencil");

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
    let clipboard = navigator.clipboard;
    let clipboardDescriptor = Object.getOwnPropertyDescriptor(clipboard, "writeText");
    let execCommand = document.execCommand;
    let textareaCount = document.querySelectorAll("textarea").length;
    try {
        Object.defineProperty(clipboard, "writeText", {configurable: true, value: undefined});
        errorForm.saveStatus.textContent = "Legacy copy pending";
        let copyBounds = errorForm.copyButton.getBoundingClientRect();
        for (let type of ["mouseDown", "mouseUp"]) {
            await require("electron").ipcRenderer.invoke("paintdotjs:test-input", {
                type, x: Math.round(copyBounds.left + copyBounds.width / 2),
                y: Math.round(copyBounds.top + copyBounds.height / 2), button: "left", clickCount: 1
            });
        }
        await waitFor(() => errorForm.saveStatus.textContent !== "Legacy copy pending");
        check(errorForm.saveStatus.textContent === "Error copied to clipboard.",
            "Legacy clipboard copy did not report its actual success: " + errorForm.saveStatus.textContent);
        let legacyText = await clipboard.readText();
        check(legacyText.includes("Second error") && legacyText.includes("No stack trace is available."),
            "Legacy clipboard contents lost the error or missing-stack explanation");
        check(document.querySelectorAll("textarea").length === textareaCount, "Legacy clipboard copy leaked its temporary textarea");
        document.execCommand = () => false;
        await errorForm.copyError();
        check(errorForm.saveStatus.textContent.includes("The browser rejected the clipboard request"),
            "Rejected legacy clipboard request was reported as successful");
        check(document.querySelectorAll("textarea").length === textareaCount, "Rejected copy leaked its temporary textarea");
        for (let failure of [new Error("Clipboard denied"), "Clipboard unavailable"]) {
            Object.defineProperty(clipboard, "writeText", {configurable: true, value: async () => {
                throw failure;
            }});
            await errorForm.copyError();
            check(errorForm.saveStatus.textContent === "Could not copy the error: " + String(failure.message || failure),
                "Native clipboard failure lost its error detail");
        }
    } finally {
        document.execCommand = execCommand;
        if (clipboardDescriptor === undefined) {
            delete clipboard.writeText;
        } else {
            Object.defineProperty(clipboard, "writeText", clipboardDescriptor);
        }
    }
    let saveAll = DocumentIO.saveAll;
    let originalConsoleError = ErrorForm.originalConsoleError;
    let diagnostics = [];
    try {
        ErrorForm.originalConsoleError = (...args) => diagnostics.push(args);
        let resolveSave;
        let calls = 0;
        DocumentIO.saveAll = includeClean => {
            check(includeClean === true, "Error recovery did not include clean images");
            ++calls;
            return new Promise(resolve => resolveSave = resolve);
        };
        let saving = errorForm.saveAll();
        check(errorForm.saveButton.disabled && errorForm.saveStatus.textContent === "Saving…",
            "Error recovery did not mark its save operation busy");
        await errorForm.saveAll();
        check(calls === 1, "Busy recovery save started a second operation");
        resolveSave(false);
        await saving;
        check(!errorForm.saveButton.disabled && errorForm.saveStatus.textContent === "Saving stopped or was canceled.",
            "Canceled recovery save did not release its busy state");
        DocumentIO.saveAll = async () => true;
        errorForm.saveButton.click();
        await waitFor(() => errorForm.saveStatus.textContent.includes(" saved. Check"));
        let count = app.getDocumentWorkspaces().length;
        check(errorForm.saveStatus.textContent === count + " image" + (count === 1 ? "" : "s")
            + " saved. Check the selected folder or Downloads.", "Successful recovery save lost its actual document count");
        let failure = new Error("Recovery write failed");
        DocumentIO.saveAll = async () => {
            throw failure;
        };
        await errorForm.saveAll();
        check(errorForm.report.message === failure.message && errorForm.report.source === "Could not save all images"
            && !errorForm.saveButton.disabled, "Failed recovery save did not refresh the error or release its button");
        ErrorForm.install();
        let priorReport = errorForm.report;
        ErrorForm.showing = true;
        ErrorForm.show({source: "Nested", message: "Nested test error", stack: ""});
        ErrorForm.showing = false;
        check(errorForm.report === priorReport, "Reentrant reporting replaced the current error form");
        let initialize = errorForm.initialize;
        try {
            errorForm.initialize = () => {
                throw new Error("Error layout failed");
            };
            ErrorForm.show({source: "Layout", message: "Layout test error", stack: ""});
            check(!ErrorForm.showing && diagnostics.at(-1)[0] === "Could not display the error form",
                "Recovery form failure was not diagnosed or retained its recursion guard");
        } finally {
            errorForm.initialize = initialize;
        }
        let unnamed = new Error("");
        unnamed.name = "FallbackError";
        unnamed.stack = undefined;
        check(ErrorForm.fromError(unnamed, "QA").message === "FallbackError"
            && ErrorForm.fromError(unnamed, "QA").stack === "", "Unnamed error lost its name/stack fallback");
        unnamed.name = "";
        check(ErrorForm.fromError(unnamed, "QA").message === "Unknown error", "Completely unnamed error lost its fallback");
        check(ErrorForm.fromError("", "QA").message === "Unknown error", "Empty string error lost its fallback");
        check(ErrorForm.fromConsoleArguments([unnamed], "QA").stack === String(unnamed),
            "Console error without stack did not retain its string representation");
    } finally {
        DocumentIO.saveAll = saveAll;
        ErrorForm.originalConsoleError = originalConsoleError;
        ErrorForm.showing = false;
    }
    errorForm.ignoreButton.click();
    check(!errorForm.getWindow().isOpen(), "Ignore did not close the error form");
    errorForm.ignore();
};
