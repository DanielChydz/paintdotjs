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

module.exports = async function checkGraphicsSettings(expectedStartup = false) {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let waitFor = async predicate => {
        let deadline = performance.now() + 5000;
        while (!await predicate()) {
            check(performance.now() < deadline, "Graphics settings timed out");
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    };
    await waitFor(async () => (await window.desktopGraphics.getStatus()).enabled !== null);
    let initial = await window.desktopGraphics.getStatus();
    check(initial.startupPreference === expectedStartup && initial.preference === expectedStartup
        && (expectedStartup || initial.enabled === false) && initial.restartRequired === false && initial.features !== null,
    "Electron did not apply the persisted acceleration preference before startup");
    SettingsDialog.open("graphics");
    let settings = SettingsDialog.instance;
    let input = settings.page.querySelector("input[type=checkbox]");
    await waitFor(() => !input.disabled);
    check(input.checked === expectedStartup
        && settings.page.textContent.includes("Current process acceleration: " + (initial.enabled ? "enabled." : "disabled.")),
        "Graphics settings did not show the current process status");
    for (let enabled of [!expectedStartup, expectedStartup]) {
        input.checked = enabled;
        input.dispatchEvent(new Event("change", {bubbles: true}));
        await waitFor(() => !input.disabled);
        let status = await window.desktopGraphics.getStatus();
        check(status.preference === enabled && status.enabled === initial.enabled
            && status.restartRequired === (enabled !== expectedStartup) && AppSettingsStore.get("graphics.hardwareAcceleration") === enabled,
        "Graphics settings did not persist the next-launch preference separately from current acceleration");
        check(settings.page.textContent.includes(enabled !== expectedStartup ? "Restart required." : "No restart required."),
            "Graphics settings omitted the restart requirement");
    }
    settings.close();
};
