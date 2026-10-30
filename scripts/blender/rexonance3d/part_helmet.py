"""Rexonance helmet: black lacquer shell, V visor, gold crown and horns, gorget.

Everything above the neck base (Z >= ~1.58 m). Built on the analytic base
surface in part_helmet_geo (dome + prow face wedge, pushed clear of the
undersuit head and neck), with the visible pieces layered on top of it.
"""

import importlib

import numpy as np

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
DOME = dict(W0=0.083, Y0=-0.006, F0=0.109, B0=0.082, PF=2.1, PB=2.3)

FACE_Z = [1.633, 1.638, 1.646, 1.658, 1.675, 1.700, 1.730, 1.760, 1.790, 1.815]
FACE_YR = [-0.098, -0.106, -0.112, -0.117, -0.122, -0.128, -0.133, -0.131, -0.123, -0.107]
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


def rim_margin(D):
    """Body clearance: 5 mm, flaring to 15 mm at the lower rim behind the face so
    the gorget tucks under the shell."""
    ph = np.degrees(np.arcsin(np.clip(D[:, 2], -1.0, 1.0)))
    th = np.degrees(np.arctan2(D[:, 0], -D[:, 1]))
    side = np.clip((np.abs(th) - 45.0) / 30.0, 0.0, 1.0)
    t = np.clip((-ph - 26.0) / 18.0, 0.0, 1.0)
    return 0.005 + 0.010 * side * t * t * (3.0 - 2.0 * t)


def make_base(ctx):
    base = G.Base(C, [g_dome, g_face], k_union=0.008, body=ctx.body, margin=0.005, k_body=0.006,
                  margin_fn=rim_margin)
    base.build_bvh(n_theta=180, phis=np.linspace(-75.0, 88.5, 110))
    return base


# ------------------------------------------------------------------ helpers
def fuv(x, y):
    """front-10 pixel -> front view-plane (u, v) = (X, Z)"""
    return G.ref_uv("front", x, y)


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
CREST_W = 0.0135                     # half width of the sagittal crest strip
PSI_FRONT, PSI_BACK = 36.0, 146.0    # its ends on the sagittal arc (deg from the front horizontal)


def under_grid(base, n_theta=72, n_phi=40):
    """Under-shell grid; its lower edge runs deep under the face (-56 deg) and
    shallow at the sides/back (-43 deg) so it stays clear of the gorget."""
    th = np.linspace(-180.0, 180.0, n_theta, endpoint=False)
    w = np.clip((np.abs(th) - 35.0) / 35.0, 0.0, 1.0)
    lo = -56.0 + 13.0 * w * w * (3.0 - 2.0 * w)
    k = np.linspace(0.0, 1.0, n_phi)
    PH = lo[None, :] + (88.0 - lo[None, :]) * k[:, None]
    TH = np.broadcast_to(th[None, :], PH.shape)
    D = G.dirs_from_angles(TH.ravel(), PH.ravel())
    V = base.points(D)
    V = np.vstack([V, base.points(np.array([[0.0, 0.0, 1.0]]))])
    F = []
    for i in range(n_phi - 1):
        for j in range(n_theta):
            a = i * n_theta + j
            b = i * n_theta + (j + 1) % n_theta
            F.append((a, b, b + n_theta, a + n_theta))
    top = len(V) - 1
    for j in range(n_theta):
        F.append(((n_phi - 1) * n_theta + j, (n_phi - 1) * n_theta + (j + 1) % n_theta, top))
    return V, F


