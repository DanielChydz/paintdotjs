# Runtime coverage handoff

## Current verified checkpoint (2026-10-20)

All 255 tests pass with Node 24.21.0. `npm run test:coverage:check` includes
all 286 runtime JavaScript source files, without added exclusions or ignores.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 46,444 | 46,444 | 100% | 0 |
| Branches | 11,897 | 11,897 | 100% | 0 |
| Functions | 2,864 | 2,864 | 100% | 0 |

Completed backlog items 8–11. Item 7 (prerelease updates) is explicitly deferred
by the user; no prerelease behavior was changed.

- The white selection outline fades back over 200 ms after reset using the
  existing render loop. Both the renderer flag and global Animations preference
  are respected; disabled animation produces a fully visible, static outline.
- Every transform gesture, keyboard nudge and Finish has its own history series;
  undo/redo preserves the series identifier and existing compound grouping.
- Handle location, angle, shape, transform, visibility and rotation indicator
  changes request presentation without recompositing the document.
- Renderer disposal detaches from its SurfaceBox and is idempotent. Selection
  renderers release their own paths and selection/settings subscriptions.
  Document closing disposes all remaining renderers, and selection-tool changes
  dispose the temporary selection preview. Borrowed surfaces remain caller-owned.

`checkRendererHistory` verifies rendered pixels, independent gesture boundaries,
undo/redo pixels, composition revision, repeated disposal, subscriptions and
borrowed-surface ownership. It also runs against the packaged executable.
Lint, source headers, asset validation and version metadata checks pass.
Coverage log: `/tmp/paintjs-next-coverage-complete.log`.

Built `dist/paintdotjs-2.6.0-linux-amd64.deb` (99,610,204 bytes), extracted it
into `/tmp/paintjs-next-final-deb-root`, and passed all six packaged-executable
scenarios: assets/fonts, modern codecs, upstream features, painting, first-batch
features and renderer/history contracts. This uses an isolated temporary profile
under Xvfb without installing the package or changing the user's settings.
Build/package logs: `/tmp/paintjs-next-final-deb.log`,
`/tmp/paintjs-next-final-package.log`. No release was published or pushed.
Other operating-system packages and native GPU hardware were not exercised.

## Historical first-batch checkpoint (2026-10-20)

All 254 tests pass with Node 24.21.0. `npm run test:coverage:check` includes
all 286 runtime JavaScript source files, without added exclusions or ignores.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 46,353 | 46,353 | 100% | 0 |
| Branches | 11,866 | 11,866 | 100% | 0 |
| Functions | 2,856 | 2,856 | 100% | 0 |

Implemented backlog items 1–6: persistent recent documents with desktop paths
and browser handles, Help → Plugins, original move/rotate cursors, painted busy
state before large final transforms, persistent automatic update preferences,
and rollback of failed history functions using their existing bitmap/selection
snapshots. Partial layer allocation is released and catchable failures report
once. Wrapping a canvas with no available 2D context leaves the caller's canvas
unchanged; failed allocation of an owned canvas releases it.

Native and browser regressions cover real IndexedDB persistence, deduplication,
missing files, revoked/denied handles, transaction failures, busy-state cleanup,
pixel/history restoration and nested failures during error recovery. Updater
fixtures cover startup/periodic preferences, stale timer callbacks, manual checks
and preference changes while a web update prompt waits for another dialog.

Lint, source headers and version metadata checks pass. Coverage log:
`/tmp/paintjs-six-final-coverage.log`.

Built `dist/paintdotjs-2.6.0-linux-amd64.deb` (99,574,104 bytes), extracted it
into `/tmp/paintjs-six-final-deb-root`, and passed all five scenarios using its
actual executable: bundled assets/fonts, modern codecs, upstream features,
painting, and the new first-batch features. The test uses an isolated profile
under Xvfb, without installing the package or changing the user's settings.
The packaged tester tolerates first-run navigation only during its readiness
probe; scenario failures are never retried or suppressed. Build/package logs:
`/tmp/paintjs-six-final-deb.log`, `/tmp/paintjs-six-final-package.log`.
No release was published or pushed. Other operating-system packages and native
GPU hardware were not exercised in this Linux task.

## Historical size optimization checkpoint (2026-10-20)

All 250 tests pass with Node 24.21.0. `npm run test:coverage:check` includes
all 282 runtime JavaScript source files, without added exclusions or ignores.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 45,953 | 45,953 | 100% | 0 |
| Branches | 11,728 | 11,728 | 100% | 0 |
| Functions | 2,827 | 2,827 | 100% | 0 |

Desktop size changes retain all font families, glyphs, variable axes, codecs,
locales, GPU resources and extension APIs. Fonts use lossless WOFF2; release
JS/CSS is minified with reflection/global contracts preserved. WASM size passes
validate imports/exports and cache unchanged modules for watch builds. Packaging
excludes duplicate bundled dependencies and maintenance scripts; library notices
are retained. DEB uses XZ level 9. See `docs/desktop-size.md` for measurements,
regeneration and the real packaged-executable smoke test.

The full suite verifies desktop/browser codecs and fonts. Packaging tests verify
minified reflection, cross-file globals, worker serialization, CSS paths and
executable WASM exports across repeated builds. `npm run test:package` separately
checks the real packaged Linux executable (fonts, modern codecs, icon packs,
extensions and painting) in a disposable profile under Xvfb. RPM/macOS/Windows
packages and native GPU hardware were not exercised in this Linux task.

Logs: `/tmp/paintjs-size-coverage-final.log`,
`/tmp/paintjs-size-final-deb.log`, `/tmp/paintjs-size-final-package.log`,
`/tmp/paintjs-size-final-smoke.log`.
Font table verification: `/tmp/paintjs-size-font-verify.log`.

## Historical verified checkpoint (2026-10-17)

All 248 tests pass on Linux with Node 24.21.0. A clean
`npm run test:coverage:check` includes all 282 runtime JavaScript source files;
no coverage exclusions or ignore directives were added.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 45,953 | 45,953 | 100% | 0 |
| Branches | 11,729 | 11,729 | 100% | 0 |
| Functions | 2,827 | 2,827 | 100% | 0 |

