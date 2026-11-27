"""Image-space mock-ups of a decisive cel-tone treatment, built from the viewer's debug buffers.

Not a renderer: a quick way to see (and let the judge see) a direction before anyone builds it.
Inputs per view in shots/mock/: d1 paint, d2 gates (gold, lit, armour), d3 (shade, key, ao),
d4 smoothed view-space normal, d5 emissive, base = the current render without brush / sharpen / rim.
"""
import sys
import numpy as np
import cv2

SP = '/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad'


def load(d, view):
    im = cv2.imread(f'{SP}/shots/mock/{d}/{view}.png', cv2.IMREAD_COLOR)
    return im[..., ::-1].astype(np.float32) / 255.0


def luma(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def grade(p, black=0.1, white=0.84, sat=1.6):
    l = luma(p)
    lg = np.clip((l - black) / (white - black), 0, None)
    c = p * (lg / np.maximum(l, 1e-4))[..., None]
    g = luma(c)[..., None]
    c = np.maximum(g + (c - g) * sat, 0)
    top = c.max(-1)
    knee = 0.8
    over = top > knee
    t = np.clip((top - knee) / (1.6 - knee), 0, 1)
    rolled = knee + (1 - knee) * (1 - (1 - t) ** 2.0)
    scale = np.where(over, rolled / np.maximum(top, 1e-4), 1.0)
    return np.clip(c * scale[..., None], 0, 1)


def flatten(p, mask, mode):
    """Edge-preserving flattening of the paint inside the figure."""
    if mode == 'none':
        return p
    u8 = np.clip(p * 255, 0, 255).astype(np.uint8)[..., ::-1].copy()
    if mode == 'bilateral':
        out = u8
        for _ in range(3):
            out = cv2.bilateralFilter(out, d=9, sigmaColor=26, sigmaSpace=4)
    elif mode == 'bilateral2':
        out = u8
        for _ in range(5):
            out = cv2.bilateralFilter(out, d=11, sigmaColor=34, sigmaSpace=5)
    elif mode == 'meanshift':
        out = cv2.pyrMeanShiftFiltering(u8, sp=7, sr=22, maxLevel=0)
    elif mode == 'epf':
        out = cv2.edgePreservingFilter(u8, flags=cv2.RECURS_FILTER, sigma_s=24, sigma_r=0.22)
    else:
        raise ValueError(mode)
    f = out[..., ::-1].astype(np.float32) / 255.0
    return np.where(mask[..., None], f, p)


def build(view, flat='none', tones=True, armour_clip=0.7, out=None, strength=1.0):
    P = load('d1', view)
    G = load('d2', view)
    S = load('d3', view)
    Nn = load('d4', view)
    E = load('d5', view)
    base = load('base', view)
    mask = (Nn[..., 2] > 0.42) & (np.abs(Nn - base).sum(-1) > 0.02)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(bool)

    gold, lit, arm = G[..., 0], G[..., 1], G[..., 2]
    key, ao = S[..., 1], S[..., 2]
    n = Nn * 2 - 1
    nz = np.sqrt(np.clip(1 - n[..., 0] ** 2 - n[..., 1] ** 2, 0, 1))
    N = np.dstack([n[..., 0], n[..., 1], nz])
    L = np.array([-0.46, 0.6, 0.66]); L = L / np.linalg.norm(L)
    H = L + np.array([0, 0, 1.0]); H = H / np.linalg.norm(H)
    ndh = (N * H).sum(-1)

    Pf = flatten(P, mask, flat)
    C = grade(Pf)
    if not tones:
        color = C
    else:
        # Smooth the gates and the light terms a little so the tone edges are clean lines, not noise.
        blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
        gold_s, lit_s, arm_s = blur(gold, 1.2), blur(lit, 1.2), blur(arm, 1.2)
        key_s = blur(key, 1.6)
        ndh_s = blur(ndh, 1.2)
        ao_s = blur(ao, 2.0)
        w = 0.012  # half-width of a tone edge on the half-lambert scale: hard, antialiased
        t_sh = 0.47 + (1 - ao_s) * 0.22
        shadow = 1 - sstep(t_sh - w, t_sh + w, key_s)
        light = sstep(0.80 - w, 0.80 + w, key_s)

        # Armour: painted grey gloss is clipped down, then two rendered planes and a small crisp glint.
        l = luma(C)
        clip_to = 0.085
        Ca = C * (np.minimum(l, clip_to + (l - clip_to) * (1 - armour_clip)) / np.maximum(l, 1e-4))[..., None]
        a_col = Ca * (1 - 0.6 * shadow)[..., None] + light[..., None] * np.array([0.060, 0.062, 0.095])
        glint_a = sstep(0.955, 0.965, ndh_s)
        a_col = a_col + glint_a[..., None] * np.array([0.34, 0.38, 0.55])

        # Gold: shadow, body, light band; one hard highlight band.
        g_col = C * (1 - shadow[..., None] * (1 - np.array([0.50, 0.40, 0.46])))
        g_col = g_col * (1 + 0.16 * light[..., None]) + light[..., None] * 0.02
        glint_g = sstep(0.93, 0.945, ndh_s)
        g_col = g_col + glint_g[..., None] * np.array([0.30, 0.24, 0.12])

        # Crystal: shadow (deeper, bluer), body, light (towards white); glowing cores are spared.
        e = np.clip(luma(E) * 1.4, 0, 1)
        c_sh = shadow * (1 - 0.55 * e)
        c_col = C * (1 - c_sh[..., None] * (1 - np.array([0.55, 0.56, 0.86])))
        c_light = sstep(0.86 - w, 0.86 + w, key_s)
        c_col = c_col + c_light[..., None] * (1 - c_col) * 0.28

        # Anything else (silver device parts, unlit pinks): a plain two-tone shade.
        o_col = C * (1 - shadow[..., None] * (1 - np.array([0.62, 0.60, 0.78])))

        wsum = np.clip(gold_s + lit_s + arm_s, 0, 1)
        color = (g_col * gold_s[..., None] + c_col * lit_s[..., None] + a_col * arm_s[..., None]) \
            + o_col * (1 - wsum)[..., None]
        norm = np.maximum(gold_s + lit_s + arm_s, 1.0)[..., None]
        color = (g_col * gold_s[..., None] + c_col * lit_s[..., None] + a_col * arm_s[..., None]) / norm \
            + o_col * (1 - wsum)[..., None]
        color = C + (color - C) * strength
    color = np.clip(color, 0, 1)

    # Glow: hue-preserving bloom of the emissive paint.
    glow_src = color * np.clip(luma(E), 0, 1)[..., None] * mask[..., None]
    glow = cv2.GaussianBlur(glow_src, (0, 0), 7) * 0.35 + cv2.GaussianBlur(glow_src, (0, 0), 18) * 0.25
    # Ink: the silhouette and strong normal breaks.
    m = mask.astype(np.float32)
    edge = cv2.dilate(m, np.ones((3, 3), np.uint8)) - cv2.erode(m, np.ones((3, 3), np.uint8))
    edge = cv2.GaussianBlur(edge, (0, 0), 0.6)
    gx = cv2.Sobel(N, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(N, cv2.CV_32F, 0, 1, ksize=3)
    crease = np.sqrt((gx ** 2 + gy ** 2).sum(-1))
    crease = sstep(1.6, 2.6, crease) * m
    crease = cv2.GaussianBlur(crease, (0, 0), 0.5)
    ink = np.clip(edge * 1.2 + crease * 0.9, 0, 1)

    comp = np.where(mask[..., None], color, base)
    comp = comp * (1 - ink[..., None]) + np.array([0.02, 0.02, 0.05]) * ink[..., None]
    comp = 1 - (1 - comp) * (1 - np.clip(glow, 0, 1))
    comp = np.clip(comp, 0, 1)
    if out:
        cv2.imwrite(out, (comp[..., ::-1] * 255 + 0.5).astype(np.uint8))
    return comp


if __name__ == '__main__':
    import os
    os.makedirs(f'{SP}/shots/mock/out', exist_ok=True)
    views = sys.argv[1].split(',') if len(sys.argv) > 1 else ['front', 'chest', 'belt-rear', 'q34']
    for v in views:
        build(v, 'none', False, out=f'{SP}/shots/mock/out/{v}-0-graded.png')
        build(v, 'none', True, out=f'{SP}/shots/mock/out/{v}-1-tones.png')
        build(v, 'bilateral', True, out=f'{SP}/shots/mock/out/{v}-2-flat-tones.png')
        build(v, 'bilateral2', True, out=f'{SP}/shots/mock/out/{v}-3-flatter-tones.png')
        build(v, 'meanshift', True, out=f'{SP}/shots/mock/out/{v}-4-meanshift-tones.png')
        print('done', v)
