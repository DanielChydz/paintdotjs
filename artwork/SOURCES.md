# Asset sources

Desktop application icon: user-selected image, downloaded unchanged from
https://github.com/user-attachments/assets/6ad3bc51-1684-4d19-aa44-7a2881907f3c
on 2026-10-16. The original PNG is retained as `artwork/desktop-icon.png` and
copied unchanged to `assets/desktop-icon.png` and `desktop-resources/icon.png`.
SHA-256: 33b3932e1f570394514f564937530c89fe0c3a6fd68964d682f8cecbc4011504.
This is a supplied image, not artwork authored by this project. The web mark and
document mark described below remain separate assets.

UI icons: Lucide Static 0.468.0, https://github.com/lucide-icons/lucide/tree/0.468.0/icons
ISC license, including the upstream Feather attribution (assets/licenses/Lucide-LICENSE.txt).
Original SVG files are kept in artwork/lucide. The mapping records the selected icon
for every legacy application resource ID; IDs do not denote ownership or provenance.

UI font: Inter variable, unmodified, SIL Open Font License 1.1.
https://github.com/google/fonts/tree/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/inter
License: assets/licenses/Inter-OFL.txt. SHA-256: 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031

The application mark, document mark, cursor composition, sample document, repository banner, enum previews and English
interface dictionary are authored for this project and distributed under its MIT
license. None is traced from or extracted from Paint.NET artwork or resources.
Generated PNGs and ICOs are checked in: builds and application startup need no asset
downloads or image conversion tools. See scripts/generate_artwork.py for regeneration.

## PDN format interoperability

`assets/pdn/templates/*.bin` are independently generated NRBF graphs, not extracted
Paint.NET resources. Run `node scripts/generate_pdn_templates.js` with the pinned
MIT-licensed ms-nrbf-js dependency. The schema is explicit in
`scripts/resource/PdnTemplateFactory.js`; class/member names identify the file
format's CLR serialization contract. Empty metadata and deferred pixel blocks are
constructed from scratch. No original application binaries, resource archives,
artwork or translation dictionaries are inputs to the generator.
