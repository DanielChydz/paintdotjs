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

module.exports = async function checkOpenAssets() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let catalog = await (await fetch("desktop-resources/asset-manifest.json")).json();
    check(catalog.assetSet === "paintjs-open-v1", "Unexpected asset provenance");
    let images = Object.keys(catalog.files).filter(name => /\.(png|ico)$/.test(name));
    await Promise.all(images.map(async relative => {
        let image = new Image();
        image.src = "assets/" + relative;
        await image.decode();
        check(image.naturalWidth > 0 && image.naturalHeight > 0, "Empty or broken asset: " + relative);
    }));
    let faces = await document.fonts.load('14px "Inter"');
    check(faces.length > 0 && faces.every(face => face.status === "loaded"), "Bundled Inter did not load");
    let license = await (await fetch("assets/licenses/Inter-OFL.txt")).text();
    check(license.includes("SIL OPEN FONT LICENSE"), "Bundled font license is missing");
    license = await (await fetch("assets/licenses/Lucide-LICENSE.txt")).text();
    check(license.includes("ISC License"), "Bundled icon license is missing");
    let missingLabels = [];
    for (let action of ActionRegistry.getActionList()) {
        let label = action.getDisplayName();
        if (typeof label !== "string" || label.length === 0 || /\.(?:name|text)$/.test(label)) {
            missingLabels.push(action.getActionId() + " -> " + label);
        }
    }
    let missingDescriptions = [];
    for (let action of ActionRegistry.getActionList()) {
        let key = action.getDescriptionTranslationId();
        if (key !== null && key !== undefined && i18n(key) === key) {
            missingDescriptions.push([key, action.getDisplayName()]);
        }
    }
    check(missingDescriptions.length === 0, "Missing descriptions: " + JSON.stringify(missingDescriptions));
    check(missingLabels.length === 0, "Untranslated actions: " + missingLabels.join(", "));
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(800, 600);
    workspace.setFileInfo("Color study.png", null, null, "png");
    let context = workspace.getActiveLayer().getSurface().context;
    let gradient = context.createLinearGradient(0, 0, 800, 600);
    gradient.addColorStop(0, "#182d55");
    gradient.addColorStop(1, "#346f89");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 800, 600);
    let colors = ["#ffcb75", "#bba0ef", "#47d4c0"];
    for (let index = 0; index < colors.length; ++index) {
        context.fillStyle = colors[index];
        context.beginPath();
        context.moveTo(100 + index * 150, 500);
        context.bezierCurveTo(100 + index * 130, 70, 400 + index * 100, 30, 650 + index * 30, 500);
        context.closePath();
        context.fill();
    }
    workspace.getActiveLayer().invalidate();
    workspace.updateComposition();
    workspace.setZoomToWindow(true);
    app.setActiveToolFromType(ToolType.PAINT_BRUSH);
    workspace.setDirty(false);
    AboutDialog.open();
    let banner = document.querySelector(".project-info-banner-artwork img");
    check(banner !== null && banner.getAttribute("src") === "assets/icon.png", "About dialog does not use the project mark");
    await banner.decode();
    AboutDialog.instance.close();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    check(performance.getEntriesByType("resource").every(entry => !/paintdotnet\/release|paint\.net\..*\.zip/.test(entry.name)),
        "Application requested proprietary release resources");
};
