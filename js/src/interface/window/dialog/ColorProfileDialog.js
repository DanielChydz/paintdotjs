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

class ColorProfileDialog {
    static activePromise = null;

    static open() {
        if (this.activePromise !== null) {
            return this.activePromise;
        }
        let workspace = app.getActiveDocumentWorkspace();
        if (workspace === null) {
            return Promise.resolve(false);
        }
        this.activePromise = this.show(workspace).finally(() => {
            this.activePromise = null;
        });
        return this.activePromise;
    }

    static async show(workspace) {
        let current = ColorProfileManager.get(workspace.getDocument());
        let source = ColorProfileManager.get(workspace.getDocument(), ColorProfileManager.SOURCE_KEY);
        let selected = null;
        let pending = 0;
        let apply;
        let preview = document.createElement("div");
        {
            // Profile information
            let info = document.createElement("p");
            info.textContent = "Working space: sRGB (8-bit). Source: " + (source?.description || "untagged / sRGB")
                + ". Export: " + (current?.description || "sRGB") + ".";
            preview.appendChild(info);

            // Export profile
            let label = document.createElement("label");
            label.textContent = "Choose an RGB ICC export profile: ";
            preview.appendChild(label);
            {
                let input = document.createElement("input");
                input.type = "file";
                input.accept = ".icc,.icm";
                label.appendChild(input);
                input.onchange = async () => {
                    let request = ++pending;
                    selected = null;
                    apply.disabled = true;
                    let file = input.files[0];
                    if (file === undefined) {
                        status.textContent = "No profile selected.";
                        return;
                    }
                    try {
                        if (file.size > 16 * 1024 * 1024) {
                            throw new Error("ICC profiles must be at most 16 MiB.");
                        }
                        let profile = await window.portableImageCodec.inspectColorProfile(new Uint8Array(await file.arrayBuffer()));
                        if (!profile.rgb) {
                            throw new Error("Choose an RGB export profile. CMYK and gray output are not supported.");
                        }
                        if (request === pending && preview.isConnected) {
                            selected = profile;
                            apply.disabled = false;
                            status.textContent = profile.description;
                        }
                    } catch (error) {
                        if (request === pending && preview.isConnected) {
                            status.textContent = "Could not load profile: " + error.message;
                        }
                    }
                };
            }
            let status = document.createElement("p");
            status.setAttribute("role", "status");
            status.textContent = "Export converts sRGB pixels to the chosen profile and embeds it in PNG, JPEG, WebP, TIFF, AVIF and JPEG XL. Other formats retain sRGB pixels. PDN preserves the profile for later exports.";
            preview.appendChild(status);
        }
        let result = TaskDialog.show({title: "Color Profile", preview, choices: [
            {value: "apply", title: "Use selected export profile"},
            {value: "srgb", title: "Use sRGB for export"},
            {value: "cancel", title: "Cancel"}
        ]});
        apply = preview.closest(".app-dialog").querySelector(".task-dialog-choice");
        apply.disabled = true;
        let choice = await result;
        if (choice === "srgb" || (choice === "apply" && selected !== null)) {
            ColorProfileManager.set(workspace, choice === "srgb" ? null : selected);
            return true;
        }
        return false;
    }
}
