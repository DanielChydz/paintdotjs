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

class AppFile extends File {

    async exists() {
        try {
            await require("node:fs/promises").access(this.getPath());
            return true;
        } catch (error) {
            if (error.code === "ENOENT" || error.code === "ENOTDIR") {
                return false;
            }
            throw error;
        }
    }

}
