"""Cel paint, stage 2: three-tone cut of the painted light on gold (P2) and half of it on large crystal
faces (P3), on top of the stage-1 paint (cache/flat_<short>.npy = P1 + keep rule). Armour: untouched.

All neighbourhood steps are surface Gaussians (celflat.surface_gauss: 3D distance, normal-compatible,
seam-continuous through the padding ring; never atlas-adjacent texels of other islands).

Classes, per texel of the P1 paint (HSV as in work/look/material.js):
  gold    = ss(.012,.04,h)(1-ss(.145,.185,h)) ss(.15,.3,s) ss(.16,.3,v) (1-crystal)
  crystal = max(emissive lit, painted blue..pink spread 2 mm)            (celflat.keep_rule's gate)
  large crystal face = crystal, surface-blurred at 5 mm > ~0.75 (a crystal area >~1.5 cm across),
            minus: helmet (visor) and chest (orb core) materials, the tail-tip zone, the keep-rule mask
            (cores, white, sparkles)
Tone cut per class (gold / large crystal separately, thresholds per material):
  lb = surface Gaussian of luma (0.8 mm); two thresholds at the deepest valleys of the class's lb
  histogram near the defaults; tone index cleaned by a surface majority vote (1.0 mm, class texels
  only) -> no specks or islands below ~2 mm; level of each tone = median luma of the class in it;
  steps anti-aliased by a 0.3 mm surface blur of the one-hot tones.
  New colour = P1 colour * (target luma / own luma): each texel keeps its own hue and saturation.
  Crystal: luma moves halfway (CUT_CRYSTAL = 0.5).
Thin painted lines are protected: where the luma is well below (dark line) or above (bright line) its
1.2 mm surface mean, the cut weight falls to 0.
Writes out/paintcel2_<short>_{2560,2048}.webp (q 92; chest lossless) and cache/cutmask_<short>.npy.
Usage: python celcut.py <short> [...]
"""
import os, sys, time
import numpy as np
import cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import celflat as CF
from celflat import ss, surface_gauss, luma255

CUT_GOLD = 1.0
CUT_CRYSTAL = float(os.environ.get('CUT_CRYSTAL', '0.5'))
LB_SIGMA = float(os.environ.get('LB_SIGMA', '0.0015'))     # luma smoothing before the thresholds (m)
VOTE_SIGMA = float(os.environ.get('VOTE_SIGMA', '0.0020')) # surface majority vote (m): no tone islands below ~4 mm
PCT = (30, 80)          # dark bronze = lowest 30 %, pale band = top 20 % of the class's (smoothed) luma
DEF = {'gold': [0.30, 0.485], 'crys': [0.28, 0.50]}          # raw-luma defaults (gold = probe's graded 0.27/0.52)
TAIL = (np.array([0.235, 0.71, -0.035]), np.array([0.05, 0.07, 0.035]))   # tail-tip ellipsoid (m)
NO_CRYSTAL_CUT = {'helmet', 'chest'}                            # visor and orb core keep their P1 gradients


def rear_cloth(P):
    """Soft zone of the rear waist cloth panels: behind the body axis, below the belt, near the middle."""
    return ((1 - ss(0.075, 0.095, np.abs(P[..., 0]))) * ss(0.26, 0.29, P[..., 1]) * (1 - ss(0.525, 0.545, P[..., 1]))
            * (1 - ss(-0.01, 0.02, P[..., 2]))).astype(np.float32)


def ctx_of(short):
    g = np.load(os.path.join(CF.CACHE, f'geo_{short}.npz'))
    cover, rs = g['cover'], g['ring_src']; tgt = np.nonzero(rs >= 0)[0]
    V = cover.copy(); V.ravel()[tgt] = True
    ys, xs = np.nonzero(V)
    return dict(P=g['P'], N=g['N'], V=V, cover=cover, tgt=tgt, srci=rs[tgt], texel=float(g['texel_m']),
                box=(max(ys.min() - 24, 0), ys.max() + 25, max(xs.min() - 24, 0), xs.max() + 25))


def valleys(values, default, lo=0.0, hi=1.0):
    h, edges = np.histogram(values, bins=96, range=(lo, hi))
    h = cv2.GaussianBlur(h.astype(np.float32)[None, :], (0, 0), 2.5)[0]
    c = (edges[:-1] + edges[1:]) / 2
    out = []
    for d in default:
        w = np.abs(c - d) < 0.03 * (hi - lo)
        out.append(float(c[w][np.argmin(h[w])]) if w.sum() >= 3 else d)
    return out


