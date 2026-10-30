"""Rexonance helmet: black lacquer shell, V visor, gold crown and horns, gorget.

Everything above the neck base (Z >= ~1.58 m). Built on the analytic base
surface in part_helmet_geo (dome + prow face wedge, pushed clear of the
undersuit head and neck), with the visible pieces layered on top of it.
"""

import importlib
import math

import numpy as np
from mathutils import Vector

import rx_lib as L
import rx_ref as R

import part_helmet_geo as G

importlib.reload(G)

S = R.S
C = (0.0, -0.010, 1.765)

# ------------------------------------------------------------------ base shape
ZC = 1.765
ZTOP = 1.884
ZBOT = 1.590
DOME = dict(W0=0.083, Y0=-0.006, F0=0.106, B0=0.100, PF=2.1, PB=2.3)

FACE_Z = [1.630, 1.636, 1.645, 1.658, 1.675, 1.700, 1.730, 1.760, 1.790, 1.815]
FACE_YR = [-0.098, -0.106, -0.114, -0.120, -0.124, -0.127, -0.129, -0.126, -0.118, -0.104]
FACE_W = [0.004, 0.018, 0.034, 0.050, 0.062, 0.072, 0.080, 0.083, 0.080, 0.066]
FACE_YC = [-0.075, -0.070, -0.062, -0.052, -0.042, -0.032, -0.026, -0.024, -0.028, -0.034]
face_yr = G.pchip(FACE_Z, FACE_YR)
face_w = G.pchip(FACE_Z, FACE_W)
face_yc = G.pchip(FACE_Z, FACE_YC)