New native desktop and browser scenarios verify real HEIC/HEIF and JPEG XR
encoding, quality 0/90/100, all advertised extension aliases, alpha, odd and tiny
image dimensions, signatures and save-dialog previews. JPEG XR uses the pinned
jxrlib module for decoding as well, fixing the old wrapper's missing planar
alpha. Bridge contracts verify initialization retry, allocation failures, cleanup,
independent output copies and memory growth. Source/binary checksums are checked.
Colors-window layout and View-menu unit names have regressions matching the
reported screenshots. The DEB builds successfully; the packaged application
round-trips HEIC and JPEG XR through `paintjs://app`, preserving alpha 128.
The archive contains each new WASM module once. Third-party native C/C++ coverage
is not included in the JavaScript percentage; real codec output is tested.

Source/test lint, source headers, asset manifest, version information and whitespace
checks pass. Logs: `/tmp/paintdotjs-pre-push-coverage.log` and
`/tmp/paintdotjs-codecs-packaged-smoke.log`. RPM and Flatpak were not rebuilt;
native GPU hardware was not exercised.

## Historical verified checkpoint (2026-10-16)

All 241 tests pass, with zero failures, skips or TODO tests. The full clean run
of `npm run test:coverage:check` on Ubuntu 24.04 with Node 24.21.0 includes
all 280 runtime source files. No coverage
exclusions or ignore directives were added.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 45,825 | 45,825 | 100% | 0 |
| Branches | 11,693 | 11,693 | 100% | 0 |
| Functions | 2,822 | 2,822 | 100% | 0 |

New tests cover plugin validation, pixels, workers, configuration, codecs and
menus; shape parsing, native geometry and persistence; asset packs, translations,
settings, focus handling and storage failures. Integration scenarios run in real
Electron under Xvfb, including the browser runtime without Node integration.

Regression fixes make plugin, shape and asset-pack storage wait for IndexedDB
transaction completion; failed plugin enable, disable or removal keeps runtime
state intact. Shape number lists reject embedded garbage, and XML boolean/fill
values accept surrounding whitespace. Unreachable DOM fallbacks and redundant
angle normalization were removed without excluding their files from coverage.

A deterministic workspace-lifecycle regression reproduces a queued thumbnail
refresh after document disposal but before the layer-list animation frame runs.
`LayerItem.renderThumbnail()` skips the disposed surface. The regression fails
with the original null-canvas exception before the fix and passes afterward.

The rotation-control regression explicitly renders light and dark themes and
checks their pixel output. Previously it restored the system theme after drawing
light mode, so a light-mode CI runner never exercised the dark rendering paths.
Ubuntu reproduced the two missing branches before this change and reaches 100%
afterward. The coverage runner now prints uncovered branch locations, with a
self-contained contract test, and the release workflow saves JSON reports on failure.

Source/test lint, source headers, bundled assets, version information and whitespace
checks pass. The strict coverage report also passes with all four metrics set to
100%. Log: `/tmp/paintdotjs-ubuntu24-fixed-coverage.log`.
No release package was rebuilt for this fix; native GPU hardware was not exercised.

## Historical checkpoint after upstream 2.4.3 integration (2026-10-16)

All 211 tests pass, including real plugin-package, XAML-shape and ZIP icon-pack
integration. All 280 runtime source files remain in coverage; no exclusions or
ignore directives were added for the new upstream modules.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 43,737 | 45,831 | 95.43% | 2,094 |
| Branches | 10,363 | 10,580 | 97.94% | 217 |
| Functions | 2,677 | 2,815 | 95.09% | 138 |

The previous 100% result below applies to the pre-integration source snapshot.
The newly integrated upstream features expand the measured code; the strict 100%
gate is not currently satisfied. This gap is recorded rather than excluding code.
Lint, test lint, headers, version and bundled-asset checks pass.
Log: `/tmp/paintdotjs-upstream-icons-coverage.log`. See UPSTREAM-SYNC.md for merge decisions.

## Historical verified snapshot after open-artwork migration (2026-10-16)

The requested 100% target is maintained after replacing proprietary resources.
All 210 tests pass. All 255 runtime JavaScript files remain included, with no new
coverage exclusions or ignore directives.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 40,983 | 40,983 | 100% | 0 |
| Branches | 9,946 | 9,946 | 100% | 0 |
| Functions | 2,515 | 2,515 | 100% | 0 |

Source/test lint, headers, version, bundled-asset and whitespace checks pass, as does
`npx c8 report --check-coverage --lines 100 --branches 100`.
Current logs: `/tmp/paintdotjs-desktop-brand-coverage.log`,
`/tmp/paintdotjs-desktop-brand-strict.log`.
The latest regression checks desktop version/title labels while retaining the
browser's Web label; the bundle preserves metadata supplied by desktop preload.
The asset task and licensing/provenance checks are documented in ARTWORK-MIGRATION.md.
Source verification includes packaged manifest lookup and offline PWA startup
regressions. Pages and Linux DEB were rebuilt from commit 451183d and audited;
the actual packaged application and production PWA both pass offline reloads.
See ARTWORK-MIGRATION.md for artifact hashes and the completed verification.

## Historical checkpoint before artwork migration

The sections below describe the pre-migration measurements and artifacts.

## Completed checkpoint (2026-10-16)

**The requested coverage target is complete.** The user asked to resume from the
saved checkpoint and continue until 100% lines and branches. The full coverage
suite now passes, as does the strict 100% line/branch gate.

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 41,276 | 41,276 | 100% | 0 |
| Branches | 10,072 | 10,072 | 100% | 0 |
| Functions | 2,532 | 2,532 | 100% | 0 |

- **211 tests passed; zero failures, skips or TODO tests.**
- All **254 runtime source files** remain included.
- No coverage exclusions or ignore directives were added.
- Source/test lint, source headers, version checks and `git diff --check` passed.
- `npx c8 report --check-coverage --lines 100 --branches 100` passed.
- Native Canvas, pointer capture, GPU/CPU pixel comparisons, real FontFace and
  clipboard workflows remain in use. VM tests cover explicit boundary contracts.

