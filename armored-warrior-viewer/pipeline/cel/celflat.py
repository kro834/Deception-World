"""Cel paint, stage 1 ("P1"): flatten the painting along the surface.

The look-dev probe's recipe (cv2.bilateralFilter x3, d 9, sigmaColor 26 of 255, sigmaSpace 4 px) is
re-done on the surface instead of on a screen image:
  for every covered texel x, over a (2R+1)^2 atlas stencil with step S (per material, so the stencil
  spans ~SIGMA_S in world units), neighbour y gets the weight
     w = exp(-|P_y - P_x|^2 / 2 SIGMA_S^2)          true 3D distance (not atlas distance)
       * exp(-(sum_c |C_y - C_x|)^2 / 2 SIGMA_C^2)  cv2's colour term (L1 over RGB, 0..255)
       * ss(0.5, 0.8, N_y . N_x)                    other side of a thin blade, other parts: 0
       * valid_y                                    covered, or a padding texel that stands for the
                                                    true surface across the UV seam (celgeo.py)
  A texel of an unrelated island that happens to sit next to x in the atlas is far away in 3D, so its
  weight is ~0: nothing bleeds between islands, and support continues across seams through the ring.
  Three passes; the ring's colours are refreshed from their seam partners before every pass.
Output texels outside the islands: nearest covered texel (for bilinear / mips).
Writes out/paintcel_<short>_2560.webp, _2048.webp (Lanczos), WebP q 92; stats to stdout.
Usage: python celflat.py <short> [...]   (env SIGMA_S metres, default 0.003)
"""
import os, sys, time
import numpy as np
from PIL import Image
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.normpath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, 'cache'); OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
SRC = {
    'body': os.path.join(SP, 'work', 'model-v15', 'paintfix_body_2560.webp'),
    'helmet': os.path.join(SP, 'work', 'model-v15', 'paintfix_helmet_2560.webp'),
    'chest': os.path.join(SP, 'pipeline', 'bake', 'dec', 'det', 'baseColor_4.jpg'),
}
SIGMA_S = float(os.environ.get('SIGMA_S', '0.003'))
SIGMA_C = float(os.environ.get('SIGMA_C', '22.0'))
RANGE_GAMMA = float(os.environ.get('RANGE_GAMMA', '0.6'))   # colour term measured on 255*(c/255)^g: dark lines on
                                                              # near-black armour (scale mesh) count as edges
AA_SIGMA = float(os.environ.get('AA_SIGMA', '0.00045'))      # final plain surface Gaussian (m): softens stair-steps
PASSES = 3
LOSSLESS = {'chest'}   # the orb core: its 1-2 texel rays do not survive lossy 4:2:0 WebP
R = 5


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def bilateral_pass(C, P, N, V, step, sigma_s=None, sigma_c=None, Rr=None, Cr=None):
    sigma_s = sigma_s or SIGMA_S; Rr = Rr or R
    Cr = C if Cr is None else Cr
    H, W = V.shape
    pad = Rr * step
    Crp = np.pad(Cr, ((pad, pad), (pad, pad), (0, 0)))
    Cp = np.pad(C, ((pad, pad), (pad, pad), (0, 0)))
    Pp = np.pad(P, ((pad, pad), (pad, pad), (0, 0)))
    Np = np.pad(N, ((pad, pad), (pad, pad), (0, 0)))
    Vp = np.pad(V, pad).astype(np.float32)
    acc = np.zeros_like(C); wsum = np.zeros((H, W), np.float32)
    k_s = np.float32(-0.5 / sigma_s ** 2); k_c = np.float32(0 if sigma_c == 0 else -0.5 / (sigma_c or SIGMA_C) ** 2)
    for dy in range(-Rr, Rr + 1):
        for dx in range(-Rr, Rr + 1):
            ys, xs = pad + dy * step, pad + dx * step
            Cs = Cp[ys:ys + H, xs:xs + W]; Ps = Pp[ys:ys + H, xs:xs + W]
            Ns = Np[ys:ys + H, xs:xs + W]; Vs = Vp[ys:ys + H, xs:xs + W]
            d = Ps - P
            w = np.einsum('hwc,hwc->hw', d, d); w *= k_s
            dc = np.abs(Crp[ys:ys + H, xs:xs + W] - Cr).sum(2); dc *= dc; dc *= k_c
            w += dc
            np.exp(w, out=w)
            nd = np.einsum('hwc,hwc->hw', Ns, N)
            w *= ss(0.5, 0.8, nd).astype(np.float32)
            w *= Vs
            acc += Cs * w[..., None]; wsum += w
    return acc / np.maximum(wsum, 1e-12)[..., None], wsum