def g_dome(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    up = z >= ZC
    t = np.where(up, (z - ZC) / (ZTOP - ZC), (ZC - z) / (ZC - ZBOT))
    out = t >= 1.0
    tt = np.clip(t, 0.0, 0.999999)

    def s(m):
        return (1.0 - tt ** m) ** (1.0 / m)

    W = DOME["W0"] * s(np.where(up, 2.4, 2.2))
    F = DOME["F0"] * s(np.where(up, 2.9, 2.2))
    B = DOME["B0"] * s(np.where(up, 2.3, 2.0))
    dy = y - DOME["Y0"]
    D = np.where(dy < 0, F, B)
    p = np.where(dy < 0, DOME["PF"], DOME["PB"])
    rho = ((np.abs(x) / W) ** p + (np.abs(dy) / D) ** p) ** (1.0 / p)
    return np.where(out, 1.0, rho - 1.0)


def g_face(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    out = (z < FACE_Z[0]) | (z > FACE_Z[-1])
    yr = face_yr(z)
    w = np.maximum(face_w(z), 0.002)
    yc = face_yc(z)
    df = np.maximum(yc - yr, 0.002)
    db = 0.075
    dy = y - yc
    D = np.where(dy < 0, df, db)
    p = np.where(dy < 0, 1.32, 2.0)
    rho = ((np.abs(x) / w) ** p + (np.abs(dy) / D) ** p) ** (1.0 / p)
    return np.where(out, 1.0, rho - 1.0)


def make_base(ctx):
    base = G.Base(C, [g_dome, g_face], k_union=0.008, body=ctx.body, margin=0.005, k_body=0.006)
    base.build_bvh(n_theta=180, phis=np.linspace(-75.0, 88.5, 110))
    return base


# ------------------------------------------------------------------ helpers
def fuv(x, y):
    """front-10 pixel -> front view-plane (u, v) = (X, Z)"""
    return G.ref_uv("front", x, y)


def buv(x, y):
    """back-09 pixel -> back view-plane (u, v) = (-X, Z)"""
    return G.ref_uv("back", x, y)


def suv(x, y):
    """right-07 pixel -> right view-plane (u, v) = (-Y, Z)"""
    return G.ref_uv("right", x, y)


def mirror_u(pts):
    return [(-u, v) for u, v in pts]


def sym_outline(half):
    """Full outline from the +u half (listed from the centre bottom, going
    around the +u side to the centre top): mirrored copy closes it."""
    right = [tuple(p) for p in half]
    left = [(-u, v) for u, v in reversed(right) if abs(u) > 1e-6]
    return right + left


def to_angles(base, P):
    D = np.asarray(P, float) - base.C
    D /= np.linalg.norm(D, axis=1)[:, None]
    th, ph = G.angles_from_dirs(D)
    return list(zip(th.tolist(), ph.tolist()))


def sag_points(base, psis, x=0.0):
    """Points on the sagittal arc (psi from the front horizontal over the top), offset sideways by x."""
    ps = np.radians(np.asarray(psis, float))
    D = np.stack([np.zeros_like(ps), -np.cos(ps), np.sin(ps)], axis=1)
    P = base.points(D)
    P[:, 0] += x
    return P


def add(bm, name, coll, family, angle=32.0, mirror=False):
    ob = L.from_bmesh(bm, name, coll, family, angle)
    if mirror:
        L.mirror_x(ob)
    return ob


# ------------------------------------------------------------------ shell
CREST_W = 0.0135
PSI_FRONT, PSI_BACK = 36.0, 146.0


def build_shell(ctx, base, coll):
    # dark under-shell (shows in the seams)
    V, F = base.grid(n_theta=112, phis=np.linspace(-58.0, 88.0, 64))
    G.mesh_obj(V, F, "RX_Helmet_Under", coll, "Dark", angle=None)

    # sagittal crest strip
    psis = np.linspace(PSI_FRONT, PSI_BACK, 24)
    right = sag_points(base, psis, CREST_W)
    left = sag_points(base, psis[::-1], -CREST_W)
    outline = to_angles(base, np.vstack([right, left]))
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.010, gap=0.0011, bevel=0.0013,
                       mean_dir=(0.0, 0.0, 1.0))
    add(bm, "RX_Helmet_CrestStrip", coll, "Black")

    # parietal panel (left, mirrored)
    inner = to_angles(base, sag_points(base, psis, CREST_W))
    back_edge = [(176.0, 30.0), (168.0, 20.0), (158.0, 9.0), (152.0, 2.0)]
    lower = [(140.0, 11.0), (120.0, 15.0), (98.0, 18.0), (78.0, 24.0), (60.0, 32.0), (42.0, 38.0), (24.0, 42.0)]
    outline = inner + back_edge + lower
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.011, gap=0.0011, bevel=0.0013)
    add(bm, "RX_Helmet_Parietal_L", coll, "Black", mirror=True)

    # temple / ear panel (left)
    upper = [(66.0, 24.0), (78.0, 24.0), (98.0, 18.0), (120.0, 15.0), (140.0, 11.0), (152.0, 2.0)]
    back = [(154.0, -12.0), (156.0, -30.0)]
    bottom = [(140.0, -40.0), (118.0, -44.0), (98.0, -40.0)]
    front = [(84.0, -24.0), (74.0, -6.0), (68.0, 10.0)]
    outline = upper + back + bottom + front
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.010, gap=0.0011, bevel=0.0013)
    add(bm, "RX_Helmet_Temple_L", coll, "Black", mirror=True)

    # occipital panel (back, symmetric)
    outline = [(152.0, 2.0), (158.0, 9.0), (168.0, 20.0), (176.0, 30.0), (180.0, 31.0), (184.0, 30.0), (192.0, 20.0),
               (202.0, 9.0), (208.0, 2.0), (206.0, -12.0), (204.0, -30.0), (192.0, -40.0), (180.0, -42.0),
               (168.0, -40.0), (156.0, -30.0), (154.0, -12.0)]
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.010, gap=0.0011, bevel=0.0013,
                       mean_dir=G.dirs_from_angles(180.0, -5.0))
    add(bm, "RX_Helmet_Occipital", coll, "Black")


# ------------------------------------------------------------------ face
# seams shared by neighbouring plates (point specs, suit's left side)
SEAM_EAR = [("s", 556, 165), ("s", 551, 186), ("s", 547, 208), ("s", 545, 228)]
JAW_LINE = [("s", 545, 228), ("s", 560, 238), ("s", 574, 248), ("s", 588, 259), ("f", 538, 280)]
CHEEK_OUT = [("f", 536, 282), ("f", 546, 270), ("f", 548, 246), ("f", 549, 214), ("f", 550, 188)]


def lerp_fn(ts, vs):
    ts = np.asarray(ts, float)
    vs = np.asarray(vs, float)
    return lambda t: float(np.interp(t, ts, vs))


