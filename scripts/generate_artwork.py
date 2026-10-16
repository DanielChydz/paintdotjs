#!/usr/bin/env python3
"""Regenerate checked-in artwork offline. Requires Pillow and ImageMagick convert.
Sources and redistribution licenses are documented in artwork/SOURCES.md.
"""
import json
import pathlib
import re
import subprocess
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
ART = ROOT / 'artwork'


def svg(body, width=24, height=24):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>'


def raster(source, output, size):
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['convert', '-background', 'none', '-density', '384', 'svg:-',
                    '-resize', f'{size[0]}x{size[1]}!', 'PNG32:' + str(output)],
                   input=source.encode(), check=True, capture_output=True)


def lucide(name, color='#3285a0'):
    source = (ART / 'lucide' / (name + '.svg')).read_text()
    return source.replace('currentColor', color)


# Original pixel-ribbon P mark; no photo, brush, or Paint.NET artwork.
mark = svg('''<rect x="4" y="4" width="120" height="120" rx="30" fill="#142b3b"/>
<path d="M32 96V32h36a24 24 0 0 1 0 48H48v16zm16-32h20a8 8 0 0 0 0-16H48z" fill="#48d8c1"/>
<rect x="88" y="86" width="12" height="12" rx="3" fill="#b69aff"/>
<rect x="72" y="100" width="12" height="12" rx="3" fill="#ffce6b"/>''', 128, 128)
(ART / 'logo.svg').write_text(mark + '\n')
raster(mark, ASSETS / 'icon.png', (512, 512))
Image.open(ASSETS / 'icon.png').save(ASSETS / 'icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
(ROOT / 'desktop-resources/icon.png').write_bytes((ASSETS / 'icon.png').read_bytes())
file_mark = svg('''<path d="M20 4h58l30 30v90H20z" fill="#f5fafc" stroke="#486474" stroke-width="4"/>
<path d="M78 4v30h30" fill="none" stroke="#486474" stroke-width="4"/>
<g transform="translate(28 42) scale(.55)">''' + re.search(r'<svg[^>]*>(.*)</svg>', mark, re.S)[1] + '</g>', 128, 128)
(ART / 'file-icon.svg').write_text(file_mark + '\n')
(ROOT / 'desktop-resources/file-icon.svg').write_text(file_mark + '\n')
raster(file_mark, ROOT / 'desktop-resources/file-icon.png', (512, 512))

mapping = json.loads((ART / 'icons.json').read_text())
for relative, name in mapping.items():
    if name == 'brand':
        source = mark
    elif name == 'blank':
        source = svg('')
    else:
        source = lucide(name, '#c6dce9' if '_dark' in relative else '#3285a0')
    size = 24 if '_24' in relative else 16
    if 'banner_logo' in relative:
        size = 128
    raster(source, ASSETS / relative, (size, size))

# Original cursor layout. Lucide tool glyphs accompany a precise high-contrast
# crosshair. The extra row/column uses the application's own hotspot protocol.
for relative in json.loads((ART / 'cursors.json').read_text()):
    name = pathlib.Path(relative).stem
    glyph = 'crosshair'
    for prefix, icon in [('clone_stamp', 'stamp'), ('color_picker', 'pipette'),
                         ('ellipse', 'circle-dashed'), ('rectangle', 'square-dashed'),
                         ('lasso', 'lasso-select'), ('magic_wand', 'wand-sparkles'),
                         ('paint_brush', 'paintbrush'), ('paint_bucket', 'paint-bucket'),
                         ('eraser', 'eraser'), ('pencil', 'pencil'), ('gradient', 'blend'),
                         ('recolor', 'replace'), ('shapes', 'shapes'), ('text', 'type'),
                         ('zoom', 'search'), ('hand', 'hand')]:
        if name.startswith(prefix):
            glyph = icon
            break
    # All cursor glyphs have an explicit source in the mapping's vendor set.
    source_file = ART / 'lucide' / (glyph + '.svg')
    if not source_file.exists():
        raise ValueError('Missing cursor glyph source: ' + glyph)
    body = re.search(r'<svg[^>]*>(.*)</svg>', lucide(glyph, '#203b4d'), re.S)[1]
    hand = name.startswith('hand_')
    hotspot = 16 if hand else 8
    scale = .95 if hand else .7
    offset = 4 if hand else 13
    body = f'<g transform="translate({offset} {offset}) scale({scale})" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{body}</g>' + f'<g transform="translate({offset} {offset}) scale({scale})" fill="none" stroke="#203b4d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</g>'
    if not hand:
        body = '<path d="M8 1v14M1 8h14" stroke="white" stroke-width="4"/><path d="M8 1v14M1 8h14" stroke="#172b3c" stroke-width="1.5"/>' + body
    badge = '+' if '_plus_' in name else '−' if '_minus_' in name else '×' if '_invalid_' in name else None
    if badge:
        # Explicit paths avoid system-font dependent cursor rendering.
        path = 'M22 7h8M26 3v8' if badge == '+' else 'M22 7h8' if badge == '−' else 'M22 3l8 8M30 3l-8 8'
        body += f'<circle cx="26" cy="7" r="6" fill="white"/><path d="{path}" stroke="#172b3c" stroke-width="1.5"/>'
    cursor_source = svg(body, 32, 32)
    source_path = ART / relative.replace('.png', '.svg')
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_text(cursor_source + '\n')
    raster(cursor_source, ASSETS / relative, (32, 32))
    image = Image.open(ASSETS / relative).convert('RGBA')
    with_metadata = Image.new('RGBA', (33, 33))
    with_metadata.paste(image, (0, 0))
    with_metadata.putpixel((32, hotspot), (255, 0, 0, 255))
    with_metadata.putpixel((hotspot, 32), (255, 0, 0, 255))
    with_metadata.save(ASSETS / relative)
print('Generated original branding, cursors and licensed Lucide UI assets.')

(ASSETS / "lang/en.json").write_bytes((ART / "en.json").read_bytes())

raster(mark, ROOT / '.github/assets/header.png', (128, 128))