def flatten(src, ctx, step, t0):
    P, N, V, cover, tgt, srci = ctx['P'], ctx['N'], ctx['V'], ctx['cover'], ctx['tgt'], ctx['srci']
    y0, y1, x0, x1 = ctx['box']
    C = src.copy()
    for it in range(PASSES):
        C.reshape(-1, 3)[tgt] = C.reshape(-1, 3)[srci]          # ring := its seam partner's current colour
        Cs_ = C[y0:y1, x0:x1]
        out, ws = bilateral_pass(Cs_, P[y0:y1, x0:x1], N[y0:y1, x0:x1], V[y0:y1, x0:x1], step,
                                 Cr=255 * (Cs_ / 255) ** RANGE_GAMMA)
        sub = C[y0:y1, x0:x1]
        cv = cover[y0:y1, x0:x1]
        sub[cv] = out[cv]
        print(f'  pass {it+1}: {time.time()-t0:.0f}s', flush=True)
    if AA_SIGMA > 0:   # anti-alias: plain surface Gaussian, radius 1 stencil (step scaled to the texel size)
        st2 = max(1, int(round(AA_SIGMA / ctx['texel'] / 1.2)))
        C.reshape(-1, 3)[tgt] = C.reshape(-1, 3)[srci]
        out, _ = bilateral_pass(C[y0:y1, x0:x1], P[y0:y1, x0:x1], N[y0:y1, x0:x1], V[y0:y1, x0:x1], st2,
                                sigma_s=AA_SIGMA, sigma_c=0, Rr=1)
        sub = C[y0:y1, x0:x1]; cv = cover[y0:y1, x0:x1]; sub[cv] = out[cv]
    return C


def surface_gauss(X, sigma, ctx, R4=4):
    """Plain Gaussian along the surface (3D distance, normal-compatible, seam-continuous via the ring)."""
    y0, y1, x0, x1 = ctx['box']
    st = max(1, int(round(2 * sigma / (R4 * ctx['texel']))))
    X = X.copy()
    if X.ndim == 2:
        X = X[..., None]
    X.reshape(-1, X.shape[-1])[ctx['tgt']] = X.reshape(-1, X.shape[-1])[ctx['srci']]
    out = X.copy()
    o, _ = bilateral_pass(X[y0:y1, x0:x1], ctx['P'][y0:y1, x0:x1], ctx['N'][y0:y1, x0:x1], ctx['V'][y0:y1, x0:x1], st,
                          sigma_s=sigma, sigma_c=0, Rr=R4)
    out[y0:y1, x0:x1] = o
    return out[..., 0] if out.shape[-1] == 1 else out


def luma255(c):
    return (c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722) / 255.0


def emissive(short, res=2560):
    sys.path.insert(0, os.path.join(HERE, '..', 'lines'))
    import bakelib_copy as B, json
    g = json.load(open(os.path.join(B.DEC, 'det', 'm.gltf')))
    mat = [m for m in g['materials'] if B.SHORT.get(m['name']) == short][0]
    tex = g['textures'][mat['emissiveTexture']['index']]
    src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    im = Image.open(os.path.join(B.DEC, 'det', g['images'][src]['uri'])).convert('RGB').resize((res, res), Image.BILINEAR)
    return luma255(np.asarray(im, np.float32))


# keep rule: lit crystal (emissive) that is nearly white, or a small bright peak, keeps the source paint
KEEP = dict(lit=(0.05, 0.14), white=(0.62, 0.74), peak=(0.035, 0.085), bg_sigma=0.0015, soft=0.0004)


