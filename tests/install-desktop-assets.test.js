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

const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {test} = require("node:test");
const AssetCatalog = require("../scripts/resource/AssetCatalog");
const {generateAssetManifest} = require("../scripts/generate_asset_manifest");
const {installAssets} = require("../scripts/install_desktop_assets");

test("bundled assets carry open provenance, checked licenses and no proprietary font", () => {
    let root = path.resolve(__dirname, "..");
    let manifest = require("../desktop-resources/asset-manifest.json");
    assert.equal(AssetCatalog.verify(path.join(root, "assets"), manifest), path.join(root, "assets"));
    for (let relative of ["font/Inter.ttf", "licenses/Inter-OFL.txt", "licenses/paintjs-icons-LICENSE.txt", "icon.png", "icon.ico"]) {
        assert.equal(typeof manifest.files[relative], "string");
    }
    assert.equal(fs.existsSync(path.join(root, "assets/font/segoe_ui.ttf")), false);
    let provenance = require("../artwork/upstream-icons.json");
    for (let [relative, hash] of Object.entries(provenance.files)) {
        assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "assets", relative))).digest("hex"), hash,
            "Upstream artwork changed: " + relative);
    }
    for (let [alias, target] of Object.entries(provenance.aliases)) {
        assert.deepEqual(fs.readFileSync(path.join(root, "assets", alias)), fs.readFileSync(path.join(root, "assets", target)));
    }
    assert.equal(fs.existsSync(path.join(root, "artwork/lucide")), false);
    assert.match(fs.readFileSync(path.join(root, "assets/licenses/Inter-OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE/);
    assert.match(fs.readFileSync(path.join(root, "assets/licenses/paintjs-icons-LICENSE.txt"), "utf8"), /MIT License/);
});

test("offline asset installation rejects legacy and damaged assets before copying", t => {
    let directory = fs.mkdtempSync(path.join(os.tmpdir(), "paintjs-open-assets-"));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    let source = path.join(directory, "source");
    let output = path.join(directory, "output");
    fs.mkdirSync(path.join(source, "icons"), {recursive: true});
    fs.writeFileSync(path.join(source, "icons/own.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    let manifestPath = path.join(directory, "manifest.json");
    assert.equal(generateAssetManifest({source, output: manifestPath}), 1);
    let manifest = JSON.parse(fs.readFileSync(manifestPath));
    assert.deepEqual(installAssets({source, output, manifestPath}), {assetCount: 1});
    assert.equal(fs.readFileSync(path.join(output, "icons/own.svg"), "utf8"), fs.readFileSync(path.join(source, "icons/own.svg"), "utf8"));
    assert.throws(() => AssetCatalog.verify(source, {...manifest, assetSet: "legacy-extracted-assets"}), /Unsupported asset provenance/);
    fs.writeFileSync(path.join(source, "icons/own.svg"), "corrupted");
    assert.throws(() => installAssets({source, output, manifestPath}), /checksum mismatch/);
    fs.unlinkSync(path.join(source, "icons/own.svg"));
    assert.throws(() => AssetCatalog.verify(source, manifest), /ENOENT/);
});
