"""Cel paint, stage 0: per-texel surface geometry at 2560 for a textured material.

For every texel centre of the atlas: 3D position P (world), smoothed normal N (the bake agent's toon
normal, welded mesh), UV-island id. Then a padding ring of RING texels around every island is given the
*true* surface data from across the UV seam: the ring texel's position is extrapolated in 3D from the
nearest covered texel of its own island (per-vertex Jacobian, never mixed between islands), and the
nearest covered texel of ANOTHER island within 1.5 texel sizes in 3D, normal-compatible, is the surface
point it stands for (src index). Ring texels with no such partner (open mesh borders) stay invalid.
So a later stencil filter in atlas space sees, around each texel, only texels that are its true
surface neighbours (distance and normal tested per pair), with support continuing across seams.
Writes cache/geo_<short>.npz : P, N (float32 HxWx3), cover, ring_src (flat index or -1), island, texel_m
Usage: python celgeo.py <short> [...]
"""
import os, sys, time
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
import scipy.sparse as sps
from scipy.sparse.csgraph import connected_components
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lines'))
import bakelib_copy as B

RES = 2560
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
BAKE_CACHE = os.path.join(HERE, '..', 'bake', 'cache')
RING = {'body': 8, 'helmet': 24, 'chest': 8, 'buckle': 8, 'clasp': 8}


def main(short):
    t0 = time.time()
    g, prims = B.load_gltf('detail')
    p = [q for q in prims if q['material'] in B.TEXTURED and B.SHORT[q['material']] == short][0]
    geo = np.load(os.path.join(BAKE_CACHE, f'geom_detail_{short}.npz'))
    inv, P, T = geo['inv'], geo['P'], geo['toon']
    Fg = p['idx']; nv = len(p['uv'])
    A = sps.coo_matrix((np.ones(len(Fg) * 2), (np.r_[Fg[:, 0], Fg[:, 1]], np.r_[Fg[:, 1], Fg[:, 2]])), shape=(nv, nv))
    isl_v = connected_components(A, directed=False)[1]
    img, mask, tri = B.raster(p['uv'], Fg, np.concatenate([P, T], 1)[inv], RES)
    island = np.where(mask, isl_v[Fg[np.maximum(tri, 0), 0]], -1)
    # per glTF vertex Jacobian dP/dpixel (area-weighted over incident triangles: island-local)
    uvp = p['uv'] * RES; Pv = P[inv]
    e1 = uvp[Fg[:, 1]] - uvp[Fg[:, 0]]; e2 = uvp[Fg[:, 2]] - uvp[Fg[:, 0]]
    f1 = Pv[Fg[:, 1]] - Pv[Fg[:, 0]]; f2 = Pv[Fg[:, 2]] - Pv[Fg[:, 0]]
    det = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
    ok = np.abs(det) > 1e-9
    dd = np.where(ok, det, 1.0)
    J = np.concatenate([(f1 * e2[:, 1:2] - f2 * e1[:, 1:2]) / dd[:, None], (f2 * e1[:, 0:1] - f1 * e2[:, 0:1]) / dd[:, None]], 1)
    med = np.median(np.linalg.norm(J[ok, :3], axis=1))
    for sl in (slice(0, 3), slice(3, 6)):
        ln = np.linalg.norm(J[:, sl], axis=1, keepdims=True)
        J[:, sl] *= np.minimum(1, 3 * med / np.maximum(ln, 1e-20))
    wa = np.where(ok, np.abs(det), 0)
    Jv = np.zeros((nv, 6)); cnt = np.zeros(nv)
    for k in range(3):
        np.add.at(Jv, Fg[ok, k], J[ok] * wa[ok, None]); np.add.at(cnt, Fg[ok, k], wa[ok])
    Jv /= np.maximum(cnt, 1e-20)[:, None]
    # texel size (world) per covered texel from its triangle's Jacobian
    tsz = np.where(mask, np.linalg.norm(J[np.maximum(tri, 0)][..., :3], axis=-1), np.nan)
    # ring extrapolation
    dist, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
    ring = (~mask) & (dist <= RING[short])
    yy, xx = np.nonzero(ring)
    sy, sx = iy[yy, xx], ix[yy, xx]
    st = tri[sy, sx]
    Jst = Jv[Fg[st]].mean(1)                     # island-local Jacobian at the source texel
    Pe = img[sy, sx, :3] + Jst[:, :3] * (xx - sx)[:, None] + Jst[:, 3:] * (yy - sy)[:, None]
    Ns = img[sy, sx, 3:]
    cy, cx = np.nonzero(mask)
    Pc = img[cy, cx, :3]
    tree = cKDTree(Pc)
    dq, iq = tree.query(Pe, k=8, workers=2)
    iq = np.minimum(iq, len(Pc) - 1)
    oth = island[cy[iq], cx[iq]] != island[sy, sx][:, None]
    ncomp = (img[cy[iq], cx[iq], 3:] * Ns[:, None, :]).sum(2) > 0.5
    lim = 1.5 * np.maximum(tsz[sy, sx], 1e-5)[:, None]
    good = oth & ncomp & (dq < lim)
    has = good.any(1)
    pick = iq[np.arange(len(iq)), good.argmax(1)]
    ring_src = np.full(RES * RES, -1, np.int64)
    ring_src[(yy * RES + xx)[has]] = (cy[pick] * RES + cx[pick])[has]
    Pimg = img[..., :3].astype(np.float32); Nimg = img[..., 3:].astype(np.float32)
    src = ring_src[ring_src >= 0]
    tgt = np.nonzero(ring_src >= 0)[0]
    Pimg.reshape(-1, 3)[tgt] = Pimg.reshape(-1, 3)[src]
    Nimg.reshape(-1, 3)[tgt] = Nimg.reshape(-1, 3)[src]
    np.savez(os.path.join(CACHE, f'geo_{short}.npz'), P=Pimg, N=Nimg, cover=mask, ring_src=ring_src,
             island=island.astype(np.int32), texel_m=np.float32(med))
    print(f'{short}: cover {mask.mean():.3f}  islands {isl_v.max()+1}  texel {med*1e3:.3f} mm  ring {ring.sum()} '
          f'texels, {has.mean():.3f} matched across a seam  {time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        main(s)
