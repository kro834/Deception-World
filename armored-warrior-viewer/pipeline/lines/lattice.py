"""Stage 2 (linework): stripe families on the welded detail mesh (see stripes.py).

R  armour scales : two families of lines at +/-alpha to the armour long axis d (surf.py tensor STR)
                   -> rhombic scales in regular rows; width w across, l = a*w along d,
                   alpha = atan(w/l), line spacing lambda = w*l/sqrt(w^2+l^2).
G  crystal facets: along the crystal long axis (tensor ST, PCA-dominant: blades, drapes, tail fins)
                   g1, g2 : long streaks at shallow, slowly wandering angles with incommensurate
                            spacings, so their crossings make long, irregular facets (not a lattice)
                   g3     : sparse cross facets at a steep angle, shown only where a smooth surface
                            noise gate is open (strokes taper out at the gate's edges)
Writes cache/lattice_<short>.npz : for each family f: psi_f (n,2), r_f (n,3), lam_f (n,), plus gate_g3 (n,)
Usage: python lattice.py <short> [...]
"""
import os, sys, time
import numpy as np
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surf as S
import stripes as ST
import bakelib_copy as B

CFG = {
    'body':   dict(w=0.0160, amax=1.8, h=0.0040, K=2, unit=1.0),
    'helmet': dict(w=0.0090, amax=1.6, h=0.0020, K=2, unit=0.6, scales=False),
    'chest':  dict(w=0.0100, amax=1.0, h=0.0020, K=1, unit=0.7, scales=False),
}
# crystal families: (name, angle to d [deg], spacing [m] at unit=1, angle wander [deg], coarse K)
GFAM = [('g1', 8.0, 0.0160, 8.0, 2), ('g2', -11.0, 0.0230, 8.0, 1), ('g3', 65.0, 0.036, 10.0, 1)]
GATE = (0.30, 0.75)          # g3 shown where the noise gate n in [0,1] exceeds these (smoothstep)


def smooth_tensor(P, F, N, comp, sf, key, r_smooth):
    Tv = S.interp_tensor(cKDTree(sf['SP']), sf[key], sf['SN'], sf['SC'], P, N, comp)
    L, _ = B.laplacian(P, F)
    return B.diffuse(L, Tv, r_smooth ** 2 / 1.5, tol=1e-5)


def surf_noise(P, wavelength, seed, m=7):
    """Smooth band-limited 3D noise in [-1,1]-ish: sum of random plane waves."""
    rng = np.random.default_rng(seed)
    k = rng.normal(size=(m, 3)); k /= np.linalg.norm(k, axis=1, keepdims=True)
    k *= 2 * np.pi / wavelength * rng.uniform(0.7, 1.3, (m, 1))
    ph = rng.uniform(0, 2 * np.pi, m)
    return np.sin(P @ k.T + ph).sum(1) / np.sqrt(m / 2)


def main(short):
    t0 = time.time()
    c = CFG[short]
    geo = np.load(os.path.join(S.BAKE_CACHE, f'geom_detail_{short}.npz'))
    sf = np.load(os.path.join(S.CACHE, f'surf_{short}.npz'))
    P, F, N = geo['P'], geo['F'], S.normalize(geo['N'])
    comp = sf['comp']
    fa = np.linalg.norm(np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]]), axis=1) / 2
    va = np.zeros(len(P)); [np.add.at(va, F[:, k], fa / 3) for k in range(3)]
    out = {}
    # ---------------- R
    TR = smooth_tensor(P, F, N, comp, sf, 'STR', 0.008 * c['unit'])
    d, b, a = S.frame_from_tensor(TR, N, c['amax'])
    w = c['w']; l = a * w
    al = np.arctan2(w, l)
    lam = w * l / np.sqrt(w * w + l * l)
    out['scales'] = np.array(c.get('scales', True))
    for tag, sgn in ((('rp', 1), ('rm', -1)) if c.get('scales', True) else ()):
        t = np.cos(al)[:, None] * d + sgn * np.sin(al)[:, None] * b
        r = S.normalize(np.cross(N, t))
        print(f'{short} {tag}:', flush=True)
        psi = ST.solve(P, F, N, comp, va, r, lam, c['h'], c['K'])
        out['psi_' + tag] = psi.astype(np.float32); out['r_' + tag] = r.astype(np.float32); out['lam_' + tag] = lam.astype(np.float32)
    # ---------------- G
    TG = smooth_tensor(P, F, N, comp, sf, 'ST', 0.006 * c['unit'])
    d, b, _ = S.frame_from_tensor(TG, N, 2.0)
    for i, (tag, ang, sp, wander, K) in enumerate(GFAM):
        th = np.radians(ang + wander * surf_noise(P, 0.09 * c['unit'], 10 + i))
        t = np.cos(th)[:, None] * d + np.sin(th)[:, None] * b
        r = S.normalize(np.cross(N, t))
        lam = np.full(len(P), sp * c['unit'])
        print(f'{short} {tag}:', flush=True)
        psi = ST.solve(P, F, N, comp, va, r, lam, max(c['h'], lam[0] / 6 * K / 1.0) if K > 1 else c['h'], K)
        out['psi_' + tag] = psi.astype(np.float32); out['r_' + tag] = r.astype(np.float32); out['lam_' + tag] = lam.astype(np.float32)
    n = surf_noise(P, 0.07 * c['unit'], 99)
    out['gate_g3'] = np.clip(0.5 + 0.5 * n / 1.6, 0, 1).astype(np.float32)
    np.savez_compressed(os.path.join(S.CACHE, f'lattice_{short}.npz'), **out)
    print(f'{short}: done {time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        main(s)
