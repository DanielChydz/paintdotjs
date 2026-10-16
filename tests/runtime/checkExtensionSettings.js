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

module.exports = async function checkExtensionSettings() {
    let assert = require("node:assert/strict");
    let {zipSync} = require("fflate");
    let text = value => new TextEncoder().encode(value);
    let packageFile = (entries, name) => new window.File([zipSync(Object.fromEntries(
        Object.entries(entries).map(([key, value]) => [key, typeof value === "string" ? text(value) : value])))], name);
    let metadata = {id: "settings.fixture", name: "Settings fixture", apiVersion: 1, version: "1.0",
        author: "Tests", website: "https://example.com", description: "Fixture", category: "Tests", license: "MIT"};
    let pluginFile = packageFile({"plugin.json": JSON.stringify(metadata),
        "plugin.js": 'paintDotJs.registerPlugin({effects:[{id:"x",name:"X",renderPixel:()=>[0,0,0,255]}]});'}, "fixture.paintjs");
    let shapeFile = new window.File(['<SimpleGeometryShape DisplayName="Fixture" Geometry="M0 0 L10 10 L0 10 Z"/>'], "fixture.xaml");
    let originalTask = TaskDialog.show, originalReport = ErrorForm.report;
    let originalLoad = PluginCatalog.load, originalInstall = PluginCatalog.install;
    let tasks = [], errors = [], choice = "close";
    TaskDialog.show = async options => { tasks.push(options); return choice; };
    ErrorForm.report = (...args) => errors.push(args);
    PluginCatalog.load = async () => [];
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let drag = (element, property, transfer = null, relatedTarget = null) => element[property]({
        preventDefault() {}, stopPropagation() {}, dataTransfer: transfer, relatedTarget
    });
    let picker = async (entry, files, addText) => {
        let input = entry.page.querySelector('input[type="file"]');
        let clicks = 0;
        input.click = () => ++clicks;
        [...entry.page.querySelectorAll("button")].find(button => button.textContent === addText).click();
        assert.equal(clicks, 1);
        let transfer = new DataTransfer();
        for (let file of files) {
            transfer.items.add(file);
        }
        input.files = transfer.files;
        await input.onchange();
        assert.equal(input.value, "");
    };
    let packIds = [];
    try {
        SettingsDialog.open("plugins");
        let settings = SettingsDialog.instance;
        let plugins = settings.getEntry("plugins");
        assert.ok(settings.page.textContent.includes("No plugins"));
        await picker(plugins, [pluginFile], "Install plugin…");
        assert.ok(settings.page.textContent.includes("Settings fixture"));
        await picker(plugins, [], "Install plugin…");
        let toggle = settings.page.querySelector('input[type="checkbox"]');
        toggle.checked = false;
        await toggle.onchange();
        assert.equal(PluginManager.getPlugins()[0].enabled, false);
        toggle.checked = true;
        await toggle.onchange();
        assert.equal(PluginManager.getPlugins()[0].enabled, true);
        let originalEnabled = PluginManager.setEnabled;
        PluginManager.setEnabled = async () => { throw new Error("storage unavailable"); };
        toggle.checked = false;
        try {
            await toggle.onchange();
            assert.equal(toggle.checked, true);
            assert.equal(toggle.disabled, false);
            assert.equal(errors.length, 1);
        } finally {
            PluginManager.setEnabled = originalEnabled;
        }
        plugins.pluginImporting = true;
        await plugins.importPluginFiles([pluginFile]);
        assert.ok(settings.status.textContent.includes("Wait"));
        plugins.pluginImporting = false;
        await plugins.importPlugin(new window.File(["bad"], "bad.dll"));
        assert.equal(tasks.at(-1).title, "Plugin warnings and errors");
        assert.ok(tasks.at(-1).preview.textContent.includes("bad.dll"));
        await plugins.importPluginFiles([pluginFile, new window.File(["bad"], "a.dll"), new window.File(["bad"], "b.dll")]);
        assert.ok(tasks.at(-1).message.includes("2 plugin issues"));
        plugins.pluginImportResults = [{status: "installed", fileName: "ok", warnings: ["warning"], family: "Test", reason: "OK"},
            {status: "unknown", fileName: "unknown", family: "Test", reason: "Unknown"}];
        await plugins.showPluginIssuesPopup();
        assert.ok(tasks.at(-1).preview.textContent.includes("warning"));
        plugins.pluginImportResults = [{status: "installed"}];
        assert.equal(plugins.getPluginIssues().length, 0);
        plugins.pluginImportResults = [];
        await plugins.showPluginIssuesPopup();
        await settings.importPlugin(pluginFile);
        await settings.importPluginFiles([pluginFile]);
        let drop = settings.page.querySelector(".settings-plugin-drop-zone");
        for (let transfer of [null, {files: [], dropEffect: "none"}]) {
            drag(drop, "ondragenter", transfer);
            drag(drop, "ondragover", transfer);
            drag(drop, "ondragleave", transfer, drop);
            drag(drop, "ondragleave", transfer);
            await drag(drop, "ondrop", transfer);
        }
        await drag(drop, "ondrop", {files: [pluginFile]});
        plugins.renderPluginRows(PluginManager.getPlugins()[0].id);
        await settings.page.querySelector(".settings-plugin-remove").onclick();
        assert.equal(PluginManager.getPlugins().length, 0);

        // The catalog is local in this scenario; no public server is contacted.
        settings.page.querySelectorAll(".settings-action-button")[1].click();
        await frame();
        let browser = PluginBrowserDialog.instance;
        let panel = browser.panel;
        PluginBrowserDialog.open();
        assert.equal(document.activeElement, panel.search);
        let entries = [
            {...metadata, url: "https://example.com/a.paintjs", source: "https://example.com/src"},
            {...metadata, id: "other", name: "Other", website: "", url: "https://example.com/b.paintjs", source: "https://example.com/src"}
        ];
        PluginCatalog.load = async () => entries;
        await panel.refresh.onclick();
        assert.equal(panel.list.childElementCount, 2);
        panel.search.value = "not found";
        panel.search.oninput();
        assert.equal(panel.list.textContent, "No plugins match your search.");
        panel.search.value = "";
        panel.search.oninput();
        panel.busy = true;
        await panel.load();
        await panel.install(entries[0]);
        panel.busy = false;
        PluginCatalog.install = async () => { throw new Error("bad hash"); };
        await panel.list.querySelector("button").onclick();
        assert.ok(panel.message.textContent.includes("bad hash"));
        PluginCatalog.install = async () => PluginManager.importFile(pluginFile);
        await panel.install(entries[0]);
        assert.ok(panel.message.textContent.includes("Installed Settings fixture"));
        assert.equal(panel.list.querySelector("button").textContent, "Installed");
        panel.entries[0] = {...entries[0], version: "2.0"};
        panel.render();
        assert.equal(panel.list.querySelector("button").textContent, "Update");
        PluginCatalog.load = async () => { throw new Error("offline"); };
        await panel.load();
        assert.ok(panel.message.textContent.includes("offline"));
        let first = browser.backdrop.querySelector("button");
        let last = panel.refresh;
        first.focus();
        document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, cancelable: true}));
        assert.equal(document.activeElement, last, "Backward Tab: " + document.activeElement.outerHTML);
        document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
        assert.equal(document.activeElement, first, "Forward Tab: " + document.activeElement.outerHTML);
        panel.search.focus();
        document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
        let overlay = document.createElement("div");
        overlay.className = "app-dialog-backdrop";
        overlay.innerHTML = '<section class="app-dialog" tabindex="0"></section>';
        document.body.appendChild(overlay);
        overlay.firstChild.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
        assert.equal(PluginBrowserDialog.instance, browser);
        overlay.remove();
        panel.search.focus();
        panel.search.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
        assert.equal(PluginBrowserDialog.instance, null);
        PluginBrowserDialog.open();
        await frame();
        PluginBrowserDialog.instance.backdrop.querySelector(".app-dialog-close").click();

        settings.selectSection("shapes");
        let shapes = settings.getEntry("shapes");
        assert.equal(await shapes.importShapes([]), null);
        await shapes.clearAllShapes();
        await shapes.showShapeIssuesPopup();
        await picker(shapes, [shapeFile], "Add shapes…");
        assert.ok(settings.page.textContent.includes("fixture.xaml"));
        shapes.shapeImporting = true;
        assert.equal(await shapes.importShapes([shapeFile]), null);
        shapes.shapeImporting = false;
        await shapes.importShapes([shapeFile, new window.File(["bad"], "bad.xaml")]);
        assert.equal(tasks.at(-1).title, "Shape errors");
        shapes.shapeImportResults.push({fileName: "another.xaml", message: "bad"});
        await shapes.shapeIssuesButton.onclick();
        assert.ok(tasks.at(-1).message.includes("files"));
        drop = shapes.shapeDropZone;
        drag(drop, "ondragenter", null);
        drag(drop, "ondragover", {dropEffect: "none"});
        drag(drop, "ondragleave", null, drop);
        drag(drop, "ondragleave");
        await drag(drop, "ondrop");
        await drag(drop, "ondrop", {files: [shapeFile]});
        assert.equal(shapes.formatFileSize(2048), "2.0 KB");
        choice = "cancel";
        await shapes.clearAllShapes();
        assert.equal(ShapeManager.getShapes().length, 1);
        choice = "clear";
        await shapes.shapeClearButton.onclick();
        assert.equal(ShapeManager.getShapes().length, 0);
        await shapes.importShapes([shapeFile]);
        await settings.page.querySelector(".settings-shape-remove").onclick();
        assert.equal(ShapeManager.getShapes().length, 0);
        await settings.importShapes([shapeFile]);
        await shapes.importShapes([new window.File(["bad"], "bad.xaml")]);
        await shapes.importShapes([shapeFile, new window.File([await shapeFile.text()], "other.xaml")]);
        ShapeCatalog.unregister(ShapeManager.getShapes()[0].id);
        shapes.renderShapeRows();
        assert.ok(settings.page.querySelector('img[src="assets/icons/warning_icon.png"]'));

        settings.selectSection("assets");
        let assets = settings.getEntry("assets");
        let icon = new Uint8Array(await (await fetch("assets/icons/paint_brush_tool_icon.png")).arrayBuffer());
        let iconFile = packageFile({"asset-pack.json": JSON.stringify({formatVersion: 1, name: "Fixture icons"}),
            "icons/paint_brush_tool_icon.png": icon, "icons/z.png": icon, "images/a.webp": icon,
            "lang/pl.json": JSON.stringify({test: "Polski"}), "lang/en.json": JSON.stringify({test: "English"})}, "icons.zip");
        await picker(assets, [iconFile], "Install icon pack…");
        packIds.push(AssetPackManager.getActivePackId());
        assert.equal(assets.assetPackPreviewUrls.length, 3);
        let storedPack = AssetPackManager.packs.find(pack => pack.id === packIds[0]);
        storedPack.author = "";
        storedPack.iconCount = 1;
        assets.renderAssetPackRows();
        assert.ok(settings.page.textContent.includes("1 image"));
        let externalImage = new Image();
        externalImage.src = URL.createObjectURL(new Blob([icon], {type: "image/png"}));
        AssetPackManager.applyToImage(externalImage);
        assert.equal(externalImage.dataset.assetPath, undefined);
        URL.revokeObjectURL(externalImage.src);
        externalImage.dataset.assetPackUpdating = "true";
        AssetPackManager.applyToImage(externalImage);
        await picker(assets, [], "Install icon pack…");
        assets.assetPackImporting = true;
        await assets.importAssetPack(iconFile);
        assets.assetPackImporting = false;
        await assets.importAssetPack(new window.File(["bad"], "bad.txt"));
        assert.equal(errors.length, 2);
        let rows = [...settings.page.querySelectorAll(".settings-asset-row")];
        await rows[0].querySelector("button").onclick();
        assert.equal(AssetPackManager.getActivePackId(), "default");
        assets.renderAssetPackRows(packIds[0]);
        let translations = packageFile({"asset-pack.json": JSON.stringify({formatVersion: 1, name: "Translations"}),
            "lang/pl.json": "{}"}, "language.zip");
        await assets.importAssetPack(translations);
        packIds.push(AssetPackManager.getActivePackId());
        assert.ok(settings.page.textContent.includes("Translations only"));
        drop = settings.page.querySelector(".settings-asset-drop-zone");
        drag(drop, "ondragenter");
        drag(drop, "ondragover", {dropEffect: "none"});
        drag(drop, "ondragleave", null, drop);
        drag(drop, "ondragleave");
        await drag(drop, "ondrop");
        await drag(drop, "ondrop", {files: []});
        await drag(drop, "ondrop", {files: [translations]});
        packIds.push(AssetPackManager.getActivePackId());
        await settings.importAssetPack(translations);
        packIds.push(AssetPackManager.getActivePackId());
        let removable = [...settings.page.querySelectorAll(".settings-asset-row")]
            .find(row => row.querySelector("strong").textContent === "Translations")
            .querySelector(".settings-asset-remove");
        await removable.onclick();
        settings.selectSection("ui");
        let ui = settings.getEntry("ui");
        ui.uiAssetPackSelect.value = packIds[0];
        ui.uiAssetPackSelect.dispatchEvent(new Event("change"));
        await frame();
        assert.equal(AssetPackManager.getActivePackId(), packIds[0]);
        AppSettingsStore.set("ui.fontFamily", "unavailable fixture");
        ui.updateUiFontSelect();
        assert.equal(ui.uiFontSelect.value, "Noto Sans");
        ui.uiFontSelect.value = "Inter";
        ui.uiFontSelect.dispatchEvent(new Event("change"));
        assert.equal(AppSettingsStore.get("ui.fontFamily"), "Inter");
        window.dispatchEvent(new CustomEvent("paintdotjs:fonts-changed"));
        window.dispatchEvent(new CustomEvent("paintdotjs:asset-packs-changed"));
        let originalActivate = AssetPackManager.activate;
        AssetPackManager.activate = async () => { throw new Error("activation failed"); };
        try {
            ui.uiAssetPackSelect.dispatchEvent(new Event("change"));
            await frame();
            assert.ok(settings.status.textContent.includes("Could not activate"));
        } finally {
            AssetPackManager.activate = originalActivate;
        }
        settings.selectSection("plugins");
        let saved = PluginManager.records[0];
        Object.assign(saved, {effectCount: 0, fileTypeCount: 2, author: "", description: ""});
        plugins.renderPluginRows();
        assert.ok(settings.page.textContent.includes("2 file types"));
        Object.assign(saved, {effectCount: 2, fileTypeCount: 1});
        plugins.renderPluginRows();
        assert.ok(settings.page.textContent.includes("2 effects, 1 file type"));
        let issues = plugins.createPluginIssueRow({fileName: "warning", status: "installed", family: "Test", reason: "OK"});
        assert.ok(issues.textContent.includes("Installed"));
        let canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        let imageFile = new window.File([await DocumentIO.canvasToBlob(canvas, "image/png")], "drop.png", {type: "image/png"});
        for (let files of [[shapeFile], [pluginFile], [translations], [shapeFile, pluginFile],
            [pluginFile, translations], [shapeFile, pluginFile, translations, imageFile]]) {
            await DocumentIO.handleDroppedFiles(files);
        }
        packIds.push(...AssetPackManager.getPacks().filter(pack => !pack.builtIn).map(pack => pack.id));
        settings.close();
        ui.updateUiAssetPackSelect();
        ui.updateUiFontSelect();
        assets.renderAssetPackRows();
        shapes.renderShapeRows();
        plugins.renderPluginRows();
    } finally {
        PluginBrowserDialog.instance?.close();
        SettingsDialog.instance?.close();
        await PluginManager.remove(metadata.id);
        await ShapeManager.clear();
        for (let id of packIds) {
            await AssetPackManager.remove(id);
        }
        TaskDialog.show = originalTask;
        ErrorForm.report = originalReport;
        PluginCatalog.load = originalLoad;
        PluginCatalog.install = originalInstall;
    }
};
