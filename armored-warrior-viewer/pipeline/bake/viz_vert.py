"""Render per-vertex colours on the subdivided meshes (cache/mfeat_*.npz).
Usage: python viz_vert.py <what> <name> az[,az..] [cx cy cz half]
what: raw | base | emis | labels  (labels needs cache/mlabel_*.npz)"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
COLS = np.array([[0.10, 0.10, 0.13], [0.85, 0.60, 0.30], [0.30, 0.45, 0.95], [0.85, 0.88, 0.92]])


def hsv(rgb):
    mx = rgb.max(1); mn = rgb.min(1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb.T
    h = np.where(mx == r, (g - b) / np.maximum(d, 1e-6) % 6, np.where(mx == g, (b - r) / np.maximum(d, 1e-6) + 2, (r - g) / np.maximum(d, 1e-6) + 4)) * 60
    return h, s, mx


def colours(what, s, d):
    if what == 'base':
        return d['base']
    if what == 'thick':
        t = np.load(os.path.join(C, f'mthick_{s}.npy'))
        v = np.clip(t / 0.04, 0, 1)
        return np.where((t == 0)[:, None], [1.0, 0.2, 0.2], np.stack([v, v, v], 1))
    if what == 'emis':
        return d['emis']
    if what == 'labels':
        L = np.load(os.path.join(C, f'mlabel_{s}.npz'))
        col = COLS[L['label']]
        if 'grad' in L and what == 'labels':
            pass
        return col
    if what == 'grad':
        L = np.load(os.path.join(C, f'mlabel_{s}.npz'))
        t = L['grad'][:, None]
        c = np.where(t < 0.5, (1 - 2 * t) * np.array([0.19, 0.35, 0.78]) + 2 * t * np.array([0.75, 0.47, 0.93]),
                     (2 - 2 * t) * np.array([0.75, 0.47, 0.93]) + (2 * t - 1) * np.array([0.94, 0.49, 0.75]))
        return np.where((L['label'] == 2)[:, None], c, c * 0.25 + 0.05)
    h, sat, v = hsv(d['base'])
    gold = ((h > 12) & (h < 50)) * sat * v
    blue = ((h > 190) & (h < 340)) * sat * v
    e = d['emis'].max(1)
    return np.stack([gold * 2, e, blue * 2], 1)


def main():
    what, name = sys.argv[1], sys.argv[2]
    azs = [float(a) for a in sys.argv[3].split(',')]
    center = half = None
    if len(sys.argv) > 7:
        center = np.array([float(v) for v in sys.argv[4:7]]); half = float(sys.argv[7])
    meshes, cols = [], []
    for mat in B.TEXTURED:
        s = B.SHORT[mat]
        d = np.load(os.path.join(C, f'mfeat_{s}.npz'))
        meshes.append((d['P'], d['F'])); cols.append(colours(what, s, d))
    res = int(os.environ.get('RES', 1000))
    for az in azs:
        bm, bt, bb, _ = B.render_ortho(meshes, az, 90, res, center, half)
        img = np.ones((res, res, 3))
        for mi, (P, F) in enumerate(meshes):
            m = bm == mi
            if m.any():
                img[m] = np.einsum('nk,nkc->nc', bb[m], cols[mi][F[bt[m]]])
        fn = os.path.join(B.HERE, 'proofs', f'v_{what}_{name}_{int(az)}.png')
        Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(fn)
        print(fn)


if __name__ == '__main__':
    main()
