# Runtime regression context

Detailed scenarios and implementation contracts formerly listed in the project
README. This is reference material, not a current test-run report or an instruction
to change these behaviors. Run commands from the repository root; see the
[development guide](../../README.md#development) for prerequisites and commands.

## Effects and workers

The checks verify byte-identical box-blur output, bounded sliding-window scratch
storage, selection blending, and shared effect snapshots with undo/redo.
Worker-boundary tests verify transferable copies of pixels and selection masks,
stale-job cancellation, explicit worker failure diagnostics, synchronous fallback,
remembered effect values, and worker/object-URL cleanup.

## Desktop scenarios

These checks exercise the real Electron renderer with temporary settings, verifying
layer-name safety, document cleanup, worker cancellation, dialogs, image codecs,
painting, selections, text, move history, and CPU/WebGL resampling. The WebGL
scenario uses SwiftShader to execute the actual shaders without requiring a
hardware GPU; this is a correctness check, not a hardware GPU benchmark.
Camera scenarios use Chromium's synthetic video device, not a physical webcam.
Export scenarios require FFmpeg to decode TIFF, BMP, TGA and DDS independently;
the application itself does not depend on FFmpeg.

Additional scenarios verify save previews, native file writes, clipboard history,
color palettes, keyboard navigation, error recovery, and real FontFace/IndexedDB
font persistence. Font tests use an installed system font resolved with
Fontconfig's `fc-match`; the font is not copied into the repository or package.
Font writes are acknowledged only after the IndexedDB transaction commits.
Real-storage regressions cover successful commits, rollback, request errors and
incompatible database versions.
Document actions share one dispatcher for UI commands and workspace calls:
only actual history mementos are recorded, asynchronous errors reach the existing
application reporter, and actions that already record history are not recorded twice.
Palette names are rendered as literal text without changing formatting in other
menus. Geometry tests cover clipping, degenerate polygons, region inflation,
affine transforms, and color conversion.
Ellipse vertex lists and the selection tool share adaptive sampling with a
default 0.01px chord-error bound, preserving cardinal extrema instead of using a
fixed 32-segment helper. Degenerate ellipses produce empty paths; invalid bounds,
tolerances and unrepresentable vertex counts fail explicitly. Flattening an
already-linear path applies its matrix without deleting short edges, duplicate
vertices, holes or closure, and rejects nonpositive/nonfinite tolerances.
Transform handles remain static; no pulse timer is scheduled.

Further desktop scenarios cover file/layer imports, resize and canvas anchors,
physical print dimensions and resolution units, native held tab navigation,
palette directory imports and rapid save-format changes with real encoded bytes,
oversized paste choices, save-all failure recovery, settings and shortcut changes,
font management, curve/levels controls, all eight selection scale handles with
Shift/Alt modifiers, and rotated-selection history. History tests verify both undo
and redo when the active tool has been deactivated, plus layer identity and pixels
after duplication, deletion, swapping, merging, translucent fills and inversion.
Polygon conversion preserves holes, and contour tracing retains the original
pixel stencil; empty regions convert to empty paths.

Gradient tests run real WebGL2 shaders with SwiftShader and compare each gradient
shape/repeat mode against independent geometric color expectations. Text tests
exercise measured multiline caret placement, middle-button paste suppression,
keyboard finishing, viewport focus and native right-button editor dragging.
Document-strip tests cover thumbnails, navigation, ordering, context commands and
menu/listener cleanup; dialog movement tests verify clamping and persisted positions.
Surface tests verify exact `Color` channel writes, clipped transfers, subwindows
and disposal. Sparse bitmap transaction tests restore previously saved tiles on
cancel, undo and redo. All hatch patterns are checked against their rendered
tiles, and separable software paint blends are compared with native Canvas.
Color Dodge/Burn preserve black/white backdrop boundary cases consistently between
the paint bucket and Canvas-based tools.
Hue, Saturation, Color and Luminosity also use the
[CSS nonseparable blend equations](https://www.w3.org/TR/compositing-1/#blendingnonseparable)
in the paint bucket, rather than silently behaving like normal blending. Tests
compare 700 colored/alpha cases with native Canvas and check actual clipped bucket
fills and pixel-exact undo/redo. Fully transparent inputs bypass the nonseparable
color calculation without changing alpha compositing.
Pending-shape tests cover every scale handle, off-center presses, transformed
local displacement, rotation, line controls and gradient endpoints with exact
pixel undo/redo. Clicking a stationary handle preserves the original geometry.
Selection tests compare modifier/configured set operations against independent
pixel masks and cover clipped/disjoint gestures, moving origins and coalesced
lasso samples.
Aliased rectangles use inclusive, normalized pixel bounds and draw their outline
once. Fixed-ratio rectangle selections retain their proportions in every drag
direction. Regressions also verify flood-preview cancellation, composited versus
layer sampling, registered footer zoom controls, shortcut chord cycling,
layer-properties previews and exact flatten/undo/redo pixels and layer identities.
Floating-pixel moves coalesce pointer updates into one animation frame and rebuild
live interpolation/gamma previews without accumulating old pixels. Finish history
captures both source and destination footprints so redo does not leave a source
copy; disjoint/offscreen moves store separate clipped pixel regions, not the gap
or the whole canvas. Tests check exact pixel bytes and snapshot allocation sizes.

## Platform boundaries

Desktop clipboard text and images use Chromium's `navigator.clipboard` APIs.
Electron's removed renderer `clipboard` module is not used. Regressions verify
actual text and image clipboard contents, not just a mocked desktop helper.
Node-side platform tests use isolated Electron/HTTP boundary fixtures and real
temporary files to check updater events, managed-release version comparisons,
setup retry/quit, staged-asset cleanup, protocol routing and window persistence.
They do not contact release servers, open external pages or install updates.
Boot-loader fixtures cover local-worker removal/reload-loop prevention, update
throttling, metadata failures and modal/unsaved-document decisions. Real WebGL
tests also exercise nonrectangular masks, cache disposal and explicit context,
shader-compilation, program-link and texture-size fallback conditions.
Gradient-specific shader/link faults retain the Canvas fallback's expected colors
and release the failed renderer state.

## Browser, storage and document I/O

The browser scenario runs without Node integration in an isolated, sandboxed
window served over loopback HTTP. It exercises real service-worker installation
and update lifecycles, update postponement, and unsaved-work protection using a
small deterministic worker fixture rather than a mocked browser-mode flag, and
round-trips structured-cloned bytes through the browser file-system IndexedDB store.
Web files use the existing `fileName` store key without a database migration.
Parent paths preserve their absolute/relative form. Storage tests verify missing
records, collision limits for temporary files, and request failures. Document I/O
tests exercise save configuration/flatten consent, canceled and restricted file
pickers, native and browser writes, save-all selection restoration, and preservation
of dirty state after write failures. PDN tests decode repaired legacy blend records
with the real NRBF parser and reject malformed graphs and pixel chains.
Welcome preferences are tested in the real browser, including restricted storage.
Error-recovery tests verify native and legacy clipboard contents, temporary-element
cleanup, failed recovery saves, and isolated global error/rejection reporting.

## Resampling measurements

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