def build_face(ctx, base, coll):
    # pink drop down the prow (one symmetric inlay)
    half = [fuv(500, 280), fuv(502.5, 268), fuv(505, 256), fuv(508.5, 244), fuv(511, 236), fuv(508, 230),
            fuv(500, 226)]
    bm = G.view_plate(base, "front", sym_outline(half), 0.0020, lift=0.0004, res=0.004, bevel=0.0007)
    add(bm, "RX_Helmet_Drop", coll, "Visor")

    # pink eye band (glowing V), mitred on the centre line
    pink = [("f", 500, 228), ("f", 511, 217), ("f", 528, 199), ("f", 545, 180), ("f", 556, 166), ("f", 562, 158),
            ("s", 566, 152)]
    bm = G.rail(base, pink, G.PROF_FLAT, lerp_fn([0, 0.35, 0.7, 1.0], [0.021, 0.015, 0.008, 0.0035]),
                lambda t: 0.0022, lift=0.0004, n=40, mitre_x0=True)
    add(bm, "RX_Helmet_EyePink_L", coll, "Visor", mirror=True)

    # blue crystal strip under the gold V
    blue = [("f", 500, 213.5), ("f", 515, 198.5), ("f", 530, 183.5), ("f", 545, 168.5), ("f", 556, 157),
            ("f", 563, 150), ("s", 572, 146)]
    bm = G.rail(base, blue, G.PROF_FLAT, lerp_fn([0, 0.5, 1.0], [0.0125, 0.011, 0.006]),
                lambda t: 0.0028, lift=0.0004, n=40, mitre_x0=True)
    ob = add(bm, "RX_Helmet_EyeBlue_L", coll, "Crystal")
    L.tint(ob, pink=0.0, sparkle=0.4, edge=0.8)
    L.mirror_x(ob)

    # mouth plates (flank the drop, converge to the chin)
    mouth = [("f", 500, 293), ("f", 509, 283), ("f", 514, 266), ("f", 519, 246), ("f", 525, 228), ("f", 515, 237),
             ("f", 512, 244), ("f", 509, 256), ("f", 506, 268), ("f", 503, 281), ("f", 500, 285)]
    bm = G.panel(base, mouth, 0.0050, res=0.004, bevel=0.0012)
    add(bm, "RX_Helmet_Mouth_L", coll, "Black", mirror=True)

    # cheek plates
    cheek = [("f", 513, 287), ("f", 526, 283)] + CHEEK_OUT + [("f", 541, 196), ("f", 530, 210), ("f", 526, 222),
                                                              ("f", 522, 236), ("f", 518, 256), ("f", 515, 272)]
    bm = G.panel(base, cheek, 0.0058, res=0.005, bevel=0.0013)
    add(bm, "RX_Helmet_Cheek_L", coll, "Black", mirror=True)

    # side jaw plates (cheek edge to the ear)
    jaw = CHEEK_OUT[::-1] + [("f", 558, 171)] + SEAM_EAR + JAW_LINE[1:]
    bm = G.panel(base, jaw, 0.0052, res=0.006, bevel=0.0013)
    add(bm, "RX_Helmet_Jaw_L", coll, "Black", mirror=True)


