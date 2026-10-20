# Firefox compatibility checkpoint — 2026-10-20 (unfinished)

User requested item 21 starting with Firefox only. **Do not start Safari** until
an explicit later user decision. User then requested saving the work, committing
on develop and pushing both primary and develop branches. The primary branch is
`master` (origin/HEAD -> origin/master); there is no `main` branch.
Do not merge this unfinished Firefox work into master.

## Changes saved

`2bfa92a fix(web): preserve native image paste and exact portable exports`:

- Web AppView lets the configured ordinary paste shortcut produce the browser's
  native ClipboardEvent. Cancelling Ctrl+V prevented image paste in Firefox.
  Desktop and custom/modified shortcuts retain existing dispatch.
- DocumentIO ignores image paste in input/textarea/contenteditable and modal
  dialogs. It retains internal-image fallback when a native paste has no image.
- File input fallback is attached to the document until selection/cancellation,
  and removed on success, failure or a rejected click. Applies to open and layers.
- ImageEncoder uses portable `encodePixels(ImageData, format, quality, options)`
  to avoid Firefox native PNG intermediate rounding transparent RGB by one level.
  The existing encoded-PNG API and legacy fallback remain available.
- Boundary tests and shared `checkFirefoxCompatibility.js` test raw exports,
  input validation, clipboard routing/custom bindings and legacy codec fallback.
  A Node-disabled Chromium scenario was added for coverage of the new branches.

Additional harness work:

- `scripts/test_firefox.js`, `scripts/browser/FirefoxSession.js`,
  `scripts/browser/FirefoxFileClipboardChecks.js`: no new npm dependencies;
  geckodriver's HTTP WebDriver API, real Firefox and native file inputs/downloads,
  trusted keyboard actions, X11 clipboard, reload persistence and PWA checks.
- `npm run test:firefox` runs `pretest:firefox` (`npm run pages`) then Xvfb tests.
  Direct `xvfb-run -a node scripts/test_firefox.js` reuses existing web/pages builds.
- WebRuntimeServer supports a selectable loopback host and static production PWA
  mode, including Workbox JS and run/test.png. Existing Chromium defaults retained.
- Shared painting/pixel/layer/transform tests report phases without requiring
  Electron in a real browser. JPEG XR byte-input oracle now compares against the
  input PNG's decoded pixels; raw canvas export has a separate exact RGBA check.

## Environment / isolation

Firefox 158.0 at `/usr/lib/firefox/firefox`, official geckodriver 0.37.1 downloaded
in `/tmp/paintjs-firefox-tools/geckodriver`. Xvfb/xclip are already installed.
Driver uses a fresh temporary profile/download directory, removed at teardown.
**Force `MOZ_ENABLE_WAYLAND=0`, `GDK_BACKEND=x11`, `WAYLAND_DISPLAY=""`**, as in
FirefoxSession. Initially Firefox inherited Wayland despite Xvfb and displayed on
the user's desktop; the user was informed and subsequent tests were isolated on
X11. Do not rely on DISPLAY alone. Do not print clipboard text while diagnosing;
use only known test data on the isolated X11 clipboard.
Camera prefs force fake media and test-only camera permission; no physical camera
is needed. Do not enable clipboard permission bypass prefs.

Working command (last session):

```sh
. /home/dchydzinski/.nvm/nvm.sh && nvm use 24 >/dev/null
GECKODRIVER=/tmp/paintjs-firefox-tools/geckodriver \
FIREFOX_BINARY=/usr/lib/firefox/firefox \
PAINTJS_FIREFOX_REPORT=/tmp/paintjs-firefox-report \
xvfb-run -a node scripts/test_firefox.js
```

Build first with `npm run pages`, or use `npm run test:firefox` (prehook builds).
Read the harness before rerunning. No tests should touch the normal user profile.

## Evidence so far

- `node --test tests/document-io-boundaries.test.js`: **31 passed**, no failures.
  Log `/tmp/paintjs-firefox-io-tests.log`.
