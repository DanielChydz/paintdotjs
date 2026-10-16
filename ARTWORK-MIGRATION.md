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

Verification so far: full suite 205 tests passed with new resources/templates;
subsequent PDN compatibility changes passed 14 codec tests. Source/test lint,
headers/version checks and whitespace checks passed before the last codec edits.
Assets hash catalog needs regeneration after asset changes.

Remaining before completion:
- Native asset/font/license/branding checks now pass in desktop and Node-disabled
  browser mode, and fresh app/web screenshots are saved. Finish visual polish of
  the header/cursors and replace the unattributed sample photograph with own art.
- Audit dynamic resource labels and UI appearance; fill any missing icon mappings.
- Recheck package/Pages output includes licenses and all assets, starts offline,
  and contains no old extracted artwork/font/archive. Delete the known obsolete
  .tmp/paintdotnet cache and rebuild old generated distribution artifacts.
- Finish documentation/licensing audit; preserve original MIT source attributions.
- Full lint/header/version/tests and coverage measurement after final edits; update
  COVERAGE-STATUS.md honestly (its 100% snapshot predates this new task).
- Verify the final DEB and web/desktop UI; commit final changes; clean worktree.

Regeneration (offline, Node 24; graphics regeneration also needs Pillow/convert):
python3 scripts/generate_artwork.py
node scripts/generate_pdn_templates.js
node scripts/generate_asset_manifest.js
npm run check-assets

Downloads used only for vendoring open resources are under /tmp/paintdotjs-open-assets;
no dependency manifest changes were needed. Source license URLs are in SOURCES.md.
