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

class CanvasControl extends SurfaceBoxRenderer {

    constructor(surfaceBox) {
        super(surfaceBox);

        this.location = null;
        this.size = null;
        this.cursor = null;
    }

    getLocation() {
        return this.location;
    }

    setLocation(location) {
        if (this.location !== location) {
            this.location = location;

            this.invalidate();
        }
    }

    setAngle(angle) {
        if (this.angle !== angle) {
            this.angle = angle;
            this.invalidate();
        }
    }

}
