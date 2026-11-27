"""Proof: render each model with ITS OWN glTF UVs, sampling the delivered WebP maps exactly like the
viewer (glTF UV, flipY=false, bilinear). Also numeric checks:
  * toonNormal vs the model's own vertex normals: mean dot with correct V, and with V flipped (should be worse)
  * detail: texture-sampled AO vs per-vertex AO interpolated on the mesh (alignment error)
Usage: python proof_maps.py <standard|detail> [maps_dir] [az list] [zoom cx cy cz half]
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

mode = sys.argv[1]
mdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(B.HERE, 'out')
azs = [float(a) for a in (sys.argv[3].split(',') if len(sys.argv) > 3 else ['0', '180'])]
center = half = None; tag = ''
if len(sys.argv) > 7:
    center = np.array([float(v) for v in sys.argv[4:7]]); half = float(sys.argv[7]); tag = '_zoom'
res = 1000
man = json.load(open(os.path.join(mdir, 'manifest.json')))
g, prims = B.load_gltf(mode)
meshes, texs, items = [], [], []
for p in prims:
    meshes.append((p['pos'], p['idx']))
    if p['material'] in man['maps']:
        e = man['maps'][p['material']][mode]
        st = np.asarray(Image.open(os.path.join(mdir, e['style'])).convert('RGB'), np.float32) / 255
        tn = np.asarray(Image.open(os.path.join(mdir, e['toonNormal'])).convert('RGB'), np.float32) / 255
        texs.append((st, tn))
    else:
        texs.append(None)
    items.append(p)

# numeric: toon normal vs own vertex normals (per vertex, sampled at the vertex UV)
print(f'[{mode}] toonNormal vs mesh normals (mean dot, correct V / flipped V / flipped U):')
for p, t in zip(items, texs):
    if t is None:
        continue
    n = B.normalize(p['nrm'])
    def dots(uv):
        tnv = B.normalize(B.sample_bilinear(t[1], uv) * 2 - 1)
        return np.einsum('ij,ij->i', tnv, n)
    d0 = dots(p['uv']); d1 = dots(np.c_[p['uv'][:, 0], 1 - p['uv'][:, 1]]); d2 = dots(np.c_[1 - p['uv'][:, 0], p['uv'][:, 1]])
    print(f'   {B.SHORT[p["material"]]:7s} {d0.mean():.3f} (p5 {np.percentile(d0,5):.3f})  / {d1.mean():.3f} / {d2.mean():.3f}')

if mode == 'detail':
    print('[detail] texture AO vs per-vertex AO at vertex UVs: mean |err|, p99 |err|')
    for p, t in zip(items, texs):
        if t is None:
            continue
        s = B.SHORT[p['material']]
        d = np.load(os.path.join(B.HERE, 'cache', f'geom_detail_{s}.npz'))
        ao = np.load(os.path.join(B.HERE, 'cache', f'ao_detail_{s}.npz'))['ao'][d['inv']]
        smp = B.sample_bilinear(t[0], p['uv'])[:, 0]
        e = np.abs(smp - ao)
        print(f'   {s:7s} {e.mean():.4f}  {np.percentile(e, 99):.4f}')

for az in azs:
    bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
    x, y, z = B.view_basis(az)
    ldir = B.normalize(np.array([-0.8, 0.45, 0.4]) @ np.stack([x, y, z]))
    outs = {k: np.zeros((res, res, 3)) + 0.08 for k in ('ao', 'curv', 'toon', 'combo')}
    for mi, (P, F) in enumerate(meshes):
        m = bm == mi
        if not m.any():
            continue
        if texs[mi] is None:
            for k in outs:
                outs[k][m] = [0.5, 0.2, 0.2]
            continue
        uv = np.einsum('nk,nkc->nc', bb[m], items[mi]['uv'][F[bt[m]]])
        st = B.sample_bilinear(texs[mi][0], uv); tn = B.normalize(B.sample_bilinear(texs[mi][1], uv) * 2 - 1)
        outs['ao'][m] = st[:, [0, 0, 0]]
        outs['curv'][m] = st[:, [1, 1, 1]]
        # back faces of the double-sided body: flip the normal towards the viewer like gl_FrontFacing would
        lam = tn @ ldir
        facing = tn @ z
        lam = np.where(facing < -0.2, -lam, lam)
        lit = (lam > 0)[:, None]
        outs['toon'][m] = np.where(lit, [0.95, 0.93, 0.9], [0.35, 0.38, 0.55])
        base = np.where(lit, 0.9, 0.45) * (0.35 + 0.65 * st[:, 0:1])
        edge = np.clip((st[:, 1:2] - 0.5) * 2, 0, 1)
        crease = np.clip((0.5 - st[:, 1:2]) * 2, 0, 1)
        ink = st[:, 2:3]
        c = base + 0.5 * edge - 0.4 * crease
        c = c * (1 - ink)
        outs['combo'][m] = np.clip(np.repeat(c, 3, 1) * [1, 0.97, 0.92], 0, 1)
    for k, im in outs.items():
        fn = os.path.join(B.HERE, 'proofs', f'maps_{mode}_{k}_{int(az)}{tag}.png')
        Image.fromarray((np.clip(im, 0, 1) * 255).astype(np.uint8)).save(fn)
        print(fn)
