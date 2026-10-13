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
        "document/selection/MatrixOrder", "document/selection/Matrix",
        "document/selection/VertexList", "document/selection/GraphicsPath",
        "util/Region", "util/Utility", "util/Color"
    ]) {
        let filename = path.resolve(__dirname, "../js/src/engine", relative + ".js");
        vm.runInContext(fs.readFileSync(filename, "utf8"), context, {filename: pathToFileURL(filename).href});
    }
    return vm.runInContext("({Point, Size, Rectangle, Scanline, MatrixOrder, Matrix, VertexList, GraphicsPath, Region, Utility, Color})", context);
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
