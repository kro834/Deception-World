"""Render Rexonance's bare undersuit as a real relief: a premium hero bodysuit.

Blender 5.2 LTS as a Python module (or Blender itself), Cycles CPU; numpy,
scipy and Pillow in Blender's Python (pip install numpy scipy pillow):

  python scripts/blender/rexonance_undersuit.py output/playwright/undersuit-production \\
      --samples 112 --scale 2
  Blender -b --factory-startup -P scripts/blender/rexonance_undersuit.py -- \\
      output/playwright/undersuit-production --samples 112 --scale 2
  python scripts/blender/rexonance_undersuit.py <dir> --preview        # numpy-shaded field check, no Blender
  python scripts/blender/rexonance_undersuit.py <dir> --region 195,55,375,245 --scale 2   # the helmet only

The silhouette is the registration contract: every pixel of the 571 x 1040
figure that design/rexonance-suit/rexonance-undersuit-mask-20261016.png
covers (the body polygon of scripts/build-rexonance-suit.mjs at delivery
size, the footprint of the 2026-10-16 bodysuit) keeps the same footprint, so
the plates, the driver, the flame mask and the nanite targets still seat.
The body is inflated from that mask (a Poisson field, lowered: round limb
cross-sections, a smooth torso) and the anatomy is sculpted over it with
crease-defined pads (pectoral planes with a sharp lower edge, deltoid caps,
serratus, a deep abdominal grid, obliques, biceps, tapering forearms, three
quads, calves), hard shells (helmet over a pointed chin, collar, cuffs,
boots, toe caps) and gunmetal hard-points (shoulder caps, elbow pads, knee
hex pads, shin guards, knuckle plates), panel creases, vents and a few
recessed emissive channels. The helmet: sunk temples beside the cranium, a
crest fin with a bronze tip, bronze-edged brow facets, a brow plate stepping
over the smoked V lens (REXONANCE_SUIT_FACE_GLOW) whose filaments foreshadow
the final visor (blue along the outer edges, pink inside and down the core),
faceted cheeks with raked vents, a mouth guard with slits, a segmented neck
seal. Materials are painted as textures: satin suit with a fine hex weave,
glossy black shells, gunmetal, hair-thin bronze, matte ribbed flex panels,
the lens. The relief is lit as a studio hero shot (a tight warm key high on
the viewer's left, a dim fill, low cyan and pink rim strips at the sides:
the stage's own tones) and rendered straight on at --scale x, orthographic.
scripts/build-rexonance-undersuit.mjs packs the render into the delivered
webp. PNG renders and the .blend are intermediate build artefacts, never
runtime.
"""

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--mask", default=None)
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--region", default=None, help="x0,y0,x1,y1 in delivery px: render only this box")
    return parser.parse_args(argv)


ARGS = arguments()
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MASK = ARGS.mask or os.path.join(
    ROOT, "design", "rexonance-suit", "rexonance-undersuit-mask-20261016.png"
)
S = ARGS.scale  # render pixels per delivery pixel
os.makedirs(ARGS.output, exist_ok=True)

# --- The figure's landmarks (delivery px; the figure stands centred) -------
W1, H1 = 571, 1040
CX = 283.5
MIRROR = 2 * CX  # x' = MIRROR - x
CORE = (284.2, 275.3)  # the reactor's seat (REXONANCE_SUIT_MARKS.core)
BELT_Y = 422.7
SHOULDER = (173.8, 236.0)
ELBOW = (116.6, 380.7)
WRIST = (104.0, 512.0)
HIP = (224.0, 500.0)
KNEE = (185.0, 700.2)
ANKLE = (151.0, 903.0)
JAW_Y = 197.0  # the helmet's lower edge, over the neck
# Where plates seat on the body (REXONANCE_SUIT_PIECES' seats): the shoulder
# discs, the pecs, the abs, the belt's side pieces, the thighs' two plates,
# the knee discs and the boots' shins. Each gets a machined lock port.
PORTS = [
    (179.5, 280), (392.5, 280), (248, 328), (321.5, 328), (244, 396), (323, 396),
    (256, 415.5), (313, 415.5), (199.5, 541), (368.5, 541), (199, 650), (370, 650),
    (189.5, 765), (378, 765), (156.5, 900), (413.5, 900),
]
BOOT_Y = 906.0  # the boot's cuff
# The V of the compound eyes (REXONANCE_SUIT_FACE_GLOW): the visor channel.
FACE_GLOW = [
    (242.2, 107.6), (252.3, 109.3), (262.4, 120.0), (272.5, 134.0), (282.6, 145.2),
    (293.2, 134.0), (303.9, 120.5), (315.1, 109.3), (326.3, 107.1), (320.7, 121.7),
    (310.6, 136.8), (300.5, 150.8), (291.5, 164.8), (286.5, 178.8), (283.7, 194.5),
    (280.3, 178.8), (274.7, 164.8), (265.7, 150.8), (255.7, 136.8), (247.8, 122.8),
]


def mirror(points):
    return [(MIRROR - x, y) for x, y in points]


def both(lines):
    """Each polyline and its mirror."""
    return list(lines) + [mirror(line) for line in lines]


# --- The mask and the inflated body ----------------------------------------
def load_mask():
    image = Image.open(MASK)
    data = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
    assert data.shape == (H1, W1), data.shape
    return data