Reports: `coverage/coverage-summary.json`, `coverage/coverage-final.json`,
`coverage/index.html`. Full-run log: `/tmp/paintdotjs-coverage-current.log`.
Strict-gate log: `/tmp/paintdotjs-strict-coverage-current.log`.
Generated reports and bundles are not committed sources.

## Final coverage closure batch (2026-10-16)

- Native shape tests cover negative constrained drags, filled rounded rectangles,
  right-button line rendering, line body translation, collapsing an editable line
  endpoint, normalized one-dimensional paths and collapsed ratio selections.
- Native tool tests cover idle selection events, valid complement polygon clipping,
  Shift-global fill, a seed outside the selection, secondary-source recoloring,
  whole-document keyboard Move with an unknown saved interpolation mode, and
  gradients clipped to a selection.
- Successful supported file pickers are checked independently of filter rejection
  retries. Clipboard dimensions return only after decoded-image cleanup. Unknown
  tool options share an explicit empty fallback after dispatch.
- File inputs owned by font/palette dialogs always have a FileList; removed null
  alternatives that cannot occur while their type remains file. Empty lists and
  drops without transfer data retain their supported behavior.
- Font settings distinguish a genuinely pending metadata read from a completed
  empty library. No successful font decode is fabricated for this scenario.
- Effect tests cover unknown legacy layouts/channels and clearing hover coordinates.
- Standalone save tests run in real browser frames, loading original sources and
  dependencies in their own realm. They check absent/invalid settings and actual
  zero-sized SVG image loading. A Node VM fixture with cross-realm native DOM
  dependencies was replaced after renderer crashes; it is not part of the suite.
- Recovery saves both one and two documents through the real native writer,
  reads saved PNGs back and checks exact pixels and singular/plural status text.
- The slider maximum-zero regression was fixed earlier in commit 83fa493. The test
  demonstrated incorrect thumb hit testing before the production fix.

## Historical checkpoints

The sections below preserve earlier decisions, measurements and interrupted work.
Their incomplete/pause statements describe those older checkpoints, not the final
status above. Keep concrete TODO implementations and meaningful regression oracles
when extending coverage; continue committing verified changes regularly.

## Verified pixel and legacy import batch (2026-10-16)

- Real legacy PDN imports recover missing names/opacity while preserving pixels.
  Image import handles extension-only filenames and recovers a first active layer
  after the collection becomes empty.
- Baked nonrectangular masks now have a GPU-versus-CPU pixel oracle. Native brush
  tests verify quarter-area alpha for subpixel pressure stamps, secondary-color
  unsampled strokes and distance retention below the configured brush spacing.
- Error recovery saves a single document through the actual filesystem writer,
  decodes the saved PNG and verifies both pixels and singular success text.
- PDN repair returns its validated graph after the loop; its removed counter was
  incremented exactly once for each validated layer and could never differ.
- All 209 tests and lint/header/version/whitespace checks passed. Coverage remains
  100% lines/functions, with 99.61% branches (39 alternatives remaining).

## Verified slider and UI batch (2026-10-16)

- Fixed slider thumb hit testing with a zero maximum. A native range regression
  failed before the fix; unspecified/invalid maxima and collapsed ranges retain
  their correct behavior.
- Native tests cover light-theme rotation drawing, vertical Shift axis locking,
  source-free pan, generic curve endpoint edits, empty task dialogs, left-opening
  submenus, default dropdown widths, embedded icons, keyboard font selection and
  normal/throttled horizontal wheel events.
- All 209 tests pass; all source/test lint, headers, version and whitespace checks
  pass. Full coverage: 100% lines/functions, 99.51% branches (49 remaining).

## Verified batch (2026-10-16)

- Added legacy DPI/color fallback, unchanged size-dialog cancellation, inferred PNG
  and unknown filename/format contracts. Decoder rejection without an Error still
  yields the documented unsupported-format error.
- Native Canvas verifies default clipped source-over and standalone viewport
  custom/default border pixels. Partial stencil tracing verifies bounds, area and
  consumption of the input stencil without caching full-image coverage.
- All lint/header/version/whitespace checks and 209 tests passed. Latest full
  coverage: 100% lines/functions, 99.31% branches (69 alternatives remaining).

## Latest saved batch (2026-10-15)

- Fixed TextTool shortcut dispatch when ActionRegistry is absent; the new regression
  demonstrated a ReferenceError before the fix. Added legacy DPI and width-only
  text metric layout contracts for left, center and right alignment.
- MaskedSurface.clone now rejects disposed instances explicitly instead of creating
  an unusable live-looking clone; native regression verifies the error. Live masks
  clone their constructor-owned paths directly.
- Simplified invariant-dominated transform snapshots, textarea caret positioning,
  numeric range controls and initialized save-quality lookups. Text font-size
  inputs retain their required invalid-text fallback.
- Verified optional settings and base-view coordinate delegation, PDN default layer
  names without caller mutation, unavailable JXR encoding, real browser/GPU
  diagnostics, native caret placement, selection routing and missing device DPI.
- Final checks passed: source lint, test lint, source headers, version information,
  git diff whitespace checks and the complete coverage suite (204 tests).
- Full coverage: 41,276/41,276 lines and statements, 2,532/2,532 functions,
  9,904/9,990 branches (99.13%). All 254 runtime files remain included.
- The strict 100% branch gate still fails as expected. The overall task remains
  unfinished; do not claim 100% branches or rebuild packaging during this pause.
- Resume from the fresh reports and the remaining-source table below. Temporary
  detailed logs are in /tmp/paintdotjs-*.log; committed notes are the durable handoff.

## Commits and verification

Branch: `master`. The previous dirty worktree was preserved and verified, then
committed as `adfeb59`. Further verified batches were committed as `189caf9`,
`d290185`, `dcf9ff3`, `af5cb23`, `34136f2`, `7a13c2c`, `e58e95d`, `f391874`,
and `0d52f4c`; use `git log` for newer checkpoint commits. Continue committing
verified batches, not only when the overall 100% target passes.

