"""Repaired painting ('paint', sRGB, 2048^2, both modes).

paint = orig * w + repl * (1 - w),  w = ss(W0, W1, conf)   (conf >= W1 -> original untouched)
orig : detail base colour (2560^2) resampled to 2048 with Lanczos, no other processing
repl : flat sheet-language paint from the class mask + gradient channel (all per texel, every input is
       rasterised from the welded mesh, so nothing crosses UV islands):
       armour  near-black mid #14141b, light #2d2b34 on up-facing / key-facing form, shadow #030304 in AO
       gold    three hard bands shadow/mid/light (#643a1e/#9b663d/#e3aa70) by key light on the smoothed
               toon normal -> banded anime metal following the form
       crystal mid blue #3159c8 -> violet #c077ec -> pink #f07cbf along the mask A gradient, lifted slightly
               on key-facing form
       device  original kept (w forced to 1)
All colours from refs/palette.json (front sheet). Class edges are antialiased from the distance fields.
Usage: python paint.py [only,list]
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache'); OUT = os.path.join(B.HERE, 'out')
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None
R = 2048
W0, W1 = 0.25, 0.7
MAXREPL = 0.65   # never replace more than this: keeps the painting's own structure under the clean colour
pal = json.load(open(os.path.join(B.HERE, '..', '..', 'refs', 'palette.json')))['front.png']


def hx(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


KEY = np.array([0.3, 0.7, 0.65]); KEY /= np.linalg.norm(KEY)


def main():
    g, prims = B.load_gltf('detail')
    man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        if ONLY and s not in ONLY:
            continue
        e = man['maps'][p['material']]['detail']
        orig = np.asarray(Image.open(B.tex_path(g, 'detail', p['material'], 'base')).convert('RGB').resize((R, R), Image.LANCZOS), np.float32) / 255
        mk = np.asarray(Image.open(os.path.join(OUT, e['mask'])).convert('RGBA'), np.float32) / 255
        tn = np.asarray(Image.open(os.path.join(OUT, e['toonNormal'])).convert('RGB'), np.float32) / 255 * 2 - 1
        st = np.asarray(Image.open(os.path.join(OUT, e['style'])).convert('RGB'), np.float32) / 255
        d = np.load(os.path.join(C, f'geom_detail_{s}.npz'))
        conf = np.load(os.path.join(C, f'conf_{s}.npz'))['conf'][d['inv']]
        cimg, cm, _ = B.raster(p['uv'], p['idx'], conf, R)
        conf = B.fill_nearest(cimg, cm)[..., 0]
        aa = 0.5 / (2 * e['maskSpread'])            # ~ half a texel of antialiasing
        cls = ss(0.5 - aa, 0.5 + aa, mk[..., :3])
        grad = mk[..., 3]
        lam = np.einsum('ijk,k->ij', tn / np.maximum(np.linalg.norm(tn, axis=-1, keepdims=True), 1e-6), KEY)
        ao = st[..., 0]
        A = pal['black']; Gd = pal['gold']
        arm = hx(A['mid']) + (hx(A['light']) - hx(A['mid'])) * ss(0.55, 0.65, lam)[..., None]
        arm = arm + (hx(A['shadow']) - arm) * (1 - ss(0.35, 0.6, ao))[..., None]
        gold = hx(Gd['shadow']) + (hx(Gd['mid']) - hx(Gd['shadow'])) * ss(0.12, 0.18, lam)[..., None]
        gold = gold + (hx(Gd['light']) - gold) * ss(0.62, 0.68, lam)[..., None]
        t = grad[..., None]
        bl, vi, pk = hx(pal['blue']['mid']), hx(pal['violet']['mid']), hx(pal['pink']['mid'])
        crys = np.where(t < 0.5, bl + (vi - bl) * (2 * t), vi + (pk - vi) * (2 * t - 1))
        crys = crys * (0.85 + 0.25 * ss(0.3, 0.8, lam))[..., None]
        repl = arm
        repl = repl + (crys - repl) * cls[..., 1:2]
        repl = repl + (gold - repl) * cls[..., 0:1]
        w = 1 - MAXREPL * (1 - ss(W0, W1, conf))
        w = np.maximum(w, cls[..., 2])               # device paint is never replaced
        out = orig * w[..., None] + repl * (1 - w[..., None])
        u8 = np.clip(np.round(out * 255), 0, 255).astype(np.uint8)
        fn = f'paint_{s}_{R}.webp'
        tmp = os.path.join(OUT, fn + '.tmp.webp')
        Image.fromarray(u8, 'RGB').save(tmp, 'WEBP', quality=92, method=6)
        os.replace(tmp, os.path.join(OUT, fn))
        for mode in ('standard', 'detail'):
            man['maps'][p['material']][mode]['paint'] = fn
        print(s, 'replaced (w<0.5) share of covered texels %.3f' % (w[cm] < 0.5).mean(),
              'untouched (w=1) %.3f' % (w[cm] >= 0.999).mean(), '%d KB' % (os.path.getsize(os.path.join(OUT, fn)) // 1024), flush=True)
    tmp = os.path.join(OUT, 'manifest.json.tmp')
    json.dump(man, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    os.replace(tmp, os.path.join(OUT, 'manifest.json'))


if __name__ == '__main__':
    main()
