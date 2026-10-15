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

module.exports = async function checkGpu() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let renderer = MaskedSurface.getGpuRenderer();
    check(renderer !== null && !renderer.gl.isContextLost(), "A real WebGL2 renderer is required");
    let source = Surface.create(4, 4);
    let image = new ImageData(4, 4);
    for (let y = 0; y < 4; ++y) {
        for (let x = 0; x < 4; ++x) {
            let index = (y * 4 + x) * 4;
            image.data.set([x * 64, y * 64, (x + y) * 32, 255], index);
        }
    }
    source.context.putImageData(image, 0, 0);
    let path = new GraphicsPath();
    path.addRectangle(new Rectangle(0, 0, 4, 4));
    let masked = new MaskedSurface(source, path, true);
    let cpu = Surface.create(24, 24);
    let gpu = Surface.create(24, 24);
    let mismatches = [];
    for (let geometry of [
        {scaleX: 0.5, scaleY: 0.5, angle: 0},
        {scaleX: 1.5, scaleY: 1.5, angle: 0},
        {scaleX: 3, scaleY: 3, angle: 0},
        {scaleX: 2.5, scaleY: 0.75, angle: 23},
        {scaleX: -1.5, scaleY: 2, angle: 0}
    ]) {
        for (let sampling of [ResamplingAlgorithm.LINEAR, ResamplingAlgorithm.MULTISAMPLE_LINEAR,
            ResamplingAlgorithm.ANISOTROPIC, ResamplingAlgorithm.HIGH_QUALITY_CUBIC]) {
            for (let renderingQuality of ["high", "aliased"]) {
                for (let gamma of [false, true]) {
                    let transform = new Matrix();
                    transform.scale(geometry.scaleX, geometry.scaleY, MatrixOrder.APPEND);
                    transform.rotateAt(geometry.angle, new Point(0, 0), MatrixOrder.APPEND);
                    let originX = geometry.scaleX < 0 ? 14.25 : 4.25;
                    transform.translate(originX, 5.5, MatrixOrder.APPEND);
                    cpu.context.clearRect(0, 0, 24, 24);
                    gpu.context.clearRect(0, 0, 24, 24);
                    masked.renderResampled(cpu, transform, sampling, gamma, renderingQuality);
                    check(masked.renderResampledGpu(gpu, transform, sampling, gamma, renderingQuality),
                        "GPU silently fell back");
                    let expected = cpu.context.getImageData(0, 0, 24, 24).data;
                    let actual = gpu.context.getImageData(0, 0, 24, 24).data;
                    let difference = actual.findIndex((value, index) => Math.abs(value - expected[index]) > 2);
                    if (difference !== -1) {
                        mismatches.push({geometry, sampling, gamma, renderingQuality, difference,
                            gpu: actual[difference], cpu: expected[difference]});
                    }
                    check(actual.every((value, index) => index % 4 !== 3
                        || Math.abs(value - expected[index]) <= 1), "CPU/GPU mask coverage differs");
                    if (renderingQuality === "aliased") {
                        check(actual.every((value, index) => index % 4 !== 3 || value === 0 || value === 255),
                            "Aliased mask contains intermediate alpha");
                    }
                    if (geometry.angle === 0) {
                        let left = Math.min(originX, originX + 4 * geometry.scaleX);
                        let right = Math.max(originX, originX + 4 * geometry.scaleX);
                        for (let y = 0; y < 24; ++y) {
                            for (let x = 0; x < 24; ++x) {
                                let samples = renderingQuality === "aliased" ? 1 : 4;
                                let coverage = 0;
                                for (let sy = 0; sy < samples; ++sy) {
                                    for (let sx = 0; sx < samples; ++sx) {
                                        let px = x + (sx + 0.5) / samples;
                                        let py = y + (sy + 0.5) / samples;
                                        if (px >= left && px <= right
                                            && py >= 5.5 && py <= 5.5 + 4 * geometry.scaleY) {
                                            ++coverage;
                                        }
                                    }
                                }
                                let alpha = Math.round(255 * coverage / (samples * samples));
                                check(Math.abs(actual[(y * 24 + x) * 4 + 3] - alpha) <= 1,
                                    "Mask differs from independent forward-coordinate coverage");
                            }
                        }
                    }
                    transform.dispose();
                }
            }
        }
    }
    let linear = MaskedSurface.getToLinearLut();
    for (let [encoded, expected] of [[0, 0], [32, 3.683180117003599], [128, 55.044427529044305], [255, 255]]) {
        check(Math.abs(linear[encoded] - expected) < 1e-10, "Linear light was quantized to eight bits");
    }
    check(masked.compositeCanvas === null, "Rectangular final rendering allocated an extra mask canvas");
    let fallback = Surface.create(24, 24);
    let movement = new Matrix();
    movement.translate(4.25, 5.5, MatrixOrder.APPEND);
    let cachedRenderer = MaskedSurface.gpuRenderer;
    try {
        MaskedSurface.gpuRenderer = null;
        masked.render(fallback, movement, ResamplingAlgorithm.LINEAR, false, false, "high");
        check(masked.compositeCanvas === null, "Fast preview switched to the full CPU resampler");
        let reference = Surface.create(24, 24);
        reference.context.imageSmoothingEnabled = true;
        reference.context.imageSmoothingQuality = "low";
        reference.context.setTransform(1, 0, 0, 1, 4.25, 5.5);
        reference.context.beginPath();
        reference.context.rect(0, 0, 4, 4);
        reference.context.clip("evenodd");
        reference.context.drawImage(source.canvas, 0, 0);
        let expected = reference.context.getImageData(0, 0, 24, 24).data;
        let actual = fallback.context.getImageData(0, 0, 24, 24).data;
        check(actual.every((value, index) => value === expected[index]), "Fast Canvas preview changed");
        reference.dispose();
    } finally {
        MaskedSurface.gpuRenderer = cachedRenderer;
        fallback.dispose();
        movement.dispose();
    }
    check(masked.gpuTexture !== null, "GPU upload was not cached");
    masked.dispose();
    check(masked.gpuTexture === null && masked.surface === null, "GPU texture/surface was retained");
    let throws = (action, message) => {
        let error = null;
        try {
            action();
        } catch (failure) {
            error = failure;
        }
        check(error instanceof Error && error.message.includes(message), "Wrong rejection: " + message);
    };
    throws(() => new MaskedSurface({}, path), "requires");
    throws(() => new MaskedSurface(source, {}), "requires");
    throws(() => masked.render(cpu, movement, ResamplingAlgorithm.LINEAR), "disposed");
    let offscreenPath = new GraphicsPath();
    offscreenPath.addRectangle(new Rectangle(100, 100, 4, 4));
    let empty = new MaskedSurface(source, offscreenPath);
    check(empty.surface === null && empty.getBounds().isEmpty(), "Offscreen mask allocated pixels");
    empty.render(cpu, new Matrix(), ResamplingAlgorithm.LINEAR);
    empty.eraseFrom(cpu);
    let emptyClone = empty.clone();
    check(emptyClone.surface === null, "Empty clone allocated pixels");
    emptyClone.dispose();
    empty.dispose();
    offscreenPath.dispose();
    for (let points of [
        [new Point(0, 0), new Point(4, 0), new Point(0, 4)],
        [new Point(0, 0), new Point(4, 0), new Point(3, 4), new Point(0, 4)],
        [new Point(0, 0), new Point(4, 0), new Point(4, 4), new Point(4, 4)]
    ]) {
        let irregularPath = new GraphicsPath();
        irregularPath.addLines(points);
        let irregular = new MaskedSurface(source, irregularPath, true);
        check(!irregular.rectangularMask, "An irregular contour passed rectangle detection");
        irregular.dispose();
        irregularPath.dispose();
    }
    let offsetPath = new GraphicsPath();
    offsetPath.addRectangle(new Rectangle(9, 7, 2, 2));
    let offsetMask = new MaskedSurface(source, offsetPath, false, new Point(8, 6));
    let offsetPixel = offsetMask.surface.context.getImageData(0, 0, 1, 1).data;
    check(offsetPixel.every((value, index) => value === [64, 64, 64, 255][index]),
        "A source origin shifted the wrong pixels into the lifted mask");
    for (let [sampling, quality] of [
        [ResamplingAlgorithm.LINEAR, "low"], [ResamplingAlgorithm.MULTISAMPLE_LINEAR, "medium"],
        [ResamplingAlgorithm.ANISOTROPIC, "high"], [ResamplingAlgorithm.HIGH_QUALITY_CUBIC, "high"],
        [ResamplingAlgorithm.NEAREST_NEIGHBOR, "low"]
    ]) {
        check(offsetMask.getCanvasSmoothingQuality(sampling) === quality, "Canvas preview quality mapping differs");
    }
    offsetMask.dispose();
    offsetPath.dispose();

    let trianglePath = new GraphicsPath();
    trianglePath.addLines([new Point(0, 0), new Point(4, 0), new Point(0, 4)]);
    trianglePath.closeFigure();
    trianglePath.addRectangle(new Rectangle(1, 1, 1, 1));
    trianglePath.getVertexLists().push(new VertexList());
    let polygon = new MaskedSurface(source, trianglePath, true);
    check(!polygon.rectangularMask, "A triangle/hole path became a rectangular mask");
    let polygonTransform = new Matrix();
    polygonTransform.scale(3, 3);
    polygonTransform.translate(4.25, 5.5);
    cpu.clear();
    gpu.clear();
    polygon.renderResampled(cpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, "high");
    check(polygon.compositeCanvas !== null, "Nonrectangular final rendering did not apply a path mask");
    let composite = polygon.compositeCanvas;
    let firstPolygon = cpu.context.getImageData(0, 0, 24, 24).data;
    cpu.clear();
    polygon.renderResampled(cpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, "high");
    check(polygon.compositeCanvas === composite, "Repeated path masking replaced its cached canvas");
    check(cpu.context.getImageData(0, 0, 24, 24).data.every((value, index) => value === firstPolygon[index]),
        "Repeated path masking accumulated old pixels");
    check(polygon.renderResampledGpu(gpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, "high"),
        "Nonrectangular GPU rendering fell back");
    check(gpu.context.getImageData(0, 0, 24, 24).data.every((value, index) => Math.abs(value - firstPolygon[index]) <= 3),
        "Nonrectangular CPU/GPU pixels differ");
    gpu.clear();
    polygon.render(gpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, true, "high");
    check(gpu.context.getImageData(0, 0, 24, 24).data.every((value, index) => Math.abs(value - firstPolygon[index]) <= 3),
        "The public GPU render path differs from the CPU oracle");
    try {
        MaskedSurface.gpuRenderer = null;
        cpu.clear();
        polygon.render(cpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, true, "high");
        check(cpu.context.getImageData(0, 0, 24, 24).data.every((value, index) => value === firstPolygon[index]),
            "The public final-frame CPU fallback changed pixels");
    } finally {
        MaskedSurface.gpuRenderer = cachedRenderer;
    }
    let integerMove = new Matrix();
    integerMove.translate(5, 5);
    cpu.clear();
    polygon.render({getSurface: () => cpu}, integerMove, ResamplingAlgorithm.HIGH_QUALITY_CUBIC);
    check(cpu.context.getImageData(6, 6, 1, 1).data[3] === 0, "Integer movement filled the selection hole");
    check(cpu.context.getImageData(5, 5, 1, 1).data[3] === 255, "Integer movement lost an interior pixel");
    let singular = new Matrix();
    singular.scale(0, 1);
    let preserved = cpu.context.getImageData(0, 0, 24, 24).data;
    polygon.render(cpu, singular, ResamplingAlgorithm.LINEAR);
    check(cpu.context.getImageData(0, 0, 24, 24).data.every((value, index) => value === preserved[index]),
        "Singular transform altered its destination");
    let outside = new Matrix();
    outside.translate(100, 100);
    check(polygon.renderResampledGpu(gpu, outside, ResamplingAlgorithm.LINEAR, false, "high"),
        "Offscreen GPU rendering did not finish without allocation");
    polygon.renderResampled(cpu, outside, ResamplingAlgorithm.LINEAR, false, "high");
    let maximumSize = renderer.maximumTextureSize;
    try {
        renderer.maximumTextureSize = 1;
        check(!polygon.renderResampledGpu(gpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, "high"),
            "Oversized GPU rendering did not request CPU fallback");
    } finally {
        renderer.maximumTextureSize = maximumSize;
    }
    let linearSurface = polygon.getLinearSurface();
    let linearCanvas = linearSurface.canvas;
    check(polygon.getLinearSurface() === linearSurface, "Linear surface was not cached");
    let linearPixel = linearSurface.context.getImageData(2, 1, 1, 1).data;
    let linearExpected = [128, 64, 96].map(value => {
        let normalized = value / 255;
        return Math.round((normalized <= 0.04045 ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4)) * 255);
    });
    check(linearExpected.every((value, index) => linearPixel[index] === value) && linearPixel[3] === 255,
        "Linear surface changed alpha or used the wrong transfer function");
    let clone = polygon.clone();
    check(clone.surface !== polygon.surface && clone.linearSurface !== linearSurface
        && clone.path !== polygon.path && clone.gpuTexture === null && clone.compositeCanvas === null,
    "Mask clone retained mutable storage");
    let encodedLut = MaskedSurface.getToSrgbLut();
    check(MaskedSurface.getToSrgbLut() === encodedLut, "Encoded transfer LUT was not cached");
    for (let value = 0; value < 256; ++value) {
        let normalized = value / 255;
        let encoded = normalized <= 0.0031308 ? normalized * 12.92
            : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
        check(encodedLut[value] === Math.round(encoded * 255), "Encoded transfer LUT differs");
    }
    clone.dispose();
    polygon.dispose();
    check(linearSurface.canvas === null && linearCanvas.width === 0 && linearCanvas.height === 0,
        "Disposal retained the linear canvas backing store");
    let baked = new MaskedSurface(source, trianglePath);
    let erased = source.clone();
    baked.eraseFrom({getSurface: () => erased});
    check(erased.context.getImageData(0, 0, 1, 1).data[3] === 0, "Path erasure left an interior ghost");
    check(erased.context.getImageData(3, 3, 1, 1).data[3] === 255, "Path erasure damaged unselected pixels");
    cpu.clear();
    baked.renderResampled(cpu, polygonTransform, ResamplingAlgorithm.LINEAR, false, "high");
    check(baked.compositeCanvas === null, "A baked mask allocated an unnecessary final mask canvas");
    erased.dispose();
    baked.dispose();
    trianglePath.dispose();
    polygonTransform.dispose();
    integerMove.dispose();
    singular.dispose();
    outside.dispose();

    let originalGetContext = HTMLCanvasElement.prototype.getContext;
    let originalWarn = console.warn;
    try {
        for (let fault of ["noContext", "contextError", "compile", "link"]) {
            let warnings = [];
            let faultContext = null;
            console.warn = (...args) => warnings.push(args);
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                if (type === "webgl2" && fault === "noContext") {
                    return null;
                }
                if (type === "webgl2" && fault === "contextError") {
                    throw new Error("forced context failure");
                }
                let context = originalGetContext.call(this, type, ...args);
                if (type === "webgl2" && context !== null) {
                    faultContext = context;
                    if (fault === "compile") {
                        context.getShaderParameter = () => false;
                        context.getShaderInfoLog = () => "forced shader compile failure";
                    } else if (fault === "link") {
                        context.getProgramParameter = () => false;
                        context.getProgramInfoLog = () => "forced program link failure";
                    }
                }
                return context;
            };
            MaskedSurface.gpuRenderer = undefined;
            check(MaskedSurface.getGpuRenderer() === null, "GPU fault did not select CPU fallback");
            check(warnings.length === (fault === "noContext" ? 0 : 1), "GPU fault reporting differs");
            if (faultContext !== null) {
                faultContext.getExtension("WEBGL_lose_context").loseContext();
            }
        }
    } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        console.warn = originalWarn;
        MaskedSurface.gpuRenderer = cachedRenderer;
    }
    let visualPath = require("node:process").env.PAINTDOTJS_TEST_VISUAL_OUTPUT;
    if (visualPath) {
        let visualSource = Surface.create(64, 64);
        visualSource.context.fillStyle = "rgb(50,130,220)";
        visualSource.context.fillRect(0, 0, 64, 64);
        let visualPathShape = new GraphicsPath();
        visualPathShape.addRectangle(new Rectangle(0, 0, 64, 64));
        let visualMask = new MaskedSurface(visualSource, visualPathShape, true);
        let visualTransform = new Matrix();
        visualTransform.translate(4.25, 5.5, MatrixOrder.APPEND);
        let visualCpu = Surface.create(80, 80);
        let visualGpu = Surface.create(80, 80);
        visualMask.renderResampled(visualCpu, visualTransform, ResamplingAlgorithm.LINEAR, false, "high");
        visualMask.renderResampledGpu(visualGpu, visualTransform, ResamplingAlgorithm.LINEAR, false, "high");
        let comparison = document.createElement("canvas");
        comparison.width = 620;
        comparison.height = 440;
        let context = comparison.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, comparison.width, comparison.height);
        context.font = "16px sans-serif";
        context.imageSmoothingEnabled = false;
        for (let [index, raster] of [visualCpu, visualGpu].entries()) {
            let left = 24 + index * 310;
            context.fillStyle = "black";
            context.fillText(index === 0 ? "CPU / Canvas" : "GPU / 16 samples", left, 24);
            context.fillText("1:1", left, 48);
            context.drawImage(raster.canvas, left, 56);
            context.fillText("Corner enlarged 32x", left, 166);
            context.drawImage(raster.canvas, 3, 4, 8, 8, left, 180, 256, 256);
        }
        require("node:fs").writeFileSync(visualPath,
            Buffer.from(comparison.toDataURL("image/png").split(",")[1], "base64"));
        visualMask.dispose();
        visualPathShape.dispose();
        visualTransform.dispose();
        visualSource.dispose();
        visualCpu.dispose();
        visualGpu.dispose();
    }
    let benchmarkPath = require("node:process").env.PAINTDOTJS_TEST_BENCHMARK_OUTPUT;
    if (benchmarkPath) {
        let results = [];
        for (let size of [512, 1024, 2048]) {
            let input = Surface.create(size, size);
            input.context.fillStyle = "rgb(50,130,220)";
            input.context.fillRect(0, 0, size, size);
            let outline = new GraphicsPath();
            outline.addRectangle(new Rectangle(0, 0, size, size));
            let selection = new MaskedSurface(input, outline, true);
            let output = Surface.create(size, size);
            let movement = new Matrix();
            movement.translate(0.25, 0.5, MatrixOrder.APPEND);
            for (let sampling of [ResamplingAlgorithm.LINEAR, ResamplingAlgorithm.HIGH_QUALITY_CUBIC]) {
                selection.renderResampled(output, movement, sampling, false, "high");
                let durations = [];
                for (let repeat = 0; repeat < 5; ++repeat) {
                    output.context.clearRect(0, 0, size, size);
                    let before = performance.now();
                    selection.renderResampled(output, movement, sampling, false, "high");
                    durations.push(performance.now() - before);
                }
                results.push({size, sampling, durations,
                    medianMs: [...durations].sort((a, b) => a - b)[2],
                    extraMaskCanvasBytes: selection.compositeCanvas === null ? 0
                        : selection.compositeCanvas.width * selection.compositeCanvas.height * 4,
                    memory: require("node:process").memoryUsage()});
            }
            selection.dispose();
            input.dispose();
            outline.dispose();
            output.dispose();
            movement.dispose();
        }
        require("node:fs").writeFileSync(benchmarkPath, JSON.stringify(results, null, 2));
    }
    source.dispose();
    path.dispose();
    cpu.dispose();
    gpu.dispose();
    SettingsDialog.open("graphics");
    check(SettingsDialog.instance.page.textContent.includes("Graphics acceleration is available."),
        "Graphics settings did not report the working native WebGL renderer");
    SettingsDialog.instance.selectSection("diagnostics");
    let gpuDiagnostics = [...SettingsDialog.instance.page.querySelectorAll(".settings-diagnostics-table span")]
        .map(cell => cell.textContent);
    check(gpuDiagnostics[gpuDiagnostics.indexOf("WebGL") + 1] === "Available",
        "Diagnostics did not report the working native WebGL renderer");
    SettingsDialog.instance.close();
    check(mismatches.length === 0, "GPU/CPU differences: " + JSON.stringify(mismatches));
    return {ok: true};
};