def build_shell(ctx, base, coll):
    # dark under-shell (shows in the seams)
    V, F = under_grid(base)
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
    # seam splitting the side of the dome into a front and a rear panel
    k_split = int(np.argmin([abs(ps - 92.0) for ps in psis]))
    split = [inner[k_split], (104.0, 52.0), (100.0, 34.0), (98.0, 18.0)]
    front_o = inner[:k_split + 1] + split[1:] + lower[3:]
    rear_o = inner[k_split:] + back_edge + lower[:3] + split[::-1][1:-1]
    # front of the dome stays Black lacquer; the side / rear / back panels are Suit
    # (the runtime lays the triplanar dragon-scale normal map on Suit)
    for nm, outline, fam in (("ParietalFront", front_o, "Black"), ("ParietalRear", rear_o, "Suit")):
        bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.011, gap=0.0011, bevel=0.0013)
        add(bm, "RX_Helmet_%s_L" % nm, coll, fam, mirror=True)

    # temple / ear panel (left)
    upper = [(66.0, 24.0), (78.0, 24.0), (98.0, 18.0), (120.0, 15.0), (140.0, 11.0), (152.0, 2.0)]
    back = [(154.0, -12.0), (156.0, -30.0)]
    bottom = [(140.0, -40.0), (118.0, -44.0), (98.0, -40.0)]
    front = [(84.0, -24.0), (74.0, -6.0), (68.0, 10.0)]
    outline = upper + back + bottom + front
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.010, gap=0.0011, bevel=0.0013)
    add(bm, "RX_Helmet_Temple_L", coll, "Suit", mirror=True)

    # occipital panel (back, symmetric)
    outline = [(152.0, 2.0), (158.0, 9.0), (168.0, 20.0), (176.0, 30.0), (180.0, 31.0), (184.0, 30.0), (192.0, 20.0),
               (202.0, 9.0), (208.0, 2.0), (206.0, -12.0), (204.0, -30.0), (192.0, -40.0), (180.0, -42.0),
               (168.0, -40.0), (156.0, -30.0), (154.0, -12.0)]
    bm = G.param_panel(base, outline, 0.0042, lift=0.0004, res=0.010, gap=0.0011, bevel=0.0013,
                       mean_dir=G.dirs_from_angles(180.0, -5.0))
    add(bm, "RX_Helmet_Occipital", coll, "Suit")


# ------------------------------------------------------------------ face
# The gold brow arm is the master path; the blue strip, the pink band and the
# upper edges of the cheek / jaw plates are in-surface offsets of it, so the
# layers always nest (gold over blue over pink over the black plates).
ARM = [("f", 500, 193), ("f", 515, 178), ("f", 530, 163), ("f", 545, 148), ("f", 556, 137), ("f", 563, 128)]
ARM_W = ([0, 0.5, 0.8, 1.0], [0.029, 0.027, 0.024, 0.018])
BLUE_W = ([0, 0.5, 0.85, 1.0], [0.0135, 0.0140, 0.0125, 0.008])
PINK_W = ([0, 0.3, 0.6, 0.85, 1.0], [0.020, 0.017, 0.011, 0.006, 0.004])
SEAM_EAR = [("s", 556, 166), ("s", 551, 186), ("s", 547, 208), ("s", 545, 228)]
JAW_LINE = [("s", 560, 238), ("s", 574, 248), ("s", 588, 259), ("f", 538, 280)]


def lerp_fn(ts, vs):
    ts = np.asarray(ts, float)
    vs = np.asarray(vs, float)
    return lambda t: float(np.interp(t, ts, vs))


def arm_offset(base, depth_fn, n=40, extend=True, t_range=(0.0, 1.0)):
    """Curve below the brow arm: depth_fn(t) metres under the arm's centre line."""
    return G.offset_dirs(base, ARM, n, lambda t: -depth_fn(t), extend_x0=extend, t_range=t_range)


