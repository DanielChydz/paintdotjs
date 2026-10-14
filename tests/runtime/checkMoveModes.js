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

module.exports = async function checkMoveModes() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let phase = name => require("electron").ipcRenderer.send("paintdotjs:test-phase", name);
    let same = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    for (let workspace of [...app.getDocumentWorkspaces()]) {
        app.closeDocumentWorkspace(workspace, false);
    }
    ToolType.MOVE.setSetting("resampling", "nearest");
    ToolType.MOVE.setSetting("renderingQuality", "aliased");
    for (let [mode, start, end, rectangle, button] of [
        [MoveToolBaseMode.SCALE, [50, 48], [70, 48], [30, 40, 40, 16], MouseButton.LEFT],
        [MoveToolBaseMode.ROTATE, [50, 48], [40, 58], [32, 38, 16, 20], MouseButton.RIGHT]
    ]) {
        phase("pixel Move " + mode + " preserves exact nearest-neighbor output and history");
        let workspace = app.createBlankDocumentInNewWorkspace(128, 128);
        app.setActiveTool(null);
        workspace.setZoom(1);
        let surface = workspace.getActiveLayer().getSurface();
        surface.clear();
        surface.context.fillStyle = "red";
        surface.context.fillRect(30, 40, 20, 16);
        let original = surface.context.getImageData(0, 0, 128, 128).data;
        let selection = workspace.getSelection();
        selection.setContinuation(new Rectangle(30, 40, 20, 16), CombineMode.REPLACE);
        selection.commitContinuation();
        let history = workspace.getHistory();
        history.clearAll();
        history.pushNewMemento(new NullHistoryMemento("Original", "assets/icons/menu_file_new_icon.png"));
        app.setActiveToolFromType(ToolType.MOVE);
        let move = app.getActiveTool();
        move.onMouseDown(...start, button);
        check(move.context.currentMode === mode, "Pixel Move did not begin its requested transform mode");
        move.onMouseMove(...end);
        move.onMouseUp(...end, button);
        let expected = new Uint8ClampedArray(128 * 128 * 4);
        for (let y = rectangle[1]; y < rectangle[1] + rectangle[3]; ++y) {
            for (let x = rectangle[0]; x < rectangle[0] + rectangle[2]; ++x) {
                expected.set([255, 0, 0, 255], (y * 128 + x) * 4);
            }
        }
        let transformed = surface.context.getImageData(0, 0, 128, 128).data;
        check(same(transformed, expected), "Pixel Move preview differs from the independent integer transform: " + mode);
        let finish = PanelRegistry.get("toolMenu").createActionControl({label: "Finish", icon: "tool_strip_checked.png"});
        finish.click();
        check(!move.context.lifted && same(surface.context.getImageData(0, 0, 128, 128).data, expected),
            "Toolbar Finish did not commit the transformed bitmap: " + mode);
        let steps = history.undoStack.length - 1;
        for (let index = 0; index < steps; ++index) {
            history.stepBackward();
        }
        check(same(surface.context.getImageData(0, 0, 128, 128).data, original), "Transform undo lost original pixels: " + mode);
        DocumentIO.finishActiveTool(false);
        for (let index = 0; index < steps; ++index) {
            history.stepForward();
        }
        check(same(surface.context.getImageData(0, 0, 128, 128).data, expected), "Transform redo lost its output pixels: " + mode);
        app.closeDocumentWorkspace(workspace, false);
    }
};
