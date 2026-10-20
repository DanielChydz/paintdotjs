# Bundled fonts

These fonts are bundled as defaults for the paint.js Text tool. Each family is
stored in its own folder with its complete `LICENSE.txt`. The font files retain all upstream glyphs, metrics, hinting and variable axes,
and remain under their own licenses. TTF containers were converted losslessly
to WOFF2 without subsetting or outline transforms. Empty SFNT signature tables
are omitted by WOFF2; no signed font data is discarded.

| Family | File | License |
| --- | --- | --- |
| Noto Sans | `noto-sans/NotoSans-Regular.woff2` | SIL Open Font License 1.1 |
| Inter | `inter/Inter-Variable.woff2` | SIL Open Font License 1.1 |
| Atkinson Hyperlegible | `atkinson-hyperlegible/AtkinsonHyperlegible-Regular.woff2` | SIL Open Font License 1.1 |
| Lato | `lato/Lato-Regular.woff2` | SIL Open Font License 1.1 |
| Montserrat | `montserrat/Montserrat-Variable.woff2` | SIL Open Font License 1.1 |
| Open Sans | `open-sans/OpenSans-Variable.woff2` | SIL Open Font License 1.1 |
| Raleway | `raleway/Raleway-Variable.woff2` | SIL Open Font License 1.1 |
| Source Sans 3 | `source-sans-3/SourceSans3-Variable.woff2` | SIL Open Font License 1.1 |
| Noto Serif | `noto-serif/NotoSerif-Regular.woff2` | SIL Open Font License 1.1 |
| Roboto Slab | `roboto-slab/RobotoSlab-Variable.woff2` | Apache License 2.0 |
| Playfair Display | `playfair-display/PlayfairDisplay-Variable.woff2` | SIL Open Font License 1.1 |
| Merriweather | `merriweather/Merriweather-Variable.woff2` | SIL Open Font License 1.1 |
| Libre Baskerville | `libre-baskerville/LibreBaskerville-Variable.woff2` | SIL Open Font License 1.1 |
| Source Serif 4 | `source-serif-4/SourceSerif4-Variable.woff2` | SIL Open Font License 1.1 |
| Cinzel | `cinzel/Cinzel-Variable.woff2` | SIL Open Font License 1.1 |
| Oswald | `oswald/Oswald-Variable.woff2` | SIL Open Font License 1.1 |
| Bebas Neue | `bebas-neue/BebasNeue-Regular.woff2` | SIL Open Font License 1.1 |
| Caveat | `caveat/Caveat-Variable.woff2` | SIL Open Font License 1.1 |
| Pacifico | `pacifico/Pacifico-Regular.woff2` | SIL Open Font License 1.1 |
| Dancing Script | `dancing-script/DancingScript-Variable.woff2` | SIL Open Font License 1.1 |
| Comic Neue | `comic-neue/ComicNeue-Regular.woff2` | SIL Open Font License 1.1 |
| Noto Sans Mono | `noto-sans-mono/NotoSansMono-Regular.woff2` | SIL Open Font License 1.1 |
| JetBrains Mono | `jetbrains-mono/JetBrainsMono-Variable.woff2` | SIL Open Font License 1.1 |
| Inconsolata | `inconsolata/Inconsolata-Variable.woff2` | SIL Open Font License 1.1 |

Noto fonts come from the [Noto Fonts repository](https://github.com/notofonts/noto-fonts).
Atkinson Hyperlegible comes from its [Google Fonts project](https://github.com/googlefonts/atkinson-hyperlegible).
The remaining fonts come from their official upstream releases or the
[Google Fonts repository](https://github.com/google/fonts).

The SIL Open Font License permits fonts to be bundled and redistributed with
software. Those fonts may not be sold by themselves, and modified versions
must follow the license's naming and redistribution conditions. Roboto Slab is
redistributed under the Apache License 2.0.

Segoe UI remains in CSS fallback stacks so Windows can use its installed system
copy. The Segoe UI font file is not distributed with paint.js.

Regenerate with `python scripts/compress_fonts.py` after installing
`scripts/fonts/requirements.txt` in a virtual environment. Verify every decoded
SFNT table with `python scripts/compress_fonts.py --check`. Source hashes and the
original repository revision are pinned in `artwork/fonts.json`; regeneration
reads that revision from local Git or accepts `--source DIR` containing the
original `assets/font` tree. Normal builds require no Python or font downloads.
