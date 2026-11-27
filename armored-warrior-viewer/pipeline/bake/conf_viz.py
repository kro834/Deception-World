"""Render a per-welded-vertex signal (or the conf result) over the unlit base colour.
Usage: python conf_viz.py <signal|conf> <name> az[,az..] [cx cy cz half]
Panels: [base colour | signal as grey | overlay (red = low)]. Prints share of visible textured pixels < 0.5."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
sig, name = sys.argv[1], sys.argv[2]
azs = [float(a) for a in sys.argv[3].split(',')]
center = half = None
if len(sys.argv) > 7:
    center = np.array([float(v) for v in sys.argv[4:8][:3]]); half = float(sys.argv[7])
res = int(os.environ.get('RES', 700))
g, prims = B.load_gltf('detail')
meshes = [(p['pos'], p['idx']) for p in prims]
vals, bases = [], []
for p in prims:
    if p['material'] not in B.TEXTURED:
        vals.append(None); bases.append(None); continue
    s = B.SHORT[p['material']]
    inv = np.load(os.path.join(C, f'geom_detail_{s}.npz'))['inv']
    if sig == 'conf':
        v = np.load(os.path.join(C, f'conf_{s}.npz'))['conf']
    else:
        v = np.load(os.path.join(C, f'csig_{s}.npz'))[sig].astype(float)
        if sig == 'hf': v = v / 0.06
        if sig == 'en': v = np.sqrt(v) / 0.1
    vals.append(np.clip(v[inv], 0, 1)); bases.append(B.load_rgb(B.tex_path(g, 'detail', p['material'], 'base')))
for az in azs:
    bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
    base = np.ones((res, res, 3)); grey = np.ones((res, res, 3)); ov = np.ones((res, res, 3))
    low = 0; tot = 0
    for mi, p in enumerate(prims):
        m = bm == mi
        if not m.any(): continue
        if vals[mi] is None:
            base[m] = grey[m] = ov[m] = [0.5, 0.2, 0.2]; continue
        tri = p['idx'][bt[m]]
        uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][tri])
        b = B.sample_bilinear(bases[mi], uv)
        v = np.einsum('nk,nk->n', bb[m], vals[mi][tri])
        base[m] = b; grey[m] = v[:, None]
        a = (np.clip((0.5 - v) / 0.1, 0, 1) * 0.6)[:, None]   # tint only below 0.5
        ov[m] = b * (1 - a) + np.array([1.0, 0.1, 0.1]) * a
        low += (v < 0.5).sum(); tot += len(v)
    out = np.concatenate([base, grey, ov], 1)
    fn = os.path.join(B.HERE, 'proofs', f'conf_{sig}_{name}_{int(az)}.png')
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(fn)
    print(f'{fn}  share of visible textured surface < 0.5: {low / max(tot, 1):.3f}')
