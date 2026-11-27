"""Cel paint, stage 3 (body only, rear only): on top of stage 2 (cache/cut_body.npy = paintcel2_body).

All neighbourhood work is on the surface (celflat.surface_gauss / bilateral_pass; connected components
over atlas-adjacent texels that are also 3D-adjacent, joined across UV seams via the padding ring).
Front untouched: everything is weighted by rear = ss(R0, R1, -n_z) of the smoothed normal.

A. Chips on the back armour.  Classes on the stage-2 paint: gold (look-dev gate) and blue (painted
   blue..pink, crystal_hue). Each class's binary mask (> 0.5) is split into surface-connected
   components; a component is a chip when its 3D extent (2 x max distance from its centroid) is below
   EXT_GOLD / EXT_BLUE or its area is below AREA_MIN. Large connected shapes (chevrons, trims, rings,
   drapes, the long glow lines) are kept. Chips (+ a 0.5 mm soft margin that never enters a kept
   shape) are repainted on the armour ramp #030304 -> #14141b -> #2d2b34 from their own luminance
   (t = (L - p5) / (p95 - p5) over the chips, compressed so chips stay in the lower half of the ramp).
   Not applied on drapes (zone B) or under the keep rule (cores, sparkles).
B. Rear drapes and rear waist-cloth interior (rear-facing crystal, large faces, y < Y_MAX, no tail tip):
   strong flatten (surface bilateral, sigma_s 5 mm, sigma_c 45, 2 passes) -> luminance;
   hue = circular mean of the paint's own hue weighted by saturation over 9 mm of surface (crystal only);
   saturation = the source's saturation averaged over 6 mm (so whitish streaks take their surroundings'
   colour; no global averaging) x SAT_GAIN; colour rebuilt from (hue, sat) at the flattened luminance;
   then the tone cut (as stage 2) at CUT_DRAPE; small painted specks of the keep rule restored, long
   whitish streaks not.
Writes out/paintcel3_body_{2560,2048}.webp (q 92), cache/rear3_*.npy, stats to stdout.
"""
import os, sys, time
import numpy as np
import scipy.sparse as sps
from scipy.sparse.csgraph import connected_components
from scipy import ndimage
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import celflat as CF
import celcut as CC
from celflat import ss, surface_gauss, luma255, bilateral_pass

R0, R1 = -0.15, 0.15      # rear AND the flanks (side-facing texels get ~0.5); front-facing: 0
EXT_GOLD, EXT_BLUE, AREA_MIN = 0.020, 0.030, 30e-6     # m, m, m^2 (kept shapes: core extent at least this)
CORE_SIGMA, CORE_SHARE = 0.0015, 0.55
BACK_X = (0.115, 0.14)               # |x| (m): the back torso zone
BACK_Y = (0.565, 0.585, 0.80, 0.83)  # y range (m), soft edges
SPINE = (0.045, 0.5, 0.62)           # chevron column half-width = a + b * (y - c)
EXT_GOLD_BODY = 0.045        # gold on body armour must form a shape at least this long (trims, rings, chevrons)
Y_MAX = (0.58, 0.62)
CUT_DRAPE = float(os.environ.get('CUT_DRAPE', '0.75'))
SAT_GAIN = 1.05
ARM = np.array([[0x03, 0x03, 0x04], [0x14, 0x14, 0x1b], [0x2d, 0x2b, 0x34]], np.float32)


