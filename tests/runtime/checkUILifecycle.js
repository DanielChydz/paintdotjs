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

module.exports = async function checkUILifecycle() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let host = document.createElement("div");
    document.body.appendChild(host);
    phase("unmounted and detached menu items preserve their lifecycle and text");
    let menu = new MenuItem("lifecycle.menu", () => {});
    menu.reinitialize();
    menu.updateText("Before mounting");
    menu.removeClass("absent");
    check(menu.getElement() === null, "Unmounted updates unexpectedly mounted a menu");
    menu.appendTo(host, null);
    menu.updateText(null);
    check(menu.getElement().textContent === menu.getText(), "Null menu text erased its label");
    menu.setId("lifecycle.renamedMenu");
    check(menu.getElement().id === "lifecycle.renamedMenu", "Mounted menu did not synchronize its new id");
    menu.removeClass("absent");
    let detached = menu.getElement();
    detached.remove();
    menu.reinitialize();
    check(menu.getElement() === detached, "Reinitialization replaced a detached element");
    let label = new LabelMenuItem("lifecycle.label").withNoIcon();
    label.updateText("Before mounting");
    label.appendTo(host, null);
    label.updateText("Updated label");
    check(label.getElement().textContent === "Updated label" && label.getElement().children.length === 1,
        "Updating an iconless label lost its text or inserted an icon");
    let checkbox = new CheckboxItem("lifecycle.checkbox");
    checkbox.appendTo(host, null);
    let press = new MouseEvent("mousedown", {bubbles: true, cancelable: true});
    checkbox.getElement().dispatchEvent(press);
    check(press.defaultPrevented && !checkbox.isChecked(), "Checkbox mousedown did not defer changing its value to input");
    checkbox.getElement().click();
    check(checkbox.isChecked(), "Checkbox without a change callback did not store its value");
    let icon = new IconItem("lifecycle.noicon", () => {}).withNoIcon();
    icon.appendTo(host, null);
    check(icon.getElement().querySelector("img").style.opacity === "0", "Iconless command showed an image");
    let unregisteredCalls = 0;
    let unregisteredIcon = new IconItem(null, () => ++unregisteredCalls).withNoIcon();
    unregisteredIcon.appendTo(host, null);
    unregisteredIcon.getElement().click();
    check(unregisteredCalls === 1 && unregisteredIcon.getElement().querySelector("img").title === unregisteredIcon.getText(),
        "Unregistered icon lost its callback or fallback tooltip");
    let calls = 0;
    let entry = new DropEntry("lifecycle.entry", () => { ++calls; }).withNoIcon();
    entry.appendTo(host, null);
    entry.getElement().dispatchEvent(new MouseEvent("mouseenter"));
    entry.setEnabled(false);
    entry.onPress(new MouseEvent("click"));
    check(calls === 0, "Disabled drop entry executed its command");
    entry.setEnabled(true);
    entry.onPress(new MouseEvent("click"));
    check(calls === 1, "Standalone drop entry failed without a menu ancestor");
    ActionRegistry.get("lifecycle.entry").runPerformAction();
    check(calls === 2, "Registered menu command did not invoke its UI callback");
    entry.setPressable(null);
    ActionRegistry.get("lifecycle.entry").runPerformAction();
    check(calls === 2, "Clearing a registered callback retained the previous command");
    let submenu = new SubmenuDropEntry("lifecycle.submenu", [entry]);
    submenu.appendTo(host, null);
    submenu.setEnabled(false);
    submenu.onPress(new MouseEvent("click"));
    submenu.open();
    check(submenu.submenuElement === null, "Disabled submenu opened");
    entry.setEnabled(false);
    submenu.setEnabled(true);
    submenu.open();
    check(!submenu.isEnabled() && submenu.submenuElement === null,
        "Submenu with no executable entries remained available");
    let standaloneMenu = new DropMenuItem("lifecycle.drop", []);
    standaloneMenu.appendTo(host, null);
    standaloneMenu.getElement().dispatchEvent(new MouseEvent("mouseenter"));
    standaloneMenu.close();
    check(!standaloneMenu.isOpen(), "Standalone menu close retained an open state");
    let submenuParent = {parent: null, entries: [entry]};
    entry.setPressable(() => { ++calls; });
    entry.setEnabled(true);
    entry.updateParent(submenuParent);
    entry.onPress(new MouseEvent("click"));
    check(calls === 3, "Standalone nested entry failed to traverse an ancestor without a popup");
    phase("menus remain consistent when optional entries are removed through their public API");
    let emptyUnits = new MeasurementUnitSelectorItem();
    emptyUnits.appendTo(host, null);
    for (let entry of [...emptyUnits.entries]) {
        emptyUnits.remove(entry);
    }
    emptyUnits.setSelectedId("measurementUnit.pixel");
    check(!emptyUnits.isEnabled() && emptyUnits.getSelectedEntry() === null && emptyUnits.getText() === "",
        "Empty unit selector did not remain a disabled empty control");
    let mainMenu = PanelRegistry.get("mainMenu");
    let viewMenu = mainMenu.get("menu.view");
    let viewEntries = [...viewMenu.entries];
    try {
        viewMenu.remove(viewMenu.get("measurementUnit.pixel"));
        viewMenu.updateMeasurementUnitChecks();
        check(viewMenu.get("measurementUnit.pixel") === undefined
            && viewMenu.get("measurementUnit.inch") !== undefined,
        "Removing an optional unit entry corrupted the other View commands");
    } finally {
        viewMenu.entries = viewEntries;
        viewMenu.updateMeasurementUnitChecks();
    }
    let menuFile = mainMenu.get("menu.file");
    menuFile.open();
    await new Promise(resolve => setTimeout(resolve, 0));
    mainMenu.getElement().click();
    check(menuFile.isOpen(), "Clicking the top-level menu strip prematurely closed its active menu");
    menuFile.close();
    submenu.setEnabled(true);
    submenu.getElement().style.cssText = "position:fixed;left:20px;top:20px;width:100px";
    submenu.open();
    check(submenu.submenuElement !== null && !submenu.submenuElement.classList.contains("submenu-opens-left"),
        "A submenu with sufficient room failed to open to its right");
    submenu.close();
    submenu.getElement().style.left = (window.innerWidth - 30) + "px";
    submenu.open();
    check(submenu.submenuElement.classList.contains("submenu-opens-left")
        && submenu.submenuElement.getBoundingClientRect().right <= submenu.getElement().getBoundingClientRect().left + 2,
        "A submenu near the right viewport edge did not open to the left");
    submenu.close();
    document.dispatchEvent(new Event("focusin"));
    check(document.querySelector(".window-focused") === null, "Non-element focus retained a stale floating-window focus marker");

    phase("number controls reject unsupported pointer and keyboard gestures without changing value");
    let number = document.createElement("input");
    number.type = "number";
    number.value = "7";
    let wrapped = NumberInput.wrap(number);
    host.appendChild(wrapped);
    check(NumberInput.wrap(number) === wrapped, "Wrapping twice replaced the number control");
    NumberInput.enableKeyboardStepping(number);
    let up = wrapped.querySelector("button");
    up.dispatchEvent(new PointerEvent("pointerdown", {button: 2, pointerId: 99, bubbles: true}));
    for (let options of [{key: "Tab"}, {key: "ArrowUp", ctrlKey: true},
        {key: "ArrowUp", metaKey: true}, {key: "ArrowDown", altKey: true}, {key: "ArrowUp", isComposing: true}]) {
        number.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, ...options}));
    }
    check(number.value === "7", "Unsupported gesture changed the number");
    phase("canceled frame updates release ownership and can be scheduled again");
    let frameUpdates = new Debounced();
    let frameCalls = 0;
    frameUpdates.cancelDebounce("layout");
    frameUpdates.debounce("layout", () => ++frameCalls);
    frameUpdates.cancelDebounce("layout");
    frameUpdates.cancelDebounce("layout");
    await new Promise(resolve => requestAnimationFrame(resolve));
    check(frameCalls === 0 && frameUpdates.lastAnimationFrames.size === 0,
        "Canceling a queued frame retained ownership or ran a stale callback");
    frameUpdates.debounce("layout", () => ++frameCalls);
    await new Promise(resolve => requestAnimationFrame(resolve));
    check(frameCalls === 1 && frameUpdates.lastAnimationFrames.size === 0,
        "A canceled frame could not be scheduled again or retained its completed handle");
    phase("modal attention is idempotent and missing dialogs do not crash event blocking");
    let observer = ModalDialogController.observer;
    ModalDialogController.initialize();
    check(ModalDialogController.observer === observer, "Modal initialization registered a second observer");
    ModalDialogController.signalAttention(null);
    let backdrop = document.createElement("div");
    backdrop.className = "app-dialog-backdrop";
    document.body.appendChild(backdrop);
    let background = new MouseEvent("click", {cancelable: true});
    check(ModalDialogController.blockBackgroundEvent(background) && background.defaultPrevented,
        "A backdrop without a mounted dialog allowed background input");
    let dialog = document.createElement("section");
    dialog.className = "app-dialog";
    backdrop.appendChild(dialog);
    ModalDialogController.signalAttention(dialog);
    let lastAttention = ModalDialogController.lastAttention;
    ModalDialogController.signalAttention(dialog);
    check(ModalDialogController.lastAttention === lastAttention && dialog.classList.contains("modal-dialog-attention"),
        "Repeated attention restarted the animation inside the throttle interval");
    await new Promise(resolve => setTimeout(resolve, 900));
    check(!dialog.classList.contains("modal-dialog-attention"), "Modal attention animation did not clear");
    backdrop.remove();
    ModalDialogController.sync();
    phase("About and Help commands preserve singleton and toggle semantics");
    AboutDialog.open();
    let about = AboutDialog.instance;
    AboutDialog.open();
    check(AboutDialog.instance === about && document.querySelectorAll(".project-info-dialog").length === 1,
        "Opening About twice created multiple modals");
    about.close();
    about.close();
    check(AboutDialog.instance === null && about.backdrop === null, "Repeated About close retained its singleton");
    let help = PanelRegistry.get("settingsMenu").get("menu.help");
    let helpAction = ActionRegistry.get("menu.help");
    helpAction.runPerformAction();
    check(help.isOpen(), "Help shortcut did not open its menu");
    helpAction.runPerformAction();
    check(!help.isOpen(), "Help shortcut did not close its menu");
    check(FormRegistry.get("missing-lifecycle-form") === null, "Missing form lookup did not return null");
    phase("registering a restored hidden form emits its closed state without creating a window");
    let hiddenFormId = "lifecycleHiddenForm";
    let hiddenForm = new Form(hiddenFormId);
    let hiddenEvents = [];
    let onHiddenState = (window, open) => {
        if (window.persistenceId === hiddenFormId) {
            hiddenEvents.push(open);
        }
    };
    let addWindowListener = window.addEventListener;
    let registeredWindowListeners = [];
    app.on("app:window_open_state_changed", onHiddenState);
    AppSettingsStore.set("windows." + hiddenFormId, {visible: false, width: 150, height: 120, anchorX: 0, anchorY: 0});
    try {
        window.addEventListener = function (...args) {
            registeredWindowListeners.push(args);
            return addWindowListener.apply(this, args);
        };
        FormRegistry.register(hiddenForm);
        check(FormRegistry.get(hiddenFormId) === hiddenForm && !hiddenForm.getWindow().isOpen()
            && hiddenForm.getWindow().windowElement === null && hiddenEvents.length === 1 && hiddenEvents[0] === false,
        "Restored hidden form created a floating window or failed to publish its closed state");
    } finally {
        window.addEventListener = addWindowListener;
        for (let args of registeredWindowListeners) {
            window.removeEventListener(...args);
        }
        for (let name of ["app:update_active_document", "document:update_viewport", "app:resize"]) {
            app.off(name, hiddenForm.getWindow().updateImageOverlap);
        }
        app.off("app:window_open_state_changed", onHiddenState);
        FormRegistry.unregister(hiddenFormId);
        AppSettingsStore.set("windows." + hiddenFormId, null);
    }
    phase("form and palette toolbar callbacks preserve their visible toggle states");
    let settings = PanelRegistry.get("settingsMenu");
    let colorsForm = FormRegistry.get("colorsForm");
    let colorsWindow = colorsForm.getWindow();
    let wasOpen = colorsWindow.isOpen();
    let toggleColors = settings.get("menu.window.colors");
    toggleColors.getElement().click();
    check(colorsWindow.isOpen() === !wasOpen, "Colors toolbar button did not toggle its floating window");
    toggleColors.getElement().click();
    check(colorsWindow.isOpen() === wasOpen, "Repeated Colors toolbar click did not restore its window");
    let wasAddingColor = colorsForm.colorAddMode;
    colorsForm.colorAddElement.getElement().click();
    check(colorsForm.colorAddMode === !wasAddingColor, "Palette add-color button did not enter its mode");
    colorsForm.colorAddElement.getElement().click();
    check(colorsForm.colorAddMode === wasAddingColor, "Palette add-color button did not leave its mode");
    let percentage = PanelRegistry.get("footerMenu").get("zoomPercentageItem");
    percentage.open();
    percentage.textField.setText("100%");
    percentage.textField.getElement().dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    check(!percentage.isOpen(), "Zoom field submission did not close its popup");
    let adjustmentCalls = 0;
    let customAdjustment = AdjustmentsMenu.createAdjustment("lifecycle.customAdjustment", () => { ++adjustmentCalls; });
    customAdjustment.onPress(new MouseEvent("click"));
    check(adjustmentCalls === 1 && customAdjustment.getIconPath().includes("_adjustment"),
        "Custom adjustment entry did not retain its callback and icon name");
    let exit = PanelRegistry.get("mainMenu").get("menu.file").get("menu.file.exit");
    let closeWindow = window.close;
    let closeCalls = 0;
    try {
        window.close = () => { ++closeCalls; };
        exit.onPress(new MouseEvent("click"));
        check(closeCalls === 1, "File Exit did not request closing its host window");
    } finally {
        window.close = closeWindow;
    }
    phase("unmounted settings and tool panels keep optional controls inert");
    let detachedSettings = new SettingsDialog();
    detachedSettings.renderShortcutRows();
    detachedSettings.updateFontImportProgress(null);
    check(detachedSettings.shortcutList === null && detachedSettings.fontImportPanel === null,
        "Unmounted settings refresh allocated optional controls");
    let navigation = detachedSettings.createNavigation();
    check(navigation.children.length >= 10 && [...navigation.children].every(button => !button.disabled && button.textContent.trim()),
        "Implemented settings sections were disabled or lacked navigation labels");
    detachedSettings.page = document.createElement("div");
    let disabledAction = detachedSettings.addButton("Unavailable action", () => {}, {disabled: true});
    check(disabledAction.disabled && disabledAction.title === "Not implemented yet",
        "Disabled settings action omitted its default explanation");
    let swatch = new SwatchItem();
    check(swatch.buildElement().querySelector(".arrow-down") !== null,
        "A standalone palette selector omitted its downward arrow");
    let inlineIcon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>');
    let inlineDropdown = new ToolOptionDropdown({values: [["inline", "Inline", inlineIcon]], value: "inline"});
    check(inlineDropdown.getIconSource(["inline", "Inline", inlineIcon]) === inlineIcon,
        "An embedded dropdown icon gained a filesystem prefix");
    let detachedToolbar = new ToolMenu();
    detachedToolbar.renderOptions(null);
    let unknownType = new ToolType("unknown-custom-tool", "pencil_tool_icon", () => null, null, false);
    check(detachedToolbar.optionsElement === null && detachedToolbar.getOptionDefinitions(unknownType).length === 0,
        "Unknown tool options or an unmounted toolbar produced controls");
    let defaultWidth = detachedToolbar.createSelectControl(ToolType.PAINT_BRUSH,
        {key: "antialias", values: [[true, "Yes"], [false, "No"]]});
    check(defaultWidth.style.width === "130px", "A dropdown without an explicit width lost its default");
    let commits = 0;
    detachedToolbar.app = {getActiveTool: () => ({pending: false, tracking: true, commitPending: () => ++commits})};
    detachedToolbar.createActionControl({icon: "check_icon.png", label: "Finish"}).click();
    check(commits === 1, "Finish ignored a tracking tool with no pending shape");
    let selector = PanelRegistry.get("toolMenu").get("toolStripChooser.chooseToolButton");
    let unavailable = new DropEntry("unavailable-tool").withIconPathKey("pencil_tool_icon");
    selector.add(unavailable);
    try {
        let toolsGrid = FormRegistry.get("mainToolBarForm").buildContent();
        let disabledTool = toolsGrid.lastElementChild;
        let selectedTool = app.getActiveTool();
        check(disabledTool.hasAttribute("disabled"), "Unregistered tool entry was enabled in the Tools grid");
        disabledTool.click();
        check(app.getActiveTool() === selectedTool, "Clicking an unregistered tool changed the active tool");
    } finally {
        selector.remove(unavailable);
    }
    phase("new-dialog cancellation is idempotent and size preferences tolerate denied storage");
    let newFile = NewFileDialog.open(4, 3);
    let newClose = document.querySelector(".new-file-dialog .app-dialog-close");
    newClose.click();
    newClose.click();
    check(await newFile === null && NewFileDialog.activePromise === null, "Repeated new-dialog cancel retained its singleton");
    let stored = localStorage.getItem(ImageSizeDialog.storageKey);
    let getStored = Storage.prototype.getItem;
    let setStored = Storage.prototype.setItem;
    let deniedWrites = 0;
    try {
        Storage.prototype.getItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
        Storage.prototype.setItem = () => {
            ++deniedWrites;
            throw new DOMException("Quota exhausted", "QuotaExceededError");
        };
        let fallback = ImageSizeDialog.loadPreferences();
        check(fallback.resampling === "adaptiveHighQuality" && fallback.gammaCorrect
            && fallback.fill === "transparent" && fallback.anchor === "top", "Blocked size preferences lost defaults");
        ImageSizeDialog.savePreferences("resize", {maintainRatio: true, resampling: "nearestNeighbor", gammaCorrect: false});
        check(deniedWrites === 1, "Size preferences did not attempt exactly one optional write");
    } finally {
        Storage.prototype.getItem = getStored;
        Storage.prototype.setItem = setStored;
    }
    check(localStorage.getItem(ImageSizeDialog.storageKey) === stored, "Denied size preferences changed persisted data");
    host.remove();
};
