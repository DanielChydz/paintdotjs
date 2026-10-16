# Upstream 2.4.3 integration (2026-10-16)

Source: https://github.com/LabyStudio/paintdotjs, master b4e6fc5.
47 upstream commits are merged as history, preserving the fork's 78 local commits.
Work branch: sync/upstream-20261016.
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

A pre-switch Pages/DEB rebuild passed offline checks. Final verification of the
upstream icon pack is pending. Per user instruction, finish on local master only;
the user will push. No installation or remote push has been performed.
