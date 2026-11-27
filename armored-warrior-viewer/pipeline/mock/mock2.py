"""Mock-up 2: flatten the painting, then cut its own painted light into 3 hard tones per paint class."""
import sys, os
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(__file__))
from mock import load, luma, sstep, grade, flatten, SP

def staircase(l, thresholds, levels, w):
    """Piecewise-constant remap of luminance with antialiased steps."""
    out = np.full_like(l, levels[0])
    for t, lo, hi in zip(thresholds, levels[:-1], levels[1:]):
        out = out + (hi - lo) * sstep(t - w, t + w, l)
    return out

def build(view, flat='bilateral', cut=1.0, shadow_k=0.0, out=None, levels_from_data=True, w=0.012):
    P = load('d1', view); G = load('d2', view); S = load('d3', view); Nn = load('d4', view)
    E = load('d5', view); base = load('base', view)
    mask = (Nn[..., 2] > 0.42) & (np.abs(Nn - base).sum(-1) > 0.02)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(bool)
    gold, lit, arm = G[..., 0], G[..., 1], G[..., 2]
    key, ao = S[..., 1], S[..., 2]
    blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)

    Pf = flatten(P, mask, flat)
    C = grade(Pf)
    l = luma(C)
    # The tone decision is taken on a slightly blurred luminance: smooth contours instead of noise.
    lb = blur(l, 1.3)
    classes = {
        'arm':  (arm,  [0.05, 0.14]),
        'gold': (gold, [0.25, 0.52]),
        'lit':  (lit,  [0.30, 0.62]),
    }
    result = C.copy()
    total = np.zeros_like(l)
    acc = np.zeros_like(C)
    for name, (gate, th) in classes.items():
        sel = mask & (gate > 0.6)
        if sel.sum() < 100:
            continue
        bins = [sel & (lb < th[0]), sel & (lb >= th[0]) & (lb < th[1]), sel & (lb >= th[1])]
        levels = [float(np.median(l[b])) if b.sum() > 50 else t for b, t in zip(bins, [th[0] * 0.5, (th[0] + th[1]) / 2, min(th[1] * 1.3, 0.95)])]
        q = staircase(lb, th, levels, w)
        # keep the painted hue: scale the colour to the tone's luminance
        cq = C * (q / np.maximum(l, 1e-4))[..., None]
        if name == 'lit':
            # the hot cores of orbs and stars stay as painted
            hot = sstep(0.82, 0.92, l)
            cq = cq * (1 - hot[..., None]) + C * hot[..., None]
        g = blur(gate, 1.0)
        acc += cq * g[..., None]; total += g
    wsum = np.clip(total, 0, 1)
    cel = acc / np.maximum(total, 1.0)[..., None] + C * (1 - wsum)[..., None]
    color = C + (cel - C) * cut
    if shadow_k > 0:
        key_s = blur(key, 1.6); ao_s = blur(ao, 2.0)
        t_sh = 0.50 + (1 - ao_s) * 0.2
        shadow = (1 - sstep(t_sh - w, t_sh + w, key_s)) * shadow_k
        e = np.clip(luma(E) * 1.4, 0, 1)
        shadow = shadow * (1 - 0.6 * e)
        color = color * (1 - shadow[..., None] * (1 - np.array([0.52, 0.50, 0.80])))
    color = np.clip(color, 0, 1)

    glow_src = color * np.clip(luma(E), 0, 1)[..., None] * mask[..., None]
    glow = cv2.GaussianBlur(glow_src, (0, 0), 7) * 0.35 + cv2.GaussianBlur(glow_src, (0, 0), 18) * 0.25
    m = mask.astype(np.float32)
    edge = m - cv2.erode(m, np.ones((3, 3), np.uint8))
    edge = cv2.GaussianBlur(edge, (0, 0), 0.5)
    ink = np.clip(edge * 1.1, 0, 1)
    comp = np.where(mask[..., None], color, base)
    comp = comp * (1 - ink[..., None]) + np.array([0.02, 0.02, 0.05]) * ink[..., None]
    comp = 1 - (1 - comp) * (1 - np.clip(glow, 0, 1))
    comp = np.clip(comp, 0, 1)
    if out:
        cv2.imwrite(out, (comp[..., ::-1] * 255 + 0.5).astype(np.uint8))
    return comp

if __name__ == '__main__':
    os.makedirs(f'{SP}/shots/mock/out2', exist_ok=True)
    views = sys.argv[1].split(',') if len(sys.argv) > 1 else ['front', 'chest', 'belt-rear', 'q34']
    for v in views:
        build(v, 'bilateral', 0.0, 0.0, out=f'{SP}/shots/mock/out2/{v}-a-flat.png')
        build(v, 'bilateral', 1.0, 0.0, out=f'{SP}/shots/mock/out2/{v}-b-flat-cut.png')
        build(v, 'bilateral2', 1.0, 0.0, out=f'{SP}/shots/mock/out2/{v}-c-flatter-cut.png')
        build(v, 'bilateral2', 1.0, 0.75, out=f'{SP}/shots/mock/out2/{v}-d-flatter-cut-shadow.png')
        build(v, 'bilateral2', 0.6, 0.75, out=f'{SP}/shots/mock/out2/{v}-e-flatter-halfcut-shadow.png')
        print('done', v)
