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

module.exports = async function checkExtensionGeometry() {
    let assert = require("node:assert/strict");
    let parser = PaintDotNetShapeParser;
    let wrap = body => '<SimpleGeometryShape DisplayName="Fixture">' + body + '</SimpleGeometryShape>';
    let parse = body => parser.parse(wrap(body), "fixture.xaml");
    let rectangle = '<RectangleGeometry Rect="10,20,30,40"/>';
    let definition = parse(rectangle);
    assert.deepEqual(definition.viewBox, [10, 20, 30, 40]);
    assert.equal(definition.path, "M 10 20 H 40 V 60 H 10 Z");
    assert.equal(parse('<RectangleGeometry Rect="0,0,20,10" RadiusX="3" RadiusY="2"/>').path,
        "M 3 0 H 17 A 3 2 0 0 1 20 2 V 8 A 3 2 0 0 1 17 10 H 3 A 3 2 0 0 1 0 8 V 2 A 3 2 0 0 1 3 0 Z");
    assert.deepEqual(parse('<EllipseGeometry Center="10,20" RadiusX="3" RadiusY="4"/>').viewBox, [7, 16, 6, 8]);
    assert.equal(parse('<LineGeometry StartPoint="0,0" EndPoint="10,10"/>').fillPath, "");
    assert.deepEqual(parse('<LineGeometry StartPoint="0,0" EndPoint="10,0"/>').viewBox, [0, -0.5, 10, 1]);
    assert.deepEqual(parse('<LineGeometry StartPoint="0,0" EndPoint="0,10"/>').viewBox, [-0.5, 0, 1, 10]);
    assert.equal(parse('<GeometryGroup FillRule="EvenOdd">' + rectangle
        + '<EllipseGeometry Center="0,0" RadiusX="1" RadiusY="1"/></GeometryGroup>').fillRule, "evenodd");
    let segments = '<LineSegment Point="1,2"/><ArcSegment Point="3,4" Size="5,6"/>'
        + '<ArcSegment Point="3,4" Size="5,6" SweepDirection="Clockwise" IsLargeArc="true" RotationAngle="30"/>'
        + '<BezierSegment Point1="1,2" Point2="3,4" Point3="5,6"/>'
        + '<QuadraticBezierSegment Point1="1,2" Point2="3,4"/>'
        + '<PolyLineSegment Points="1,2 3,4"/><PolyBezierSegment Points="1,2 3,4 5,6"/>'
        + '<PolyQuadraticBezierSegment Points="1,2 3,4 5,6 7,8"/>';
    let complex = parse('<PathGeometry FillRule="Nonzero"><PathFigure StartPoint="0,0" IsClosed="true">'
        + segments + '</PathFigure><PathFigure StartPoint="0,0" IsFilled="false"><LineSegment Point="3,4"/>'
        + '</PathFigure></PathGeometry>');
    assert.ok(complex.path.includes("A 5 6 0 0 0 3 4 A 5 6 30 1 1 3 4"));
    assert.ok(complex.path.includes("Q 1 2 3 4 Q 5 6 7 8 Z"));
    assert.ok(complex.path.endsWith("M 0 0 L 3 4"));
    assert.ok(!complex.fillPath.endsWith("M 0 0 L 3 4"));
    for (let [path, rule] of [["F0 M0 0 L1 1", "evenodd"], ["F1M0 0 L1 1", "nonzero"]]) {
        assert.equal(parser.parse('<SimpleGeometryShape DisplayName="Path" Geometry="' + path + '"/>', "p.xaml").fillRule, rule);
    }
    for (let source of [null, "", " ".repeat(524289), '<!DOCTYPE test><SimpleGeometryShape/>',
        '<!ENTITY test "x">', '<broken>', '<Wrong/>', '<SimpleGeometryShape/>',
        '<SimpleGeometryShape DisplayName=" "/>', '<SimpleGeometryShape DisplayName="' + "x".repeat(81) + '"/>',
        '<SimpleGeometryShape DisplayName="Bad" Geometry="M0 0 L1 1">' + rectangle + '</SimpleGeometryShape>',
        '<SimpleGeometryShape DisplayName="Bad" Geometry=""/>',
        '<SimpleGeometryShape DisplayName="Bad" Geometry="M0 0 L1 1!"/>',
        '<SimpleGeometryShape DisplayName="Bad" Geometry="' + "M0 0 ".repeat(44000) + '"/>',
        '<SimpleGeometryShape DisplayName="Bad" Geometry="M0 0"/>']) {
        assert.throws(() => parser.parse(source, "invalid.xaml"), /invalid.xaml/);
    }
    for (let body of ["", rectangle + rectangle, '<Unsupported/>', '<GeometryGroup/>',
        '<GeometryGroup FillRule="unknown">' + rectangle + '</GeometryGroup>',
        '<PathGeometry/>', '<PathGeometry><Unsupported/></PathGeometry>',
        '<PathGeometry><PathFigure StartPoint="0,0" IsClosed="invalid"/></PathGeometry>',
        '<PathGeometry><PathFigure StartPoint="0,0"><Unsupported/></PathFigure></PathGeometry>',
        '<RectangleGeometry Rect="0,0,0,1"/>', '<EllipseGeometry Center="0,0" RadiusX="0" RadiusY="1"/>',
        '<RectangleGeometry/>', '<RectangleGeometry Rect="0,0,1,1" RadiusX="Infinity"/>',
        '<RectangleGeometry Rect="0,0,1e999,1"/>',
        ...['<ArcSegment Point="1,1" Size="1,1" SweepDirection="bad"/>',
            '<PolyBezierSegment Points="0,0"/>', '<PolyQuadraticBezierSegment Points="0,0"/>',
            '<PolyLineSegment Points=""/>', '<PolyLineSegment Points="0,0,1"/>'].map(segment =>
            '<PathGeometry><PathFigure StartPoint="0,0">' + segment + '</PathFigure></PathGeometry>')]) {
        assert.throws(() => parse(body));
    }
    assert.equal(parser.parseBoolean("", true, "flag", "p"), true);
    assert.equal(parser.parseFillRule("", "evenodd", "p"), "evenodd");
    assert.equal(parser.optionalNumber("", 7, "number", "p"), 7);

    // Catalog paths use native SVG bounds and Canvas geometry, not a geometry stub.
    let shape = {id: "custom.geometry-fixture", sourceId: "fixture", fileName: "b.xaml", name: "Fixture", ...definition};
    ShapeCatalog.register(shape);
    try {
        assert.throws(() => ShapeCatalog.register(shape), /already registered/);
        assert.ok(ShapeCatalog.getIconSource(shape.id).startsWith("data:image/svg+xml,"));
        assert.equal(ShapeCatalog.getTooltip(shape.id), "Fixture\nLocation: b.xaml");
        assert.equal(ShapeCatalog.getTooltip("missing"), "");
        assert.equal(ShapeCatalog.getFillRule("missing"), "nonzero");
        assert.ok(ShapeCatalog.getEntries().some(([id]) => id === shape.id));
        assert.ok(ShapeCatalog.getCustomGroup().values.includes(shape.id));
        assert.ok(ShapeCatalog.createPath(shape.id, new Rectangle(0, 0, 30, 40), "fill") instanceof Path2D);
        assert.equal(ShapeCatalog.createPath("missing", new Rectangle(0, 0, 1, 1)), null);
        ShapeCatalog.register({...shape, id: "custom.line-fixture", fileName: "a.xaml", fillPath: ""});
        assert.ok(!decodeURIComponent(ShapeCatalog.getIconSource("custom.line-fixture")).includes('fill="#4f86b8"'));
        assert.equal(ShapeCatalog.createPath("custom.line-fixture", new Rectangle(0, 0, 1, 1), "fill"), null);
        let workspace = app.createBlankDocumentInNewWorkspace(40, 40);
        app.setActiveTool(null);
        let colors = FormRegistry.get("colorsForm");
        colors.setMainColor(Color.fromRGBA(255, 0, 0, 255));
        for (let drawType of ["fill", "outline", "both"]) {
            app.setActiveTool(null);
            workspace.getActiveLayer().getSurface().clear();
            Object.assign(ToolType.SHAPES.settings, {shape: shape.id, drawType, width: 2});
            app.setActiveToolFromType(ToolType.SHAPES);
            let tool = app.getActiveTool();
            tool.onMouseDown(5, 5, MouseButton.LEFT);
            tool.onMouseMove(30, 30);
            tool.onMouseUp(30, 30, MouseButton.LEFT);
            assert.ok(workspace.getActiveLayer().getSurface().context.getImageData(0, 0, 40, 40).data.some(value => value));
            tool.commitPending();
        }
        let dropdown = new ToolOptionDropdown({value: shape.id, values: [[shape.id, shape.name]],
            shapeGrid: true, shapeGroups: [{label: "Custom", values: [shape.id]}], width: 64, onChange() {}});
        document.body.appendChild(dropdown.getElement());
        dropdown.open();
        assert.ok(dropdown.menu.querySelector("button").title.includes("Location: b.xaml"));
        window.dispatchEvent(new CustomEvent("paintdotjs:shapes-changed"));
        assert.equal(ToolOptionDropdown.active, null);
        dropdown.getElement().remove();
        let bucket;
        app.setActiveToolFromType(ToolType.PAINT_BUCKET);
        bucket = app.getActiveTool();
        bucket.colorsChangedListener();
        bucket.onMouseDown(2, 2, MouseButton.LEFT);
        bucket.onMouseUp(2, 2, MouseButton.LEFT);
        bucket.colorsChangedListener();
        bucket.commitPending();
        app.setActiveToolFromType(ToolType.SHAPES);
        ToolType.SHAPES.setSetting("shape", "custom.removed");
        window.dispatchEvent(new CustomEvent("paintdotjs:shapes-changed"));
        assert.equal(ToolType.SHAPES.getSetting("shape"), "rectangle");
        app.closeDocumentWorkspace(workspace, false);
    } finally {
        ShapeCatalog.unregister("fixture");
    }
    let files = [new window.File([wrap(rectangle)], "fixture.xaml"), new window.File(["bad"], "bad.xaml"),
        new window.File(["skip"], "skip.txt")];
    let result = await ShapeManager.importFiles(files);
    assert.equal(result.added.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(ShapeManager.getShapes().length, 1);
    let updated = await ShapeManager.importFile(new window.File([wrap(rectangle)], "FIXTURE.xaml"));
    assert.equal(updated.id, result.added[0].id);
    assert.equal(updated.importedAt, result.added[0].importedAt);
    assert.equal(await ShapeManager.remove("missing"), false);
    await assert.rejects(ShapeManager.importFile(files[2]), /xaml/);
    await assert.rejects(ShapeManager.importFile(new window.File([new Uint8Array(524289)], "huge.xaml")), /512 KB/);
    await ShapeManager.clear();
    assert.equal(ShapeManager.getShapes().length, 0);
    assert.equal(ShapeCatalog.getEntries().length, 0);
    assert.deepEqual(ShapeManager.getLoadErrors(), []);
};
