"""Cel-paint the Blender light-rig passes into matcaps (lighting agent).

Run:  $SP/venv/bin/python pipeline/light/paint.py [outdir]     (default: pipeline/light/out/matcaps)

Reads pipeline/light/out/passes/*.exr (rendered by rig.py), works at 1024², paints hard-edged tone
bands with analytic antialiasing (soft step of width = 1 px of the field's own gradient), then
area-downsamples to 512² and writes lossless sRGB webp. Outside the sphere silhouette every pass is
filled with its nearest valid value, so grazing / normal-mapped lookups never hit an empty corner.
Matcap convention: pixel (u, v) <-> view normal xy = (2u-1, 2v-1), image top = +Y.
"""
import json
import os
import sys

import bpy  # only to read the float EXR passes
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
PASSES = os.path.join(HERE, 'out', 'passes')
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'matcaps')
N = 1024
SPEC = json.load(open(os.path.join(HERE, 'rig_spec.json')))

yy, xx = np.mgrid[0:N, 0:N]
X = (xx + 0.5) / N * 2 - 1
Y = 1 - (yy + 0.5) / N * 2
R = np.sqrt(X * X + Y * Y)
Z = np.sqrt(np.clip(1 - R * R, 0, 1))


def load(name, valid_r=0.982):
    im = bpy.data.images.load(os.path.join(PASSES, name + '.exr'))
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1].copy()  # top row first
    bpy.data.images.remove(im)
    # Radial clamp: beyond valid_r every pixel takes the value on the circle of radius valid_r along
    # the same direction (what a normal at that azimuth, just inside the rim, would see). Keeps the
    # silhouette's antialiased fringe out of the matcap and fills the corners consistently.
    # (The faceted sphere's polygonal silhouette leaves holes inside the circle: nearest-fill those first.)
    hole = a[..., 3] < 0.999
    idx = ndimage.distance_transform_edt(hole, return_distances=False, return_indices=True)
    a = a[idx[0], idx[1]]
    k = np.minimum(1.0, valid_r / np.maximum(R, 1e-6))
    col = (X * k + 1) / 2 * N - 0.5
    row = (1 - Y * k) / 2 * N - 0.5
    out = np.stack([ndimage.map_coordinates(a[..., c], [row, col], order=1, mode='nearest') for c in range(3)], -1)
    return out.astype(np.float32)


def lum(a):
    return a @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def norm(a, q=99.7):
    return a / max(1e-6, np.percentile(a, q))


