"""Compare UV layouts of the standard and detail meshes per textured material.
Writes proofs/uvcmp_<mat>.png (R = standard coverage, G = detail coverage) and prints IoU."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

OUT = os.path.join(B.HERE, 'proofs'); os.makedirs(OUT, exist_ok=True)
S = 1024
cov = {}
for mode in ['standard', 'detail']:
    g, prims = B.load_gltf(mode)
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        print(mode, B.SHORT[p['material']], 'verts', len(p['pos']), 'tris', len(p['idx']),
              'uv range', p['uv'].min(0).round(4), p['uv'].max(0).round(4))
        _, m, _ = B.raster(p['uv'], p['idx'], np.ones(len(p['uv'])), S)
        cov[(mode, p['material'])] = m
for mat in B.TEXTURED:
    a = cov[('standard', mat)]; b = cov[('detail', mat)]
    iou = (a & b).sum() / (a | b).sum()
    # tolerance: coverage within 2 px
    from scipy import ndimage
    ad = ndimage.binary_dilation(a, iterations=2); bd = ndimage.binary_dilation(b, iterations=2)
    miss_a = (a & ~bd).sum() / a.sum(); miss_b = (b & ~ad).sum() / b.sum()
    print(f'{B.SHORT[mat]:7s} cover std {a.mean():.3f} det {b.mean():.3f} IoU {iou:.3f}  '
          f'std-not-near-det {miss_a:.4f}  det-not-near-std {miss_b:.4f}')
    im = np.zeros((S, S, 3), np.uint8); im[..., 0] = a * 255; im[..., 1] = b * 255
    Image.fromarray(im).save(os.path.join(OUT, f'uvcmp_{B.SHORT[mat]}.png'))
