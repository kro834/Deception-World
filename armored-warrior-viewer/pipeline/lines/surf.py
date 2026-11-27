"""Stage 1 (linework): surface frame field + anisotropic CVT seeds, on the welded detail mesh.

Input : the bake agent's welded-mesh cache  pipeline/bake/cache/geom_detail_<short>.npz  (P world, F, N, inv)
Output: cache/surf_<short>.npz  with
   samples  : SP (S,3) positions, SN normals, ST (S,6) smoothed direction tensors, SC component id
   seeds_<f>: per field f in FIELDS: positions, normals, component id   (CVT in the anisotropic metric)

Direction field (the long axis that scales and facets are stretched along):
   PCA of the surface patch within R_PCA (same component, normal-compatible) -> axis e1 with
   anisotropy c = 1 - l2/l1; tensor T = c * t1 t1^T + W_UP * tu tu^T  (t1, tu = e1 and world-up
   projected on the tangent plane), then averaged over neighbours twice.  Limbs, blades, drapes, the
   tail get their long axis; flat/ambiguous spots fall back to "vertical"; caps go isotropic.

Metric for a point with frame (d, b = n x d, n) and stretch a:
   |x|^2 = (x.d / a)^2 + (x.b)^2 + (x.n)^2,   a = 1 + (AMAX - 1) * smoothstep(E0, E1, eigen-anisotropy)
Usage: python surf.py <short> [...]
"""
import os, sys, time
import numpy as np
from scipy.spatial import cKDTree
import scipy.sparse as sps
from scipy.sparse.csgraph import connected_components

HERE = os.path.dirname(os.path.abspath(__file__))
BAKE_CACHE = os.path.join(HERE, '..', 'bake', 'cache')
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
W = 2  # threads

# per material: PCA radius, sample spacing, fields (s = across spacing in metres, amax = max stretch)
CFG = {
    'body':   dict(r_pca=0.035, n_samp=60000, fields={'R': dict(s=0.0135, amax=1.75), 'G': dict(s=0.0085, amax=4.5)}),
    'helmet': dict(r_pca=0.015, n_samp=40000, fields={'R': dict(s=0.0100, amax=1.6), 'G': dict(s=0.0060, amax=4.0)}),
    'chest':  dict(r_pca=0.010, n_samp=756,   fields={'R': dict(s=0.0100, amax=1.0), 'G': dict(s=0.0060, amax=3.0)}),
}
W_UP = 0.12
E0, E1 = 0.08, 0.45
UP = np.array([0.0, 1.0, 0.0])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-20)


def tensor6(v, w=1.0):
    w = np.broadcast_to(np.asarray(w, float), v.shape[:1])
    return np.stack([v[:, 0] * v[:, 0], v[:, 1] * v[:, 1], v[:, 2] * v[:, 2],
                     v[:, 0] * v[:, 1], v[:, 0] * v[:, 2], v[:, 1] * v[:, 2]], 1) * w[:, None]


def frame_from_tensor(T6, N, amax):
    """Principal tangent direction d, binormal b and stretch a from 6-component tensors at normals N."""
    M = np.empty((len(T6), 3, 3))
    M[:, 0, 0], M[:, 1, 1], M[:, 2, 2] = T6[:, 0], T6[:, 1], T6[:, 2]
    M[:, 0, 1] = M[:, 1, 0] = T6[:, 3]; M[:, 0, 2] = M[:, 2, 0] = T6[:, 4]; M[:, 1, 2] = M[:, 2, 1] = T6[:, 5]
    # project to tangent plane: P M P
    Pm = np.eye(3)[None] - N[:, :, None] * N[:, None, :]
    M = Pm @ M @ Pm
    w, V = np.linalg.eigh(M)
    d = V[:, :, 2]
    d = normalize(d - (d * N).sum(1, keepdims=True) * N)
    e = (w[:, 2] - w[:, 1]) / np.maximum(w[:, 2] + w[:, 1], 1e-30)
    a = 1 + (amax - 1) * smoothstep(E0, E1, e)
    b = normalize(np.cross(N, d))
    return d, b, a


def interp_tensor(tree, ST, SN, SC, X, NX, CX, k=8):
    """IDW interpolation of sample tensors at points X (normal- and component-compatible)."""
    dist, idx = tree.query(X, k=k, workers=W)
    ok = ((SN[idx] * NX[:, None, :]).sum(2) > 0.2) & (SC[idx] == CX[:, None])
    w = ok / np.maximum(dist, 1e-4) ** 2
    bad = w.sum(1) == 0
    w[bad, 0] = 1.0   # fall back to the nearest sample
    w /= w.sum(1, keepdims=True)
    return (ST[idx] * w[:, :, None]).sum(1)


