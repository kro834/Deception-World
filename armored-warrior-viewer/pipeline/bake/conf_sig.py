"""conf stage A: per-welded-vertex reliability signals of the projected painting (detail mesh).
  vis   : best of front (+Z) / back (-Z) projection: facing term |n.z| (smoothed normal) times
          unoccluded ray along that axis (mathutils BVH over all 12 primitives)
  coh   : streakiness = coherence of the base-colour structure tensor (texture-local, inside the island,
          sampled at the vertex), 1 = all gradients parallel (smear streaks)
  hf    : local detail energy (high-pass magnitude of luminance) in texel units
  dens  : texel density relative to the material median (stretch)
  ao    : baked AO
Writes cache/csig_<short>.npz
"""
import os, sys, time
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
import bpy  # noqa: F401
from mathutils.bvhtree import BVHTree
from mathutils import Vector

C = os.path.join(B.HERE, 'cache')


def tex_signals(tex, cov):
    L = tex @ np.array([0.299, 0.587, 0.114])
    m = cov.astype(np.float64)
    def nconv(x, s):
        return ndimage.gaussian_filter(x * m, s) / np.maximum(ndimage.gaussian_filter(m, s), 1e-6)
    Ls = ndimage.gaussian_filter(L, 1.0)
    gx = ndimage.sobel(Ls, 1) / 8; gy = ndimage.sobel(Ls, 0) / 8
    jxx = nconv(gx * gx, 5); jyy = nconv(gy * gy, 5); jxy = nconv(gx * gy, 5)
    tr = jxx + jyy
    det = jxx * jyy - jxy ** 2
    disc = np.sqrt(np.maximum(tr * tr / 4 - det, 0))
    l1 = tr / 2 + disc; l2 = tr / 2 - disc
    coh = ((l1 - l2) / np.maximum(l1 + l2, 1e-9)) ** 2
    hf = nconv(np.abs(L - ndimage.gaussian_filter(L, 2.0)), 4)
    return coh, hf, tr


def main():
    g, prims = B.load_gltf('detail')
    allP = [p['pos'] for p in prims]; allF = []
    off = 0
    for p in prims:
        allF.append(p['idx'] + off); off += len(p['pos'])
    bvh = BVHTree.FromPolygons(np.concatenate(allP).tolist(), np.concatenate(allF).tolist(), all_triangles=True)
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        t0 = time.time()
        d = np.load(os.path.join(C, f'geom_detail_{s}.npz'))
        inv, P, F, toon = d['inv'], d['P'], d['F'], d['toon']
        ao = np.load(os.path.join(C, f'ao_detail_{s}.npz'))['ao']
        nW = len(P)
        # visibility along +/-Z
        vf = np.zeros(nW, bool); vb = np.zeros(nW, bool)
        rc = bvh.ray_cast
        N = d['N']
        for i in range(nW):
            o = P[i] + N[i] * 3e-4
            if toon[i, 2] > -0.05:
                vf[i] = rc(Vector(o), Vector((0, 0, 1)), 5.0)[0] is None
            if toon[i, 2] < 0.05:
                vb[i] = rc(Vector(o), Vector((0, 0, -1)), 5.0)[0] is None
        facing = np.abs(toon[:, 2])
        vis = np.maximum(vf * np.clip(toon[:, 2], 0, 1), vb * np.clip(-toon[:, 2], 0, 1))
        # texture signals
        tex = B.load_rgb(B.tex_path(g, 'detail', p['material'], 'base'))
        R = tex.shape[0]
        _, cov, _ = B.raster(p['uv'], p['idx'], np.ones(len(p['uv'])), R)
        covi = ndimage.binary_erosion(cov, iterations=2)
        coh, hf, en = tex_signals(tex, covi)
        stack = np.stack([coh, hf, en], -1)
        stack = B.fill_nearest(stack, covi)
        sv = B.sample_bilinear(stack, p['uv'])
        cnt = np.bincount(inv, minlength=nW)
        sw = np.stack([np.bincount(inv, sv[:, k], minlength=nW) for k in range(3)], 1) / np.maximum(cnt, 1)[:, None]
        # texel density per vertex: texels^2 per m^2 (area-weighted over incident glTF triangles)
        a3 = np.linalg.norm(B.face_normals(p['pos'], p['idx']), axis=1) / 2
        uvp = p['uv'] * R
        e1 = uvp[p['idx'][:, 1]] - uvp[p['idx'][:, 0]]; e2 = uvp[p['idx'][:, 2]] - uvp[p['idx'][:, 0]]
        a2 = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) / 2
        dv = np.zeros(nW); wv = np.zeros(nW)
        for k in range(3):
            np.add.at(dv, inv[p['idx'][:, k]], a2); np.add.at(wv, inv[p['idx'][:, k]], a3)
        dens = (dv / np.maximum(wv, 1e-20))
        dens = dens / np.median(dens[wv > 0])
        np.savez_compressed(os.path.join(C, f'csig_{s}.npz'), vis=vis, vf=vf, vb=vb, facing=facing, coh=sw[:, 0],
                            hf=sw[:, 1], en=sw[:, 2], dens=dens, ao=ao)
        print(s, 'vis>0.3 %.3f' % (vis > 0.3).mean(), 'coh pct', np.percentile(sw[:, 0], [10, 50, 90]).round(2),
              'hf pct', np.percentile(sw[:, 1], [10, 50, 90]).round(3), 'dens pct', np.percentile(dens, [5, 50, 95]).round(2),
              f'{time.time()-t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
