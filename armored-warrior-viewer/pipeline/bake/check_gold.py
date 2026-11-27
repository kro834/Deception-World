"""Acceptance check: agreement between mask gold and a plain hue test on the base colour, per covered
texel (same test as the shader agent: warm hue 10-50 deg, S > 0.19, V > 0.19, emissive max < 0.15).
Also writes proofs/goldcheck_<short>_<res>.png in texture space:
  yellow = both gold, red = hue-gold lost to armour, magenta = hue-gold -> crystal, cyan = mask-gold not hue-gold.
Usage: python check_gold.py <maps_dir> [res] [only]"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
from mask_classify import hsv

mdir = sys.argv[1]; R = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
mode = 'standard' if R == 1024 else 'detail'
man = json.load(open(os.path.join(mdir, 'manifest.json'), encoding='utf-8'))
g, prims = B.load_gltf('detail')
for p in prims:
    if p['material'] not in B.TEXTURED:
        continue
    s = B.SHORT[p['material']]
    if only and s not in only:
        continue
    e = man['maps'][p['material']][mode]
    if 'mask' not in e:
        continue
    mk = np.asarray(Image.open(os.path.join(mdir, e['mask'])).convert('RGBA'), np.float32) / 255
    base = B.load_rgb(B.tex_path(g, 'detail', p['material'], 'base'), R)
    emis = B.load_rgb(B.tex_path(g, 'detail', p['material'], 'emissive'), R)
    _, cov, _ = B.raster(p['uv'], p['idx'], np.ones(len(p['uv'])), R)
    h, sat, val = [x.reshape(R, R) for x in hsv(base.reshape(-1, 3))]
    hue_gold = (h > 10) & (h < 50) & (sat > 0.19) & (val > 0.19) & (emis.max(-1) < 0.15) & cov
    mg = (mk[..., 0] > 0.5) & cov; mc = (mk[..., 1] > 0.5) & cov
    n = hue_gold.sum()
    both = (hue_gold & mg).sum(); toc = (hue_gold & ~mg & mc).sum(); toa = (hue_gold & ~mg & ~mc).sum()
    extra = (mg & ~hue_gold).sum()
    # explain the disagreements: drape zone (deliberate), within 2 texels of a mask edge (edge placement /
    # smoothing), enclosed-region decisions are counted in 'other'
    from scipy import ndimage
    posimg, _, _ = B.raster(p['uv'], p['idx'], p['pos'], R)
    edge = ndimage.binary_dilation(mg ^ ndimage.binary_erosion(mg), iterations=2)
    lost = hue_gold & ~mg
    if s == 'body':
        drape = (posimg[..., 1] < 0.52) & (np.abs(posimg[..., 0]) > 0.05)
    else:
        drape = np.zeros_like(lost)
    ld = (lost & drape).sum(); le = (lost & ~drape & edge).sum(); lo = (lost & ~drape & ~edge).sum()
    print(f'{s:7s} {R}: lost hue-gold split: below-belt drape/legs zone {ld/n:.3f}, within 2 texels of a mask edge {le/n:.3f}, other {lo/n:.3f}')
    print(f'{s:7s} {R}: hue-gold texels {n}: mask gold {both/n:.3f}, crystal {toc/n:.3f}, armour {toa/n:.3f}; '
          f'mask-gold not hue-gold {extra/max(mg.sum(),1):.3f}')
    vis = np.zeros((R, R, 3), np.uint8) + np.where(cov[..., None], 40, 0).astype(np.uint8)
    vis[hue_gold & mg] = [230, 190, 60]; vis[hue_gold & ~mg & ~mc] = [255, 0, 0]
    vis[hue_gold & ~mg & mc] = [255, 0, 255]; vis[mg & ~hue_gold] = [0, 200, 220]
    Image.fromarray(vis).save(os.path.join(B.HERE, 'proofs', f'goldcheck_{s}_{R}.png'))
