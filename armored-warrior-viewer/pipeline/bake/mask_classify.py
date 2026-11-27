"""Mask stage B: classify every vertex of the subdivided welded mesh as
0 armour, 1 gold, 2 crystal, 3 device, plus the crystal gradient position (0 blue root .. 1 pink tip).

Signals (per vertex): base colour HSV, emissive (the authored v12 crystal-emission map is the cleanest
crystal signal), local thickness (thin blades / drapes / petals vs thick torso and limbs), AO.
Pipeline: soft per-class scores -> mesh diffusion (radius R_SMOOTH) -> hysteresis (confident seeds grow
through medium-confidence vertices) -> argmax -> removal of small components / holes on the mesh graph
(area < A_MIN, reassigned to the neighbouring majority) -> labels.
Usage: python mask_classify.py [only,list]
"""
import os, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None
mm = 1e-3
TUNE = {
    'body':   dict(close=1.2 * mm, r=0.6 * mm, amin=4 * mm * mm, thin=12 * mm, device=False, reg=3.5 * mm, hole=1.0),
    'helmet': dict(close=1.5 * mm, r=0.35 * mm, amin=1.5 * mm * mm, thin=5 * mm, device=False, reg=1.2 * mm, hole=0.5),
    'chest':  dict(close=0.3 * mm, r=0.5 * mm, amin=1.0 * mm * mm, thin=5 * mm, device=False, reg=1.0 * mm, hole=0.1),
    'buckle': dict(close=0.3 * mm, r=0.25 * mm, amin=0.6 * mm * mm, thin=3 * mm, device=True, reg=0.8 * mm, hole=0.05),
    'clasp':  dict(close=0.4 * mm, r=0.35 * mm, amin=1.0 * mm * mm, thin=4 * mm, device=True, reg=1.0 * mm, hole=0.08),
}


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def band(x, a0, a1, b0, b1):
    """1 inside [a1,b0], soft edges a0..a1 and b0..b1"""
    return ss(a0, a1, x) * (1 - ss(b0, b1, x))


def hsv(rgb):
    mx = rgb.max(1); mn = rgb.min(1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb.T
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return h, s, mx


def adjacency(F, n):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e), np.int8), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A = ((A + A.T) > 0).astype(np.float32)
    return A


def vertex_area(P, F):
    a = np.linalg.norm(B.face_normals(P, F), axis=1) / 6
    va = np.zeros(len(P))
    for k in range(3):
        np.add.at(va, F[:, k], a)
    return va


