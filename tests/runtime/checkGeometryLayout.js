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

module.exports = async function checkGeometryLayout() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    let rejects = (operation, pattern) => {
        let rejected = false;
        try {
            operation();
        } catch (error) {
            check(pattern.test(error.message), "Unexpected geometry/layout failure: " + error.message);
            rejected = true;
        }
        check(rejected, "Invalid geometry/layout input was accepted");
    };
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    let workspace = app.createBlankDocumentInNewWorkspace(8, 8);
    phase("asset setup guard in real document-loading and loaded frames");
    for (let fixture of [
        {status: 200, text: "", ready: true}, {status: 299, text: "", ready: true},
        {status: 0, text: "file content", ready: true}, {status: 0, text: "", ready: false},
        {status: 404, text: "", ready: false}, {status: 500, text: "", ready: false, late: true},
        {status: 0, text: "", ready: false, failure: true},
        {status: 0, text: "", ready: false, language: {}},
        {status: 0, text: "", ready: true, language: {fallbackData: {}}, failure: true}
    ]) {
        let iframe = document.createElement("iframe");
        let loaded = new Promise(resolve => iframe.onload = resolve);
        iframe.srcdoc = `<div id="content"></div><div id="windowOverlay"></div><script>
            window.Language = ${JSON.stringify(fixture.language)};
            window.assetRequests = 0;
            window.XMLHttpRequest = function () {
                ++window.assetRequests;
                this.status = ${fixture.status}; this.responseText = ${JSON.stringify(fixture.text)};
                this.open = function () {};
                this.send = function () {${fixture.failure ? "throw new Error('offline');" : ""}};
            };
            <\/script>${fixture.late ? "" : '<script src="paintjs://app/js/platform/asset_guard.js"><\/script>'}`;
        document.body.appendChild(iframe);
        await loaded;
        if (fixture.late) {
            let script = iframe.contentDocument.createElement("script");
            script.src = "paintjs://app/js/platform/asset_guard.js";
            let ready = new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => reject(new Error("Asset guard script failed to load"));
            });
            iframe.contentDocument.body.appendChild(script);
            await ready;
        }
        let frameWindow = iframe.contentWindow;
        let page = iframe.contentDocument;
        check(frameWindow.paintDotJsAssetsReady === fixture.ready, "Asset guard accepted the wrong HTTP/file state");
        check(frameWindow.assetRequests === (fixture.language?.fallbackData ? 0 : 1),
            "Bundled language assets triggered a network request during startup");
        check((page.querySelector(".missing-assets-page") === null) === fixture.ready, "Asset guard displayed the wrong setup state");
        if (!fixture.ready) {
            check(page.getElementById("content") === null && page.getElementById("windowOverlay") === null,
                "Missing-asset UI retained an unusable editor");
            check(page.querySelector("code").textContent === "npm run check-assets", "Setup guard omitted its recovery command");
        }
        iframe.remove();
    }
    phase("actual polygon clipping and holes");
    let left = new GraphicsPath();
    let right = new GraphicsPath();
    left.addRectangle(new Rectangle(0, 0, 4, 4));
    right.addRectangle(new Rectangle(2, 0, 4, 4));
    let area = path => path.getVertexLists().reduce((total, vertices) => {
        let points = vertices.getVertices();
        let sum = 0;
        for (let index = 0; index < points.length; ++index) {
            let next = points[(index + 1) % points.length];
            sum += points[index].x * next.y - next.x * points[index].y;
        }
        return total + Math.abs(sum) / 2 * (vertices.isHole() ? -1 : 1);
    }, 0);
    for (let [mode, expected] of [
        [CombineMode.UNION, 24], [CombineMode.INTERSECT, 8], [CombineMode.EXCLUDE, 8],
        [CombineMode.COMPLEMENT, 8], [CombineMode.XOR, 16], [CombineMode.REPLACE, 16]
    ]) {
        let combined = GraphicsPath.combine(left, mode, right);
        check(area(combined) === expected, "Polygon clipping has incorrect area: " + mode);
        combined.dispose();
    }
    let empty = new GraphicsPath();
    for (let mode of [CombineMode.UNION, CombineMode.INTERSECT, CombineMode.EXCLUDE, CombineMode.XOR]) {
        check(GraphicsPath.combine(empty, mode, empty).isEmpty(), "Combining empty paths created geometry");
        let fromEmpty = GraphicsPath.combine(empty, mode, left);
        let toEmpty = GraphicsPath.combine(left, mode, empty);
        check(area(fromEmpty) === ([CombineMode.UNION, CombineMode.XOR].includes(mode) ? 16 : 0),
            "Empty subject set operation has incorrect area");
        check(area(toEmpty) === (mode === CombineMode.INTERSECT ? 0 : 16), "Empty clipping set operation has incorrect area");
    }
    let hole = new VertexList([], true);
    hole.addRectangle(1, 1, 2, 2);
    let donut = new GraphicsPath([...left.clone().getVertexLists(), hole]);
    let convertedDonut = Polygon.fromGraphicsPath(donut).toGraphicsPath();
    check(area(convertedDonut) === 12, "Polygon conversion lost a hole: " + JSON.stringify({
        area: area(convertedDonut),
        contours: convertedDonut.getVertexLists().map(vertices => ({hole: vertices.isHole(), points: vertices.getVertices()}))
    }));
    rejects(() => Polygon.getClipFunctionForMode(-1), /Unknown combine mode/);
    rejects(() => GraphicsPath.combine(left, -1, right), /Invalid enum/);
    rejects(() => left.addRectangle({}), /instance of Rectangle/);
    rejects(() => left.addEllipse({}), /instance of Rectangle/);
    rejects(() => left.transform({}), /instance of Matrix/);
    rejects(() => left.flatten({}, 1), /instance of Matrix/);
    rejects(() => left.addLines(null), /non-empty array/);
    rejects(() => left.addLines([{}]), /Point objects/);
    rejects(() => empty.closeFigure(), /No figure/);
    rejects(() => GraphicsPath.fromRegion({}), /instance of Region/);
    let none = GraphicsPath.fromRegion(Region.fromRectangles([]));
    check(none.isEmpty(), "Empty region acquired a path");
    rejects(() => GraphicsPath.pathFromStencil({}, new Rectangle()), /instance of BitVector2D/);
    let stencil = new BitVector2D(4, 4);
    check(stencil.isEmpty(), "Fresh stencil is not empty");
    stencil.clear(true);
    check(!stencil.isEmpty(), "Full stencil is empty");
    stencil.clear(false);
    stencil.setUnchecked(new Rectangle(1, 1, 2, 2), true);
    check(stencil.get(1, 1) === 1 && stencil.get(0, 0) === 0, "Rectangle stencil fill has wrong coordinates");
    for (let operation of ["get", "set", "invert"]) {
        for (let point of [[-1, 0], [4, 0], [0, -1], [0, 4]]) {
            rejects(() => stencil[operation](...point, true), /out of bounds/);
        }
    }
    rejects(() => stencil.setUnchecked({}, true), /instance of Rectangle/);
    rejects(() => stencil.invertScanline({}), /instance of Scanline/);
    let partial = GraphicsPath.pathFromStencil(stencil, new Rectangle(1, 1, 2, 2));
    check(partial.pixelStencil === null, "Partial stencil must not cache full-image pixel coverage");
    check(area(partial) === 4 && partial.getBounds().toString() === new Rectangle(1, 1, 2, 2).toString(), "Partial stencil escaped its tracing bounds");
    partial.dispose();
    check(stencil.isEmpty(), "Tracing must consume the selected stencil island");
    stencil.setUnchecked(new Rectangle(1, 1, 2, 2), true);
    let path = GraphicsPath.pathFromStencil(stencil, new Rectangle(0, 0, 4, 4));
    check(area(path) === 4, "Stencil contour has incorrect area");
    let clone = path.clone();
    check(clone.getPixelStencil(4, 4).get(1, 1) === 1, "Cloned path lost its exact stencil");
    check(clone.getPixelStencil(3, 4) === null && clone.getPixelStencil(4, 3) === null,
        "Stencil lookup ignored target dimensions");
    clone.reset();
    check(clone.isEmpty() && clone.getPixelStencil(4, 4) === null, "Path reset retained geometry or stencil");
    let multiple = GraphicsPath.fromRegion(Region.fromRectangles([new Rectangle(2, 3, 2, 2), new Rectangle(7, 8, 1, 1)]));
    check(area(multiple) === 5 && multiple.getBounds().x === 2 && multiple.getBounds().y === 3,
        "Region contour conversion lost disconnected islands or origin");

    phase("fractional viewport cache correctness and visible-only allocation");
    let source = document.createElement("canvas");
    source.width = 16;
    source.height = 12;
    source.getContext("2d").fillStyle = "red";
    source.getContext("2d").fillRect(0, 0, 16, 12);
    let target = document.createElement("canvas");
    target.width = 24;
    target.height = 20;
    let context = target.getContext("2d");
    ImageUtil.drawViewportImage(context, source, 0, 0, 16, 12, -10, -8, 40, 30, 1);
    let cache = ImageUtil.viewportScaleCaches.get(source);
    check(cache !== undefined && cache.canvas.width <= 16 * 3 && cache.canvas.height <= 12 * 3,
        "Fractional zoom allocated beyond its source footprint");
    let canvasCache = cache.canvas;
    let pixel = context.getImageData(10, 10, 1, 1).data;
    check(pixel[0] === 255 && pixel[3] === 255, "Fractional viewport scaling changed a constant color");
    ImageUtil.drawViewportImage(context, source, 0, 0, 16, 12, -10, -8, 40, 30, 1);
    check(ImageUtil.viewportScaleCaches.get(source).canvas === canvasCache, "Same viewport scale discarded its cached canvas");
    source.getContext("2d").fillStyle = "blue";
    source.getContext("2d").fillRect(0, 0, 16, 12);
    ImageUtil.drawViewportImage(context, source, 0, 0, 16, 12, -10, -8, 40, 30, 2);
    pixel = context.getImageData(10, 10, 1, 1).data;
    check(pixel[2] === 255 && pixel[0] === 0, "Viewport revision reused stale image pixels");
    context.clearRect(0, 0, 24, 20);
    ImageUtil.drawViewportImage(context, source, 0, 0, 16, 12, 100, 100, 40, 30, 2);
    check(context.getImageData(0, 0, 24, 20).data.every(value => value === 0), "Offscreen viewport drawing painted the target");
    for (let scale of [1, 2, 0.5]) {
        ImageUtil.drawViewportImage(context, source, 0, 0, 16, 12, 0, 0, 16 * scale, 12 * scale, 2);
        check(context.getImageData(1, 1, 1, 1).data[2] === 255, "Direct viewport scale lost blue pixels");
    }

    phase("native number stepping, keyboard modifiers and held-button repeat");
    let number = document.createElement("input");
    number.type = "number";
    number.min = "0";
    number.max = "10";
    number.step = "0.5";
    number.value = "5";
    let wrapper = NumberInput.wrap(number);
    wrapper.style.cssText = "position:fixed;left:100px;top:100px;z-index:10000;width:160px";
    document.body.appendChild(wrapper);
    check(NumberInput.wrap(number) === wrapper, "Number wrapper was not idempotent");
    rejects(() => NumberInput.wrap(document.createElement("div")), /input\[type=number\]/);
    let changes = 0;
    number.addEventListener("change", () => ++changes);
    check(NumberInput.stepInput(number, 1) && number.value === "5.5", "Numeric step did not respect its fraction");
    check(NumberInput.stepInput(number, -1) && number.value === "5", "Numeric decrement did not respect its fraction");
    number.value = "10";
    check(!NumberInput.stepInput(number, 1), "Numeric stepping exceeded its upper limit");
    for (let [key, options] of [["ArrowUp", {}], ["ArrowDown", {}], ["a", {}], ["ArrowUp", {ctrlKey: true}],
        ["ArrowUp", {altKey: true}], ["ArrowUp", {metaKey: true}], ["ArrowUp", {isComposing: true}]]) {
        let before = number.value;
        number.dispatchEvent(new KeyboardEvent("keydown", {key, ...options, bubbles: true, cancelable: true}));
        check(!Object.keys(options).length && key === "ArrowDown" ? Number(number.value) < Number(before) : true,
            "Arrow-down number stepping was ignored");
    }
    check(changes > 2, "Number stepping omitted change events");
    number.disabled = true;
    await new Promise(resolve => setTimeout(resolve, 0));
    check(wrapper.querySelector("button").disabled && !NumberInput.stepInput(number, 1), "Disabled number still stepped");
    number.disabled = false;
    number.readOnly = true;
    await new Promise(resolve => setTimeout(resolve, 0));
    check(wrapper.querySelector("button").disabled && !NumberInput.stepInput(number, -1), "Read-only number still stepped");
    number.readOnly = false;
    await frame();
    let custom = document.createElement("input");
    let directions = [];
    NumberInput.enableKeyboardStepping(custom, direction => directions.push(direction));
    custom.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp", cancelable: true}));
    check(directions[0] === 1, "Custom keyboard numeric step was ignored");
    let {ipcRenderer} = require("electron");
    number.value = "0";
    let up = wrapper.querySelector(".pdn-number-input-up");
    let bounds = up.getBoundingClientRect();
    let location = {x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2)};
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseDown", ...location, button: "left", clickCount: 1});
    await new Promise(resolve => setTimeout(resolve, 550));
    await ipcRenderer.invoke("paintdotjs:test-input", {type: "mouseUp", ...location, button: "left", clickCount: 1});
    check(Number(number.value) >= 1, "Held numeric button did not repeat");
    let stopped = number.value;
    await new Promise(resolve => setTimeout(resolve, 150));
    check(number.value === stopped, "Released numeric button retained its repeat timer");
    wrapper.remove();

    phase("concave stencil tracing preserves holes and islands through independent native rasterization");
    for (let rows of [
        ["111111", "100001", "101101", "101101", "100001", "111111"],
        ["110011", "110011", "111111", "111111", "110011", "110011"],
        ["111111", "110011", "110011", "110011", "111111", "111111"]
    ]) {
        let originalBits = rows.join("").split("").map(Number);
        let concaveStencil = new BitVector2D(6, 6);
        for (let y = 0; y < 6; ++y) {
            for (let x = 0; x < 6; ++x) {
                concaveStencil.set(x, y, originalBits[y * 6 + x] !== 0);
            }
        }
        let tracedPath = GraphicsPath.pathFromStencil(concaveStencil, new Rectangle(0, 0, 6, 6));
        let tracedSurface = Surface.create(6, 6);
        tracedSurface.context.fillStyle = "black";
        FillSelectionFunction.tracePath(tracedSurface.context, tracedPath);
        tracedSurface.context.fill("evenodd");
        let tracedPixels = tracedSurface.context.getImageData(0, 0, 6, 6).data;
        check(tracedPixels.every((value, index) => value === (index % 4 === 3 ? originalBits[Math.floor(index / 4)] * 255 : 0)),
            "Concave stencil tracing changed a hole, connected edge, or island: " + rows.join("/"));
        check(concaveStencil.isEmpty(), "Stencil tracing left unprocessed source pixels");
        tracedSurface.dispose();
        tracedPath.dispose();
    }
    phase("horizontal and vertical scroll-list drag swapping");
    for (let orientation of [ScrollOrientation.HORIZONTAL, ScrollOrientation.VERTICAL]) {
        let session = new ScrollSession();
        let list = new ScrollList(orientation, "runtimeScroll" + orientation, session);
        list.setScrollPosition(17);
        list.scrollToSelected();
        check(list.getScrollPosition() === 17 && list.selectedItem === null,
            "Unmounted list lost its saved scroll position or selected a nonexistent item");
        list.setScrollPosition(0);
        let host = document.createElement("div");
        host.style.cssText = "position:fixed;left:100px;top:150px;width:300px;height:150px;z-index:10000";
        let style = document.createElement("style");
        style.textContent = `#runtimeScroll${orientation}{width:300px;height:150px;overflow:auto}
            #runtimeScroll${orientation} .scroll-content{display:flex;flex-direction:${orientation === ScrollOrientation.HORIZONTAL ? "row" : "column"}}
            #runtimeScroll${orientation} .layer-item{flex:none;width:120px;height:60px}`;
        host.appendChild(style);
        document.body.appendChild(host);
        for (let index = 0; index < 6; ++index) {
            let layer = new BitmapLayer(workspace, 8, 8);
            layer.properties.name = "Layout " + index;
            list.add(new LayerItem(layer));
        }
        let readonlyItem = list.items[0];
        list.startPointerDrag(readonlyItem, {pointerId: 91});
        check(session.getDraggingItem() === null, "Read-only list began reordering without an item swapper");
        let selected = null;
        list.setSelectCallback(item => selected = item);
        list.setItemSwapper((first, second) => {
            let a = list.items.indexOf(first);
            let b = list.items.indexOf(second);
            [list.items[a], list.items[b]] = [list.items[b], list.items[a]];
            list.reinitialize();
        });
        list.appendTo(host, null);
        list.postInitialize();
        check(list.getScrollPosition() === 0 && list.isImplemented(), "New scroll list has a stale position");
        let first = list.items[0];
        let second = list.items[1];
        let coordinate = item => {
            let rect = item.getElement().getBoundingClientRect();
            return orientation === ScrollOrientation.HORIZONTAL ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        };
        let event = (value, buttons = 1) => ({pointerId: 91, button: 0, buttons,
            clientX: orientation === ScrollOrientation.HORIZONTAL ? value : 110,
            clientY: orientation === ScrollOrientation.VERTICAL ? value : 160, preventDefault() {}});
        first.getElement().dispatchEvent(new PointerEvent("pointerdown", {button: 2, bubbles: true}));
        first.getElement().querySelector("input").dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true}));
        check(session.getDraggingItem() === null, "Right click or visibility checkbox began dragging a row");
        let start = coordinate(first);
        first.getElement().dispatchEvent(new PointerEvent("pointerdown", {pointerId: 91, button: 0, buttons: 1,
            clientX: orientation === ScrollOrientation.HORIZONTAL ? start : 110,
            clientY: orientation === ScrollOrientation.VERTICAL ? start : 160, bubbles: true}));
        check(session.getDraggingItem() === first && session.dragPointerId === 91, "Scroll drag did not retain its item/pointer");
        list.continuePointerDrag(event(start + 1));
        check(!session.hasPassedDragThreshold(), "Tiny pointer movement started a reorder");
        list.continuePointerDrag(event(coordinate(second) + 10));
        check(list.items[1] === first && session.hasPassedDragThreshold(), "Forward drag did not swap adjacent items");
        list.continuePointerDrag(event(coordinate(list.items[0]) - 10));
        check(list.items[0] === first, "Reverse drag did not restore ordering");
        list.stopPointerDrag();
        check(session.getDraggingItem() === null && session.dragPointerId === null, "Drag completion retained global handlers");
        let originalSwapper = list.itemSwapper;
        let deferredSwaps = 0;
        list.setItemSwapper(() => { ++deferredSwaps; });
        list.startPointerDrag(first, event(coordinate(first)));
        list.continuePointerDrag(event(coordinate(second) + 10));
        list.continuePointerDrag(event(coordinate(second) + 12));
        check(deferredSwaps === 1 && session.dragSwapPending, "Pending asynchronous swap was requested twice");
        list.stopPointerDrag();
        list.setItemSwapper(originalSwapper);
        list.startPointerDrag(first, event(coordinate(first)));
        list.items.shift();
        list.continuePointerDrag(event(start + 10));
        check(session.getDraggingItem() === null && session.dragPointerId === null,
            "Removing a dragged row retained global drag listeners");
        list.items.unshift(first);
        list.reinitialize();
        list.setSelected(second);
        check(selected === second && list.selectedItem === second, "Scroll item selection did not notify");
        list.setScrollPosition(10);
        check(session.getScrollPosition() === list.getScrollPosition(), "Scroll session lost its position");
        list.autoScrollDuringDrag(0);
        list.autoScrollDuringDrag(10000);
        list.scrollToSelected();
        list.scrollToBottom();
        list.setScrollSpeed(2);
        list.element.dispatchEvent(new WheelEvent("wheel", {deltaY: -5, cancelable: true}));
        await new Promise(resolve => setTimeout(resolve, 110));
        list.setScrollPosition(0);
        let horizontalWheel = new WheelEvent("wheel", {deltaX: 5, cancelable: true});
        list.element.dispatchEvent(horizontalWheel);
        check(horizontalWheel.defaultPrevented, "A horizontal wheel with no vertical delta was not handled");
        let throttledWheel = new WheelEvent("wheel", {deltaX: 5, cancelable: true});
        list.element.dispatchEvent(throttledWheel);
        check(!throttledWheel.defaultPrevented, "A throttled wheel event suppressed browser handling");
        await new Promise(resolve => setTimeout(resolve, 110));
        list.setScrollPosition(0);
        let rejectedWheel = new WheelEvent("wheel", {deltaY: -1000, cancelable: true});
        list.element.dispatchEvent(rejectedWheel);
        check(!rejectedWheel.defaultPrevented && list.getScrollPosition() === 0,
            "Out-of-bounds wheel input prevented browser handling or scrolled outside the list");
        let bounds = list.element.getBoundingClientRect();
        let center = orientation === ScrollOrientation.HORIZONTAL ? (bounds.left + bounds.right) / 2
            : (bounds.top + bounds.bottom) / 2;
        list.autoScrollDuringDrag(center);
        check(list.getScrollPosition() === 0, "Dragging through the center caused edge auto-scrolling");
        list.scrollSession.cacheItemPosition("obsolete", 42);
        list.postInitialize();
        check(session.getItemPosition("obsolete") === null, "Scroll list retained a removed item-position cache");
        list.startPointerDrag(first, event(coordinate(first)));
        list.continuePointerDrag(event(coordinate(first) + 10, 0));
        check(session.getDraggingItem() === null, "Lost mouse button did not end scrolling drag");
        list.startPointerDrag(first, event(coordinate(first)));
        window.dispatchEvent(new Event("blur"));
        check(session.getDraggingItem() === null, "Window blur retained a scrolling drag");
        for (let item of list.items) {
            item.layer.dispose();
        }
        host.remove();
    }
    phase("lists tolerate non-draggable items without stable keys");
    let mixedHost = document.createElement("div");
    document.body.appendChild(mixedHost);
    let mixedSession = new ScrollSession();
    let mixed = new ScrollList(ScrollOrientation.VERTICAL, "runtimeMixedList", mixedSession);
    let keylessItem = new MenuItem("runtimeStaticListLabel");
    let keyedItem = new LayerItem(workspace.getActiveLayer());
    mixed.add(keylessItem);
    mixed.add(keyedItem);
    mixed.setItemSwapper(() => {});
    mixed.appendTo(mixedHost, null);
    let diagnostics = [];
    let originalConsoleError = console.error;
    try {
        console.error = message => diagnostics.push(message);
        mixed.postInitialize();
        mixed.scrollToItem(keylessItem);
        await frame();
        check(diagnostics.length === 2 && diagnostics.every(message => message === "Item does not have a getKey function"),
            "Non-keyed items did not report their unsupported positioning contract");
    } finally {
        console.error = originalConsoleError;
    }
    check(keylessItem.getElement().isConnected && mixedSession.getItemPosition(keyedItem.getKey()) !== null,
        "Non-keyed row prevented keyed rows from initializing");
    mixed.startPointerDrag(keylessItem, {pointerId: 92, clientX: 0, clientY: 0});
    check(mixedSession.getDraggingItem() === null, "A row without a stable key began a drag");
    mixed.startPointerDrag(keyedItem, {pointerId: 92, clientX: 0, clientY: 0});
    check(mixed.getCurrentDraggingItem() === keyedItem, "Non-keyed row interrupted lookup of the dragged row");
    mixed.scrollToItem(keyedItem);
    await frame();
    mixed.stopPointerDrag();
    mixedHost.remove();
    phase("actual layer-list reordering records reversible document history");
    let layerForm = FormRegistry.get("layerForm");
    let bottomLayer = workspace.getActiveLayer();
    let topLayer = Layer.createLayer(workspace, bottomLayer.getWidth(), bottomLayer.getHeight(), "Reorder second layer");
    workspace.getDocument().addLayer(topLayer);
    await frame();
    workspace.getHistory().clearAll();
    let layerItems = layerForm.layerListItem.items;
    let firstLayerItem = layerItems.find(item => item.getLayer() === bottomLayer);
    let secondLayerItem = layerItems.find(item => item.getLayer() === topLayer);
    layerForm.layerListItem.itemSwapper(firstLayerItem, secondLayerItem);
    check(workspace.getDocument().getLayers().getAt(0) === topLayer
        && workspace.getDocument().getLayers().getAt(1) === bottomLayer,
        "Layer drag callback did not reorder actual document layers");
    workspace.getHistory().stepBackward();
    check(workspace.getDocument().getLayers().getAt(0) === bottomLayer
        && workspace.getDocument().getLayers().getAt(1) === topLayer,
        "Undo did not restore layer ordering");
    let unmountedRow = new LayerItem(bottomLayer);
    unmountedRow.renderThumbnail();
    check(unmountedRow.thumbnail === null, "Unmounted layer row allocated a thumbnail during refresh");
    left.dispose();
    right.dispose();
    donut.dispose();
    path.dispose();
    clone.dispose();
    multiple.dispose();
    none.dispose();
    app.closeDocumentWorkspace(workspace, false);
    let unmountedForm = new LayerForm();
    check(unmountedForm.getItemByLayer(bottomLayer) === null, "Unmounted layer form unexpectedly contained rows");
    let swapWithoutDocument = layerForm.layerListItem.itemSwapper;
    swapWithoutDocument(firstLayerItem, secondLayerItem);
    layerForm.openLayerProperties(firstLayerItem);
    check(app.getActiveDocumentWorkspace() === null && !ModalDialogController.isActive(),
        "Layer callbacks without a document opened a dialog or created a document");
};
