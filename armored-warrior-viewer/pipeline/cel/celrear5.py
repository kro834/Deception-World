"""Cel paint, stage 5 (body, rear only) on top of paintcel4 (cache/rear4_body.npy) -> out/paintcel5_body_*.

Blade identity from the geometry:
  thin = texel whose surface has an opposing face (normal dot < -0.3) within THIN_D (a sheet: drape,
         feather, blade); legs, torso and arms are thick. Restricted to the drape box and feather box.
  blades = surface-connected components of `thin` (both faces of a blade join at its rim), extent
         >= MIN_EXT, not mostly gold (gold daggers / spikes keep their paint), not the central tabard.
Per blade: long axis = PCA of its texel positions; t = 0 at the root end, 1 at the tip
  drapes: root = higher end; feathers: root = end nearer the shoulder-ring centre.
  across = second axis, normalised to [0, 1] over the blade at that t (per t-bin percentiles).
  edge = falloff of the blade's own surface share (1 mm) -> a thin band along the rim.
Drapes (rear faces): synthetic colour = ramp(t) sampled from the FRONT faces of the front drapes in
  paintcel2 (hue: saturation-weighted circular mean, saturation, lightness per t-bin), with pink enforced
  on the last third (hue pulled towards PINK_HUE), 3 faces across the width (lightness x FACES), one light
  edge line, FACET_N thin light facet lines (slanted iso-lines of across + 0.25 t). No painted shadow.
Feathers (rear faces): armour-ramp body, a gold band along the rim (GOLD_BAND), blue on the last
  BLUE_TIP of the length.
Blend weight: rear = ss(REAR, -n_z) x blade membership (soft 0.8 mm); front faces untouched.
"""
import os, sys, time, colorsys
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import celflat as CF
import celcut as CC
import celrear as CR
from celflat import ss, surface_gauss, luma255

THIN_D = 0.014
DRAPE_BOX = (0.05, 0.31, 0.10, 0.585)     # |x|, y
FEATHER_BOX = (0.055, 0.25, 0.64, 0.86)
TABARD_X = 0.055
MIN_EXT = 0.06
REAR = (-0.05, 0.30)
NBIN = 20
L_MIN = 0.24                    # luma floor of the drape ramp (lifts the dark root)
TIP_SAT, TIP_L = 0.34, 0.53     # pre-grade saturation / luma at the tip (-> ~#f07cbf after the grade)
PINK_HUE, PINK_FROM = 325 / 360, 0.62
FACES = (0.82, 1.0, 1.16)
FACET_N = 3
GOLD_BAND = (0.30, 0.55)        # rim band from the blade's surface share
BLUE_TIP = 0.70
SHOULDER = np.array([0.10, 0.73, -0.02])
GOLD_RGB = np.array([0xc0, 0x86, 0x4c], np.float32)
BLUE_RGB = np.array([0x31, 0x59, 0xc8], np.float32)


def hsv(c):
    return CF.hsv01(c)


