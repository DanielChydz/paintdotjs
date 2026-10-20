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

class ColorProfileManager {
    static FORMATS = ["png", "jpeg", "jpg", "jpe", "webp", "tiff", "tif", "avif", "jxl"];
    static KEY = "paint.js.export-icc";
    static SOURCE_KEY = "paint.js.source-icc";

    static get(documentModel, key = this.KEY) {
        let entry = documentModel.metadata.find(item => item.key === key);
        if (entry === undefined) {
            return null;
        }
        let saved = JSON.parse(entry.value);
        return {...saved, data: Uint8Array.from(atob(saved.data), char => char.charCodeAt(0))};
    }

    static store(documentModel, profile, source = false) {
        let entry = null;
        if (profile !== null) {
            let binary = "";
            for (let byte of profile.data) {
                binary += String.fromCharCode(byte);
            }
            entry = JSON.stringify({...profile, data: btoa(binary)});
        }
        let keys = source ? [this.SOURCE_KEY, this.KEY] : [this.KEY];
        documentModel.metadata = documentModel.metadata.filter(item => !keys.includes(item.key));
        if (entry !== null) {
            if (source) {
                documentModel.metadata.push({key: this.SOURCE_KEY, value: entry});
            }
            if (profile.rgb) {
                documentModel.metadata.push({key: this.KEY, value: entry});
            }
        }
    }

    static set(workspace, profile) {
        let memento = new DocumentMetadataHistoryMemento(workspace);
        this.store(workspace.getDocument(), profile);
        workspace.getHistory().pushNewMemento(memento);
        workspace.setDirty(true);
    }
}
