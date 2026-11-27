"""Stage 3: rasterise per-vertex signals into UV space and write the delivered maps.

Source of all signals: the *detail* mesh (standard and detail share the same UV layout, verified by
check_uv.py), so both quality modes get identical shading patterns. Standard maps are the 2048 bake
box-downsampled (coverage-weighted) to 1024.

style      R = AO, G = curvature (0.5 flat), B = ink (see ink.py; 0 if not produced)
toonNormal rgb = n*0.5+0.5, object space of the mesh node (nodes have no rotation, uniform scale)
Every uncovered texel is filled with the nearest covered value (no background bleed at any mip).
Writes to out/ (staging); deliver.py copies atomically to work/model-v15/.
Usage: python compose.py [ink]
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache')
OUT = os.path.join(B.HERE, 'out'); os.makedirs(OUT, exist_ok=True)
SRC = 'detail'
RES = {'detail': 2048, 'standard': 1024}
CURV_REF = 0.16      # G = 0.5 + 0.5*tanh(curv / CURV_REF)
CURV_DEAD = 0.06     # |curv| below this is treated as flat (removes residual surface noise)
USE_INK = 'ink' in sys.argv[1:]


def curv_to_g(c, short=None):
    c = np.sign(c) * np.maximum(np.abs(c) - CURV_DEAD, 0)
    return 0.5 + 0.5 * np.tanh(c / CURV_REF)


def down2(img, mask):
    """coverage-weighted 2x2 box downsample"""
    m = mask.astype(np.float32)[..., None]
    H, W = mask.shape
    s = (img * m).reshape(H // 2, 2, W // 2, 2, -1).sum((1, 3))
    w = m.reshape(H // 2, 2, W // 2, 2, 1).sum((1, 3))
    return s / np.maximum(w, 1e-6), w[..., 0] > 0


def save_webp_lossless(arr_u8, path):
    tmp = path + '.tmp.webp'
    Image.fromarray(arr_u8, 'RGB').save(tmp, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    os.replace(tmp, path)


def main():
    g, prims = B.load_gltf(SRC)
    manifest = {'version': 1, 'maps': {}}
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        d = np.load(os.path.join(C, f'geom_{SRC}_{s}.npz'))
        ao = np.load(os.path.join(C, f'ao_{SRC}_{s}.npz'))['ao']
        inv = d['inv']
        G = curv_to_g(d['curv'], s)
        attr = np.concatenate([ao[:, None], G[:, None], d['toon']], 1)[inv]   # per glTF vertex
        img, mask, _ = B.raster(p['uv'], p['idx'], attr, RES['detail'])
        ink = None
        if USE_INK:
            ip = os.path.join(C, f'ink_{s}_{RES["detail"]}.npy')
            if os.path.exists(ip):
                ink = np.load(ip).astype(np.float32)
        levels = {'detail': (img, mask)}
        levels['standard'] = down2(img, mask)
        if ink is not None:
            iks = ink.reshape(RES['standard'], 2, RES['standard'], 2).mean((1, 3))
        entry = {}
        for mode in ('standard', 'detail'):
            im, mk = levels[mode]
            im = B.fill_nearest(im, mk)
            r = RES[mode]
            style = np.zeros((r, r, 3), np.float32)
            style[..., 0] = np.clip(im[..., 0], 0, 1)
            style[..., 1] = np.clip(im[..., 1], 0, 1)
            if ink is not None:
                style[..., 2] = ink if mode == 'detail' else iks
            n = B.normalize(im[..., 2:5].astype(np.float64))
            tn = np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
            st = np.clip(np.round(style * 255), 0, 255).astype(np.uint8)
            fs, fn = f'style_{s}_{r}.webp', f'toonnormal_{s}_{r}.webp'
            save_webp_lossless(st, os.path.join(OUT, fs))
            save_webp_lossless(tn, os.path.join(OUT, fn))
            np.save(os.path.join(C, f'mask_{s}_{r}.npy'), mk)
            entry[mode] = {'style': fs, 'toonNormal': fn}
            print(s, mode, r, 'coverage %.3f' % mk.mean(),
                  'style %d KB' % (os.path.getsize(os.path.join(OUT, fs)) // 1024),
                  'toon %d KB' % (os.path.getsize(os.path.join(OUT, fn)) // 1024), flush=True)
        manifest['maps'][p['material']] = entry
    with open(os.path.join(OUT, 'manifest.json.tmp'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    os.replace(os.path.join(OUT, 'manifest.json.tmp'), os.path.join(OUT, 'manifest.json'))


if __name__ == '__main__':
    main()
