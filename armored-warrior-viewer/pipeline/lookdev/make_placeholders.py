"""Procedural stand-in matcaps for the cel look (512x512, sRGB, standard matcap convention).

They are scalar "form light" fields with deliberate plateaus: the shader thresholds their luminance
into flat tones, so what matters is where the plateaus sit, not the colours.
"""
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
N = 512
ys, xs = np.mgrid[0:N, 0:N]
x = (xs + 0.5) / N * 2 - 1
y = 1 - (ys + 0.5) / N * 2
r2 = x * x + y * y
inside = r2 <= 1.0
z = np.sqrt(np.clip(1 - r2, 0, 1))
n = np.stack([x, y, z], -1)

def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def unit(v):
    v = np.array(v, float)
    return v / np.linalg.norm(v)

key = n @ unit([-0.46, 0.60, 0.66])
sky = 2 * z * y            # y of the reflection vector for a viewer on +z
side = 2 * z * x

def save(name, value, tint):
    value = np.clip(value, 0, 1)
    rgb = np.clip(value[..., None] * np.array(tint)[None, None, :], 0, 1)
    # outside the disc: repeat the rim value so filtering never pulls in garbage
    rgb[~inside] = rgb[inside].mean(0) * 0 + 0.0
    edge = np.clip(np.sqrt(r2), 1e-6, None)
    ex = np.clip(((x / edge) * 0.999 + 1) / 2 * N, 0, N - 1).astype(int)
    ey = np.clip((1 - (y / edge) * 0.999) / 2 * N, 0, N - 1).astype(int)
    rgb[~inside] = rgb[ey[~inside], ex[~inside]]
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(f'{out}/{name}.webp', quality=96, method=6)

# Gold: sky / horizon / ground reflection bands, a key highlight, a bounce band near the bottom.
gold = 0.26 + 0.24 * smooth(-0.16, -0.04, sky) + 0.22 * smooth(0.30, 0.44, sky)
gold -= 0.12 * smooth(0.80, 0.93, sky)                          # the very top darkens again
gold += 0.30 * smooth(-0.56, -0.66, sky) * smooth(-0.92, -0.80, sky)  # bounce band
gold += 0.26 * smooth(0.62, 0.74, key) + 0.22 * smooth(0.88, 0.93, key)
gold -= 0.10 * smooth(0.55, 0.9, side)                          # slightly darker away from the key
save('gold', gold, [1.0, 0.86, 0.66])

# Armour enamel: black with two small shaped highlights and a faint top streak.
armor = 0.10 * smooth(0.25, 0.7, key)
armor += 0.42 * smooth(0.80, 0.86, key) + 0.42 * smooth(0.925, 0.955, key)
streak = smooth(0.50, 0.58, sky) * smooth(0.80, 0.70, sky) * smooth(0.1, 0.5, -side * 0.3 + 0.35)
armor += 0.34 * streak
save('armor', armor, [0.86, 0.90, 1.0])

# Crystal: mid base, two glassy diagonal bars up-left, a soft bounce down-right.
d = (x * 0.72 - y * 0.69)
bars = smooth(-0.80, -0.74, d) * smooth(-0.56, -0.62, d) + 0.7 * smooth(-0.46, -0.42, d) * smooth(-0.34, -0.38, d)
crystal = 0.35 + 0.10 * smooth(-0.3, 0.7, key) + 0.55 * bars * smooth(0.2, 0.6, z)
crystal += 0.22 * smooth(0.5, 0.75, n @ unit([0.6, -0.55, 0.45])) * smooth(0.98, 0.8, np.sqrt(r2))
save('crystal', crystal, [0.92, 0.95, 1.0])
print('wrote placeholders to', out)
