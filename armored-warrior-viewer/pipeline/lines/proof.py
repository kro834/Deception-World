"""Proof renders: each model with ITS OWN glTF UVs, sampling the line maps like the viewer does
(glTF UV origin top-left, flipY=false, bilinear), then drawing a constant-width stroke from the
distance field:  d = (1 - v) * spread ; alpha = smoothstep(h + px/2, h - px/2, d)
Usage:
  python proof.py <standard|detail> <src> <name> <az> [cx cy cz half] [--mag M] [--res N]
     src = 'cache' (float npy fields) or a directory holding lines.json + lines_*.webp
     --mag M : reconstruct from a map M times smaller than the mode's (e.g. 1024 map viewed close)
Writes proofs/<name>.png : left = original base colour + strokes, right = flat grey + strokes.
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib_copy as B
import linebake as LB

args = sys.argv[1:]
res = 900
if '--res' in args:
    i = args.index('--res'); res = int(args[i + 1]); del args[i:i + 2]
mode, src, name, az = args[0], args[1], args[2], float(args[3])
center = half = None
if len(args) >= 8:
    center = np.array([float(v) for v in args[4:7]]); half = float(args[7])
RES = {'standard': 1024, 'detail': 2048}[mode]
TR = float(os.environ.get("TR", "0.85"))   # stroke = v above this (same rule as the shader)
TG = float(os.environ.get("TG", "0.89"))

g, prims = B.load_gltf(mode)
meshes, maps, base, items, s_mi = [], [], [], [], []
spread_m = LB.SPREAD_M
import lattice as LT
for p in prims:
    meshes.append((p['pos'], p['idx'])); items.append(p)
    s = B.SHORT.get(p['material']); s_mi.append(s)
    m = None
    if s:
        if src == 'cache':
            fp = os.path.join(LB.CACHE, f'lines_{s}_{RES}.npy')
            if os.path.exists(fp):
                m = np.load(fp).astype(np.float32)
        else:
            man = json.load(open(os.path.join(src, 'lines.json')))
            e = man['maps'].get(p['material'], {}).get(mode)
            if e:
                m = np.asarray(Image.open(os.path.join(src, e['lines'])).convert('RGB'), np.float32)[..., :2] / 255
                spread_m = man.get('linesSpreadMetres', spread_m)
        bc = np.asarray(Image.open(B.base_color_path(g, mode, p['material'])).convert('RGB'), np.float32) / 255
        base.append(bc)
    else:
        base.append(None)
    maps.append(m)

bm, bt, bb, (cen, hf) = B.render_ortho(meshes, az, 90, res, center, half)
px = 2 * hf / res
x, y, z = B.view_basis(az)
L = np.zeros((res, res, 3)) + 0.12
R2 = np.zeros((res, res, 3)) + 0.12
for mi, (P, F) in enumerate(meshes):
    m = bm == mi
    if not m.any():
        continue
    fn = B.normalize(np.cross(P[F[bt[m], 1]] - P[F[bt[m], 0]], P[F[bt[m], 2]] - P[F[bt[m], 0]]))
    lam = np.abs(fn @ B.normalize(np.array([-0.4, 0.5, 0.75]) @ np.stack([x, y, z])))
    shade = (0.55 + 0.45 * lam)[:, None]
    if base[mi] is None:
        L[m] = 0.3 * shade; R2[m] = 0.3 * shade
        continue
    uv = np.einsum('nk,nkc->nc', bb[m], items[mi]['uv'][F[bt[m]]])
    col = B.sample_bilinear(base[mi], uv)
    # rough paint classes from the base colour, for proofs only (the viewer uses the bake agent's mask)
    import colorsys
    mx = col.max(1); mn = col.min(1); sat = (mx - mn) / np.maximum(mx, 1e-6)
    hue = np.array([colorsys.rgb_to_hsv(*c)[0] for c in col[::1]]) * 360 if len(col) < 2000 else None
    if hue is None:
        r_, g_, b_ = col[:, 0], col[:, 1], col[:, 2]
        hue = np.degrees(np.arctan2(np.sqrt(3) * (g_ - b_), 2 * r_ - g_ - b_)) % 360
    crys = (sat > 0.3) & (mx > 0.25) & ((hue > 190) & (hue < 345))
    gold = (sat > 0.3) & (mx > 0.25) & ((hue < 60) | (hue >= 345))
    grey = np.where(crys[:, None], np.array([0.2, 0.35, 0.85]) * (0.6 + 0.4 * shade),
           np.where(gold[:, None], np.array([0.75, 0.5, 0.25]) * shade, 0.32 * np.repeat(shade, 3, 1)))
    if maps[mi] is not None:
        v = B.sample_bilinear(maps[mi], uv)
        spread_m = LB.SPREAD_M * LT.CFG[s_mi[mi]]['unit']
        H_R = (1 - TR) * spread_m; H_G = (1 - TG) * spread_m
        aR = np.clip((H_R - (1 - v[:, 0:1]) * spread_m) / px + 0.5, 0, 1)
        aG = np.clip((H_G - (1 - v[:, 1:2]) * spread_m) / px + 0.5, 0, 1)
        if os.environ.get('CH') == 'R': aG *= 0
        if os.environ.get('CH') == 'G': aR *= 0
        col = col * (1 - aR) + np.array([0.0, 0.0, 0.0]) * aR
        col = col * (1 - aG) + np.array([0.75, 0.95, 1.0]) * aG
        aRg = aR * (~crys & ~gold)[:, None]; aGg = aG * crys[:, None]
        grey = grey * (1 - aRg) + np.array([0.02, 0.02, 0.03]) * aRg
        grey = grey * (1 - aGg) + np.array([0.75, 0.88, 1.0]) * aGg
    if os.environ.get('ISL'):   # tint by UV island so UV seams are visible
        import scipy.sparse as sps
        from scipy.sparse.csgraph import connected_components
        Fi = items[mi]['idx']; n_ = len(items[mi]['uv'])
        A = sps.coo_matrix((np.ones(len(Fi) * 2), (np.r_[Fi[:, 0], Fi[:, 1]], np.r_[Fi[:, 1], Fi[:, 2]])), shape=(n_, n_))
        lab = connected_components(A, directed=False)[1][Fi[bt[m], 0]]
        tint = np.stack([(lab * 37 % 97) / 97, (lab * 53 % 89) / 89, (lab * 71 % 83) / 83], 1)
        grey = grey * 0.7 + 0.3 * tint
    L[m] = col; R2[m] = grey
im = np.concatenate([L, R2], 1)
os.makedirs(os.path.join(LB.HERE, 'proofs'), exist_ok=True)
fp = os.path.join(LB.HERE, 'proofs', f'{name}.png')
Image.fromarray((np.clip(im, 0, 1) * 255).astype(np.uint8)).save(fp)
print(fp, 'px %.3f mm' % (px * 1e3))