def inflate(mask1):
    """Solve laplacian(u) = -1 inside the silhouette, u = 0 outside: the
    classic inflation; sqrt(u) is a round tube across every limb. Solved at
    delivery size, lifted to render size and relaxed there."""
    inside = mask1 > 0.5
    index = -np.ones(inside.shape, dtype=np.int64)
    n = int(inside.sum())
    index[inside] = np.arange(n)
    rows, cols, vals = [], [], []
    ys, xs = np.nonzero(inside)
    me = index[ys, xs]
    rows.append(me)
    cols.append(me)
    vals.append(np.full(n, 4.0))
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = ys + dy, xs + dx
        ok = (ny >= 0) & (ny < H1) & (nx >= 0) & (nx < W1)
        nb = np.full(n, -1, dtype=np.int64)
        nb[ok] = index[ny[ok], nx[ok]]
        keep = nb >= 0
        rows.append(me[keep])
        cols.append(nb[keep])
        vals.append(np.full(int(keep.sum()), -1.0))
    A = sparse.csc_matrix(
        (np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)
    )
    u = spsolve(A, np.ones(n))
    field = np.zeros((H1, W1), dtype=np.float64)
    field[inside] = u
    # Render size: the field scales with the square of the length unit.
    big = ndimage.zoom(field, S, order=3) * (S * S)
    big = np.clip(big, 0, None)
    mask_big = ndimage.zoom(mask1, S, order=1)
    inside_big = mask_big > 0.5
    big[~inside_big] = 0
    for _ in range(24 * S):
        nbr = np.zeros_like(big)
        nbr[1:, :] += big[:-1, :]
        nbr[:-1, :] += big[1:, :]
        nbr[:, 1:] += big[:, :-1]
        nbr[:, :-1] += big[:, 1:]
        big = np.where(inside_big, (nbr + 1.0) / 4.0, 0.0)
    return np.sqrt(big), mask_big, inside_big


# --- Authoring helpers (delivery coordinates, drawn at 4x, kept at S x) -----
SS = 4  # supersampling of the drawn layers, in delivery px


