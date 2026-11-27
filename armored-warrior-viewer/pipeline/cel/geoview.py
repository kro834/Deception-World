"""Debug: rear geometry view with a 2 cm world grid (x red, y green) and the paintcel2 colour dimmed."""
import sys, os, numpy as np
from PIL import Image
sys.path.insert(0, '../lines'); import bakelib_copy as B
az, cx, cy, cz, half, name = float(sys.argv[1]), *map(float, sys.argv[2:6]), sys.argv[6]
tex = sys.argv[7] if len(sys.argv) > 7 else 'out/paintcel2_body_2560.webp'
g, prims = B.load_gltf('detail')
T = np.asarray(Image.open(tex).convert('RGB'), np.float32) / 255
res = 900
bm, bt, bb, _ = B.render_ortho([(p['pos'], p['idx']) for p in prims], az, 90, res, np.array([cx, cy, cz]), half)
img = np.zeros((res, res, 3)) + 0.1
for mi, p in enumerate(prims):
    m = bm == mi
    if not m.any(): continue
    F = p['idx'][bt[m]]; X = (p['pos'][F] * bb[m][..., None]).sum(1)
    if p['material'] == B.TEXTURED[0]:
        uv = (p['uv'][F] * bb[m][..., None]).sum(1); c = B.sample_bilinear(T, uv)
    else:
        c = np.zeros((m.sum(), 3)) + 0.3
    gx = np.abs(((X[:, 0] + 0.01) % 0.02) - 0.01) < 0.0007
    gy = np.abs(((X[:, 1] + 0.01) % 0.02) - 0.01) < 0.0007
    c = c * 0.8
    c[gx] = [1, 0.2, 0.2]; c[gy] = [0.2, 1, 0.2]
    c[np.abs(X[:, 0]) < 0.0012] = [1, 1, 1]
    c[(np.abs(((X[:, 1] + 0.05) % 0.1) - 0.05) < 0.0012)] = [1, 1, 0]
    img[m] = c
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(f'proofs/{name}.png'); print(name)
