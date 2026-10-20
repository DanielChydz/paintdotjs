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
const fs = require("node:fs/promises");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {setTimeout: delay} = require("node:timers/promises");

class FirefoxFileClipboardChecks {
    constructor(firefox) {
        this.firefox = firefox;
    }

    async inputFile(filename) {
        let element = await this.firefox.find("input[type=file]");
        await this.firefox.request("POST", "/element/" + element + "/value", {text: filename});
        await this.firefox.waitFor("!document.querySelector('input[type=file]')");
    }

    async downloaded(name) {
        let file = path.join(this.firefox.downloads, name);
        let deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            try {
                let bytes = await fs.readFile(file);
                if (bytes.length > 0) {
                    return bytes;
                }
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }
            await delay(50);
        }
        throw new Error("Firefox did not download " + name);
    }

    async checkFiles() {
        let firefox = this.firefox;
        await firefox.evaluate(`
            AboutDialog.instance?.close();app.setActiveTool(null);
            for(let workspace of [...app.getDocumentWorkspaces()]){app.closeDocumentWorkspace(workspace,false);}
            RecentFilesStore.clear();
        `);
        let png = await firefox.evaluate(`(()=>{
            let canvas=document.createElement('canvas');canvas.width=2;canvas.height=1;
            canvas.getContext('2d').fillStyle='rgb(230,30,50)';canvas.getContext('2d').fillRect(0,0,2,1);
            return canvas.toDataURL('image/png').split(',')[1];
        })()`);
        this.image = path.join(firefox.directory, "firefox-input.png");
        let second = path.join(firefox.directory, "second.png");
        await fs.writeFile(this.image, Buffer.from(png, "base64"));
        await fs.copyFile(this.image, second);
        await firefox.evaluate("DocumentIO.openFilePicker()");
        await this.inputFile(this.image + "\n" + second);
        assert.equal(await firefox.evaluate("app.getDocumentWorkspaces().length"), 2);
        assert.equal(await firefox.evaluate("app.getActiveDocumentWorkspace().fileHandle"), null);
        assert.equal(await firefox.evaluate("RecentFilesStore.entries.length"), 0);
        await firefox.evaluate("DocumentIO.openFilePicker();document.querySelector('input[type=file]').dispatchEvent(new Event('cancel'))");
        assert.equal(await firefox.evaluate("document.querySelectorAll('input[type=file]').length"), 0);
        await firefox.evaluate(`
            app.getActiveDocumentWorkspace().setFileInfo('firefox-roundtrip.png',null,null,'png',{});
            app.getActiveDocumentWorkspace().setDirty(true);
            DocumentIO.saveActive();
        `);
        let saved = await this.downloaded("firefox-roundtrip.png");
        assert.deepEqual([...saved.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(await firefox.evaluate("app.getActiveDocumentWorkspace().isDirty()"), false);
        await firefox.evaluate("DocumentIO.openLayerFilePicker()");
        await this.inputFile(second);
        assert.equal(await firefox.evaluate("app.getActiveDocumentWorkspace().getDocument().getLayers().getLayerCount()"), 2);
        await firefox.evaluate(`
            app.getActiveDocumentWorkspace().setFileInfo('firefox-layers.pdn',null,null,'pdn',{});
            DocumentIO.saveActive();
        `);
        let pdn = await this.downloaded("firefox-layers.pdn");
        assert.deepEqual([...pdn.subarray(0, 3)], [80, 68, 78]);
        let pdnPath = path.join(firefox.downloads, "firefox-layers.pdn");
        await firefox.evaluate("DocumentIO.openFilePicker()");
        await this.inputFile(pdnPath);
        assert.equal(await firefox.evaluate("app.getActiveDocumentWorkspace().getDocument().getLayers().getLayerCount()"), 2);
    }

    setClipboard(file, type) {
        let result = spawnSync("xclip", ["-selection", "clipboard", "-t", type, "-i", file], {stdio: "ignore"});
        assert.equal(result.status, 0, "Could not populate the isolated X11 clipboard");
    }

    async checkClipboard() {
        let firefox = this.firefox;
        await firefox.evaluate(`
            app.setActiveTool(null);
            for(let workspace of [...app.getDocumentWorkspaces()]){app.closeDocumentWorkspace(workspace,false);}
            app.createBlankDocumentInNewWorkspace(4,4);DocumentIO.internalClipboard=null;
            window.firefoxPasteCount=0;
            window.firefoxPasteBlob=DocumentIO.pasteBlob;
            DocumentIO.pasteBlob=async function(blob){++window.firefoxPasteCount;return window.firefoxPasteBlob.call(this,blob);};
            document.activeElement.blur();
        `);
        this.setClipboard(this.image, "image/png");
        await firefox.chord("v");
        await firefox.waitFor("window.firefoxPasteCount===1 && app.getActiveTool() instanceof MoveTool");
        await firefox.evaluate("DocumentIO.finishActiveTool(false)");
        assert.equal(await firefox.evaluate(`(()=>{
            let workspace=app.getActiveDocumentWorkspace();
            let data=workspace.getActiveLayer().getSurface().context.getImageData(0,0,4,4).data;
            return data.some((value,index)=>index%4===0&&value===230&&data[index+1]===30);
        })()`), true);
        await delay(250);
        assert.equal(await firefox.evaluate("window.firefoxPasteCount"), 1, "Native paste imported twice");
        await firefox.evaluate(`
            app.getActiveDocumentWorkspace().getSelection().setContinuation(new Rectangle(0,0,2,1),CombineMode.REPLACE);
            DocumentIO.internalClipboard=null;
        `);
        await firefox.chord("c");
        await firefox.waitFor("DocumentIO.internalClipboard!==null");
        let copied = spawnSync("xclip", ["-selection", "clipboard", "-o", "-t", "image/png"], {timeout: 5000});
        assert.equal(copied.status, 0, "Firefox Ctrl+C did not write an OS image");
        assert.deepEqual([...copied.stdout.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        await firefox.chord("v");
        await firefox.waitFor("window.firefoxPasteCount===2");
        await firefox.evaluate("DocumentIO.finishActiveTool(false)");
        await firefox.evaluate(`
            let input=document.createElement('textarea');input.id='firefox-text';document.body.appendChild(input);input.focus();
        `);
        this.setClipboard(this.image, "image/png");
        await firefox.chord("v");
        await delay(100);
        assert.equal(await firefox.evaluate("window.firefoxPasteCount"), 2, "Text field paste modified the image");
        let text = path.join(firefox.directory, "clipboard.txt");
        await fs.writeFile(text, "firefox-native-text");
        this.setClipboard(text, "UTF8_STRING");
        await firefox.chord("v");
        assert.equal(await firefox.evaluate("document.querySelector('#firefox-text').value"), "firefox-native-text");
        await firefox.evaluate(`
            document.querySelector('#firefox-text').remove();
            DocumentIO.pasteBlob=window.firefoxPasteBlob;
            app.getDocumentWorkspaces().forEach(workspace=>workspace.setDirty(false));
        `);
    }
}

module.exports = FirefoxFileClipboardChecks;
