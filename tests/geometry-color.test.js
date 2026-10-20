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

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {pathToFileURL} = require("node:url");
const {test} = require("node:test");

function loadGeometry() {
    let context = vm.createContext({});
    for (let relative of [
        "util/Point", "util/Size", "util/Rectangle", "util/Scanline", "util/UtilityEdge",
        "document/selection/MatrixOrder", "document/selection/Matrix", "document/selection/CombineMode",
        "document/selection/VertexList", "document/selection/GraphicsPath",
        "util/BitVector2D", "util/Region", "util/Utility", "util/Color"
    ]) {
        let filename = path.resolve(__dirname, "../js/src/engine", relative + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    return vm.runInContext("({Point, Size, Rectangle, Scanline, MatrixOrder, Matrix, CombineMode, VertexList, GraphicsPath, Region, Utility, Color})", context);
}

function rectangleValues(rectangle) {
    return [rectangle.getX(), rectangle.getY(), rectangle.getWidth(), rectangle.getHeight()];
}

function pointValues(point) {
    return [point.getX(), point.getY()];
}

function channels(color) {
    return [color.getRed(), color.getGreen(), color.getBlue(), color.getAlpha()];
}

function near(actual, expected) {
    assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test("vertex lists validate typed points, retain extrema and represent independent elliptical figures", () => {
    let {Point, Rectangle, VertexList, GraphicsPath} = loadGeometry();
    let empty = new VertexList();
    assert.equal(empty.getBounds(), null);
    empty.close();
    assert.equal(empty.getVertices().length, 0);
    assert.throws(() => empty.push({x: 1, y: 2}), /array of Point/);
    assert.throws(() => new VertexList([null]), /array of Point/);
    let vertices = new VertexList([new Point(8, 9), new Point(2, 1), new Point(12, 15), new Point(6, 0)], true);
    assert.deepEqual(rectangleValues(vertices.getBounds()), [2, 0, 10, 15]);
    assert.equal(vertices.isHole(), true);
    let clone = vertices.clone();
    clone.getVertices()[0].x = -50;
    assert.equal(vertices.getVertices()[0].x, 8);
    assert.equal(clone.isHole(), true);
    let ellipse = new GraphicsPath();
    ellipse.addEllipse(new Rectangle(10, 20, 12, 8));
    assert.equal(ellipse.getPathPoints().length, 57);
    assert.deepEqual(rectangleValues(ellipse.getBounds()), [10, 20, 12, 8]);
    for (let point of ellipse.getPathPoints()) {
        near(((point.x - 16) / 6) ** 2 + ((point.y - 24) / 4) ** 2, 1);
    }
    ellipse.closeAllFigures();
    let points = ellipse.getPathPoints();
    assert.ok(points[0].equals(points.at(-1)));
    assert.throws(() => ellipse.addEllipse({x: 0, y: 0, width: 1, height: 1}), /instance of Rectangle/);
    let disconnected = new GraphicsPath();
    disconnected.addLines([new Point(0, 0), new Point(1, 1)]);
    disconnected.addLines([new Point(10, 10), new Point(12, 12)]);
    assert.equal(disconnected.getVertexLists().length, 2);
    assert.deepEqual(Array.from(disconnected.getPathPoints(), pointValues), [[0, 0], [1, 1], [10, 10], [12, 12]]);
    for (let invalid of [null, [], [new Point(0, 0), {}]]) {
        assert.throws(() => disconnected.addLines(invalid), /array/);
    }
});

test("empty path set operations return independent results with exact set identities", () => {
    let {Rectangle, GraphicsPath, CombineMode} = loadGeometry();
    let filled = new GraphicsPath();
    filled.addRectangle(new Rectangle(2, 3, 4, 5));
    let empty = new GraphicsPath();
    let modes = [CombineMode.REPLACE, CombineMode.UNION, CombineMode.XOR,
        CombineMode.INTERSECT, CombineMode.EXCLUDE, CombineMode.COMPLEMENT];
    for (let mode of modes) {
        assert.ok(GraphicsPath.combine(empty, mode, empty).isEmpty());
        for (let emptyFirst of [true, false]) {
            let result = GraphicsPath.combine(emptyFirst ? empty : filled, mode, emptyFirst ? filled : empty);
            let retainsFigure = mode === CombineMode.UNION || mode === CombineMode.XOR
                || (emptyFirst && (mode === CombineMode.REPLACE || mode === CombineMode.COMPLEMENT))
                || (!emptyFirst && mode === CombineMode.EXCLUDE);
            assert.equal(result.isEmpty(), !retainsFigure);
            if (retainsFigure) {
                assert.notEqual(result, filled);
                assert.notEqual(result.getPathPoints()[0], filled.getPathPoints()[0]);
                assert.deepEqual(rectangleValues(result.getBounds()), [2, 3, 4, 5]);
            }
        }
    }
    assert.throws(() => GraphicsPath.combine(filled, -1, empty), /Invalid enum argument/);
});

test("adaptive ellipse vertices obey the requested chord error at every size and retain cardinal bounds", () => {
    let {Rectangle, VertexList, GraphicsPath} = loadGeometry();
    for (let [width, height] of [[1, 1], [4, 2], [24, 8], [160, 60], [4096, 17], [16000, 16000]]) {
        for (let tolerance of [0.01, 0.25]) {
            let bounds = new Rectangle(10, -20, width, height);
            let points = VertexList.flattenEllipse(bounds, tolerance);
            let segments = points.length - 1;
            assert.ok(segments >= 16 && segments % 4 === 0);
            let centerX = 10 + width / 2;
            let centerY = -20 + height / 2;
            for (let i = 0; i < segments; ++i) {
                let angle = (i + 0.5) * 2 * Math.PI / segments;
                let curveX = centerX + width / 2 * Math.cos(angle);
                let curveY = centerY + height / 2 * Math.sin(angle);
                let chordX = (points[i].x + points[i + 1].x) / 2;
                let chordY = (points[i].y + points[i + 1].y) / 2;
                assert.ok(Math.hypot(curveX - chordX, curveY - chordY) <= tolerance + 1e-9,
                    `Ellipse ${width}x${height} exceeded ${tolerance}px at segment ${i}`);
            }
            let vertices = new VertexList(points);
            assert.deepEqual(rectangleValues(vertices.getBounds()), [10, -20, width, height]);
            let appended = new VertexList();
            appended.addEllipse(10, -20, width, height, tolerance);
            assert.deepEqual(Array.from(appended.getVertices(), pointValues), Array.from(points, pointValues));
        }
    }
    for (let [width, height] of [[0, 2], [2, 0], [-1, 2], [2, -1]]) {
        let bounds = new Rectangle(0, 0, width, height);
        assert.equal(VertexList.flattenEllipse(bounds).length, 0);
        let path = new GraphicsPath();
        path.addEllipse(bounds);
        assert.equal(path.isEmpty(), true);
        assert.deepEqual(rectangleValues(path.getBounds()), [0, 0, 0, 0]);
    }
    assert.throws(() => VertexList.flattenEllipse({}), /instance of Rectangle/);
    for (let tolerance of [0, -1, NaN, Infinity, "0.01"]) {
        assert.throws(() => VertexList.flattenEllipse(new Rectangle(0, 0, 2, 2), tolerance), /positive finite/);
    }
    for (let bounds of [
        new Rectangle(NaN, 0, 2, 2), new Rectangle(0, Infinity, 2, 2),
        new Rectangle(0, 0, Infinity, 2), new Rectangle(Number.MAX_VALUE, 0, Number.MAX_VALUE, 2)
    ]) {
        assert.throws(() => VertexList.flattenEllipse(bounds), /bounds must be finite/);
    }
    for (let tolerance of [1e-20, Number.MIN_VALUE]) {
        assert.throws(() => VertexList.flattenEllipse(new Rectangle(0, 0, 2, 2), tolerance), /unrepresentable vertex count/);
    }
});

test("flatten transforms already-linear figures without dropping short edges, duplicates, holes or closure", () => {
    let {Point, Rectangle, Matrix, VertexList, GraphicsPath} = loadGeometry();
    let original = new GraphicsPath();
    original.addRectangle(new Rectangle(0, 0, 1, 1));
    original.addLines([new Point(2, 0), new Point(2, 3), new Point(2, 3), new Point(2, 4)]);
    original.getVertexLists().push(new VertexList([new Point(0.2, 0.2), new Point(0.3, 0.2), new Point(0.2, 0.2)], true));
    let before = Array.from(original.getPathPoints(), pointValues);
    let matrix = new Matrix();
    matrix.translate(10, 20);
    for (let tolerance of [2, 0.25, 0.01]) {
        let path = original.clone();
        path.setPixelStencil({width: 1, height: 1, bitArray: new Uint8Array([255])});
        path.flatten(matrix, tolerance);
        assert.deepEqual(Array.from(path.getPathPoints(), pointValues), before.map(([x, y]) => [x + 10, y + 20]));
        assert.equal(path.getVertexLists().length, 3);
        assert.equal(path.getVertexLists()[2].isHole(), true);
        assert.equal(path.pixelStencil, null);
        assert.deepEqual(Array.from(original.getPathPoints(), pointValues), before);
    }
    for (let tolerance of [0, -1, NaN, Infinity, undefined, "0.1"]) {
        let path = original.clone();
        assert.throws(() => path.flatten(matrix, tolerance), /positive finite/);
        assert.deepEqual(Array.from(path.getPathPoints(), pointValues), before);
    }
    assert.throws(() => original.flatten({}, 0.01), /instance of Matrix/);
    let empty = new GraphicsPath();
    empty.flatten(matrix, 0.01);
    assert.equal(empty.isEmpty(), true);
});

test("color conversion covers hue sectors, achromatic values, wrapping and packed alpha", () => {
    let {Color} = loadGeometry();
    for (let [rgb, hue] of [
        [[255, 0, 0], 0], [[255, 255, 0], 1 / 6], [[0, 255, 0], 1 / 3],
        [[0, 255, 255], 1 / 2], [[0, 0, 255], 2 / 3], [[255, 0, 255], 5 / 6]
    ]) {
        let color = Color.fromRGBA(...rgb, 113);
        near(color.getHue(), hue);
        assert.equal(color.getSaturation(), 1);
        assert.equal(color.getHsvSaturation(), 1);
        assert.equal(color.getLightness(), 0.5);
        assert.equal(color.getValue(), 1);
        assert.deepEqual(channels(Color.fromHSL(hue, 1, 0.5, 113)), [...rgb, 113]);
        for (let wrapped of [hue - 1, hue, hue + 2]) {
            assert.deepEqual(channels(Color.fromHSV(wrapped, 1, 1, 113)), [...rgb, 113]);
        }
        assert.deepEqual(channels(Color.fromPacked(color.toPacked())), [...rgb, 113]);
    }
    for (let rgb of [[0, 0, 0], [128, 128, 128], [255, 255, 255], [240, 200, 180], [15, 60, 30], [50, 12, 40]]) {
        let color = Color.fromRGB(...rgb);
        let roundTrip = Color.fromHSL(color.getHue(), color.getSaturation(), color.getLightness());
        let hsv = Color.fromHSV(color.getHue(), color.getHsvSaturation(), color.getValue());
        assert.deepEqual(channels(roundTrip), [...rgb, 255]);
        assert.deepEqual(channels(hsv), [...rgb, 255]);
    }
    assert.deepEqual(channels(Color.fromHex("#1234ab")), [18, 52, 171, 255]);
    let color = new Color(1, 2, 3, 4);
    assert.equal(color.toHex(), "#01020304");
    let copy = color.copy();
    assert.notEqual(copy, color);
    assert.equal(copy.setRed(5).setGreen(6).setBlue(7).setAlpha(8), copy);
    assert.deepEqual(channels(copy), [5, 6, 7, 8]);
    assert.deepEqual(channels(color), [1, 2, 3, 4]);
    assert.deepEqual(channels(Color.fromHSV(0.2, -1, 2)), [255, 255, 255, 255]);
    assert.deepEqual(channels(Color.fromHSV(0.2, 2, -1)), [0, 0, 0, 255]);
    color = new Color(255, 0, 0, 113);
    assert.equal(color.setHue(1 / 3).setSaturation(0).setLightness(0.25), color);
    assert.deepEqual(channels(color), [64, 64, 64, 113]);
    color = new Color(255, 0, 0, 113);
    assert.equal(color.setHsvHue(2 / 3).setHsvSaturation(0.5).setValue(0.5), color);
    assert.deepEqual(channels(color), [64, 64, 128, 113]);
});

test("rectangle boundaries, intersections, setters and center scaling retain exact geometry", () => {
    let {Point, Size, Rectangle} = loadGeometry();
    let point = new Point(2, 3);
    assert(point.equals(point.clone()));
    assert.equal(point.equals(new Point(2, 4)), false);
    assert.equal(point.equals(new Point(1, 3)), false);
    assert.deepEqual(pointValues(Point.EMPTY), [0, 0]);
    let size = new Size(5, 6);
    assert.deepEqual([size.getWidth(), size.getHeight()], [5, 6]);
    assert(size.equals(new Size(5, 6)));
    assert.equal(size.equals(new Size(5, 7)), false);
    assert.equal(size.equals(new Size(4, 6)), false);
    let rect = Rectangle.relative(2, 3, 5, 6);
    assert.deepEqual([rect.getLeft(), rect.getTop(), rect.getRight(), rect.getBottom()], [2, 3, 7, 9]);
    for (let [x, y, expected] of [[2, 3, true], [7, 9, true], [1, 3, false], [8, 3, false], [2, 2, false], [2, 10, false]]) {
        assert.equal(rect.contains(new Point(x, y)), expected);
    }
    assert.equal(rect.toString(), "2, 3 (5x6)");
    rect.setLeft(1);
    rect.setTop(2);
    rect.setRight(10);
    rect.setBottom(12);
    assert.deepEqual(rectangleValues(rect), [1, 2, 9, 10]);
    rect.setX(3);
    rect.setY(4);
    rect.setWidth(5);
    rect.setHeight(6);
    rect.setPosition(1, 2);
    rect.setSize(8, 4);
    rect.scale(2, 3);
    assert.deepEqual(rectangleValues(rect), [-3, -2, 16, 12]);
    rect.setAbsolute(1, 2, 7, 8);
    rect.setRelative(1, 2, 3, 4);
    let clone = rect.clone();
    clone.inflate(2, 3);
    assert.deepEqual(rectangleValues(clone), [-1, -1, 7, 10]);
    assert.deepEqual(rectangleValues(rect), [1, 2, 3, 4]);
    let overlap = Rectangle.absolute(3, 4, 7, 8);
    assert.deepEqual(rectangleValues(Rectangle.intersect(rect, overlap)), [3, 4, 1, 2]);
    rect.intersect(overlap);
    assert.deepEqual(rectangleValues(rect), [3, 4, 1, 2]);
    assert.deepEqual(rectangleValues(Rectangle.union(rect, overlap)), [3, 4, 4, 4]);
    assert(Rectangle.intersect(rect, new Rectangle(20, 20, 1, 1)).isEmpty());
    assert(new Rectangle(0, 0, 0, 1).isEmpty());
    assert(new Rectangle(0, 0, 1, 0).isEmpty());
    assert.equal(overlap.isEmpty(), false);
    assert.deepEqual(rectangleValues(Rectangle.truncate(new Rectangle(-1.9, 2.9, 3.9, 4.9))), [-1, 2, 3, 4]);
    assert.deepEqual(rectangleValues(Rectangle.fromElement({getBoundingClientRect: () => ({left: 1, top: 2, width: 3, height: 4})})), [1, 2, 3, 4]);
    assert.equal(rect.dispose(), undefined);
});

test("affine composition orders, inverse, vector translation and validation obey the matrix contract", () => {
    let {Point, Matrix, MatrixOrder, Utility} = loadGeometry();
    let matrix = new Matrix();
    assert(matrix.isIdentity());
    matrix.translate(3, 4);
    matrix.scale(2, 3);
    assert.deepEqual(pointValues(Utility.transformOnePoint(matrix, new Point(1, 2))), [8, 18]);
    assert.deepEqual(pointValues(Utility.transformOneVector(matrix, new Point(1, 2))), [2, 6]);
    let copy = matrix.clone();
    assert.notEqual(copy.getElements()[0], matrix.getElements()[0]);
    copy.invert();
    assert(copy.isInvertible());
    assert.deepEqual(pointValues(Utility.transformOnePoint(copy, new Point(8, 18))), [1, 2]);
    matrix.reset();
    matrix.translate(3, 4);
    matrix.scale(2, 3, MatrixOrder.PREPEND);
    assert.deepEqual(pointValues(Utility.transformOnePoint(matrix, new Point(1, 2))), [5, 10]);
    matrix.reset();
    matrix.rotateAt(90, new Point(3, 4));
    let rotated = Utility.transformOnePoint(matrix, new Point(4, 4));
    near(rotated.x, 3);
    near(rotated.y, 5);
    near(Utility.getAngleOfTransform(matrix), 90);
    assert.equal(Utility.isTransformFlipped(matrix), false);
    matrix.reset();
    matrix.scale(-1, 1);
    assert(Utility.isTransformFlipped(matrix));
    matrix.rotateAt(-90, new Point(0, 0));
    assert(Utility.isTransformFlipped(matrix));
    matrix.scale(0, 1);
    assert.equal(matrix.isInvertible(), false);
    assert.throws(() => matrix.invert(), /not invertible/);
    assert.throws(() => matrix.multiply({}), /instance of Matrix/);
    assert.throws(() => matrix.multiply(new Matrix(), 99), /Invalid order/);
    assert.throws(() => matrix.transformPoints({}), /array of points/);
    assert.throws(() => matrix.transformVectors({}), /array of vectors/);
    matrix.transformPoints([]);
    matrix.transformVectors([]);
    matrix.dispose();
    assert.equal(matrix.getElements(), null);
});

test("polygon clipping, scanlines and vector projections agree with independent geometric expectations", () => {
    let {Point, Rectangle, Scanline, Utility} = loadGeometry();
    let bounds = new Rectangle(0, 0, 4, 3);
    let outside = [new Point(-2, -2), new Point(6, -2), new Point(6, 5), new Point(-2, 5)];
    let clipped = Utility.sutherlandHodgman(bounds, outside);
    assert.equal(clipped.length, 4);
    assert.deepEqual(Array.from(clipped, pointValues).sort(), [[0, 0], [0, 3], [4, 0], [4, 3]].sort());
    assert.equal(Utility.sutherlandHodgman(bounds, []).length, 0);
    assert.equal(Utility.sutherlandHodgman(bounds, [new Point(-3, -3), new Point(-2, -3), new Point(-2, -2)]).length, 0);
    assert.deepEqual(Array.from(Utility.getScans(clipped), scan => [scan.getX(), scan.getY(), scan.getLength()]), [[0, 0, 4], [0, 1, 4], [0, 2, 4]]);
    let triangle = [new Point(0, 0), new Point(4, 0), new Point(0, 4)];
    assert.deepEqual(Array.from(Utility.getScans(triangle), scan => [scan.x, scan.y, scan.length]), [[0, 0, 4], [0, 1, 3], [0, 2, 2], [0, 3, 1]]);
    let subset = [new Point(99, 99), ...triangle, new Point(99, 99)];
    assert.equal(Utility.getScans(subset, 1, 3).length, 4);
    assert.throws(() => Utility.getScans(triangle, 1, 3), /out of bounds/);
    let scan = new Scanline(1, 2, 3);
    assert(scan.equals(new Scanline(1, 2, 3)));
    for (let other of [{}, new Scanline(0, 2, 3), new Scanline(1, 0, 3), new Scanline(1, 2, 0)]) {
        assert.equal(scan.equals(other), false);
    }
    assert.equal(scan.toString(), "(1,2):[3]");
    let same = new Point(1, 1);
    assert.equal(Utility.lineIntercept(bounds, Utility.LEFT, same, same), same);
    for (let edge of [Utility.LEFT, Utility.RIGHT]) {
        assert.throws(() => Utility.lineIntercept(bounds, edge, same, new Point(1, 2)), /No intercept/);
    }
    for (let edge of [Utility.TOP, Utility.BOTTOM]) {
        assert.throws(() => Utility.lineIntercept(bounds, edge, same, new Point(2, 1)), /No intercept/);
    }
    assert.throws(() => Utility.lineIntercept(bounds, 99, same, new Point(2, 2)), /Unknown edge/);
    assert.deepEqual(pointValues(Utility.normalizeVector2(new Point(0, 0))), [0, 0]);
    assert.deepEqual(pointValues(Utility.normalizeVector2(new Point(3, 4))), [0.6, 0.8]);
    let projection = Utility.getProjection(new Point(3, 4), new Point(2, 0));
    assert.deepEqual(pointValues(projection.yhat), [3, 0]);
    assert.deepEqual(pointValues(projection.z), [0, 4]);
    assert.equal(projection.yhatLen, 1.5);
    projection = Utility.getProjection(new Point(3, 4), new Point(0, 0));
    assert.deepEqual(pointValues(projection.yhat), [0, 0]);
    assert.deepEqual(pointValues(projection.z), [0, 0]);
    assert.equal(projection.yhatLen, 0);
    assert.equal(Utility.distance(new Point(0, 0), new Point(3, 4)), 5);
    near(Utility.toDegrees(Utility.toRadians(137)), 137);
    assert.deepEqual(rectangleValues(Utility.rectangleFromCenter(new Point(3, 4), 2)), [1, 2, 4, 4]);
    assert.deepEqual(rectangleValues(Utility.roundRectangle(new Rectangle(1.1, -2.1, 3.2, 4.2))), [1, -3, 4, 6]);
    for (let endpoint of [new Point(7, 4), new Point(-5, 4), new Point(7, -4), new Point(-5, -4)]) {
        let constrained = Utility.pointsToConstrainedRectangle(new Point(1, 0), endpoint);
        assert.equal(constrained.width, 5);
        assert.equal(constrained.height, 5);
    }
});

test("regions intersect without mutating source rectangles and preserve independent cloned paths", () => {
    let {Rectangle, Region, GraphicsPath, VertexList, Utility} = loadGeometry();
    assert.throws(() => new Region(null), /must be an array/);
    let source = new Rectangle(0, 0, 4, 4);
    let region = Region.fromRectangles([source, new Rectangle(10, 10, 2, 2)]);
    assert.deepEqual(rectangleValues(region.getBounds()), [0, 0, 12, 12]);
    assert.throws(() => region.intersectRectangle({}), /instance of Rectangle/);
    assert.throws(() => region.intersectRegion({}), /instance of Region/);
    region.intersectRectangle(new Rectangle(2, 2, 4, 4));
    assert.equal(region.size(), 1);
    assert.deepEqual(rectangleValues(region.getRectangles()[0]), [2, 2, 2, 2]);
    assert.deepEqual(rectangleValues(source), [0, 0, 4, 4]);
    let copy = region.clone();
    copy.intersectRegion(Region.fromRectangle(new Rectangle(3, 3, 5, 5)));
    assert.deepEqual(rectangleValues(copy.getRectangles()[0]), [3, 3, 1, 1]);
    assert.deepEqual(rectangleValues(region.getRectangles()[0]), [2, 2, 2, 2]);
    copy.intersectRegion(Region.fromRectangle(new Rectangle(20, 20, 1, 1)));
    assert.equal(copy.size(), 0);
    let graphic = new GraphicsPath([new VertexList()]);
    graphic.addRectangle(source);
    assert.equal(Region.fromPath(graphic).size(), 1);
    assert.throws(() => Region.fromPath({}), /must be a GraphicsPath/);
    let rectangles = [new Rectangle(2, 3, 2, 2), new Rectangle(0, 0, 8, 8), new Rectangle(1, 1, 1, 1)];
    let detailed = Region.fromRectangles(rectangles);
    assert.deepEqual(rectangleValues(Utility.getRegionBounds(detailed, 0, 3)), [0, 0, 8, 8]);
    assert.deepEqual(rectangleValues(Utility.getRegionBounds(Region.fromRectangles([]), 0, 0)), [0, 0, 0, 0]);
    let simplified = Utility.simplifyRegion(detailed, 1);
    assert.deepEqual(rectangleValues(simplified[0]), [0, 0, 8, 8]);
    let inflated = Utility.simplifyAndInflateRegion(detailed, 1, 2);
    assert.deepEqual(rectangleValues(inflated[0]), [-2, -2, 12, 12]);
    for (let complexity of [0, 5]) {
        let unchanged = Utility.simplifyRegion(detailed, complexity);
        assert(Array.isArray(unchanged));
        assert.equal(unchanged.length, 3);
        assert.notEqual(unchanged[0], rectangles[0]);
        assert.deepEqual(rectangleValues(unchanged[0]), [2, 3, 2, 2]);
        let expanded = Utility.simplifyAndInflateRegion(detailed, complexity, 2);
        assert.deepEqual(rectangleValues(expanded[0]), [0, 1, 6, 6]);
        assert.deepEqual(rectangleValues(rectangles[0]), [2, 3, 2, 2]);
    }
    assert.equal(Utility.simplifyAndInflateRegion(Region.fromRectangles([])).length, 0);
    let split = new Array(3);
    Utility.splitRectangle(new Rectangle(1, 2, 3, 9), split);
    assert.deepEqual(split.map(rectangleValues), [[1, 2, 3, 3], [1, 5, 3, 3], [1, 8, 3, 3]]);
    region.dispose();
    assert.equal(region.size(), 0);
});

test("empty and horizontally degenerate polygons have no scanlines", () => {
    let {Point, Utility} = loadGeometry();
    for (let polygon of [[], [new Point(1, 1)], [new Point(1, 1), new Point(5, 1)], [new Point(1, 1), new Point(1, 1), new Point(1, 1)]]) {
        assert.equal(Utility.getScans(polygon).length, 0);
    }
});

test("scan conversion sorts descending edges and follows concave row boundaries", () => {
    let {Point, Utility, Matrix} = loadGeometry();
    let polygon = [[4, 4], [4, 0], [0, 0], [0, 2], [2, 2], [2, 4]].map(([x, y]) => new Point(x, y));
    assert.deepEqual(Array.from(Utility.getScans(polygon), scan => [scan.x, scan.y, scan.length]),
        [[0, 0, 4], [0, 1, 4], [2, 2, 2], [2, 3, 2]]);
    let rotation = new Matrix();
    rotation.rotateAt(-30, new Point(0, 0));
    assert.equal(rotation.isIdentity(), false);
    assert.equal(Utility.isTransformFlipped(rotation), false);
    rotation.scale(-1, 1);
    assert.equal(Utility.isTransformFlipped(rotation), true);
});

test("UUID representation retains 64-bit values and random IDs use both independent draws", () => {
    let values = [0.25, 0.75];
    let context = vm.createContext({Math: Object.assign(Object.create(Math), {random: () => values.shift()})});
    let filename = path.resolve(__dirname, "../js/src/engine/util/UUID.js");
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    let UUID = vm.runInContext("UUID", context);
    assert.equal(new UUID(0, 15).toString(), "0000000000000000-000000000000000f");
    assert.equal(new UUID(0xffffffffffffffffn, 0x8000000000000000n).toString(), "ffffffffffffffff-8000000000000000");
    let generated = UUID.randomUUID();
    assert.equal(generated.mostSigBits, 2251799813685247n);
    assert.equal(generated.leastSigBits, 6755399441055743n);
    assert.equal(values.length, 0);
});

test("scan conversion advances past a completed roof into the next pair of side edges", () => {
    let {Point, Utility} = loadGeometry();
    let vertices = [[0, 0], [2, 1], [2, 4], [-2, 4], [-2, 1]].map(([x, y]) => new Point(x, y));
    assert.deepEqual(Array.from(Utility.getScans(vertices), scan => [scan.x, scan.y, scan.length]),
        [[0, 0, 0], [-2, 1, 4], [-2, 2, 4], [-2, 3, 4]]);
});

test("integer region scans round outward, ignore empty rectangles and reject unsafe coordinates", () => {
    let {Rectangle, Region, GraphicsPath, Point} = loadGeometry();
    let source = new Rectangle(-2.8, -1.2, 4.1, 2.4);
    let region = Region.fromRectangles([new Rectangle(900, 900, 0, 4), source,
        new Rectangle(-5, -5, -1, 2), new Rectangle(4.25, 3.5, 0.1, 0.1)]);
    let scans = region.getRegionScansInt();
    assert.deepEqual(Array.from(scans, rectangleValues), [[-3, -2, 5, 4], [4, 3, 1, 1]]);
    assert.deepEqual(rectangleValues(region.getBoundsInt()), [-3, -2, 8, 6]);
    scans[0].x = 100;
    assert.equal(source.x, -2.8);
    for (let rectangles of [[], [new Rectangle(1, 2, 0, 0)], [new Rectangle(1, 2, -1, 3)]]) {
        let empty = Region.fromRectangles(rectangles);
        assert.deepEqual(rectangleValues(empty.getBounds()), [0, 0, 0, 0]);
        assert.deepEqual(rectangleValues(empty.getBoundsInt()), [0, 0, 0, 0]);
        assert.equal(GraphicsPath.fromRegion(empty).isEmpty(), true);
    }
    for (let rect of [new Rectangle(NaN, 0, 1, 1), new Rectangle(0, Infinity, 1, 1),
        new Rectangle(0, 0, Infinity, 1), new Rectangle(1e20, 0, 1, 1),
        new Rectangle(-Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER * 2, 1)]) {
        assert.throws(() => Region.fromRectangle(rect).getRegionScansInt(), /finite|safe integer/);
    }
    assert.throws(() => GraphicsPath.fromRegion(Region.fromRectangles([
        new Rectangle(0, 0, 1, 1), new Rectangle(1e9, 1e9, 1, 1)
    ])), /stencil exceeds/);
    assert.throws(() => Region.fromRectangles([
        new Rectangle(-Number.MAX_SAFE_INTEGER, 0, 1, 1),
        new Rectangle(Number.MAX_SAFE_INTEGER - 1, 0, 1, 1)
    ]).getBoundsInt(), /bounds exceed/);
    for (let value of [NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
        let path = new GraphicsPath();
        path.addLines([new Point(value, 0), new Point(1, 1), new Point(0, 1)]);
        assert.throws(() => Region.fromPath(path), /Path coordinates/);
    }
});

test("integer region paths preserve unions, holes, negative origins and fractional coverage", () => {
    let {Rectangle, Region, GraphicsPath, VertexList} = loadGeometry();
    let rectangles = [
        new Rectangle(-4.5, -3.5, 6.5, 1.5),
        new Rectangle(-4.5, -2, 1.5, 3),
        new Rectangle(1, -2, 1, 3),
        new Rectangle(-4.5, 1, 6.5, 1),
        new Rectangle(4.2, 3.2, 0.2, 0.2),
        new Rectangle(-4.1, -3.1, 1, 1)
    ];
    let converted = GraphicsPath.fromRegion(Region.fromRectangles(rectangles));
    let covered = path => {
        let pixels = new Set();
        for (let scan of path.getScans()) {
            for (let x = scan.x; x < scan.getRight(); ++x) {
                pixels.add(x + "," + scan.y);
            }
        }
        return pixels;
    };
    let expected = new Set();
    for (let y = -6; y <= 6; ++y) {
        for (let x = -6; x <= 6; ++x) {
            if (rectangles.some(rect => x < rect.getRight() && x + 1 > rect.x
                && y < rect.getBottom() && y + 1 > rect.y)) {
                expected.add(x + "," + y);
            }
        }
    }
    assert.deepEqual(covered(converted), expected);
    let outer = new VertexList();
    outer.addRectangle(-3, -3, 6, 6);
    let hole = new VertexList([], true);
    hole.addRectangle(-1, -1, 2, 2);
    let donut = new GraphicsPath([outer, hole]);
    let region = Region.fromPath(donut);
    let roundTrip = GraphicsPath.fromRegion(region);
    assert.deepEqual(covered(roundTrip), covered(donut));
    assert.equal(covered(roundTrip).size, 32);
    assert.equal(covered(roundTrip).has("0,0"), false);
    let triangle = new GraphicsPath();
    triangle.addLines(donut.getPathPoints().slice(0, 3));
    assert.equal(Region.fromPath(triangle).getRectangles().reduce((sum, rect) => sum + rect.width * rect.height, 0), 21);
});

test("single-rectangle regions produce independent paths with unchanged coordinates", () => {
    let {Rectangle, Region, GraphicsPath} = loadGeometry();
    let rectangle = new Rectangle(2, 3, 4, 5);
    let region = Region.fromRectangle(rectangle);
    let converted = GraphicsPath.fromRegion(region);
    assert.deepEqual(rectangleValues(converted.getBounds()), [2, 3, 4, 5]);
    assert.deepEqual(Array.from(converted.getPathPoints(), pointValues), [[2, 3], [6, 3], [6, 8], [2, 8], [2, 3]]);
    rectangle.x = 100;
    assert.deepEqual(rectangleValues(converted.getBounds()), [2, 3, 4, 5]);
    region.dispose();
    converted.dispose();
});

test("catalog paths report unavailable native geometry capabilities without building partial paths", () => {
    for (let globals of [{}, {Path2D: function () { assert.fail("DOMMatrix is unavailable"); }}]) {
        let context = vm.createContext(globals);
        let filename = path.resolve(__dirname, "../js/src/engine/document/tool/shape/ShapeCatalog.js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
        let catalog = vm.runInContext("ShapeCatalog", context);
        let shape = "custom.test";
        catalog.register({id: shape, fileName: "test.xaml", path: "M0 0L10 10", viewBox: {x: 0, y: 0, width: 10, height: 10}});
        assert.equal(catalog.createPath(shape, {x: 1, y: 2, width: 3, height: 4}), null);
        assert.equal(catalog.createPath("unknown-shape", {x: 1, y: 2, width: 3, height: 4}), null);
    }
});


test("region compaction keeps holes, disconnected rows and changing spans exact", () => {
    let {GraphicsPath, Rectangle, Region} = loadGeometry();
    let path = new GraphicsPath();
    for (let rect of [[0, 0, 8, 2], [0, 4, 8, 3], [12, 0, 2, 7]]) {
        path.addRectangle(new Rectangle(...rect));
    }
    let expected = new Set();
    for (let scan of path.getScans()) {
        for (let x = scan.x; x < scan.getRight(); ++x) {
            expected.add(x + "," + scan.y);
        }
    }
    let region = Region.fromPath(path);
    assert.equal(region.size(), 3);
    let actual = new Set();
    for (let rect of region.getRectangles()) {
        for (let y = rect.y; y < rect.getBottom(); ++y) {
            for (let x = rect.x; x < rect.getRight(); ++x) {
                actual.add(x + "," + y);
            }
        }
    }
    assert.deepEqual(actual, expected);
    assert.equal(Region.fromPath(new GraphicsPath()).size(), 0);
});
