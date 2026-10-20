# Asset sources

Upstream integration: additional bundled font families and their colocated licenses
were imported from LabyStudio/paintdotjs commit b4e6fc5 (2.4.3). See
`assets/font/README.md` and each family's `LICENSE.txt`. The supplied desktop icon
and independently generated PDN templates are preserved.

Desktop application icon: created by [TetratheBecherovka](https://github.com/TetratheBecherovka)
and offered in [upstream issue #7](https://github.com/LabyStudio/paintdotjs/issues/7).
User-selected image, downloaded unchanged from
https://github.com/user-attachments/assets/6ad3bc51-1684-4d19-aa44-7a2881907f3c
on 2026-10-16. The original PNG is retained as `artwork/desktop-icon.png` and
copied unchanged to `assets/desktop-icon.png` and `desktop-resources/icon.png`.
SHA-256: 33b3932e1f570394514f564937530c89fe0c3a6fd68964d682f8cecbc4011504.
This is a supplied image, not artwork authored by this project. The web mark and
document mark described below remain separate assets.

UI icons, images and cursors: the new default pack from upstream paint.js,
https://github.com/LabyStudio/paintdotjs/tree/b4e6fc5dc2271170d396c195443022ed8d9ba66b/assets
The upstream README identifies these as its AI-generated replacement artwork,
not Paint.NET resource extractions. All 279 files are copied unchanged from that
commit. Upstream LICENSE.md is retained verbatim in
`assets/licenses/paintjs-icons-LICENSE.txt`. `artwork/upstream-icons.json` pins the
commit and SHA-256 of every file. The generic effect fallback is a byte-identical
alias of upstream glow_effect.png; its mapping is recorded there as well.
The previous Lucide vendor sources and generated UI pack have been removed.

UI font: Inter variable, SIL Open Font License 1.1; losslessly repackaged as WOFF2.
https://github.com/google/fonts/tree/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/inter
License: assets/licenses/Inter-OFL.txt. Original TTF SHA-256: 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031

The application mark, document mark, sample document, repository banner and English
interface dictionary are authored for this project and distributed under its MIT
license. None is traced from or extracted from Paint.NET artwork or resources.
Generated PNGs and ICOs are checked in: builds and application startup need no asset
downloads or image conversion tools. See scripts/generate_artwork.py for regeneration.

## PDN format interoperability

`assets/pdn/templates/*.bin` are independently generated NRBF graphs, not extracted
Paint.NET resources. Run `node scripts/generate_pdn_templates.js` with the pinned
MIT-licensed ms-nrbf-js dependency. The schema is explicit in
`scripts/resource/PdnTemplateFactory.js`; class/member names identify the file
format's CLR serialization contract. Empty metadata and deferred pixel blocks are
constructed from scratch. No original application binaries, resource archives,
artwork or translation dictionaries are inputs to the generator.

Bundled fonts are stored in WOFF2 containers, preserving complete SFNT tables
(except empty digital signatures and container checksum/flag updates). Original
TTF hashes are pinned in `artwork/fonts.json`; see `assets/font/README.md` for
offline regeneration and round-trip verification. Duplicate Inter TTFs were
consolidated into `assets/font/inter/Inter-Variable.woff2`.

Move and rotation cursors (`assets/cursors/{move,rotate}_tool_cursor.png`) are
original vector artwork under the project MIT license. Sources are retained in
`artwork/*_tool_cursor.svg`; `scripts/generate_artwork.py` rasterizes them to 32px.
They contain no Paint.NET artwork.

## Working ICC profile

`assets/profiles/sRGB.icc` is generated with Little CMS through Pillow's
`ImageCms.createProfile("sRGB")`. Its embedded copyright is "No copyright, use freely".
It contains standard sRGB colorimetry, without Paint.NET data or assets.