The final DEB was rebuilt successfully after the passing strict gate:
`dist/paintdotjs-2.1.16-linux-amd64.deb` (package paintdotjs, version 2.1.16,
architecture amd64). Its metadata, app.asar, PDN template and bundled Segoe UI font
were inspected. SHA-256:
`6dc5a3d22e4d817d253a468c8e8a1d37dc9c14d796eae455724d6224452ef690`.
Packaging log: `/tmp/paintdotjs-final-deb.log`. Reports describe the verified source
snapshot; packaging rebuilt bundles only after report generation. For a new report,
run the full mapped coverage build again. Never run coverage and packaging together.

This environment's sandbox causes `spawnSync ... EPERM` (even after producing
partial child output), obscuring test failures. Tests/coverage/header checks
were run successfully through approved `require_escalated` tool calls. Git
metadata is read-only inside the sandbox, so commits also need escalation.
No automatic approval review rejected these authorized actions.

## Final saved test batch

- Native custom-font previews enter the viewport through IntersectionObserver
  and load real FontFace data. Storage failures verify both selection and lazy
  preview recovery, preserving the menu and reporting the original error.
- Font picker typeahead ignores modified, composing and nonprintable keys.
- Move tests verify idle handle hover, padded rotation hit testing and Euclidean
  distance to a collapsed edge.
- Curve endpoint gestures start slightly inside the canvas (0.01/0.99); exact
  boundary coordinates rounded outside it and missed the endpoint handlers.
- Resumed batch: real pointer exit clears curve coordinates/guides, invalid and
  inaccessible localStorage recovers default palettes, denied persistence retains
  in-memory colors, and missing/invalid settings recover independent defaults.
- Verified effect contracts cover rectangular erosion/linked dilation, legacy RGB
  curve fallback, boosted saturation, square oil kernels, thin/thick outlines,
  extreme sketch settings, threshold sharpening and invalid Gaussian quality.
- Native save tests verify manual zoom survives re-encoding/resizing, double-click
  returns to fit, and late PNG conversion cannot replace a newer/closed preview.
- Document tab tests cover stale drags/delayed renders after close, nonbitmap
  updates, absent context callbacks and browser clipboard Copy Path.
- The latest successful full run includes these scenarios. Subsequent toolbar
  validation regression and capability/renderer scenarios also pass in the latest measurement.


## Latest verified native contracts

- Settings diagnostics report Unknown/Unavailable when browser capabilities are
  absent; unavailable WebGL also updates the Graphics page correctly. Empty
  checkerboard brightness restores the default.
- A late-mounted document strip includes existing documents and preserves their
  selected identity; all extra app/document listeners and its observer are cleaned.
- Brush previews preserve continuous half-pixel coordinates; clearing a preview
  removes visibility/pixels. Disabled marching ants remain stable over time.
- Invalid constructor DPI recovers 96; legacy missing layer opacity remains opaque;
  handle hit tests distinguish exact painted boundaries from padded boundaries.

## Resumed-session production fixes

- **100% lines/functions milestone**: 204 tests pass across all 254 runtime files.
  Branch coverage is 99.13% (86 uncovered alternatives). On resumption, continue toward the
  requested 100% branches; do not mark the task complete yet.
- Transform mode names/validation live in MoveToolBaseMode and are shared by
  dispatch/history naming. Validate before selection mutation. Scaling uses the
  already validated edge vector to derive its opposite anchor, replacing eight
  duplicated anchor branches; all handle/flip/center/shift pixel tests pass.
- Remove checks dominated by prior invariants: interrupted-pointer callers own a
  stored pointer; transform multiplication already requires a lift matrix; level
  updates are called only with an active handle; positive source alpha makes
  combined blend alpha positive.
- Debounced.cancelDebounce releases frame handles and supports reuse. Save preview
  resizing uses that existing scheduler and cancels it on close. Native tests
  verify cancellation, scheduling again, fit/manual zoom and queued encode cancel.
- Remaining line guards are covered through meaningful contracts: inactive size
  input events cannot recalculate active dimensions; reentrant color callbacks do
  not recurse/duplicate model events; supplied stale strip rows cannot reorder
  closed workspaces; abandoned failed Move activation frees its own render state
  without returning a scratch surface borrowed by someone else.

- `Tool.onActivate`: acquire scratch ownership before subscribing to selection and
  history. A native regression demonstrated four leaked listeners after a busy
  surface rejected activation. Retrying Move now replaces old render arguments,
  registers exactly one listener set, and deactivation returns to baseline.
  Painting, pending-shape, Move and brush-interruption scenarios pass. The table
  above includes this fix in the latest successful full coverage run.

- `ToolOptionDropdown`: observe the actual scrolling font menu, not the full
  results container. The strengthened native regression failed before this fix:
  offscreen font previews were loaded immediately. It now checks unloaded state
  outside the viewport/root margin and real FontFace loading after scrolling in.
- `PreviewShapeTool`: pending edits remain pending throughout transformations;
  collapse duplicate state checks. In-memory history always captures initialized
  pointer/last-point/bounds values from mouse-down, so clone them directly when
  capturing/restoring. Ending an edit centrally destroys its nubs; positioning
  routines do not need a second inactive cleanup loop. Native pixel/history tests
  cover hover rotation, singular transform cancellation and no color-form fallback.
- Native tests cover public paths with empty figures: exact brush clipping, flood
  fill, crop and full pixel undo/redo. Also cover modifier-driven selection redraw,
  late canceled text synchronization and restored hidden-form notifications.
- Clipboard fixture preparation retries only transient InvalidStateError when the
  real X11 clipboard ownership changes between read and getType; other failures
  propagate. It still waits for real decoded image dimensions, with no clipboard
  replacement or fabricated success.

- `MeasurementUnitSelectorItem.getText`: removing every entry through the inherited
  public API no longer dereferences a null selection during reinitialization.
  Native regression failed before the fix and now verifies a disabled empty
  control. Other tests cover optional View entries, top-level menu click ownership,
  right-opening submenus, unregistered icon callbacks/tooltips and non-element focus.