# ------------------------------------------------------------------ crown
def build_crown(ctx, base, coll):
    # gold V frame arm (ridged bar from the centre point to the temple), mitred
    arm = [("f", 500, 193), ("f", 515, 178), ("f", 530, 163), ("f", 545, 148), ("f", 556, 137), ("f", 563, 128)]
    bm = G.rail(base, arm, G.PROF_ROOF, lerp_fn([0, 0.5, 0.8, 1.0], [0.029, 0.027, 0.024, 0.018]),
                lerp_fn([0, 0.8, 1.0], [0.0080, 0.0075, 0.0060]), lift=0.0004, n=44, mitre_x0=True)
    add(bm, "RX_Helmet_Brow_L", coll, "Gold", angle=28.0, mirror=True)

    # centre crest: diamond on the brow, narrow spike up the forehead
    crest = [("f", 500, 190), ("f", 500, 170), ("f", 500, 150), ("f", 500, 130), ("f", 500, 112), ("f", 500, 97)]
    wf = lerp_fn([0.0, 0.12, 0.28, 0.42, 0.5, 0.8, 1.0], [0.002, 0.034, 0.040, 0.016, 0.012, 0.010, 0.006])
    hf = lerp_fn([0.0, 0.25, 0.5, 1.0], [0.006, 0.013, 0.009, 0.007])
    bm = G.rail(base, crest, G.PROF_ROOF, wf, hf, lift=0.0010, n=48)
    add(bm, "RX_Helmet_Crest", coll, "Gold", angle=28.0)
    # crest tip lifting off the dome
    top = base.points(G.spec_dirs(base, [("f", 500, 100)]))[0]
    spine = [top + np.array([0, 0.004, -0.004]), top + np.array([0, 0.006, 0.008]), np.array([0.0, -0.022, 1.906])]
    bm = G.blade(spine, lerp_fn([0, 1], [0.012, 0.0]), lerp_fn([0, 1], [0.008, 0.001]),
                 lambda t: (1.0, 0.0, 0.0), n=12)
    add(bm, "RX_Helmet_CrestTip", coll, "Gold", angle=28.0)

    # main horns: two swept blades per side rooted on the brow arm
    r0, _ = G.on_surface(base, [("f", 527, 160)], lift=-0.002)
    r1, _ = G.on_surface(base, [("f", 547, 144)], lift=-0.002)
    r2, _ = G.on_surface(base, [("f", 563, 128)], lift=-0.002)
    r0, r1, r2 = r0[0], r1[0], r2[0]
    tip_a = (0.087, -0.050, 1.993)
    le_a = [r0, (0.050, -0.102, 1.845), (0.062, -0.094, 1.895), (0.073, -0.078, 1.942), tip_a]
    te_a = [r1, (0.069, -0.076, 1.860), (0.076, -0.068, 1.910), (0.082, -0.060, 1.952), tip_a]
    bm = G.edge_blade(le_a, te_a, lerp_fn([0, 0.5, 1.0], [0.014, 0.010, 0.002]), n_span=30, n_chord=8,
                      ridge_a=0.42, outward=(0.9, -0.3, 0.0))
    add(bm, "RX_Helmet_HornA_L", coll, "Gold", angle=26.0, mirror=True)
    tip_b = (0.094, -0.012, 1.997)
    le_b = [r1 + np.array([0.002, 0.004, 0.0]), (0.072, -0.062, 1.865), (0.079, -0.048, 1.915),
            (0.086, -0.032, 1.958), tip_b]
    te_b = [r2, (0.086, -0.030, 1.870), (0.089, -0.022, 1.920), (0.092, -0.017, 1.962), tip_b]
    bm = G.edge_blade(le_b, te_b, lerp_fn([0, 0.5, 1.0], [0.014, 0.010, 0.002]), n_span=30, n_chord=8,
                      ridge_a=0.42, outward=(1.0, 0.0, 0.0))
    add(bm, "RX_Helmet_HornB_L", coll, "Gold", angle=26.0, mirror=True)


# ------------------------------------------------------------------ temples
def build_temples(ctx, base, coll):
    # gold side horns: rooted at the temple, rising up-back-out (front-10 tips (582,92), (595,115))
    for k, (path, tip, w) in enumerate([
            ([("a", 58.0, 27.0), ("a", 66.0, 29.0)], (0.109, 0.030, 1.893), 0.019),
            ([("a", 61.0, 15.0), ("a", 70.0, 17.0)], (0.126, 0.050, 1.860), 0.019)], 1):
        bm = G.hug_blade(base, path, lerp_fn([0, 1.0], [w, w * 0.85]), lerp_fn([0, 1.0], [0.003, 0.006]),
                         lerp_fn([0, 0.4, 1.0], [0.010, 0.008, 0.0015]), n=8, tip=tip, ridge_a=0.42)
        add(bm, "RX_Helmet_SideHorn%d_L" % k, coll, "Gold", angle=26.0, mirror=True)

    # black fins over the ears, gold leading edges
    fins = [([("a", 66.0, 3.0), ("a", 78.0, 4.0)], (0.121, 0.072, 1.818), 0.028),
            ([("a", 74.0, -10.0), ("a", 88.0, -10.0)], (0.112, 0.095, 1.776), 0.026)]
    for k, (path, tip, w) in enumerate(fins, 1):
        bm = G.hug_blade(base, path, lerp_fn([0, 1.0], [w, w * 0.9]), lerp_fn([0, 1.0], [0.003, 0.006]),
                         lerp_fn([0, 0.4, 1.0], [0.009, 0.007, 0.0015]), n=8, tip=tip, ridge_a=0.5)
        add(bm, "RX_Helmet_Fin%d_L" % k, coll, "Black", angle=26.0, mirror=True)
        # gold leading edge strip along the fin's upper edge
        P, N, T, B = G.hug_frames(base, path, 8)
        le = [tuple(P[i] + N[i] * (0.003 + 0.003 * i / 7) + B[i] * (w * 0.5 - 0.001)) for i in range(8)]
        spine = le + [tip]
        bm = G.blade(spine, lerp_fn([0, 0.8, 1.0], [0.0065, 0.004, 0.0]), lerp_fn([0, 1.0], [0.0050, 0.001]),
                     lambda t: (0.0, 0.0, 1.0), n=24)
        add(bm, "RX_Helmet_FinEdge%d_L" % k, coll, "Gold", angle=26.0, mirror=True)