def build_face(ctx, base, coll):
    wa, wb, wp = lerp_fn(*ARM_W), lerp_fn(*BLUE_W), lerp_fn(*PINK_W)
    # the glowing V sits in a dark recess: 1.2 mm under the gold arm, 1.8 mm above the plates
    g1, g3 = 0.0012, 0.0018
    # blue crystal strip right under the gold arm
    blue = arm_offset(base, lambda t: wa(t) * 0.5 + g1 + wb(t) * 0.5, t_range=(0.0, 0.97))
    bm = G.rail(base, blue, G.PROF_FLAT, wb, lambda t: 0.0026, lift=0.0004, n=40, mitre_x0=True)
    ob = add(bm, "RX_Helmet_EyeBlue_L", coll, "Crystal")
    L.tint(ob, pink=0.0, sparkle=0.4, edge=0.8)
    L.mirror_x(ob)
    # pink glowing band under the blue
    pink = arm_offset(base, lambda t: wa(t) * 0.5 + g1 + wb(t) + wp(t) * 0.5, t_range=(0.0, 0.94))
    bm = G.rail(base, pink, G.PROF_FLAT, wp, lambda t: 0.0021, lift=0.0004, n=40, mitre_x0=True)
    add(bm, "RX_Helmet_EyePink_L", coll, "Visor", mirror=True)
    # white-hot core line between the blue strip and the pink band
    core = arm_offset(base, lambda t: wa(t) * 0.5 + g1 + wb(t), t_range=(0.0, 0.9))
    bm = G.rail(base, core, G.PROF_FLAT, lerp_fn([0, 0.6, 1.0], [0.0042, 0.0034, 0.0012]), lambda t: 0.0030,
                lift=0.0004, n=36, mitre_x0=True)
    add(bm, "RX_Helmet_EyeCore_L", coll, "Glow", mirror=True)
    # pink drop down the prow (one symmetric inlay)
    half = [fuv(500, 280), fuv(502.5, 268), fuv(505, 256), fuv(508.5, 244), fuv(511, 236), fuv(508, 228),
            fuv(500, 224)]
    bm = G.view_plate(base, "front", sym_outline(half), 0.0019, lift=0.0004, res=0.0045, bevel=0.0007)
    add(bm, "RX_Helmet_Drop", coll, "Visor")

    # plates under the band: their top edge follows the band's lower edge
    def under(t):
        return wa(t) * 0.5 + g1 + wb(t) + wp(t) + g3

    top = arm_offset(base, under, n=40, extend=False)       # from the centre out to the temple
    th_, ph_ = G.angles_from_dirs(top)
    i_mouth = int(np.argmin(np.abs(th_ - 9.0)))              # mouth / cheek split along the band
    i_cheek = int(np.argmin(np.abs(th_ - 32.0)))             # cheek / jaw split
    # mouth plate: drop edge -> band -> down to the chin
    mouth = G.chain(base, [("f", 500, 287.5), ("f", 508, 281), ("f", 514, 266), ("f", 519, 247)],
                    top[i_mouth:i_mouth + 1],
                    [("f", 513.5, 239), ("f", 511, 246), ("f", 508.5, 257), ("f", 505.5, 269), ("f", 502.5, 279),
                     ("f", 500, 282)])
    ridge = [("f", 516, 240), ("f", 509, 270), ("f", 502, 285)]

    def facet(P, Q, dr, t0=0.0042, h=0.0024, hw=0.010):
        if dr is None:
            return np.full(len(P), t0)
        return t0 + h * np.clip(1.0 - dr / hw, 0.0, 1.0)

    bm = G.panel(base, mouth, 0.0045, res=0.0045, bevel=0.0011, ridge=ridge, thick_fn=facet)
    add(bm, "RX_Helmet_Mouth_L", coll, "Black", angle=24.0, mirror=True)

    cheek_out = [("f", 548, 246), ("f", 546, 270), ("f", 536, 282)]
    cheek = G.chain(base, [("f", 511, 284), ("f", 517, 273), ("f", 521, 252)], top[i_mouth + 1:i_cheek + 1],
                    cheek_out[:1], cheek_out[1:], [("f", 524, 282)])
    bm = G.panel(base, cheek, 0.005, res=0.006, bevel=0.0012, ridge=[("f", 540, 210), ("f", 532, 250),
                                                                      ("f", 524, 283)],
                 thick_fn=lambda P, Q, dr: facet(P, Q, dr, 0.0046, 0.0030, 0.013))
    add(bm, "RX_Helmet_Cheek_L", coll, "Black", angle=24.0, mirror=True)

    # blue crystal accent in the cheek / jaw seam (front-10 x ~543-548, y 212-270)
    line = [("f", 549.5, 214), ("f", 549.5, 232), ("f", 548.5, 250), ("f", 546.5, 266)]
    bm = G.rail(base, line, G.PROF_FLAT, lerp_fn([0, 0.5, 1.0], [0.0038, 0.0034, 0.0020]), lambda t: 0.0068,
                lift=0.0004, n=20)
    ob = add(bm, "RX_Helmet_CheekCrystal_L", coll, "Crystal")
    L.tint(ob, pink=0.15, sparkle=0.6, edge=0.9)
    L.mirror_x(ob)
    # gold trim along the mouth plate's outer edge (front-10 dark-gold line x ~519 -> 507)
    trim = [("f", 523.5, 233), ("f", 520, 248), ("f", 516, 264), ("f", 511, 279)]
    bm = G.rail(base, trim, G.PROF_ROOF, lerp_fn([0, 1.0], [0.0032, 0.0022]), lambda t: 0.0064, lift=0.0004, n=20)
    add(bm, "RX_Helmet_MouthTrim_L", coll, "Gold", angle=30.0, mirror=True)

    # side of the jaw: two angular plates split by a seam slanting forward-down (right-07)
    i_split = int(np.argmin(np.abs(th_ - 47.0)))
    split = [("s", 590, 226)]
    jaw_front = G.chain(base, top[i_cheek + 1:i_split + 1], split, JAW_LINE[2:], cheek_out[::-1][1:])
    bm = G.panel(base, jaw_front, 0.005, res=0.0065, gap=0.0012, bevel=0.0012,
                 ridge=[("f", 553, 196), ("s", 596, 236), ("s", 597, 258)],
                 thick_fn=lambda P, Q, dr: facet(P, Q, dr, 0.0046, 0.0024, 0.012))
    add(bm, "RX_Helmet_JawFront_L", coll, "Black", angle=24.0, mirror=True)
    jaw_rear = G.chain(base, top[i_split:], SEAM_EAR, JAW_LINE[:3], split)
    bm = G.panel(base, jaw_rear, 0.005, res=0.007, gap=0.0012, bevel=0.0012,
                 ridge=[("s", 568, 176), ("s", 570, 210), ("s", 576, 246)],
                 thick_fn=lambda P, Q, dr: facet(P, Q, dr, 0.0046, 0.0026, 0.014))
    add(bm, "RX_Helmet_JawRear_L", coll, "Black", angle=24.0, mirror=True)