def hexs(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def step_aa(f, c, px=1.0):
    """Antialiased hard step of field f at level c (edge width ~px pixels)."""
    gy, gx = np.gradient(f)
    g = np.sqrt(gx * gx + gy * gy) * px + 1e-5
    return np.clip((f - c) / g + 0.5, 0, 1)


def blur(f, s):
    return ndimage.gaussian_filter(f, s, mode='nearest')


def layer(base, color, alpha):
    """Paint `color` over `base` with coverage alpha (in linear light)."""
    return base * (1 - alpha[..., None]) + to_lin(hexs(color)) * alpha[..., None] if isinstance(color, str) \
        else base * (1 - alpha[..., None]) + color * alpha[..., None]


def tone_stack(level, tones, cuts):
    """Hard-edged posterisation: start at tones[0], paint tones[i+1] where level > cuts[i]."""
    out = np.broadcast_to(to_lin(hexs(tones[0])), level.shape + (3,)).copy()
    for c, t in zip(cuts, tones[1:]):
        out = layer(out, t, step_aa(level, c))
    return out


def star(cx, cy, size, thin, rot=0.0):
    """4-point sparkle centred at normal-space (cx, cy); returns coverage 0..1 (antialiased)."""
    dx, dy = X - cx, Y - cy
    c, s = np.cos(rot), np.sin(rot)
    u, v = c * dx + s * dy, -s * dx + c * dy
    au, av = np.abs(u) / size, np.abs(v) / size
    # astroid-like star: |u|^p + |v|^p < 1 with p < 1 gives long thin points
    p = thin
    f = 1 - (au ** p + av ** p)
    return step_aa(f, 0.0), np.clip(1 - np.sqrt(dx * dx + dy * dy) / (size * 0.35), 0, 1)


def save(img_lin, name):
    os.makedirs(OUTDIR, exist_ok=True)
    srgb = to_srgb(img_lin)
    big = Image.fromarray(np.uint8(np.clip(srgb * 255 + 0.5, 0, 255)))
    small = big.resize((512, 512), Image.BOX)  # area filter = extra AA on band edges
    tmp = os.path.join(OUTDIR, f'.{name}.tmp.webp')
    small.save(tmp, 'WEBP', lossless=True, quality=100, method=6)
    os.replace(tmp, os.path.join(OUTDIR, name + '.webp'))
    small.save(os.path.join(OUTDIR, name + '.png'))
    return small


def main():
    d_key = norm(blur(lum(load('d_key')), 1.0))
    d_fill = norm(blur(lum(load('d_fill')), 1.0))
    d_rim = norm(blur(lum(load('d_rim')), 1.0))
    g_env = blur(lum(load('g_env')), 1.2)
    s_key = norm(blur(lum(load('s_key')), 1.5), 99.95)
    s_rim = norm(blur(lum(load('s_rim')), 1.5), 99.95)
    f_env = blur(lum(load('f_env', valid_r=0.94)), 0.8)
    f_key = norm(blur(lum(load('f_key', valid_r=0.94)), 0.8), 99.9)

    # key half-vector in normal space: where the key's specular / sparkle sits
    kd = np.array(SPEC['key']['dir'], np.float64)
    kd /= np.linalg.norm(kd)
    h = kd + np.array([0, 0, 1.0])
    h /= np.linalg.norm(h)
    hx, hy = h[0], h[1]

    diffuse = d_key + 0.35 * d_fill

    # ---------------------------------------------------------------- GOLD
    # env band value -> tone level (the studio strips give the band structure)
    env_level = np.interp(g_env, [0.03, 0.22, 0.42, 0.62, 0.84, 1.2, 2.0], [0.2, 0.9, 1.6, 2.0, 2.5, 2.9, 3.3])
    level = env_level + 1.4 * (np.clip(diffuse, 0, 1.1) - 0.5) + 0.15
    level = blur(level, 1.0)
    gold = tone_stack(level, ['#3e2111', '#643a1e', '#9b663d', '#c48a55', '#e3aa70'], [0.55, 1.45, 2.3, 2.85])
    # back-light rim: a thin warm-light crescent on the far edge
    gold = layer(gold, '#e8b47c', step_aa(d_rim, 0.6))
    # key specular: hard-edged pale highlight + white core
    gold = layer(gold, '#ffdcae', step_aa(s_key, 0.08))
    gold = layer(gold, '#fff4e2', step_aa(s_key, 0.45))
    gold = layer(gold, '#f6d1a2', step_aa(s_rim, 0.25))
    save(gold, 'gold')

    # ---------------------------------------------------------------- ARMOR (glossy black)
    alev = 1.3 * np.clip(diffuse, 0, 1.2) + 0.9 * (g_env > 0.8) * 0 + 0.0
    alev = blur(alev, 1.0)
    armor = tone_stack(alev, ['#030304', '#0a0a0e', '#14141b'], [0.45, 0.85])
    # upper reflection band (the bright studio strip) -> lightest armour tone, only on the lit side
    band = step_aa(blur(g_env, 1.0), 0.93) * step_aa(blur(diffuse, 2.0), 0.35)
    armor = layer(armor, '#2d2b34', band)
    # small controlled key highlight (neutral-cool grey, not blue)
    armor = layer(armor, '#6c6a78', step_aa(s_key, 0.3))
    armor = layer(armor, '#c9c8d2', step_aa(s_key, 0.75))
    # cool rim from behind
    armor = layer(armor, '#2a2a33', step_aa(d_rim, 0.62))
    armor = layer(armor, '#8e8fa0', step_aa(s_rim, 0.4))
    save(armor, 'armor')

    # ---------------------------------------------------------------- CRYSTAL (additive sparkle layer)
    crys = np.zeros((N, N, 3), np.float32)
    # facet reflections: only the bright studio facets show, as pale violet-blue panes
    crys = layer(crys, '#1a1e3a', step_aa(f_env, 0.5))
    crys = layer(crys, '#5a62a8', step_aa(f_env, 0.9))
    crys = layer(crys, '#d8d2ff', step_aa(f_key, 0.35))
    # fresnel rim
    crys = layer(crys, '#1c2766', step_aa(R, 0.90))
    crys = layer(crys, '#7f95e8', step_aa(R, 0.975))
    # star sparkle at the key half-vector
    st, core = star(hx, hy, 0.16, 0.55, rot=0.0)
    crys = layer(crys, '#f4eeff', st)
    crys = crys + to_lin(hexs('#ffffff')) * (core ** 2)[..., None] * 0.6
    save(crys, 'crystal')
    write_lightrig(os.path.join(OUTDIR, 'lightrig.json'))
    print('painted ->', OUTDIR)


def write_lightrig(path):
    rig = {}
    for k in ('key', 'fill', 'rim'):
        d = np.array(SPEC[k]['dir'], np.float64)
        d /= np.linalg.norm(d)
        rig[k] = {'dir': [round(float(c), 4) for c in d], 'color': SPEC[k]['color'], 'intensity': SPEC[k]['intensity']}
    rig['_note'] = ('View space (x right, y up, z towards viewer); dir points from the surface TO the light. '
                    'Same rig that was rendered in Blender (pipeline/light/rig.blend) to make the matcaps, which '
                    'already contain key/fill/rim for gold, armor and crystal. Toon ramp suggestion: '
                    'lit = smoothstep(-0.02, 0.06, dot(N, key.dir)); shadow tint multiplies by fill colour.')
    tmp = path + '.tmp'
    json.dump(rig, open(tmp, 'w'), indent=1)
    os.replace(tmp, path)


if __name__ == '__main__':
    main()
