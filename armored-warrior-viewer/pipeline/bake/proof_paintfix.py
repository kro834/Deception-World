"""Unlit before/after of the helmet paintfix on the detail mesh (other materials: their source base colour).
Usage: python proof_paintfix.py <short=fix.webp[,short=fix.webp]> <outdir> <tag> name:az:polar:cx:cy:cz:half ..."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

fixes = dict(kv.split('=') for kv in sys.argv[1].split(','))
odir, tag = sys.argv[2], sys.argv[3]
res = 1000
g, prims = B.load_gltf('detail')
meshes = [(p['pos'], p['idx']) for p in prims]
before, after = [], []
for p in prims:
    if p['uv'] is None:
        before.append(None); after.append(None); continue
    t = B.load_rgb(B.tex_path(g, 'detail', p['material'], 'base'))
    before.append(t)
    f = fixes.get(B.SHORT.get(p['material']))
    after.append(B.load_rgb(f) if f else t)
os.makedirs(os.path.join(B.HERE, 'proofs', odir), exist_ok=True)
for spec in sys.argv[4:]:
    name, az, pol, cx, cy, cz, half = spec.split(':')
    ctr = None if cx == 'f' else np.array([float(cx), float(cy), float(cz)])
    bm, bt, bb, _ = B.render_ortho(meshes, float(az), float(pol), res, ctr, None if cx == 'f' else float(half))
    a = np.ones((res, res, 3)); b = np.ones((res, res, 3))
    for mi, p in enumerate(prims):
        m = bm == mi
        if not m.any(): continue
        if before[mi] is None:
            a[m] = b[m] = [0.35, 0.3, 0.3]; continue
        uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
        a[m] = B.sample_bilinear(before[mi], uv); b[m] = B.sample_bilinear(after[mi], uv)
    fn = os.path.join(B.HERE, 'proofs', odir, f'{tag}_{name}.png')
    Image.fromarray((np.clip(np.concatenate([a, b], 1), 0, 1) * 255).astype(np.uint8)).save(fn)
    print(fn)
