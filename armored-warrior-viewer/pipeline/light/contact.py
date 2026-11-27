"""Contact sheet: raw Blender renders vs painted matcaps (+ sphere-masked previews).
Run: $SP/venv/bin/python pipeline/light/contact.py <matcap dir> <out.png>"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'matcaps')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'contact.png')
S = 300
bg = (24, 28, 42)


def raw(name):
    p = os.path.join(HERE, 'out', 'passes', name + '.exr')
    if not os.path.exists(p):
        return None
    import bpy
    im = bpy.data.images.load(p)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]
    rgb = np.clip(a[..., :3], 0, 1)
    rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)
    al = a[..., 3:4]
    rgb = rgb * al + np.array(bg) / 255 * (1 - al)
    return Image.fromarray(np.uint8(rgb * 255)).resize((S, S), Image.LANCZOS)


tiles = []
labels = []
for n, r in (('gold', 'raw_gold'), ('armor', 'raw_armor'), ('crystal', None)):
    m = Image.open(os.path.join(src, n + '.webp')).convert('RGB').resize((S, S), Image.LANCZOS)
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx + 0.5 - S / 2) ** 2 + (yy + 0.5 - S / 2) ** 2) / (S / 2)
    mask = Image.fromarray(np.uint8(np.clip((1 - d) * S / 2 + 0.5, 0, 1) * 255))
    sph = Image.new('RGB', (S, S), bg)
    sph.paste(m, (0, 0), mask)
    rr = raw(r) if r else None
    tiles.append((rr, m, sph))
    labels.append(n)

W = S * 3 + 40
H = (S + 30) * 3 + 10
sheet = Image.new('RGB', (W, H), bg)
dr = ImageDraw.Draw(sheet)
for i, (rr, m, sph) in enumerate(tiles):
    y = 10 + i * (S + 30)
    if rr:
        sheet.paste(rr, (10, y))
    sheet.paste(m, (20 + S, y))
    sheet.paste(sph, (30 + 2 * S, y))
    dr.text((10, y + S + 6), f'{labels[i]}: raw Cycles render (same rig)' if rr else f'{labels[i]}: (additive layer)', fill=(200, 200, 210))
    dr.text((20 + S, y + S + 6), f'{labels[i]}.webp (full square)', fill=(200, 200, 210))
    dr.text((30 + 2 * S, y + S + 6), 'as sphere', fill=(200, 200, 210))
sheet.save(out)
print(out)
