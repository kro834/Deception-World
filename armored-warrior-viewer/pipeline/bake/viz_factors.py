"""Render the 4 body paintfix factors (side, thick, blue, dark) as greys on the body. Usage: viz_factors.py az name [cx cy cz half]"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
az, name = float(sys.argv[1]), sys.argv[2]
ctr = half = None
if len(sys.argv) > 6: ctr = np.array([float(v) for v in sys.argv[3:6]]); half = float(sys.argv[6])
g, prims = B.load_gltf('detail')
p = [q for q in prims if B.SHORT.get(q['material']) == 'body'][0]
fac = np.load(os.path.join(B.HERE, 'cache', 'pfb_factors.npy')).astype(np.float32)
res = 600
bm, bt, bb, _ = B.render_ortho([(p['pos'], p['idx'])], az, 90, res, ctr, half)
m = bm == 0
uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
v = B.sample_bilinear(fac, uv)
panels = []
for k in range(4):
    im = np.ones((res, res)); im[m] = v[:, k]; panels.append(im)
im = np.ones((res, res)); im[m] = v.prod(1); panels.append(im)
Image.fromarray((np.concatenate(panels, 1) * 255).astype(np.uint8)).save(os.path.join(B.HERE, 'proofs', 'paintfix2', f'factors_{name}.png'))