class Layer:
    """A soft-edged scalar layer drawn with Pillow at SS x, then resampled
    to the render size with a box filter: anti-aliased shapes."""

    def __init__(self):
        self.image = Image.new("F", (W1 * SS, H1 * SS), 0.0)
        self.draw = ImageDraw.Draw(self.image)

    def polygon(self, points, value=1.0):
        self.draw.polygon([(x * SS, y * SS) for x, y in points], fill=value)

    def line(self, points, width, value=1.0):
        self.draw.line(
            [(x * SS, y * SS) for x, y in points],
            fill=value,
            width=max(1, int(round(width * SS))),
            joint="curve",
        )
        r = width * SS / 2
        for x, y in (points[0], points[-1]):
            self.draw.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=value)

    def ellipse(self, cx, cy, rx, ry, value=1.0):
        self.draw.ellipse(
            [(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=value
        )

    def ring(self, cx, cy, r, width, value=1.0):
        self.draw.ellipse(
            [(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS],
            outline=value,
            width=max(1, int(round(width * SS))),
        )

    def array(self, blur=0.0):
        a = np.asarray(self.image, dtype=np.float32)
        k = SS // S
        a = a.reshape(H1 * S, k, W1 * S, k).mean(axis=(1, 3))
        if blur > 0:
            a = ndimage.gaussian_filter(a, blur * S)
        return a


def grid():
    ys, xs = np.mgrid[0 : H1 * S, 0 : W1 * S]
    return (xs + 0.5) / S, (ys + 0.5) / S  # delivery coordinates of each render px


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def pad(X, Y, cx, cy, rx, ry, angle, amp, edge=0.45):
    """A sculpted muscle pad: a flat-topped swell inside an oriented ellipse,
    its edge blended over the outer `edge` of the radius."""
    t = math.radians(angle)
    dx, dy = X - cx, Y - cy
    u = (dx * math.cos(t) + dy * math.sin(t)) / rx
    v = (-dx * math.sin(t) + dy * math.cos(t)) / ry
    s = 1 - np.sqrt(u * u + v * v)
    return amp * smoothstep(s / edge) * (0.75 + 0.25 * np.clip(s, 0, 1))


def soft_step(X, Y, line, softness=0.8):
    """1 below a (left-to-right) polyline, 0 above, blended over softness px."""
    xs = np.array([p[0] for p in line])
    ys = np.array([p[1] for p in line])
    edge = np.interp(X, xs, ys)
    return np.clip((Y - edge) / softness + 0.5, 0, 1)


def along(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def angle_of(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) - 90


def across(a, b, t, offset):
    """A point at t along a->b, moved `offset` px across the limb (to the +x
    side of its direction)."""
    x, y = along(a, b, t)
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy)
    return (x - dy / n * offset, y + dx / n * offset)


def hexagon(cx, cy, r, rotate=90):
    return [
        (cx + r * math.cos(math.radians(rotate + 60 * k)), cy + r * math.sin(math.radians(rotate + 60 * k)))
        for k in range(6)
    ]


# --- The sculpt ----------------------------------------------------------------
K = 0.75  # the inflation, lowered: forms come from the sculpt more than the tube
ARMS = [(SHOULDER, ELBOW, WRIST, 1), (mirror([SHOULDER])[0], mirror([ELBOW])[0], mirror([WRIST])[0], -1)]
LEGS = [(HIP, KNEE, ANKLE, 1), (mirror([HIP])[0], mirror([KNEE])[0], mirror([ANKLE])[0], -1)]


def around(centre, offsets, flip=1):
    """A polygon of (dx, dy) offsets about a point, mirrored by flip."""
    return [(centre[0] + dx * flip, centre[1] + dy) for dx, dy in offsets]


def scaled(points, factor):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [(cx + (x - cx) * factor, cy + (y - cy) * factor) for x, y in points]


def sculpt(tube, X, Y, inside):
    """The height field in render px, from the flattened tube and the
    authored anatomy, shells, plates, creases and channels; plus the
    material zone maps."""
    h = tube * K
    pads = []  # (cx, cy, rx, ry, angle, amp, edge)
    # Chest: pectoral planes with a sharp lower edge; deltoid caps; traps.
    pads += [(SHOULDER[0] + 8, 262, 26, 30, 10, 4.2, 0.25), (MIRROR - SHOULDER[0] - 8, 262, 26, 30, -10, 4.2, 0.25)]
    pads += [(CX - 46, 230, 30, 13, 12, 1.5, 0.35), (CX + 46, 230, 30, 13, -12, 1.5, 0.35)]
    # The serratus bites under the pecs; a deep abdominal grid; the obliques
    # cutting the waist in.
    for y in (338, 366, 394):
        for side in (-1, 1):
            pads.append((CX + side * 13, y, 12.5, 12, 0, 2.3, 0.25))
    pads += [(CX - 44, 392, 15, 30, 18, 1.9, 0.3), (CX + 44, 392, 15, 30, -18, 1.9, 0.3)]
    # Arms: biceps, a forearm that tapers to the wrist.
    for a, b, c, flip in ARMS:
        pads.append((*across(a, b, 0.5, 4 * flip), 14, 36, angle_of(a, b), 3.0, 0.25))
        pads.append((*across(b, c, 0.42, -1 * flip), 13, 46, angle_of(b, c), 2.6, 0.3))
    # Legs: three quads, the inner and outer calf.
    for a, b, c, flip in LEGS:
        pads.append((*across(a, b, 0.42, -13 * flip), 17, 70, angle_of(a, b), 3.2, 0.25))
        pads.append((*across(a, b, 0.48, 3 * flip), 13, 80, angle_of(a, b), 2.8, 0.25))
        pads.append((*across(a, b, 0.8, 15 * flip), 12, 26, angle_of(a, b), 2.6, 0.3))
        pads.append((*across(b, c, 0.38, 15 * flip), 11, 40, angle_of(b, c), 2.0, 0.3))
        pads.append((*across(b, c, 0.35, -14 * flip), 10, 36, angle_of(b, c), 1.4, 0.3))
    for cx, cy, rx, ry, ang, amp, edge in pads:
        h += pad(X, Y, cx, cy, rx, ry, ang, amp * S, edge)
    pec = Layer()
    for pts in both([[(CX - 3, 256), (CX - 40, 246), (CX - 72, 250), (CX - 86, 282), (CX - 78, 310), (CX - 52, 322), (CX - 18, 320), (CX - 3, 300)]]):
        pec.polygon(pts)
    h += pec.array(0.35) * smoothstep((Y - 250) / 36) * (0.7 + 0.3 * smoothstep((np.abs(X - CX) - 10) / 50)) * 4.6 * S

    # Hard shells: the helmet over the neck (a pointed chin), the boots, the
    # toe caps, the wrist cuffs; the belt's channel.
    jaw = [(0, 189), (262, 189), (CX, 200), (305, 189), (W1, 189)]
    helmet = 1 - soft_step(X, Y, jaw, 0.8)
    h += helmet * 4.0 * S
    boots = soft_step(X, Y, [(0, BOOT_Y), (W1, BOOT_Y)], 0.8)
    h += boots * 3.5 * S
    toes = soft_step(X, Y, [(0, 1000), (W1, 1000)], 0.8) * (np.abs(X - CX) > 100)
    h += toes * 1.5 * S
    cuffs = np.zeros_like(h)
    for a, b, c, flip in ARMS:
        c0, c1 = sorted([across(b, c, 0.93, -40), across(b, c, 0.93, 40)])
        cuffs = np.maximum(
            cuffs,
            soft_step(X, Y, [(0, c0[1]), c0, c1, (W1, c1[1])], 0.8) * (np.abs(X - b[0] * 0.5 - c[0] * 0.5) < 60),
        )
    h += cuffs * 2.4 * S
    belt = soft_step(X, Y, [(224, BELT_Y - 13), (CX, BELT_Y - 10), (343, BELT_Y - 13)], 0.8) * (
        1 - soft_step(X, Y, [(222, BELT_Y + 14), (CX, BELT_Y + 17), (345, BELT_Y + 14)], 0.8)
    )
    h -= belt * 1.0 * S

    hard = Layer()  # gunmetal plates standing proud
    shellp = Layer()  # black shell plates (helmet facets, neck seal)
    recess = Layer()  # sunk facets
    groove = Layer()  # creases and panel seams
    vent = Layer()  # slits
    channel = Layer()  # recessed emissive piping
    lens = Layer()  # the visor
    bronze = Layer()  # hair-thin bronze accents
    flex = Layer()  # matte ribbed flex panels at the joints
    # --- Helmet: temples sunk beside a narrower cranium; the crest fin with
    # a bronze tip; brow facets sweeping to the temples; the brow plate
    # stepping over the lens; faceted cheeks with raked vents; the mouth
    # guard with slits down to the chin point; the segmented neck seal.
    for pts in both([[(243.5, 100), (253, 88), (263, 84), (264, 92), (256, 104), (246, 112)]]):
        recess.polygon(pts)
    shellp.polygon([(CX - 8, 85), (CX + 8, 85), (CX + 5, 101), (CX - 5, 101)], 0.8)
    shellp.polygon([(CX - 2.6, 83), (CX + 2.6, 83), (CX + 2, 102), (CX - 2, 102)], 2.2)
    bronze.line([(CX, 84), (CX, 92)], 1.6)
    for pts in both([[(CX - 3, 96), (262, 93), (248, 103)]]):
        groove.line(pts, 1.0)
        bronze.line(pts, 0.6)
    shellp.polygon([(244, 101), (CX, 139), (323, 101), (326.3, 107.1), (282.6, 145.2), (242.2, 107.6)], 1.2)
    cheek = [(243, 112), (247.8, 122.8), (255.7, 136.8), (265.7, 150.8), (274.7, 164.8), (266, 170), (255, 158), (247, 140), (243.5, 125)]
    for pts in both([cheek]):
        shellp.polygon(pts, 1.0)
    for pts in both([[(250, 146), (261, 141)], [(252, 154), (263, 149)], [(254.5, 162), (265, 157)]]):
        vent.line(pts, 1.4)
    jawp = [(274.7, 164.8), (280.3, 178.8), (283.7, 194.5), (270, 196), (258, 182), (266, 170)]
    for pts in both([jawp]):
        shellp.polygon(pts, 0.9)
    for pts in both([[(262, 177), (271, 177)], [(265, 183), (273.5, 183)], [(268.5, 189), (276, 189)]]):
        vent.line(pts, 1.2)
    for y0 in (200.5, 206, 211.5):
        shellp.polygon([(262, y0), (305, y0), (305, y0 + 3), (262, y0 + 3)], 0.6)
    lens.polygon(FACE_GLOW)
    hard.line(FACE_GLOW + [FACE_GLOW[0]], 1.6)
    outer_v = scaled(FACE_GLOW, 1.06)
    bronze.line(outer_v + [outer_v[0]], 0.8)
    # --- Collar and torso: the yoke, the sternum, the reactor's socket, the
    # pecs' lower edges, the serratus flank, the abdominal grid, the belt's
    # edges, the iliac crests.
    hard.polygon([(250, 216), (317, 216), (312, 224), (CX, 229), (255, 224)])
    bronze.line([(254, 224.5), (CX, 229.5), (313, 224.5)], 0.8)
    for pts in both([[(CX - 2, 232), (236, 229), (204, 240), (186, 262), (180, 290)]]):
        groove.line(pts, 1.2)
    groove.line([(CX, 232), (CX, CORE[1] - 46)], 1.3)
    for pts in both([[(CX - 6, 322), (CX - 40, 322), (CX - 70, 306), (CX - 80, 284)]]):
        groove.line(pts, 1.3)
    for pts in both([[(196, 248), (190, 270), (188, 296)]]):
        groove.line(pts, 1.1)
    for pts in both([[(207, 320), (213, 356), (220, 396), (226, 410)]]):
        groove.line(pts, 1.2)
    for y, hw in ((352, 27), (380, 27)):
        groove.line([(CX - hw, y + 2), (CX, y), (CX + hw, y + 2)], 1.6)
    groove.line([(224, BELT_Y - 13), (CX, BELT_Y - 10), (343, BELT_Y - 13)], 1.2)
    groove.line([(222, BELT_Y + 14), (CX, BELT_Y + 17), (345, BELT_Y + 14)], 1.2)
    for pts in both([[(222, 440), (240, 456), (262, 480), (276, 494)]]):
        groove.line(pts, 1.3)
    # --- Arms: the shoulder cap, the brachial crease, the elbow pad, the
    # outer channel, the cuff, the knuckle plate and finger seams.
    for a, b, c, flip in ARMS:
        groove.line([across(a, b, 0.2, -6 * flip), across(a, b, 0.9, -8 * flip)], 1.1)
        hard.polygon(around(b, [(-12, -16), (12, -16), (15, 2), (10, 16), (-10, 16), (-15, 2)], flip))
        channel.line([across(a, b, 0.25, -16 * flip), across(a, b, 0.86, -18 * flip)], 0.7)
        groove.line([across(a, b, 0.5, 19 * flip), across(a, b, 0.95, 19 * flip), across(b, c, 0.85, 18 * flip)], 1.0)
        c0, c1 = across(b, c, 0.9, -24 * flip), across(b, c, 0.9, 24 * flip)
        groove.line([c0, c1], 1.2)
        hx, hy = across(b, c, 1.2, 0)
        hard.polygon([(hx - 21, hy - 8), (hx + 21, hy - 8), (hx + 23, hy + 8), (hx - 23, hy + 8)])
        for ox in (-10, 0, 10):
            groove.line([(hx + ox, hy + 11), (hx + ox * 0.9, hy + 44)], 0.9)
        ex, ey = across(a, b, 1.0, 12 * flip)
        flex.ellipse(ex, ey + 2, 8, 11)
    # --- Legs: quad creases, the centre channel, the knee's hex pad, the
    # shin guard with its channel, the boot's cuff and toe seams.
    for a, b, c, flip in LEGS:
        groove.line([across(a, b, 0.15, -6 * flip), across(a, b, 0.85, -7 * flip)], 1.1)
        groove.line([across(a, b, 0.5, 9 * flip), across(a, b, 0.9, 8 * flip)], 1.1)
        channel.line([across(a, b, 0.12, -20 * flip), across(a, b, 0.8, -21 * flip)], 0.7)
        groove.line([across(a, b, 0.05, -36 * flip), across(a, b, 0.5, -36 * flip), across(a, b, 0.86, -31 * flip)], 1.2)
        hard.polygon(hexagon(b[0], b[1], 20))
        bronze.line(hexagon(b[0], b[1], 21.5) + [hexagon(b[0], b[1], 21.5)[0]], 0.7)
        groove.line(hexagon(b[0], b[1], 13) + [hexagon(b[0], b[1], 13)[0]], 1.0)
        shin = [across(b, c, 0.17, -13 * flip), across(b, c, 0.17, 13 * flip), across(b, c, 0.95, 10 * flip), across(b, c, 0.95, -10 * flip)]
        hard.polygon(shin)
        channel.line([across(b, c, 0.24, 0), across(b, c, 0.88, 1 * flip)], 0.7)
        groove.line([(c[0] - 34, BOOT_Y + 4), (c[0] + 34, BOOT_Y + 4)], 1.3)
        bronze.line([(c[0] - 33, BOOT_Y + 1.2), (c[0] + 33, BOOT_Y + 1.2)], 0.7)
        groove.line([(c[0] - 40, 968), (c[0] - 10, 962), (c[0] + 22, 970)], 1.3)
        groove.line([(c[0] - 48, 1002), (c[0] - 8, 997), (c[0] + 32, 1005)], 1.2)
    # --- Flex panels: armpits, groin, the gaps of the neck seal.
    for pts in both([[(186, 300), (206, 318), (208, 348), (196, 346), (184, 330)]]):
        flex.polygon(pts)
    flex.polygon([(CX - 12, 486), (CX + 12, 486), (CX + 10, 512), (CX - 10, 512)])
    flex.polygon([(262, 198), (305, 198), (305, 215), (262, 215)])

    # --- Mechanics (owner, 2026-10-21: メカメカしく立体的に). The uninstalled
    # reactor: a chamber sunk into the chest, its wall machined into rings,
    # coil bays round it where the coil will seat, contact pins, a dark core
    # lens and — the owner's honeycomb, real — a bevelled hex grille of ribs
    # between the lens and the inner ring. Then joint actuators (layered
    # rings at the shoulders, elbows, hips and knees), pistons along the
    # forearms and shins, lock ports where the plates seat, a rib framework
    # on the flanks and the ventral bus up to the chamber.
    ring = Layer()  # gunmetal actuator rings and collars
    rod = Layer()  # gunmetal pistons (rounded)
    port = Layer()  # lock-port rims
    port_in = Layer()  # lock-port recesses
    pin = Layer()  # contact pins, bronze
    bay = Layer()  # coil bays, sunk
    grille = Layer()  # the chamber's hex ribs
    rib = Layer()  # flank ribs
    R = np.hypot(X - CORE[0], Y - CORE[1])
    chamber = smoothstep((44 - R) / 0.8)
    h -= chamber * 3.0 * S
    for r0, r1 in ((40, 43), (29.5, 31.5), (17.5, 19.5)):
        ring.ring(CORE[0], CORE[1], (r0 + r1) / 2, r1 - r0)
    for k in range(8):
        t = math.radians(22.5 + 45 * k)
        c_, s_ = math.cos(t), math.sin(t)
        bay.polygon([
            (CORE[0] + 45 * c_ - 3 * s_, CORE[1] + 45 * s_ + 3 * c_),
            (CORE[0] + 45 * c_ + 3 * s_, CORE[1] + 45 * s_ - 3 * c_),
            (CORE[0] + 56 * c_ + 3 * s_, CORE[1] + 56 * s_ - 3 * c_),
            (CORE[0] + 56 * c_ - 3 * s_, CORE[1] + 56 * s_ + 3 * c_),
        ])
    for k in range(6):
        t = math.radians(60 * k)
        pin.ellipse(CORE[0] + 35.5 * math.cos(t), CORE[1] + 35.5 * math.sin(t), 1.7, 1.7)
    for k in range(4):
        t = math.radians(45 + 90 * k)
        groove.line([(CORE[0] + 20.5 * math.cos(t), CORE[1] + 20.5 * math.sin(t)), (CORE[0] + 28.5 * math.cos(t), CORE[1] + 28.5 * math.sin(t))], 1.2)
    hr = 4.5
    dxh = hr * math.sqrt(3)
    row = 0
    cy = CORE[1] - 34
    while cy < CORE[1] + 34:
        cx = CORE[0] - 34 + (dxh / 2 if row % 2 else 0)
        while cx < CORE[0] + 34:
            pts = [(cx + hr * math.cos(math.pi / 6 + k * math.pi / 3), cy + hr * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
            grille.line(pts + [pts[0]], 1.0)
            cx += dxh
        row += 1
        cy += hr * 1.5
    core_lens = smoothstep((13 - R) / 0.8)
    lens_rim = np.clip(smoothstep((15.5 - R) / 0.8) - core_lens, 0, 1)
    for a, b, c, flip in ARMS:
        ring.ring(a[0], a[1], 22, 3)
        ring.ring(a[0], a[1], 30, 2.4)
        ring.ring(b[0], b[1], 18, 2.2)
        ring.ring(b[0], b[1], 23, 1.8)
        p0, p1, p2 = across(b, c, 0.12, -15 * flip), across(b, c, 0.5, -15 * flip), across(b, c, 0.86, -14 * flip)
        rod.line([p0, p1], 5.0)
        rod.line([p1, p2], 2.8)
        for (qx, qy), qr in ((p0, 3.6), (p1, 3.4), (p2, 3.0)):
            ring.ellipse(qx, qy, qr, qr)
    for a, b, c, flip in LEGS:
        ring.ring(a[0], a[1], 14, 2.2)
        ring.ring(a[0], a[1], 8.5, 1.6)
        ring.ring(b[0], b[1], 26, 2.6)
        ring.ring(b[0], b[1], 32, 2.0)
        p0, p1, p2 = across(b, c, 0.2, -25 * flip), across(b, c, 0.55, -24 * flip), across(b, c, 0.93, -21 * flip)
        rod.line([p0, p1], 5.0)
        rod.line([p1, p2], 2.8)
        for (qx, qy), qr in ((p0, 3.6), (p1, 3.4), (p2, 3.0)):
            ring.ellipse(qx, qy, qr, qr)
    for px, py in PORTS:
        port.ring(px, py, 5.6, 1.8)
        port_in.ellipse(px, py, 4.8, 4.8)
        pin.ellipse(px, py, 1.6, 1.6)
    for pts in both([[(205, 298), (224, 404)]]):
        rib.line(pts, 2.0)
    for y0 in (304, 322, 340, 358, 376):
        for pts in both([[(203 + (y0 - 304) * 0.12, y0), (216 + (y0 - 304) * 0.12, y0 + 10)]]):
            rib.line(pts, 2.4)
    channel.line([(CX, CORE[1] + 45), (CX, 409)], 2.2)
    for y0 in (346, 376):
        ring.polygon([(CX - 4.5, y0 - 2.5), (CX + 4.5, y0 - 2.5), (CX + 4.5, y0 + 2.5), (CX - 4.5, y0 + 2.5)])

    rg = ring.array(0.25)
    rd = rod.array(0.6)
    pr = port.array(0.25)
    pi_ = port_in.array(0.25)
    pn = pin.array(0.2)
    by = bay.array(0.3)
    gr = grille.array(0.25) * smoothstep((29 - R) / 0.8) * (1 - smoothstep((16.5 - R) / 0.8))
    rb = rib.array(0.4)
    h += rg * 1.6 * S
    h += rd * 2.2 * S
    h += pr * 0.9 * S
    h -= pi_ * 1.2 * S
    h += pn * 1.0 * S
    h -= by * 1.5 * S
    h += gr * 1.4 * S
    h += rb * 1.2 * S
    h -= core_lens * 0.6 * S
    h += lens_rim * 0.8 * S
    hd = hard.array(0.25)
    sp = shellp.array(0.25)
    rc = recess.array(0.3)
    g = groove.array(0.35)
    vn = vent.array(0.3)
    ch = channel.array(0.3)
    v = lens.array(0.25)
    fx = flex.array(0.4)
    h += hd * 2.0 * S
    h += sp * 2.0 * S
    h -= rc * 2.0 * S
    h -= g * 1.5 * S
    h -= vn * 1.6 * S
    h -= ch * 1.0 * S
    h -= fx * 0.8 * S
    # The lens sits flat at the bottom of its channel.
    dome = ndimage.gaussian_filter(tube * K, 3.0 * S)
    h = h * (1 - v) + (dome + 4.0 * S - 2.0 * S) * v
    zones = {
        "lens": np.clip(v + core_lens, 0, 1),
        "hard": np.clip(hd + rg + rd + pr + gr + rb + lens_rim - v, 0, 1),
        "shell": np.clip(helmet + boots + cuffs + sp + toes - v, 0, 1),
        "bronze": np.clip(bronze.array(0.2) + pn - v, 0, 1),
        "flex": np.clip(fx - v, 0, 1),
        "channel": np.clip(ch - v, 0, 1),
        "dark": np.clip(g + vn + rc * 0.5 + belt * 0.6 + by + pi_ + chamber * 0.45, 0, 1),
    }
    return h, zones


# --- The textures ------------------------------------------------------------
def textures(X, Y, zones, inside):
    """Base colour (linear), packed roughness / metallic / coat / weave mask,
    and emission, each (H, W, 4) floats 0..1."""
    H, W = X.shape

    def lerp(a, b, t):
        return a * (1 - t[..., None]) + b * t[..., None]

    def material(colour, rough, metal, coat, weave):
        return np.array(colour), rough, metal, coat, weave

    suit = material((0.018, 0.021, 0.029), 0.48, 0.0, 0.0, 1.0)
    shell = material((0.030, 0.034, 0.046), 0.30, 0.1, 0.7, 0.0)
    hard = material((0.060, 0.066, 0.082), 0.32, 0.75, 0.25, 0.0)
    bronze = material((0.55, 0.34, 0.12), 0.30, 1.0, 0.0, 0.0)
    lens = material((0.002, 0.003, 0.006), 0.04, 0.0, 0.0, 0.0)
    flex = material((0.006, 0.007, 0.011), 0.80, 0.0, 0.0, 1.6)
    strip = material((0.010, 0.013, 0.022), 0.25, 0.0, 0.4, 0.0)
    base = np.broadcast_to(suit[0], (H, W, 3)).astype(np.float32)
    rough = np.full((H, W), suit[1], dtype=np.float32)
    metal = np.full((H, W), suit[2], dtype=np.float32)
    coat = np.full((H, W), suit[3], dtype=np.float32)
    weave = np.full((H, W), suit[4], dtype=np.float32)
    for zone, m in (("shell", shell), ("hard", hard), ("flex", flex), ("bronze", bronze), ("channel", strip), ("lens", lens)):
        t = zones[zone]
        base = lerp(base, m[0], t)
        rough = rough * (1 - t) + m[1] * t
        metal = metal * (1 - t) + m[2] * t
        coat = coat * (1 - t) + m[3] * t
        weave = weave * (1 - t) + m[4] * t
    dark = zones["dark"]
    base = base * (1 - dark[..., None] * 0.55)
    rough = rough + dark * 0.2
    packed = np.stack([np.clip(rough, 0.02, 1), np.clip(metal, 0, 1), np.clip(coat, 0, 1), np.clip(weave / 2, 0, 1)], axis=-1)
    # Emission: the stage's cyan on the viewer's left and pink on the right
    # in the recessed channels (with a faint halo), and the lens's filaments
    # foreshadowing the final visor: blue along the outer edges, pink along
    # the inner edges and down the core.
    cyan = np.array([0.47, 0.91, 1.0])
    pink = np.array([1.0, 0.50, 0.82])
    blue = np.array([0.30, 0.65, 1.0])
    side = np.clip((X - CX) / 40 + 0.5, 0, 1)
    tone = lerp(np.broadcast_to(cyan, (H, W, 3)), pink, side)
    core = zones["channel"]
    halo = ndimage.gaussian_filter(core, 2.2 * S) * 0.25
    emission = tone * (core * 0.3 + halo * 0.6)[..., None]
    inset = np.clip((ndimage.gaussian_filter(zones["lens"], 1.6 * S) - 0.55) * 5, 0, 1)
    fil_outer = Layer()
    fil_inner = Layer()
    fil_outer.line(FACE_GLOW[8:15], 2.8)
    fil_outer.line(FACE_GLOW[14:20] + [FACE_GLOW[0]], 2.8)
    fil_inner.line(FACE_GLOW[0:9], 2.8)
    fil_inner.line([(CX, 150), (CX + 0.2, 191)], 1.0)
    fo = fil_outer.array(0.25) * inset
    fi = fil_inner.array(0.25) * inset
    emission = emission + blue * (fo * 0.5 + ndimage.gaussian_filter(fo, 1.5 * S) * 0.2)[..., None]
    emission = emission + pink * (fi * 0.5 + ndimage.gaussian_filter(fi, 1.5 * S) * 0.2)[..., None]
    emission = emission + lerp(np.broadcast_to(blue, (H, W, 3)), pink, np.clip((Y - 120) / 60, 0, 1)) * (zones["lens"] * 0.03)[..., None]
    base_rgba = np.concatenate([np.clip(base, 0, 1), np.ones((H, W, 1))], axis=-1)
    emission_rgba = np.concatenate([np.clip(emission, 0, 1), np.ones((H, W, 1))], axis=-1)
    return base_rgba.astype(np.float32), packed.astype(np.float32), emission_rgba.astype(np.float32)


def save_png(path, rgba):
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def preview(h, base, packed, emission, mask_big):
    """A quick numpy-shaded check of the relief (no Blender)."""
    gy, gx = np.gradient(h)
    n = np.stack([-gx, -gy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    lights = [
        ((-0.45, -0.55, 0.7), (1.0, 0.96, 0.9), 1.1),
        ((-0.9, 0.1, 0.35), (0.47, 0.91, 1.0), 0.9),
        ((0.9, 0.1, 0.35), (1.0, 0.56, 0.85), 0.9),
        ((0.3, -0.2, 0.93), (0.5, 0.6, 0.8), 0.25),
    ]
    out = np.zeros(h.shape + (3,))
    rough = packed[..., 0]
    for d, c, e in lights:
        d = np.array(d) / np.linalg.norm(d)
        lam = np.clip(n @ d, 0, 1)
        hv = (d + np.array([0, 0, 1])) / np.linalg.norm(d + np.array([0, 0, 1]))
        spec = np.clip(n @ hv, 0, 1) ** (4 + 200 * (1 - rough) ** 2) * (1 - rough * 0.6)
        out += (base[..., :3] * lam[..., None] * 3.0 + spec[..., None] * 0.6) * np.array(c) * e
    out += emission[..., :3]
    out = out / (1 + out)
    out = out ** (1 / 1.6)
    bg = np.array([0.08, 0.086, 0.118])
    comp = out * mask_big[..., None] + bg * (1 - mask_big[..., None])
    return np.concatenate([comp, np.ones_like(mask_big)[..., None]], axis=-1)


def main():
    mask1 = load_mask()
    tube, mask_big, inside = inflate(mask1)
    X, Y = grid()
    h, zones = sculpt(tube, X, Y, inside)
    base, packed, emission = textures(X, Y, zones, inside)
    np.save(os.path.join(ARGS.output, "height.npy"), h.astype(np.float32))
    save_png(os.path.join(ARGS.output, "base.png"), base)
    save_png(os.path.join(ARGS.output, "packed.png"), packed)
    save_png(os.path.join(ARGS.output, "emission.png"), emission)
    save_png(os.path.join(ARGS.output, "preview.png"), preview(h, base, packed, emission, mask_big))
    if ARGS.preview:
        return
    render(h, base, packed, emission, inside)


# --- Blender: the relief, its material, the studio and the camera ----------
UNIT = 0.01  # Blender units per delivery px


def srgb(linear):
    a = np.clip(linear, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def render(h, base, packed, emission, inside):
    import bpy
    from mathutils import Vector

    H, W = h.shape
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # The mesh: a vertex per render pixel over the silhouette, one delivery
    # px beyond it (the pack clips to the mask), z from the height field.
    region = ndimage.binary_dilation(inside, iterations=S)
    index = -np.ones((H, W), dtype=np.int64)
    n = int(region.sum())
    index[region] = np.arange(n)
    ys, xs = np.nonzero(region)
    co = np.stack(
        [(xs + 0.5) / S * UNIT, -(ys + 0.5) / S * UNIT, h[ys, xs] / S * UNIT], axis=-1
    )
    quad = region[:-1, :-1] & region[:-1, 1:] & region[1:, 1:] & region[1:, :-1]
    qy, qx = np.nonzero(quad)
    faces = np.stack(
        [index[qy, qx], index[qy + 1, qx], index[qy + 1, qx + 1], index[qy, qx + 1]], axis=-1
    )
    nf = len(faces)
    mesh = bpy.data.meshes.new("undersuit")
    mesh.vertices.add(n)
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.loops.add(nf * 4)
    mesh.loops.foreach_set("vertex_index", faces.ravel())
    mesh.polygons.add(nf)
    mesh.polygons.foreach_set("loop_start", np.arange(0, nf * 4, 4))
    mesh.polygons.foreach_set("loop_total", np.full(nf, 4))
    mesh.update(calc_edges=True)
    mesh.polygons.foreach_set("use_smooth", np.ones(nf, dtype=bool))
    uv = mesh.uv_layers.new(name="UVMap")
    loop_vertex = faces.ravel()
    uvs = np.stack([(xs[loop_vertex] + 0.5) / W, 1 - (ys[loop_vertex] + 0.5) / H], axis=-1)
    uv.data.foreach_set("uv", uvs.ravel().astype(np.float32))
    mesh.validate()
    body = bpy.data.objects.new("undersuit", mesh)
    scene.collection.objects.link(body)

    def image(name, array, colour):
        img = bpy.data.images.new(name, W, H, alpha=True, float_buffer=False)
        img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        data = array.copy()
        if colour:
            data[..., :3] = srgb(data[..., :3])
        img.pixels.foreach_set(data[::-1].ravel().astype(np.float32))
        img.pack()
        return img

    base_img = image("base", base, True)
    packed_img = image("packed", packed, False)
    emission_img = image("emission", emission, True)

    material = bpy.data.materials.new("undersuit")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]

    def texture(img):
        node = nodes.new("ShaderNodeTexImage")
        node.image = img
        node.interpolation = "Cubic"
        node.extension = "EXTEND"
        return node

    t_base, t_packed, t_emission = texture(base_img), texture(packed_img), texture(emission_img)
    links.new(t_base.outputs["Color"], bsdf.inputs["Base Color"])
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(t_packed.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Red"], bsdf.inputs["Roughness"])
    links.new(split.outputs["Green"], bsdf.inputs["Metallic"])
    links.new(split.outputs["Blue"], bsdf.inputs["Coat Weight"])
    links.new(t_emission.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    bsdf.inputs["Coat Roughness"].default_value = 0.06
    bsdf.inputs["Specular IOR Level"].default_value = 0.55
    # The weave: a fine hex cell relief over the soft suit only.
    coords = nodes.new("ShaderNodeTexCoord")
    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.feature = "DISTANCE_TO_EDGE"
    voronoi.inputs["Scale"].default_value = 1 / (1.8 * UNIT)
    voronoi.inputs["Randomness"].default_value = 0.35
    links.new(coords.outputs["Object"], voronoi.inputs["Vector"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = 0.14
    links.new(voronoi.outputs["Distance"], ramp.inputs["Value"])
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 0.5
    links.new(t_packed.outputs["Alpha"], strength.inputs[0])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = 0.006
    links.new(ramp.outputs["Result"], bump.inputs["Height"])
    links.new(strength.outputs["Value"], bump.inputs["Strength"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mesh.materials.append(material)

    # The studio: a tight warm key high on the viewer's left, a dim cool
    # fill, the stage's cyan rim strip on the left and pink on the right
    # (low, so they catch the silhouette's walls), a small top light for the
    # helmet and a thin gleam strip the hard plates reflect.
    cx, cy = W1 / 2 * UNIT, -H1 / 2 * UNIT
    centre = (cx, cy, 0.0)

    def area(name, location, size, energy, colour, target=centre, size_y=None):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = energy
        light.color = colour
        light.size = size
        if size_y:
            light.shape = "RECTANGLE"
            light.size_y = size_y
        obj = bpy.data.objects.new(name, light)
        obj.location = location
        direction = Vector(target) - Vector(location)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)
        return obj

    area("key", (cx - 8, cy + 7, 6), 2.0, 620, (1.0, 0.95, 0.88))
    area("fill", (cx + 6, cy - 2, 9), 8, 85, (0.6, 0.72, 0.95))
    area("rim-cyan", (cx - 8.5, cy + 0.5, 1.2), 0.9, 1400, (0.47, 0.91, 1.0), size_y=13)
    area("rim-pink", (cx + 8.5, cy + 0.5, 1.2), 0.9, 1250, (1.0, 0.5, 0.82), size_y=13)
    area("top", (cx, cy + 9.5, 6), 1.5, 210, (0.9, 0.96, 1.0), target=(cx, cy + 4.3, 0))
    area("gleam", (cx - 1, cy + 3, 10), 0.5, 90, (1.0, 1.0, 1.0), size_y=10)

    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.12, 0.18, 0.3, 1)
    bg.inputs["Strength"].default_value = 0.015
    scene.world = world

    camera = bpy.data.cameras.new("camera")
    camera.type = "ORTHO"
    camera.ortho_scale = H1 * UNIT
    camera.clip_end = 100
    cam = bpy.data.objects.new("camera", camera)
    cam.location = (cx, cy, 30)
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = ARGS.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.seed = 20261021
    scene.cycles.max_bounces = 6
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.use_persistent_data = True
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    if ARGS.region:
        x0, y0, x1, y1 = (float(v) for v in ARGS.region.split(","))
        scene.render.use_border = True
        scene.render.use_crop_to_border = False
        scene.render.border_min_x = x0 / W1
        scene.render.border_max_x = x1 / W1
        scene.render.border_min_y = 1 - y1 / H1
        scene.render.border_max_y = 1 - y0 / H1
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.render.filepath = os.path.join(ARGS.output, "undersuit.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ARGS.output, "undersuit.blend"))


if __name__ == "__main__":
    main()
