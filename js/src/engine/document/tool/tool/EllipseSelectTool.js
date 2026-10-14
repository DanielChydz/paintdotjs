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

class EllipseSelectTool extends SelectionTool {

    constructor(type) {
        super(type);
    }

    onActivate() {
        super.onActivate();
    }

    trimShapePath(tracePoints) {
        let array = [];

        if (tracePoints.length > 0) {
            array.push(tracePoints[0]);

            if (tracePoints.length > 1) {
                array.push(tracePoints[tracePoints.length - 1]);
            }
        }

        return array;
    }

    createShape(tracePoints) {
        let a = tracePoints[0];
        let b = tracePoints[tracePoints.length - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);

        let bounds;

        if (this.app.isShiftKeyDown()) {
            // Paint.NET uses the two pointer positions as opposite ends of a
            // diameter. Keep the fractional center/radius; rounding here moves
            // the circle away from both the press and release positions.
            const centerX = (a.x + b.x) / 2;
            const centerY = (a.y + b.y) / 2;
            const radius = length / 2;
            bounds = new Rectangle(
                centerX - radius,
                centerY - radius,
                radius * 2,
                radius * 2
            );
        } else {
            // FromPixelPoints includes both integer pixels, so dragging from
            // x=10 to x=20 produces the same 11-pixel bounds as Paint.NET.
            bounds = Utility.pointsToRectangle(a, b);
        }

        return this.flattenEllipse(bounds, 0.01);
    }

    flattenEllipse(bounds, tolerance) {
        return VertexList.flattenEllipse(bounds, tolerance);
    }

    getCursorImgUp() {
        return "ellipse_select_tool_cursor";
    }

    getCursorImgDown() {
        return "ellipse_select_tool_mouse_down_cursor";
    }

    getCursorImgUpPlus() {
        return "ellipse_select_tool_plus_cursor";
    }

    getCursorImgUpMinus() {
        return "ellipse_select_tool_minus_cursor";
    }

}
