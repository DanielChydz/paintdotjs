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

// Independent NRBF interoperability schema. These are type/member names and
// primitive values, not artwork, translated strings, or extracted resource data.
class PdnObjectGraph {
    static WIDTH = 8291;
    static HEIGHT = 8293;

    static create(layerCount, options = {}) {
        if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 65535) {
            throw new Error("PDN templates support 1 to 65535 layers");
        }
        let library = name => "PaintDotNet." + name
            + ", Version=5.112.9563.32325, Culture=neutral, PublicKeyToken=null";
        let object = (typeName, members, memberTypes = {}, assembly = "Data") => ({
            typeName, libraryName: library(assembly), members, memberTypes
        });
        let system = (typeName, members, memberTypes) => ({typeName, members, memberTypes});
        let stringType = "System.String, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
        let metadata = {arrayType: 0, lengths: [0], elementBinaryType: 3,
            elementClassName: "System.Collections.Generic.KeyValuePair`2[[" + stringType + "],[" + stringType + "]]",
            elements: []};
        let width = options.width ?? this.WIDTH;
        let height = options.height ?? this.HEIGHT;
        let makeMetadata = entries => ({...metadata, lengths: [entries.length],
            elements: entries.map(entry => system(metadata.elementClassName,
                {key: entry.key, value: entry.value}, {}))});
        let root = object("PaintDotNet.Document", {}, {isDisposed: 1, width: 8, height: 8});
        let layers = [];
        for (let index = 0; index < layerCount; ++index) {
            let properties = object("PaintDotNet.Layer+LayerProperties", {
                name: "PDJ_LAYER_" + String(index).padStart(4, "0"),
                userMetadataItems: metadata, visible: true, isBackground: false, opacity: 255,
                blendMode: object("PaintDotNet.LayerBlendMode", {value__: 0}, {value__: 8})
            }, {visible: 1, isBackground: 1, opacity: 2});
            if (options.layers !== undefined) {
                let saved = options.layers[index];
                Object.assign(properties.members, saved);
                properties.members.userMetadataItems = makeMetadata(saved.userMetadataItems);
                properties.members.blendMode = object("PaintDotNet.LayerBlendMode", {value__: saved.blendMode}, {value__: 8});
            }
            layers.push(object("PaintDotNet.BitmapLayer", {
                properties: object("PaintDotNet.BitmapLayer+BitmapLayerProperties", {
                    blendOp: object("PaintDotNet.UserBlendOps+NormalBlendOp", {})
                }),
                surface: object("PaintDotNet.Surface", {
                    width, height, stride: width * 4,
                    scan0: object("PaintDotNet.MemoryBlock", {
                        length64: BigInt(width) * BigInt(height) * 4n,
                        hasParent: false, deferred: true
                    }, {length64: 9, hasParent: 1, deferred: 1}, "Core")
                }, {width: 8, height: 8, stride: 8}, "Core"),
                "Layer+isDisposed": false, "Layer+width": width,
                "Layer+height": height, "Layer+properties": properties
            }, {"Layer+isDisposed": 1, "Layer+width": 8, "Layer+height": 8}));
        }
        // Declare the shared typed empty metadata array before layer properties
        // reference it. No metadata or pixel data from an external app is used.
        root.members = {userMetadataItems: options.metadata === undefined ? metadata : makeMetadata(options.metadata), isDisposed: false,
            layers: object("PaintDotNet.LayerList", {parent: root,
                "ArrayList+_items": layers, "ArrayList+_size": layerCount,
                "ArrayList+_version": 1}, {"ArrayList+_size": 8, "ArrayList+_version": 8}),
            width, height,
            savedWith: system("System.Version", {_Major: 0, _Minor: 0, _Build: 0, _Revision: 0},
                {_Major: 8, _Minor: 8, _Build: 8, _Revision: 8})};
        return root;
    }
}

module.exports = PdnObjectGraph;
