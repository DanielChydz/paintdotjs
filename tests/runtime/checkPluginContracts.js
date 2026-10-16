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

module.exports = async function checkPluginContracts() {
    let assert = require("node:assert/strict");
    let {zipSync} = require("fflate");
    let encoder = new TextEncoder();
    let metadata = {apiVersion: 1, id: "contract.plugin", name: "Contract plugin", version: "1.0",
        author: "Tests", website: "https://example.com", description: "Test effects", category: "Tests", license: "MIT"};
    let pack = (source, overrides = {}) => new window.File([zipSync({
        "plugin.json": encoder.encode(JSON.stringify({...metadata, ...overrides})),
        "plugin.js": encoder.encode(source)
    })], "contract.paintjs");
    let source = `paintDotJs.registerPlugin({workerSafe:true,effects:[
        {id:'red',name:'Red',category:'Root',renderPixel:({r,g,b,a})=>[255-r,g,b,a]},
        {id:'blue',name:'Blue',category:'Photo',renderPixel:({r,g,b,a})=>[r,g,255-b,a]},
        {id:'other',name:'Other',category:'Special',controls:[paintDotJs.controls.range('amount','Amount',0,10,3)],
            renderPixel:({r,g,b,a})=>[r,g,b,a]},
        {id:'adjust',name:'Adjust',menu:'Adjustments',category:'Special',renderPixel:({r,g,b,a})=>[r,g,b,a]},
        {id:'root-adjust',name:'Root adjust',menu:'Adjustments',category:'Root',renderPixel:({r,g,b,a})=>[r,g,b,a]}
    ],fileTypes:[{id:'image',name:'Contract image',extensions:['.contract'],supportsLayers:true,
        decode:()=>({width:1,height:1,data:new Uint8Array([1,2,3,255])}),
        encode:()=>new Uint8Array([42])}]});`;
    let record = await PluginManager.importFile(pack(source));
    let workspace = app.createBlankDocumentInNewWorkspace(2, 2);
    try {
        ActionRegistry.initialize();
        assert.equal(PluginManager.getPlugins()[0].id, record.id);
        assert.equal(PluginManager.getRuntimePlugins()[0].effects.length, 5);
        assert.equal(PluginManager.getLoadErrors().length, 0);
        assert.equal(await PluginManager.setEnabled("missing", true), false);
        assert.equal(await PluginManager.setEnabled(record.id, true), false);
        assert.equal(await PluginManager.remove("missing"), false);
        let replacement = await PluginManager.importFile(pack(source));
        assert.equal(replacement.importedAt, record.importedAt);
        assert.equal(PluginManager.getPlugins().length, 1);
        await assert.rejects(PluginManager.importFile(pack(source), {id: "different", version: "1.0"}), /identity/);
        await assert.rejects(PluginManager.importFile(pack(source), {id: record.id, version: "2.0"}), /version/);
        await assert.rejects(PluginManager.importFile(new window.File(["x"], "bad.dll")), /paintjs/);
        await assert.rejects(PluginManager.importFile(new window.File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.paintjs")), /5 MB/);
        await assert.rejects(PluginManager.evaluateSource("", "empty.js"), /exactly once/);
        assert.throws(() => paintDotJs.registerPlugin({}), /only be called/);
        PluginManager.registrationTarget = [];
        await assert.rejects(PluginManager.evaluateSource("", "concurrent.js"), /already being loaded/);
        PluginManager.registrationTarget = null;
        let standalone = await PluginManager.evaluateSource('paintDotJs.registerPlugin('
            + JSON.stringify(metadata).slice(0, -1) + ',workerSafe:true,effects:[{id:"x",name:"X",renderPixel:()=>[0,0,0,255]}]});', "standalone.js");
        assert.equal(standalone.id, record.id);
        assert.ok(await new BitmapEffectAction(standalone.effects[0].definition).performAction(workspace, {}) instanceof BitmapHistoryMemento);
        let createUrl = URL.createObjectURL;
        URL.createObjectURL = blob => {
            let url = createUrl(blob);
            URL.revokeObjectURL(url);
            return url;
        };
        try {
            await assert.rejects(PluginManager.evaluateSource("", "revoked.js"), /could not be evaluated/);
            assert.equal(PluginManager.registrationTarget, null);
        } finally {
            URL.createObjectURL = createUrl;
        }
        assert.equal(paintDotJs.utils.clamp(20, 0, 10), 10);
        assert.equal(paintDotJs.utils.clampByte(12.6), 13);
        assert.equal(paintDotJs.controls.checkbox("a", "A").defaultValue, false);
        assert.equal(paintDotJs.controls.color("a", "A").defaultValue, "#000000");
        assert.equal(paintDotJs.controls.text("a", "A").defaultValue, "");
        assert.equal(paintDotJs.controls.select("a", "A", "b", [["b", "B"]]).type, "select");
        let definition = PluginManager.getEffectDefinitions().find(effect => effect.id.endsWith(".red"));
        assert.ok(paintDotJs.effects.list().some(effect => effect.id === definition.id));
        assert.throws(() => paintDotJs.effects.apply(definition.id, new Uint8Array(4), 1, 1), /RGBA/);
        assert.throws(() => PluginManager.getPublicEffectDefinition("unknown"), /Unknown effect/);
        let builtIn = Object.values(BitmapEffectEngine.DEFINITIONS)[0];
        assert.equal(PluginManager.getPublicEffectDefinition(builtIn.id), builtIn);
        let rgba = new Uint8ClampedArray([10, 20, 30, 255]);
        assert.deepEqual(Array.from(paintDotJs.effects.apply(definition.id, rgba, 1, 1)), [245, 20, 30, 255]);
        assert.deepEqual(Array.from(paintDotJs.effects.apply(definition.id, rgba, 1, 1, {})), [245, 20, 30, 255]);
        assert.equal(rgba[0], 10);
        await assert.rejects(paintDotJs.effects.configure(definition.id, null), /options/);
        await assert.rejects(paintDotJs.effects.configure(definition.id, {source: [], width: 1, height: 1}), /RGBA/);
        assert.deepEqual(await paintDotJs.effects.configure(definition.id, {source: rgba, width: 1, height: 1}), {});

        // Whole-image render contracts run against native ImageData.
        let image = new ImageData(rgba, 1, 1);
        for (let [render, expected] of [[({destination}) => { destination[0] = 99; }, 99],
            [({destination}) => destination, 10],
            [() => new ImageData(new Uint8ClampedArray([99, 20, 30, 255]), 1, 1), 99],
            [() => new Uint8ClampedArray([99, 20, 30, 255]), 99]]) {
            let whole = PluginManager.normalizeEffect(metadata, {id: "whole", name: "Whole", render}).definition;
            assert.equal(whole.apply(image, 1, 1, {}).data[0], expected);
        }
        for (let render of [() => Promise.resolve(), () => new ImageData(2, 1), () => "bad", () => new Uint8ClampedArray(3)]) {
            let whole = PluginManager.normalizeEffect(metadata, {id: "whole", name: "Whole", render}).definition;
            assert.throws(() => whole.apply(image, 1, 1, {}, new Uint8Array([1])));
        }
        let destinationReturn = PluginManager.normalizeEffect(metadata,
            {id: "whole", name: "Whole", render: ({width, height}) => new ImageData(width, height)}).definition;
        assert.equal(destinationReturn.apply(image, 1, 1, {}).width, 1);

        // Custom effect configuration receives copies and can preview or cancel.
        let previews = [];
        let configured = {...definition, id: "contract.configure", configure: options => {
            options.source[0] = 0;
            options.preview({amount: 2});
            options.showOriginal();
            assert.equal(options.selectionBounds.width, 1);
            return options.values;
        }};
        PluginManager.effectDefinitions.set(configured.id, configured);
        let values = {amount: 3};
        assert.deepEqual(await paintDotJs.effects.configure(configured.id, {source: rgba, width: 1, height: 1,
            selection: new Uint8Array([1]), values, preview: value => previews.push(value)}), values);
        assert.deepEqual(previews, [{amount: 2}, null]);
        assert.equal(rgba[0], 10);
        assert.notEqual(previews[0], values);
        await paintDotJs.effects.configure(configured.id, {source: rgba, width: 1, height: 1});
        await paintDotJs.effects.configure(configured.id, {source: rgba, width: 1, height: 1, values: null});
        configured.dialogTitle = "";
        await paintDotJs.effects.configure(configured.id, {source: rgba, width: 1, height: 1});
        let clone = window.structuredClone;
        window.structuredClone = undefined;
        try {
            configured.dialogTitle = configured.displayName = "";
            await paintDotJs.effects.configure(configured.id, {source: rgba, width: 1, height: 1, values: {amount: 1}, preview() {}});
        } finally {
            window.structuredClone = clone;
        }
        PluginManager.effectDefinitions.delete(configured.id);
        PluginManager.effectDefinitions.set("contract.empty", {...definition, id: "contract.empty", controls: undefined});
        assert.deepEqual(await paintDotJs.effects.configure("contract.empty", {source: rgba, width: 1, height: 1, values: {}}), {});
        PluginManager.effectDefinitions.delete("contract.empty");

        let generic = {...definition, id: "contract.generic", configure: null,
            controls: PluginManager.normalizeControls([
                paintDotJs.controls.text("text", "Text", "before"),
                paintDotJs.controls.color("color", "", "#000000"),
                paintDotJs.controls.range("amount", "Amount", 0, 10, 3, 1, {track: "hue"})
            ], "generic")};
        PluginManager.effectDefinitions.set(generic.id, generic);
        let pending = paintDotJs.effects.configure(generic.id, {source: rgba, width: 1, height: 1, preview() {}});
        let form = document.querySelector(".effect-config-dialog");
        let textInput = form.querySelector('input[type="text"]');
        textInput.value = "after";
        textInput.dispatchEvent(new Event("input"));
        form.querySelector('input[type="color"]').dispatchEvent(new Event("input"));
        form.requestSubmit();
        assert.equal((await pending).text, "after");
        for (let name of ["Generic", ""]) {
            generic.dialogTitle = "";
            generic.displayName = name;
            let pending = paintDotJs.effects.configure(generic.id, {source: rgba, width: 1, height: 1});
            document.querySelector(".effect-config-dialog .app-dialog-close").click();
            assert.equal(await pending, null);
        }
        let controlValues = {text: "before"};
        let control = EffectConfigDialog.createGenericControl({type: "text", key: "text", label: "Text"}, controlValues, () => {});
        control.setValue("reset");
        assert.equal(control.element.querySelector("input").value, "reset");
        PluginManager.effectDefinitions.delete(generic.id);

        let customAction = {...definition, id: "contract.custom-action", workerPlugin: undefined,
            configure: async options => {
                options.preview({});
                options.showOriginal();
                assert.equal(options.selectionBounds.width, options.selection === null ? 2 : 1);
                return {};
            }};
        assert.ok(await new BitmapEffectAction(customAction).performAction(workspace) instanceof BitmapHistoryMemento);
        workspace.getSelection().setContinuation(new Rectangle(0, 0, 1, 1), CombineMode.REPLACE);
        workspace.getSelection().commitContinuation();
        customAction.dialogTitle = "";
        customAction.displayName = "";
        assert.ok(await new BitmapEffectAction(customAction).performAction(workspace) instanceof BitmapHistoryMemento);
        assert.equal(await new BitmapEffectAction({...customAction, configure: () => null}).performAction(workspace), null);
        await assert.rejects(new BitmapEffectAction({...customAction, configure: () => {
            throw new Error("configuration failed");
        }}).performAction(workspace), /configuration failed/);

        let dialog = paintDotJs.dialogs.create({title: "Custom", icon: "assets/icon.png", className: "fixture", contentClassName: "content"});
        assert.equal(dialog.dialog.getAttribute("role"), "dialog");
        assert.equal(dialog.dialog.querySelector("strong").textContent, "Custom");
        dialog.destroy();
        dialog.destroy();
        let plain = paintDotJs.dialogs.create({title: "Plain"});
        plain.destroy();

        // Dynamic effect and adjustment menus include installed capabilities.
        let entries = EffectsMenu.createEffectEntries();
        assert.ok(entries.some(entry => entry instanceof PluginEffectDropEntry));
        assert.ok(entries.some(entry => entry.getText?.() === "Special"));
        assert.equal(BitmapEffectAction.getIconSource({icon: "data:image/png;base64,AAAA"}), "data:image/png;base64,AAAA");
        let adjustments = AdjustmentsMenu.createEntries();
        assert.ok(adjustments.some(entry => entry instanceof PluginEffectDropEntry));
        assert.ok(adjustments.some(entry => entry.getText?.() === "Special"));
        let entry = entries.find(entry => entry instanceof PluginEffectDropEntry);
        assert.ok(entry.buildElement().title.includes("Contract plugin") || entry.getPluginTooltip().includes("Plugin:"));
        assert.equal(entry.getText(), "Red");
        assert.equal(entry.getShortcut(), null);
        assert.ok(entry.getIconSrc().endsWith(".png"));
        let controlled = new PluginEffectDropEntry(entry.action, {...definition, controls: [{}]},
            {...metadata, copyright: "Copyright", sourceFileName: "fixture.paintjs"});
        assert.equal(controlled.getText(), "Red...");
        assert.ok(controlled.getPluginTooltip().includes("Location: fixture.paintjs"));
        let minimal = new PluginEffectDropEntry(entry.action, definition, {version: "1"});
        assert.equal(minimal.getPluginTooltip(), "Plugin: Red v1");
        assert.equal(EffectsMenu.normalizeCategory(null).key, "plugins");
        assert.equal(EffectsMenu.normalizeCategory(" !!! ").key, "plugins");
        assert.throws(() => EffectsMenu.createPluginEntries([{plugin: metadata, definition: {actionId: "missing"}}]), /Missing/);
        assert.throws(() => AdjustmentsMenu.createPluginEntry({plugin: metadata, definition: {actionId: "missing"}}), /Missing/);

        let type = PluginFileTypes.forFile({name: "image.contract"});
        let decoded = await PluginFileTypes.decode(new window.File(["x"], "image.contract"));
        assert.equal(PluginFileTypes.toWorkspaceData(decoded).layers[0].canvas.width, 1);
        assert.equal(PluginFileTypes.snapshot(workspace, true).layers.length, 1);
        assert.equal(PluginFileTypes.snapshot(workspace, false).activeLayer, 0);
        let maximum = PluginFileTypes.maximumPixels;
        PluginFileTypes.maximumPixels = 1;
        assert.throws(() => PluginFileTypes.snapshot(workspace, true), /pixel limit/);
        PluginFileTypes.maximumPixels = maximum;
        assert.equal((await PluginFileTypes.encode(type.id, decoded)).size, 1);
        let action = new BitmapEffectAction(definition);
        let memento = await action.performAction(workspace, {});
        assert.ok(memento instanceof BitmapHistoryMemento);
        BitmapEffectAction.lastEffect = {definition, values: {}};
        await PluginManager.setEnabled(record.id, false);
        assert.equal(BitmapEffectAction.lastEffect, null);
        assert.equal(PluginFileTypes.forFile({name: "image.contract"}), null);
        await PluginManager.setEnabled(record.id, true);
    } finally {
        await PluginManager.remove(record.id);
        app.closeDocumentWorkspace(workspace, false);
    }
};