def hsv01(c):
    import cv2
    h = cv2.cvtColor(np.clip(c, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    return h[..., 0] / 256.0, h[..., 1] / 255.0, h[..., 2] / 255.0


def crystal_hue(c):
    h, s_, v = hsv01(c)
    hd = h * 360
    return (ss(185, 200, hd) * (1 - ss(335, 350, hd)) * ss(0.28, 0.42, s_) * ss(0.30, 0.45, v)).astype(np.float32)


def keep_rule(C, src, ctx, short):
    cover = ctx['cover']
    lit = ss(*KEEP['lit'], emissive(short))
    # painted crystal also counts (the orb's face is barely lit in the emissive map): blue..pink hue,
    # saturated, not dark, spread over ~2 mm along the surface so white rays inside crystal are included
    cry = crystal_hue(src)
    cry = np.clip(surface_gauss(cry, 0.002, ctx) * 2.0, 0, 1)
    lit = np.maximum(lit, cry)
    Ls = luma255(src)
    white = ss(*KEEP['white'], src.min(2) / 255.0)
    bgc = surface_gauss(src / 255.0, KEEP['bg_sigma'], ctx)
    bg = luma255(bgc * 255.0)
    cdist = np.abs(src / 255.0 - bgc).sum(2)
    peak = ss(*KEEP['peak'], (Ls - bg) + 0.3 * cdist * (Ls > bg))   # brighter than, or a different colour from, its 1.5 mm surroundings
    m = np.maximum(white, peak) * lit * cover
    if short == 'chest':   # the chest material IS the orb's glowing core (0.1% of its atlas): keep it whole
        m = lit * cover
    ms = surface_gauss(m.astype(np.float32), KEEP['soft'], ctx)
    m = np.clip(np.maximum(m, ms * 1.5), 0, 1) * cover
    np.save(os.path.join(CACHE, f'keep_{short}.npy'), m.astype(np.float16))
    print(f'  keep rule: {np.mean(m[cover] > 0.5):.4f} of covered texels restored (>0.5), lit {np.mean(lit[cover] > 0.5):.3f}')
    return C + m[..., None] * (src - C)


def main(short):
    t0 = time.time()
    geo = np.load(os.path.join(CACHE, f'geo_{short}.npz'))
    P, N, cover, ring_src = geo['P'], geo['N'], geo['cover'], geo['ring_src']
    texel = float(geo['texel_m'])
    step = max(1, int(round(SIGMA_S / (R * texel))))
    src = np.asarray(Image.open(SRC[short]).convert('RGB'), np.float32)
    assert src.shape[:2] == cover.shape, (src.shape, cover.shape)
    tgt = np.nonzero(ring_src >= 0)[0]; srci = ring_src[tgt]
    V = cover.copy(); V.ravel()[tgt] = True
    ys, xs = np.nonzero(V)
    m = R * max(step, 4)
    y0, y1 = max(ys.min() - m, 0), min(ys.max() + m + 1, V.shape[0]); x0, x1 = max(xs.min() - m, 0), min(xs.max() + m + 1, V.shape[1])
    ctx = dict(P=P, N=N, V=V, cover=cover, tgt=tgt, srci=srci, box=(y0, y1, x0, x1), texel=texel)
    f0 = os.path.join(CACHE, f'flat0_{short}.npy')
    if os.path.exists(f0) and not os.environ.get('FORCE') and os.path.getmtime(f0) > os.path.getmtime(SRC[short]):
        C = np.load(f0).astype(np.float32)
        print(f'  (cached P1 flatten {f0})')
    else:
        C = flatten(src, ctx, step, t0)
        np.save(f0, C.astype(np.float16))
    C = keep_rule(C, src, ctx, short)
    # outside the islands: nearest covered texel
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    C = C[iy, ix]
    res = np.clip(np.round(C), 0, 255).astype(np.uint8)
    dif = np.abs(res.astype(np.int16) - src.astype(np.int16)).max(2)[cover]
    print(f'{short}: step {step} texels (stencil +-{R*step} = +-{R*step*texel*1e3:.1f} mm), sigma_s {SIGMA_S*1e3:.1f} mm sigma_c {SIGMA_C} gamma {RANGE_GAMMA} aa {AA_SIGMA*1e3:.2f} mm; '
          f'covered texels changed >2/255: {np.mean(dif > 2):.3f}  >6/255: {np.mean(dif > 6):.3f}  >16/255: {np.mean(dif > 16):.3f}  '
          f'mean |d| {dif.mean():.2f}  {time.time()-t0:.0f}s', flush=True)
    np.save(os.path.join(CACHE, f'flat_{short}.npy'), res)
    im = Image.fromarray(res)
    for r in (2560, 2048):
        fn = os.path.join(OUT, f'paintcel_{short}_{r}.webp')  # stage 1 (P1 + keep rule)
        kw = dict(lossless=True, quality=100, method=6) if short in LOSSLESS else dict(quality=92, method=6)
        (im if r == 2560 else im.resize((r, r), Image.LANCZOS)).save(fn + '.tmp.webp', 'WEBP', **kw)
        os.replace(fn + '.tmp.webp', fn)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        main(s)
