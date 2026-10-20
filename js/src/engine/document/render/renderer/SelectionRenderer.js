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

class SelectionRenderer extends SurfaceBoxRenderer {

    constructor(surfaceBox, selection) {
        super(surfaceBox);

        this.selection = selection;
        this.onSelectionChanged = this.onSelectionChanged.bind(this);
        this.selection.changed.add(this.onSelectionChanged);
        this.onSettingsChanged = this.onSettingsChanged.bind(this);
        window.addEventListener("paintdotjs:setting-changed", this.onSettingsChanged);

        this.selectedPath = null;
        this.timeInitialized = Date.now();

        this.selectionTinting = true;
        this.selectionOutline = true;
        this.outlineAnimation = true;
        this.renderingQuality = "high";

        this.whiteOpacity = 255;
        this.whiteOpacityReset = null;
    }

    render(destination, renderBounds) {
        let selectedPath = this.selectedPath;
        if (selectedPath === null || selectedPath.isEmpty()) {
            return;
        }

        this.renderSelection(destination, renderBounds, selectedPath);
    }

    renderSelection(destination, renderBounds, selectedPath) {
        let context = destination.getContext();
        context.save();

        // Draw tint fill
        if (this.selectionTinting) {
            this.renderPath(context, renderBounds, selectedPath, {
                color: 'rgba(34, 97, 196, 0.3)',
                fill: true
            });
        }

        // Draw black outline
        if (this.selectionOutline) {
            let animate = this.isOutlineAnimationEnabled();
            if (!animate) {
                this.whiteOpacity = 255;
                this.whiteOpacityReset = null;
            }
            this.renderPath(context, renderBounds, selectedPath, {
                color: "rgba(0, 0, 0, 0.6)",
                lineWidth: 1
            });

            // Draw marching ants (white dashed outline)
            if (this.whiteOpacityReset !== null) {
                this.whiteOpacity = Math.min(255, Math.max(0, (Date.now() - this.whiteOpacityReset) / 200 * 255));
            }
            let antsOffset = -(Date.now() - this.timeInitialized) / 30 % 8;
            this.renderPath(context, renderBounds, selectedPath, {
                color: `rgba(255, 255, 255, ${this.whiteOpacity / 255})`,
                dashPattern: [4, 4],
                antsOffset: animate ? antsOffset : 0,
                lineWidth: 1
            });
        }

        context.restore();
    }

    renderPath(context, renderBounds, selectedPath, options) {
        let surface = this.surfaceBox.getSurface();
        let scaleX = renderBounds.getWidth() / surface.getWidth();
        let scaleY = renderBounds.getHeight() / surface.getHeight();

        context.strokeStyle = options.color || "black";
        context.fillStyle = options.color || "black";
        context.lineWidth = options.lineWidth || 1;
        const aliased = this.renderingQuality === "aliased";
        context.imageSmoothingEnabled = !aliased;
        context.lineJoin = aliased ? "miter" : "round";

        if (options.dashPattern) {
            context.setLineDash(options.dashPattern);
            context.lineDashOffset = options.antsOffset || 0;
        } else {
            context.setLineDash([]);
        }

        for (let vertexList of selectedPath.getVertexLists()) {
            context.beginPath();

            let vertices = vertexList.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                let point = vertices[i];
                let x = point.x * scaleX + renderBounds.getX();
                let y = point.y * scaleY + renderBounds.getY();

                // Selection quality controls the displayed selection edge.
                // Pixel-center snapping gives the aliased mode a stable,
                // one-pixel contour; high quality retains fractional coverage.
                if (aliased && !options.fill) {
                    x = Math.floor(x) + 0.5;
                    y = Math.floor(y) + 0.5;
                }

                if (i === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
            }
            context.closePath();

            if (options.fill) {
                // Paint.NET's GeometryList uses alternate filling. With the
                // even-odd rule, a lasso crossing over itself toggles the
                // overlapped region instead of filling it twice.
                context.fill("evenodd");
            } else {
                context.stroke();
            }
        }
    };

    onSelectionChanged() {
        let path = this.selection.createPath();

        if (this.selectedPath !== null) {
            this.selectedPath.dispose();
        }

        this.selectedPath = path;
        this.invalidate();
    }

    setSelectionTinting(selectionTinting) {
        this.selectionTinting = selectionTinting;
        this.invalidate();
    }

    setSelectionOutline(selectionOutline) {
        this.selectionOutline = selectionOutline;
        this.invalidate();
    }

    setOutlineAnimation(outlineAnimation) {
        this.outlineAnimation = outlineAnimation;
        if (!outlineAnimation) {
            this.whiteOpacity = 255;
            this.whiteOpacityReset = null;
        }
        this.invalidate();
    }

    setRenderingQuality(renderingQuality) {
        this.renderingQuality = renderingQuality === "aliased" ? "aliased" : "high";
        this.invalidate();
    }

    isAnimationActive() {
        return this.isVisible()
            && this.selectionOutline
            && this.isOutlineAnimationEnabled()
            && this.selectedPath !== null
            && !this.selectedPath.isEmpty();
    }

    resetOutlineWhiteOpacity() {
        let animate = this.isOutlineAnimationEnabled();
        this.whiteOpacity = animate ? 0 : 255;
        this.whiteOpacityReset = animate ? Date.now() : null;
        this.invalidate();
    }

    isOutlineAnimationEnabled() {
        return this.outlineAnimation && AppSettingsStore.get("ui.animations", true);
    }

    onSettingsChanged(event) {
        if (event.detail.path === "ui.animations") {
            this.resetOutlineWhiteOpacity();
        }
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.selection.changed.remove(this.onSelectionChanged);
        window.removeEventListener("paintdotjs:setting-changed", this.onSettingsChanged);
        if (this.selectedPath !== null) {
            this.selectedPath.dispose();
            this.selectedPath = null;
        }
        this.selection = null;
        super.dispose();
    }
}
