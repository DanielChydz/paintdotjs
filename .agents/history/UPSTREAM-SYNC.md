# Upstream 2.4.3 integration (2026-10-16)

Historical session report; see the [agent index](../README.md) for its scope.
Paths in commands and plain-text artifact references are relative to the repository root.

Source: https://github.com/LabyStudio/paintdotjs, master b4e6fc5.
47 upstream commits are merged as history, preserving the fork's 78 local commits.
Work branch: sync/upstream-20261016; completed on local master.
Point of return: backup/pre-upstream-sync-20261016 (597448c).

## Compatibility decisions

- Imported upstream plugins/catalog/custom dialogs, custom XAML shapes, icon packs,
  configurable UI fonts and the separated Settings entry classes; version 2.4.3.
- Adopted the new upstream interface icons/cursors at the user's request, removing
  the replaced Lucide pack and its vendor sources. All 279 upstream files are
  byte-identical and hash-pinned in artwork/upstream-icons.json; one generic
  effect icon aliases an upstream image. Retained Inter default, authored English,
  generated PDN schemas, desktop icon and desktop title metadata. Upstream's extra
  redistributable font families retain their colocated license texts unchanged.
- Retained SHA-256 verification of bundled assets and refusal to reuse legacy
  downloaded caches/environment overrides. No Paint.NET download was restored.
- Kept the fork's tested source-over floating-paste behavior. Upstream's new
  destination replacement cleared underlay pixels for transparent clipboard
  content and failed the native transparency/undo regression, so its replacement
  changes in MoveTool/MoveToolContext/MaskedSurface were not adopted.
- Kept optimized shared effect/undo snapshots and large-image worker selection,
  adding the upstream plugin worker route rather than replacing the optimizations.
- Kept global error diagnostics, optional ActionRegistry handling and generic
  system-ui font semantics. Fixed upstream Settings Diagnostics referring to a
  graphics helper that moved to a different Settings entry.
- Updated tests to SettingsEntry APIs and asynchronous app startup. Added a real
  import/enable/disable/pixel test for .paintjs, native XAML geometry import, and
  activation/removal of a ZIP icon pack with bundled fallback restoration.
- Preserved the DEB build and packaging filters, desktop icon in AUR/Flatpak, and
  included fflate in both npm lockfile and Flatpak's offline dependency catalogue.

## Verification

211 tests pass; all 280 runtime files included. Lines 95.43% (43,737/45,831),
branches 97.94% (10,363/10,580), functions 95.09% (2,677/2,815).
Upstream added code, so the former 100% gate is no longer met. No runtime files
were excluded and no coverage-ignore annotations added.
Lint, test lint, headers, version information and local asset checks pass.
Coverage log: /tmp/paintdotjs-upstream-icons-coverage.log.
The revised generator leaves upstream artwork untouched; all 403 catalogue hashes
remain byte-identical after regeneration. Desktop/browser visual checks pass;
README screenshots show the adopted upstream pack.

Final source checkpoint c4c5d37 was rebuilt sequentially with npm run pwa and
npm run dist:deb. Production PWA passed an actual service-worker-controlled
reload after stopping the HTTP server, with Node disabled and no page console
errors. The packaged application passed offline reload, image/font decoding,
license checks and document creation. Its window and custom titlebar read
"Untitled — paint.js 2.4.3" and use the supplied desktop icon.

Extracted DEB and Pages match all 403 catalogue hashes; the native system icon
matches the supplied PNG, ASAR contains the current fixed source/attribution,
and all assets/licenses are precached (421 PWA files total). Old Lucide and Segoe
files are absent. Audit log: /tmp/paintdotjs-upstream-distribution-audit.log.
Other logs: /tmp/paintdotjs-upstream-pages.log, /tmp/paintdotjs-upstream-deb.log,
/tmp/paintdotjs-upstream-pwa-check.log, /tmp/paintdotjs-upstream-package-check.log,
/tmp/paintdotjs-upstream-icons-visual.log.

Artifact: dist/paintdotjs-2.4.3-linux-amd64.deb
SHA-256: a548dbe28088b8f4a2c16e7f48a2665721a346bfb42b7010c25d3604022bad06
Catalogue SHA-256:
f32f97f4e2ac94d35ab2685cfe1a331f02afd1d6bd7f9f7ef55426b878289594
Other platform packages were not built in this Linux verification.

Local master contains upstream/master b4e6fc5 (zero upstream commits missing),
and preserves the pre-integration master as an ancestor. No history was rebased
or removed. Per user instruction, all final changes are local; the user will
perform the push. No installation or remote push has been performed.
