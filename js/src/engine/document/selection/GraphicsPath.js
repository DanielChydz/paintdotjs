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

class GraphicsPath {

    // Initialize the path with an empty array to hold path data
    constructor(vertexLists = []) {
        this.vertexLists = vertexLists;
        this.pixelStencil = null;
    }

    isEmpty() {
        return this.vertexLists.length === 0;
    }

    getVertexLists() {
        return this.vertexLists;
    }

    // Apply a transformation matrix to the paths
    transform(matrix) {
        if (!(matrix instanceof Matrix)) {
            throw new Error("Input must be an instance of Matrix");
        }

        for (let vertexList of this.vertexLists) {
            vertexList.vertices = vertexList.vertices.map(point => {
                const transformedX = matrix.elements[0][0] * point.x + matrix.elements[0][1] * point.y + matrix.elements[0][2];
                const transformedY = matrix.elements[1][0] * point.x + matrix.elements[1][1] * point.y + matrix.elements[1][2];
                return new Point(transformedX, transformedY);
            });
        }
        this.pixelStencil = null;
    }

    // Add a rectangle to the path
    addRectangle(rectangle) {
        if (!(rectangle instanceof Rectangle)) {
            throw new Error("Input must be an instance of Rectangle");
        }

        const {x, y, width, height} = rectangle;

        let vertexList = new VertexList();
        vertexList.addRectangle(x, y, width, height);
        this.vertexLists.push(vertexList);
        this.pixelStencil = null;
    }

    addEllipse(rectangle) {
        if (!(rectangle instanceof Rectangle)) {
            throw new Error("Input must be an instance of Rectangle");
        }

        const {x, y, width, height} = rectangle;

        let vertexList = new VertexList();
        vertexList.addEllipse(x, y, width, height);
        if (vertexList.getVertices().length === 0) {
            return;
        }
        this.vertexLists.push(vertexList);
        this.pixelStencil = null;
    }

    flatten(matrix, flatness) {
        if (!(matrix instanceof Matrix)) {
            throw new Error("Input must be an instance of Matrix");
        }
        if (!Number.isFinite(flatness) || flatness <= 0) {
            throw new Error("Path flatness must be a positive finite number");
        }

        // Figures are already polylines; retain every vertex and apply the matrix.
        this.transform(matrix);
    }

    addLines(points) {
        if (!Array.isArray(points) || points.length === 0) {
            throw new Error("Input must be a non-empty array of points");
        }

        if (points.some(point => !(point instanceof Point))) {
            throw new Error("Input must be an array of Point objects");
        }

        // AddLines starts a new figure. This matters for stencil outlines:
        // disconnected islands must not be joined by an artificial edge.
        let vertices = new VertexList();
        vertices.push(...points);
        this.vertexLists.push(vertices);
        this.pixelStencil = null;
    }

    getPathPoints() {
        let points = [];
        for (let vertexList of this.vertexLists) {
            points.push(...vertexList.vertices);
        }
        return points;
    }

    // Reset the path to be empty
    reset() {
        this.vertexLists = [];
        this.pixelStencil = null;
    }

    // Close all open figures in the path
    closeAllFigures() {
        for (let vertexList of this.vertexLists) {
            vertexList.close();
        }
    }

    closeFigure() {
        if (this.vertexLists.length === 0) {
            throw new Error("No figure to close");
        }

        let currentFigure = this.vertexLists[this.vertexLists.length - 1];
        currentFigure.close();
    }

    // Dispose of the path (clean up resources)
    dispose() {
        this.vertexLists = null;
        this.pixelStencil = null;
    }

    // Create a clone of the current path
    clone() {
        const clonedPath = new GraphicsPath();
        clonedPath.vertexLists = this.vertexLists.map(point => point.clone());
        if (this.pixelStencil !== null) {
            clonedPath.pixelStencil = {
                width: this.pixelStencil.width,
                height: this.pixelStencil.height,
                data: new Uint8Array(this.pixelStencil.data)
            };
        }
        return clonedPath;
    }

    setPixelStencil(stencil) {
        this.pixelStencil = {
            width: stencil.width,
            height: stencil.height,
            data: new Uint8Array(stencil.bitArray)
        };
    }

    getPixelStencil(width, height) {
        if (this.pixelStencil === null
            || this.pixelStencil.width !== width
            || this.pixelStencil.height !== height) {
            return null;
        }
        const stencil = new BitVector2D(width, height);
        stencil.bitArray.set(this.pixelStencil.data);
        return stencil;
    }

