"""Stage 4 (stretch): texture-space ink-line mask for the style B channel, at 2048 (detail atlas).

ink = max(trim_outline, crease)
  trim_outline : outline of the bronze-gold trim found in the base colour (hue 12-48 deg and
                 S>0.45,V>0.35 or S>0.25,V>0.65), components < 300 px dropped, holes < 250 px filled,
                 cleaned (blur + threshold + small-component removal) and turned into an anti-aliased
                 ~1.5 px line along the mask boundary. The noisy blue reflections on the armour are
                 deliberately NOT used (they would produce scribbles).
  crease       : sharp concave creases from the curvature channel already rasterised by compose.py
                 (G well below 0.5), i.e. geometry-driven lines between plates and scales.
Lines within 2 px of a UV island border are suppressed (base-colour padding would make false lines);
the geometric creases there are kept since they are seam-free by construction.
Writes cache/ink_<short>_2048.npy (float16) and proofs/ink_<short>.png.
"""
import os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

R = 2048
C = os.path.join(B.HERE, 'cache')
OUT = os.path.join(B.HERE, 'out')


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    g, prims = B.load_gltf('detail')
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        cover = np.load(os.path.join(C, f'mask_{s}_{R}.npy'))
        bc = cv2.imread(B.base_color_path(g, 'detail', p['material']), cv2.IMREAD_COLOR)
        bc = cv2.resize(bc, (R, R), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(bc, cv2.COLOR_BGR2HSV_FULL).astype(np.float32)
        h = hsv[..., 0] * 360 / 256; sat = hsv[..., 1] / 255; val = hsv[..., 2] / 255
        warm = (h > 12) & (h < 48)
        gold = (warm & (((sat > 0.45) & (val > 0.35)) | ((sat > 0.25) & (val > 0.65)))).astype(np.float32)
        gold = (ndimage.gaussian_filter(gold, 1.8) > 0.5)
        gold = ndimage.binary_opening(gold, iterations=1)
        lab, n = ndimage.label(gold)
        if n:
            sizes = ndimage.sum(gold, lab, np.arange(1, n + 1))
            gold = np.isin(lab, 1 + np.nonzero(sizes >= 300)[0])
        # fill small holes (specular highlights / dark specks inside a trim), keep real rings open
        holes = ndimage.binary_fill_holes(gold) & ~gold
        hl, hn = ndimage.label(holes)
        if hn:
            hs = ndimage.sum(holes, hl, np.arange(1, hn + 1))
            gold |= np.isin(hl, 1 + np.nonzero(hs < 250)[0])
        gb = ndimage.gaussian_filter(gold.astype(np.float32), 0.7)
        gy, gx = np.gradient(gb)
        trim = smoothstep(0.12, 0.26, np.hypot(gx, gy))
        inner = ndimage.binary_erosion(cover, iterations=2)
        trim *= inner
        st = np.asarray(Image.open(os.path.join(OUT, f'style_{s}_{R}.webp')).convert('RGB'), np.float32) / 255
        crease = smoothstep(0.20, 0.32, 0.5 - st[..., 1]) * cover
        ink = np.maximum(trim, crease)
        np.save(os.path.join(C, f'ink_{s}_{R}.npy'), ink.astype(np.float16))
        vis = (bc[..., ::-1].astype(np.float32) * (1 - ink[..., None]) * (0.4 + 0.6 * cover[..., None])).astype(np.uint8)
        Image.fromarray(vis).save(os.path.join(B.HERE, 'proofs', f'ink_{s}.png'))
        print(s, 'trim px %.4f crease px %.4f' % ((trim > 0.5).mean(), (crease > 0.5).mean()), flush=True)


if __name__ == '__main__':
    main()