def components(mask, ctx, texel_area):
    """Surface-connected components of mask (bool HxW, defined on covered + ring texels)."""
    P, N, V = ctx['P'], ctx['N'], ctx['V']
    H, W = mask.shape
    m = mask & V
    idx = np.full(H * W, -1, np.int64); nz = np.nonzero(m.ravel())[0]; idx[nz] = np.arange(len(nz))
    rows, cols = [], []
    lim = 2.5 * ctx['texel'] * 4      # generous: texel sizes vary ~4x; 3D test still rejects other islands
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        ys, xs = np.nonzero(m)
        y2, x2 = ys + dy, xs + dx
        ok = (y2 < H) & (x2 >= 0) & (x2 < W)
        ys, xs, y2, x2 = ys[ok], xs[ok], y2[ok], x2[ok]
        ok = m[y2, x2]
        ys, xs, y2, x2 = ys[ok], xs[ok], y2[ok], x2[ok]
        d = np.linalg.norm(P[ys, xs] - P[y2, x2], axis=1)
        nd = (N[ys, xs] * N[y2, x2]).sum(1)
        ok = (d < lim) & (nd > 0.3)
        rows.append(idx[ys[ok] * W + xs[ok]]); cols.append(idx[y2[ok] * W + x2[ok]])
    t, s = ctx['tgt'], ctx['srci']           # ring texel <-> its seam partner
    ok = (idx[t] >= 0) & (idx[s] >= 0)
    rows.append(idx[t[ok]]); cols.append(idx[s[ok]])
    r = np.concatenate(rows); c = np.concatenate(cols)
    G = sps.coo_matrix((np.ones(len(r), np.int8), (r, c)), shape=(len(nz), len(nz)))
    nc, lab = connected_components(G, directed=False)
    Pm = P.reshape(-1, 3)[nz].astype(np.float64)
    A = texel_area.ravel()[nz] * m.ravel()[nz] * ctx['cover'].ravel()[nz]
    area = np.bincount(lab, A, nc)
    cnt = np.bincount(lab, minlength=nc).astype(np.float64)
    cen = np.stack([np.bincount(lab, Pm[:, k], nc) for k in range(3)], 1) / np.maximum(cnt, 1)[:, None]
    dist = np.linalg.norm(Pm - cen[lab], axis=1)
    ext = np.zeros(nc); np.maximum.at(ext, lab, dist); ext *= 2
    out = np.full(H * W, -1, np.int64); out[nz] = lab
    return out.reshape(H, W), area, ext


def texel_area_map(P, cover):
    dx = np.zeros_like(P); dy = np.zeros_like(P)
    dx[:, :-1] = P[:, 1:] - P[:, :-1]; dy[:-1] = P[1:] - P[:-1]
    a = np.linalg.norm(np.cross(dx, dy), axis=-1)
    med = np.median(a[cover & (a > 0)])
    return np.clip(a, 0, 4 * med).astype(np.float64)


