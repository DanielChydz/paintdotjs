# Desktop size optimizations

The desktop build keeps the complete Electron runtime, GPU/software rendering,
locales, bundled font families, codecs, updater and extension APIs. It does not
use UPX, runtime extraction, font subsetting, or remove Chromium features.

## Installed bytes

- Full fonts are losslessly repackaged as WOFF2; the duplicate Inter is removed.
  All glyphs, hinting, metrics, layout tables and variable axes are retained.
  `artwork/fonts.json` pins original TTF hashes and the source Git revision.
  `scripts/compress_fonts.py --check` compares decoded table bytes (ignoring
  container checksums/flags and empty SFNT signatures). Normal builds use the
  checked-in WOFF2 files, without Python or downloads.
- `scripts/prepare_desktop.js` creates `build/desktop` with minified JS and CSS.
  Source files are preserved. Top-level bindings, class/function names, function
  arity, license comments and CSS resource paths are retained. Only the runtime
  `AssetCatalog` helper is shipped from the maintenance scripts directory.
- `OptimizeWasmPlugin` applies Binaryen's size optimization to emitted WASM.
  It retains original files when optimization does not reduce their size,
  validates the supported instruction baseline, and checks imports/exports.
  No fast-math options or reduced codec/format sets are used. Source codec
  artifacts and their pinned checksums remain unchanged.
- Node copies of webpack-bundled libraries and maintenance-only ZIP readers are
  excluded, along with unused ESM/CLI distributions of CommonJS dependencies.
  The updater and native titlebar retain their CommonJS entry points. Bundled
  library notices remain in `assets/licenses`.

## Download bytes

DEB uses XZ level 9 instead of FPM's default level 3. This affects package size
and packaging time, not installed size. Fonts, JS/CSS and WASM above reduce the
installed payload independently of package compression.

## Validation

Use Node 24 (the project supports Node >=22.13):

```sh
npm run test:coverage:check
npm run dist:deb
npm run test:package
```

The packaged smoke launches the actual Linux executable in a disposable profile
under Xvfb and exercises all bundled fonts, modern image codecs, extension/icon
pack integration and painting through Chromium's local debugging connection.
It does not install the DEB or modify the user's settings. Archive creation in
the test fixture uses the development fflate dependency; the application uses
its bundled ZIP reader.

A custom Chromium/Electron build is intentionally outside these optimizations:
the prebuilt executable is already stripped. Disabling browser subsystems or
removing ICU/locales, GPU fallbacks and runtime resources could lose behavior.
