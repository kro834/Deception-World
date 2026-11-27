"""Unlit render, original base colour vs repaired 'paint', side by side, with each model's own UVs.
Usage: python proof_paint.py <standard|detail> <name> az[,..] [cx cy cz half]"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

mode, name = sys.argv[1], sys.argv[2]
azs = [float(a) for a in sys.argv[3].split(',')]
center = half = None
if len(sys.argv) > 7:
    center = np.array([float(v) for v in sys.argv[4:7]]); half = float(sys.argv[7])
res = int(os.environ.get('RES', 700))
OUT = os.path.join(B.HERE, 'out')
man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
g, prims = B.load_gltf(mode)
meshes = [(p['pos'], p['idx']) for p in prims]
texs = []
for p in prims:
    if p['uv'] is None:
        texs.append(None); continue
    e = man['maps'][p['material']][mode]
    texs.append((B.load_rgb(B.tex_path(g, mode, p['material'], 'base')),
                 B.load_rgb(os.path.join(OUT, e['paint'])) if 'paint' in e else None))
for az in azs:
    bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
    a = np.ones((res, res, 3)); b = np.ones((res, res, 3))
    for mi, p in enumerate(prims):
        m = bm == mi
        if not m.any(): continue
        if texs[mi] is None:
            a[m] = b[m] = [0.5, 0.2, 0.2]; continue
        uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
        a[m] = B.sample_bilinear(texs[mi][0], uv)
        b[m] = B.sample_bilinear(texs[mi][1], uv) if texs[mi][1] is not None else a[m]
    fn = os.path.join(B.HERE, 'proofs', f'paint_{mode}_{name}_{int(az)}.png')
    Image.fromarray((np.clip(np.concatenate([a, b], 1), 0, 1) * 255).astype(np.uint8)).save(fn)
    print(fn)
