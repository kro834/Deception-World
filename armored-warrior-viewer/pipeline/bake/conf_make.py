"""conf stage B: combine reliability signals on the welded detail mesh (all smoothing along the surface,
cotangent heat diffusion), write cache/conf_<short>.npz and out/conf_<short>_1024.webp (L, linear).

  proj  = ss(P0, P1, vis)                 vis = |n_smooth.z| where the +Z/-Z ray to the camera is free
  sharp = ss(H0, H1, hf_s * sqrt(dens))   texture detail per world length (stretched texels lose detail)
  streak= ss(K0, K1, coh_s)               directional smear (all gradients parallel)
  conf  = proj * (1 - 0.6 * streak * sharp * (1 - ss(.75,.95,vis))) * (0.6 + 0.4 * ss(0.15, 0.5, ao)),
          smoothed on the mesh (R_SIG) and remapped ss(0.2, 0.7).
Usage: python conf_make.py [only,list]
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B

C = os.path.join(B.HERE, 'cache'); OUT = os.path.join(B.HERE, 'out')
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None
mm = 1e-3
P0, P1 = 0.25, 0.6
H0, H1 = 0.012, 0.035
K0, K1 = 0.55, 0.85
R_SIG = {'body': 6 * mm, 'helmet': 2.5 * mm, 'chest': 2 * mm, 'buckle': 1.5 * mm, 'clasp': 2 * mm}
RES = 1024


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    g, prims = B.load_gltf('detail')
    man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
    for p in prims:
        if p['material'] not in B.TEXTURED:
            continue
        s = B.SHORT[p['material']]
        if ONLY and s not in ONLY:
            continue
        d = np.load(os.path.join(C, f'geom_detail_{s}.npz')); c = np.load(os.path.join(C, f'csig_{s}.npz'))
        Lc, Mc = B.laplacian_cot(d['P'], d['F'])
        D = lambda X, r: B.diffuse_m(Lc, Mc, X, r * r / 2)
        r = R_SIG[s]
        X = np.stack([c['vis'], c['hf'] * np.sqrt(np.clip(c['dens'], 0.1, 4)), c['coh'], c['ao']], 1)
        Xs = D(X, r)
        proj = ss(P0, P1, Xs[:, 0])
        sharp = ss(H0, H1, Xs[:, 1])
        streak = ss(K0, K1, Xs[:, 2])
        # uniform paint (flat black armour) is not smear, so low detail alone is not penalised; streakiness
        # counts only where there is structure to streak and the surface is already oblique to the axis
        streak_eff = streak * sharp * (1 - ss(0.75, 0.95, Xs[:, 0]))
        conf = proj * (1 - 0.6 * streak_eff) * (0.6 + 0.4 * ss(0.15, 0.5, Xs[:, 3]))
        conf = D(conf[:, None], r)[:, 0]
        conf = ss(0.2, 0.7, conf)
        np.savez_compressed(os.path.join(C, f'conf_{s}.npz'), conf=conf, proj=proj, sharp=sharp, streak=streak)
        img, mask, _ = B.raster(p['uv'], p['idx'], conf[d['inv']], RES)
        img = B.fill_nearest(img, mask)[..., 0]
        fn = f'conf_{s}_{RES}.webp'
        tmp = os.path.join(OUT, fn + '.tmp.webp')
        Image.fromarray(np.clip(np.round(img * 255), 0, 255).astype(np.uint8), 'L').save(tmp, 'WEBP', lossless=True, method=6)
        os.replace(tmp, os.path.join(OUT, fn))
        for mode in ('standard', 'detail'):
            man['maps'][p['material']][mode]['conf'] = fn
        va = np.zeros(len(d['P']))
        print(s, 'conf<0.5 surface share %.3f' % (conf < 0.5).mean(), '%d KB' % (os.path.getsize(os.path.join(OUT, fn)) // 1024), flush=True)
    tmp = os.path.join(OUT, 'manifest.json.tmp')
    json.dump(man, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    os.replace(tmp, os.path.join(OUT, 'manifest.json'))


if __name__ == '__main__':
    main()