    // Get the bounding rectangle of the path
    getBounds() {
        if (this.isEmpty()) {
            return new Rectangle(0, 0, 0, 0); // Empty path
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let vertexList of this.vertexLists) {
            for (let point of vertexList.vertices) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            }
        }

        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    static combine(subjectPath, combineMode, clipPath) {
        switch (combineMode) {
            case CombineMode.COMPLEMENT:
                return GraphicsPath.combine(clipPath, CombineMode.EXCLUDE, subjectPath);

            case CombineMode.REPLACE:
                return clipPath.clone();

            case CombineMode.XOR:
            case CombineMode.INTERSECT:
            case CombineMode.UNION:
            case CombineMode.EXCLUDE:
                if (subjectPath.isEmpty() && clipPath.isEmpty()) {
                    return new GraphicsPath(); // Empty path
                } else if (subjectPath.isEmpty()) {
                    return combineMode === CombineMode.XOR || combineMode === CombineMode.UNION
                        ? clipPath.clone() : new GraphicsPath();
                } else if (clipPath.isEmpty()) {
                    return combineMode === CombineMode.INTERSECT
                        ? new GraphicsPath() : subjectPath.clone();
                } else {
                    return GraphicsPath.clipPath(subjectPath, combineMode, clipPath);
                }

            default:
                throw new Error("Invalid enum argument");
        }
    }

    static clipPath(subjectPath, combineMode, clipPath) {
        const basePoly = Polygon.fromGraphicsPath(subjectPath);
        const clipClone = clipPath.clone();
        clipClone.closeAllFigures();
        const clipPoly = Polygon.fromGraphicsPath(clipClone);
        clipClone.dispose();

        const clippedPoly = Polygon.clip(combineMode, basePoly, clipPoly);

        const returnPath = clippedPoly.toGraphicsPath();
        returnPath.closeAllFigures();
        return returnPath;
    }

    *getScans() {
        let edges = [];
        for (let list of this.getVertexLists()) {
            let points = list.vertices;
            for (let i = 0; i < points.length; i++) {
                let top = points[i];
                let bottom = points[(i + 1) % points.length];
                if (![top.x, top.y].every(Number.isFinite)
                    || ![top.x, top.y].every(value => Math.abs(value) <= Number.MAX_SAFE_INTEGER - 1)) {
                    throw new RangeError("Path coordinates must be finite and within the safe integer range");
                }
                if (top.y > bottom.y) {
                    [top, bottom] = [bottom, top];
                }
                let start = Math.ceil(top.y - 0.5);
                let end = Math.ceil(bottom.y - 0.5);
                if (start < end) {
                    let dxdy = (bottom.x - top.x) / (bottom.y - top.y);
                    let x = top.x + (start + 0.5 - top.y) * dxdy;
                    edges.push({start, end, x, dxdy});
                }
            }
        }
        edges.sort((a, b) => a.start - b.start);

        // Match selection statistics: sample y + 0.5, pair even/odd edges
        // across all contours (including holes), and suppress overlapping spans.
        let active = [];
        let next = 0;
        let y = edges.length === 0 ? 0 : edges[0].start;
        while (next < edges.length || active.length > 0) {
            active = active.filter(edge => edge.end > y);
            if (active.length === 0 && next < edges.length) {
                y = Math.max(y, edges[next].start);
            }
            while (next < edges.length && edges[next].start <= y) {
                active.push(edges[next++]);
            }
            active.sort((a, b) => a.x - b.x);
            let maxLeft = -Infinity;
            for (let i = 0; i + 1 < active.length; i += 2) {
                let left = Math.max(maxLeft, Math.ceil(active[i].x - 0.5));
                let right = 1 + Math.floor(active[i + 1].x - 0.5);
                if (right <= left) {
                    continue;
                }
                maxLeft = Math.max(maxLeft, right);
                yield new Rectangle(left || 0, y || 0, right - left, 1);
            }
            for (let edge of active) {
                edge.x += edge.dxdy;
            }
            y++;
        }
    }

