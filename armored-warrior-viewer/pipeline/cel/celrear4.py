"""Cel paint, stage 4 (body, rear only) on top of paintcel2 (cache/cut_body.npy). Writes out/paintcel4_body_*.

A. Back, shoulders, flanks, upper arms: hand-placed 3D zones (ZONES, soft boxes in |x|, y; rear-facing).
   Inside them, per texel of the paintcel2 colour:
     blue  -> kept only if part of a LARGE crystal shape (surface-connected core, core = class share
              > CORE_SHARE over CORE_SIGMA, extent >= EXT_CRYS) or in the spine chevron column; else armour
     gold  -> kept only if part of a long gold core (extent >= EXT_GOLD) that lies within EDGE_MM of a
              geometric part edge (|curvature| > CURV_EDGE, bake agent's curvature) or of a kept crystal
              shape (the gold edge of a feather); else armour
     inside kept crystal shapes, small dark / gold holes are filled with the surrounding crystal colour
   Armour = ramp #030304 -> #14141b -> #2d2b34 from the texel's own luminance (lower half of the ramp).
B. Rear drapes / rear waist-cloth interior (rear-facing large crystal, y < 0.6, not the tail tip):
   colour copied from the FRONT face of the same drape (nearest front-facing crystal texel within 9 mm
   whose normal opposes), else from the drape's own paint; then low-passed along the surface (hue:
   saturation-weighted circular mean over 10 mm; saturation and lightness: 10 mm means), lightness
   re-cut into 3 faces across the width from the smoothed normal's x component, plus one light line
   along the drape's edge. No specks. Blended in by the rear weight and a soft zone border.
"""
import os, sys, time
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

# zones: (|x| lo, |x| hi, y lo, y hi), soft edge ZSOFT
ZONES = [(0.055, 0.27, 0.40, 0.70),     # flanks, under the shoulders, upper arms (rear)
         (0.055, 0.21, 0.66, 0.81)]     # shoulder feather clusters / pauldrons (rear); tail above / beside excluded
ZSOFT = 0.012
CORE_SIGMA, CORE_SHARE = 0.002, 0.6
EXT_CRYS, EXT_GOLD, EXT_GOLD_BIG = 0.040, 0.030, 0.055
EDGE_MM, CURV_EDGE = 0.005, 0.22
SPINE = (0.045, 0.5, 0.62)
REAR = (-0.10, 0.25)
DRAPE_SIGMA = 0.016          # m: low-pass of the drape colour (hue, saturation, lightness)


def boxw(P, z):
    ax, y = np.abs(P[..., 0]), P[..., 1]
    return (ss(z[0] - ZSOFT, z[0], ax) * (1 - ss(z[1], z[1] + ZSOFT, ax)) *
            ss(z[2] - ZSOFT, z[2], y) * (1 - ss(z[3], z[3] + ZSOFT, y))).astype(np.float32)


def kept_shapes(m, ctx, tarea, ext_min):
    core = surface_gauss(m.astype(np.float32), CORE_SIGMA, ctx) > CORE_SHARE
    core.ravel()[ctx['tgt']] = core.ravel()[ctx['srci']]
    lab, area, ext = CR.components(core, ctx, tarea)
    big = (ext >= ext_min) & (area >= 40e-6)
    kc = ((lab >= 0) & big[np.maximum(lab, 0)]).astype(np.float32)
    near = surface_gauss(kc, 0.0015, ctx) > 0.08
    return kc, near, (len(area), int(big.sum()))


