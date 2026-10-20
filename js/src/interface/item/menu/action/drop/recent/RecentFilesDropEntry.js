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

class RecentFilesDropEntry extends SubmenuDropEntry {
    constructor() {
        super("menu.file.openRecent", []);
    }

    async open() {
        await RecentFilesStore.pending;
        let files = await RecentFilesStore.load();
        // The parent may have closed while storage was loading.
        if (!this.parent.isOpen()) {
            return;
        }
        this.close();
        this.entries = files.map(file => new DropEntry(file.name, () => {
            void DocumentIO.openRecent(file).catch(error => window.app.handleError(error));
        }, true));
        if (this.entries.length === 0) {
            this.entries.push(new DropEntry("No recent files", null, true));
        }
        this.entries.push(new VerticalSeparator());
        this.entries.push(new DropEntry("Clear recent files", () => { void RecentFilesStore.clear().catch(error => window.app.handleError(error)); }, true));
        for (let entry of this.entries) {
            entry.initialize(this);
        }
        super.open();
    }

    setEnabledFromActionExecutable() {
        this.setEnabled(true);
    }
}