    static fromRegion(region) {
        if (!(region instanceof Region)) {
            throw new Error("Input must be an instance of Region");
        }

        const scans = region.getRegionScansInt();

        if (scans.length === 0) {
            return new GraphicsPath();
        }
        if (scans.length === 1) {
            const path = new GraphicsPath();
            path.addRectangle(scans[0]);
            return path;
        } else {
            const bounds = Region.fromRectangles(scans).getBounds();
            if (!Number.isSafeInteger(bounds.width * bounds.height)) {
                throw new RangeError("Region stencil exceeds the safe integer range");
            }
            const stencil = new BitVector2D(bounds.width, bounds.height);

            for (const rect of scans) {
                const adjustedRect = new Rectangle(
                    rect.x - bounds.x,
                    rect.y - bounds.y,
                    rect.width,
                    rect.height
                );
                stencil.setUnchecked(adjustedRect, true);
            }

            const path = GraphicsPath.pathFromStencil(stencil, new Rectangle(
                0,
                0,
                stencil.width,
                stencil.height
            ));

            let matrix = new Matrix();
            matrix.reset();
            matrix.translate(bounds.x, bounds.y);
            path.transform(matrix);

            return path;
        }
    }

    static pathFromStencil(stencil, bounds) {
        if (!(stencil instanceof BitVector2D)) {
            throw new Error("Input must be an instance of BitVector2D");
        }

        if (!stencil.bitArray.some(value => value !== 0)) {
            return new GraphicsPath();
        }

        const ret = new GraphicsPath();
        const pixelStencil = bounds.x === 0 && bounds.y === 0
            && bounds.width === stencil.width && bounds.height === stencil.height
            ? {width: stencil.width, height: stencil.height, data: new Uint8Array(stencil.bitArray)}
            : null;
        const boundsLeft = bounds.getLeft();
        const boundsTop = bounds.getTop();
        const boundsRight = bounds.getRight();
        const boundsBottom = bounds.getBottom();
        const inBounds = point => point.x >= boundsLeft && point.x < boundsRight &&
            point.y >= boundsTop && point.y < boundsBottom;
        let start = new Point(boundsLeft, boundsTop);
        const pts = [];

        // Find all islands
        while (true) {
            let startFound = false;

            while (true) {
                if (stencil.get(start.x, start.y)) {
                    startFound = true;
                    break;
                }

                start.x++;

                if (start.x >= boundsRight) {
                    start.y++;
                    start.x = boundsLeft;

                    if (start.y >= boundsBottom) {
                        break;
                    }
                }
            }

            if (!startFound) {
                break;
            }

            pts.length = 0; // Clear points
            let last = new Point(start.x, start.y + 1);
            let curr = new Point(start.x, start.y);
            let next;
            let left = new Point(0, 0);
            let right = new Point(0, 0);

            // Trace island outline
            while (true) {
                next = curr.clone();
                // The source algorithm uses integer division. Leaving these as
                // JavaScript floating-point halves makes the tracer walk at
                // half-pixel coordinates and it can never return to its start.
                left.x = Math.trunc(((curr.x - last.x) + (curr.y - last.y) + 2) / 2) + curr.x - 1;
                left.y = Math.trunc(((curr.y - last.y) - (curr.x - last.x) + 2) / 2) + curr.y - 1;

                right.x = Math.trunc(((curr.x - last.x) - (curr.y - last.y) + 2) / 2) + curr.x - 1;
                right.y = Math.trunc(((curr.y - last.y) + (curr.x - last.x) + 2) / 2) + curr.y - 1;

                if (inBounds(left) && stencil.get(left.x, left.y)) {
                    // Go left
                    next.x += curr.y - last.y;
                    next.y -= curr.x - last.x;
                } else if (inBounds(right) && stencil.get(right.x, right.y)) {
                    // Go straight
                    next.x += curr.x - last.x;
                    next.y += curr.y - last.y;
                } else {
                    // Turn right
                    next.x -= curr.y - last.y;
                    next.y += curr.x - last.x;
                }

                if (Math.sign(next.x - curr.x) !== Math.sign(curr.x - last.x) ||
                    Math.sign(next.y - curr.y) !== Math.sign(curr.y - last.y)) {
                    pts.push(curr);
                }

                last = curr;
                curr = next;

                if (next.x === start.x && next.y === start.y) {
                    break;
                }
            }

            const points = pts.slice();
            const scans = Utility.getScans(points);

            for (const scan of scans) {
                stencil.invertScanline(scan);
            }

            ret.addLines(points);
            ret.closeFigure();
        }

        ret.pixelStencil = pixelStencil;
        return ret;
    }
}
