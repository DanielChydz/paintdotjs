# paint.js attribution notice

paint.js is an unofficial JavaScript port of Paint.NET 3.36.7. The JavaScript port and its
port-specific changes have been developed and maintained by
[LabyStudio](https://github.com/LabyStudio).

The original Paint.NET source is Copyright (C) dotPDN LLC, Rick Brewster, and contributors.
Paint.NET was created by Rick Brewster. The paint.js interface design and behavior target Paint.NET
5.1.12+.

paint.js is not affiliated with or endorsed by dotPDN LLC or Paint.NET. Paint.NET names, artwork,
resources, and other applicable materials remain subject to their respective copyright and license
terms. See [LICENSE.md](LICENSE.md) for the complete licensing terms and inherited exceptions.

Copies or substantial portions of paint.js must retain the applicable copyright, license, and
attribution notices.

## Bundled interface assets

The desktop application logo was created by
[TetratheBecherovka](https://github.com/TetratheBecherovka) and shared in
[upstream issue #7](https://github.com/LabyStudio/paintdotjs/issues/7).
Its provenance is recorded in `artwork/SOURCES.md`; it is separate from the
project's original web mark and is not claimed as artwork authored by this fork.

The application does not distribute or download Paint.NET logo artwork, toolbar
icons, cursors, fonts or translation resource files. The original source-code
attribution above does not grant permission to use Paint.NET artwork.

- Upstream paint.js default interface icons and cursors: Copyright LabyStudio,
  vendored unchanged from commit b4e6fc5. Upstream license and attribution retained
  in `assets/licenses/paintjs-icons-LICENSE.txt`; provenance and hashes are in
  `artwork/upstream-icons.json`.
- Inter variable font: Copyright 2020 The Inter Project Authors. SIL Open Font
  License 1.1, included in `assets/licenses/Inter-OFL.txt`.
- Original paint.js pixel-ribbon mark, document mark, sample artwork and
  English labels: Copyright 2026 paint.js contributors, MIT license.

Sources, pinned revisions and asset provenance are recorded in `artwork/SOURCES.md`.
Legacy resource identifiers are retained for code compatibility; the corresponding
images are new artwork, not Paint.NET assets. No endorsement by the icon or font
projects is implied.

paint.js includes third-party fonts whose bundled selection may change between releases. Each font
family is stored in its own directory under [`assets/font/`](assets/font/) together with its
applicable `LICENSE.txt`. Those colocated license files are the authoritative copyright and license
notices for the fonts distributed with a particular release.

## Bundled image codecs

- libheif 1.23.6, Copyright Dirk Farin and contributors: LGPL-3.0, complete
  license in `assets/licenses/libheif-COPYING.txt`.
- Kvazaar 2.3.2, Copyright the Kvazaar authors: BSD-3-Clause, license in
  `assets/licenses/kvazaar-LICENSE.txt`.
- Microsoft JPEG XR Porting Kit (jxrlib), Glencoe revision
  `19cc1fa19ca6607449d210aea946b3187f808f2c`: Copyright Microsoft Corporation,
  permissive license in `assets/licenses/jxrlib-LICENSE.txt`.

These codecs are separate WebAssembly modules. Exact corresponding source
archives, checksums, upstream documentation and rebuild/replacement instructions
are provided in `scripts/codecs/sources.json` and `docs/image-encoders.md`.

Bundled codec and archive JavaScript is compiled into the web bundle rather than
installed a second time as Node packages. Its notices are retained in
`assets/licenses/{magick-wasm,fflate,buffer,base64-js,ieee754,ms-nrbf-js}-*.txt`.
