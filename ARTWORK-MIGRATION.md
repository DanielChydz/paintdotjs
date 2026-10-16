# Open asset migration (completed, 2026-10-16)

Completed migration commits: 1e28a16, 7b08665, 487fe3b and 451183d. Follow-up fixes
cover packaged manifest lookup, unquoted generic system-ui fonts, byte-stable
Windows checkouts and offline PWA startup. Regression tests cover these contracts.

User request: replace Paint.NET artwork/fonts and all acquisition of proprietary
resources, based on https://github.com/LabyStudio/paintdotjs/issues/5. Keep committing
verified batches. No external messages, no publishing, no installing packages on the
user's system. No subagents are authorized.

Implemented: Lucide Static 0.468.0 ISC icons (upstream SVGs + license), Inter variable
OFL font (revision and hash in artwork/SOURCES.md), original P pixel-ribbon app/file
marks and cursor compositions with precise hotspot metadata. All runtime artwork
is checked in, verified by local SHA-256 catalog, bundled for desktop/web; no archive
is downloaded. Old user caches/environment overrides are deliberately ignored.
AUR/Flatpak/release metadata no longer refer to the Paint.NET release archive.
English labels are newly authored from project identifiers, not extracted strings;
only English is currently shipped, with the language loader retaining fallback.

PDN templates are independently generated using MIT ms-nrbf-js from the explicit
NRBF schema in scripts/resource/PdnTemplateFactory.js; all 64 layer counts have a
parser-based regression oracle and deterministic asset-source checks. Placeholder
sizes avoid collisions with object ids. Older paint.js broken blend-mode files
remain recoverable using numeric layout facts instead of shipping their old graphs.
A manual in-memory compatibility check read pre-migration graphs via git show HEAD
(before committing migration) for 1, 2, 3, 16, 64 layers and all 14 modes: passed.
Script: /tmp/paintdotjs-open-assets/verify-legacy.mjs (pin the pre-migration
commit 3ae2261 before rerunning after a migration commit). Old bytes were not written to the repo.

Verified source checkpoint: 210 tests passed; 100% of 40,980 runtime lines,
9,947 branches and 2,515 functions across all 255 runtime files. Strict coverage
check, source/test lint, headers, version and asset/whitespace checks passed.
Logs: /tmp/paintdotjs-open-coverage.log, /tmp/paintdotjs-open-strict.log.

Native desktop and Node-disabled browser smoke checks decode every bundled image,
load Inter, check both licenses, action labels and tooltips, and check the About
mark. README header/app/web screenshots and sample document now use original art.
All dynamic labels (including color channels and Move history) are authored locally.
A missing tooltip id now falls back to its own action name instead of a .null key.
Artwork regeneration was run twice and catalogued outputs compared byte-for-byte:
identical. ImageMagick timestamps are stripped. Old .tmp/paintdotnet archive removed.

Final distribution verification (Node 24, Linux amd64, no publishing/installing):
- npm run pwa and npm run dist:deb passed sequentially from source commit 451183d.
- All 401 catalogue hashes match in Pages, the unpacked application and extracted
  DEB. The PWA precaches all 401 assets, including licenses; 419 files total.
  Original sample/social artwork and project attribution match the sources.
- The actual packaged binary passed an offline reload through CDP under Xvfb:
  document creation, displayed image decoding, loaded Inter face, logo/font hashes
  and both licenses verified. DEB ASAR bytes match the tested unpacked binary;
  archived asset-manager and asset-guard sources match the fixed repository files.
- The production PWA passed a real service-worker-controlled reload after its
  HTTP server was stopped, with Node disabled. Document creation, displayed
  images, loaded Inter face, logo/font hashes and both cached licenses verified;
  no page console errors. The guard now trusts the bundled default dictionary
  instead of issuing a synchronous XHR that fails during offline reloads.
- Packaged manifest resolution uses resources/desktop outside ASAR. The earlier
  broken DEB/unpacked output has been replaced by the verified rebuild.

Artifacts: pages-dist/, dist/linux-unpacked/,
dist/paintdotjs-2.1.16-linux-amd64.deb (untracked build outputs).
DEB SHA-256: 7ee4861012dce3055a1b50277ae04a90d0490c4b9996c434c84c364552e00c35
Catalogue SHA-256: 04e20018c87e33928f33fbb51d0f65b6623a52d2a4189483f17b21b7414ee1bb
Other platform packages were not built in this Linux verification.

Verification logs: /tmp/paintdotjs-open-pages.log, /tmp/paintdotjs-open-deb.log,
/tmp/paintdotjs-open-distribution-audit.log, /tmp/paintdotjs-open-pwa-check.log,
/tmp/paintdotjs-open-package-check.log, /tmp/paintdotjs-open-package-runtime.log.
Temporary smoke harnesses: /tmp/paintdotjs-open-assets/check-pwa.cjs and
/tmp/paintdotjs-open-assets/check-package.cjs (require Xvfb and local Electron).

Regeneration (offline, Node 24; graphics regeneration also needs Pillow/convert):
python3 scripts/generate_artwork.py
node scripts/generate_pdn_templates.js
node scripts/generate_asset_manifest.js
npm run check-assets

Downloads used only for vendoring open resources are under /tmp/paintdotjs-open-assets;
no dependency manifest changes were needed. Source license URLs are in SOURCES.md.