- Layerless-document regression initially exposed crashes in layer command/menu
  refresh after removing the final layer. `LayerAction` now requires an active
  layer by default, with Add Layer explicitly allowing recovery. Navigation guards
  reject absent active layers; AddNewBlankLayerFunction inserts the first layer at
  index zero. Native tests cover empty Move activation, disabled commands,
  transparent first-layer recovery and exact empty/one-layer undo/redo.
- Dialog tests verify empty resize percentage/dimensions/resolution, aspect from
  height and centimeter DPI conversion through actual DOM input/submission.

- Implement `MoveToolBaseContext.dispose` TODO: dispose/null owned transforms and
  the start path idempotently. `MoveToolContext` delegates shared cleanup to it.
  Native contracts verify actual resource release and independent history clones;
  transform, pending-shape, Move and document-contract scenarios all pass.
- Shape edit history delegates cancellation to `restorePendingState`, which owns
  restoring an existing transaction. Existing exact-pixel edit undo/redo passes.
  The latest full measurement includes this batch.

- `AppView.cleanCursorImage`: preserve genuine red artwork. The old decoder
  zeroed every opaque red pixel even without edge metadata. Crop the metadata
  row/column without erasing interior pixels. Native regression failed before
  the fix and now verifies exact dimensions, center/encoded hotspots and alpha
  for marked/unmarked PNGs. Existing extracted cursor paths remain covered.
- Additional routing tests verify legacy uncoalesced pen samples, zero pressure,
  image-cursor restoration after middle-button pan, handled keyboard nudges,
  top-left auto-scroll/clamping/native subpixel rounding, and interrupted-release
  error cleanup. The full test run passes with all 254 runtime files included.

- `ColorsForm.getUserPalettes`: reject array JSON roots and normalize valid
  registries to dictionaries with no prototype. Previously array roots silently
  discarded new named palettes and `__proto__.txt` reported a successful import
  without preserving a palette. The new VM regression failed before the fix;
  contract tests and native color controls pass. It verifies round-trips for
  `__proto__`, `constructor` and `toString` through actual File text and storage.
  The latest full coverage measurement includes this fix.

- `EffectConfigDialog`: rely on the existing cancelAnimationFrame/clearTimeout
  ownership for queued preview callbacks, removing two unreachable generation
  checks inside already canceled synchronous tasks. Keep the generation check
  after asynchronous preview completion. Native tests cancel before the frame,
  between frame and timer, and after async preview starts; rapid updates render
  only final values. All pass in the full coverage run.
- Additional native contracts verify slider/wheel DOM drags and release cleanup,
  pointer-driven list dragging, antialiased clone pixels and offscreen no-op
  history, nameless palette imports, iconless palette rows, blank layer names,
  empty opacity and stale layer-dialog callbacks.

- `ToolMenu.createSizeControl`: committing nonnumeric text or Infinity through
  change/Enter previously stored NaN as the brush width. Native regression failed
  before the fix; commits now normalize against the last valid setting and retain
  the existing empty-field minimum behavior. Fresh mapped build and the toolbar
  scenario pass; the latest full coverage run includes this production fix.

- `DocumentIO.handleDroppedFiles`: snapshot the caller-owned array before async
  font imports; a regression demonstrated that clearing the caller array could
  lose its image. Ignore empty drops. The fonts-only path already returns before
  mixed import, so the redundant post-filter fonts-only block is removed.
- Remove unused toolbar numeric suffix support (no definition supplied a suffix)
  and the Settings navigation unimplemented flag (all sections are implemented).
  Disabled platform-specific settings and unregistered Tools entries retain their
  existing contracts and native tests.

- `DocumentWorkspace.onLayerRemoving`: preserve an unrelated active layer; when
  removing the active row choose its surviving neighbor, or null for the final
  row. Native tests reproduce the previous inactive-row selection change and
  validate final-layer cleanup. Also assert empty zoom and invalid nub transform.
- `PdnDocumentCodec.createHeader`: validate integer dimensions (1..32768) and
  layer count (1..64) before XML interpolation. Reject malformed/unsafe values.
  The bounded header is below 200 bytes, so the old unreachable 24-bit XML-size
  guard is replaced by meaningful input validation. Test upper bounds and XML.
- Clipboard setup now waits for the real browser clipboard read and image decode
  to observe the just-written dimensions. Focus alone did not eliminate X11
  propagation races. No clipboard implementation was mocked or replaced.

- `ToolSelector.setSelectedId`: reject an unknown tool before mutating the
  selected entry. VM contracts reproduce the prior corrupt selected id and cover
  absent/invalid startup preferences, nested help translations and missing effects.
- Text regressions cover a custom FontFace resolving after insertion begins;
  live font-size changes; editor caret clicks; starting a second text insertion;
  tool Escape; unsupported focus options; and queued overlay cancellation on
  cancel/deactivate. Native font decoding and DOM focus remain real.

- `DocumentStrip`: initialize its optional list reference to null so pre-mount
  lookup/navigation guards work. Native regression reproduces the old undefined
  dereference. Window tests now verify every viewport/sibling snap direction and
  restore registry, dimensions and positions after the assertions.

- `MoveToolBase`: keyboard nudges now explicitly begin a translation; hit testing
  overlapping scale handles no longer resizes tiny selections or single pixels.
  New native workspace lifecycle tests cover full geometry/pixel undo and redo,
  unfinished startup strokes, dirty close confirmation, missing/disposed documents,
  startup failures, invalid units, routing, modal wheel zoom and ruler caching.
- `DrawingTool`: apply the half-pixel offset only to antialiased discrete brush
  geometry; the aliased rasterizer already rounds coordinates. A base unsampled
  one-pixel stroke previously shifted one pixel down/right. Assert its complete
  destination, lazy snapshots and undo/redo. Also cover idle previews, legacy clone
  anchors, ignored releases, flood boundaries and spaced/offscreen recoloring.
- `checkDocumentChrome`: focus the real Electron window and await document focus
  before image clipboard operations, matching the earlier file-workflow fix.

