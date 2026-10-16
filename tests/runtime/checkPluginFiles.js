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

module.exports = async function checkPluginFiles() {
    let assert = require("node:assert/strict");
    let wait = async predicate => {
        let deadline = performance.now() + 5000;
        while (!predicate()) {
            assert.ok(performance.now() < deadline, "Plugin preview timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    let image = {width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255])};
    let plugin = PluginManager.normalizePlugin({id: "files.fixture", name: "File fixture", apiVersion: 1,
        fileTypes: [
            {id: "image", name: "Fixture image", extensions: [".fixture"], supportsLayers: true,
                saveControls: [paintDotJs.controls.range("amount", "Amount", 0, 10, 3), paintDotJs.controls.text("comment", "Comment", "default")],
                decode: () => image, encode: ({values}) => new Uint8Array([values.amount])},
            {id: "read", name: "Read only", extensions: [".readonly"], decode: () => image}
        ]});
    PluginManager.activatePlugin(plugin);
    let workspace, reader;
    try {
        workspace = await DocumentIO.openImage(new window.File(["x"], "test.fixture"));
        assert.equal(workspace.fileFormat, "plugin.files.fixture.image");
        reader = await DocumentIO.openImage(new window.File(["x"], "test.readonly"));
        assert.equal(reader.fileFormat, null);
        app.setActiveDocumentWorkspace(workspace);
        await DocumentIO.addFileAsLayer(new window.File(["x"], "layer.fixture"));
        assert.equal(workspace.getDocument().getLayers().getLayerCount(), 2);
        let blob = await DocumentIO.encodeWorkspace(workspace, workspace.fileFormat, {amount: 7});
        assert.equal(new Uint8Array(await blob.arrayBuffer())[0], 7);
        await assert.rejects(DocumentIO.encodeWorkspace(workspace, "plugin.missing"), /disabled/);
        let type = PluginFileTypes.definitions.get(workspace.fileFormat);
        AppSettingsStore.set("fileTypes.saveOptions", {[type.id]: {amount: 5}});
        let pending = SaveImageDialog.open({canvas: workspace.getCompositionSurface().getCanvas(),
            initialFormat: type.id, initialOptions: {amount: 8},
            encode: (id, values) => DocumentIO.encodeWorkspace(workspace, id, values)});
        let form = document.querySelector(".save-config-dialog");
        await wait(() => !form.querySelector('button[type="submit"]').disabled);
        assert.ok(form.textContent.includes("Source preview"));
        assert.equal(form.querySelector('.save-config-plugin-controls input[type="range"]').value, "8");
        form.querySelector(".save-config-defaults").click();
        assert.equal(form.querySelector('.save-config-plugin-controls input[type="range"]').value, "3");
        await wait(() => !form.querySelector('button[type="submit"]').disabled);
        form.requestSubmit();
        let result = await pending;
        assert.equal(result.options.amount, 3);
        pending = SaveImageDialog.open({canvas: workspace.getCompositionSurface().getCanvas(), initialFormat: "png"});
        form = document.querySelector(".save-config-dialog");
        form.querySelector(".app-dialog-close").click();
        await pending;
        let originalSave = SaveImageDialog.open;
        SaveImageDialog.open = async () => null;
        try {
            assert.equal(await DocumentIO.saveActive(), false);
            PluginManager.deactivatePlugin(plugin.id);
            assert.equal(await DocumentIO.saveActive(), false);
        } finally {
            SaveImageDialog.open = originalSave;
        }
    } finally {
        PluginManager.deactivatePlugin(plugin.id);
        if (workspace) {
            app.closeDocumentWorkspace(workspace, false);
        }
        if (reader) {
            app.closeDocumentWorkspace(reader, false);
        }
    }
};
