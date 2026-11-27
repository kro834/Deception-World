"""Pointwise colour-class fix of the helmet painting (rear dome -> armour ramp, red-brown horns/spikes ->
gold ramp). Every decision is per texel from (a) the smoothed object-space normal and position of the
surface point the texel maps to (rasterised from the welded mesh, so continuous across seams) and (b)
the texel's own colour. The new colour is a ramp lookup of the texel's own luminance. No atlas-space
neighbourhood operation touches colour (the only neighbourhood step is nearest-covered-texel padding of
the *geometry* rasters, so padding texels follow their own island's weights).

  rear   = ss(R0, R1, -n_z)                       0 exactly on anything facing front (n_z >= -R0)
  zone_a = 1 - ss(Z0, Z1, z)                      armour change only behind the visor plane
  mauve  = hue in [240,345] (soft), S < 0.62 (soft), not near-white          -> armour ramp
  brown  = hue in [345,360)u[0,22] (soft), S > 0.28                          -> gold ramp
  dome   = 1 - ss(0.050, 0.058, |pos - c|), c = (0, 0.834, 0.067) (fitted dome sphere, r 0.042); prot = 1 - dome
  w_arm  = rear * zone_a * dome * max(mauve, brown * (1 - copper))
  w_gold = rear * (dome * zone_a * brown * copper + prot * (1 - crystal))
           (copper = S > ~0.47 and V > ~0.35: the painted thin gold lines; crystal = saturated blue-violet)
Ramps (refs/palette.json, front sheet): armour #030304 -> #14141b -> #2d2b34, gold #643a1e -> #9b663d ->
#e3aa70, indexed by t = (L - Lp2) / (Lp98 - Lp2) with Lp* the luminance percentiles of the texels being
changed (so the painted band / lines / panels survive as tonal structure).
Outputs: out/paintfix_helmet_2560.webp, out/paintfix_helmet_2048.webp (Lanczos from 2560), q=92.
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
from mask_classify import hsv

C = os.path.join(B.HERE, 'cache'); OUT = os.path.join(B.HERE, 'out')
R0, R1 = -0.05, 0.30
Z0, Z1 = 0.075, 0.095
DOME_C = np.array([0.0, 0.834, 0.067]); DOME_R0, DOME_R1 = 0.050, 0.058   # least-squares sphere of the dome, r = 0.042
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


def main():
    g, prims = B.load_gltf('detail')
    p = [q for q in prims if B.SHORT.get(q['material']) == 'helmet'][0]
    src_u8 = np.asarray(Image.open(B.tex_path(g, 'detail', p['material'], 'base')).convert('RGB'))
    src = src_u8.astype(np.float64) / 255
    Rr = src.shape[0]
    d = np.load(os.path.join(C, 'geom_detail_helmet.npz'))
    cs = np.load(os.path.join(C, 'csig_helmet.npz'))
    vfront = cs['vf'].astype(np.float64)              # +Z ray from the vertex reaches the front camera
    attr = np.concatenate([p['pos'], d['toon'][d['inv']], vfront[d['inv']][:, None]], 1)
    geo, cov, _ = B.raster(p['uv'], p['idx'], attr, Rr)
    geo = B.fill_nearest(geo, cov)
    z = geo[..., 2]; nz = geo[..., 5] / np.maximum(np.linalg.norm(geo[..., 3:6], axis=-1), 1e-9)
    h, s, v = [x.reshape(Rr, Rr) for x in hsv(src.reshape(-1, 3))]
    rear = ss(R0, R1, -nz)
    zone = 1 - ss(Z0, Z1, z)
    mauve = ss(230, 245, h) * (1 - ss(340, 350, h)) * (1 - ss(0.55, 0.68, s)) * (1 - ss(0.8, 0.92, v) * (1 - ss(0.1, 0.2, s)))
    hb = np.where(h > 180, h - 360, h)                  # red-brown band around 0
    brown = ss(-18, -12, hb) * (1 - ss(18, 26, hb)) * ss(0.22, 0.32, s)
    # dome vs protrusions (horns, collar spikes): distance from the fitted dome sphere
    dist = np.linalg.norm(geo[..., 0:3] - DOME_C, axis=-1)
    prot = ss(DOME_R0, DOME_R1, dist)
    dome = 1 - prot
    copper = ss(0.42, 0.52, s) * ss(0.30, 0.40, v)          # the painted thin gold lines on the dome
    crystal = ss(195, 210, h) * (1 - ss(320, 335, h)) * ss(0.55, 0.7, s)
    # dome: mauve and the low-saturation red-brown panel -> armour; bright copper lines -> gold
    # round 2: the glossy grey band (low saturation, any hue) also goes into the ramp, and the up-facing
    # top of the dome behind the horn roots that the front camera cannot see (vfront = 0)
    ny = geo[..., 4] / np.maximum(np.linalg.norm(geo[..., 3:6], axis=-1), 1e-9)
    hidden = 1 - ss(0.0, 0.15, geo[..., 6])
    top = ss(0.30, 0.55, ny) * hidden * ss(0.86, 0.87, geo[..., 1])
    grey = (1 - ss(0.12, 0.22, s))
    region = np.maximum(rear, top)
    w_arm = region * zone * dome * np.maximum.reduce([mauve, brown * (1 - copper), grey])
    w_gold = rear * (dome * zone * brown * copper + prot * (1 - crystal))
    w_gold = w_gold * (1 - np.clip(w_arm, 0, 1) * (1 - rear))
    L = src @ np.array([0.299, 0.587, 0.114])
    def tmap(w):
        sel = w > 0.5
        lo, hi = np.percentile(L[sel], [2, 98])
        return (L - lo) / max(hi - lo, 1e-3), (lo, hi, int(sel.sum()))
    ta, ia = tmap(w_arm); tg, ig = tmap(w_gold)
    arm = ramp(ta, [hx(pal['black'][k]) for k in ('shadow', 'mid', 'light')])
    gold = ramp(tg, [hx(pal['gold'][k]) for k in ('shadow', 'mid', 'light')])
    out = src + w_arm[..., None] * (arm - src)
    out = out + w_gold[..., None] * (gold - out)
    out_u8 = np.clip(np.round(out * 255), 0, 255).astype(np.uint8)
    changed = np.any(out_u8 != src_u8, -1)
    front = (nz > -R0 + 1e-9) & (geo[..., 6] > 0.5)
    fv = (geo[..., 6] > 0.15) & (nz > -R0)
    print('max |delta| on front-facing texels the front camera can see (vfront>0.15, n_z>0.05):', int(np.abs(out_u8[fv].astype(int) - src_u8[fv].astype(int)).max()))
    print('armour ramp L range', np.round(ia[:2], 3), 'texels w>0.5', ia[2], '| gold ramp L range', np.round(ig[:2], 3), 'texels', ig[2])
    print('changed share of covered helmet texels %.4f (any channel differs)' % changed[cov].mean(),
          '| max |delta| on front-facing texels (n_z > 0.05) before encoding:', int(np.abs(out_u8[front].astype(int) - src_u8[front].astype(int)).max()))
    np.save(os.path.join(C, 'paintfix_helmet_w.npy'), np.stack([w_arm, w_gold], -1).astype(np.float16))
    for res in (2560, 2048):
        im = Image.fromarray(out_u8, 'RGB')
        if res != Rr:
            im = im.resize((res, res), Image.LANCZOS)
        fn = os.path.join(OUT, f'paintfix_helmet_{res}.webp')
        im.save(fn + '.tmp.webp', 'WEBP', quality=92, method=6)
        os.replace(fn + '.tmp.webp', fn)
        print(fn, os.path.getsize(fn) // 1024, 'KB')


if __name__ == '__main__':
    main()
