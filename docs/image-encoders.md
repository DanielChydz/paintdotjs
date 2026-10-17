# HEIC and JPEG XR encoders

Research and API verification: 2026-10-17. Encoding must work offline in both the
desktop application and the browser, without installed system tools.

| Candidate | Decision |
| --- | --- |
| Installed ImageMagick WASM | Keep for decoding. Its HEIC/HEIF formats report reading support but no writing support; JPEG XR is absent. |
| Previously installed `jpegxr` 0.3.0 | Replaced. Decoding only, and its wrapper does not enable planar-alpha decoding. The selected jxrlib module handles both operations. |
| libheif + x265 | Established encoder, but x265 adds a GPL dependency and an unnecessary licensing difference from the alternative below. |
| libheif + Kvazaar | Selected for HEIC. Established HEIF container implementation and BSD-licensed HEVC encoder, with no OS dependency when compiled to WASM. |
| `elheif` | Uses the selected native libraries, but its small wrapper does not expose the quality controls needed here. Use the upstream libraries directly. |
| Microsoft jxrlib, Glencoe fork | Selected for JPEG XR. Reference encoder with a permissive license and maintained downstream fixes. |
| System `heif-enc` / `JxrEncApp` | Would require external executables and a separate browser solution. |

## Version-specific sources

Context7 was queried for libheif and jxrlib. Its examples describe upstream APIs;
they are cross-checked against these exact downloaded sources rather than assumed
to describe our version. Context7 has no direct Kvazaar entry, so its own tagged
documentation and headers are the reference.

- **libheif 1.23.6**: [README](https://github.com/strukturag/libheif/blob/v1.23.6/README.md),
  [encoding API](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/api/libheif/heif_encoding.h),
  [image allocation API](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/api/libheif/heif_image.h),
  [writer and ownership](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/api/libheif/heif_context.h),
  [Kvazaar plugin](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/plugins/encoder_kvazaar.cc).
  License: LGPL-3.0.
- **Kvazaar 2.3.2**: [README](https://github.com/ultravideo/kvazaar/blob/v2.3.2/README.md),
  [public API](https://github.com/ultravideo/kvazaar/blob/v2.3.2/src/kvazaar.h),
  [build options](https://github.com/ultravideo/kvazaar/blob/v2.3.2/CMakeLists.txt).
  License: BSD-3-Clause.
- **jxrlib `19cc1fa19ca6607449d210aea946b3187f808f2c`**:
  [porting-kit documentation](https://github.com/glencoesoftware/jxrlib/blob/19cc1fa19ca6607449d210aea946b3187f808f2c/doc/readme.txt),
  [API](https://github.com/glencoesoftware/jxrlib/blob/19cc1fa19ca6607449d210aea946b3187f808f2c/jxrgluelib/JXRGlue.h),
  [encoder sample and quality tables](https://github.com/glencoesoftware/jxrlib/blob/19cc1fa19ca6607449d210aea946b3187f808f2c/jxrencoderdecoder/JxrEncApp.c),
  [encoder implementation](https://github.com/glencoesoftware/jxrlib/blob/19cc1fa19ca6607449d210aea946b3187f808f2c/jxrgluelib/JXRGlueJxr.c).
  License: Microsoft's permissive BSD-style license in the source headers.

The jxrlib porting-kit documentation explicitly says to use its implementation
as the reference when code and documentation disagree. In particular, the sample's
quality tables and separate alpha quantizer take precedence over simplified
third-party examples.

## Rebuilding and replacing the modules

Normal application builds use the checked-in modules under `lib/codecs`; neither
Docker nor a compiler is required for application installation or normal builds.
The application fetches each WASM module locally only when its format is needed.
No thread support, SharedArrayBuffer, COOP/COEP headers or system executables are
required. The existing ImageMagick decoder reads HEIC independently.

Rebuild with Emscripten **4.0.23**, using the pinned image:

```sh
docker run --rm -v "$PWD:/work" -w /work \
  emscripten/emsdk@sha256:86537645c51e44899812d29820ee3b64b96c321ebb2aba4416a04ceeb1bcde62 \
  bash scripts/build_image_encoders.sh
npm run desktop:build
```

The recipe downloads the exact corresponding upstream source archives from
`scripts/codecs/sources.json`, verifies SHA-256, and keeps their extracted trees
under `.tmp/image-encoders`. Those trees can be modified and the recipe rerun to
relink the modules. The HEIC bridge is `scripts/codecs/heic_encoder.cpp`; the JPEG
XR bridge is `scripts/codecs/jxr_encoder.c`. The only jxrlib compatibility changes
are missing declarations/headers, matching two transcoder declarations to their
actual return types, and allowing legacy pointer conversions during upstream
compilation; codec algorithms remain unchanged.

To replace libheif in an existing installation, rebuild the modules and replace
`build/web/assets/codecs/heic-encoder.wasm` in the application resources (unpack
and repack Electron's `resources/app.asar` if necessary). There is no module
signature check. Changes to the bridge's exported interface also require
rebuilding the JavaScript bundle. Binary distributors must keep these source
archives available alongside their binaries or provide equivalent source access
under the bundled licenses.

The GitHub release workflow attaches `paintdotjs-codec-sources.tar.gz` alongside
the application packages. It contains the verified upstream source archives,
our bridges, the build recipe and licenses, without increasing installed package
size. Generate it manually with `python3 scripts/package_codec_sources.py`.

JPEG XR uses 4:4:4, reference SSIM quality tables, and a separately encoded
lossless alpha plane. Quality 100 is lossless for all four 8-bit channels. HEIC
uses the released Kvazaar's 4:2:0 input; quality 100 enables lossless HEVC coding,
but RGB-to-YCbCr conversion and chroma subsampling still change RGB samples.
Both exports flatten the document according to the existing save workflow.

## Measurements

On the development Linux machine, the generated JS and WASM modules together
occupy 1,097,985 bytes (409,734 bytes when gzip-compressed individually). Removing
the older JPEG XR package also reduces the existing vendor JavaScript chunk from
403 KiB to 183 KiB. Actual installer size depends on its compression method.

A direct HEIC quality-90 encode of an opaque synthetic gradient took about 57 ms
at 256 × 256 and 633 ms at 1024 × 1024, excluding module initialization and PNG
conversion. This is one local measurement, not a guarantee for photographs,
larger documents or slower hardware. Encoding currently runs synchronously
inside WASM, consistent with the existing ImageMagick path.