# ------------------------------------------------------------------ crown
def horn(coll, name, le, te, thick, outward, inlay=(0.16, 0.30, 0.06, 0.80)):
    tf = lerp_fn([0, 0.5, 1.0], thick)
    bm = G.edge_blade(le, te, tf, n_span=30, ridge_a=0.45, outward=outward)
    add(bm, name + "_L", coll, "Gold", angle=26.0, mirror=True)
    if inlay:
        a0, a1, s0, s1 = inlay
        bm = G.blade_inlay(le, te, tf, a0, a1, s0, s1, outward, ridge_a=0.45)
        add(bm, name + "Groove_L", coll, "GoldDark", angle=40.0, mirror=True)


def build_crown(ctx, base, coll):
    # gold V frame arm (ridged bar from the centre point to the temple), mitred
    bm = G.rail(base, ARM, G.PROF_ROOF, lerp_fn(*ARM_W),
                lerp_fn([0, 0.8, 1.0], [0.0080, 0.0075, 0.0060]), lift=0.0004, n=44, mitre_x0=True)
    add(bm, "RX_Helmet_Brow_L", coll, "Gold", angle=28.0, mirror=True)
    # dark recess line along the arm's lower slope
    wa = lerp_fn(*ARM_W)
    groove = G.offset_dirs(base, ARM, 40, lambda t: -wa(t) * 0.22, extend_x0=True, t_range=(0.0, 0.9))
    bm = G.rail(base, groove, G.PROF_FLAT, lerp_fn([0, 0.8, 1.0], [0.0042, 0.0038, 0.002]),
                lambda t: 0.0052, lift=0.0004, n=36, mitre_x0=True)
    add(bm, "RX_Helmet_BrowGroove_L", coll, "GoldDark", angle=40.0, mirror=True)

    # centre crest: big diamond on the brow, narrow spike up the forehead
    crest = [("f", 500, 191), ("f", 500, 170), ("f", 500, 150), ("f", 500, 130), ("f", 500, 112), ("f", 500, 97)]
    wf = lerp_fn([0.0, 0.06, 0.20, 0.36, 0.50, 0.60, 0.8, 1.0], [0.002, 0.010, 0.032, 0.050, 0.020, 0.014, 0.012, 0.008])
    hf = lerp_fn([0.0, 0.25, 0.5, 1.0], [0.007, 0.014, 0.010, 0.008])
    bm = G.rail(base, crest, G.PROF_ROOF, wf, hf, lift=0.0010, n=48)
    add(bm, "RX_Helmet_Crest", coll, "Gold", angle=28.0)
    # crest tip lifting off the dome
    top = base.points(G.spec_dirs(base, [("f", 500, 100)]))[0]
    spine = [top + np.array([0, 0.004, -0.004]), top + np.array([0, 0.006, 0.008]), np.array([0.0, -0.022, 1.907])]
    bm = G.blade(spine, lerp_fn([0, 1], [0.014, 0.0]), lerp_fn([0, 1], [0.010, 0.001]),
                 lambda t: (1.0, 0.0, 0.0), n=12)
    add(bm, "RX_Helmet_CrestTip", coll, "Gold", angle=28.0)

    build_horns(base, coll)


