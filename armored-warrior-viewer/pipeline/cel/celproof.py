"""Unlit before / after proofs of the cel paint: orthographic, each model with its own glTF UVs,
textures sampled bilinear (glTF UV, flipY=false), the look-dev probe's `grade` applied to both halves
(so they look like the viewer's unlit base, not like raw texture). Full-body views are rendered at 2x
and area-downsampled (stand-in for mipmapping).
Left = before (paintfix / original base colour), right = after (out/paintcel_*).
Usage: python celproof.py <standard|detail> <name> <az> [cx cy cz half] [--res N] [--after DIR]
"""
import os, sys, json
import numpy as np
import cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lines'))
sys.path.insert(0, os.path.join(HERE, '..', 'mock'))
import bakelib_copy as B
from mock import grade
import celflat as CF

args = sys.argv[1:]
res = 1000; after_dir = CF.OUT
sets = None
if '--res' in args:
    i = args.index('--res'); res = int(args[i + 1]); del args[i:i + 2]
if '--sets' in args:   # comma list: src | <dir>/<prefix>  (file <dir>/<prefix>_<part>_<res>.webp)
    i = args.index('--sets'); sets = args[i + 1].split(','); del args[i:i + 2]
if '--after' in args:
    i = args.index('--after'); after_dir = args[i + 1]; del args[i:i + 2]
mode, name, az = args[0], args[1], float(args[2])
center = half = None
if len(args) >= 7:
    center = np.array([float(v) for v in args[3:6]]); half = float(args[6])
ss = 2 if center is None else 1
R = res * ss

g, prims = B.load_gltf(mode)
rmode = 2560 if mode == 'detail' else 2048
if sets is None:
    sets = ['src', os.path.join(after_dir, 'paintcel')]
texsets = [[] for _ in sets]; factor = []
for p in prims:
    s = B.SHORT.get(p['material'])
    if s is None:
        m = [m for m in g['materials'] if m['name'] == p['material']][0]
        f = np.array(m['pbrMetallicRoughness'].get('baseColorFactor', [0.5, 0.5, 0.5, 1])[:3])
        factor.append(np.where(f <= 0.0031308, f * 12.92, 1.055 * f ** (1 / 2.4) - 0.055))
        for t in texsets: t.append(None)
        continue
    factor.append(None)
    b = np.asarray(Image.open(CF.SRC[s] if s in CF.SRC else B.base_color_path(g, 'detail', p['material'])).convert('RGB'), np.float32) / 255
    for k, st in enumerate(sets):
        fa = f'{st}_{s}_{rmode}.webp'
        if st != 'src' and s in CF.SRC and os.path.exists(fa):
            texsets[k].append(np.asarray(Image.open(fa).convert('RGB'), np.float32) / 255)
        else:
            texsets[k].append(b)
meshes = [(p['pos'], p['idx']) for p in prims]
bm, bt, bb, _ = B.render_ortho(meshes, az, 90, R, center, half)
outs = []
for texs in texsets:
    img = np.zeros((R, R, 3), np.float32) + np.array([0.06, 0.06, 0.08], np.float32)
    for mi, p in enumerate(prims):
        m = bm == mi
        if not m.any():
            continue
        if texs[mi] is None:
            img[m] = factor[mi]; continue
        uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
        img[m] = B.sample_bilinear(texs[mi], uv)
    fig = bm >= 0
    img[fig] = grade(img[fig][None])[0]
    if ss > 1:
        img = cv2.resize(img, (res, res), interpolation=cv2.INTER_AREA)
    outs.append(img)
if os.environ.get('DIFF') and len(outs) == 2:
    d = np.abs(outs[0] - outs[1]).max(-1)
    outs.append(np.repeat(np.clip(d * 4, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.85, 0.3], np.float32))
sep = np.ones((res, 6, 3), np.float32)
both = np.concatenate(sum([[o, sep] for o in outs], [])[:-1], 1)
os.makedirs(os.path.join(HERE, 'proofs'), exist_ok=True)
fp = os.path.join(HERE, 'proofs', f'{name}.png')
Image.fromarray((np.clip(both, 0, 1) * 255 + 0.5).astype(np.uint8)).save(fp)
print(fp)