def scores(s, d, thick, tu, D):
    h, sat, val = hsv(d['base'])
    e = d['emis'].max(1)
    eh, es, ev = hsv(d['emis'])
    warm = band(h, 6, 14, 40, 52)
    # hue + saturation decide; value only rejects near-black (shadowed gold stays gold)
    gold = warm * ss(0.12, 0.26, sat) * ss(0.08, 0.18, val)
    cool = band(h, 185, 200, 345, 358)
    crys_base = cool * ss(0.30, 0.55, sat) * ss(0.30, 0.55, val)
    crys_em = ss(0.10, 0.28, e)
    thin = np.where(thick > 0, 1 - ss(tu['thin'] * 0.6, tu['thin'], thick), 0.5)  # miss = unknown
    thin_true = np.where(thick > 0, thin, 0.0)
    # thin sheets (drapes, blades, petals) painted in any cool hue are crystal even where dark
    crys_thin = cool * ss(0.18, 0.32, sat) * ss(0.07, 0.16, val) * thin_true
    # region-level blueness: solid blue patches (leg diamonds, gems) vs thin blue reflection streaks
    # painted on the black armour. Pixel blueness is averaged over R_REG on the mesh.
    blu = cool * ss(0.25, 0.45, sat) * ss(0.2, 0.4, val)
    blu_r = D(blu[:, None], tu['reg'])[:, 0]
    crys_patch = ss(0.45, 0.65, blu_r)
    coolish = cool * ss(0.15, 0.3, sat) * ss(0.05, 0.12, val)
    cool_r = D(coolish[:, None], tu['reg'])[:, 0]
    crys_sheet = ss(0.35, 0.55, cool_r) * thin_true          # drapes / blades incl. their dark streaks
    crystal = np.maximum.reduce([crys_em, crys_base * (0.25 + 0.75 * thin), 0.9 * crys_thin,
                                 0.9 * crys_patch, 0.95 * crys_sheet])
    if tu['device']:
        crystal = ss(0.45, 0.65, e)                            # devices: only the cores of the authored glow lines
    # gold painted *over* crystal (semi-transparent tan streaks on drapes) is desaturated and has
    # crystal emission underneath: emission vetoes gold
    gold = gold * (1 - 0.85 * crys_em)
    # on thin crystal sheets only strong, saturated gold survives (tan streaks over the drapes do not)
    strong = ss(0.40, 0.55, sat) * ss(0.33, 0.48, val)
    # (no generic thin-part penalty: shoulder rings, petals and flaps are thin plates with real gold;
    #  only the below-belt drape rule further down removes painted streaks)
    if s == 'body':
        # below the belt, thin hanging drapes are crystal in the sheets: the tan streaks painted on them
        # are not trim. Only very strong gold survives there, and the centre flaps keep their frames.
        P = d['P']
        drape = thin_true * (1 - ss(0.50, 0.54, P[:, 1])) * ss(0.04, 0.06, np.abs(P[:, 0]))
        strong2 = ss(0.5, 0.62, sat) * ss(0.5, 0.62, val)
        gold = gold * (1 - drape * (1 - strong2))
        crystal = np.maximum(crystal, 0.8 * drape * ss(0.2, 0.4, cool_r))
    armour = 0.38 + 0.25 * (1 - ss(0.08, 0.2, val))
    S = [armour, gold, crystal]
    if tu['device']:
        device = (1 - ss(0.18, 0.32, sat)) * ss(0.25, 0.45, val) * (1 - ss(0.45, 0.65, e))
        S.append(device)
    else:
        S.append(np.zeros_like(armour))
    # confidence: white highlights / sparkles (low sat, high value) carry no class information
    white = (1 - ss(0.15, 0.3, sat)) * ss(0.6, 0.8, val)
    w = 1 - 0.95 * white * (1 - crys_em)
    if tu['device']:
        w = np.maximum(w, S[3])
    return np.stack(S, 1), w


def cleanup(label, A, va, amin, iters=6):
    n = len(label)
    for it in range(iters):
        changed = 0
        for c in range(4):
            m = label == c
            if not m.any():
                continue
            idx = np.nonzero(m)[0]
            sub = A[idx][:, idx]
            k, comp = connected_components(sub, directed=False)
            carea = np.bincount(comp, va[idx], minlength=k)
            small = carea[comp] < amin
            if not small.any():
                continue
            sv = idx[small]
            # majority label of neighbours that are not in the small set
            onehot = np.zeros((n, 4), np.float32)
            onehot[np.arange(n), label] = 1
            onehot[sv] = 0
            vote = A[sv] @ onehot
            vote[:, c] = -1
            newl = vote.argmax(1)
            ok = vote.max(1) > 0
            label[sv[ok]] = newl[ok]
            changed += ok.sum()
        if changed == 0:
            break
    return label


def enclosed_fill(label, A, va, ahole):
    """Components enclosed by a single other class and smaller than ahole[(from,to)] are absorbed:
    dark reflections inside gold trims and horns, dark streaks inside crystal drapes, tan streaks inside
    crystal. Gold enclosed by armour (star emblems) is never removed."""
    n = len(label)
    for (cf, ct), amax in ahole.items():
        m = label == cf
        idx = np.nonzero(m)[0]
        if not len(idx):
            continue
        k, comp = connected_components(A[idx][:, idx], directed=False)
        carea = np.bincount(comp, va[idx], minlength=k)
        # neighbour labels per component
        nb = A[idx]                                   # rows: component vertices
        oh = np.zeros((n, 4), np.float32); oh[np.arange(n), label] = 1
        cnt = nb @ oh                                 # per vertex neighbour label counts
        cc = np.zeros((k, 4))
        np.add.at(cc, comp, cnt)
        cc[:, cf] = 0
        tot = cc.sum(1)
        only = (cc[:, ct] > 0.97 * tot) & (tot > 0)
        sel = only[comp] & (carea[comp] < amax)
        label[idx[sel]] = ct
    return label