- Lint passed at last invocation (`/tmp/paintjs-firefox-lint.log`). Source changed
  afterwards in test scripts; rerun checks before claiming final validation.
- Desktop build with new raw codec passed (`/tmp/paintjs-firefox-build.log`).
- Real Firefox passed: raw input validation/export, assets/About credits,
  export options, HEIC/JPEG XR, ICC/65-layer PDN, large-document effects/history,
  painting, pixel tools, layer actions and transforms.
- Before adding the full camera/production-offline scenarios, real Firefox also
  passed multiple file upload, layer upload, real PNG and PDN downloads/reopen,
  trusted OS image Ctrl+C/Ctrl+V (no duplicate import), native text-field paste,
  IndexedDB across reload, and fixture-worker update/cancellation/unsaved work.
  An earlier successful full harness log was overwritten by subsequent reruns;
  earlier summary was reported to the user. Current log stops on camera below.
- **Full Node/Chromium suite and 100% coverage gate have NOT been run for these
  changes.** Previous 277 tests / 292 files / 100% checkpoint applies to master,
  not this in-progress develop work. No new DEB was built for Firefox changes.

## Outstanding work / current failure

1. `checkCameraCapture` in real Firefox fails its synthetic disconnection case:
   after `video.srcObject.getTracks()[0].dispatchEvent(new Event("ended"))`,
   capture remains enabled, Start remains disabled, track is live, status is
   "Camera ready". The real fake-device preview/photo/import and prior permission
   error/cancellation cases pass. Merely waiting for ended did not fix it; the
   handler does not appear to run for that test's track. Inspect whether Firefox
   video.srcObject tracks are different wrappers/clones from acquired stream
   tracks, or whether the test accesses a stale ready video before the new stream
   is installed. Preserve immediate UI disable and eventual stream cleanup.
   Current detailed error is in `/tmp/paintjs-firefox-regressions.log`.
2. Test the **production** Workbox offline reload and lazy WASM codec. Initial
   attempt timed out because fixture server denied precached run/test.png; that
   allowlist is fixed but not verified because camera now fails first. Production
   URL now uses `/`, not `/?skipWelcome` (that query isn't a precache navigation
   match). Harness dismisses welcome with localStorage after the first visit.
   It waits for active SW, reloads for control, shuts down server, reloads offline
   and round trips one RGBA pixel through JPEG XR. This final phase is unverified.
3. Strengthen/finish tests of internal clipboard fallback if necessary. Default
   Ctrl+V now takes OS native paste; text/no-image paste can use cached internal
   image. An entirely empty OS clipboard may emit no paste event; menu paste
   retains the old fallback. Review without breaking native image or text paths.
4. Add durable human Firefox/browser compatibility matrix to docs/README. No
   Firefox support claim has been added to README yet. State actual tested engine,
   Linux/X11/software-GL scope, absence of Firefox picker handles/direct overwrite,
   download-based saving and recent-file limitations, clipboard gestures/prompts,
   secure context and PWA scope. Safari remains pending, not tested.
5. Run lint/headers/assets/version checks, full coverage gate and final Firefox
   suite; fill any new coverage holes without exclusions. Verify desktop package
   if creating one. Only then merge into master, with Conventional Commits.

Current production artifact `pages-dist/` (ignored) was generated during this
session (436 precached files, about 25.11 MB), but may need regeneration as source
changes. Other logs: `/tmp/paintjs-firefox-pages.log`,
`/tmp/paintjs-firefox-report/geckodriver.log`. These paths are local session aids;
repo code and this report must suffice after /tmp cleanup.

## Remote development version retained

After the checkpoint commit, origin/develop was fetched and its sole additional
commit `791a183 chore: start 2.6.1 development` was merged normally, without
rewriting remote history. Develop now uses **2.6.1-dev.0** in package.json and
package-lock.json; the Firefox runs above used 2.6.0 builds. Regenerate builds on
resume. Master stays at 6486561 (completed 19–20 and the user's README disclaimer).
The user explicitly authorized pushing master and develop in this save/stop turn.