# Horn fan, suit's left (mirrored). Four gold blades rooted on the brow arm and the
# top of the head, all sweeping BACK in profile (right-07: tips 8-14 cm behind the
# visor front, blades leaning 25-48 deg from vertical) while front-10 sees the two
# front blades as the crescent horn (inner edge (536,140) -> tip (568,12), outer
# edge x ~572). Per blade: LE root, TE root (point specs on the shell), then LE and
# TE control points (metres) up to the shared tip, ridge thickness (root, mid, tip),
# and the dark recess groove (chord a0..a1, span s0..s1) or None.
HORNS = [
    # front blade (right-07 T2: tip (566, 30))
    ("Horn1", ("f", 521, 163), ("f", 537, 152),
     [(0.050, -0.100, 1.862), (0.069, -0.074, 1.915)], [(0.071, -0.086, 1.850), (0.083, -0.062, 1.906)],
     (0.086, -0.040, 1.960), (0.014, 0.010, 0.002), (0.18, 0.32, 0.05, 0.78)),
    # main horn, tallest (front-10 tip (568, 12); right-07 T1 tip (536, 8))
    ("Horn2", ("f", 537, 151), ("f", 556, 136),
     [(0.068, -0.068, 1.902), (0.083, -0.034, 1.957)], [(0.093, -0.046, 1.890), (0.096, -0.020, 1.948)],
     (0.090, -0.006, 1.994), (0.015, 0.010, 0.002), (0.16, 0.30, 0.06, 0.80)),
    # short blade between the main horn and the rear blade (right-07 T4: tip (537, 78))
    ("Horn3", ("f", 552, 141), ("f", 563, 129),
     [(0.086, -0.050, 1.866)], [(0.097, -0.040, 1.858)],
     (0.094, -0.004, 1.903), (0.012, 0.008, 0.002), None),
    # rear blade off the top of the head (right-07 T3: tip (497, 28)); hidden behind
    # the horn from the front
    ("Horn4", ("a", 46.0, 41.0), ("a", 64.0, 35.0),
     [(0.073, -0.010, 1.908)], [(0.088, 0.002, 1.892)],
     (0.081, 0.044, 1.958), (0.013, 0.009, 0.002), (0.18, 0.32, 0.08, 0.75)),
]


def build_horns(base, coll):
    for name, le_root, te_root, le_mid, te_mid, tip, thick, groove in HORNS:
        (a,), _ = G.on_surface(base, [le_root], lift=-0.002)
        (b,), _ = G.on_surface(base, [te_root], lift=-0.002)
        le = [tuple(a)] + le_mid + [tip]
        te = [tuple(b)] + te_mid + [tip]
        out = np.cross(np.asarray(te_mid[0]) - a, np.asarray(tip) - a)
        out = out if out[0] > 0 else -out           # blade face toward the outside
        horn(coll, "RX_Helmet_" + name, le, te, list(thick), tuple(out), inlay=groove)


