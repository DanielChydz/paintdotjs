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

const fs = require("node:fs/promises");
const path = require("node:path");
const terser = require("terser");
const CleanCSS = require("clean-css");

class DesktopPayload {
    async prepare(root, output) {
        for (let relative of ["js", "lib", "css", "scripts/resource/AssetCatalog.js"]) {
            await this.copy(path.join(root, relative), path.join(output, relative));
        }
    }

    async copy(source, destination) {
        let stat = await fs.stat(source);
        if (stat.isDirectory()) {
            if (source.endsWith(path.join("lib", "codecs"))) {
                // Codec modules are already included in the webpack output.
                return;
            }
            for (let name of await fs.readdir(source)) {
                await this.copy(path.join(source, name), path.join(destination, name));
            }
            return;
        }
        await fs.mkdir(path.dirname(destination), {recursive: true});
        if (source.endsWith(".js")) {
            let minified = await terser.minify(await fs.readFile(source, "utf8"), {
                // Globals and names form part of the plugin/worker contracts.
                toplevel: false,
                keep_classnames: true,
                keep_fnames: true,
                compress: {keep_fargs: true, directives: false},
                mangle: {toplevel: false},
                format: {comments: /!|@license|@preserve|copyright|licensed|paint\.js/i}
            });
            await fs.writeFile(destination, minified.code + "\n");
        } else if (source.endsWith(".css")) {
            let minified = new CleanCSS({level: 1, rebase: false,
                format: {breakWith: "lf"}}).minify(await fs.readFile(source, "utf8"));
            if (minified.errors.length > 0) {
                throw new Error(minified.errors.join("\n"));
            }
            await fs.writeFile(destination, minified.styles + "\n");
        } else {
            await fs.copyFile(source, destination);
        }
    }
}

module.exports = DesktopPayload;