# ------------------------------------------------------------------ back of the head
def build_back(ctx, base, coll):
    # gold crown chevron across the back of the head (apex up, mitred on X=0)
    band = [("b", 511, 141), ("b", 500, 148), ("b", 489, 158), ("b", 479, 171), ("b", 472, 189)]
    bm = G.rail(base, band, G.PROF_ROOF, lerp_fn([0, 0.8, 1.0], [0.020, 0.019, 0.012]),
                lerp_fn([0, 1.0], [0.0085, 0.007]), lift=0.0004, n=36, mitre_x0=True)
    add(bm, "RX_Helmet_CrownBand_L", coll, "Gold", angle=28.0, mirror=True)

    # back spike: a thick fin standing on the back of the crown
    top = sag_points(base, [100.0])[0]
    apex = sag_points(base, [147.0])[0]
    tip = np.array([0.0, 0.056, 1.936])
    le = [top - np.array([0, 0, 0.006]), top + np.array([0, 0.016, 0.026]), tip]
    te = [apex - np.array([0, 0.004, 0.0]), apex + np.array([0, 0.004, 0.050]), tip]
    bm = G.edge_blade(le, te, lerp_fn([0, 0.5, 1.0], [0.020, 0.013, 0.002]), n_span=20, n_chord=8, ridge_a=0.5,
                      outward=(1.0, 0.0, 0.0), section="hex")
    add(bm, "RX_Helmet_BackSpike", coll, "Gold", angle=26.0)

    # occipital centre ridge
    bm = G.rail(base, [("b", 511, 152), ("b", 511, 172), ("b", 511, 198)], G.PROF_ROOF, lambda t: 0.007,
                lerp_fn([0, 1.0], [0.0055, 0.004]), lift=0.0035, n=12)
    add(bm, "RX_Helmet_NapeRidge", coll, "Black", angle=28.0)

    # nape chevron: two ridged wings meeting at the bottom point + a centre spike
    wing = [("b", 511, 247), ("b", 498, 239), ("b", 484, 231), ("b", 470, 224), ("b", 456, 216)]
    bm = G.rail(base, wing, G.PROF_ROOF, lerp_fn([0, 0.6, 1.0], [0.020, 0.018, 0.008]),
                lerp_fn([0, 0.7, 1.0], [0.0085, 0.008, 0.005]), lift=0.0040, n=30, mitre_x0=True)
    add(bm, "RX_Helmet_NapeWing_L", coll, "Gold", angle=28.0, mirror=True)
    bm = G.rail(base, [("b", 511, 240), ("b", 511, 220), ("b", 511, 200), ("b", 511, 189)], G.PROF_ROOF,
                lerp_fn([0, 0.3, 1.0], [0.020, 0.016, 0.002]), lerp_fn([0, 1.0], [0.0105, 0.006]), lift=0.0040, n=24)
    add(bm, "RX_Helmet_NapeSpike", coll, "Gold", angle=28.0)


def build(ctx):
    coll = ctx.coll("helmet")
    base = make_base(ctx)
    build_shell(ctx, base, coll)
    build_face(ctx, base, coll)
    build_crown(ctx, base, coll)
    build_temples(ctx, base, coll)
    build_back(ctx, base, coll)
    return base
