"""Numeric verification of a delivered/cached line map against the intended line set.

Samples random points on the detail mesh surface (area-weighted), evaluates the *true* fields there
directly from the welded-mesh stripe solution (no texture), and compares with the map sampled the way
the viewer does (glTF UV, flipY=false, bilinear, optional magnification = reading a map of res/mag).
Reports per channel: mean / p99 |v_map - v_true|, and stroke-coverage agreement for a stroke of
half-width h (true stroke d < h vs. map stroke): IoU, lost fraction, extra fraction. Separately for
points whose texel lies within 2 texels of a UV island border ('seam' set) and the interior.
Usage: python check.py <short> <res> <src: cache|dir> [hR hG]
"""
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib_copy as B
import surf as S
import linebake as LB

short, res, src = sys.argv[1], int(sys.argv[2]), sys.argv[3]
hR = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0006
hG = float(sys.argv[5]) if len(sys.argv) > 5 else 0.00045
NPTS = 600_000

if src == 'cache':
    m = np.load(os.path.join(LB.CACHE, f'lines_{short}_{res}.npy')).astype(np.float32)
else:
    man = json.load(open(os.path.join(src, 'lines.json')))
    mat = [k for k, v in B.SHORT.items() if v == short][0]
    fn = man['maps'][mat]['detail' if res == 2048 else 'standard']['lines']
    m = np.asarray(Image.open(os.path.join(src, fn)).convert('RGB'), np.float32)[..., :2] / 255
cover = np.load(os.path.join(LB.CACHE, f'cover_{short}_{res}.npy'))
border = ndimage.distance_transform_edt(cover) <= 2.0

g, prims = B.load_gltf('detail')
p = [q for q in prims if q['material'] in B.TEXTURED and B.SHORT[q['material']] == short][0]
geo = np.load(os.path.join(S.BAKE_CACHE, f'geom_detail_{short}.npz'))
inv, P = geo['inv'], geo['P']
Fg = p['idx']
fa = np.linalg.norm(np.cross(P[inv[Fg[:, 1]]] - P[inv[Fg[:, 0]]], P[inv[Fg[:, 2]]] - P[inv[Fg[:, 0]]]), axis=1)
rng = np.random.default_rng(5)
t = rng.choice(len(Fg), NPTS, p=fa / fa.sum())
u, v = rng.random(NPTS), rng.random(NPTS)
fl = u + v > 1; u[fl], v[fl] = 1 - u[fl], 1 - v[fl]
bb = np.stack([1 - u - v, u, v], 1)
tv = inv[Fg[t]]
X = (P[tv] * bb[:, :, None]).sum(1)
uv = (p['uv'][Fg[t]] * bb[:, :, None]).sum(1)
lat = np.load(os.path.join(LB.CACHE, f'lattice_{short}.npz'))
vR, vG = LB.fields(lat, dict(P=P, tv=tv, bb=bb, X=X), short)
truth = np.stack([vR, vG], 1)
smp = B.sample_bilinear(m, uv)
tx = np.clip((uv * res).astype(int), 0, res - 1)
near = border[tx[:, 1], tx[:, 0]]
print(f'{short} {res} ({src}): {NPTS} surface points, {near.mean():.3f} of them within 2 texels of an island border')
for ch, name, h in ((0, 'R', hR), (1, 'G', hG)):
    thr = 1 - h / LB.SPREAD_M   # h given at body scale; thresholds are in v so they scale with the unit
    for lab, sel in (('interior', ~near), ('border', near)):
        e = np.abs(smp[sel, ch] - truth[sel, ch])
        a = truth[sel, ch] > thr; b = smp[sel, ch] > thr
        iou = (a & b).sum() / max((a | b).sum(), 1)
        print(f'  {name} {lab:8s}: |err| mean {e.mean():.4f} p99 {np.percentile(e, 99):.3f}  stroke IoU {iou:.3f}  '
              f'lost {(a & ~b).sum() / max(a.sum(), 1):.3f}  extra {(b & ~a).sum() / max(b.sum(), 1):.3f}  (true stroke {a.mean():.3f})')
