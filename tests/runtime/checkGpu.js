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
    check(mismatches.length === 0, "GPU/CPU differences: " + JSON.stringify(mismatches));
    return {ok: true};
};