- `ScrollList`: existing missing-key guards logged a diagnostic but later
  unconditionally called `getKey`, crashing mixed lists. Centralize keyed-row
  lookup; static rows still render, report unsupported positioning, and cannot
  begin a reorder. Native tests failed before this fix and verify keyed-row
  lookup, scroll requests, drag cleanup, deferred swaps and actual layer undo.

- `LabelMenuItem.updateText`: update the actual label with or without an icon.
  A new native UI lifecycle scenario reproduces the previous iconless-label
  TypeError and verifies detached items, disabled/standalone menus, numeric input
  guards, modal attention timers and About/Help singleton/toggle behavior.

- `DocumentIO.cropToSelection`: a crop entirely outside the canvas returns false
  and restores the previously active tool. A native regression failed before
  the fix and now verifies the tool, document identity, pixels and history.

- `ToolHistoryMemento.onUndo`: restore the required tool even when the active tool
  has been cleared. A direct-undo regression demonstrated the previous null
  dereference; undo/redo now preserve the operation and restore the tool.
- Additional regressions cover off-canvas copy/cut preserving pixels, clipboard
  identity and history; empty legacy PDN layers and invalid dimensions; even brush
  sprite sizes; and scan conversion switching from roof edges to vertical sides.

- `AppSettingsStore.load`: validate persisted JSON root; `null` no longer aborts
  application initialization. Cover migration, storage failures and theme updates.
- `MoveTool.onPasteMouseDown`: implement and call it from `onLift`; transfer the
  floating source and underlay, preserve overflow, and release temporary canvases.
  Native regressions assert transparent pixels, moved output and complete undo/redo.
- `AppWorkspace.isInitialWorkspaceUntouched`: require an actual active tool
  before inspecting its pending transaction. No tool now permits replacement of
  an untouched startup image and release of its original canvas.
- `AppFile.exists`: Node `fs/promises.access`; `ENOENT`/`ENOTDIR` return false;
  permission/I/O/other errors propagate. Test real temporary files and directories.
- `DocumentIO.readPdn`: legacy JSON `null` reports the documented unsupported
  format error instead of a stray TypeError.
- `SelectorMenuItem.selectNextEntry` and `ToolOptionDropdown.cycle`: guard empty
  choices so cycling does not dereference an unavailable entry.
- `ColorSliderItem`: default provider returns a `Color` (opaque black), allowing
  default construction and actual spectrum rendering.
- `FileAction.performAction`: preserve the inherited explicit abstract-action
  error; an unimplemented concrete file action no longer silently succeeds.
- `PaintBrushTool` and `EraserTool`: clear the cached hover point outside the
  canvas so a width change cannot revive a stale preview. Assert unchanged pixels.

## Additional resumed-session test coverage

- Full-canvas merged copy asserts genuine encoded composition pixels despite a
  denied system clipboard write; outline replacement releases the old path.
  Also cover hidden RGB at zero alpha, corrupted per-tool quality migration,
  unmounted panels, custom-tool option fallbacks and disabled unknown tool rows.

- Verify CPU Gaussian output when a present Canvas filter property rejects blur,
  and unavailable Path2D/DOMMatrix catalog fallbacks in isolated environments.

- Actual UI callback tests cover registered standalone/nested menu commands,
  mounted ids and named checkboxes, floating-form and palette toggles, zoom field
  submission, custom adjustment factories and the window-close platform boundary.

- Independent native Canvas masks validate concave stencil outlines, holes and
  islands; a separate queue-based four-neighbor oracle validates scanline flood
  filling around an enclosing hole with a disconnected blue island. Single-
  rectangle region conversion asserts coordinates and clone independence.
- Effect preview failure tests cover thrown/rejected callbacks, original error
  diagnostics, cleared busy state, repeated cancellation and late completion
  after close. New-file cancel and blocked/quota-exhausted image-size preferences
  are also verified without changing persisted data.

- Shape regressions cover separate antialiased rectangle interior/outline colors
  with exact undo/redo, unknown persisted shape fallback, filled-arrow/flat line
  caps, line-body hit testing, and distant/uninitialized specialized handles.
  `PreviewShapeTool` no longer branches on `supportsPendingEdit()` (always true
  with no overrides): every current shape follows its editable-preview lifecycle.

- Effect editor tests now cover optional identity curves without shared mutable
  arrays; numeric levels endpoints crossing each other; ignored idle/right/middle
  pointer gestures; context-menu suppression on slider thumbs; endpoint protection;
  and removal of an actively dragged curve point by a programmatic curve update.

- Native document contracts now also cover unattached/null-geometry renderer
  no-ops with unchanged pixels; opaque aliased selection edges; empty/offscreen/
  non-bitmap fill and erase operations; missing color providers; empty bitmap
  history chunks; rectangle-array invalidation; typed history rejection; and
  abstract actions invoked through their generated UI callbacks.

New root tests: `app-settings-store.test.js`, `font-manager.test.js`,
`tool-settings.test.js`. New native scenarios: `checkDocumentContracts.js`,
`checkBrushContracts.js`, `checkMoveModes.js` (registered in `desktop.test.cjs`).

Expanded meaningful regressions include:

- History navigation, compound undo/redo ordering, tool restoration and listener
  ownership/cleanup for list dragging.
- Font metadata caches, real native corrupt-font rejection, 21-row chunked UI
  rendering, lazy-load/storage failures, failed deletion and successful retry.
- Scoped web cache/service-worker update cleanup, cancellation and error recovery;
  language changes, reload callback and WebGL-unavailable contexts.
- Clipboard pixel identity, digests, narrow/offscreen viewport positions, missing
  clipboard images, reentrant close locks and failure cleanup.
- GIF dictionary growth/reset with 32,768 independently generated palette pixels
  decoded by the portable codec; native JPEG fallback and unsupported formats.
- Gamma-space filtering and CPU Gaussian fallback on native canvas failures.
- Real History window buttons/rows, visible-layer fallback, numeric/text controls,
  empty selectors, missing local icons, footer measurement/zoom controls,
  remembered effect icons, Help routing, tool-grid selection and dialog cancellation.
- Late/out-of-order save success/failure generations with genuine encoded images,
  KB/MB labels and stale close callbacks.
