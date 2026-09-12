#!/usr/bin/env python3
"""
Build the fonts PDF export embeds (public/fonts/pdf/).

jsPDF's built-in fonts only encode WinAnsi, so utils/exportUtils.js embeds
Noto fonts (SIL Open Font License 1.1) when a note has other text. jsPDF reads
TrueType outlines only and copies a font's whole cmap and hmtx tables into
each PDF, so the fonts are cut down to the characters notes use, and hinting
and layout tables jsPDF never reads are dropped.

  NotoSansPdf-Regular.ttf, -Bold.ttf, -Italic.ttf
      Noto Sans (Latin, Greek, Cyrillic) merged with Noto Sans Arabic and
      Noto Sans Hebrew, so a right-to-left line with Latin words, digits and
      punctuation draws in one font. Italic takes the upright Arabic and
      Hebrew.
  NotoSansMono-Regular.ttf   code blocks
  NotoSansSC-Regular.ttf     Chinese: GB 2312 and Big5, Simplified and Traditional
  NotoSansJP-Regular.ttf     Japanese: JIS X 0208 and kana
  NotoSansKR-Regular.ttf     Korean: every Hangul syllable

Sources, all SIL Open Font License 1.1:
  https://github.com/notofonts/notofonts.github.io  fonts/<family>/unhinted/ttf/
    NotoSans-Regular.ttf NotoSans-Bold.ttf NotoSans-Italic.ttf
    NotoSansMono-Regular.ttf NotoSansArabic-Regular.ttf NotoSansArabic-Bold.ttf
    NotoSansHebrew-Regular.ttf NotoSansHebrew-Bold.ttf
  https://github.com/google/fonts  ofl/notosanssc, ofl/notosansjp, ofl/notosanskr
    NotoSansSC[wght].ttf NotoSansJP[wght].ttf NotoSansKR[wght].ttf
    (variable fonts whose default is Thin; Regular is instanced at wght 400)

Usage: python3 scripts/build-pdf-fonts.py <source dir> [output dir]
Needs fontTools: pip install fonttools
"""

import os
import sys
import tempfile

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

KEEP = {'cmap', 'glyf', 'loca', 'head', 'hhea', 'hmtx', 'maxp', 'post', 'name', 'OS/2'}


def ranges(*pairs):
    points = set()
    for low, high in pairs:
        points.update(range(low, high + 1))
    return points


def encodable(codec):
    points = set()
    for point in range(0x10000):
        if 0xD800 <= point <= 0xDFFF:
            continue
        try:
            chr(point).encode(codec)
        except UnicodeEncodeError:
            continue
        points.add(point)
    return points


LATIN = ranges(
    (0x0000, 0x052F), (0x1C80, 0x1C8F), (0x1E00, 0x1FFF), (0x2000, 0x206F),
    (0x20A0, 0x20CF), (0x2100, 0x218F), (0x2190, 0x21FF), (0x2200, 0x22FF),
    (0x2460, 0x24FF), (0x25A0, 0x25FF), (0x2600, 0x26FF), (0x2C60, 0x2C7F),
    (0xA640, 0xA69F), (0xA720, 0xA7FF), (0xFB00, 0xFB06), (0xFFFD, 0xFFFD))
# Only what Noto Sans lacks, so the merged font keeps one glyph per character.
# jsPDF's Arabic shaper writes presentation forms (U+FB50-FDFF, U+FE70-FEFF).
ARABIC = ranges((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))
HEBREW = ranges((0x0590, 0x05FF), (0xFB1D, 0xFB4F))
CJK_PUNCTUATION = ranges((0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2000, 0x206F))
KANA = ranges((0x3040, 0x30FF), (0x31F0, 0x31FF), (0xFF61, 0xFF9F))
HANGUL = ranges((0xAC00, 0xD7A3), (0x1100, 0x11FF), (0x3130, 0x318F))
ASCII = ranges((0x0020, 0x007E))


def open_font(path, weight=None):
    font = TTFont(path)
    if 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': weight or 400}, updateFontNames=True)
    return font


def cut(font, unicodes):
    for tag in [tag for tag in font.keys() if tag not in KEEP and tag != 'GlyphOrder']:
        del font[tag]
    options = subset.Options()
    options.glyph_names = False
    options.hinting = False
    options.notdef_outline = True
    options.name_IDs = ['*']
    options.recalc_timestamp = False
    options.layout_features = []
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    for tag in [tag for tag in font.keys() if tag not in KEEP and tag != 'GlyphOrder']:
        del font[tag]
    return font


def merge(parts, out_path):
    with tempfile.TemporaryDirectory() as scratch:
        paths = []
        for index, font in enumerate(parts):
            path = os.path.join(scratch, f'{index}.ttf')
            font.save(path)
            paths.append(path)
        merged = Merger().merge(paths)
        for tag in [tag for tag in merged.keys() if tag not in KEEP and tag != 'GlyphOrder']:
            del merged[tag]
        merged.save(out_path)


def report(path):
    font = TTFont(path)
    print(f"{os.path.basename(path)}: {os.path.getsize(path):,} bytes, "
          f"{len(font.getGlyphOrder()):,} glyphs, {len(font.getBestCmap()):,} characters")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    source = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts', 'pdf')
    os.makedirs(out, exist_ok=True)
    src = lambda name: os.path.join(source, name)  # noqa: E731

    for style, latin, arabic, hebrew in [
        ('Regular', 'NotoSans-Regular.ttf', 'NotoSansArabic-Regular.ttf', 'NotoSansHebrew-Regular.ttf'),
        ('Bold', 'NotoSans-Bold.ttf', 'NotoSansArabic-Bold.ttf', 'NotoSansHebrew-Bold.ttf'),
        ('Italic', 'NotoSans-Italic.ttf', 'NotoSansArabic-Regular.ttf', 'NotoSansHebrew-Regular.ttf'),
    ]:
        path = os.path.join(out, f'NotoSansPdf-{style}.ttf')
        merge([
            cut(open_font(src(latin)), LATIN),
            cut(open_font(src(arabic)), ARABIC),
            cut(open_font(src(hebrew)), HEBREW),
        ], path)
        report(path)

    jobs = [
        ('NotoSansMono-Regular.ttf', 'NotoSansMono-Regular.ttf', LATIN),
        ('NotoSansSC-Regular.ttf', 'NotoSansSC[wght].ttf', encodable('gb2312') | encodable('big5') | CJK_PUNCTUATION),
        ('NotoSansJP-Regular.ttf', 'NotoSansJP[wght].ttf', encodable('shift_jis') | KANA | CJK_PUNCTUATION),
        ('NotoSansKR-Regular.ttf', 'NotoSansKR[wght].ttf', HANGUL | CJK_PUNCTUATION | ASCII),
    ]
    for name, source_name, unicodes in jobs:
        path = os.path.join(out, name)
        cut(open_font(src(source_name), 400), unicodes).save(path)
        report(path)


if __name__ == '__main__':
    main()