def armour_ramp(t):
    t = np.clip(t, 0, 1)[..., None] * 2
    lo = np.clip(t, 0, 1); hi = np.clip(t - 1, 0, 1)
    return ARM[0] + (ARM[1] - ARM[0]) * lo + (ARM[2] - ARM[1]) * hi


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6) % 6; f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [v, q, p, p, t, v])
    g = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, v, v, q, p, p])
    b = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def main():
    t0 = time.time()
    short = 'body'
    ctx = CC.ctx_of(short)
    cover, P, N = ctx['cover'], ctx['P'], ctx['N']
    C2 = np.load(os.path.join(CF.CACHE, f'cut_{short}.npy')).astype(np.float32)   # = paintcel2
    src = np.asarray(Image.open(CF.SRC[short]).convert('RGB'), np.float32)
    keep = np.load(os.path.join(CF.CACHE, f'keep_{short}.npy')).astype(np.float32)
    Nn = N / np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
    rear = ss(R0, R1, -Nn[..., 2]).astype(np.float32)
    L = luma255(C2)
    h, s_, v = CF.hsv01(C2)
    gold = ss(.012, .04, h) * (1 - ss(.145, .185, h)) * ss(.15, .3, s_) * ss(.16, .3, v)
    blue = CF.crystal_hue(C2)
    # ---------------- B zone: rear drapes / rear cloth interior (large rear-facing crystal, low)
    lit = ss(0.05, 0.14, CF.emissive(short))
    cry = np.maximum(lit, np.clip(surface_gauss(CF.crystal_hue(src), 0.002, ctx) * 2.0, 0, 1))
    big = surface_gauss((cry > 0.5).astype(np.float32), 0.005, ctx)
    e = (P - CC.TAIL[0]) / CC.TAIL[1]
    tail = 1 - ss(0.8, 1.0, np.sqrt((e * e).sum(-1)))
    zoneB = (cry > 0.5) * ss(0.6, 0.8, big) * (1 - tail) * (1 - ss(*Y_MAX, P[..., 1])) * rear
    zoneB = np.clip(surface_gauss(zoneB.astype(np.float32), 0.0008, ctx), 0, 1) * cover
    # ---------------- A: chips
    tarea = texel_area_map(P, cover)
    chip = np.zeros(L.shape, np.float32)
    stats = {}
    # the back torso (where the judge wants black faces with gold trim): a 3D zone, rear-facing
    ax = np.abs(P[..., 0]); yy = P[..., 1]
    body = ((1 - ss(*BACK_X, ax)) * ss(BACK_Y[0], BACK_Y[1], yy) * (1 - ss(BACK_Y[2], BACK_Y[3], yy))
            * ss(-0.1, 0.2, -Nn[..., 2])).astype(np.float32)
    # central chevron column: a V that widens upwards
    vx = SPINE[0] + SPINE[1] * np.clip(yy - SPINE[2], 0, None)
    spine = (1 - ss(vx, vx + 0.012, ax)).astype(np.float32)
    for name, cls, ext_min in (('gold', gold, EXT_GOLD), ('blue', blue, EXT_BLUE)):
        m = (cls > 0.5).astype(np.float32) * cover
        if name == 'blue':     # on thick body armour, blue only on the central chevron scales
            bb = (body > 0.5) & (spine < 0.5) & (m > 0.5)
            chip = np.maximum(chip, np.clip(surface_gauss(bb.astype(np.float32), 0.0004, ctx) * 2.5, 0, 1) * (body > 0.3))
        ext_min = np.float64(ext_min)
        # 'core' = where the class fills >= CORE_SHARE of a 1.5 mm surface neighbourhood: removes streaks and
        # chips thinner than ~3 mm; kept shapes = core components larger than ext_min across; the kept class
        # area = class texels within ~2 mm of a kept core (morphological reconstruction, along the surface)
        core = surface_gauss(m, CORE_SIGMA, ctx) > CORE_SHARE
        core.ravel()[ctx['tgt']] = core.ravel()[ctx['srci']]
        lab, area, ext = components(core, ctx, tarea)
        big_c = (ext >= ext_min) & (area >= AREA_MIN)
        if name == 'gold':     # on thick body armour only long trims / rings / chevrons survive
            cb = np.bincount(np.maximum(lab, 0).ravel(), (body * (lab >= 0)).ravel(), len(area))
            cn = np.maximum(np.bincount(np.maximum(lab, 0).ravel(), (lab >= 0).ravel().astype(np.float64), len(area)), 1)
            big_c &= ~((cb / cn > 0.5) & (ext < EXT_GOLD_BODY))
        kc = ((lab >= 0) & big_c[np.maximum(lab, 0)]).astype(np.float32)
        near = surface_gauss(kc, 0.0015, ctx) > 0.08
        kept = (m > 0.5) & near
        cm = (m > 0.5) & ~near
        stats[name] = (len(area), int((~big_c).sum()))
        soft = np.clip(surface_gauss(cm.astype(np.float32), 0.0005, ctx) * 2.5, 0, 1)
        guard = np.clip(surface_gauss(kept.astype(np.float32), 0.0004, ctx) * 3.0, 0, 1)
        chip = np.maximum(chip, np.maximum(cm.astype(np.float32), soft * (1 - guard)))
    # a chip is only removed where it sits on black: armour share of its 4 mm surface neighbourhood
    # (avoids punching black holes into painted feathers / blades); inside the back zone always
    dark = ((gold < 0.5) & (blue < 0.5) & (L < 0.16)).astype(np.float32) * cover
    darkshare = surface_gauss(dark, 0.004, ctx)
    onblack = np.maximum(ss(0.45, 0.65, darkshare), body)
    np.save(os.path.join(CF.CACHE, 'rear3_dbg.npy'), np.stack([darkshare, body, spine], -1).astype(np.float16))
    wA = chip * onblack * rear * (1 - zoneB) * (1 - ss(0.3, 0.6, keep)) * cover
    sel = wA > 0.5
    p5, p95 = np.percentile(L[sel], [5, 95]) if sel.sum() > 100 else (0.05, 0.6)
    arm = armour_ramp(0.55 * (L - p5) / max(p95 - p5, 1e-3))
    out = C2 + wA[..., None] * (arm - C2)
    # ---------------- B: drapes
    sel = zoneB > 0.05
    y0, y1, x0, x1 = ctx['box']
    F = C2.copy()
    for it in range(2):
        F.reshape(-1, 3)[ctx['tgt']] = F.reshape(-1, 3)[ctx['srci']]
        st = max(1, int(round(0.005 / (CF.R * ctx['texel']))))
        o, _ = bilateral_pass(F[y0:y1, x0:x1], P[y0:y1, x0:x1], N[y0:y1, x0:x1], ctx['V'][y0:y1, x0:x1], st,
                              sigma_s=0.005, sigma_c=45.0)
        sub = F[y0:y1, x0:x1]; cv = cover[y0:y1, x0:x1]; sub[cv] = o[cv]
    Lf = luma255(F)
    hs, ssrc, _ = CF.hsv01(src)
    wcry = (cry > 0.5).astype(np.float32) * cover
    ang = hs * 2 * np.pi
    cs = surface_gauss(np.stack([np.cos(ang) * ssrc * wcry, np.sin(ang) * ssrc * wcry, wcry], -1), 0.009, ctx)
    hue = (np.arctan2(cs[..., 1], cs[..., 0]) / (2 * np.pi)) % 1.0
    sat = np.clip(surface_gauss(np.stack([ssrc * wcry, wcry], -1), 0.006, ctx), 0, None)
    sat = np.clip(sat[..., 0] / np.maximum(sat[..., 1], 1e-4) * SAT_GAIN, 0, 1)
    base = hsv_to_rgb(hue, sat, np.ones_like(sat)) * 255
    # tone cut on the flattened luminance, drapes only
    dsel = cover & (zoneB > 0.5)
    q, _ = CC.tone_cut(Lf, dsel, ctx, CC.DEF['crys'], 'rear drapes')
    Lt = Lf + CUT_DRAPE * (q - Lf)
    col = base * (Lt / np.maximum(luma255(base), 1e-3))[..., None]
    # small painted specks / cores come back (not long whitish streaks)
    kb = (keep > 0.5).astype(np.float32)
    small = 1 - ss(0.2, 0.35, surface_gauss(kb, 0.002, ctx))
    ks = keep * small
    col = col + ks[..., None] * (src - col)
    out = out + zoneB[..., None] * (col - out)
    out = np.clip(out, 0, 255)
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    out = out[iy, ix]
    res = np.clip(np.round(out), 0, 255).astype(np.uint8)
    np.save(os.path.join(CF.CACHE, 'rear3_body.npy'), res)
    np.save(os.path.join(CF.CACHE, 'rear3_masks.npy'), np.stack([wA, zoneB], -1).astype(np.float16))
    dif = np.abs(res.astype(np.int16) - C2.astype(np.int16)).max(2)
    front = cover & (Nn[..., 2] > 0)
    print(f'chips: gold {stats["gold"][1]}/{stats["gold"][0]} components, blue {stats["blue"][1]}/{stats["blue"][0]}; '
          f'A weight>0.5 on {np.mean(wA[cover] > 0.5):.4f} of covered texels, B (drapes) {np.mean(zoneB[cover] > 0.5):.4f}; '
          f'changed vs paintcel2 >6/255 {np.mean(dif[cover] > 6):.4f}  >16/255 {np.mean(dif[cover] > 16):.4f}; '
          f'front-facing texels changed >6/255 {np.mean(dif[front] > 6):.5f}  {time.time()-t0:.0f}s', flush=True)
    im = Image.fromarray(res)
    for r in (2560, 2048):
        fn = os.path.join(CF.OUT, f'paintcel3_{short}_{r}.webp')
        (im if r == 2560 else im.resize((r, r), Image.LANCZOS)).save(fn + '.tmp.webp', 'WEBP', quality=92, method=6)
        os.replace(fn + '.tmp.webp', fn)


if __name__ == '__main__':
    main()
