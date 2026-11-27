"""Provisional class masks + synthetic line maps, ONLY to exercise the viewer's mask / lines code
paths before the real maps arrive (pipeline/lookdev/devsite/). Not a deliverable."""
import json, sys
import numpy as np, cv2
from PIL import Image
T = 'pipeline/lookdev/tex/'
OUT = 'pipeline/lookdev/devsite/model-v15/'
SIZE, SPREAD = 1024, 8.0

def hsv(a):
    mx = a.max(2); mn = a.min(2); d = np.maximum(mx - mn, 1e-6)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx

def clean(mask, small=120):
    m = cv2.medianBlur(mask.astype(np.uint8) * 255, 7) > 127
    for keep in (True, False):                       # drop small islands, then fill small holes
        n, lab, stats, _ = cv2.connectedComponentsWithStats((m == keep).astype(np.uint8), connectivity=4)
        tiny = np.isin(lab, np.where(stats[:, cv2.CC_STAT_AREA] < small)[0]) & (m == keep)
        m[tiny] = not keep
    return m

def sdf(mask):
    inside = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    outside = cv2.distanceTransform((~mask).astype(np.uint8), cv2.DIST_L2, 5)
    return np.clip(0.5 + (inside - outside) / (2 * SPREAD), 0, 1)

def build(name, base, emis):
    a = np.asarray(Image.open(T + base).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255
    e = np.asarray(Image.open(T + emis).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255
    h, s, v = hsv(a)
    crystal = (e.max(2) > 0.17) | ((h > 0.555) & (h < 0.98) & (s > 0.34) & (v > 0.32))
    gold = (h > 0.025) & (h < 0.165) & (s > 0.19) & (v > 0.19) & ~crystal
    crystal = clean(crystal); gold = clean(gold & ~crystal)
    hh = np.where(h < 0.2, h + 1, h)
    grad = np.clip((hh - 0.6) / 0.33, 0, 1) * crystal
    w = cv2.GaussianBlur(crystal.astype(np.float32), (0, 0), 9) + 1e-4
    grad = np.clip(cv2.GaussianBlur(grad.astype(np.float32), (0, 0), 9) / w, 0, 1)
    rgba = np.dstack([sdf(gold), sdf(crystal), np.zeros_like(grad), grad])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + f'devmask_{name}.png')
    # synthetic lines: R = diamond scale grid on armour areas, G = diagonal facets
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    def grid(period, angle):
        c, s_ = np.cos(angle), np.sin(angle)
        u = (xs * c + ys * s_) % period
        return np.minimum(u, period - u)
    dr = np.minimum(grid(22, 0.9), grid(22, -0.9)); dg = grid(46, 0.5)
    lines = np.dstack([np.clip(1 - dr / 4.0, 0, 1), np.clip(1 - dg / 4.0, 0, 1), np.zeros_like(dr)])
    Image.fromarray((lines * 255 + 0.5).astype(np.uint8), 'RGB').save(OUT + f'devlines_{name}.png')
    print(name, 'gold %.3f crystal %.3f' % (gold.mean(), crystal.mean()))

build('body', 'std_02.jpg', 'std_00.png')
build('helmet', 'std_17.jpg', 'std_18.png')
man = json.load(open('work/model-v15/manifest.json'))
lines = {'version': 1, 'maps': {}}
for mat, key in [('Armored Warrior · merged PBR', 'body'), ('tripo_material_1b072094-c364-4f28-972a-07e61327bf9a', 'helmet')]:
    for mode in ('standard', 'detail'):
        man['maps'][mat][mode].update({'mask': f'devmask_{key}.png', 'maskSpread': SPREAD})
        lines['maps'].setdefault(mat, {})[mode] = {'lines': f'devlines_{key}.png', 'linesSpread': 4.0}
json.dump(man, open(OUT + 'manifest.json', 'w'), ensure_ascii=False, indent=1)
if '--lines' in sys.argv: json.dump(lines, open(OUT + 'lines.json', 'w'), ensure_ascii=False, indent=1)
