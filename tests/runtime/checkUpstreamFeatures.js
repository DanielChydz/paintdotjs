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

module.exports = async function checkUpstreamFeatures() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let {zipSync} = require("fflate");
    check(AppSettingsStore.getUiFontStack("system-ui") === "system-ui",
        "Generic UI font was incorrectly quoted as a named font");
    let text = value => new TextEncoder().encode(value);
    let pluginId = "sync.regression";
    let shape = null;
    let pack = null;
    try {
        // Install a real package and verify its effect against independent pixels.
        let manifest = {id: pluginId, name: "Sync regression", version: "1.0.0", apiVersion: 1,
            author: "paint.js tests", website: "https://example.com/", license: "MIT",
            category: "Effects", description: "Local integration fixture"};
        let source = 'paintDotJs.registerPlugin({effects:[{id:"invert-red",name:"Invert red",'
            + 'renderPixel({r,g,b,a}){return [255-r,g,b,a];}}]});';
        let bytes = zipSync({"plugin.json": text(JSON.stringify(manifest)), "plugin.js": text(source)});
        let record = await PluginManager.importFile(new window.File([bytes], "regression.paintjs"));
        check(record.id === pluginId, "Plugin package identity changed");
        let definition = PluginManager.getEffectDefinitions().find(effect => effect.pluginId === pluginId);
        check(definition !== undefined, "Imported effect was not registered");
        let input = new Uint8ClampedArray([12, 34, 56, 255]);
        let result = PluginManager.applyPublicEffect(definition.id, input, 1, 1);
        check([...result].join() === "243,34,56,255" && input[0] === 12,
            "Plugin effect changed its input or produced incorrect pixels");
        await PluginManager.setEnabled(pluginId, false);
        check(!PluginManager.getEffectDefinitions().some(effect => effect.pluginId === pluginId),
            "Disabled plugin retained its effect");
        await PluginManager.setEnabled(pluginId, true);
        check(PluginManager.getEffectDefinitions().some(effect => effect.pluginId === pluginId),
            "Re-enabled plugin lost its effect");

        // Import independent XAML geometry and build a native Canvas path.
        let xaml = '<ps:SimpleGeometryShape xmlns="clr-namespace:PaintDotNet.UI.Media;assembly=PaintDotNet.Framework" '
            + 'xmlns:ps="clr-namespace:PaintDotNet.Shapes;assembly=PaintDotNet.Framework" '
            + 'DisplayName="Sync triangle" Geometry="M 0,0 L 10,10 L 0,10 Z" />';
        shape = await ShapeManager.importFile(new window.File([xaml], "regression.xaml"));
        check(shape.loaded && ShapeCatalog.has(shape.shapeId), "Imported shape was not registered");
        check(ShapeCatalog.createPath(shape.shapeId, new Rectangle(0, 0, 20, 20)) instanceof Path2D,
            "Custom shape did not build a native path");

        // A local ZIP pack overrides one icon and restores the bundled fallback.
        let icon = new Uint8Array(await (await fetch("assets/icons/menu_file_open_icon.png")).arrayBuffer());
        let packManifest = {formatVersion: 1, id: "sync.regression-assets", name: "Sync icons", version: "1.0.0",
            author: "paint.js tests", description: "Local integration fixture"};
        let packBytes = zipSync({"asset-pack.json": text(JSON.stringify(packManifest)),
            "icons/menu_file_open_icon.png": icon});
        pack = await AssetPackManager.importFile(new window.File([packBytes], "regression.zip"));
        await AssetPackManager.activate(pack.id);
        let image = new Image();
        image.src = AssetPackManager.resolve("assets/icons/menu_file_open_icon.png");
        await image.decode();
        check(image.src.startsWith("blob:"), "Selected pack did not override its icon");
        await AssetPackManager.activate("default");
        check(AssetPackManager.resolve("assets/icons/menu_file_open_icon.png") === "assets/icons/menu_file_open_icon.png",
            "Default pack did not restore the bundled icon");
    } finally {
        await PluginManager.remove(pluginId);
        if (shape !== null) {
            await ShapeManager.remove(shape.id);
        }
        if (pack !== null) {
            await AssetPackManager.remove(pack.id);
        }
    }
};
