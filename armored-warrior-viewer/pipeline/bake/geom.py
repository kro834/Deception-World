"""Stage 1: per-vertex geometry signals on the welded detail mesh.

For each textured primitive (world space, units = glTF metres, figure ~0.98 tall):
  * weld split vertices by position so smoothing crosses UV seams (seam-free by construction)
  * N    : glTF NORMAL averaged onto welded vertices (orientation comes from the authored normals,
           not from triangle winding, which is flipped on ~1% of the body triangles)
  * curv : band-pass mean curvature  c = dot(P_fine - P_coarse, n_coarse) / r_coarse
           (P_* = implicit Laplacian smoothing of positions at radius r)  -> dimensionless
  * toon : multi-scale smoothed normal with coherence fallback (thin blades / rims keep a finer scale)
Writes cache/geom_<mode>_<short>.npz
Usage: python geom.py [detail|standard]
"""
import os, sys, time, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

MODE = sys.argv[1] if len(sys.argv) > 1 else 'detail'
CACHE = os.path.join(B.HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
mm = 1e-3
COH = (0.35, 0.6)   # coherence gate: below -> thin blade / rim where opposite sides cancel
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None

# per-material tuning (radii in metres). The body is ~1 m tall; helmet/buckle/clasp are ~13 cm wide
# props with much finer tessellation, so their feature scale is smaller.
TUNE = {
    'body':   dict(r_fine=1.5 * mm, r_coarse=3.5 * mm,  toon=[3 * mm, 6 * mm, 12 * mm]),
    'helmet': dict(r_fine=0.6 * mm, r_coarse=2.5 * mm, toon=[1.5 * mm, 4 * mm, 8 * mm]),
    'buckle': dict(r_fine=0.5 * mm, r_coarse=2.0 * mm, toon=[1.0 * mm, 2.5 * mm, 5 * mm]),
    'clasp':  dict(r_fine=0.6 * mm, r_coarse=2.5 * mm, toon=[1.5 * mm, 3.5 * mm, 7 * mm]),
    'chest':  dict(r_fine=0.6 * mm, r_coarse=2.5 * mm, toon=[1.0 * mm, 2.0 * mm, 4 * mm]),
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def t_of(r):
    return r * r / 1.5   # L ~ 1.5 * (-Laplace) for valence-6 meshes with 1/l^2 weights


def main():
    g, prims = B.load_gltf(MODE)
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        if ONLY and B.SHORT[p['material']] not in ONLY:
            continue
        short = B.SHORT[p['material']]
        tu = TUNE[short]
        t0 = time.time()
        inv, P = B.weld(p['pos'])
        F = inv[p['idx']]
        F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
        N = np.zeros_like(P); np.add.at(N, inv, B.normalize(p['nrm'])); N = B.normalize(N)
        L, med = B.laplacian(P, F)
        Pf = B.diffuse(L, P, t_of(tu['r_fine']))
        Pc = B.diffuse(L, P, t_of(tu['r_coarse']))
        Nc = B.normalize(B.diffuse(L, N, t_of(tu['r_coarse'])))
        rf, rc, rcc = tu['r_fine'], tu['r_coarse'], tu['r_coarse'] * 4
        Pcc = B.diffuse(L, P, t_of(rcc))
        curv_band = np.einsum('ij,ij->i', Pf - Pc, Nc) / rc
        # remove the broad convexity of limbs/petals so G isolates edges and creases:
        k_lo = np.einsum('ij,ij->i', Pc - Pcc, Nc) / (rcc ** 2 - rc ** 2)
        curv = curv_band - k_lo * (rc ** 2 - rf ** 2) / rc
        # toon normal: coarse-to-fine coherence blend
        n = B.normalize(B.diffuse(L, N, t_of(tu['toon'][0] * 0.5)))
        mags = []
        for r in tu['toon']:
            S = B.diffuse(L, N, t_of(r))
            m = np.linalg.norm(S, axis=1)
            mags.append(m)
            Sn = B.normalize(S)
            agree = smoothstep(0.6, 0.85, np.einsum('ij,ij->i', Sn, n))
            w = smoothstep(COH[0], COH[1], m) * agree
            n = B.normalize(n * (1 - w[:, None]) + Sn * w[:, None])
        np.savez_compressed(os.path.join(CACHE, f'geom_{MODE}_{short}.npz'), inv=inv, P=P, F=F, N=N,
                            curv=curv, curv_band=curv_band, toon=n, mags=np.stack(mags, 1))
        pc = np.percentile(curv, [1, 5, 25, 50, 75, 95, 99])
        print(f'{short:7s} welded {len(P)} med edge {med*1e3:.2f}mm  curv pct {np.round(pc, 4)}  '
              f'toon coherence<0.75 at largest scale {(mags[-1] < 0.75).mean():.3f}  {time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