# ------------------------------------------------------------------ temples
# Six layered feathers per side: black vanes with gold upper edges. Each hugs the
# side of the head along a root path (azimuth, elevation) sweeping back, then lifts
# off up-back-out to its tip (front-10 shows the top two tips at (583, 90) and
# (595, 114); right-07 / left-08 show the fan continuing down the side of the head).
# Tips stay at Y <= 0.066 to keep clear of the tail rising behind the left shoulder.
FEATHERS = [
    # root path, tip, bend, root width
    ([("a", 58.0, 25.0), ("a", 70.0, 28.0), ("a", 81.0, 31.0)], (0.108, 0.040, 1.918), (0.004, -0.008, 0.014), 0.026),
    ([("a", 60.0, 14.0), ("a", 73.0, 17.0), ("a", 85.0, 20.0)], (0.123, 0.052, 1.881), (0.005, -0.008, 0.014), 0.028),
    ([("a", 63.0, 3.0), ("a", 77.0, 6.0), ("a", 89.0, 9.0)], (0.129, 0.060, 1.843), (0.006, -0.008, 0.014), 0.029),
    ([("a", 67.0, -8.0), ("a", 81.0, -5.0), ("a", 94.0, -2.0)], (0.128, 0.064, 1.804), (0.006, -0.006, 0.012), 0.028),
    ([("a", 72.0, -19.0), ("a", 86.0, -16.0), ("a", 99.0, -13.0)], (0.123, 0.066, 1.766), (0.006, -0.006, 0.012), 0.027),
    ([("a", 78.0, -30.0), ("a", 92.0, -27.0), ("a", 105.0, -24.0)], (0.115, 0.064, 1.728), (0.005, -0.004, 0.010), 0.024),
]


def build_temples(ctx, base, coll):
    for k, (root, tip, bend, w) in enumerate(FEATHERS, 1):
        wf = lerp_fn([0, 0.4, 0.8, 1.0], [w, w * 0.9, w * 0.45, 0.0])
        lift = 0.0030 + 0.0012 * (k - 1)          # each feather lies over the one above it
        LE, TE, cen, sides, ss, nmean = G.swept_edges(base, root, tip, wf, bend=bend, lift=lift, n_root=9,
                                                      n_free=14, twist=0.40)
        bm = G.edge_blade(LE, TE, lerp_fn([0, 0.5, 1.0], [0.009, 0.007, 0.002]), n_span=len(LE), ridge_a=0.5,
                          outward=tuple(nmean), samples=2)
        add(bm, "RX_Helmet_Feather%d_L" % k, coll, "Black", angle=26.0, mirror=True)
        # gold upper edge riding the vane's leading edge
        ew = (0.0125, 0.0125, 0.0110, 0.0100, 0.0095, 0.0090)[k - 1]
        spine = [np.asarray(p) - sides[i] * 0.0012 for i, p in enumerate(LE)]
        bm = G.blade(spine, lerp_fn([0, 0.85, 1.0], [ew, ew * 0.6, 0.0]), lerp_fn([0, 1.0], [0.0105, 0.002]),
                     lambda t, S_=sides: tuple(S_[min(int(t * (len(S_) - 1)), len(S_) - 1)]), n=32)
        add(bm, "RX_Helmet_FeatherEdge%d_L" % k, coll, "Gold", angle=26.0, mirror=True)


