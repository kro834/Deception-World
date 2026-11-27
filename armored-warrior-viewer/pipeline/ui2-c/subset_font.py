# Build ui2-c/fonts/settei-mincho.woff2: Shippori Mincho 700 (OFL) subset to the display glyphs.
# Fontsource ships the font in unicode-range slices; subset each needed slice, then merge.
import re, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pylib'))
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.merge import Merger

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, 'npm', 'package')
OUT = os.path.join(HERE, '..', '..', 'ui2-c', 'fonts', 'settei-mincho.woff2')
TEXT = '装甲戦士図版一覧三面図部位正面背面側面顔胸の炉ベルト自由視点標準高精細品質0123456789'
WEIGHT = '700'

css = open(os.path.join(PKG, f'{WEIGHT}.css'), encoding='utf-8').read()
blocks = re.findall(r"@font-face\s*{(.*?)}", css, re.S)
def ranges(spec):
    out = []
    for part in spec.split(','):
        part = part.strip().replace('U+', '')
        if '-' in part:
            a, b = part.split('-'); out.append((int(a, 16), int(b, 16)))
        else:
            out.append((int(part, 16), int(part, 16)))
    return out
need = {ord(c) for c in TEXT}
picked = {}
for b in blocks:
    src = re.search(r"url\(\./files/([^)]+?\.woff2)\)", b)
    rng = re.search(r"unicode-range:\s*([^;]+);", b)
    if not src or not rng: continue
    for cp in list(need):
        if any(a <= cp <= z for a, z in ranges(rng.group(1))):
            picked.setdefault(src.group(1), set()).add(cp)
missing = need - set().union(*picked.values())
print('slices', len(picked), 'missing', [chr(c) for c in missing])
parts = []
for i, (name, cps) in enumerate(sorted(picked.items())):
    font = TTFont(os.path.join(PKG, 'files', name))
    opts = subset.Options(); opts.layout_features = ['palt', 'kern']; opts.notdef_outline = True
    opts.name_IDs = ['*']; opts.hinting = False
    s = subset.Subsetter(opts); s.populate(unicodes=cps); s.subset(font)
    font.flavor = None
    path = os.path.join(HERE, f'_part{i}.ttf'); font.save(path); parts.append(path)
merged = Merger().merge(parts)
merged.flavor = 'woff2'
merged.save(OUT)
for p in parts: os.remove(p)
print(OUT, os.path.getsize(OUT), 'bytes')
