#!/usr/bin/env python3
"""Pixel comparison of two screenshot folders: compare_shots.py A B [--diff-dir DIR] [--amp 8]
Prints per image: size, mean abs difference (0-255 per channel), max channel difference, share of differing pixels.
With --diff-dir writes amplified difference images."""
import argparse, os, sys
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('--diff-dir'); ap.add_argument('--amp', type=int, default=8)
x = ap.parse_args()
names = sorted(f for f in os.listdir(x.a) if f.endswith('.png') and os.path.exists(os.path.join(x.b, f)))
if not names: sys.exit('no common PNGs')
worst = 0
for n in names:
    A = np.asarray(Image.open(os.path.join(x.a, n)).convert('RGB'), dtype=np.int16)
    B = np.asarray(Image.open(os.path.join(x.b, n)).convert('RGB'), dtype=np.int16)
    if A.shape != B.shape: print(f'{n}: SIZE DIFFERS {A.shape} vs {B.shape}'); continue
    d = np.abs(A - B)
    px = d.max(axis=2)
    print(f'{n:14s} {A.shape[1]}x{A.shape[0]}  mean {d.mean():.4f}  max {int(d.max()):3d}  differing px {100 * (px > 0).mean():.3f}%  px>8 {100 * (px > 8).mean():.4f}%')
    worst = max(worst, int(d.max()))
    if x.diff_dir:
        os.makedirs(x.diff_dir, exist_ok=True)
        Image.fromarray(np.clip(d * x.amp, 0, 255).astype(np.uint8)).save(os.path.join(x.diff_dir, n))
print('max over all:', worst)
