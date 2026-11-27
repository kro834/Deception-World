"""Render a glTF texture slot (base|emissive) on the model. Usage: render_tex.py mode slot az [cx cy cz half]"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
mode, slot, az = sys.argv[1], sys.argv[2], float(sys.argv[3])
center = half = None; tag = ''
if len(sys.argv) > 7:
    center = np.array([float(v) for v in sys.argv[4:7]]); half = float(sys.argv[7]); tag = '_' + sys.argv[8] if len(sys.argv) > 8 else '_zoom'
g, prims = B.load_gltf(mode)
res = 1000
meshes = [(p['pos'], p['idx']) for p in prims]
bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
img = np.zeros((res, res, 3)) + 1.0
for mi, p in enumerate(prims):
    m = bm == mi
    if not m.any(): continue
    if p['uv'] is None:
        img[m] = [0.5, 0.2, 0.2]; continue
    tex = B.load_rgb(B.tex_path(g, mode, p['material'], slot))
    uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
    img[m] = B.sample_bilinear(tex, uv)
fn = os.path.join(B.HERE, 'proofs', f'tex_{mode}_{slot}_{int(az)}{tag}.png')
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(fn); print(fn)
