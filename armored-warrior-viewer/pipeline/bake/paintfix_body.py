"""Pointwise colour-class fixes of the BODY painting (source: detail baseColor_1.jpg, 2560^2).
Per texel only: geometry (smoothed normal, position, shape thickness) is rasterised from the welded mesh
into UV space (continuous across seams); colour decisions use the texel's own colour and its own emissive
value; the new colour is a ramp of the texel's own luminance. No colour neighbourhood op in atlas space.

Fix 1  sideways limb armour painted blue -> armour ramp
   side  = 1 - ss(0.25, 0.60, |n_z|)        (0 exactly on anything facing a sheet, |n_z| >= 0.6)
   thick = ss(T0, T1, thickness)            shape diameter along -n (BVH, smoothed 3 mm on the surface);
                                             blades / drapes / petals / tail edges are thin -> untouched
   blue  = hue 195..285 (soft), S > ~0.25   (not gold, not pink tips)
   dark  = 1 - ss(E0, E1, emissive max)     (anything the emissive map lights stays)
   w1 = side * thick * blue * dark
Fix 2  rear faces of the shoulder discs: within radius RIM_OUT (xy) of the disc axis, rear-facing
   (ss(0.1, 0.35, -n_z)) and thick: r < RIM_IN -> armour ramp with compressed luminance (ghost star gone),
   RIM_IN..RIM_OUT -> gold ramp.
Ramps from refs/palette.json (front sheet).
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
from mask_classify import hsv
import bpy  # noqa: F401
from mathutils.bvhtree import BVHTree
from mathutils import Vector

C = os.path.join(B.HERE, 'cache'); OUT = os.path.join(B.HERE, 'out')
mm = 1e-3
T0, T1 = 16 * mm, 26 * mm
E0, E1 = 0.30, 0.50
DISCS = [np.array([-0.0965, 0.7205]), np.array([0.0970, 0.7200])]
RIM_IN, RIM_OUT, RIM_SOFT = 0.0265, 0.0355, 0.0012
pal = json.load(open(os.path.join(B.HERE, '..', '..', 'refs', 'palette.json')))['front.png']


def hx(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float64) / 255


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def ramp(t, stops):
    t = np.clip(t, 0, 1)[..., None]
    a, b, c = stops
    return np.where(t < 0.5, a + (b - a) * (2 * t), b + (c - b) * (2 * t - 1))


ARM = [hx(pal['black'][k]) for k in ('shadow', 'mid', 'light')]
GLD = [hx(pal['gold'][k]) for k in ('shadow', 'mid', 'light')]


def thickness(P, F, N):
    tp = os.path.join(C, 'thick_welded_body.npy')
    if os.path.exists(tp):
        return np.load(tp)
    bvh = BVHTree.FromPolygons(P.tolist(), F.tolist(), all_triangles=True)
    out = np.zeros(len(P))
    for i in range(len(P)):
        hit = bvh.ray_cast(Vector(P[i] - N[i] * 2e-4), Vector(-N[i]), 0.15)
        out[i] = hit[3] if hit[0] is not None else 0.0
    np.save(tp, out)
    return out


def main():
    g, prims = B.load_gltf('detail')
    p = [q for q in prims if B.SHORT.get(q['material']) == 'body'][0]
    src_u8 = np.asarray(Image.open(B.tex_path(g, 'detail', p['material'], 'base')).convert('RGB'))
    src = src_u8.astype(np.float64) / 255
    R = src.shape[0]
    em = Image.open(B.tex_path(g, 'detail', p['material'], 'emissive')).convert('RGB')
    em = np.asarray(em.resize((R, R), Image.BILINEAR), np.float64).max(-1) / 255
    d = np.load(os.path.join(C, 'geom_detail_body.npz'))
    P, F, N, toon, inv = d['P'], d['F'], d['N'], d['toon'], d['inv']
    th = thickness(P, F, N)
    Lc, Mc = B.laplacian_cot(P, F)
    ths = B.diffuse_m(Lc, Mc, th[:, None], (3 * mm) ** 2 / 2)[:, 0]
    attr = np.concatenate([p['pos'], toon[inv], ths[inv][:, None]], 1)
    geo, cov, _ = B.raster(p['uv'], p['idx'], attr, R)
    geo = B.fill_nearest(geo, cov)
    pos = geo[..., 0:3]
    n = geo[..., 3:6] / np.maximum(np.linalg.norm(geo[..., 3:6], axis=-1, keepdims=True), 1e-9)
    nz = n[..., 2]; tk = geo[..., 6]
    h, s, v = [x.reshape(R, R) for x in hsv(src.reshape(-1, 3))]
    L = src @ np.array([0.299, 0.587, 0.114])
    thick = ss(T0, T1, tk)
    dark = 1 - ss(E0, E1, em)
    # ---- fix 1
    side = 1 - ss(0.25, 0.60, np.abs(nz))
    blue = ss(190, 200, h) * (1 - ss(280, 292, h)) * ss(0.18, 0.30, s)
    w1 = side * thick * blue * dark
    np.save(os.path.join(C, 'pfb_factors.npy'), np.stack([side, thick, blue, dark], -1).astype(np.float16))
    # ---- fix 2
    rr = np.full((R, R), 9.0)
    for c in DISCS:
        rr = np.minimum(rr, np.hypot(pos[..., 0] - c[0], pos[..., 1] - c[1]))
    rearw = ss(0.10, 0.35, -nz)
    disc = rearw * thick * (1 - ss(RIM_OUT, RIM_OUT + RIM_SOFT, rr)) * (pos[..., 2] > -0.06)
    rim = ss(RIM_IN - RIM_SOFT, RIM_IN, rr)
    w2a = disc * (1 - rim); w2g = disc * rim
    # ---- fix 3: the glossy jagged strip of BODY geometry that crosses the back of the helmet dome
    dd = np.linalg.norm(pos - np.array([0.0, 0.834, 0.067]), axis=-1)
    w3 = ss(0.10, 0.35, -nz) * (1 - ss(0.050, 0.056, dd)) * ss(0.835, 0.845, pos[..., 1])
    # ---- ramps
    def lrange(w):
        sel = w > 0.5
        return np.percentile(L[sel], [2, 98]), int(sel.sum())
    (l1, h1), n1 = lrange(w1)
    (l2, h2), n2a = lrange(w2a)
    (l3, h3), n2g = lrange(w2g)
    arm1 = ramp((L - l1) / (h1 - l1), ARM)
    arm2 = ramp(0.30 + 0.30 * (L - l2) / (h2 - l2), ARM)     # compressed around mid: ghost star gone
    gold2 = ramp((L - l3) / (h3 - l3), GLD)
    out = src + w1[..., None] * (arm1 - src)
    out = out + w2a[..., None] * (arm2 - out)
    out = out + w2g[..., None] * (gold2 - out)
    (l4, h4), n3 = lrange(w3) if (w3 > 0.5).any() else ((0, 1), 0)
    arm3 = ramp(0.25 + 0.75 * (L - l4) / max(h4 - l4, 1e-3), ARM)     # top tone = #2d2b34
    out = out + w3[..., None] * (arm3 - out)
    print(f'fix3 strip behind helmet dome: texels w>0.5 {n3}, changed share {((w3 > 0) & cov).sum() / cov.sum():.5f}')
    out_u8 = np.clip(np.round(out * 255), 0, 255).astype(np.uint8)
    ch = np.any(out_u8 != src_u8, -1)
    ch1 = np.any(np.round((src + w1[..., None] * (arm1 - src)) * 255).astype(np.uint8) != src_u8, -1)
    print(f'fix1 limb blue->armour: texels w>0.5 {n1}, changed share of covered {(ch1 & cov).sum() / cov.sum():.4f}, L range {l1:.3f}..{h1:.3f}')
    print(f'fix2 shoulder discs rear: armour texels {n2a}, gold rim texels {n2g}, changed share {((w2a + w2g > 0) & cov).sum() / cov.sum():.4f}')
    print(f'total changed share of covered body texels {(ch & cov).sum() / cov.sum():.4f}')
    print('max |delta| on texels facing a sheet (|n_z| >= 0.6) and not rear disc faces:',
          int(np.abs(out_u8[(np.abs(nz) >= 0.6) & (disc == 0)].astype(int) - src_u8[(np.abs(nz) >= 0.6) & (disc == 0)].astype(int)).max()),
          '| on front-facing (n_z > 0.05) with |n_z|>=0.6:', int(np.abs(out_u8[nz >= 0.6].astype(int) - src_u8[nz >= 0.6].astype(int)).max()))
    for res in (2560, 2048):
        im = Image.fromarray(out_u8, 'RGB')
        if res != R:
            im = im.resize((res, res), Image.LANCZOS)
        fn = os.path.join(OUT, f'paintfix_body_{res}.webp')
        im.save(fn + '.tmp.webp', 'WEBP', quality=92, method=6)
        os.replace(fn + '.tmp.webp', fn)
        print(fn, os.path.getsize(fn) // 1024, 'KB')


if __name__ == '__main__':
    main()
