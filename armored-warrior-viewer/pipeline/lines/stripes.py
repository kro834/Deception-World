"""Stripe patterns on the welded mesh (after Knöppel et al. 2015, 'Stripe Patterns on Surfaces').

A stripe family is a unit complex function psi per vertex whose phase advances by
omega_ij = 2*pi/lambda * <r, P_j - P_i> along each edge (r = desired phase-gradient direction, a
*line* field: where r flips sign across an edge, psi is conjugated, so singularities are allowed).
Lines = phase == 0 (mod 2 pi); distance to the nearest line = lambda * |wrap(phase)| / (2 pi).

Solver: coarse mesh (vertex clustering) at K x the period -> smallest eigenvector of the stripe
energy (shift-invert eigsh) -> prolong to the fine mesh with the in-cluster phase offset -> raise to
the K-th power (multiplies the phase, i.e. divides the period by K) -> Jacobi relaxation on the fine
mesh.  Returns psi (n, 2) real/imag and the per-vertex r used (for the per-triangle unwrap).
"""
import numpy as np
import scipy.sparse as sps
from scipy.sparse.linalg import eigsh


def edges(F):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    e = np.sort(e, 1)
    e = e[e[:, 0] != e[:, 1]]
    return np.unique(e, axis=0)


def transport_blocks(r, P, E, lam):
    i, j = E[:, 0], E[:, 1]
    s = np.sign((r[i] * r[j]).sum(1)); s[s == 0] = 1
    rbar = 0.5 * (r[i] + s[:, None] * r[j])
    om = 2 * np.pi / lam * (rbar * (P[j] - P[i])).sum(1)
    if np.ndim(lam):
        pass
    c, sn = np.cos(om), np.sin(om)
    # G = R(om) or C R(om) with C = diag(1,-1)
    flip = s < 0
    G = np.empty((len(E), 2, 2))
    G[:, 0, 0] = c; G[:, 0, 1] = -sn; G[:, 1, 0] = sn; G[:, 1, 1] = c
    G[flip, 1, :] *= -1
    return G, flip


def block_matrix(n, E, G, w):
    """W with W[j,i] = w*G_ij, W[i,j] = w*G_ij^T  (2n x 2n real)."""
    i, j = E[:, 0], E[:, 1]
    rows, cols, vals = [], [], []
    for a in range(2):
        for b in range(2):
            rows += [2 * j + a, 2 * i + b]
            cols += [2 * i + b, 2 * j + a]
            vals += [w * G[:, a, b], w * G[:, a, b]]
    return sps.coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(2 * n, 2 * n)).tocsr()


def cluster(P, N, comp, h):
    ax = np.abs(N).argmax(1)
    sg = (N[np.arange(len(N)), ax] > 0).astype(np.int64)
    key = np.concatenate([np.floor(P / h).astype(np.int64), (ax * 2 + sg)[:, None], comp[:, None]], 1)
    _, cid = np.unique(key, axis=0, return_inverse=True)
    return cid.reshape(-1)