# ------------------------------------------------------------------ back of the head
def build_back(ctx, base, coll):
    # gold crown chevron across the back of the head (apex up, mitred on X=0)
    band = [("b", 511, 141), ("b", 500, 148), ("b", 489, 158), ("b", 479, 171), ("b", 472, 189)]
    bm = G.rail(base, band, G.PROF_ROOF, lerp_fn([0, 0.8, 1.0], [0.023, 0.021, 0.013]),
                lerp_fn([0, 1.0], [0.0085, 0.007]), lift=0.0004, n=36, mitre_x0=True)
    add(bm, "RX_Helmet_CrownBand_L", coll, "Gold", angle=28.0, mirror=True)

    # back spike: a fin on the back of the crown, sweeping up and BACK like the horns
    lead = sag_points(base, [102.0])[0]
    trail = sag_points(base, [132.0])[0]
    tip = np.array([0.0, trail[1] + 0.016, 1.930])
    le = [lead - np.array([0, 0, 0.005]), lead + (tip - lead) * 0.5 + np.array([0, -0.004, 0.006]), tip]
    te = [trail - np.array([0, 0.004, 0.003]), trail + (tip - trail) * 0.5 + np.array([0, 0.003, 0.0]), tip]
    bm = G.edge_blade(le, te, lerp_fn([0, 0.5, 1.0], [0.022, 0.013, 0.002]), n_span=20, ridge_a=0.5,
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
    bm = G.rail(base, [("b", 511, 251), ("b", 511, 230), ("b", 511, 205), ("b", 511, 189)], G.PROF_ROOF,
                lerp_fn([0, 0.25, 0.45, 1.0], [0.006, 0.020, 0.016, 0.002]), lerp_fn([0, 0.2, 1.0], [0.004, 0.0105, 0.006]),
                lift=0.0040, n=26)
    add(bm, "RX_Helmet_NapeSpike", coll, "Gold", angle=28.0)


# ------------------------------------------------------------------ gorget
def join_bms(bms, name, coll, family, angle=30.0):
    obs = [L.from_bmesh(b, name, coll, family, angle) for b in bms]
    return L.join(obs, name)


def build_gorget(ctx, base, coll):
    ns = G.NeckSurf(ctx.body, clearance=0.004)
    tiers = [
        # z_top, z_shoulder, z_tip, plates, offset (deg), lift top, lift tip
        (1.716, 1.693, 1.668, 12, 0.0, 0.0010, 0.0060),
        (1.684, 1.657, 1.630, 12, 15.0, 0.0010, 0.0070),
        (1.648, 1.621, 1.590, 14, 0.0, 0.0010, 0.0080),
    ]
    for k, (zt, zs, zp, n, off, l0, l1) in enumerate(tiers, 1):
        bms = []
        step = 360.0 / n
        hw = step * 0.5 - 0.8
        for i in range(n):
            tc = ((off + i * step + 180.0) % 360.0) - 180.0
            if k == 3 and abs(tc) < 1.0:
                continue  # the throat V takes the front of the lowest tier
            outline = [(tc - hw, zt), (tc + hw, zt), (tc + hw, zs), (tc, zp), (tc - hw, zs)]

            def lift(z, zt=zt, zp=zp, l0=l0, l1=l1):
                return l0 + (l1 - l0) * (zt - z) / (zt - zp)

            bms.append(G.neck_plate(ns, outline, 0.0030, lift, res=0.0095, ridge=tc, ridge_h=0.0016))
        join_bms(bms, "RX_Helmet_Gorget%d" % k, coll, "Black", angle=28.0)

    # throat V under the chin, gold-edged
    def lift3(z):
        return 0.0012 + 0.0080 * (1.652 - z) / (1.652 - 1.586)

    bm = G.neck_plate(ns, [(-27.0, 1.652), (27.0, 1.652), (0.0, 1.586)], 0.0034, lift3, res=0.005, ridge=0.0,
                      ridge_h=0.0022)
    add(bm, "RX_Helmet_Throat", coll, "Black", angle=28.0)
    th = np.linspace(25.0, 1.5, 16)
    zz = 1.652 + (1.586 - 1.652) * (25.0 - th) / 25.0 + 0.002
    P, N = ns.points_normals(th, zz)
    P = P + N * np.asarray([lift3(z) + 0.0034 for z in zz])[:, None]
    bm = G.rail_pts(P, N, G.PROF_ROOF, lerp_fn([0, 1], [0.0060, 0.0040]), lambda t: 0.0030, lift=0.0)
    add(bm, "RX_Helmet_ThroatEdge_L", coll, "Gold", angle=28.0, mirror=True)


def build(ctx):
    coll = ctx.coll("helmet")
    base = make_base(ctx)
    build_shell(ctx, base, coll)
    build_face(ctx, base, coll)
    build_crown(ctx, base, coll)
    build_temples(ctx, base, coll)
    build_back(ctx, base, coll)
    build_gorget(ctx, base, coll)
    return base
