# Runtime coverage handoff

## Resume checkpoint

Resumed at the user's request on 2026-10-14. The user now explicitly requests
ongoing commits after verified batches. This supersedes the earlier pause and
the instruction to defer all commits until 100% coverage.

The task is **not complete**. The user's target is **100% line and branch
coverage of all first-party application runtime sources**, meaningful
regressions, fixes for demonstrated bugs, and a commit after verification.
Do not declare completion at the current percentages.

Latest complete, successful `npm run test:coverage`:

| Metric | Covered | Total | Percentage | Remaining |
|---|---:|---:|---:|---:|
| Lines/statements | 40,006 | 41,417 | 96.59% | 1,411 |
| Branches | 8,515 | 9,180 | 92.75% | 665 |
| Functions | 2,454 | 2,528 | 97.07% | 74 |

- **135 tests passed; zero failures.**
- All **254 runtime source files** are included.
- No coverage exclusions or ignore directives were added.
- The last command completed successfully; no task-owned process remains running.
- Counts can change as additional V8 branches become observable. Use a fresh
  complete measurement rather than extrapolating percentages.

Reports:

- [Coverage summary](./coverage/coverage-summary.json)
- [Detailed coverage](./coverage/coverage-final.json)
- [HTML report](./coverage/index.html)
- Latest full-run log: `/tmp/paintdotjs-coverage-resume.log`

Coverage reports and build outputs are generated artifacts, not committed sources.

## Git and unfinished verification

- Branch: `master`.
- HEAD: `f30aa6d` (`test: expand interactive and platform runtime regressions`).
- The production/test/documentation changes described below were verified again
  and are being committed as the resume baseline.
- The earlier pause created no commit. The resumed work preserves those changes.
- Source lint, source headers and version checks passed after the latest
  production changes. Test lint also passed during the work; full source/test lint, headers and version checks passed again on resume.
- The latest complete coverage run includes all current production fixes and
  test additions and has no known failing test.
- The strict 100% gate is not satisfied. An earlier strict run failed correctly;
  do not confuse a successful measurement command with satisfying the target.

The DEB was built successfully and its Ubuntu `t64` dependencies were inspected:

`dist/paintdotjs-2.1.16-linux-amd64.deb`

That build includes the ellipse, Move history, nonseparable blend, Windows-link
and font-transaction fixes. It **predates the shared document-action dispatcher
fix**. Rebuild the DEB after the final coverage verification.
Build log: `/tmp/paintdotjs-deb-current.log`.

## Approved production fixes after HEAD

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

The latest report's largest gaps, not an exhaustive list:

| Source | Uncovered lines | Uncovered branches |
|---|---:|---:|
| [SettingsDialog](./js/src/interface/window/dialog/SettingsDialog.js) | 100 | 32 |
| [DocumentIO](./js/src/io/DocumentIO.js) | 76 | 45 |
| [MoveToolBase](./js/src/engine/document/tool/tool/move/MoveToolBase.js) | 64 | 10 |
| [MoveTool](./js/src/engine/document/tool/tool/move/MoveTool.js) | 57 | 24 |
| [AppView](./js/src/engine/AppView.js) | 47 | 42 |
| [PreviewShapeTool](./js/src/engine/document/tool/tool/PreviewShapeTool.js) | 45 | 37 |
| [DrawingTool](./js/src/engine/document/tool/tool/DrawingTool.js) | 41 | 18 |
| [EffectConfigDialog](./js/src/interface/window/dialog/EffectConfigDialog.js) | 41 | 31 |
| [FontManager](./js/src/engine/util/FontManager.js) | 40 | 24 |
| [ToolOptionDropdown](./js/src/interface/panel/header/tool/ToolOptionDropdown.js) | 36 | 20 |
| [DocumentWorkspace](./js/src/engine/document/DocumentWorkspace.js) | 31 | 9 |
| [WebWindow](./js/src/interface/window/window/WebWindow.js) | 31 | 14 |
| [AppWorkspace](./js/src/engine/AppWorkspace.js) | 29 | 18 |
| [BitmapEffectEngine](./js/src/engine/document/effect/BitmapEffectEngine.js) | 27 | 18 |
| [SaveImageDialog](./js/src/interface/window/dialog/SaveImageDialog.js) | 25 | 19 |
| [AppSettingsStore](./js/src/interface/window/settings/AppSettingsStore.js) | 24 | 8 |

Investigate actual remaining statement/branch ranges in the detailed report.
Do not assume these totals are unexecuted methods; most of these methods already
have meaningful execution coverage.

Known unexecuted function candidates:

- SettingsDialog: reload callback at line 320; font IntersectionObserver
  callback around line 904.
- DocumentIO: `button.onclick` around line 151 and `pasteFromClipboard` around 964.
- BitmapEffectEngine: `blurDefinition` around 432.
- MoveTool: `onPasteMouseDown` at 199 is an empty TODO method.
  A fresh search found **only its definition**, no callers. Do not add a test
  asserting that this unimplemented paste API returns `undefined`. Clarify with
  the user whether to remove it or integrate an implementation. Real paste
  currently uses the pending surface/origin/underlay path in `onLift`.
- GraphicsPath.combine contains nested defaults that may be unreachable after
  outer enum dispatch. Do not mutate enums to manufacture coverage.
- AppFile.exists is an empty stub from the earlier investigation. Do not invent
  an implementation or bless its missing return without understanding the contract.

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
- Ask for clarification before uncertain behavioral/architectural changes.

When the target really passes, rebuild/inspect the Ubuntu DEB, rerun the final
checks and commit the verified work with:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
