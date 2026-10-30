"""Crop a reference sheet with a labelled pixel grid, for reading positions.

    python scripts/blender/rexonance3d/refcrop.py front 380 0 640 300 /tmp/helmet.png --scale 3 --grid 20

sheet: front | back | right | left (the mapped views) or front-05, front-06,
back-03, back-04, right-01, left-02. Grid labels are reference-sheet pixels;
convert them with rx_ref.px(view, x, y).
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rx_ref  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("sheet")
    p.add_argument("x0", type=int)
    p.add_argument("y0", type=int)
    p.add_argument("x1", type=int)
    p.add_argument("y1", type=int)
    p.add_argument("out")
    p.add_argument("--scale", type=float, default=2.0)
    p.add_argument("--grid", type=int, default=0, help="grid step in sheet pixels (0 = none)")
    a = p.parse_args()
    im = Image.open(rx_ref.ref_path(a.sheet)).convert("RGB").crop((a.x0, a.y0, a.x1, a.y1))
    W, H = int(im.width * a.scale), int(im.height * a.scale)
    im = im.resize((W, H), Image.LANCZOS)
    if a.grid:
        d = ImageDraw.Draw(im)
        for gx in range((a.x0 // a.grid + 1) * a.grid, a.x1, a.grid):
            x = (gx - a.x0) * a.scale
            d.line([(x, 0), (x, H)], fill=(0, 170, 0), width=1)
            d.text((x + 2, 2), str(gx), fill=(0, 120, 0))
        for gy in range((a.y0 // a.grid + 1) * a.grid, a.y1, a.grid):
            y = (gy - a.y0) * a.scale
            d.line([(0, y), (W, y)], fill=(220, 0, 0), width=1)
            d.text((2, y + 2), str(gy), fill=(200, 0, 0))
    im.save(a.out)
    print(a.out, im.size)


if __name__ == "__main__":
    main()
