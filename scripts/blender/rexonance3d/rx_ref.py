"""Reference-sheet mapping for the Rexonance 3D build.

The owner's ten-view sheet (design/rexonance-3d-20261030/reference/) is the
shape authority. Every view is a 1024 x 1536 drawing of the same suit standing
on the same sole line, so one scale fits all of them:

    S = 2.0 m / 1510 px   (front sheet: crown tip y=8 to sole y=1518)

World frame (Blender): +Z up, the suit faces -Y, its own LEFT hand is +X.
glTF export turns this into three.js +Y up with the suit facing +Z.

Each view maps a reference pixel (x, y) to two world coordinates:

    front (front-10)  camera at -Y looking +Y  ->  X = (x - cx) * S,  Z = (sole - y) * S
    back  (back-09)   camera at +Y looking -Y  ->  X = (cx - x) * S,  Z = (sole - y) * S
    right (right-07)  camera at -X looking +X  ->  Y = (cx - x) * S,  Z = (sole - y) * S
    left  (left-08)   camera at +X looking -X  ->  Y = (x - cx) * S,  Z = (sole - y) * S

The sheet is a painting, not an orthographic scan: views disagree by a few
centimetres. front-10 decides widths and heights, right-07 decides depth;
back-09 and left-08 are secondary. The other six sheets (01-06) are the same
suit from nearby angles and are useful for reading details only.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
REF_DIR = os.path.join(REPO, "design", "rexonance-3d-20261030", "reference")

S = 2.0 / 1510.0
IMG_W, IMG_H = 1024, 1536

VIEWS = {
    "front": dict(file="front-10.webp", axis="X", cx=500.0, sole=1518.0, sign=+1.0),
    "back": dict(file="back-09.webp", axis="X", cx=510.0, sole=1522.0, sign=-1.0),
    "right": dict(file="right-07.webp", axis="Y", cx=530.0, sole=1508.0, sign=-1.0),
    "left": dict(file="left-08.webp", axis="Y", cx=470.0, sole=1510.0, sign=+1.0),
}

# Secondary sheets for reading details (no mapping guarantee).
DETAIL_SHEETS = {
    "front-05": "front-05.webp",
    "front-06": "front-06.webp",
    "back-03": "back-03.webp",
    "back-04": "back-04.webp",
    "right-01": "right-01.webp",
    "left-02": "left-02.webp",
}


def ref_path(view):
    if view in VIEWS:
        return os.path.join(REF_DIR, VIEWS[view]["file"])
    return os.path.join(REF_DIR, DETAIL_SHEETS[view])


def px(view, x, y):
    """Reference pixel -> (h, Z): h is world X for front/back, world Y for right/left."""
    v = VIEWS[view]
    return ((x - v["cx"]) * S * v["sign"], (v["sole"] - y) * S)


def to_px(view, h, z):
    """World (h, Z) -> reference pixel (x, y) in that view."""
    v = VIEWS[view]
    return (v["cx"] + h / (S * v["sign"]), v["sole"] - z / S)


def front(x, y):
    """front-10 pixel -> (X, Z)."""
    return px("front", x, y)


def side(x, y):
    """right-07 pixel -> (Y, Z)."""
    return px("right", x, y)


def back(x, y):
    """back-09 pixel -> (X, Z)."""
    return px("back", x, y)


# Landmarks in metres (world frame), read off front-10 and right-07.
# Symmetric landmarks are given for the suit's LEFT side (+X); mirror X for the right.
LM = {
    "crown_tip_z": 2.00,
    "helmet_top_z": 1.891,
    "visor_z": 1.735,
    "chin_z": 1.650,
    "neck_base_z": 1.585,
    "shoulder": (0.215, 0.0, 1.554),
    "chest_core": (0.0, -0.174, 1.477),  # orb centre front-10 (499, 403), frontmost Y
    "waist_z": 1.322,
    "belt_top_z": 1.262,
    "belt_z": 1.207,
    "belt_bottom_z": 1.150,
    "crotch_z": 1.057,
    "hip": (0.105, 0.0, 1.095),
    "knee": (0.190, -0.020, 0.633),
    "ankle": (0.290, 0.030, 0.130),
    "elbow": (0.355, 0.030, 1.270),
    "wrist": (0.370, 0.000, 1.030),
    "fist": (0.372, -0.005, 0.955),
    "toe": (0.300, -0.200, 0.030),
    "heel": (0.285, 0.115, 0.030),
}
