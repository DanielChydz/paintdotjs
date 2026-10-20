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

class HistoryFunctionTransaction {
    constructor(workspace) {
        this.workspace = workspace;
        this.layers = workspace.document.getLayers().list().slice();
        this.activeLayer = workspace.activeLayer;
        this.dirty = workspace.isDirty();
        this.undo = workspace.history.undoStack.slice();
        this.redo = workspace.history.redoStack.slice();
        this.bitmaps = [];
        this.createdLayers = [];
        this.selectionData = null;
        this.selectionDepth = workspace.selection.depth;
    }

    captureBitmap(layerIndex, chunks) {
        this.bitmaps.push({layer: this.workspace.document.getLayers().getAt(layerIndex), chunks});
    }

    captureSelection(data) {
        this.selectionData ??= data;
    }

    rollback() {
        let workspace = this.workspace;
        let layers = workspace.document.getLayers();
        layers.changing.fire(layers);
        layers.layers = this.layers;
        workspace.activeLayer = this.activeLayer;
        workspace.history.undoStack = this.undo;
        workspace.history.redoStack = this.redo;
        for (let snapshot of this.bitmaps.reverse()) {
            for (let chunk of snapshot.chunks) {
                snapshot.layer.getSurface().context.putImageData(chunk.imageData, chunk.bounds.x, chunk.bounds.y);
            }
        }
        if (this.selectionData !== null) {
            workspace.selection.data.dispose();
            workspace.selection.data = this.selectionData;
            workspace.selection.statistics = null;
        }
        workspace.selection.depth = this.selectionDepth;
        for (let layer of this.createdLayers) {
            layer.dispose();
        }
        layers.changed.fire(layers);
        workspace.selection.changed.fire(workspace.selection);
        workspace.setDirty(this.dirty);
        workspace.app.fire("document:layers_changed", workspace);
    }
}