def tone_cut(L, sel, ctx, default, tag):
    """Returns (target luma, levels, thresholds, idx) for the texels in sel (bool)."""
    selw = sel.astype(np.float32)
    lb = surface_gauss(L, LB_SIGMA, ctx)
    pct = np.percentile(lb[sel], PCT)            # start at the class's own percentiles, then the nearest valley
    th = valleys(lb[sel], list(pct))
    idx = (lb >= th[0]).astype(np.int8) + (lb >= th[1]).astype(np.int8)
    den = np.maximum(surface_gauss(selw, VOTE_SIGMA, ctx), 1e-4)
    votes = np.stack([surface_gauss(((idx == k) & sel).astype(np.float32), VOTE_SIGMA, ctx) / den for k in range(3)], -1)
    idx = votes.argmax(-1).astype(np.int8)
    levels = []
    for k in range(3):
        b = sel & (idx == k)
        levels.append(float(np.median(L[b])) if b.sum() > 200 else [th[0] * 0.8, sum(th) / 2, th[1] * 1.15][k])
    den2 = np.maximum(surface_gauss(selw, 0.0003, ctx), 1e-4)
    soft = np.stack([surface_gauss(((idx == k) & sel).astype(np.float32), 0.0003, ctx) / den2 for k in range(3)], -1)
    soft /= np.maximum(soft.sum(-1, keepdims=True), 1e-6)
    q = (soft * np.array(levels, np.float32)).sum(-1)
    print(f'  {tag}: thresholds {np.round(th, 3)}  levels {np.round(levels, 3)}  tone shares '
          f'{np.round([np.mean(idx[sel] == k) for k in range(3)], 3)}', flush=True)
    return q, idx


def main(short):
    t0 = time.time()
    ctx = ctx_of(short)
    cover, P = ctx['cover'], ctx['P']
    F = np.load(os.path.join(CF.CACHE, f'flat_{short}.npy')).astype(np.float32)   # P1 + keep
    src = np.asarray(Image.open(CF.SRC[short]).convert('RGB'), np.float32)
    keep = np.load(os.path.join(CF.CACHE, f'keep_{short}.npy')).astype(np.float32)
    L = luma255(F)
    h, s_, v = CF.hsv01(F)
    lit = ss(0.05, 0.14, CF.emissive(short))
    cry = np.maximum(lit, np.clip(surface_gauss(CF.crystal_hue(src), 0.002, ctx) * 2.0, 0, 1))
    gold = ss(.012, .04, h) * (1 - ss(.145, .185, h)) * ss(.15, .3, s_) * ss(.16, .3, v) * (1 - cry)
    # thin painted lines: well off their 1.2 mm surface mean
    dev = L - surface_gauss(L, 0.0012, ctx)
    line = np.maximum(ss(0.035, 0.08, -dev), ss(0.06, 0.12, dev))
    out = F.copy()
    wmap = np.zeros(L.shape, np.float32)
    # ---- gold
    gsel = cover & (gold > 0.6)
    if gsel.sum() > 2000:
        q, _ = tone_cut(L, gsel, ctx, DEF['gold'], 'gold')
        wg = np.clip(surface_gauss(gold.astype(np.float32), 0.0003, ctx), 0, 1) * (1 - line) * (1 - keep) * CUT_GOLD
        if short == 'body':   # rear waist cloth: the cut gives streaky puddles there, so it stays at P1
            wg *= 1 - rear_cloth(P)
        tgtL = L + wg * (q - L)
        out = out * (tgtL / np.maximum(L, 1e-3))[..., None]
        wmap = np.maximum(wmap, wg)
    # ---- large crystal faces
    if short not in NO_CRYSTAL_CUT:
        big = surface_gauss((cry > 0.5).astype(np.float32), 0.005, ctx)
        e = (P - TAIL[0]) / TAIL[1]
        tail = 1 - ss(0.8, 1.0, np.sqrt((e * e).sum(-1)))
        large = (cry > 0.5) * ss(0.65, 0.85, big) * (1 - tail)
        csel = cover & (large > 0.5) & (keep < 0.3)
        if csel.sum() > 2000:
            q, _ = tone_cut(L, csel, ctx, DEF['crys'], 'crystal')
            wc = np.clip(surface_gauss(large.astype(np.float32), 0.0004, ctx), 0, 1) * (1 - line) * (1 - keep) * CUT_CRYSTAL
            Lc = luma255(out)
            tgtL = Lc + wc * (q - Lc)
            out = out * (tgtL / np.maximum(Lc, 1e-3))[..., None]
            wmap = np.maximum(wmap, wc)
    out = np.clip(out, 0, 255)
    from scipy import ndimage
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    out = out[iy, ix]
    res = np.clip(np.round(out), 0, 255).astype(np.uint8)
    np.save(os.path.join(CF.CACHE, f'cutmask_{short}.npy'), wmap.astype(np.float16))
    np.save(os.path.join(CF.CACHE, f'cut_{short}.npy'), res)
    dif = np.abs(res.astype(np.int16) - F.astype(np.int16)).max(2)[cover]
    print(f'{short}: cut weight >0.5 on {np.mean(wmap[cover] > 0.5):.3f} of covered texels (gold {np.mean((gold[cover] > 0.6)):.3f}); '
          f'changed vs P1 >6/255 {np.mean(dif > 6):.3f}  >16/255 {np.mean(dif > 16):.3f}  {time.time()-t0:.0f}s', flush=True)
    im = Image.fromarray(res)
    for r in (2560, 2048):
        fn = os.path.join(CF.OUT, f'paintcel2_{short}_{r}.webp')
        kw = dict(lossless=True, quality=100, method=6) if short in CF.LOSSLESS else dict(quality=92, method=6)
        (im if r == 2560 else im.resize((r, r), Image.LANCZOS)).save(fn + '.tmp.webp', 'WEBP', **kw)
        os.replace(fn + '.tmp.webp', fn)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        main(s)
