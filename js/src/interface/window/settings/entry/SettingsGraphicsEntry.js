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

class SettingsGraphicsEntry extends SettingsEntry {

    render() {
        this.addHeading("Graphics");
        let desktop = typeof isApp !== "undefined" && isApp;
        let input = this.addCheckbox("graphics.hardwareAcceleration", "Use hardware acceleration for the user interface", {
            disabled: !desktop,
            note: desktop
                ? "Changes take effect after restarting paint.js. Save your work before closing."
                : "Hardware acceleration is controlled by the browser and cannot be changed here."
        });
        if (desktop) {
            let diagnostic = this.addNote("Reading the current graphics status...");
            input.disabled = true;
            input.onchange = () => {
                void this.updateDesktopGraphics(input, diagnostic, input.checked);
            };
            void this.updateDesktopGraphics(input, diagnostic);
        } else {
            this.addNote("WebGL is " + (this.isWebGlAvailable() ? "available." : "not available.")
                + " This does not identify a physical GPU.");
        }
        this.addSelect("graphics.renderingDevice", "Rendering device:", [["auto", "Automatic (browser default)"]], {
            disabled: true,
            note: "Selecting a physical rendering device is not supported."
        });
    }

    async updateDesktopGraphics(input, diagnostic, enabled = null) {
        let previous = AppSettingsStore.get("graphics.hardwareAcceleration", true);
        input.disabled = true;
        try {
            let status = enabled === null
                ? await window.desktopGraphics.getStatus()
                : await window.desktopGraphics.setEnabled(enabled);
            input.checked = status.preference;
            AppSettingsStore.set("graphics.hardwareAcceleration", status.preference);
            let current = status.enabled === null ? "pending GPU initialization"
                : (status.enabled ? "enabled" : "disabled");
            let features = status.features === null ? "" : Object.entries(status.features)
                .map(([feature, value]) => feature + ": " + value).join("; ");
            diagnostic.textContent = "Current process acceleration: " + current + ". "
                + (status.restartRequired ? "Restart required. " : "No restart required. ")
                + features;
        } catch (error) {
            input.checked = previous;
            diagnostic.textContent = "Could not read or save graphics settings: " + error.message;
            console.error("Could not update desktop graphics settings", error);
        } finally {
            input.disabled = false;
        }
    }

    isWebGlAvailable() {
        try {
            const canvas = document.createElement("canvas");
            return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
        } catch (_) {
            return false;
        }
    }
}