def cvt(X, NX, CX, AREA, Tx, s, amax, iters=14, seed=1):
    """Anisotropic centroidal Voronoi tessellation over point cloud X (surface samples with area weights)."""
    d, b, a = frame_from_tensor(Tx, NX, amax)
    rho = AREA / a                                       # metric-space area per point
    n_seeds = int(round(rho.sum() / (0.866 * s * s)))
    rng = np.random.default_rng(seed)
    S = rng.choice(len(X), n_seeds, replace=False, p=rho / rho.sum())
    k = 16 if amax < 2.5 else 28
    for it in range(iters):
        sp_ = X[S]
        tr = cKDTree(sp_)
        _, nn = tr.query(X, k=min(k, len(S)), workers=W)
        D = sp_[nn] - X[:, None, :]
        dd = ((D * d[:, None]).sum(2) / a[:, None]) ** 2 + (D * b[:, None]).sum(2) ** 2 + (D * NX[:, None]).sum(2) ** 2
        ok = ((NX[S][nn] * NX[:, None]).sum(2) > 0.0) & (CX[S][nn] == CX[:, None])
        dd = np.where(ok, dd, np.inf)
        own = nn[np.arange(len(X)), dd.argmin(1)]
        has = np.isfinite(dd.min(1))
        own = np.where(has, own, -1)
        # weighted centroid per seed (metric-space weights)
        sel = own >= 0
        cnt = np.bincount(own[sel], weights=rho[sel], minlength=len(S))
        cen = np.stack([np.bincount(own[sel], weights=rho[sel] * X[sel, c], minlength=len(S)) for c in range(3)], 1)
        alive = cnt > 0
        cen = cen[alive] / cnt[alive, None]
        # snap to the nearest sample of the same seed (keeps seeds on the surface)
        S_alive = S[alive]
        _, snap = cKDTree(X).query(cen, k=6, workers=W)
        okc = CX[snap] == CX[S_alive][:, None]
        pick = np.where(okc.any(1), snap[np.arange(len(snap)), okc.argmax(1)], S_alive)
        S = np.unique(pick)
    return S


def components(F, n):
    A = sps.coo_matrix((np.ones(len(F) * 3), (np.r_[F[:, 0], F[:, 1], F[:, 2]], np.r_[F[:, 1], F[:, 2], F[:, 0]])), shape=(n, n))
    return connected_components(A, directed=False)[1]


def main(short):
    cfg = CFG[short]
    t0 = time.time()
    g = np.load(os.path.join(BAKE_CACHE, f'geom_detail_{short}.npz'))
    P, F, N = g['P'], g['F'], g['N']
    comp = components(F, len(P))
    fa = np.linalg.norm(np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]]), axis=1) / 2
    va = np.zeros(len(P)); [np.add.at(va, F[:, k], fa / 3) for k in range(3)]
    rng = np.random.default_rng(0)
    ns = min(cfg['n_samp'], len(P))
    si = rng.choice(len(P), ns, replace=False, p=va / va.sum()) if ns < len(P) else np.arange(len(P))
    SP_, SN, SC = P[si], N[si], comp[si]
    tree = cKDTree(SP_)
    # --- PCA direction per sample
    nb = tree.query_ball_point(SP_, cfg['r_pca'], workers=W)
    T = np.zeros((ns, 6)); TR = np.zeros((ns, 6))
    for i, L in enumerate(nb):
        L = np.asarray(L)
        L = L[(SC[L] == SC[i]) & ((SN[L] @ SN[i]) > 0.0)]
        if len(L) < 6:
            continue
        Q = SP_[L] - SP_[L].mean(0)
        w, V = np.linalg.eigh(Q.T @ Q)
        c = 1 - w[1] / max(w[2], 1e-30)
        e1 = V[:, 2]
        T[i] = tensor6(e1[None], c)[0]
        TR[i] = tensor6(e1[None], 2.5 * c * smoothstep(0.5, 0.8, c))[0]
    tu = UP[None] - SN[:, 1:2] * SN
    T = T + tensor6(tu, W_UP)
    TR = TR + tensor6(tu, 1.0)   # armour: rows follow 'vertical' unless the part is clearly elongated (tail, blades)
    # neighbour averaging (twice)
    _, kn = tree.query(SP_, k=16, workers=W)
    for _ in range(2):
        ok = ((SN[kn] * SN[:, None]).sum(2) > 0.2) & (SC[kn] == SC[:, None])
        T = (T[kn] * ok[:, :, None]).sum(1) / np.maximum(ok.sum(1), 1)[:, None]
        TR = (TR[kn] * ok[:, :, None]).sum(1) / np.maximum(ok.sum(1), 1)[:, None]
    print(f'{short}: comps {comp.max()+1}, samples {ns}, frame {time.time()-t0:.1f}s', flush=True)
    out = dict(SP=SP_, SN=SN, ST=T, STR=TR, SC=SC, comp=comp)
    # --- CVT seeds per field on a denser point set (all welded vertices, area-weighted)
    Tv = interp_tensor(tree, T, SN, SC, P, N, comp)
    for f, fc in cfg['fields'].items():
        continue   # (legacy CVT seeds, unused: all lines now come from the stripe families in lattice.py)
        S = cvt(P, N, comp, va, Tv, fc['s'], fc['amax'])
        out[f'seed_{f}_P'] = P[S]; out[f'seed_{f}_N'] = N[S]; out[f'seed_{f}_C'] = comp[S]
        print(f'  field {f}: {len(S)} seeds  {time.time()-t0:.1f}s', flush=True)
    np.savez_compressed(os.path.join(CACHE, f'surf_{short}.npz'), **out)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        main(s)