def gradient_pos(d, label, D, tu):
    """crystal colour position from hue: blue(~225) -> 0, violet(~275) -> 0.5, pink(~320) -> 1;
    emission hue preferred where emission is strong. Smoothed heavily on the crystal region, then
    harmonically extended to the rest of the mesh."""
    h, sat, val = hsv(d['base'])
    eh, es, ev = hsv(d['emis'])
    use_e = ss(0.1, 0.3, ev)
    hh = np.where(use_e > 0.5, eh, h)
    hh = np.where(hh < 90, hh + 360, hh)          # wrap reds/pinks past 360
    t = np.clip((hh - 225) / (320 - 225), 0, 1)
    w = (label == 2) * np.maximum(sat, es) + 1e-4
    rad = {'body': 12, 'helmet': 4, 'chest': 3, 'buckle': 3, 'clasp': 3}
    r = tu.get('grad_r', 10 * mm)
    num = D((t * w)[:, None], r)[:, 0]
    den = D(w[:, None], r)[:, 0]
    g = num / np.maximum(den, 1e-6)
    return np.clip(g, 0, 1)


def main():
    for mat in B.TEXTURED:
        s = B.SHORT[mat]
        if ONLY and s not in ONLY:
            continue
        t0 = time.time()
        tu = TUNE[s]
        hs = tu['hole'] * mm * mm   # area unit scaled per part
        tu['ahole'] = {(0, 1): 80 * hs, (0, 2): 150 * hs, (1, 2): 150 * hs}
        d = np.load(os.path.join(C, f'mfeat_{s}.npz'))
        thick = np.load(os.path.join(C, f'mthick_{s}.npy'))
        P, F = d['P'], d['F']
        n = len(P)
        Lc, Mc = B.laplacian_cot(P, F)
        D = lambda X, r: B.diffuse_m(Lc, Mc, X, r * r / 2)
        S0, w = scores(s, d, thick, tu, D)
        S = D(S0 * w[:, None], tu['r']) / np.maximum(D(w[:, None], tu['r']), 1e-4)
        # hysteresis for gold and crystal: seeds = clearly winning vertices; growth allowed where the
        # class is at least competitive
        A = adjacency(F, n)
        lab = S.argmax(1)
        margin = np.sort(S, 1)
        for c in (1, 2):
            seed = (lab == c) & (S[:, c] - np.max(np.delete(S, c, 1), 1) > 0.12)
            cand = (lab == c)
            idx = np.nonzero(cand)[0]
            k, comp = connected_components(A[idx][:, idx], directed=False)
            has_seed = np.bincount(comp, seed[idx].astype(float), minlength=k) > 0
            drop = idx[~has_seed[comp]]
            S[drop, c] = -1
        lab = S.argmax(1)
        va = vertex_area(P, F)
        lab = cleanup(lab, A, va, tu['amin'])
        lab = enclosed_fill(lab, A, va, tu['ahole'])
        # morphological closing of gold along the surface (dilate then erode, both by diffusion of the
        # indicator): fills dark reflection streaks/tears inside trims and horns and smooths ragged
        # concave outlines; it can only add gold where armour was, so thin bands are never eaten.
        gi = (lab == 1).astype(np.float64)[:, None]
        dil = (D(gi, tu['close'])[:, 0] > 0.2).astype(np.float64)[:, None]
        clo = D(dil, tu['close'])[:, 0] > 0.8
        lab[(lab == 0) & clo] = 1
        # boundary smoothing (mode filter): diffuse the one-hot labels and re-take the argmax
        for it in range(2):
            oh = np.eye(4, dtype=np.float64)[lab]
            lab = D(oh, tu['r'] * 1.0).argmax(1)
            lab = cleanup(lab, A, va, tu['amin'])
        tu['grad_r'] = {'body': 12 * mm, 'helmet': 5 * mm, 'chest': 3 * mm}.get(s, 3 * mm)
        grad = gradient_pos(d, lab, D, tu)
        np.savez_compressed(os.path.join(C, f'mlabel_{s}.npz'), label=lab.astype(np.int8), grad=grad.astype(np.float32))
        areas = np.bincount(lab, va, minlength=4)
        print(s, 'area share armour %.3f gold %.3f crystal %.3f device %.3f' % tuple(areas / areas.sum()),
              f'{time.time()-t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
