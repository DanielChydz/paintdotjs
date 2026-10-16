# Open asset migration (in progress, 2026-10-16)

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

Verified source checkpoint: 210 tests passed; 100% of 40,972 runtime lines,
9,942 branches and 2,515 functions across all 255 runtime files. Strict coverage
check, source/test lint, headers, version and asset/whitespace checks passed.
Logs: /tmp/paintdotjs-open-coverage.log, /tmp/paintdotjs-open-strict.log.

Native desktop and Node-disabled browser smoke checks decode every bundled image,
load Inter, check both licenses, action labels and tooltips, and check the About
mark. README header/app/web screenshots and sample document now use original art.
All dynamic labels (including color channels and Move history) are authored locally.
A missing tooltip id now falls back to its own action name instead of a .null key.
Artwork regeneration was run twice and catalogued outputs compared byte-for-byte:
identical. ImageMagick timestamps are stripped. Old .tmp/paintdotnet archive removed.

Remaining before completion:
- Rebuild and audit Pages and DEB/package output, include licenses and all assets,
  verify the actual packaged application reloads offline with the new assets.
- Update final coverage/distribution notes and commit the remaining verification.

Regeneration (offline, Node 24; graphics regeneration also needs Pillow/convert):
python3 scripts/generate_artwork.py
node scripts/generate_pdn_templates.js
node scripts/generate_asset_manifest.js
npm run check-assets

Downloads used only for vendoring open resources are under /tmp/paintdotjs-open-assets;
no dependency manifest changes were needed. Source license URLs are in SOURCES.md.
