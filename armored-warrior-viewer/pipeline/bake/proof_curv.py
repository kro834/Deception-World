"""Per-vertex curvature (as mapped to G by compose.curv_to_g) close-ups: back of legs and chest."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, bakelib as B
from PIL import Image
from compose import curv_to_g
meshes = []; vals = []
for mat in B.TEXTURED:
    s = B.SHORT[mat]; d = np.load(os.path.join(B.HERE, f'cache/geom_detail_{s}.npz')); meshes.append((d['P'], d['F']))
    vals.append(curv_to_g(d['curv']))
for name, az, c, half in [('legs_back', 180, [0, 0.35, -0.05], 0.2), ('chest_front', 0, [0, 0.75, 0.05], 0.16)]:
    bm, bt, bb, _ = B.render_ortho(meshes, az, 90, 800, np.array(c), half)
    img = np.zeros((800, 800, 3)) + 0.08
    for mi, (P, F) in enumerate(meshes):
        m = bm == mi
        if m.any():
            img[m] = np.einsum('nk,nk->n', bb[m], vals[mi][F[bt[m]]])[:, None]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(B.HERE, f'proofs/curvG_{name}.png'))
