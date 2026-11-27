"""Mask stage A: subdivide the welded detail mesh once (1->4, seam-consistent) and sample texture
features at every vertex. Classification later runs on this mesh, so class boundaries are continuous
across UV seams and are smooth curves at ~1 mm vertex spacing on the body.
Writes cache/mfeat_<short>.npz with
  glTF-level: uv2 (N2,2), idx2 (T2,3), inv2 (N2,)   -> for rasterising
  welded    : P (W2,3), F (W2 faces), N, base (W2,3) linear 0..1 sRGB values, emis (W2,3), ao, curv
Usage: python mask_feat.py [only,list]
"""
import os, sys, time
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
# the body is coarsely tessellated (median edge 1.9 mm, p95 6.6 mm): two levels -> ~0.5 mm, so thin
# painted gold bands (2-3 mm) are several vertices wide
LEVELS = {'body': 2}
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None


def subdivide(uv, idx, inv, Pw, attrs_w):
    """1->4 midpoint subdivision. glTF-level verts get midpoint UVs per glTF edge; welded verts get one
    midpoint per welded edge (so both sides of a UV seam share the new vertex)."""
    W = len(Pw)
    T = len(idx)
    ge = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]])            # (3T,2) glTF edges
    we = inv[ge]
    wkey = np.sort(we, 1)
    wu, winv = np.unique(wkey, axis=0, return_inverse=True)
    gkey = np.sort(ge, 1)
    gu, ginv = np.unique(gkey, axis=0, return_inverse=True)
    N = len(uv)
    # welded id of each unique glTF edge midpoint
    g_to_w = np.empty(len(gu), np.int64); g_to_w[ginv.ravel()] = winv.ravel()
    uv2 = np.concatenate([uv, (uv[gu[:, 0]] + uv[gu[:, 1]]) / 2])
    inv2 = np.concatenate([inv, W + g_to_w])
    P2 = np.concatenate([Pw, (Pw[wu[:, 0]] + Pw[wu[:, 1]]) / 2])
    at2 = {k: np.concatenate([a, (a[wu[:, 0]] + a[wu[:, 1]]) / 2]) for k, a in attrs_w.items()}
    m = (N + ginv.ravel()).reshape(3, T).T          # midpoints of edges 01,12,20
    a, b, c = idx[:, 0], idx[:, 1], idx[:, 2]
    m01, m12, m20 = m[:, 0], m[:, 1], m[:, 2]
    idx2 = np.concatenate([np.stack([a, m01, m20], 1), np.stack([m01, b, m12], 1),
                           np.stack([m20, m12, c], 1), np.stack([m01, m12, m20], 1)])
    return uv2, idx2, inv2, P2, at2


def sample_avg(tex, uv, inv, nW):
    v = B.sample_bilinear(tex, uv)
    cnt = np.bincount(inv, minlength=nW)
    return np.stack([np.bincount(inv, v[:, k], minlength=nW) for k in range(v.shape[1])], 1) / np.maximum(cnt, 1)[:, None]


def main():
    g, prims = B.load_gltf('detail')
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        if ONLY and s not in ONLY:
            continue
        t0 = time.time()
        d = np.load(os.path.join(C, f'geom_detail_{s}.npz'))
        ao = np.load(os.path.join(C, f'ao_detail_{s}.npz'))['ao']
        inv = d['inv']; Pw = d['P']
        uv2, idx2, inv2, P2, at = subdivide(p['uv'], p['idx'], inv, Pw,
                                            {'N': d['N'], 'ao': ao, 'curv': d['curv'], 'toon': d['toon']})
        for lev in range(1, LEVELS.get(s, 1)):
            uv2, idx2, inv2, P2, at = subdivide(uv2, idx2, inv2, P2, at)
        F2 = inv2[idx2]
        F2 = F2[(F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])]
        nW = len(P2)
        feats = {}
        cov = None
        for slot in ('base', 'emissive'):
            tex = B.load_rgb(B.tex_path(g, 'detail', p['material'], slot))
            # No image-space blur (it would mix the padding / neighbouring islands into border texels).
            # Instead every texel outside this material's UV coverage takes the value of the nearest
            # covered texel, so bilinear taps at island borders only see the island's own paint.
            if cov is None or cov.shape != tex.shape[:2]:
                _, cov, _ = B.raster(p['uv'], p['idx'], np.ones(len(p['uv'])), tex.shape[0])
                # drop the outermost texel ring too: in the source atlas it is often blended with padding
                cov = ndimage.binary_erosion(cov, iterations=1)
            tex = B.fill_nearest(tex, cov)
            feats[slot] = sample_avg(tex, uv2, inv2, nW).astype(np.float32)
        np.savez_compressed(os.path.join(C, f'mfeat_{s}.npz'), uv2=uv2, idx2=idx2, inv2=inv2, P=P2, F=F2,
                            N=B.normalize(at['N']), toon=B.normalize(at['toon']), ao=at['ao'], curv=at['curv'],
                            base=feats['base'], emis=feats['emissive'])
        print(s, 'welded verts', len(Pw), '->', nW, 'faces', len(F2), f'{time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
