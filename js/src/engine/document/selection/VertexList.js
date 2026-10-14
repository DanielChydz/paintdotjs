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

class VertexList {

    constructor(vertices = [], hole = false) {
        this.vertices = [];
        this.hole = hole;

        if (vertices.length > 0) {
            this.push(...vertices);
        }
    }

    addRectangle(x, y, width, height) {
        this.push(
            new Point(x, y), // Top-left
            new Point(x + width, y), // Top-right
            new Point(x + width, y + height), // Bottom-right
            new Point(x, y + height), // Bottom-left
            new Point(x, y), // Close the rectangle (return to start)
        )
    }

    getBounds() {
        if (this.vertices.length === 0) {
            return null;
        }

        let minX = this.vertices[0].x;
        let minY = this.vertices[0].y;
        let maxX = this.vertices[0].x;
        let maxY = this.vertices[0].y;

        for (let point of this.vertices) {
            if (point.x < minX) {
                minX = point.x;
            }
            if (point.y < minY) {
                minY = point.y;
            }
            if (point.x > maxX) {
                maxX = point.x;
            }
            if (point.y > maxY) {
                maxY = point.y;
            }
        }

        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    addEllipse(x, y, width, height, tolerance = 0.01) {
        for (let point of VertexList.flattenEllipse(new Rectangle(x, y, width, height), tolerance)) {
            this.push(point);
        }
    }

    static flattenEllipse(bounds, tolerance = 0.01) {
        if (!(bounds instanceof Rectangle)) {
            throw new Error("Input must be an instance of Rectangle");
        }
        if (!Number.isFinite(tolerance) || tolerance <= 0) {
            throw new Error("Ellipse tolerance must be a positive finite number");
        }
        if (![bounds.x, bounds.y, bounds.width, bounds.height, bounds.getRight(), bounds.getBottom()]
            .every(Number.isFinite)) {
            throw new Error("Ellipse bounds must be finite");
        }
        if (bounds.getWidth() <= 0 || bounds.getHeight() <= 0) {
            return [];
        }

        let radiusX = bounds.getWidth() / 2;
        let radiusY = bounds.getHeight() / 2;
        let centerX = bounds.getLeft() + radiusX;
        let centerY = bounds.getTop() + radiusY;
        let maxRadius = Math.max(radiusX, radiusY);
        let angle = 2 * Math.asin(Math.sqrt(Math.min(1, tolerance / maxRadius / 2)));
        let requiredSegments = Math.ceil(Math.PI / angle);
        let segments = Math.max(16, Math.ceil(requiredSegments / 4) * 4);
        if (!Number.isSafeInteger(segments) || segments >= 0xffffffff) {
            throw new Error("Ellipse tolerance requires an unrepresentable vertex count");
        }

        // Preserve cardinal extrema and the selection tool's 0.01px chord tolerance.
        let points = new Array(segments + 1);
        for (let i = 0; i <= segments; ++i) {
            let angle = i * Math.PI * 2 / segments;
            points[i] = new Point(
                centerX + radiusX * Math.cos(angle),
                centerY + radiusY * Math.sin(angle)
            );
        }
        return points;
    }

    push(...points) {
        for (let point of points) {
            if (!(point instanceof Point)) {
                throw new Error("Input must be an array of Point objects");
            }
        }
        this.vertices.push(...points);
    }

    close() {
        if (this.vertices.length > 1) {
            const firstPoint = this.vertices[0];
            const lastPoint = this.vertices[this.vertices.length - 1];

            if (!firstPoint.equals(lastPoint)) {
                this.vertices.push(firstPoint);
            }
        }
    }

    isHole() {
        return this.hole;
    }

    clone() {
        return new VertexList(this.vertices.map(point => point.clone()), this.hole);
    }

    getVertices() {
        return this.vertices;
    }

}