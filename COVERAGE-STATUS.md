# Runtime coverage handoff

## Current resumed checkpoint (2026-10-15)

The user resumed the task and explicitly requires **ongoing commits after
verified batches**. The earlier pause and instruction to defer all commits
until 100% are superseded. For unimplemented stubs/TODOs, the user says to
**choose implementation without asking again**. Preserve intentional abstract
base contracts; implement concrete missing functionality.

The target is **100% line and branch coverage of all first-party runtime
sources**, meaningful regressions, fixes for demonstrated bugs, and verified
commits. **The target is not complete.** All functions are now covered, but
line and branch coverage still fail the strict 100% gate.

Latest complete, successful `npm run test:coverage`:

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 41,087 | 41,398 | 99.24% | 311 |
| Branches | 9,484 | 9,818 | 96.59% | 334 |
| Functions | 2,530 | 2,530 | 100% | 0 |

- **182 tests passed; zero failures.**
- All **254 runtime source files** remain included.
- No coverage exclusions or ignore directives were added.
- Full source/test lint, source headers, version checks and `git diff --check`
  passed for this checkpoint.
- `npx c8 report --check-coverage --lines 100 --branches 100` correctly fails.
  A successful measurement is not satisfaction of the target.
- V8 may expose additional branches after new scenarios; always measure fresh.

Reports: `coverage/coverage-summary.json`, `coverage/coverage-final.json`,
`coverage/index.html`. Latest full-run log: `/tmp/paintdotjs-coverage-current.log`.
Strict-gate log: `/tmp/paintdotjs-strict-coverage-current.log`.
Generated reports and bundles are not committed sources.

## Commits and verification

Branch: `master`. The previous dirty worktree was preserved and verified, then
committed as `adfeb59`. Further verified batches were committed as `189caf9`,
`d290185`, `dcf9ff3`, `af5cb23`, `34136f2`, `7a13c2c`, `e58e95d`, `f391874`,
and `0d52f4c`; use `git log` for newer checkpoint commits. Continue committing
verified batches, not only when the overall 100% target passes.

The DEB from the earlier session is
`dist/paintdotjs-2.1.16-linux-amd64.deb`. It predates the document-action dispatcher
and all resumed-session fixes. Rebuild and inspect it after final verification.
Do not run coverage and packaging/build commands concurrently.

This environment's sandbox causes `spawnSync ... EPERM` (even after producing
partial child output), obscuring test failures. Tests/coverage/header checks
were run successfully through approved `require_escalated` tool calls. Git
metadata is read-only inside the sandbox, so commits also need escalation.
No automatic approval review rejected these authorized actions.

## Resumed-session production fixes

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

## Remaining coverage priorities

Inspect original-source statement and branch ranges in the latest detailed
report. All functions have executed with behavioral or contract assertions;
remaining gaps are mostly alternate modes, guards, fallbacks and races.

| Source | Uncovered lines | Uncovered branches |
|---|---:|---:|
| [MoveTool.js](./js/src/engine/document/tool/tool/move/MoveTool.js) | 31 | 16 |
| [DocumentIO.js](./js/src/io/DocumentIO.js) | 24 | 26 |
| [TextTool.js](./js/src/engine/document/tool/tool/TextTool.js) | 22 | 25 |
| [EffectConfigDialog.js](./js/src/interface/window/dialog/EffectConfigDialog.js) | 15 | 20 |
| [MoveToolBase.js](./js/src/engine/document/tool/tool/move/MoveToolBase.js) | 15 | 8 |
| [DocumentStrip.js](./js/src/interface/panel/header/documents/DocumentStrip.js) | 15 | 7 |
| [ColorsForm.js](./js/src/interface/window/form/ColorsForm.js) | 14 | 16 |
| [SaveImageDialog.js](./js/src/interface/window/dialog/SaveImageDialog.js) | 14 | 15 |
| [ImageSizeDialog.js](./js/src/interface/window/dialog/ImageSizeDialog.js) | 13 | 10 |
| [AppView.js](./js/src/engine/AppView.js) | 12 | 25 |
| [PreviewShapeTool.js](./js/src/engine/document/tool/tool/PreviewShapeTool.js) | 11 | 23 |
| [MoveSelectionTool.js](./js/src/engine/document/tool/tool/move/MoveSelectionTool.js) | 8 | 5 |
| [MoveContextHistoryMemento.js](./js/src/engine/document/history/memento/MoveContextHistoryMemento.js) | 8 | 1 |
| [ToolMenu.js](./js/src/interface/panel/header/tool/ToolMenu.js) | 7 | 9 |
| [SettingsDialog.js](./js/src/interface/window/dialog/SettingsDialog.js) | 6 | 17 |
| [PaintBucketTool.js](./js/src/engine/document/tool/tool/PaintBucketTool.js) | 6 | 5 |
| [ToolOptionDropdown.js](./js/src/interface/panel/header/tool/ToolOptionDropdown.js) | 6 | 4 |
| [CloneStampTool.js](./js/src/engine/document/tool/tool/CloneStampTool.js) | 6 | 4 |
| [GraphicsPath.js](./js/src/engine/document/selection/GraphicsPath.js) | 6 | 3 |
| [DocumentWorkspace.js](./js/src/engine/document/DocumentWorkspace.js) | 6 | 1 |

Known audit points:

- `GraphicsPath.combine` now dispatches empty paths within the validated outer
  enum cases, removing unreachable nested defaults. Exhaustive mode/empty-input
  tests retain clone independence and rejection of invalid enum arguments.
- New/resize dialog synchronization no longer maintains an unreachable reentry
  flag: native input.value assignments and textContent updates dispatch no input
  events. Existing native pixel/print/DPI/aspect/mode tests pass after cleanup.
- `MoveTool.didPaste` is only initialized/reset to false; a repository search
  found no assignment of true. Audit obsolete state and valid history semantics.
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

The strict gate will fail until the target is achieved. Keep that failure honest.
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
