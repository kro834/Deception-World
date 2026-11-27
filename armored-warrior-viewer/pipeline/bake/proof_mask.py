"""Proof of the delivered mask maps, rebuilt exactly as the viewer would: sample mask WebP with the
model's own glTF UVs (flipY=false, bilinear), class = smoothstep(0.5-w, 0.5+w, v) per channel, crystal
tinted by the A gradient. Panel: [classes | base colour (| sheet for full front/back)].
Usage: python proof_mask.py <standard|detail> <maps_dir> <name> <az,az..> [cx cy cz half]
Also prints screen-space class shares of the figure for full views."""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

mode, mdir, name = sys.argv[1], sys.argv[2], sys.argv[3]
azs = [float(a) for a in sys.argv[4].split(',')]
center = half = None
if len(sys.argv) > 8:
    center = np.array([float(v) for v in sys.argv[5:8]]); half = float(sys.argv[8])
res = int(os.environ.get('RES', 800))
man = json.load(open(os.path.join(mdir, 'manifest.json'), encoding='utf-8'))
g, prims = B.load_gltf(mode)
meshes = [(p['pos'], p['idx']) for p in prims]
masks, bases = [], []
for p in prims:
    e = man['maps'].get(p['material'], {}).get(mode, {})
    if 'mask' in e:
        masks.append((np.asarray(Image.open(os.path.join(mdir, e['mask'])).convert('RGBA'), np.float32) / 255, e['maskSpread']))
    else:
        masks.append(None)
    bases.append(B.load_rgb(B.tex_path(g, mode, p['material'], 'base')) if p['uv'] is not None else None)
ARM = np.array([0.08, 0.08, 0.10]); GOLD = np.array([0.80, 0.55, 0.30]); DEV = np.array([0.86, 0.88, 0.92])
BLUE = np.array([0.19, 0.35, 0.78]); VIO = np.array([0.75, 0.47, 0.93]); PINK = np.array([0.94, 0.49, 0.75])
UNK = np.array([0.6, 0.2, 0.2])


def crystal_col(t):
    t = t[:, None]
    return np.where(t < 0.5, BLUE + (VIO - BLUE) * (2 * t), VIO + (PINK - VIO) * (2 * t - 1))


for az in azs:
    bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
    cls = np.ones((res, res, 3)); base = np.ones((res, res, 3))
    share = np.zeros(4); npx = 0
    for mi, p in enumerate(prims):
        m = bm == mi
        if not m.any():
            continue
        if p['uv'] is None:
            cls[m] = UNK; base[m] = UNK; continue
        uv = np.einsum('nk,nkc->nc', bb[m], p['uv'][p['idx'][bt[m]]])
        base[m] = B.sample_bilinear(bases[mi], uv)
        if masks[mi] is None:
            cls[m] = UNK; continue
        mk, spread = masks[mi]
        v = B.sample_bilinear(mk, uv)
        wdt = 0.5 / spread   # ~1 texel of antialiasing
        a = np.clip((v[:, :3] - 0.5 + wdt) / (2 * wdt), 0, 1)
        c = ARM[None] * np.ones((len(v), 1))
        c = c * (1 - a[:, 1:2]) + crystal_col(v[:, 3]) * a[:, 1:2]
        c = c * (1 - a[:, 0:1]) + GOLD * a[:, 0:1]
        c = c * (1 - a[:, 2:3]) + DEV * a[:, 2:3]
        cls[m] = c
        hard = (v[:, :3] > 0.5)
        share += [np.sum(~hard.any(1)), hard[:, 0].sum(), hard[:, 1].sum(), hard[:, 2].sum()]
        npx += len(v)
    panels = [cls, base]
    if center is None and int(az) in (0, 180):
        sheet = Image.open(os.path.join(B.HERE, '..', '..', 'refs', 'front.png' if int(az) == 0 else 'back.jpg')).convert('RGB')
        sw = int(sheet.width * res / sheet.height)
        sh = np.ones((res, res, 3)); si = np.asarray(sheet.resize((min(sw, res), res)), np.float32) / 255
        o = (res - si.shape[1]) // 2; sh[:, o:o + si.shape[1]] = si
        panels.append(sh)
    out = np.concatenate(panels, 1)
    fn = os.path.join(B.HERE, 'proofs', f'mask_{mode}_{name}_{int(az)}.png')
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(fn)
    if center is None:
        sh = share / max(npx, 1)
        print(f'{fn}  screen share (textured figure px): armour {sh[0]:.3f} gold {sh[1]:.3f} crystal {sh[2]:.3f} device {sh[3]:.3f}')
    else:
        print(fn)