def solve(P, F, N, comp, area, r, lam, h_coarse, K, fine_iters=300, log=print):
    """r: (n,3) unit tangent phase-gradient directions (line field); lam: period (scalar or per vertex)."""
    n = len(P)
    lam_v = np.broadcast_to(np.asarray(lam, float), (n,)).copy()
    E = edges(F)
    # ---------------- coarse
    cid = cluster(P, N, comp, h_coarse)
    nc = cid.max() + 1
    wa = area
    Pc = np.stack([np.bincount(cid, wa * P[:, k], nc) for k in range(3)], 1) / np.bincount(cid, wa, nc)[:, None]
    # average the line field with sign alignment to a per-cluster reference
    ref = np.zeros((nc, 3)); ref[cid] = r          # arbitrary member as reference
    sg = np.sign((r * ref[cid]).sum(1)); sg[sg == 0] = 1
    rc = np.stack([np.bincount(cid, wa * sg * r[:, k], nc) for k in range(3)], 1)
    rc /= np.maximum(np.linalg.norm(rc, axis=1, keepdims=True), 1e-20)
    lam_c = np.bincount(cid, wa * lam_v, nc) / np.bincount(cid, wa, nc) * K
    Ec = np.sort(cid[E], 1); Ec = Ec[Ec[:, 0] != Ec[:, 1]]; Ec = np.unique(Ec, axis=0)
    lam_e = 0.5 * (lam_c[Ec[:, 0]] + lam_c[Ec[:, 1]])
    G, _ = transport_blocks(rc, Pc, Ec, lam_e)
    Wc = block_matrix(nc, Ec, G, 1.0)
    deg = np.bincount(Ec.ravel(), minlength=nc).astype(float)
    Dg = sps.diags(np.repeat(deg, 2))
    A = (Dg - Wc).tocsc()
    Mc = np.repeat(np.bincount(cid, wa, nc), 2)
    Mc = sps.diags(Mc / Mc.mean())
    vals, vecs = eigsh(A, k=1, M=Mc, sigma=-1e-3, which='LM')
    psi_c = vecs[:, 0].reshape(nc, 2)
    psi_c /= np.maximum(np.linalg.norm(psi_c, axis=1, keepdims=True), 1e-20)
    log(f'    coarse: {nc} clusters, {len(Ec)} edges, eigenvalue {vals[0]:.4g}')
    # ---------------- prolong: psi_v = (psi_c * e^{i * 2pi/lam_c <rc, Pv - Pc>})^K, conj if r_v flips vs rc
    ph = 2 * np.pi / lam_c[cid] * (rc[cid] * (P - Pc[cid])).sum(1)
    z = (psi_c[cid, 0] + 1j * psi_c[cid, 1]) * np.exp(1j * ph)
    z = z ** K
    flip = (r * rc[cid]).sum(1) < 0
    z = np.where(flip, np.conj(z), z)
    psi = np.stack([z.real, z.imag], 1)
    psi /= np.maximum(np.linalg.norm(psi, axis=1, keepdims=True), 1e-20)
    # ---------------- fine relaxation
    lam_e = 0.5 * (lam_v[E[:, 0]] + lam_v[E[:, 1]])
    G, _ = transport_blocks(r, P, E, lam_e)
    Wf = block_matrix(n, E, G, 1.0)
    x = psi.ravel()
    for it in range(fine_iters):
        y = Wf @ x
        y = y.reshape(n, 2)
        y = 0.5 * y / np.maximum(np.linalg.norm(y, axis=1, keepdims=True), 1e-20) + 0.5 * x.reshape(n, 2)
        x = (y / np.maximum(np.linalg.norm(y, axis=1, keepdims=True), 1e-20)).ravel()
    psi = x.reshape(n, 2)
    # residual: mean |psi_j - G psi_i|
    res = np.linalg.norm(psi[E[:, 1]] - np.einsum('eab,eb->ea', G, psi[E[:, 0]]), axis=1)
    log(f'    fine: residual mean {res.mean():.3f}  p95 {np.percentile(res, 95):.3f}  (exact transport -> 0)')
    return psi


def corner_phases(psi, r, Fv):
    """Per triangle corner unwrapped phase (T,3): conj corners whose r flips vs corner 0, unwrap vs corner 0."""
    z = psi[:, 0] + 1j * psi[:, 1]
    zc = z[Fv]                               # (T,3)
    rc = r[Fv]
    fl = (rc * rc[:, 0:1]).sum(2) < 0
    zc = np.where(fl, np.conj(zc), zc)
    p0 = np.angle(zc[:, 0])
    p1 = p0 + np.angle(zc[:, 1] * np.conj(zc[:, 0]))
    p2 = p0 + np.angle(zc[:, 2] * np.conj(zc[:, 0]))
    return np.stack([p0, p1, p2], 1)


def eval_points(psi, r, lam, P, tri_v, bary, X):
    """Robust in-triangle evaluation: blend each corner's prediction psi_k * exp(i g_k . (X - P_k)),
    g_k = 2 pi / lam_k * r_k, conjugated where r_k flips against corner 0.  Returns distance to the
    nearest line (same units as lam)."""
    z = psi[:, 0] + 1j * psi[:, 1]
    acc = np.zeros(len(X), complex)
    r0 = r[tri_v[:, 0]]
    for k in range(3):
        v = tri_v[:, k]
        g = 2 * np.pi / lam[v][:, None] * r[v]
        zk = z[v] * np.exp(1j * (g * (X - P[v])).sum(1))
        fl = (r[v] * r0).sum(1) < 0
        zk = np.where(fl, np.conj(zk), zk)
        acc += bary[:, k] * zk
    lam_x = (bary * lam[tri_v]).sum(1)
    return np.abs(np.angle(acc)) * lam_x / (2 * np.pi), np.abs(acc)
