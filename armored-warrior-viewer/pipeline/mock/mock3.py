"""Mock-up 3: flatten, then a cleaned 3-tone cut of the painted light (median-filtered tone index,
histogram-valley thresholds, fine dark lines and hot cores kept)."""
import sys, os
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(__file__))
from mock import load, luma, sstep, grade, flatten, SP

def valleys(values, lo, hi, default):
    """Two thresholds at the deepest valleys of the class's luminance histogram (smoothed); falls back to defaults."""
    h, edges = np.histogram(values, bins=96, range=(lo, hi))
    h = cv2.GaussianBlur(h.astype(np.float32)[None, :], (0, 0), 2.5)[0]
    centers = (edges[:-1] + edges[1:]) / 2
    out = []
    for d in default:
        window = (centers > d - 0.07 * (hi - lo) * 2) & (centers < d + 0.07 * (hi - lo) * 2)
        if window.sum() < 3:
            out.append(d); continue
        idx = np.where(window)[0]
        out.append(float(centers[idx[np.argmin(h[idx])]]))
    return out

def build(view, flat='bilateral', cut=1.0, out=None):
    P = load('d1', view); G = load('d2', view); Nn = load('d4', view)
    E = load('d5', view); base = load('base', view)
    mask = (Nn[..., 2] > 0.42) & (np.abs(Nn - base).sum(-1) > 0.02)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(bool)
    gold, lit, arm = G[..., 0], G[..., 1], G[..., 2]
    blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)

    Pf = flatten(P, mask, flat)
    C = grade(Pf)
    l = luma(C)
    lb = blur(l, 2.0)
    fine_dark = np.minimum(l - blur(l, 3.0), 0)            # thin painted lines (darker than their surroundings)
    classes = {'arm': (arm, (0.0, 0.4), [0.05, 0.14]), 'gold': (gold, (0.0, 1.0), [0.27, 0.52]), 'lit': (lit, (0.0, 1.0), [0.30, 0.60])}
    acc = np.zeros_like(C); total = np.zeros_like(l)
    for name, (gate, rng, default) in classes.items():
        sel = mask & (gate > 0.6)
        if sel.sum() < 200:
            continue
        th = valleys(lb[sel], rng[0], rng[1], default)
        idx = (lb >= th[0]).astype(np.uint8) + (lb >= th[1]).astype(np.uint8)
        idx = cv2.medianBlur(idx, 7)                         # no specks, no tiny islands
        idx = cv2.medianBlur(idx, 5)
        levels = []
        for k in range(3):
            b = sel & (idx == k)
            levels.append(float(np.median(l[b])) if b.sum() > 50 else [th[0] * 0.5, (th[0] + th[1]) / 2, min(th[1] * 1.3, 0.95)][k])
        soft = blur(idx.astype(np.float32), 0.8)             # antialiased steps
        q = np.interp(soft, [0, 1, 2], levels).astype(np.float32)
        # tone regions get an even colour: chroma from a wider smooth of the flattened paint
        chroma = blur(C, 2.5) / np.maximum(luma(blur(C, 2.5)), 1e-4)[..., None]
        cq = chroma * (q + fine_dark * 0.9)[..., None]
        if name == 'lit':
            hot = sstep(0.80, 0.90, luma(grade(P)))
            cq = cq * (1 - hot[..., None]) + grade(P) * hot[..., None]
        g = blur(gate, 1.0)
        acc += cq * g[..., None]; total += g
    wsum = np.clip(total, 0, 1)
    cel = acc / np.maximum(total, 1.0)[..., None] + C * (1 - wsum)[..., None]
    color = np.clip(C + (cel - C) * cut, 0, 1)

    glow_src = color * np.clip(luma(E), 0, 1)[..., None] * mask[..., None]
    glow = cv2.GaussianBlur(glow_src, (0, 0), 7) * 0.35 + cv2.GaussianBlur(glow_src, (0, 0), 18) * 0.25
    m = mask.astype(np.float32)
    edge = cv2.GaussianBlur(m - cv2.erode(m, np.ones((3, 3), np.uint8)), (0, 0), 0.5)
    comp = np.where(mask[..., None], color, base)
    comp = comp * (1 - edge[..., None]) + np.array([0.02, 0.02, 0.05]) * edge[..., None]
    comp = np.clip(1 - (1 - comp) * (1 - np.clip(glow, 0, 1)), 0, 1)
    if out:
        cv2.imwrite(out, (comp[..., ::-1] * 255 + 0.5).astype(np.uint8))
    return comp

if __name__ == '__main__':
    os.makedirs(f'{SP}/shots/mock/probe', exist_ok=True)
    for v in ['front', 'chest', 'belt-rear', 'q34']:
        build(v, 'bilateral', 0.0, out=f'{SP}/shots/mock/probe/P1-{v}.png')
        build(v, 'bilateral', 1.0, out=f'{SP}/shots/mock/probe/P2-{v}.png')
        build(v, 'bilateral', 0.55, out=f'{SP}/shots/mock/probe/P3-{v}.png')
        print('done', v)
