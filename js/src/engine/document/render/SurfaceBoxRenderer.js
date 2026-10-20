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

class SurfaceBoxRenderer {

    constructor(surfaceBox) {
        this.surfaceBox = surfaceBox;
        this.visible = true;
        this.disposed = false;
    }

    render(destination, renderBounds) {

    }

    isVisible() {
        return this.visible && !this.disposed;
    }

    setVisible(visible) {
        if (this.disposed) {
            throw new Error("SurfaceBoxRenderer is disposed");
        }
        if (this.visible !== visible) {
            this.visible = visible;
            this.invalidate();
        }
    }

    invalidate() {
        if (!this.disposed) {
            this.surfaceBox.invalidate();
        }
    }

    dispose() {
        if (!this.disposed) {
            this.disposed = true;
            this.surfaceBox.removeRenderer(this);
            this.surfaceBox = null;
        }
    }

}