def main():
    t0 = time.time()
    ctx = CC.ctx_of('body')
    cover, P, N = ctx['cover'], ctx['P'], ctx['N']
    Nn = N / np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
    C2 = np.load(os.path.join(CF.CACHE, 'cut_body.npy')).astype(np.float32)
    src = np.asarray(Image.open(CF.SRC['body']).convert('RGB'), np.float32)
    L = luma255(C2); h, s_, v = CF.hsv01(C2)
    gold = (ss(.012, .04, h) * (1 - ss(.145, .185, h)) * ss(.15, .3, s_) * ss(.16, .3, v)) > 0.5
    blue = CF.crystal_hue(C2) > 0.5
    rear = ss(*REAR, -Nn[..., 2]).astype(np.float32)
    tarea = CR.texel_area_map(P, cover)
    # ---------------- zone B (drapes), computed first so A leaves it alone
    lit = ss(0.05, 0.14, CF.emissive('body'))
    cry = np.maximum(lit, np.clip(surface_gauss(CF.crystal_hue(src), 0.002, ctx) * 2.0, 0, 1))
    big = surface_gauss((cry > 0.5).astype(np.float32), 0.005, ctx)
    e = (P - CC.TAIL[0]) / CC.TAIL[1]
    tail = 1 - ss(0.8, 1.0, np.sqrt((e * e).sum(-1)))
    zB = (cry > 0.5) * ss(0.6, 0.8, big) * (1 - tail) * (1 - ss(0.58, 0.62, P[..., 1])) * rear
    zB = np.clip(surface_gauss(zB.astype(np.float32), 0.001, ctx), 0, 1) * cover
    # ---------------- A
    zA = np.maximum.reduce([boxw(P, z) for z in ZONES]) * rear * (1 - ss(0.2, 0.5, zB)) * cover
    crys = blue | (cry > 0.5)          # painted or lit crystal (pale pink blades included)
    kcry, near_cry, st_c = kept_shapes(crys, ctx, tarea, EXT_CRYS)
    kgold, near_gold, st_g = kept_shapes(gold, ctx, tarea, EXT_GOLD)
    kgold_big, near_gold_big, _ = kept_shapes(gold, ctx, tarea, EXT_GOLD_BIG)   # rings, chevrons: always kept
    geo = np.load(os.path.join(CF.HERE, '..', 'bake', 'cache', 'geom_detail_body.npz'))
    vv = np.nonzero(ctx['V'].ravel())[0]
    _, nn = cKDTree(geo['P']).query(P.reshape(-1, 3)[vv], k=1, workers=2)
    curv = np.zeros(L.size, np.float32); curv[vv] = np.abs(geo['curv'][nn]); curv = curv.reshape(L.shape)
    edge = (curv > CURV_EDGE).astype(np.float32)
    near_edge = surface_gauss(edge, EDGE_MM / 2, ctx) > 0.04
    near_kc = surface_gauss(kcry, EDGE_MM / 2, ctx) > 0.04
    ax, yy = np.abs(P[..., 0]), P[..., 1]
    vx = SPINE[0] + SPINE[1] * np.clip(yy - SPINE[2], 0, None)
    spine = ax < vx
    blue = blue | ((cry > 0.5) & ~gold)
    keep_blue = blue & (near_cry | spine)
    keep_gold = gold & ((near_gold & (near_edge | near_kc)) | near_gold_big)
    crystal_body = surface_gauss(kcry, 0.001, ctx) > 0.3              # inside a kept crystal shape
    to_black = (blue & ~keep_blue) | (gold & ~keep_gold) | (~blue & ~gold & (L > 0.22) & ~crystal_body)
    to_black &= ~crystal_body
    hole = crystal_body & ~blue & ~gold & (L < 0.12)                         # dark / gold holes in crystal shapes
    soft = lambda m: np.clip(surface_gauss(m.astype(np.float32), 0.0005, ctx) * 2.0, 0, 1)
    wblack = np.maximum(to_black.astype(np.float32), soft(to_black) * (1 - soft(keep_blue | keep_gold))) * zA
    whole = hole.astype(np.float32) * zA
    sel = wblack > 0.5
    p5, p95 = np.percentile(L[sel], [5, 95]) if sel.sum() > 100 else (0.05, 0.6)
    arm = CR.armour_ramp(0.55 * (L - p5) / max(p95 - p5, 1e-3))
    out = C2 + wblack[..., None] * (arm - C2)
    # crystal inpaint for holes: normalised surface mean of the crystal's own colour (4 mm)
    bw = (crys & crystal_body).astype(np.float32)
    acc = surface_gauss(np.concatenate([C2 * bw[..., None], bw[..., None]], -1), 0.004, ctx)
    fill = acc[..., :3] / np.maximum(acc[..., 3:], 1e-4)
    has = acc[..., 3] > 0.05
    out = out + (whole * has)[..., None] * (fill - out)
    # ---------------- B: drapes from their front faces
    selB = np.nonzero((zB > 0.02).ravel())[0]
    frontc = np.nonzero((cover & (cry > 0.5) & (Nn[..., 2] > 0.2)).ravel())[0]
    Pf = P.reshape(-1, 3)[frontc]
    d, j = cKDTree(Pf).query(P.reshape(-1, 3)[selB], k=1, workers=2)
    opp = (Nn.reshape(-1, 3)[frontc[j]] * Nn.reshape(-1, 3)[selB]).sum(1) < 0.0
    okf = (d < 0.016) & opp
    base = C2.reshape(-1, 3).copy()
    base[selB[okf]] = C2.reshape(-1, 3)[frontc[j[okf]]]
    base = base.reshape(C2.shape)
    hb, sb, _ = CF.hsv01(base)
    Lb = luma255(base)
    wz = (zB > 0.02).astype(np.float32) * cover
    ang = hb * 2 * np.pi
    lp = surface_gauss(np.stack([np.cos(ang) * sb * wz, np.sin(ang) * sb * wz, sb * wz, Lb * wz, wz], -1), DRAPE_SIGMA, ctx)
    den = np.maximum(lp[..., 4], 1e-4)
    hue = (np.arctan2(lp[..., 1], lp[..., 0]) / (2 * np.pi)) % 1.0
    sat = np.clip(lp[..., 2] / den * 1.08, 0, 1)
    Ll = lp[..., 3] / den
    # three faces across the width from the smoothed normal's x component (antialiased by a 0.4 mm blur)
    nx = Nn[..., 0] * np.sign(P[..., 0] + 1e-6)          # outward-facing side of each drape
    face = np.where(nx < -0.25, 0.78, np.where(nx > 0.35, 1.22, 1.0)).astype(np.float32)
    face = surface_gauss(face * wz + (1 - wz), 0.0004, ctx)
    Lt = np.clip(Ll * face, 0.02, 0.85)
    # one light line along the drape's edge: where the zone share is falling off
    share = surface_gauss((cry > 0.5).astype(np.float32) * cover, 0.0012, ctx)
    line = (ss(0.30, 0.45, share) * (1 - ss(0.55, 0.70, share))).astype(np.float32)
    Lt = Lt + 0.18 * line
    col = CR.hsv_to_rgb(hue, sat, np.ones_like(sat)) * 255
    col = col * (Lt / np.maximum(luma255(col), 1e-3))[..., None]
    out = out + zB[..., None] * (col - out)
    out = np.clip(out, 0, 255)
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    res = np.clip(np.round(out[iy, ix]), 0, 255).astype(np.uint8)
    np.save(os.path.join(CF.CACHE, 'rear4_body.npy'), res)
    dif = np.abs(res.astype(np.int16) - C2.astype(np.int16)).max(2)
    front = cover & (Nn[..., 2] > 0.1)
    print(f'A: zone {np.mean(zA[cover] > 0.5):.4f}, to armour {np.mean(wblack[cover] > 0.5):.4f}, holes filled '
          f'{np.mean((whole * has)[cover] > 0.5):.4f} (crystal shapes kept {st_c[1]}/{st_c[0]}, gold {st_g[1]}/{st_g[0]}); '
          f'B: zone {np.mean(zB[cover] > 0.5):.4f}, front-face colour found for {okf.mean():.2f}; '
          f'changed >6/255 {np.mean(dif[cover] > 6):.4f} >16/255 {np.mean(dif[cover] > 16):.4f}; '
          f'front-facing (n_z>0.1) changed >6/255 {np.mean(dif[front] > 6):.5f}  {time.time()-t0:.0f}s', flush=True)
    im = Image.fromarray(res)
    for r in (2560, 2048):
        fn = os.path.join(CF.OUT, f'paintcel4_body_{r}.webp')
        (im if r == 2560 else im.resize((r, r), Image.LANCZOS)).save(fn + '.tmp.webp', 'WEBP', quality=92, method=6)
        os.replace(fn + '.tmp.webp', fn)


if __name__ == '__main__':
    main()
