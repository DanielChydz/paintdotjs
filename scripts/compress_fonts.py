#!/usr/bin/env python3
"""Recreate complete bundled WOFF2 fonts; no subsetting or outline transforms.

Install scripts/fonts/requirements.txt in a virtual environment first.
Original TTFs are recovered offline from the pinned repository revision, or from
--source DIR (a directory containing the original assets/font tree).
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
from fontTools.ttLib import TTFont, woff2

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'artwork/fonts.json'


def normalize_head(data):
    data = bytearray(data)
    # WOFF2 updates checkSumAdjustment and sets the lossless compression flag.
    data[8:12] = bytes(4)
    data[16] &= ~8
    return bytes(data)


def verify(original, compressed):
    with TTFont(io.BytesIO(original)) as before, TTFont(io.BytesIO(compressed)) as after:
        expected_tags = set(before.reader.keys())
        if 'DSIG' in expected_tags:
            # WOFF2 omits SFNT signatures; these upstream fonts have empty ones.
            assert before.reader['DSIG'] == bytes.fromhex('0000000100000000'), 'Nonempty font signature'
            expected_tags.remove('DSIG')
        assert expected_tags == set(after.reader.keys()), 'Font tables changed'
        for tag in expected_tags:
            expected, actual = before.reader[tag], after.reader[tag]
            if tag == 'head':
                expected, actual = normalize_head(expected), normalize_head(actual)
            assert expected == actual, f'Font table changed: {tag}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--check', action='store_true', help='Verify checked-in WOFF2 against original TTF tables')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    total_before, total_after = 0, 0
    for item in manifest['fonts']:
        relative = item['source']
        if args.source:
            original = (args.source / relative).read_bytes()
        else:
            original = subprocess.check_output(['git', 'show', f"{manifest['sourceCommit']}:assets/font/{relative}"], cwd=ROOT)
        assert hashlib.sha256(original).hexdigest() == item['sha256'], f'Source checksum mismatch: {relative}'
        target = ROOT / 'assets/font' / item['output']
        if args.check:
            compressed = target.read_bytes()
        else:
            output = io.BytesIO()
            # Retain every SFNT table byte, including all glyphs, axes and hinting.
            woff2.compress(io.BytesIO(original), output, transform_tables=set())
            compressed = output.getvalue()
        verify(original, compressed)
        assert len(compressed) < len(original), f'Font grew: {relative}'
        if not args.check:
            target.write_bytes(compressed)
        total_before += len(original)
        total_after += len(compressed)
        print(f'{relative}: {len(original)} -> {len(compressed)} bytes', flush=True)
    print(f'Total (without duplicate Inter): {total_before} -> {total_after} bytes')


if __name__ == '__main__':
    main()