- Native pointer errors, stopped auto-scroll/capture state, preserved pixels and
  error routing without weakening the global renderer error detector.
- Exact Move scale/90-degree rotation preview, toolbar Finish and full undo/redo.

The native clipboard test in `checkFileWorkflows.js` was flaky because
`did-finish-load` may run before `ready-to-show`. It now focuses the real window
through `paintdotjs:test-input` and waits for `document.hasFocus()` before
clipboard operations. No clipboard implementation was replaced or stubbed.

## Earlier approved production fixes (preserved from the previous session)

These changes were discussed with and approved by the user. Keep them.

| Source | Change |
|---|---|
| [PreviewShapeTool](./js/src/engine/document/tool/tool/PreviewShapeTool.js) | Scale pending shapes by displacement from the initial handle press; preserve geometry on stationary/off-center presses. Normalize inclusive aliased rectangle bounds and avoid a duplicate Canvas outline. |
| [RectangleSelectTool](./js/src/engine/document/tool/tool/RectangleSelectTool.js) | Normalize fixed-ratio selections in all four drag quadrants. |
| [File](./js/src/io/File.js) | Preserve absolute/relative path kind when obtaining a parent. |
| [WebFile](./js/src/io/file/WebFile.js) | Write using the existing IndexedDB `fileName` key; no schema migration. |
| [MoveTool](./js/src/engine/document/tool/tool/move/MoveTool.js) | Finish history snapshots include clipped source and transformed destination footprints. Redo no longer leaves a copy at the old origin. Existing dirty-rectangle merging avoids capturing the gap/full canvas. |
| [VertexList](./js/src/engine/document/selection/VertexList.js) | Shared adaptive ellipse generation, default 0.01px chord error, cardinal bounds, explicit finite-bound/tolerance/count validation. |
| [EllipseSelectTool](./js/src/engine/document/tool/tool/EllipseSelectTool.js) | Delegate existing adaptive ellipse generation to the shared helper without degrading selection accuracy. |
| [GraphicsPath](./js/src/engine/document/selection/GraphicsPath.js) | Skip empty degenerate ellipses; repair `flatten()` to validate tolerance and transform already-linear paths without deleting short/duplicate/closed/hole vertices. |
| [Tool](./js/src/engine/document/tool/Tool.js) | Implement Hue/Saturation/Color/Luminosity software blending with W3C weighted luminosity, saturation and gamut clipping. Avoid extra calculations for transparent source/backdrop. |
| [SettingsDialog](./js/src/interface/window/dialog/SettingsDialog.js) | Disable Windows Pen & Ink/display links outside the Windows desktop app. Browser checks short-circuit without requiring Node's `process`. |
| [FontManager](./js/src/engine/util/FontManager.js) | Resolve storage operations after transaction completion, not request success. A successful request followed by transaction rollback must reject, not acknowledge a lost write. |
| [DocumentWorkspace](./js/src/engine/document/DocumentWorkspace.js), [DocumentWorkspaceAction](./js/src/engine/document/history/action/actions/DocumentWorkspaceAction.js) | Share document-action dispatch. Push only actual history mementos; handle asynchronous results/errors as the former UI dispatcher did. Prevent `undefined` history entries after actions that already record history. |

Important decisions:

- **Actual ellipse selection was already adaptive.** Only the old VertexList
  helper used a fixed 32 segments. Do not repeat the earlier incorrect claim
  that selection itself was fixed-resolution.
- The user explicitly chose to **retain and repair GraphicsPath.flatten**.
  It still has no application caller, but its API is intentionally retained;
  the shared ellipse helper is the live integration.
- Transform handles stay static; **do not add pulsation**.
- CPU final-frame rectangular selection edge coverage matches the GPU.
- Palette names are literal text; preserve trusted formatting in other menus.
- Keep the shared `navigator.clipboard` implementation; no new clipboard IPC.
- Hue/Saturation/Color/Luminosity comparisons allow up to two channel bytes of
  native Canvas rounding difference. Do not claim Paint.NET equivalence.
- Do not refactor unrelated architecture or silently legitimize broken behavior
  solely to reach coverage.

## Tests added and extended

New root test files:

- [abstract-contracts.test.js](./tests/abstract-contracts.test.js):
  window, history, renderer and UI/item API contracts and cleanup.
- [action-shortcuts.test.js](./tests/action-shortcuts.test.js):
  tool cycling, timeout, conflicts, registration and storage failures.
- [document-io-boundaries.test.js](./tests/document-io-boundaries.test.js):
  document boundaries, picker/save configuration, flatten consent, failed writes,
  dirty-state preservation and save-all focus restoration.
- [error-reporting.test.js](./tests/error-reporting.test.js):
  real ErrorForm installation/reporting and AppView routing in an isolated VM.
- [file-storage.test.js](./tests/file-storage.test.js):
  platform caching, temporary-file collisions and explicit storage failures.
- [settings-platform.test.js](./tests/settings-platform.test.js):
  Windows-link gating for Windows/Linux/macOS/FreeBSD and a Node-free browser.

New runtime scenarios:

- [checkPendingSelections.js](./tests/runtime/checkPendingSelections.js)
- [checkToolbarWindows.js](./tests/runtime/checkToolbarWindows.js)
- Registered in [desktop.test.cjs](./tests/desktop.test.cjs).

Extended root tests: [effects.test.js](./tests/effects.test.js),
[geometry-color.test.js](./tests/geometry-color.test.js),
[pdn-codec.test.js](./tests/pdn-codec.test.js),
[platform-runtime.test.js](./tests/platform-runtime.test.js).

Notable real runtime regressions:

- [checkControls.js](./tests/runtime/checkControls.js): color UI/palette gestures,
  directory picker and real FileList fallback imports, real font storage commits,
  rollback/request/version errors, clipboard and recovery behavior.
- [checkSettingsControls.js](./tests/runtime/checkSettingsControls.js): font picker
  import/reset, clear-button confirmation, and disabled Windows controls on Linux.
- [checkFileWorkflows.js](./tests/runtime/checkFileWorkflows.js): actual new-document
  dispatch, default/active/clipboard dimensions, print dimensions/DPI/unit conversion,
  percentage limits, resampling reset and accessible canvas anchors.
