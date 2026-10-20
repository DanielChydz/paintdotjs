# JPEG XR pixel-layout fixtures

These original 3×2 patterns were encoded with the pinned Microsoft jxrlib reference
encoder, Glencoe revision `19cc1fa19ca6607449d210aea946b3187f808f2c`. No Paint.NET
application files or artwork are used. The harness is
`scripts/codecs/generate_jxr_fixtures.c` (project MIT license); it uses the encoder
API and memory output writer from our bridge, with a different pixel format for
each fixture. Source archives and licenses are pinned in `scripts/codecs/sources.json`.

After fetching sources, build native `libjxrglue.a` and `libjpegxr.a` with the
upstream Makefile using a separate `DIR_BUILD=.../native`. Compile the harness
with the `jxrgluelib`, `common/include` and `image/sys` include directories,
`-D__ANSI__`, those two static libraries, and `-lm`. Run the resulting executable
with this directory as its argument. This keeps native objects separate from the
Emscripten objects. `SHA256SUMS` identifies the checked-in bitstreams.

`expected.json` is calculated from the harness input pattern, not captured from
our decoder. For pixel p and component c the pattern is
`[0, .25, .5, 1, .75, .125][(p+c)%6]`, quantized to the source sample depth.
Premultiplied RGB is multiplied by alpha before quantization. Gray repeats one
component; BGR reverses the first three components; alpha is component 3 (CMYK: 4).
Packed RGB fixtures cycle pure red/green/blue. Bilevel rows are `101` and `010`.
RGBE has mantissas 64/128/192, exponent 0 for the first pixel and 129 otherwise.

The application's documented fixed/float/RGBE SDR mapping is
`255 * (max(0,x)/(1+max(0,x)))**(1/2.2)`, rounded. Alpha is clamped linear coverage.
CMYK uses the unprofiled fallback `(1-C)*(1-K)` and equivalents. Tests allow one
output level for quantization and float rounding. Arbitrary five-channel data
has no implied color model and must be rejected; its expected array is unused.

Native upstream `JxrDecApp` decoded 37 of the 38 bitstreams to TIFF,
independently of the WASM bridge and JavaScript conversion. Its TIFF writer does
not support the padded RGB32 pixel format; that fixture is checked against its
input-derived RGB values in our tests. Node and actual
application regressions assert the RGBA reference values. The runtime scenario
embeds the small bitstreams so extracted application packages can be tested
without copying test fixtures into the distribution.
