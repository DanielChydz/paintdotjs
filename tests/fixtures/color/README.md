# ICC fixtures

`sRGB.icc` in `assets/profiles` was generated with Little CMS through Pillow.
`swapped.icc` copies that freely usable profile and exchanges the rXYZ/gXYZ tag
payloads, so its RGB primaries swap red and green. The embedded description stays
unchanged; tests compare profile bytes and transformed colors, not its name.

`tagged.png` contains pixels (220,60,90,255) and (30,160,70,128), tagged with this
profile. Pillow's independent ImageCms `profileToProfile` conversion to the working
sRGB profile produces `expected.json`: (60,220,90,255), (160,30,70,128).
The desktop/browser scenario embeds these two tiny fixture files as base64 so the
same test also works against an installed package without access to test files.
