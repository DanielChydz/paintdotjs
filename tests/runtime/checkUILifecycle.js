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
