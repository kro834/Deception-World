"""Quick look at per-vertex signals (before texture baking).
Usage: python proof_geom.py <mode> <signal> <azimuth> [res] [cx cy cz half]
signal: curv | toon | orig | ao | mag"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

mode, sig, az = sys.argv[1], sys.argv[2], float(sys.argv[3])
res = int(sys.argv[4]) if len(sys.argv) > 4 else 900
center = half = None
LDIR = [float(v) for v in os.environ.get('LDIR', '-0.85,0.35,0.3').split(',')]
if len(sys.argv) > 8:
    center = np.array([float(v) for v in sys.argv[5:8]]); half = float(sys.argv[8])
C = os.path.join(B.HERE, 'cache')
meshes, vals = [], []
for mat in B.TEXTURED:
    s = B.SHORT[mat]
    d = np.load(os.path.join(C, f'geom_{mode}_{s}.npz'))
    meshes.append((d['P'], d['F']))
    if sig == 'curv':
        try:
            from geom_post import curv_to_g
            v = curv_to_g(d['curv'], s)
        except ImportError:
            v = 0.5 + 0.5 * np.tanh(d['curv'] / 0.3)
        vals.append(np.repeat(v[:, None], 3, 1))
    elif sig == 'mag':
        vals.append(np.repeat(d['mags'][:, -1:], 3, 1))
    elif sig == 'ao':
        a = np.load(os.path.join(C, f'ao_{mode}_{s}.npz'))['ao']
        vals.append(np.repeat(a[:, None], 3, 1))
    else:
        vals.append(d['toon'] if sig == 'toon' else d['N'])
bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
img = np.zeros((res, res, 3)) + 0.08
for mi in range(len(meshes)):
    m = bm == mi
    if not m.any():
        continue
    F = meshes[mi][1]
    v = np.einsum('nk,nkc->nc', bb[m], vals[mi][F[bt[m]]])
    if sig in ('toon', 'orig'):
        x, y, z = B.view_basis(az)
        ldir = B.normalize(np.array(LDIR) @ np.stack([x, y, z]))  # key light from upper-left-front in view space
        nn = B.normalize(v)
        lam = nn @ ldir
        lit = (lam > 0.0)[:, None]
        v = np.where(lit, np.array([0.95, 0.93, 0.9]), np.array([0.35, 0.38, 0.55]))
    img[m] = v
out = os.path.join(B.HERE, 'proofs', f'geom_{mode}_{sig}_{int(az)}{"_zoom" if center is not None else ""}.png')
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)
print(out)
