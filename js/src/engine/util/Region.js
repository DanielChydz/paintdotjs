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

class Region {

    constructor(rectangles) {
        if (!Array.isArray(rectangles)) {
            throw new Error("Rectangles must be an array");
        }
        this.rectangles = rectangles;
    }

    intersectRegion(region) {
        if (!(region instanceof Region)) {
            throw new Error("Input must be an instance of Region");
        }

        let newRectangles = [];

        for (let rect of this.rectangles) {
            for (let otherRect of region.getRectangles()) {
                // Clone the rectangle to avoid modifying the original
                let clone = rect.clone();
                clone.intersect(otherRect);

                // Only keep non-empty intersections
                if (clone.width > 0 && clone.height > 0) {
                    newRectangles.push(clone);
                }
            }
        }

        // Update the region with only the intersecting parts
        this.rectangles = newRectangles;
    }

    intersectRectangle(rectangle) {
        if (!(rectangle instanceof Rectangle)) {
            throw new Error("Input must be an instance of Rectangle");
        }

        let newRectangles = [];

        for (let rect of this.rectangles) {
            // Clone the rectangle to avoid modifying the original
            let clone = rect.clone();
            clone.intersect(rectangle);

            // Only keep non-empty intersections
            if (clone.width > 0 && clone.height > 0) {
                newRectangles.push(clone);
            }
        }

        // Update the region with only the intersecting parts
        this.rectangles = newRectangles;
    }

    getRectangles() {
        return this.rectangles;
    }

    getBounds() {
        let rects = this.getRectangles();
        let bounds = null;
        for (let rect of rects) {
            if (!rect.isEmpty()) {
                bounds = bounds === null ? rect.clone() : Rectangle.union(bounds, rect);
            }
        }
        return bounds === null ? new Rectangle() : bounds;
    }

    getRegionScansInt() {
        let scans = [];
        for (let rect of this.rectangles) {
            let edges = [rect.x, rect.y, rect.getRight(), rect.getBottom()];
            if (!edges.every(Number.isFinite)) {
                throw new RangeError("Region coordinates must be finite");
            }
            if (rect.isEmpty()) {
                continue;
            }
            let left = Math.floor(rect.x);
            let top = Math.floor(rect.y);
            let right = Math.ceil(rect.getRight());
            let bottom = Math.ceil(rect.getBottom());
            if (![left, top, right, bottom, right - left, bottom - top].every(Number.isSafeInteger)) {
                throw new RangeError("Region coordinates exceed the safe integer range");
            }
            // Half-open rectangles cover every pixel they intersect.
            scans.push(new Rectangle(left, top, right - left, bottom - top));
        }
        return scans;
    }

    getBoundsInt() {
        let bounds = Region.fromRectangles(this.getRegionScansInt()).getBounds();
        if (![bounds.width, bounds.height].every(Number.isSafeInteger)) {
            throw new RangeError("Region bounds exceed the safe integer range");
        }
        return bounds;
    }

    clone() {
        let rectangles = [];
        for (let rectangle of this.rectangles) {
            rectangles.push(rectangle.clone());
        }
        return Region.fromRectangles(rectangles);
    }

    size() {
        return this.rectangles.length;
    }

    dispose() {
        for (let rectangle of this.rectangles) {
            rectangle.dispose();
        }
        this.rectangles = [];
    }

    static fromPath(path) {
        if (!(path instanceof GraphicsPath)) {
            throw new Error("Input must be a GraphicsPath");
        }

        return Region.fromRectangles([...path.getScans()]);
    }

    static fromRectangle(rectangle) {
        return Region.fromRectangles([rectangle]);
    }

    static fromRectangles(rectangles) {
        return new Region(rectangles);
    }

}