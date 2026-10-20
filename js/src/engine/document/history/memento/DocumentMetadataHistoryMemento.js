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

class DocumentMetadataHistoryMemento extends HistoryMemento {
    constructor(workspace) {
        super("Color Profile", "assets/icons/menu_image_color_profile_icon.png");
        this.workspace = workspace;
        this.metadata = workspace.getDocument().metadata.map(entry => ({...entry}));
    }

    onUndo() {
        let redo = new DocumentMetadataHistoryMemento(this.workspace);
        this.workspace.getDocument().metadata = this.metadata.map(entry => ({...entry}));
        return redo;
    }
}
