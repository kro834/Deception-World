"""Mask stage C: labels on the subdivided welded mesh -> RGBA distance-field mask textures.

For class c in (gold, crystal, device):  S = heat-smoothed one-hot labels (radius R_B on the mesh),
f_c = S_c - max_{o != c} S_o  (so neighbouring classes share exactly the same zero contour and can
never overlap), rasterised in UV space; the texel-space signed distance is d = f / |grad_uv f| (gradient
per triangle in texel units, averaged to vertices), stored as v = clamp(0.5 + d / (2*SPREAD), 0, 1).
A = crystal gradient position (smoothed on the crystal region, harmonically extended elsewhere).
Uncovered texels: nearest covered value. Output: out/mask_<short>_<res>.webp (lossless RGBA) and the
manifest entry keys 'mask' and 'maskSpread' (merged into out/manifest.json, existing keys preserved).
Usage: python mask_compose.py [only,list]
"""
import os, sys, json, time
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
OUT = os.path.join(B.HERE, 'out')
RES = {'detail': 2048, 'standard': 1024}
SPREAD = 4.0           # texels, both modes
mm = 1e-3
R_B = {'body': 0.6 * mm, 'helmet': 0.4 * mm, 'chest': 0.5 * mm, 'buckle': 0.3 * mm, 'clasp': 0.4 * mm}
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None


def fields(s):
    d = np.load(os.path.join(C, f'mfeat_{s}.npz'))
    lab = np.load(os.path.join(C, f'mlabel_{s}.npz'))
    P, F = d['P'], d['F']
    Lc, Mc = B.laplacian_cot(P, F)
    oh = np.eye(4)[lab['label'].astype(int)]
    Sm = B.diffuse_m(Lc, Mc, oh, R_B[s] ** 2 / 2)
    f = np.empty((len(P), 3))
    for k, c in enumerate((1, 2, 3)):
        f[:, k] = Sm[:, c] - np.max(np.delete(Sm, c, 1), 1)
    return d, f, lab['grad']


def tri_grad_mag(uvt, idx, fv):
    """|grad f| in texel units per triangle, for each of the K columns of fv (per glTF-level vertex)."""
    a, b, c = uvt[idx[:, 0]], uvt[idx[:, 1]], uvt[idx[:, 2]]
    e1 = b - a; e2 = c - a
    det = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
    ok = np.abs(det) > 1e-12
    det = np.where(ok, det, 1)
    out = []
    for k in range(fv.shape[1]):
        f0, f1, f2 = fv[idx[:, 0], k], fv[idx[:, 1], k], fv[idx[:, 2], k]
        df1 = f1 - f0; df2 = f2 - f0
        gx = (df1 * e2[:, 1] - df2 * e1[:, 1]) / det
        gy = (df2 * e1[:, 0] - df1 * e2[:, 0]) / det
        out.append(np.where(ok, np.hypot(gx, gy), 0))
    return np.stack(out, 1), np.abs(det) * ok


def main():
    g, prims = B.load_gltf('detail')
    os.makedirs(OUT, exist_ok=True)
    manp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(manp, encoding='utf-8'))
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        if ONLY and s not in ONLY:
            continue
        t0 = time.time()
        d, f, grad = fields(s)
        uv2, idx2, inv2 = d['uv2'], d['idx2'], d['inv2']
        fv = f[inv2]                       # per glTF-level (UV-split) vertex
        gv = grad[inv2]
        for mode, R in RES.items():
            uvt = uv2 * R
            gm, w = tri_grad_mag(uvt, idx2, fv)
            # area-weighted average of incident triangle gradients -> per vertex
            gvtx = np.zeros((len(uv2), 3)); wv = np.zeros(len(uv2))
            for k in range(3):
                np.add.at(gvtx, idx2[:, k], gm * w[:, None]); np.add.at(wv, idx2[:, k], w)
            gvtx /= np.maximum(wv, 1e-12)[:, None]
            attr = np.concatenate([fv, gvtx, gv[:, None]], 1)
            img, mask, _ = B.raster(uv2, idx2, attr, R)
            img = B.fill_nearest(img, mask)
            fr, gr = img[..., 0:3], img[..., 3:6]
            dist = fr / np.maximum(gr, 1e-6)
            v = np.clip(0.5 + dist / (2 * SPREAD), 0, 1)
            rgba = np.concatenate([v, np.clip(img[..., 6:7], 0, 1)], -1)
            u8 = np.clip(np.round(rgba * 255), 0, 255).astype(np.uint8)
            fn = f'mask_{s}_{R}.webp'
            tmp = os.path.join(OUT, fn + '.tmp.webp')
            Image.fromarray(u8, 'RGBA').save(tmp, 'WEBP', lossless=True, quality=100, method=6, exact=True)
            os.replace(tmp, os.path.join(OUT, fn))
            e = man['maps'][p['material']][mode]
            e['mask'] = fn; e['maskSpread'] = SPREAD
            np.save(os.path.join(C, f'maskcov_{s}_{R}.npy'), mask)
            print(s, mode, R, '%d KB' % (os.path.getsize(os.path.join(OUT, fn)) // 1024),
                  'covered share gold %.3f crystal %.3f device %.3f' % tuple((v[mask] > 0.5).mean(0)), flush=True)
        print(s, f'{time.time()-t0:.0f}s')
    tmp = manp + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, manp)


if __name__ == '__main__':
    main()