- [checkDocumentChrome.js](./tests/runtime/checkDocumentChrome.js): native held/tapped
  tab-navigation presses, real pointer capture, repeat timing and release cleanup.
- [checkEffectControls.js](./tests/runtime/checkEffectControls.js): normalized/copied
  curve input and canceled edits begun through genuine native pointer capture.
- [checkSavingClipboard.js](./tests/runtime/checkSavingClipboard.js): rapid format
  switching, independent quality values, fresh JPEG signature/MIME/dimensions
  when submitting before the preview debounce completes.
- [checkLayerActions.js](./tests/runtime/checkLayerActions.js): exact layer/flatten
  pixels and identity, shared synchronous/asynchronous action history, error
  reporting, and actual layer-row double-click behavior.
- [checkSurfaceTransactions.js](./tests/runtime/checkSurfaceTransactions.js):
  700 native Canvas blend comparisons, actual clipped bucket pixels and undo/redo,
  sparse snapshots and explicit abstract move/selection contracts.
- [checkTransformTools.js](./tests/runtime/checkTransformTools.js): frame coalescing,
  live resampling/gamma, exact moved pixels and snapshot allocation budgets.
- [checkPixelTools.js](./tests/runtime/checkPixelTools.js): clone source warnings,
  deleted source layers, settings/preview changes and exact paint/history pixels.
- Other extended scenarios: browser/WebFile/welcome behavior, GPU error/cache
  paths and text/gradient fallback rendering.

Move snapshot tests assert 54x30x4 bytes for the overlapping example and
(40x20 + 34x24)x4 bytes in two chunks for the disjoint clipped example.
Ellipse tests measure chord error through 16,000px dimensions.

## Coverage audit

The latest successful report has no uncovered runtime lines, functions or branch
ranges. All first-party runtime sources remain included.

Known audit points:

- `GraphicsPath.combine` now dispatches empty paths within the validated outer
  enum cases, removing unreachable nested defaults. Exhaustive mode/empty-input
  tests retain clone independence and rejection of invalid enum arguments.
- New/resize dialog synchronization no longer maintains an unreachable reentry
  flag: native input.value assignments and textContent updates dispatch no input
  events. Existing native pixel/print/DPI/aspect/mode tests pass after cleanup.
- Removed obsolete `MoveTool.didPaste` state, which was never true; DocumentIO
  already records Paste separately. Native Move tests preserve exact pixels and
  full undo/redo, including layer context switching, empty release, idle-callback
  fallback, owned paste-buffer disposal, default history names and external
  selection changes that interrupt Move/selection-Move gestures.
- `MoveTool.onPasteMouseDown` and `AppFile.exists` are now implemented and tested;
  the older instructions about their empty stubs no longer apply.
- Keep function coverage honest; line/branch gaps still matter even with 100%
  function coverage. Keep all first-party sources included.

## Resume commands

System Node is older. Use the existing Node 24 installation:

```bash
. "$HOME/.nvm/nvm.sh"
nvm use 24

npm run test:coverage
npm run lint
npx eslint tests
npm run check-headers
npm run check-version-info
npx c8 report --check-coverage --lines 100 --branches 100

npm run dist:deb
dpkg-deb --field dist/paintdotjs-2.1.16-linux-amd64.deb Package Version Architecture Depends
```

The strict gate passes at this checkpoint. Keep the thresholds at 100% when changing runtime sources.
Do not install dependencies unless a chosen command actually reports missing ones
or dependency manifests change.

**Never run coverage and package/desktop builds concurrently.** They overwrite
the same webpack artifacts and can invalidate original-source mappings.
Run the strict report before packaging. If a build changes the emitted bundles,
rerun the coverage command before regenerating coverage reports.

The coverage script automatically discovers root Node test files. Direct
`node --test` worked reliably; editor test discovery previously failed.
Production changes need fresh bundles before desktop scenarios; the full coverage
command performs the mapped build.

Useful targeted native scenarios:

```bash
node --test tests/settings-platform.test.js tests/error-reporting.test.js
node --test --test-name-pattern='desktop color palettes|desktop layer|desktop file import' tests/desktop.test.cjs
node --test --test-name-pattern='desktop effect sliders|desktop save previews|desktop toolbar option' tests/desktop.test.cjs
node --test --test-name-pattern='desktop document strip|desktop surfaces' tests/desktop.test.cjs
```

## Test and workflow pitfalls

- Do not remove runtime sources from measurement, add ignores, mutate enums,
  stub real results as success, or invoke functions without a meaningful oracle.
- Use independent pixels, exact output shapes, real state/history identity,
  cleanup and measured thresholds.
- Real pointer capture/user activation must not be faked. Existing native input
  harness: Electron IPC `paintdotjs:test-input`.
- Electron 44 does not expose the renderer `clipboard` module used by older
  code. The actual image clipboard regression uses
  `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`.
- Legacy `execCommand("copy")` needs a real user gesture; its regression uses
  native mouse down/up and checks actual clipboard contents.
- Deliberate global renderer error events trigger harness failure detection.
  Use the isolated error-reporting VM instead of weakening that detector.
- Synthetic Escape must target a modal descendant, not the document.
- CurveEditor cancellation releases capture/dragging without another preview
  notification; do not incorrectly expect an extra commit callback.
- Selection gestures <=50ms can intentionally clear; wait >50ms when required.
- Empty selection means unmasked; include that in independent pixel oracles.
- BitVector2D.get returns 0/1, not a boolean.
- Buffer.slice shares storage; use Buffer.from for independent malformed fixtures.
- Adding/selecting a layer can change the active target. Restore it explicitly
  when a pixel oracle needs the original layer.
- Keep braces for all control-flow bodies, ordinary locals as `let`, one class
  per source file and existing package organization.
- Implement concrete stubs/TODOs without asking again, as explicitly requested.
  Clarify only behavior/architecture requirements that genuinely cannot be inferred.

When the target really passes, rebuild/inspect the Ubuntu DEB, rerun the final
checks and commit the verified work with:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
