"""Stage 3 (linework): evaluate the line distance fields at every texel of a UV atlas.

Every texel centre is mapped to its 3D surface point, its triangle and barycentrics (rasterised
from the detail mesh, which shares the UV layout with the standard mesh).  Texels in a PAD-texel ring
outside each UV island are extrapolated linearly in 3D from the nearest covered texel (smoothed
per-triangle Jacobian), so bilinear filtering and the first mip levels see a continuous field.
The stripe phases are evaluated from the welded-mesh solution (lattice.py) at that 3D point, so the
fields are continuous across UV seams by construction.

  R = min over armour families (rp, rm) of the distance to the nearest line
  G = crystal facets: max(v(g1), v(g2), gate * v(g3))
Encoding: v = clamp(1 - d / SPREAD_M, 0, 1), d in metres (world units: one stroke weight everywhere,
whatever the texel density of the island).
Writes cache/lines_<short>_<res>.npy (float16, res x res x 2) and cache/cover_<short>_<res>.npy
Usage: python linebake.py <short> <res> [<short> <res> ...]
"""
import os, sys, time
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib_copy as B
import surf as S
import stripes as ST

HERE = S.HERE
CACHE = S.CACHE
SPREAD_M = 0.004            # metres from the line centre to v = 0 (body); scaled by the material's unit


def spread_m(short):
    import lattice as LT
    return SPREAD_M * LT.CFG[short]['unit']
PAD = {2048: 12, 1024: 6}   # texels of 3D extrapolation outside the islands (beyond: nearest fill)
GATE = (0.30, 0.75)


def texel_geometry(short, res):
    g, prims = B.load_gltf('detail')
    p = [q for q in prims if q['material'] in B.TEXTURED and B.SHORT[q['material']] == short][0]
    geo = np.load(os.path.join(S.BAKE_CACHE, f'geom_detail_{short}.npz'))
    inv, P = geo['inv'], geo['P']
    Fg = p['idx']
    Fw = inv[Fg]
    img, mask, tri = B.raster(p['uv'], Fg, P[inv], res)
    uv_c = p['uv'][Fg].reshape(-1, 2)
    bary, _, _ = B.raster(uv_c, np.arange(len(uv_c)).reshape(-1, 3), np.tile(np.eye(3), (len(Fg), 1)), res)
    # per-texel Jacobian dP/d(pixel), from the texel's triangle, length-clamped and blurred
    uvp = p['uv'] * res; Pv = P[inv]
    e1 = uvp[Fg[:, 1]] - uvp[Fg[:, 0]]; e2 = uvp[Fg[:, 2]] - uvp[Fg[:, 0]]
    f1 = Pv[Fg[:, 1]] - Pv[Fg[:, 0]]; f2 = Pv[Fg[:, 2]] - Pv[Fg[:, 0]]
    det = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
    det = np.where(np.abs(det) < 1e-9, np.inf, det)
    J = np.concatenate([(f1 * e2[:, 1:2] - f2 * e1[:, 1:2]) / det[:, None],
                        (f2 * e1[:, 0:1] - f1 * e2[:, 0:1]) / det[:, None]], 1)
    med = np.median(np.linalg.norm(J[np.isfinite(det), :3], axis=1))
    for sl in (slice(0, 3), slice(3, 6)):
        ln = np.linalg.norm(J[:, sl], axis=1, keepdims=True)
        J[:, sl] *= np.minimum(1, 3 * med / np.maximum(ln, 1e-20))
    # smooth the Jacobian over the *unwelded* glTF vertices (split at UV seams, so it never mixes
    # islands), then interpolate it per texel with the barycentrics: no atlas-space filtering at all
    ok = np.isfinite(det)
    wa = np.where(ok, np.abs(det), 0)
    Jv = np.zeros((len(p['uv']), 6)); cnt = np.zeros(len(p['uv']))
    for k in range(3):
        np.add.at(Jv, Fg[ok, k], J[ok] * wa[ok, None]); np.add.at(cnt, Fg[ok, k], wa[ok])
    Jv /= np.maximum(cnt, 1e-20)[:, None]
    Jimg = np.einsum('hwk,hwkc->hwc', bary, Jv[Fg[np.maximum(tri, 0)]]).astype(np.float32)
    dist, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
    ring = (~mask) & (dist <= PAD[res])
    yy, xx = np.nonzero(ring)
    sy, sx = iy[yy, xx], ix[yy, xx]
    dx = (xx - sx)[:, None]; dy = (yy - sy)[:, None]
    img[yy, xx] = img[sy, sx] + Jimg[sy, sx, 0:3] * dx + Jimg[sy, sx, 3:6] * dy
    bary[yy, xx] = bary[sy, sx]
    tri = tri.copy(); tri[yy, xx] = tri[sy, sx]
    valid = mask | ring
    sel = np.nonzero(valid.ravel())[0]
    X = img.reshape(-1, 3)[sel].astype(np.float64)
    tv = Fw[tri.ravel()[sel]]
    bb = np.clip(bary.reshape(-1, 3)[sel].astype(np.float64), 0, 1)
    bb /= np.maximum(bb.sum(1, keepdims=True), 1e-9)
    # fill-in index beyond the ring: nearest *valid* texel
    _, (jy, jx) = ndimage.distance_transform_edt(~valid, return_indices=True)
    return dict(P=P, mask=mask, valid=valid, sel=sel, X=X, tv=tv, bb=bb, fill=(jy, jx), med=med)