def main():
    t0 = time.time()
    ctx = CC.ctx_of('body')
    cover, P, N, V = ctx['cover'], ctx['P'], ctx['N'], ctx['V']
    Nn = N / np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
    C4 = np.load(os.path.join(CF.CACHE, 'rear4_body.npy')).astype(np.float32)
    C2 = np.load(os.path.join(CF.CACHE, 'cut_body.npy')).astype(np.float32)
    H, W = cover.shape
    ax, yy = np.abs(P[..., 0]), P[..., 1]
    inbox = lambda b: (ax >= b[0]) & (ax <= b[1]) & (yy >= b[2]) & (yy <= b[3])
    region = V & (inbox(DRAPE_BOX) | inbox(FEATHER_BOX)) & (ax > TABARD_X)
    # ---- thin-sheet test: an opposing face within THIN_D
    allc = np.nonzero(cover.ravel())[0]
    tree = cKDTree(P.reshape(-1, 3)[allc])
    ri = np.nonzero(region.ravel())[0]
    thin = np.zeros(H * W, bool)
    Pr = P.reshape(-1, 3)[ri]; Nr = Nn.reshape(-1, 3)[ri]
    for off in np.arange(0.002, THIN_D + 1e-9, 0.002):       # march inwards; an opposing face nearby = sheet
        q = Pr - Nr * off
        d, j = tree.query(q, k=4, distance_upper_bound=0.0025, workers=2)
        ok = np.isfinite(d)
        jj = np.where(ok, j, 0)
        dots = (Nn.reshape(-1, 3)[allc[jj]] * Nr[:, None, :]).sum(-1)
        thin[ri] |= (ok & (dots < -0.3)).any(1)
    thin = thin.reshape(H, W)
    thin.ravel()[ctx['tgt']] = thin.ravel()[ctx['srci']]
    print(f'thin texels in region: {thin[cover].mean():.3f} of covered  ({time.time()-t0:.0f}s)', flush=True)
    tarea = CR.texel_area_map(P, cover)
    lab, area, ext = CR.components(thin, ctx, tarea)
    h2, s2, v2 = hsv(C2)
    goldc = (ss(.012, .04, h2) * (1 - ss(.145, .185, h2)) * ss(.15, .3, s2) * ss(.16, .3, v2)) > 0.5
    nl = len(area)
    lab_f = np.maximum(lab, 0).ravel(); has = (lab >= 0).ravel() & cover.ravel()
    gshare = np.bincount(lab_f[has], goldc.ravel()[has], nl) / np.maximum(np.bincount(lab_f[has], minlength=nl), 1)
    Pf = P.reshape(-1, 3).astype(np.float64)
    cnt = np.maximum(np.bincount(lab_f[has], minlength=nl), 1)
    cen = np.stack([np.bincount(lab_f[has], Pf[has, k], nl) for k in range(3)], 1) / cnt[:, None]
    isdrape = (cen[:, 1] < DRAPE_BOX[3]) & (ext >= MIN_EXT) & (gshare < 0.5)
    isfeather = (cen[:, 1] >= FEATHER_BOX[2] - 0.02) & (ext >= 0.02) & (area >= 60e-6) & (gshare < 0.85)
    fc = (cen[:, 1] >= FEATHER_BOX[2] - 0.02) & (area > 20e-6)
    print('feather candidates (ext mm, area mm2, gold share):', [(int(e*1e3), int(a*1e6), round(g, 2)) for e, a, g in zip(ext[fc], area[fc], gshare[fc])][:40])
    keepl = isdrape | isfeather
    print(f'blades: {nl} components, drapes {isdrape.sum()}, feathers {isfeather.sum()}', flush=True)
    # ---- per blade parametrisation
    T = np.full(H * W, np.nan, np.float32); A = np.full(H * W, np.nan, np.float32)
    for l in np.nonzero(keepl)[0]:
        idx = np.nonzero((lab.ravel() == l))[0]
        X = Pf[idx]; c = X.mean(0)
        _, _, Vt = np.linalg.svd(X - c, full_matrices=False)
        a1, a2 = Vt[0], Vt[1]
        p1 = (X - c) @ a1
        lo, hi = np.percentile(p1, [1, 99])
        e_lo, e_hi = c + a1 * lo, c + a1 * hi
        if isdrape[l]:
            root_hi = e_hi[1] > e_lo[1]
        else:
            sh = SHOULDER * np.array([np.sign(c[0]), 1, 1])
            root_hi = np.linalg.norm(e_hi - sh) < np.linalg.norm(e_lo - sh)
        t = (p1 - lo) / max(hi - lo, 1e-6)
        if root_hi:
            t = 1 - t
        t = np.clip(t, 0, 1)
        p2 = (X - c) @ a2
        acr = np.zeros_like(t)
        bins = np.minimum((t * 10).astype(int), 9)
        for b in range(10):
            m = bins == b
            if m.sum() > 20:
                q0, q1 = np.percentile(p2[m], [3, 97])
                acr[m] = (p2[m] - q0) / max(q1 - q0, 1e-6)
        T[idx] = t; A[idx] = np.clip(acr, 0, 1)
    T = T.reshape(H, W); A = A.reshape(H, W)
    labk = np.where((lab >= 0) & keepl[np.maximum(lab, 0)], lab, -1)
    drape_m = (labk >= 0) & isdrape[np.maximum(labk, 0)]
    # fill the drapes' holes (texels painted as armour today that failed the sheet test) and interpolate
    # their parameters by normalised convolution along the surface
    dm0 = drape_m.astype(np.float32)
    acc = surface_gauss(np.stack([dm0, np.nan_to_num(T) * dm0, np.nan_to_num(A) * dm0], -1), 0.003, ctx)
    hole = region & cover & ~drape_m & (acc[..., 0] > 0.45) & (P[..., 1] < DRAPE_BOX[3])
    T = np.where(hole, acc[..., 1] / np.maximum(acc[..., 0], 1e-4), T)
    A = np.where(hole, acc[..., 2] / np.maximum(acc[..., 0], 1e-4), A)
    drape_m = drape_m | hole
    print(f'drape holes filled: {hole[cover].mean():.4f} of covered', flush=True)
    feath_m = (labk >= 0) & isfeather[np.maximum(labk, 0)]
    fm0 = feath_m.astype(np.float32)
    acc = surface_gauss(np.stack([fm0, np.nan_to_num(T) * fm0], -1), 0.003, ctx)
    fhole = region & cover & ~feath_m & ~drape_m & (acc[..., 0] > 0.4) & (P[..., 1] >= FEATHER_BOX[2])
    T = np.where(fhole, acc[..., 1] / np.maximum(acc[..., 0], 1e-4), T)
    feath_m = feath_m | fhole
    print(f'feather holes filled: {fhole[cover].mean():.4f}; feather texels {feath_m[cover].mean():.4f}', flush=True)
    # ---- ramp from the FRONT faces of the front drapes (paintcel2)
    fsel = drape_m & cover & (Nn[..., 2] > 0.35)
    tb = np.minimum((T[fsel] * NBIN).astype(int), NBIN - 1)
    hh, ssv, _ = hsv(C2[fsel][None])
    hh, ssv = hh[0], ssv[0]
    LL = luma255(C2[fsel])
    ramp = []
    for b in range(NBIN):
        m = tb == b
        if m.sum() < 50:
            ramp.append(None); continue
        ang = hh[m] * 2 * np.pi; w = ssv[m]
        hue = (np.arctan2((np.sin(ang) * w).sum(), (np.cos(ang) * w).sum()) / (2 * np.pi)) % 1
        ramp.append((hue, float(np.percentile(ssv[m], 60)), float(np.percentile(LL[m], 75))))
    good = [r for r in ramp if r is not None]
    for i in range(NBIN):
        if ramp[i] is None:
            ramp[i] = good[0] if i < NBIN // 2 else good[-1]
    ramp = np.array(ramp)
    # enforce pink on the last third: pull the hue (along the short way round) towards PINK_HUE
    tt = (np.arange(NBIN) + 0.5) / NBIN
    k = ss(PINK_FROM, 0.9, tt)
    dh = ((PINK_HUE - ramp[:, 0] + 0.5) % 1) - 0.5
    ramp[:, 0] = (ramp[:, 0] + k * dh) % 1
    ramp[:, 1] = np.maximum(ramp[:, 1], 0.60)
    ramp[:, 2] = np.clip(ramp[:, 2], L_MIN, 0.45) + 0.06 * k     # L* ~45-55 at the root, a little lighter at the pink tip
    # sheet's tip colours (violet #c077ec -> pink #f07cbf): lighter and softer towards the tip. The viewer's
    # grade (levels 0.1..0.84, saturation x1.6) is applied on top, so saturation is set below the sheet's.
    k2 = ss(0.55, 0.92, tt)
    ramp[:, 1] = ramp[:, 1] * (1 - k2) + TIP_SAT * k2
    ramp[:, 2] = ramp[:, 2] * (1 - k2) + TIP_L * k2
    print('ramp (t, hue deg, sat, L):', ' '.join(f'{t:.2f}:{h*360:.0f}/{s:.2f}/{l:.2f}' for t, (h, s, l) in zip(tt[::2], ramp[::2])), flush=True)
    # ---- drapes: synthetic colour
    Tz = np.nan_to_num(T); Az = np.nan_to_num(A)
    fi = np.clip(Tz * NBIN - 0.5, 0, NBIN - 1)
    i0 = np.floor(fi).astype(int); i1 = np.minimum(i0 + 1, NBIN - 1); fr = (fi - i0)[..., None]
    rv = ramp[i0] * (1 - fr) + ramp[i1] * fr
    dh = ((ramp[i1][..., 0] - ramp[i0][..., 0] + 0.5) % 1) - 0.5
    hue = (ramp[i0][..., 0] + fr[..., 0] * dh) % 1
    face = np.where(Az < 0.33, FACES[0], np.where(Az > 0.67, FACES[2], FACES[1])).astype(np.float32)
    dm = drape_m.astype(np.float32)
    face = surface_gauss(face * dm + (1 - dm), 0.0004, ctx)
    Lt = rv[..., 2] * face
    # facet lines: slanted iso-lines of across + 0.25 t; edge line: falloff of the blade's surface share
    u = Az + 0.25 * (Tz - 0.5)
    facet = np.zeros_like(Lt)
    for k_ in range(FACET_N):
        c_ = (k_ + 1) / (FACET_N + 1)
        facet = np.maximum(facet, 1 - ss(0.004, 0.012, np.abs(u - c_)))
    share = surface_gauss(dm, 0.001, ctx)
    edge = ss(0.25, 0.4, share) * (1 - ss(0.5, 0.7, share))
    Lt = np.clip(Lt + 0.14 * facet * (Tz > 0.08) + 0.22 * edge, 0.02, 0.9)
    col = CR.hsv_to_rgb(hue, np.clip(rv[..., 1] * 1.05, 0, 1), np.ones_like(Lt)) * 255
    col = col * (Lt / np.maximum(luma255(col), 1e-3))[..., None]
    # ---- feathers: black body, gold rim band, blue tip
    fm = feath_m.astype(np.float32)
    fshare = surface_gauss(fm, 0.0012, ctx)
    rim = ss(GOLD_BAND[0] - 0.08, GOLD_BAND[0], fshare) * (1 - ss(GOLD_BAND[1], GOLD_BAND[1] + 0.1, fshare))
    Lc4 = luma255(C4)
    arm = CR.armour_ramp(np.clip(Lc4 / 0.5, 0, 1) * 0.5)
    tipw = ss(BLUE_TIP, BLUE_TIP + 0.1, Tz)
    blue = BLUE_RGB * (0.85 + 0.3 * Tz[..., None])
    fcol = arm * (1 - tipw[..., None]) + blue * tipw[..., None]
    fcol = fcol * (1 - rim[..., None]) + GOLD_RGB * rim[..., None]
    # ---- blend
    rear = ss(*REAR, -Nn[..., 2]).astype(np.float32)
    wd = np.clip(surface_gauss(dm, 0.0008, ctx) * 1.6, 0, 1) * rear * cover
    wf = np.clip(surface_gauss(fm, 0.0008, ctx) * 1.6, 0, 1) * rear * cover
    out = C4 + wd[..., None] * (col - C4)
    out = out + wf[..., None] * (fcol - out)
    out = np.clip(out, 0, 255)
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    res = np.clip(np.round(out[iy, ix]), 0, 255).astype(np.uint8)
    np.save(os.path.join(CF.CACHE, 'rear5_body.npy'), res)
    np.save(os.path.join(CF.CACHE, 'rear5_param.npy'), np.stack([np.nan_to_num(T, nan=-1), np.nan_to_num(A, nan=-1), wd, wf], -1).astype(np.float16))
    dif = np.abs(res.astype(np.int16) - C4.astype(np.int16)).max(2)
    front = cover & (Nn[..., 2] > 0.1)
    print(f'drape weight>0.5 {np.mean(wd[cover] > 0.5):.4f}, feather {np.mean(wf[cover] > 0.5):.4f}; changed vs paintcel4 '
          f'>6/255 {np.mean(dif[cover] > 6):.4f} >16/255 {np.mean(dif[cover] > 16):.4f}; front-facing (n_z>0.1) >6/255 '
          f'{np.mean(dif[front] > 6):.5f}  {time.time()-t0:.0f}s', flush=True)
    im = Image.fromarray(res)
    for r in (2560, 2048):
        fn = os.path.join(CF.OUT, f'paintcel5_body_{r}.webp')
        (im if r == 2560 else im.resize((r, r), Image.LANCZOS)).save(fn + '.tmp.webp', 'WEBP', quality=92, method=6)
        os.replace(fn + '.tmp.webp', fn)


if __name__ == '__main__':
    main()
