"""Stage 4 (linework): encode cache/lines_<short>_<res>.npy as lossless RGB WebP (R armour, G crystal,
B 0; linear data, glTF UV, flipY=false), write lines.json (same shape as the manifest's `maps`, keys
`lines` / `linesSpread`), stage in out/, then move atomically into work/model-v15/ (lines.json last).
linesSpread = spread in texels at the island-median texel density of that file (the field itself is
in world units: spread_m = 4 mm * unit; see linebake.py).
Usage: python deliver.py [--stage-only]
"""
import os, sys, json, shutil
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib_copy as B
import linebake as LB

OUT = os.path.join(LB.HERE, 'out')
DEST = os.path.normpath(os.path.join(LB.HERE, '..', '..', 'work', 'model-v15'))
PARTS = ['body', 'helmet', 'chest']          # buckle / clasp: mechanical parts, no line map
RES = {'standard': 1024, 'detail': 2048}
# island-median texel size in mm at 2048 (linebake log); 1024 is twice that
MM_PER_TEXEL_2048 = {'body': 0.855, 'helmet': 0.198, 'chest': 0.894}


def main():
    os.makedirs(OUT, exist_ok=True)
    man = {'version': 1, 'maps': {}}
    files = []
    for s in PARTS:
        mat = [k for k, v in B.SHORT.items() if v == s][0]
        ent = {}
        for mode, r in RES.items():
            a = np.load(os.path.join(LB.CACHE, f'lines_{s}_{r}.npy')).astype(np.float32)
            rgb = np.zeros((r, r, 3), np.uint8)
            rgb[..., :2] = np.clip(np.round(a * 255), 0, 255).astype(np.uint8)
            fn = f'lines_{s}_{r}.webp'
            Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, fn), 'WEBP', lossless=True, quality=100, method=6, exact=True)
            back = np.asarray(Image.open(os.path.join(OUT, fn)).convert('RGB'))
            assert np.array_equal(back, rgb), 'lossless round trip failed'
            spread_tex = LB.spread_m(s) * 1e3 / (MM_PER_TEXEL_2048[s] * 2048 / r)
            ent[mode] = {'lines': fn, 'linesSpread': round(float(spread_tex), 2)}
            files.append(fn)
            print(s, mode, fn, os.path.getsize(os.path.join(OUT, fn)) // 1024, 'KB  linesSpread', ent[mode]['linesSpread'])
        man['maps'][mat] = ent
    with open(os.path.join(OUT, 'lines.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
    if '--stage-only' in sys.argv:
        return
    for fn in files + ['lines.json']:            # lines.json last
        tmp = os.path.join(DEST, '.tmp-' + fn)
        shutil.copyfile(os.path.join(OUT, fn), tmp)
        os.replace(tmp, os.path.join(DEST, fn))
    print('delivered to', DEST)


if __name__ == '__main__':
    main()