def fam_dist(lat, f, T):
    d, _ = ST.eval_points(lat['psi_' + f].astype(np.float64), lat['r_' + f].astype(np.float64),
                          lat['lam_' + f].astype(np.float64), T['P'], T['tv'], T['bb'], T['X'])
    return d


def fields(lat, T, short):
    S_ = spread_m(short)
    v = lambda d: np.clip(1 - d / S_, 0, 1)
    if 'psi_rp' in lat.files:
        dR = np.minimum(fam_dist(lat, 'rp', T), fam_dist(lat, 'rm', T))
    else:   # no scale lattice on this material (helmet: smooth plates on the sheets; chest orb)
        dR = np.full(len(T['X']), np.inf)
    gate = (T['bb'] * lat['gate_g3'][T['tv']]).sum(1)
    gate = np.clip((gate - GATE[0]) / (GATE[1] - GATE[0]), 0, 1)
    vG = np.maximum(np.maximum(v(fam_dist(lat, 'g1', T)), v(fam_dist(lat, 'g2', T))), gate * v(fam_dist(lat, 'g3', T)))
    return v(dR), vG


def main(short, res):
    t0 = time.time()
    T = texel_geometry(short, res)
    lat = np.load(os.path.join(CACHE, f'lattice_{short}.npz'))
    vR, vG = fields(lat, T, short)
    out = np.zeros((res * res, 2), np.float32)
    out[T['sel'], 0] = vR
    out[T['sel'], 1] = vG
    out = out.reshape(res, res, 2)
    jy, jx = T['fill']
    out = np.where(T['valid'][..., None], out, out[jy, jx])
    np.save(os.path.join(CACHE, f'lines_{short}_{res}.npy'), out.astype(np.float16))
    np.save(os.path.join(CACHE, f'cover_{short}_{res}.npy'), T['mask'])
    m = T['mask']
    print(f'{short} {res}: texels {len(T["sel"])}  {T["med"]*1e3:.3f} mm/texel (median)  '
          f'R>0.85 {np.mean(out[m][:, 0] > 0.85):.3f}  G>0.85 {np.mean(out[m][:, 1] > 0.85):.3f}  {time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    a = sys.argv[1:]
    for i in range(0, len(a), 2):
        main(a[i], int(a[i + 1]))
