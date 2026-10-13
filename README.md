![header.png](.github/assets/header.png)

**paint.js** is an unofficial, proof-of-concept, cross-platform **JavaScript** port of the Windows only
raster graphics editor **Paint.NET** by [Rick Brewster](https://www.getpaint.net/). This port is
available for the web and as an Electron desktop application.

Its core editing model is based on **Paint.NET 3.36.7**, the last version released under the original
MIT-compatible license, while the current interface and behavior follow Paint.NET v5.1.12+.

## Why?

Paint.NET is one of the best image editors available on Windows, combining powerful features with a simple, intuitive interface.
After switching to Linux, it became the application I missed most and one I had relied on every day.
I have been developing [paint.js](https://github.com/LabyStudio/paintdotjs) since February 2024, with the goal of bringing that familiar editing experience to Linux, macOS, and the web.

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE.md)

![Desktop application](.github/assets/app.png)

![Web application](.github/assets/web.png)

## Installation

### Web

Use paint.js directly at [paintjs.net](https://paintjs.net/). No installation is required.

### Arch Linux

Install [`paintdotjs-bin`](https://aur.archlinux.org/packages/paintdotjs-bin) from the AUR with an
AUR helper, for example:

```bash
yay -S paintdotjs-bin
```

During installation, the AUR package fetches the required artwork and translations from the official
Paint.NET download.

### Flatpak

Download the latest `.flatpak` bundle from
[GitHub Releases](https://github.com/LabyStudio/paintdotjs/releases/latest), then install it with:

```bash
flatpak install --user ./paintdotjs-*-linux-x86_64.flatpak
```

The bundle uses the Freedesktop runtime from Flathub, but paint.js itself is installed directly from
the downloaded file.

### macOS

Download the latest universal `.dmg` from [GitHub Releases](https://github.com/LabyStudio/paintdotjs/releases/latest),
open it, and drag paint.js into the Applications folder.

The macOS app fetches the required artwork and translations from the official Paint.NET download on
first launch.

## Differences from Paint.NET

paint.js is largely feature-complete and closely reproduces the Paint.NET experience, but there are
still some additions and limitations worth noting.

### Added in paint.js

- Runs on macOS, Linux, Windows, and the web through a shared JavaScript codebase, with an Electron
  desktop application for a more native experience.
- A **Fonts** settings page lets you add font files by picker or drag and drop, preview installed
  fonts, and remove individual fonts or clear them all. Added fonts are stored locally and are
  available in the Text tool.
- A searchable **Keyboard** settings page lets you rebind, clear, and reset keyboard shortcuts.
- Interface, canvas, tool, pen, window, and dialog preferences are stored locally and restored across
  sessions.
- The deployed web version can work offline and provides browser-oriented file, clipboard, and drag
  and drop workflows.

### Missing or limited compared with Paint.NET

- Chromium is the supported browser family. Firefox and Safari are not regularly tested, and their
  file-system and clipboard capabilities differ.
- Open Recent, scanner/camera acquisition, and color-profile commands are not implemented yet.
- Native Paint.NET plugins and file-type plugins cannot be loaded.
- Manual GPU/device selection and direct advanced-color management are not implemented.
- Very large documents, large-radius effects, and complex selections may still be slower or more
  memory-intensive than in Paint.NET.
- Some browser functionality requires HTTPS or localhost, including parts of the clipboard,
  file-system, and offline-app support.

## Image formats

| Format | Paint.NET open | Paint.NET save | paint.js open | paint.js save | Important differences |
| --- | :---: | :---: | :---: | :---: | --- |
| Paint.NET (`.pdn`) | Yes | Yes | Limited | Limited | paint.js supports bitmap layers and basic layer properties, with a maximum of 64 layers when saving. History, selections, plugin data, and some newer PDN features are not preserved. |
| PNG | Yes | Yes | Yes | Yes | — |
| JPEG (`.jpg`, `.jpeg`, `.jpe`) | Yes | Yes | Yes | Yes | — |
| JPEG XL (`.jxl`) | Yes | Yes | Yes | Yes | — |
| AVIF | Yes | Yes | Yes | Yes | — |
| HEIC/HEIF | With the Windows codec | With the Windows codec | Yes | No | The bundled paint.js codec can decode these files but cannot encode them. |
| WebP | Yes | Yes | Yes | Yes | — |
| DDS | Yes | Yes | Yes | Yes | paint.js saves uncompressed 32-bit images only. RGBA/BGRA 32-bit DDS is decoded directly, including older paint.js files; other variants use the bundled codec. |
| TIFF (`.tif`, `.tiff`) | Yes | Yes | Yes | Yes | paint.js saves uncompressed RGBA images only. |
| GIF | Yes | Yes | Yes | Yes | paint.js saves a single static, palette-based image only. |
| BMP | Yes | Yes | Yes | Yes | paint.js saves 32-bit images with alpha only. |
| TGA | Yes | Yes | Yes | Yes | paint.js saves uncompressed 32-bit images only. |
| JPEG XR (`.jxr`, `.wdp`, `.wmp`) | Yes | Yes | Limited | No | paint.js can open RGB images with 8-bit, 16-bit, or 32-bit floating-point channels but cannot save JPEG XR. |

Animated and multi-page files are imported and exported as a single static image in paint.js.

## Development

Development requires Node.js 22.13.0 or newer; Node.js 24 LTS is recommended. Install the dependencies first:

```bash
npm ci
```

### Run the web version

Run the development build in watch mode:

```bash
npm run web-watch
```

In a second terminal, start a local web server and open <http://127.0.0.1:8773/>:

```bash
npx http-server . -p 8773
```

Do not open `index.html` directly from the filesystem because browser security restrictions disable
required functionality.

### Run the Electron app

```bash
npm run app
```

The repository does not redistribute Paint.NET's modern artwork and translations because they are
not part of the MIT-compatible Paint.NET 3.36.7 source release on which this project is based. On the
first build, paint.js fetches the required assets from the official Paint.NET download. This lets the
interface follow Paint.NET v5.1.12+ without redistributing those files in this repository.

### Build an Ubuntu package

On Linux, build a `.deb` package for Ubuntu 24.04 or newer and the host architecture:

```bash
npm run dist:deb
```

The package is written to `dist/paintdotjs-<version>-linux-<arch>.deb` and includes
Electron, the application, and its required assets. Node.js and npm are only needed
to build the package, not to run the installed application.

On an x86_64 Ubuntu 24.04 or newer system, install the package with:

```bash
sudo apt install ./dist/paintdotjs-*-linux-amd64.deb
```

APT installs the required system libraries, including Ubuntu's `t64` packages.
`npm run dist:linux` continues to build only the AppImage.

Desktop packages keep the emitted codec chunks and WASM, but omit the duplicate
npm codec copies and development-only project files. Release webpack bundles
do not include eval-based source maps; `npm run web-watch` retains them for debugging.

### Effect performance checks

```bash
npm run test:effects
```

The checks verify byte-identical box-blur output, bounded sliding-window scratch
storage, selection blending, and shared effect snapshots with undo/redo.

After building, run the desktop regressions on Linux with `xvfb-run` installed:

```bash
npm run test:desktop
```

These checks exercise the real Electron renderer with temporary settings, verifying
layer-name safety, document cleanup, worker cancellation, dialogs, image codecs,
painting, selections, text, move history, and CPU/WebGL resampling. The WebGL
scenario uses SwiftShader to execute the actual shaders without requiring a
hardware GPU; this is a correctness check, not a hardware GPU benchmark.

Additional scenarios verify save previews, native file writes, clipboard history,
color palettes, keyboard navigation, error recovery, and real FontFace/IndexedDB
font persistence. Font tests use an installed system font resolved with
Fontconfig's `fc-match`; the font is not copied into the repository or package.
Palette names are rendered as literal text without changing formatting in other
menus. Geometry tests cover clipping, degenerate polygons, region inflation,
affine transforms, and color conversion.
Transform handles remain static; no pulse timer is scheduled.

The browser scenario runs without Node integration in an isolated, sandboxed
window served over loopback HTTP. It exercises real service-worker installation
and update lifecycles, update postponement, and unsaved-work protection using a
small deterministic worker fixture rather than a mocked browser-mode flag.

Final CPU resampling uses the same 4x4 rectangular selection coverage as WebGL,
including its aliased mode, without allocating an intermediate mask canvas.
Linear-light interpolation retains fractional precision rather than quantizing
the lookup table to eight bits. The cheaper Canvas fallback used while dragging
is unchanged; final-quality CPU interpolation is not forced onto every preview.

Optional local CPU measurements and visual comparisons can be generated with:

```bash
PAINTDOTJS_TEST_BENCHMARK_OUTPUT=/tmp/paintdotjs-resampling.json \
PAINTDOTJS_TEST_VISUAL_OUTPUT=/tmp/paintdotjs-cpu-gpu.png \
node --test --test-name-pattern='desktop WebGL' tests/desktop.test.cjs
```

The benchmark records five warmed-up samples per size/filter, median durations,
intermediate mask-buffer sizes, and renderer process memory snapshots. RSS includes
allocator and graphics caches; it must not be interpreted as the live mask size
or a guaranteed whole-application memory reduction.

### Tests and runtime coverage

On Linux, the desktop tests require `xvfb-run` and the system libraries needed by
Electron. Use Node.js 24 LTS for the following commands:

```bash
npm run test:coverage
npm run test:coverage:check
```

The coverage command builds source-mapped test bundles, runs all tests, and writes
an HTML report to `coverage/index.html` and machine-readable reports to `coverage/`.
It includes **every first-party runtime JavaScript file**, including files that
were never executed: `js/`, `src/`, and the desktop runtime helpers
`scripts/asset_archive.js`, `scripts/install_desktop_assets.js`, and
`scripts/resource/ResourceReader.js`. It verifies that no source file disappeared
from the report.

Coverage combines Node.js, VM-loaded engine code, the real Electron renderer, and
the Node-disabled browser renderer and effect workers. Worker coverage is collected before termination and mapped back
to the original effect engine. Bundled source maps map codec coverage back to
`src/`; third-party libraries and native/WASM internals are not included in these
JavaScript percentages.

`test:coverage:check` requires **100% lines and 100% branches** and deliberately
fails while either target is unmet. Passing the test suite alone does not imply
100% coverage. Build and release wrappers are outside this runtime threshold;
validate them with the existing lint, asset/version/header checks and package
builds.

`npm test` runs the same tests without collecting coverage; build the bundles first
with `npm run desktop:build` on a fresh checkout. Coverage builds are for testing
only: normal app/package commands rebuild the release bundles without source maps.

CPU-heavy effects use one cancellable worker per preview; additional CPU-only
effects move off the UI thread for images of at least 262,144 pixels. Canvas-native
effects stay on their existing rendering path to preserve their pixel output.
Undo history is not truncated; closing a document releases its listeners, history,
and canvas backing stores.

### Desktop security

Document layer names are displayed as plain text, not HTML. Keep Electron and the
bundled image codecs updated: Ubuntu system updates do not replace these embedded
runtimes. The current desktop bridge still uses a Node-enabled renderer; migrating
it to a sandboxed, context-isolated preload API is a separate hardening task.

### Build the Flatpak

The Flatpak manifest is in [`flatpak/net.paintjs.Paintjs.yml`](flatpak/net.paintjs.Paintjs.yml).
It builds the checked-out paint.js source with pinned dependencies, bundles the assets needed for
offline use, and keeps the application inside the Flatpak sandbox.

```bash
flatpak-builder --user --install --force-clean \
  --install-deps-from=flathub flatpak-build flatpak/net.paintjs.Paintjs.yml
flatpak run net.paintjs.Paintjs
```

## License

paint.js is licensed under the [MIT License](LICENSE.md). See the
[attribution notice](NOTICE.md) for details about Paint.NET and the JavaScript port.
