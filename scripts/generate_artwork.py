#!/usr/bin/env python3
"""Regenerate checked-in artwork offline. Requires Pillow and ImageMagick convert.
Sources and redistribution licenses are documented in artwork/SOURCES.md.
"""
import json
import pathlib
import re
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
ART = ROOT / 'artwork'


def svg(body, width=24, height=24):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>'


def raster(source, output, size):
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['convert', '-background', 'none', '-density', '384', 'svg:-',
                    '-resize', f'{size[0]}x{size[1]}!', '-strip', 'PNG32:' + str(output)],
                   input=source.encode(), check=True, capture_output=True)

# Original pixel-ribbon P mark; no photo, brush, or Paint.NET artwork.
mark = svg('''<rect x="4" y="4" width="120" height="120" rx="30" fill="#142b3b"/>
<path d="M32 96V32h36a24 24 0 0 1 0 48H48v16zm16-32h20a8 8 0 0 0 0-16H48z" fill="#48d8c1"/>
<rect x="88" y="86" width="12" height="12" rx="3" fill="#b69aff"/>
<rect x="72" y="100" width="12" height="12" rx="3" fill="#ffce6b"/>''', 128, 128)
(ART / 'logo.svg').write_text(mark + '\n')
(ASSETS / 'icon.svg').write_text(mark + '\n')
raster(mark, ASSETS / 'icon.png', (512, 512))
Image.open(ASSETS / 'icon.png').save(ASSETS / 'icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
# User-selected desktop icon is kept byte-for-byte; the web keeps its own mark.
desktop_icon = (ART / 'desktop-icon.png').read_bytes()
(ASSETS / 'desktop-icon.png').write_bytes(desktop_icon)
(ROOT / 'desktop-resources/icon.png').write_bytes(desktop_icon)
file_mark = svg('''<path d="M20 4h58l30 30v90H20z" fill="#f5fafc" stroke="#486474" stroke-width="4"/>
<path d="M78 4v30h30" fill="none" stroke="#486474" stroke-width="4"/>
<g transform="translate(28 42) scale(.55)">''' + re.search(r'<svg[^>]*>(.*)</svg>', mark, re.S)[1] + '</g>', 128, 128)
(ART / 'file-icon.svg').write_text(file_mark + '\n')
(ROOT / 'desktop-resources/file-icon.svg').write_text(file_mark + '\n')
raster(file_mark, ROOT / 'desktop-resources/file-icon.png', (512, 512))

# The upstream icon pack is vendored byte-for-byte, not regenerated here.
provenance = json.loads((ART / 'upstream-icons.json').read_text())
for alias, target in provenance['aliases'].items():
    (ASSETS / alias).write_bytes((ASSETS / target).read_bytes())
print('Generated original branding and copied upstream icon aliases.')

(ASSETS / "lang/en.json").write_bytes((ART / "en.json").read_bytes())

# Original repository banner, typeset using the bundled OFL font.
header = Image.new('RGBA', (960, 240), '#142b3b')
header.alpha_composite(Image.open(ASSETS / 'icon.png').resize((190, 190), Image.Resampling.LANCZOS), (24, 25))
draw = ImageDraw.Draw(header)
font = ImageFont.truetype(str(ASSETS / 'font/Inter.ttf'), 84)
small_font = ImageFont.truetype(str(ASSETS / 'font/Inter.ttf'), 27)
draw.text((244, 40), 'paint.js', font=font, fill='#f3fbff')
draw.text((250, 146), 'Open source image editor', font=small_font, fill='#a8c8d9')
header.save(ROOT / '.github/assets/header.png')

# Original sample document replaces the old unattributed stock photograph.
sample = svg('''<defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#182d55"/><stop offset="1" stop-color="#346f89"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#sky)"/>
<path d="M140 640C140 80 540 30 960 640Z" fill="#ffcb75"/>
<path d="M390 640C390 80 790 30 1060 640Z" fill="#bba0ef"/>
<path d="M640 640C640 80 1040 30 1140 640Z" fill="#47d4c0"/>''', 1280, 720)
(ART / 'sample.svg').write_text(sample + '\n')
raster(sample, ROOT / 'run/test.png', (1280, 720))
