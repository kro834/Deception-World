"""Rexonance arms (below the pauldrons): wrapped sleeves, bracers, gauntlet
fists and the elbow blades. Authored on the suit's left (+X, *_L) and mirrored.

Read off front-10 / right-07 / back-09 and the 3/4 sheets (05, 06, 03, 04):
  * upper arm and forearm: a twisted braid of gold straps and glossy black
    ribbons spiralling down the arm (they descend from the back over the
    outside to the front and inside), on a build-up that flares the forearm
    toward the body and the back like the sheet's vambrace, with crystal
    shards inlaid in the black ribbons;
  * front-outer forearm: a faceted crystal "flame" panel that narrows to a
    pink stem running into the bracer;
  * outer forearm under the elbow: a tall gold-framed crystal diamond standing
    off the arm on a black riser, small crystal fins under it;
  * wrist: a thick two-tier gold bracer;
  * fist: black faceted gauntlet, back of the hand facing out with a big
    gold-framed kite gem, gold studs on the knuckles, curled segmented fingers
    and the thumb across the front;
  * elbow: a long gold-edged sickle blade and a crystal blade sweeping down
    and out past the fist, a thin gold rod ending in a double-spike pendant,
    and a crystal ribbon arcing from the back of the upper arm.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import part_arms_geo as G
import rx_lib as L

TAU = 2.0 * math.pi
DEG = math.pi / 180.0

# Braid helix: phi = psi - K * s (s runs down the arm), so a band climbs the
# arm turning from the front over the outside to the back.
PITCH = 0.42
K = TAU / PITCH
N_PAIRS = 5                 # gold strap + black ribbon pairs around the arm
PSI0 = 10.0 * DEG           # phase of the first gold strap
GOLD_FRAC = 0.40            # share of each pair's angle taken by the strap
Z_TOP = 1.478               # sleeve hem under the pauldron
Z_BOT = 1.043               # sleeve hem inside the bracer


def V(*a):
    return Vector(a)


def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def ang_win(phi, centre, half):
    d = (phi - centre + math.pi) % TAU - math.pi
    if abs(d) >= half:
        return 0.0
    return math.cos(0.5 * math.pi * d / half) ** 2


def lerp_table(table, x):
    """Piecewise-linear lookup in [(x, y), ...] sorted by x."""
    if x <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return table[-1][1]


class Arm:
    """Landmarks, the body-arm surface map and the forearm build-up."""

    def __init__(self, ctx):
        LM = ctx.LM
        self.S = V(*LM["shoulder"])
        self.E = V(*LM["elbow"])
        self.W = V(*LM["wrist"])
        self.F = V(*LM["fist"])
        P0 = V(0.205, 0.005, 1.536)
        ctrl = [P0, P0.lerp(self.E, 0.5), self.E, self.E.lerp(self.W, 0.5), self.W, self.F]
        self.surf = G.ArmSurf(ctx.body, ctrl)
        surf = self.surf

        def bulk(s, phi):
            z = surf.axis(s)[0].z
            med = smoothstep(1.060, 1.140, z) * (1.0 - smoothstep(1.205, 1.300, z))
            back = smoothstep(1.070, 1.150, z) * (1.0 - smoothstep(1.215, 1.300, z))
            return 0.021 * med * ang_win(phi, 185 * DEG, 95 * DEG) + 0.011 * back * ang_win(phi, 75 * DEG, 70 * DEG)

        surf.set_shell(bulk)

    def s(self, z):
        return self.surf.s_at_z(z)


# ------------------------------------------------------------------ braid
Z_ELBOW = 1.250             # upper-arm wrap ends here, under the vambrace tips
UPPER_SHIFT = 0.5           # upper-arm wrap phase offset (in pairs)


def vambrace_top(arm, psi):
    """s where a forearm band centred at psi ends in its pointed tip: the
    tips stand higher over the outer/back elbow and lower in the crook."""
    s0 = arm.s(1.285)
    for _ in range(4):
        phi = psi - K * s0
        z = 1.282 + 0.022 * math.cos(phi - 50.0 * DEG)
        s0 = arm.s(z)
    return s0


def build_braid(arm, coll):
    """Upper-arm wrap (pauldron to elbow) and forearm vambrace (elbow to
    bracer): gold straps and scaled black ribbons spiralling down the arm. The
    vambrace bands end at the elbow in raised spear points over the wrap."""
    surf = arm.surf
    pair = TAU / N_PAIRS
    gold_w = pair * GOLD_FRAC
    gold, black = [], []
    gus = [-1.0, -0.72, 0.72, 1.0]
    bus = [-1.0, -0.72, -0.28, 0.28, 0.72, 1.0]

    def gold_lift(u, v):
        return 0.0074 if abs(u) < 0.9 else 0.0042

    def black_lift(u, v):
        a = abs(u)
        if a > 0.99:
            return 0.0022
        return 0.0041 + 0.0007 * (1.0 - a)

    # upper-arm wrap
    s0, s1 = arm.s(Z_TOP), arm.s(Z_ELBOW)
    n_s = 34
    for k in range(N_PAIRS):
        p = PSI0 + (k + UPPER_SHIFT) * pair
        gold.append(G.helix_band(surf, p, p + gold_w, s0, s1, K, n_s, gus, gold_lift, gap=0.0007))
        black.append(G.helix_band(surf, p + gold_w, p + pair, s0, s1, K, n_s, bus, black_lift, gap=0.0007))
    # forearm vambrace: bands rise over the wrap near the elbow and end in points
    s_bot = arm.s(Z_BOT)
    s_lap = arm.s(Z_ELBOW + 0.012)

    def raised(fn, extra):
        def f(u, v, fn=fn):
            return fn(u, v) + extra(v)
        return f

    for k in range(N_PAIRS):
        p = PSI0 + k * pair
        for lo, hi, fn, out, us_, tip_len, fl in ((p, p + gold_w, gold_lift, gold, gus, 0.040, 0.0030),
                                                  (p + gold_w, p + pair, black_lift, black, bus, 0.022, 0.0)):
            st = vambrace_top(arm, 0.5 * (lo + hi)) + (0.010 if fl == 0.0 else 0.0)
            n = max(int((s_bot - st) / 0.0068), 12)

            def extra(v, st=st, fl=fl):
                s = st + (s_bot - st) * v
                # lift over the wrap where they overlap, flick the gold points outward
                lap = 1.0 - smoothstep(s_lap, s_lap + 0.03, s)
                flick = (1.0 - smoothstep(st, st + 0.03, s)) ** 2
                return 0.0040 * lap + fl * flick

            out.append(G.helix_band(surf, lo, hi, st, s_bot, K, n, us_, raised(fn, extra), gap=0.0007, tip=(tip_len, 1.25)))
    obs = [
        L.from_bmesh(G.bm_join(gold), "RX_Arms_BraidGold_L", coll, "Gold", angle=30),
        L.from_bmesh(G.bm_join(black), "RX_Arms_BraidScale_L", coll, "Suit", angle=40),
    ]
    return obs


def build_shards(arm, coll):
    """Crystal shards inlaid on the black ribbons (pointed both ends)."""
    surf = arm.surf
    pair = TAU / N_PAIRS
    gold_w = pair * GOLD_FRAC
    us = [-1.0, -0.5, 0.0, 0.5, 1.0]
    # (ribbon index, z top, z bottom)
    spots = [
        (0, 1.462, 1.360), (1, 1.445, 1.340), (2, 1.466, 1.372), (3, 1.436, 1.330),
        (4, 1.455, 1.352), (0, 1.335, 1.262), (1, 1.318, 1.236), (2, 1.348, 1.272),
        (3, 1.312, 1.228), (4, 1.330, 1.250),
        (2, 1.125, 1.060), (4, 1.168, 1.092), (0, 1.232, 1.150), (1, 1.110, 1.058),
    ]
    out = []
    for rib, za, zb in spots:
        shift = UPPER_SHIFT if za > Z_ELBOW + 0.02 else 0.0
        psi = PSI0 + (rib + shift) * pair + gold_w + 0.5 * (pair - gold_w)
        sa, sb = arm.s(za), arm.s(zb)

        def c(v, sa=sa, sb=sb, psi=psi):
            s = sa + (sb - sa) * v
            return s, psi - K * s

        def hw(v):
            t = 1.0 - abs(2.0 * v - 1.0)
            return max(0.0105 * t ** 0.55, 0.0003)

        def lift(u, v):
            t = 1.0 - abs(2.0 * v - 1.0)
            return 0.0040 + 0.0048 * (1.0 - abs(u) ** 1.3) * min(1.0, t * 2.5)

        out.append(G.band_on_surf(surf, c, hw, 22, us, lift))
    ob = L.from_bmesh(G.bm_join(out), "RX_Arms_SleeveShards_L", coll, "Crystal", angle=25)
    L.tint(ob, fn=lambda co, uv: (min(1.0, 0.15 + 0.5 * uv[1]), 0.6, 0.6))
    return [ob]


# ------------------------------------------------------------------ forearm crystals
FLAME_PHI = 336.0 * DEG
FLAME_HW = [(1.046, 0.0088), (1.080, 0.0092), (1.105, 0.0110), (1.125, 0.0180), (1.150, 0.0290),
            (1.180, 0.0360), (1.215, 0.0350), (1.245, 0.0240), (1.272, 0.0030)]


FLAME_BACK_PHI = 78.0 * DEG
FLAME_BACK_HW = [(1.046, 0.0075), (1.085, 0.0080), (1.110, 0.0100), (1.135, 0.0170),
                 (1.165, 0.0250), (1.195, 0.0255), (1.225, 0.0170), (1.252, 0.0025)]


def build_flame(arm, coll, phi_c=None, table=None, name="RX_Arms_ForearmFlame_L", drift_deg=6.0, rim=True):
    """Forearm crystal panel: wide faceted top, pink stem into the bracer."""
    surf = arm.surf
    phi_c = FLAME_PHI if phi_c is None else phi_c
    table = FLAME_HW if table is None else table
    za, zb = table[-1][0], table[0][0]
    sa, sb = arm.s(za), arm.s(zb)
    us = [-1.0, -0.66, -0.30, 0.0, 0.30, 0.66, 1.0]

    def phis(v):
        s = sa + (sb - sa) * v
        z = surf.axis(s)[0].z
        hw = lerp_table(table, z)
        r = max(surf.r_total(s, phi_c), 0.02)
        drift = drift_deg * DEG * (1.0 - v)
        c = phi_c + drift
        return c - hw / r, c + hw / r

    def lift(u, v):
        a = abs(u)
        # pyramid facets with chevron creases down the panel
        ridge = 0.0050 * (1.0 - a)
        chev = 0.0011 * (1.0 - a) * abs(((v * 7.0 + a * 1.5) % 1.0) - 0.5) * 2.0
        top = 0.0080 + (ridge + chev) * (0.55 + 0.45 * smoothstep(0.0, 0.2, v)) * (1.0 - 0.45 * smoothstep(0.6, 0.9, v))
        return top

    bm = G.surf_patch(surf, sa, sb, phis, 48, us, lift)
    ob = L.from_bmesh(bm, name, coll, "Crystal", angle=22)
    L.tint(ob, fn=lambda co, uv: (smoothstep(0.35, 0.80, uv[1]), 0.75, 0.7))
    obs = [ob]
    if rim:
        # gold frame around the panel (a wall from the body up past the crystal edge)
        n = 40
        loop = []
        for i in range(n):
            v = i / (n - 1)
            loop.append((sa + (sb - sa) * v, phis(v)[1]))
        for i in range(n - 1, -1, -1):
            v = i / (n - 1)
            loop.append((sa + (sb - sa) * v, phis(v)[0]))
        path, nrm = [], []
        for ss, ph in loop:
            path.append(surf.point(ss, ph, 0.0048))
            nrm.append(surf.normal(ss, ph))
        clean_p, clean_n = [path[0]], [nrm[0]]
        for q, nn in zip(path[1:], nrm[1:]):
            if (q - clean_p[-1]).length > 0.0015:
                clean_p.append(q)
                clean_n.append(nn)
        prof = L.rounded_rect_profile(0.0125, 0.0042, 0.0012, 1)
        bmr = L.sweep(clean_p, prof, normals=clean_n, closed=True)
        obs.append(L.from_bmesh(bmr, name.replace("Flame", "FlameRim"), coll, "Gold", angle=35))
    return obs


def build_diamond(arm, coll):
    """Tall gold-framed crystal diamond standing off the outer forearm."""
    surf = arm.surf
    zc = 1.178
    s = arm.s(zc)
    phi = 30.0 * DEG
    A, T, e1, e2 = surf.axis(s)
    radial = surf.dir(s, phi)
    base_pt = surf.base(s, phi)
    up = -T
    stand = 0.021
    o = base_pt + radial * stand
    M = L.frame_from_normal(o, radial, up)
    hh, hw = 0.078, 0.034
    outline = [(0.0, hh), (-hw, 0.0), (0.0, -hh), (hw, 0.0)]
    obs = []
    frame = L.band(outline, 0.0100, 0.0092, bevel=0.0018, matrix=M)
    obs.append(L.from_bmesh(frame, "RX_Arms_DiamondFrame_L", coll, "Gold", angle=30))
    inner = L.offset_outline(L.ccw(outline), -0.0095)
    xs = [p[0] for p in inner]
    ys = [p[1] for p in inner]
    gem = L.gem_kite(max(xs) - min(xs), max(ys) - min(ys), 0.0085, table=0.30,
                     matrix=M @ Matrix.Translation((0.0, 0.0, 0.0015)))
    g = L.from_bmesh(gem, "RX_Arms_DiamondCrystal_L", coll, "Crystal", angle=15)
    L.tint(g, pink=0.35, sparkle=0.9, edge=0.8)
    obs.append(g)
    # black riser from inside the arm to the frame
    riser_outline = L.offset_outline(L.ccw(outline), -0.0035)
    riser = L.prism(riser_outline, stand + 0.020, bevel=0.0015, matrix=M @ Matrix.Translation((0.0, 0.0, -(stand + 0.020) + 0.0005)))
    obs.append(L.from_bmesh(riser, "RX_Arms_DiamondRiser_L", coll, "Black", angle=30))
    L.glint("Arms_Diamond_L", (M @ V(0.0, 0.0, 0.008)), 0.03, coll, 0.4)
    return obs


# ------------------------------------------------------------------ bracer
def build_bracer(arm, coll):
    surf = arm.surf
    zc = 1.030
    s = arm.s(zc)
    A, T, e1, e2 = surf.axis(s)
    up = -T
    o = A
    main = G.chamfer_ring_profile(0.0362, 0.0498, -0.0250, 0.0110, c_out=0.0032, c_in=0.0012, c_out_bot=0.0036)
    lip = G.chamfer_ring_profile(0.0385, 0.0512, 0.0148, 0.0258, c_out=0.0030, c_in=0.0022, c_out_bot=0.0018)
    groove = G.chamfer_ring_profile(0.0372, 0.0480, 0.0100, 0.0156, c_out=0.0008)
    obs = []
    bm = G.bm_join([G.revolve(main, o, up, seg=64, ref=e1), G.revolve(lip, o, up, seg=64, ref=e1)])
    obs.append(L.from_bmesh(bm, "RX_Arms_Bracer_L", coll, "Gold", angle=30))
    obs.append(L.from_bmesh(G.revolve(groove, o, up, seg=64, ref=e1), "RX_Arms_BracerGroove_L", coll, "GoldDark", angle=30))
    return obs


# ------------------------------------------------------------------ gauntlet
class Hand:
    """Hand frame at the wrist: u = back of the hand (out, turned 15 deg to the
    front), v = thumb side (front), w = up the forearm."""

    def __init__(self, arm, z=1.004, turn=-22.0 * DEG):
        surf = arm.surf
        s = arm.s(z)
        A, T, e1, e2 = surf.axis(s)
        self.o = A.copy()
        self.w = (-T).normalized()
        self.u = (e1 * math.cos(turn) + e2 * math.sin(turn)).normalized()
        self.v = self.u.cross(self.w).normalized()
        self.u = self.w.cross(self.v).normalized()
        # right-07 hangs the fist a little behind the body's wrist
        self.o = self.o - self.v * 0.006

    def p(self, u, v, w):
        return self.o + self.u * u + self.v * v + self.w * w

    def d(self, u, v, w):
        return (self.u * u + self.v * v + self.w * w).normalized()

    def matrix(self, origin_uvw, x_uvw, y_uvw):
        o = self.p(*origin_uvw)
        x = self.d(*x_uvw)
        y = self.d(*y_uvw)
        return L.frame(o, x, y)


def facet_bar(p0, p1, up, w0, w1, h0, h1, ridge=0.28, chamfer=0.0022, end_scale=0.78):
    """Faceted finger segment from p0 to p1: a 'house' section (flat palm side,
    sloped dorsal roof with a ridge) facing `up`, chamfered ends."""
    p0, p1 = Vector(p0), Vector(p1)
    z = (p1 - p0)
    ln = z.length
    z.normalize()
    y = Vector(up)
    y = (y - z * y.dot(z)).normalized()
    x = y.cross(z).normalized()

    def section(w, h, sc):
        hw, hh = 0.5 * w * sc, 0.5 * h * sc
        r = hh * ridge * 2.0
        return [(-hw, -hh), (hw, -hh), (hw, hh - r), (hw * 0.45, hh - r * 0.25), (0.0, hh), (-hw * 0.45, hh - r * 0.25), (-hw, hh - r)]

    c = min(chamfer, ln * 0.3)
    stations = [(0.0, end_scale), (c / ln, 1.0), (1.0 - c / ln, 1.0), (1.0, end_scale)]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    rings = []
    for t, sc in stations:
        w = w0 + (w1 - w0) * t
        h = h0 + (h1 - h0) * t
        o = p0 + (p1 - p0) * t
        rings.append([bm.verts.new(o + x * px + y * py) for px, py in section(w, h, sc)])
    m = len(rings[0])
    for a in range(len(rings) - 1):
        for j in range(m):
            j2 = (j + 1) % m
            f = bm.faces.new((rings[a][j], rings[a][j2], rings[a + 1][j2], rings[a + 1][j]))
            for lp in f.loops:
                lp[uvl].uv = (j / m, a / 3.0)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return bm


def pill_bar(p0, p1, up, w0, w1, h0, h1, p=2.8, n=12, chamfer=0.004, end_scale=0.80, crown=0.0):
    """Rounded finger segment: superellipse section (width along x, height
    along `up`), chamfered ends. crown > 0 pinches the dorsal top into a soft
    ridge (armour plate look)."""
    p0, p1 = Vector(p0), Vector(p1)
    z = (p1 - p0)
    ln = z.length
    z.normalize()
    y = Vector(up)
    y = (y - z * y.dot(z)).normalized()
    x = y.cross(z).normalized()
    base = L.superellipse_profile(n, 1.0, 1.0, p)
    c = min(chamfer, ln * 0.3)
    stations = [(0.0, end_scale), (c / ln, 1.0), (1.0 - c / ln, 1.0), (1.0, end_scale)]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    rings = []
    for t, sc in stations:
        w = (w0 + (w1 - w0) * t) * 0.5 * sc
        h = (h0 + (h1 - h0) * t) * 0.5 * sc
        o = p0 + (p1 - p0) * t
        ring = []
        for px, py in base:
            yy = py
            if crown > 0 and py > 0:
                yy = py * (1.0 + crown * (1.0 - abs(px)) ** 2)
            ring.append(bm.verts.new(o + x * (px * w) + y * (yy * h)))
        rings.append(ring)
    m = len(rings[0])
    for a in range(len(rings) - 1):
        for j in range(m):
            j2 = (j + 1) % m
            f = bm.faces.new((rings[a][j], rings[a][j2], rings[a + 1][j2], rings[a + 1][j]))
            for lp in f.loops:
                lp[uvl].uv = (j / m, a / 3.0)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return bm


def build_gauntlet(arm, coll):
    H = Hand(arm)
    obs = []
    black = []
    # wrist sleeve between the bracer and the hand
    prof = [(0.0300, -0.020), (0.0400, -0.020), (0.0418, -0.012), (0.0405, 0.006), (0.0380, 0.022), (0.0300, 0.022)]
    black.append(G.revolve(prof, H.p(0, 0, 0), H.w, seg=32, ref=H.u))
    # hand body: faceted (decagon) block from inside the bracer down to the knuckles
    path = [H.p(0.008, -0.002, 0.012), H.p(0.008, -0.002, -0.040), H.p(0.008, -0.002, -0.092)]
    prof = [(1.0, 0.0), (0.86, 0.62), (0.40, 0.98), (-0.40, 0.98), (-0.86, 0.62),
            (-1.0, 0.0), (-0.86, -0.62), (-0.40, -0.98), (0.40, -0.98), (0.86, -0.62)]

    def hb_scale(t):
        return (0.032 + 0.003 * t, 0.046 + 0.010 * t)

    black.append(L.sweep(path, prof, scale=hb_scale, up=H.u))
    # back-of-hand plate: faceted frustum (8 facets) rising from the shield
    # edge to a plateau that carries the gem frame. Local frame: x = -v (back),
    # y = w tilted with the gem, z = +u (out), origin at the gem centre.
    tilt = 12.0 * DEG
    gx = H.d(0, -math.cos(tilt), -math.sin(tilt))
    gy = H.d(0, -math.sin(tilt), math.cos(tilt))
    gc = H.p(0.0475, -0.011, -0.037)
    Mg = L.frame(gc, gx, gy)
    hh, hw = 0.047, 0.032
    rh = [(0.0, hh + 0.005), (-(hw * 0.5 + 0.004), hh * 0.5 + 0.004), (-(hw + 0.005), 0.0), (-(hw * 0.5 + 0.004), -(hh * 0.5 + 0.004)),
          (0.0, -(hh + 0.005)), (hw * 0.5 + 0.004, -(hh * 0.5 + 0.004)), (hw + 0.005, 0.0), (hw * 0.5 + 0.004, hh * 0.5 + 0.004)]
    outer = [(-0.010 + x, y) for x, y in [(0.0, 0.044), (-0.042, 0.036), (-0.053, 0.0), (-0.048, -0.040), (0.0, -0.062),
                                         (0.048, -0.040), (0.053, 0.0), (0.042, 0.036)]]
    black.append(G.loft_plate(L.ccw(outer), L.ccw(rh), -0.0075, 0.0, -0.020, matrix=Mg))
    # pinky-side plate (hypothenar): faceted, local x = w (up), y = u (out), z = -v
    side = [(0.006, -0.026), (0.006, 0.030), (-0.026, 0.040), (-0.074, 0.034), (-0.088, 0.004),
            (-0.076, -0.028), (-0.030, -0.034)]
    side_in = L.offset_outline(L.ccw(side), -0.0085)
    Ms = L.frame(H.p(0.004, -0.0505, 0.0), H.w, H.u)
    black.append(G.loft_plate(L.ccw(side), side_in, 0.0022, 0.0078, -0.014, matrix=Ms))
    # thenar pad (thumb base)
    black.append(pill_bar(H.p(0.014, 0.050, -0.004), H.p(0.002, 0.058, -0.052), H.d(0.2, 1, 0),
                          0.046, 0.042, 0.026, 0.024, p=3.0, chamfer=0.005, crown=0.3))
    fingers = [0.0390, 0.0130, -0.0130, -0.0390]
    for i, fv in enumerate(fingers):
        sc = (0.97, 1.0, 0.97, 0.88)[i]
        dw = (0.003, 0.0, 0.0, 0.009)[i]
        du = (0.0, 0.0, 0.0, 0.006)[i]
        wd = 0.0250 * sc
        # MCP knuckle cap (lateral-bottom corner)
        black.append(pill_bar(H.p(0.044, fv, -0.094 + dw), H.p(0.020, fv, -0.104 + dw), H.d(0.4, 0, -1),
                              wd * 1.02, wd, 0.026 * sc, 0.026 * sc, p=2.6, chamfer=0.005, crown=0.3))
        # proximal: knuckle -> medial along the bottom
        black.append(pill_bar(H.p(0.020, fv, -0.104 + dw), H.p(-0.042 + du, fv, -0.124 + dw), H.d(0.25, 0, -1),
                              wd, wd * 0.97, 0.030 * sc, 0.028 * sc, p=2.7, chamfer=0.004, crown=0.25))
        # PIP knuckle (bottom-medial corner)
        black.append(pill_bar(H.p(-0.044 + du, fv, -0.128 + dw), H.p(-0.068 + du, fv, -0.104 + dw), H.d(-1, 0, -1),
                              wd * 0.97, wd * 0.95, 0.024 * sc, 0.024 * sc, p=2.6, chamfer=0.005, crown=0.3))
        # middle: up the medial face
        black.append(pill_bar(H.p(-0.068 + du, fv, -0.102 + dw), H.p(-0.064 + du, fv, -0.050 + dw), H.d(-1, 0, 0.0),
                              wd * 0.95, wd * 0.92, 0.027 * sc, 0.025 * sc, p=2.7, chamfer=0.004, crown=0.25))
        # distal: tucked back over the top toward the palm
        black.append(pill_bar(H.p(-0.060 + du, fv, -0.046 + dw), H.p(-0.040, fv, -0.040 + dw), H.d(-0.45, 0, 1),
                              wd * 0.92, wd * 0.86, 0.022 * sc, 0.020 * sc, p=2.6, chamfer=0.004, crown=0.25))
    # thumb: proximal and distal across the front of the index and middle fingers
    black.append(pill_bar(H.p(-0.004, 0.062, -0.050), H.p(-0.058, 0.060, -0.074), H.d(-0.1, 1, 0.1),
                          0.028, 0.027, 0.026, 0.025, p=2.7, chamfer=0.005, crown=0.3))
    black.append(pill_bar(H.p(-0.062, 0.058, -0.076), H.p(-0.084, 0.024, -0.084), H.d(-1, 0.4, 0),
                          0.026, 0.021, 0.022, 0.018, p=2.6, chamfer=0.005, crown=0.3))
    obs.append(L.from_bmesh(G.bm_join(black), "RX_Arms_Gauntlet_L", coll, "Black", angle=34))

    # back-of-hand gem: gold kite frame + jewel, tilted 12 deg (top toward the back),
    # its top tucked under the bracer like the sheet
    outline = [(0.0, hh), (-hw, 0.002), (0.0, -hh), (hw, -0.002)]
    obs.append(L.from_bmesh(L.band(outline, 0.0082, 0.0078, bevel=0.0013, matrix=Mg), "RX_Arms_HandGemFrame_L", coll, "Gold", angle=30))
    inner = L.offset_outline(L.ccw(outline), -0.0078)
    xs = [p[0] for p in inner]
    ys = [p[1] for p in inner]
    gem = L.gem_kite(max(xs) - min(xs), max(ys) - min(ys), 0.0085, table=0.32, matrix=Mg @ Matrix.Translation((0.0, 0.0, 0.0012)))
    obs.append(L.from_bmesh(gem, "RX_Arms_HandGem_L", coll, "Gem", angle=15))
    L.glint("Arms_HandGem_L", Mg @ V(0.0, 0.0, 0.010), 0.028, coll, 0.3)

    # gold knuckle studs on index, middle and ring
    studs = []
    stud_prof = [(0.0, -0.004), (0.0098, -0.004), (0.0100, 0.0010), (0.0094, 0.0040), (0.0078, 0.0068), (0.0054, 0.0092),
                 (0.0028, 0.0112), (0.0010, 0.0126), (0.0, 0.0130)]
    for fv in fingers[:3]:
        o = H.p(0.046, fv - 0.006, -0.090)
        d = H.d(1.0, 0.0, -0.75)
        studs.append(G.revolve(stud_prof, o, d, seg=14, ref=H.v))
    obs.append(L.from_bmesh(G.bm_join(studs), "RX_Arms_KnuckleStuds_L", coll, "Gold", angle=28))
    return obs


# ------------------------------------------------------------------ elbow blades
def arm_radial(arm, p):
    """Horizontal direction from the arm axis (at p's height) to p."""
    A = arm.surf.axis(arm.s(p.z))[0]
    d = Vector((p.x - A.x, p.y - A.y, 0.0))
    return d.normalized() if d.length > 1e-6 else Vector((1.0, 0.0, 0.0))


def blade_sweep(arm, pts, width_fn, thick_fn, samples=10, n=48, prof_n=10, offset=0.0, sharp=1.6, twist_deg=0.0):
    """Lens-section blade along a smooth path. The width runs along the
    horizontal radial from the arm (outer edge away from the arm), so the
    blade wraps the arm like the sheet's sickles. offset shifts the section
    along the width (in width units) to make edge strips."""
    path = L.resample(L.catmull_rom([Vector(p) for p in pts], samples), n)
    normals = []
    for i, p in enumerate(path):
        r = arm_radial(arm, p)
        if twist_deg:
            T = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
            r = Matrix.Rotation(math.radians(twist_deg) * i / (n - 1), 3, T) @ r
        normals.append(r)
    prof = [(x + offset, y) for x, y in L.lens_profile(prof_n, 1.0, 1.0, sharp)]
    return L.sweep(path, prof, scale=lambda t: (max(width_fn(t), 1e-4), max(thick_fn(t), 1e-4)), normals=normals)


def build_elbow(arm, coll):
    surf = arm.surf
    obs = []
    z0 = 1.236
    s0 = arm.s(z0)
    phi0 = 58.0 * DEG
    root = surf.point(s0, phi0, 0.004)
    rdir = surf.normal(s0, phi0)
    # mount boss on the back-outer elbow: black faceted socket + gold collar
    Mb = L.frame_from_normal(root, rdir, (0.0, 0.0, 1.0))
    boss = L.prism([(0.0, 0.030), (-0.020, 0.008), (-0.014, -0.026), (0.014, -0.026), (0.020, 0.008)], 0.016,
                   bevel=0.0025, matrix=Mb @ Matrix.Translation((0.0, 0.0, -0.010)))
    obs.append(L.from_bmesh(boss, "RX_Arms_ElbowMount_L", coll, "Black", angle=30))
    collar = G.revolve(G.chamfer_ring_profile(0.0075, 0.0125, -0.004, 0.004, c_out=0.0015), root + rdir * 0.006,
                       (rdir * 0.6 + Vector((0.0, 0.0, -0.8))).normalized(), seg=16)
    obs.append(L.from_bmesh(collar, "RX_Arms_ElbowCollar_L", coll, "Gold", angle=30))
    start = root + rdir * 0.004

    # sickle: black core, gold outer edge, crystal inner edge (front-10 both arms)
    sickle = [start, V(0.470, 0.150, 1.140), V(0.528, 0.212, 1.030), V(0.552, 0.256, 0.940),
              V(0.552, 0.280, 0.860), V(0.538, 0.290, 0.795)]

    def sk_w(t):
        return 0.026 + 0.036 * math.sin(0.5 * math.pi * min(t / 0.5, 1.0)) - 0.062 * smoothstep(0.58, 1.0, t)

    def sk_th(t):
        return 0.0080 * (1.0 - 0.75 * smoothstep(0.6, 1.0, t))

    blade = blade_sweep(arm, sickle, sk_w, sk_th, n=56)
    obs.append(L.from_bmesh(blade, "RX_Arms_Sickle_L", coll, "Black", angle=35))
    edge = blade_sweep(arm, sickle, lambda t: sk_w(t) * 0.34, lambda t: sk_th(t) * 1.2 + 0.0008, n=56, offset=1.03)
    obs.append(L.from_bmesh(edge, "RX_Arms_SickleEdge_L", coll, "Gold", angle=30))
    inner = blade_sweep(arm, sickle, lambda t: sk_w(t) * 0.30, lambda t: sk_th(t) * 1.15 + 0.0006, n=56, offset=-1.233)
    iob = L.from_bmesh(inner, "RX_Arms_SickleCrystal_L", coll, "Crystal", angle=30)
    L.tint(iob, fn=lambda co, uv: (smoothstep(0.45, 1.0, uv[1]), 0.6, 0.9))
    obs.append(iob)

    # long crystal ribbon: from the elbow behind the sickle, down past the fist
    rib = [start + V(-0.004, 0.0, 0.006), V(0.445, 0.170, 1.120), V(0.478, 0.250, 1.000), V(0.492, 0.296, 0.900),
           V(0.486, 0.296, 0.800), V(0.466, 0.270, 0.712)]

    def rb_w(t):
        return 0.016 + 0.024 * math.sin(0.5 * math.pi * min(t / 0.45, 1.0)) - 0.040 * smoothstep(0.70, 1.0, t)

    rb = blade_sweep(arm, rib, rb_w, lambda t: 0.0062 * (1.0 - 0.6 * t), n=56, twist_deg=-30.0)
    rob = L.from_bmesh(rb, "RX_Ribbon_Arm2_L", coll, "Crystal", angle=30)
    L.tint(rob, fn=lambda co, uv: (smoothstep(0.40, 0.95, uv[1]), 0.7, 0.8))
    rob["rx_keep"] = 1
    obs.append(rob)

    return obs


def build_rod_pendant(arm, coll):
    """Gold rod from the elbow down to the double-spike pendant. front-10 and
    back-09 show it on the suit's RIGHT arm only (front-10 ~(130, 840-960)),
    so it is authored on +X and only the mirrored copy is kept."""
    surf = arm.surf
    s0 = arm.s(1.236)
    root = surf.point(s0, 58.0 * DEG, 0.004)
    start = root + surf.normal(s0, 58.0 * DEG) * 0.004
    top = V(0.494, 0.192, 0.912)
    rod_pts = [start + V(0.0, 0.004, 0.002), V(0.440, 0.122, 1.125), V(0.472, 0.162, 1.020),
               V(0.490, 0.186, 0.950), top]
    rod = blade_sweep(arm, rod_pts, lambda t: 0.0086 - 0.0012 * t, lambda t: 0.0060 - 0.0008 * t, n=40, prof_n=12, sharp=1.0)
    obs = [L.from_bmesh(rod, "RX_Arms_Rod_L", coll, "Gold", angle=40)]
    obs += build_pendant(top, coll)
    return obs


def build_gold_blade(arm, coll):
    """Thin gold sickle on the suit's LEFT arm where the right arm carries the
    pendant: front-10 shows it curving out past the fist and hooking back in to
    a point at ~(822, 900)."""
    surf = arm.surf
    s0 = arm.s(1.236)
    root = surf.point(s0, 58.0 * DEG, 0.004)
    start = root + surf.normal(s0, 58.0 * DEG) * 0.006
    pts = [start, V(0.446, 0.128, 1.130), V(0.478, 0.160, 1.030), V(0.490, 0.176, 0.960),
           V(0.478, 0.176, 0.892), V(0.452, 0.166, 0.848), V(0.428, 0.156, 0.822)]

    def w(t):
        return 0.0090 + 0.0030 * math.sin(math.pi * min(t / 0.6, 1.0) * 0.5) - 0.0118 * smoothstep(0.62, 1.0, t)

    bm = blade_sweep(arm, pts, w, lambda t: 0.0050 * (1.0 - 0.6 * smoothstep(0.6, 1.0, t)), n=48, prof_n=10, sharp=1.2)
    return [L.from_bmesh(bm, "RX_Arms_GoldBlade_L", coll, "Gold", angle=35)]


def concave_knob(length, rx, f=0.5, p=1.8, r_end=0.0035, steps=6):
    """(r, h) lathe profile of a 4-point star spindle: concave flanks from each
    tip out to the widest ridge at fraction f (h runs 0 .. length downward)."""
    prof = [(0.0, 0.0), (r_end, 0.0)]
    hw = f * length
    for i in range(1, steps + 1):
        t = i / steps
        prof.append((max(rx * t ** p, r_end), hw * t))
    for i in range(1, steps + 1):
        t = i / steps
        prof.append((max(rx * (1.0 - t) ** p, r_end), hw + (length - hw) * t))
    prof.append((0.0, length))
    return prof


def build_pendant(top, coll, tilt_deg=18.0):
    """Double-spike gold finial (front-10 ~(130, 840-960)): collar, a slim
    star spindle, the big star spindle and the final spike. The spindles have
    concave flanks and four ridges square to the body; the finial hangs on
    from the rod's curve, its tip swinging in toward the body."""
    a = math.radians(tilt_deg)
    axis = Vector((-math.sin(a), 0.0, -math.cos(a)))

    def at(d):
        return top + axis * d

    parts = []

    def lathe(prof, d, seg=4, phase=0.0):
        # revolve() keeps h along axis_dir; profiles here run h downward from `d`
        return G.revolve([(r, h) for r, h in prof], at(d), axis, seg=seg, ref=(1.0, 0.0, 0.0), phase=phase)

    parts.append(lathe(G.chamfer_ring_profile(0.0, 0.0068, -0.004, 0.006, c_out=0.0016), 0.002, seg=12))
    parts.append(lathe(concave_knob(0.041, 0.0180, f=0.45), 0.007))
    parts.append(lathe(G.chamfer_ring_profile(0.0, 0.0068, -0.003, 0.003, c_out=0.0012), 0.050, seg=12))
    parts.append(lathe(concave_knob(0.064, 0.0320, f=0.50, p=1.9), 0.054))
    parts.append(lathe(G.chamfer_ring_profile(0.0, 0.0062, -0.003, 0.003, c_out=0.0012), 0.120, seg=12))
    spike = [(0.0, 0.0), (0.0042, 0.0), (0.0110, 0.012), (0.0060, 0.030), (0.0022, 0.052), (0.0, 0.058)]
    parts.append(lathe(spike, 0.124))
    ob = L.from_bmesh(G.bm_join(parts), "RX_Arms_Pendant_L", coll, "Gold", angle=28)
    return [ob]


def build_ribbon(arm, coll):
    """Crystal ribbon arcing out and back from the back of the upper arm, pink tip."""
    surf = arm.surf
    s0 = arm.s(1.432)
    phi0 = 80.0 * DEG
    root = surf.point(s0, phi0, -0.004)
    pts = [root, V(0.405, 0.170, 1.405), V(0.468, 0.222, 1.360), V(0.515, 0.256, 1.288),
           V(0.526, 0.256, 1.220), V(0.512, 0.236, 1.168), V(0.480, 0.208, 1.118)]

    def w(t):
        return 0.024 + 0.018 * math.sin(math.pi * min(t / 0.7, 1.0) * 0.5) - 0.042 * smoothstep(0.58, 1.0, t)

    bm = blade_sweep(arm, pts, w, lambda t: 0.0070 * (1.0 - 0.6 * t), n=56, twist_deg=20.0)
    ob = L.from_bmesh(bm, "RX_Ribbon_Arm1_L", coll, "Crystal", angle=30)
    L.tint(ob, fn=lambda co, uv: (smoothstep(0.30, 0.95, uv[1]), 0.6, 0.8))
    ob["rx_keep"] = 1
    return [ob]


# ------------------------------------------------------------------ build
def build(ctx):
    coll = ctx.coll("arms")
    arm = Arm(ctx)
    obs = []
    obs += build_braid(arm, coll)
    obs += build_shards(arm, coll)
    obs += build_flame(arm, coll)
    obs += build_flame(arm, coll, FLAME_BACK_PHI, FLAME_BACK_HW, "RX_Arms_ForearmFlameBack_L", drift_deg=-6.0, rim=False)
    obs += build_diamond(arm, coll)
    obs += build_bracer(arm, coll)
    obs += build_gauntlet(arm, coll)
    obs += build_elbow(arm, coll)
    obs += build_ribbon(arm, coll)
    meshes = [o for o in obs if o.type == "MESH"]
    for ob in meshes:
        L.mirror_x(ob)
    # genuinely asymmetric pieces (front-10 / back-09): the pendant hangs from
    # the right arm only, the left arm carries a thin gold blade instead
    right_only = build_rod_pendant(arm, coll)
    for ob in right_only:
        r = L.mirror_x(ob)
        meshes.append(r)
        bpy.data.objects.remove(ob, do_unlink=True)
    meshes += build_gold_blade(arm, coll)
    for e in [o for o in coll.objects if o.type == "EMPTY" and o.name.endswith("_L")]:
        L.mirror_x(e)
    total = sum(G.tris(o) for o in meshes)
    print("[arms] %d left-side meshes (+ mirrors), %d triangles on the left" % (len(meshes), total))
    for o in meshes:
        print("   %-32s %6d" % (o.name, G.tris(o)))
