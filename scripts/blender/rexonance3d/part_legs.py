"""Rexonance legs and boots (both sides).

Authored on the suit's LEFT (+X, names *_L) and mirrored with rx_lib.mirror_x.
Read off front-10 (widths, heights), right-07 / left-08 (depth) and back-09.

Pieces (per side)
  thigh   : vertical rhombus crystal in a bevelled double gold frame
  knee    : proud almond shield (black) - outer gold almond, black ring,
            inner gold almond, faceted star gem; gold side blades; silver V
            chevron with a pink edge below it
  shin    : black lacquer shin guard with a centre ridge
  calf    : crystal flame fins up both sides, gold chevron straps at the back,
            gold spiked plate behind the knee
  boot    : see part_legs_boot.py
"""

import math

import bmesh
from mathutils import Vector

import part_legs_geo as G
import rx_lib as L
import rx_ref as R

HIP = Vector(R.LM["hip"])
KNEE = Vector(R.LM["knee"])
ANKLE = Vector(R.LM["ankle"])


def F(x, y):
    """front-10 pixel -> (X, Z)."""
    return R.front(x, y)


def obj(bm, name, coll, family, angle=40.0):
    return L.from_bmesh(bm, name, coll, family, angle)


# ====================================================================== thigh


def thigh_diamond(ctx, coll, out):
    vm = G.ViewMap(ctx.body, "front", eps=0.012)
    c = F(602, 828)
    tilt = math.radians(5.9)
    H, W = 0.121, 0.052
    rings = G.poly_rings(G.rhombus(c, H, W, tilt), 0.006)
    gap = 0.0025
    mp = G.surface_mapper(vm, gap)

    # dark seat plate (the thin black line between frame and crystal)
    fm = G.profile_mesh(rings, G.plate_profile(0.0035, 0.0008, 1), res=0.012)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_ThighSeat_L", coll, "Dark"))

    # outer gold frame: chamfered ridge band
    fm = G.profile_mesh(rings, G.band_profile(0.0095, 0.0062, 0.0018, 2, h0=0.0, ridge=0.0016, inner_t=0.0052),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_ThighFrame_L", coll, "Gold"))

    # inner gold lip (second frame)
    fm = G.profile_mesh(lambda off: rings(off - 0.0112), G.band_profile(0.0022, 0.0052, 0.0006, 1, h0=0.0), closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_ThighFrameInner_L", coll, "Gold"))

    # faceted crystal: rhombus pyramid with star facets, mapped onto the thigh
    ins = 0.0136
    hh = H - ins / math.sin(math.atan2(W, H))
    hw = W - ins / math.cos(math.atan2(W, H))
    crys = gem_rhombus_flat(c, hh, hw, tilt, depth=0.011, h0=0.0026)
    uvf = G.planar_uv(crys)
    out.append(obj(G.to_bmesh(crys, mp, uvf), "RX_Legs_ThighCrystal_L", coll, "Crystal", angle=20.0))
    L.tint(out[-1], pink=0.12, sparkle=0.75, edge=0.6)

    p, n = vm.at(*c)
    tip = p + n * (gap + 0.0026 + 0.011)
    gb = G.faceted_gem(G.rhombus((0, 0), 0.016, 0.008), 0.004, table=0.4, matrix=L.frame_from_normal(tip - n * 0.002, n))
    out.append(obj(gb, "RX_Legs_ThighGem_L", coll, "Gem", angle=20.0))
    L.glint("Legs_Thigh_L", tip + n * 0.004, 0.05, coll, hue=0.6)


def gem_rhombus_flat(c, hh, hw, tilt, depth, h0=0.0, sub=4):
    """FlatMesh rhombus crystal: 8 star facets meeting at a raised centre,
    with the corner ridges higher than the edge valleys."""
    ct, st = math.cos(tilt), math.sin(tilt)

    def P(x, y):
        return (c[0] + x * ct - y * st, c[1] + x * st + y * ct)

    corners = [(0.0, hh), (-hw, 0.0), (0.0, -hh), (hw, 0.0)]
    fm = G.FlatMesh()
    # vertex helper with dedupe
    index = {}

    def V(x, y, h):
        key = (round(x, 7), round(y, 7), round(h, 7))
        if key not in index:
            a, b = P(x, y)
            index[key] = len(fm.v)
            fm.v.append((a, b, h))
        return index[key]

    def tri(p0, p1, p2):
        # subdivide a triangle (local coords with h) into sub^2 triangles
        grid = {}
        for i in range(sub + 1):
            for j in range(sub + 1 - i):
                k = sub - i - j
                x = (p0[0] * i + p1[0] * j + p2[0] * k) / sub
                y = (p0[1] * i + p1[1] * j + p2[1] * k) / sub
                h = (p0[2] * i + p1[2] * j + p2[2] * k) / sub
                grid[(i, j)] = V(x, y, h)
        for i in range(sub):
            for j in range(sub - i):
                fm.f.append((grid[(i + 1, j)], grid[(i, j + 1)], grid[(i, j)]))
                if i + j < sub - 1:
                    fm.f.append((grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))

    top = (0.0, 0.0, h0 + depth)
    mids = []
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        mids.append(((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5))
    girdle_h = h0
    ridge = []  # points along corner->centre ridges, raised
    for i in range(4):
        a = corners[i]
        ridge.append((a[0] * 0.45, a[1] * 0.45, h0 + depth * 0.72))
    valley = []
    for m in mids:
        valley.append((m[0] * 0.42, m[1] * 0.42, h0 + depth * 0.48))
    for i in range(4):
        a = (*corners[i], girdle_h)
        b = (*corners[(i + 1) % 4], girdle_h)
        m = (*mids[i], girdle_h)
        ra = ridge[i]
        rb = ridge[(i + 1) % 4]
        v = valley[i]
        tri(a, m, v)
        tri(m, b, v)
        tri(a, v, ra)
        tri(v, b, rb)
        tri(ra, v, top)
        tri(v, rb, top)
    # bottom (flat, at girdle height) so the piece is closed
    tri4 = [(*corners[i], h0 - 0.0015) for i in range(4)]
    cb = (0.0, 0.0, h0 - 0.0015)
    for i in range(4):
        tri(tri4[(i + 1) % 4], tri4[i], cb)
    # walls from the bottom ring to the girdle
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        fm.f.append((V(*a, h0 - 0.0015), V(*b, h0 - 0.0015), V(*b, girdle_h), V(*a, girdle_h)))
    return fm


# ====================================================================== knee


KNEE_C = F(650, 1018)
KNEE_TILT = math.radians(4.9)
KNEE_HH, KNEE_HW = 0.116, 0.066


def knee_lift(a, b):
    """Dome of the knee shield above the body (metres)."""
    ct, st = math.cos(KNEE_TILT), math.sin(KNEE_TILT)
    dx, dy = a - KNEE_C[0], b - KNEE_C[1]
    x = dx * ct + dy * st
    y = -dx * st + dy * ct
    rho2 = (x / KNEE_HW) ** 2 + (y / KNEE_HH) ** 2
    return 0.007 + 0.013 * max(0.0, 1.0 - rho2)


def knee_guard(ctx, coll, out):
    vm = G.ViewMap(ctx.body, "front", eps=0.014)
    gap = 0.003
    mp = G.surface_mapper(vm, gap, knee_lift)
    lens = G.lens_rings(KNEE_C, KNEE_HH, KNEE_HW, KNEE_TILT, n=64, power=1.0)
    base_t = 0.008

    # black shield (also forms the black ring between the gold almonds)
    fm = G.profile_mesh(lens, G.plate_profile(base_t, 0.0022, 2), res=0.010)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeShield_L", coll, "Black"))

    # outer gold almond
    fm = G.profile_mesh(lens, G.band_profile(0.019, 0.0075, 0.002, 2, h0=base_t - 0.001, ridge=0.0018, inner_t=0.006),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeFrame_L", coll, "Gold"))

    # inner gold almond
    fm = G.profile_mesh(lambda off: lens(off - 0.029), G.band_profile(0.013, 0.0068, 0.0016, 2, h0=base_t - 0.001, ridge=0.0012),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeFrameInner_L", coll, "Gold"))

    # recessed dark floor under the gem
    fm = G.profile_mesh(lambda off: lens(off - 0.040), G.plate_profile(0.002, 0.0, 1, h0=base_t - 0.0005), res=0.008)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeGemSeat_L", coll, "Dark"))

    # star gem: faceted almond, rigid, on the dome
    p, n = vm.at(*KNEE_C)
    centre = p + n * (gap + knee_lift(*KNEE_C) + base_t - 0.002)
    up = Vector((-math.sin(KNEE_TILT), 0.0, math.cos(KNEE_TILT)))
    m = L.frame_from_normal(centre, n, up)
    ghh = KNEE_HH - 0.042 * 1.33
    ghw = KNEE_HW - 0.042
    gl = [(x, y) for x, y in G.lens_outline((0.0, 0.0), ghh, ghw, 0.0, n=12, power=1.0)]
    gb = G.faceted_gem(gl, 0.016, table=0.42, crown=0.7, matrix=m)
    out.append(obj(gb, "RX_Legs_KneeGem_L", coll, "Gem", angle=15.0))
    L.glint("Legs_Knee_L", centre + n * 0.018, 0.07, coll, hue=0.55)

    knee_blades(ctx, coll, out)


def clear_of_body(cm, p, clearance):
    """Push p radially (about the CylMap axis) until it is `clearance` outside the body."""
    sp = max(0.0, min(cm.length, (p - cm.p0).dot(cm.d)))
    c = cm.center(sp)
    radial = p - c
    radial = radial - cm.d * radial.dot(cm.d)
    r = radial.length
    if r < 1e-9:
        return p
    radial /= r
    hit = cm.body.ray(c, radial, 1.0)
    if hit is None:
        return p
    r_s = (Vector(hit[0]) - c).dot(radial)
    if r < r_s + clearance:
        return p + radial * (r_s + clearance - r)
    return p


def knee_blades(ctx, coll, out):
    """Gold side blades: three lying along the outside of the knee sweeping up
    and back, two fanning out from the inside edge (frontal plane)."""
    cm = G.CylMap(ctx.body, HIP + Vector((0.0, -0.01, 0.0)), KNEE + (ANKLE - KNEE) * 0.3, r_ref=0.07)
    bms = bmesh.new()
    # outside: long blades from under the shield's outer edge, rising up and
    # back along the knee (front-10 tips x~684/703/718, back-09 x~305/290)
    lat = [
        ((0.256, -0.050, 0.690), (0.268, 0.010, 0.748), (0.254, 0.080, 0.800), 0.030),
        ((0.264, -0.044, 0.634), (0.280, 0.020, 0.690), (0.276, 0.094, 0.738), 0.032),
        ((0.270, -0.036, 0.578), (0.288, 0.030, 0.620), (0.292, 0.106, 0.664), 0.030),
    ]
    for root, mid, tip, w in lat:
        ctrl = [Vector(root), Vector(mid), Vector(tip)]
        path = L.resample(L.catmull_rom(ctrl, 8), 16)
        path = [clear_of_body(cm, p, 0.006 + 0.010 * (i / 15.0)) for i, p in enumerate(path)]
        nrms = []
        for i, p in enumerate(path):
            c = cm.center(max(0.0, min(cm.length, (p - cm.p0).dot(cm.d))))
            radial = p - c
            radial = (radial - cm.d * radial.dot(cm.d)).normalized()
            nrms.append((radial + Vector((0.0, -0.55, 0.0))).normalized())
        G.blade(path, nrms, lambda t, w=w: w * min(1.0, 0.45 + t * 3.0) * (1.0 - t) ** 0.8 + 0.0004,
                lambda t: 0.0085 * (1.0 - 0.7 * t), edge=0.22, bm=bms)
    # inside: blades in the frontal plane, root under the shield's medial edge
    vm = G.ViewMap(ctx.body, "front", eps=0.012)
    med = [
        ((0.140, 0.700), (0.104, 0.716), (0.068, 0.760), 0.024),
        ((0.146, 0.616), (0.110, 0.622), (0.072, 0.662), 0.024),
    ]
    for (x0, z0), (x1, z1), (x2, z2), w in med:
        p0, n0 = vm.at(x0, z0)
        root = p0 + n0 * 0.006
        y_tip = root.y + 0.030
        ctrl = [root, Vector((x1, root.y + 0.012, z1)), Vector((x2, y_tip, z2))]
        path = L.resample(L.catmull_rom(ctrl, 8), 14)
        face = Vector((-0.25, -1.0, 0.0)).normalized()
        G.blade(path, [face] * len(path), lambda t, w=w: w * (1.0 - t) ** 0.8 + 0.0004, lambda t: 0.008 * (1.0 - 0.7 * t),
                edge=0.22, bm=bms)
    out.append(obj(bms, "RX_Legs_KneeBlades_L", coll, "Gold", angle=30.0))


# ====================================================================== silver V


def silver_v(ctx, coll, out):
    vm = G.ViewMap(ctx.body, "front", eps=0.014)
    A_out, T_out, B_out = F(598, 1078), F(675, 1178), F(715, 1056)
    B_in, T_in, A_in = F(703, 1046), F(668, 1142), F(611, 1066)
    outline = [A_out, T_out, B_out, B_in, T_in, A_in]
    rings = G.poly_rings(outline, 0.006)
    gap = 0.004

    def lift(a, b):
        return 0.004

    mp = G.surface_mapper(vm, gap, lift)
    fm = G.profile_mesh(rings, G.plate_profile(0.006, 0.0018, 2), res=0.010)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeChevron_L", coll, "Silver"))

    # pink crystal edge along the lower V
    edge = [A_out, T_out, B_out]
    inner = G.polyline_offset(edge, 0.0045)  # left normal of a left->right path points up/in
    strip = edge + list(reversed(inner))
    rings2 = G.poly_rings(strip, 0.005)
    fm = G.profile_mesh(lambda off: rings2(off + 0.0012), G.plate_profile(0.0068, 0.0012, 1), res=0.0)
    ob = obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeChevronEdge_L", coll, "Crystal", angle=30.0)
    L.tint(ob, pink=1.0, sparkle=0.3, edge=0.9)
    out.append(ob)


# ====================================================================== shin


SHIN_TOP = KNEE + Vector((0.0, -0.004, 0.0))
SHIN_BOT = ANKLE


def shin_guard(ctx, coll, out):
    cm = G.CylMap(ctx.body, SHIN_TOP, SHIN_BOT, r_ref=0.06, eps=0.010)
    gap = 0.0035
    t = 0.0055
    ridge = 0.0045
    b = 0.0016
    # half-width (arc metres) along s
    prof_s = [(0.150, 0.004), (0.170, 0.026), (0.200, 0.046), (0.240, 0.054), (0.290, 0.052), (0.340, 0.049), (0.390, 0.047)]

    def half(s):
        if s <= prof_s[0][0]:
            return prof_s[0][1]
        for (s0, a0), (s1, a1) in zip(prof_s, prof_s[1:]):
            if s <= s1:
                u = (s - s0) / (s1 - s0)
                return a0 + (a1 - a0) * u
        return prof_s[-1][1]

    rows = []
    s_vals = [0.150 + (0.390 - 0.150) * i / 34 for i in range(35)]
    K = 6  # points per half across the top
    for s in s_vals:
        A = max(half(s), 0.004)
        sec = []
        # top surface from -A to +A (with bevel), ridge at 0
        pts_top = []
        pts_top.append((-A, 0.0))
        pts_top.append((-A, t * 0.55))
        pts_top.append((-A + b * 0.6, t - b * 0.25))
        for k in range(K + 1):
            u = -1.0 + k / K
            a = u * (A - b)
            pts_top.append((a, t + ridge * (1.0 - abs(u)) ** 1.15))
        for k in range(1, K + 1):
            u = k / K
            a = u * (A - b)
            pts_top.append((a, t + ridge * (1.0 - abs(u)) ** 1.15))
        pts_top.append((A - b * 0.6, t - b * 0.25))
        pts_top.append((A, t * 0.55))
        pts_top.append((A, 0.0))
        # bottom back across
        for k in range(1, 2 * K):
            u = 1.0 - k / K
            pts_top.append((u * A, 0.0))
        for a, h in pts_top:
            p, n = cm.at(a, s)
            sec.append(p + n * (gap + h))
        rows.append(sec)
    bm = G.loft(rows, closed=False, uv=lambda i, j: (j / len(rows[0]), i / (len(rows) - 1)))
    out.append(obj(bm, "RX_Legs_ShinGuard_L", coll, "Black", angle=28.0))


# ====================================================================== calf / back


def back_knee_v(ctx, coll, out):
    """Gold spiked chevron on the back of the leg above the knee (back-09 y~930-1015)."""
    vm = G.ViewMap(ctx.body, "back", eps=0.012)
    pts = [(329, 920), (366, 1038), (450, 951), (437, 944), (368, 1003), (344, 943)]
    outline = [R.back(x, y) for x, y in pts]
    rings = G.poly_rings(outline, 0.006)
    mp = G.surface_mapper(vm, 0.003)
    fm = G.profile_mesh(rings, G.plate_profile(0.0085, 0.0024, 2), res=0.010)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_BackKneeV_L", coll, "Gold"))


def calf_strap(ctx, coll, out):
    """Gold chevron strap across the back of the calf (back-09 y~1060-1170)."""
    vm = G.ViewMap(ctx.body, "back", eps=0.012)
    pts = [(428, 1062), (446, 1084), (362, 1178), (344, 1170)]
    outline = [R.back(x, y) for x, y in pts]
    rings = G.poly_rings(outline, 0.006)
    mp = G.surface_mapper(vm, 0.003)
    fm = G.profile_mesh(rings, G.plate_profile(0.0068, 0.002, 2), res=0.010)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_CalfStrap_L", coll, "Gold"))


def flame_fin(cm, ph_root, z_root, ph_tip, z_tip, lift, w0, th0, bm, twist=0.35, sway=0.0, n=22):
    """Crystal flame tongue radiating from the leg: the inner edge sits on the
    surface at the root, the blade bulges, sways and curls out at the tip."""

    def wfn(t):
        return w0 * (1.0 - t) ** 0.62 * (0.62 + 0.55 * math.sin(math.pi * min(1.0, t * 1.25))) + 0.0004

    path, nrms = [], []
    for i in range(n):
        t = i / (n - 1)
        e = t * t * (3 - 2 * t)
        ph = math.radians(ph_root + (ph_tip - ph_root) * e + sway * math.sin(math.pi * t))
        z = z_root + (z_tip - z_root) * t
        s = (cm.p0.z - z) / max(-cm.d.z, 1e-6)
        p, _n = cm.at(ph * cm.r_ref, s)
        c = cm.center(s)
        radial = p - c
        radial = (radial - cm.d * radial.dot(cm.d)).normalized()
        out = lift * (t ** 1.7) + 0.006 * math.sin(math.pi * t)
        path.append(p + radial * (0.5 * wfn(t) + 0.002 + out))
        circ = cm.d.cross(radial).normalized()
        a = twist * t
        nrms.append((circ * math.cos(a) + radial * math.sin(a)).normalized())
    G.blade(path, nrms, wfn, lambda t: th0 * (1.0 - 0.7 * t), edge=0.16, bm=bm)


def calf_fins(ctx, coll, out):
    """Crystal flame fins rising from the boot cuffs up both sides of the calf."""
    cm = G.CylMap(ctx.body, KNEE + Vector((0.0, -0.004, 0.0)), ANKLE, r_ref=0.06)
    bms = bmesh.new()
    # (phi root, z root, phi tip, z tip, lift, root width, thickness, twist, sway)
    specs = [
        (118, 0.286, 130, 0.600, 0.055, 0.056, 0.011, 0.30, 6),     # outer back, tall
        (150, 0.284, 160, 0.505, 0.050, 0.046, 0.010, -0.25, -5),   # outer back, short
        (78, 0.296, 86, 0.545, 0.020, 0.032, 0.008, 0.20, 4),       # outer front, slim
        (-104, 0.288, -97, 0.555, 0.072, 0.062, 0.012, -0.30, -5),  # inner, big
        (-80, 0.298, -86, 0.470, 0.034, 0.036, 0.008, 0.25, 4),     # inner front
        (-146, 0.284, -153, 0.488, 0.052, 0.048, 0.010, 0.25, 5),   # inner back
        (178, 0.290, 182, 0.430, 0.030, 0.036, 0.008, 0.20, 0),     # back centre, small
    ]
    for pr, zr, pt, zt, lt, w0, th0, tw, sw in specs:
        flame_fin(cm, pr, zr, pt, zt, lt, w0, th0, bms, twist=tw, sway=sw)
    ob = obj(bms, "RX_Legs_CalfFins_L", coll, "Crystal", angle=30.0)
    L.tint(ob, pink=0.2, sparkle=0.7, edge=0.8)
    out.append(ob)


# ====================================================================== scales


def _inside_grown(poly, pt, grow):
    """Point-in-polygon after growing the polygon by `grow` (approx, via offset)."""
    g = L.offset_outline(L.ccw(poly), grow)
    return bool(L.point_in_polygon([pt], g)[0])


def scale_field(cm, z_top, z_bot, ph_lo, ph_hi, w, h, fm, exclude=None, t=0.0024, lift0=0.0010, tilt=0.0030,
                bevel=0.0010, z_jitter=0.0):
    """Staggered rows of overlapping rhombic scales (shingles: the lower tip
    lifts off the surface) between z_top..z_bot and phi ph_lo..ph_hi (deg)."""
    count = 0
    row = 0
    dz = h * 0.5
    z = z_top - dz * 0.5
    while z >= z_bot:
        sc = (cm.p0.z - z) / max(-cm.d.z, 1e-6)
        mid = math.radians(0.5 * (ph_lo + ph_hi))
        r_mid = max(cm.radius(mid * cm.r_ref, sc), 0.03)
        dphi = w / r_mid
        start = math.radians(ph_lo) + (dphi * 0.5 if row % 2 else 0.0)
        ph = start
        while ph <= math.radians(ph_hi) + 1e-6:
            a_c = ph * cm.r_ref
            r = max(cm.radius(a_c, sc), 0.03)
            da = 0.5 * w * 1.08 * cm.r_ref / r
            ds = 0.5 * h * 1.04
            p_c, _n = cm.at(a_c, sc)
            if exclude is None or not exclude(p_c):
                quad = [(a_c, sc - ds), (a_c - da, sc), (a_c, sc + ds), (a_c + da, sc)]
                i0 = len(fm.v)
                G.profile_mesh(G.poly_rings(L.ccw(quad), 0.02), G.plate_profile(t, bevel, 1), res=0.0, fm=fm,
                               cap_bottom=False)
                for i in range(i0, len(fm.v)):
                    a, b, hh = fm.v[i]
                    u = max(0.0, min(1.0, (b - (sc - ds)) / (2 * ds)))
                    fm.v[i] = (a, b, hh + lift0 + tilt * u * u)
                count += 1
            ph += dphi
        z -= dz
        row += 1
    return count


def leg_scales(ctx, coll, out):
    """Black armour scales on the thigh (front and back), behind the knee and
    on the calf, skipping everything that already sits on the leg."""
    thigh = G.CylMap(ctx.body, HIP + Vector((0.0, -0.01, 0.0)), KNEE, r_ref=0.08, eps=0.012)
    shin = G.CylMap(ctx.body, KNEE + Vector((0.0, -0.004, 0.0)), ANKLE, r_ref=0.06, eps=0.010)

    diamond = G.rhombus(F(602, 828), 0.121, 0.052, math.radians(5.9))
    knee = G.lens_outline(KNEE_C, KNEE_HH, KNEE_HW, KNEE_TILT, n=32)
    chevron = [F(598, 1078), F(675, 1178), F(715, 1056), F(703, 1046), F(668, 1142), F(611, 1066)]
    back_v = [R.back(x, y) for x, y in [(329, 920), (366, 1038), (450, 951), (437, 944), (368, 1003), (344, 943)]]
    strap = [R.back(x, y) for x, y in [(428, 1062), (446, 1084), (362, 1178), (344, 1170)]]

    def ex_thigh(p):
        fx = (p.x, p.z)
        if p.y < 0.0:
            if _inside_grown(diamond, fx, 0.016) or _inside_grown(knee, fx, 0.012):
                return True
        else:
            if _inside_grown(back_v, fx, 0.012):
                return True
        return False

    def ex_calf(p):
        fx = (p.x, p.z)
        if p.y < 0.0 and (_inside_grown(knee, fx, 0.012) or _inside_grown(chevron, fx, 0.010)):
            return True
        if p.y > 0.0 and (_inside_grown(back_v, fx, 0.010) or _inside_grown(strap, fx, 0.008)):
            return True
        return False

    fm = G.FlatMesh()
    n = 0
    n += scale_field(thigh, 1.05, 0.80, -78, 86, 0.032, 0.046, fm, ex_thigh)
    n += scale_field(thigh, 0.96, 0.70, 112, 248, 0.040, 0.054, fm, ex_thigh)
    fm2 = G.FlatMesh()
    n += scale_field(shin, 0.66, 0.31, 58, 302, 0.040, 0.054, fm2, ex_calf)
    mp = G.surface_mapper(thigh, 0.0008)
    ob = obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_ThighScales_L", coll, "Suit", angle=35.0)
    out.append(ob)
    mp2 = G.surface_mapper(shin, 0.0008)
    ob2 = obj(G.to_bmesh(fm2, mp2, G.planar_uv(fm2)), "RX_Legs_CalfScales_L", coll, "Suit", angle=35.0)
    out.append(ob2)
    print("[legs] scales per side:", n)


# ====================================================================== build


def build(ctx):
    import part_legs_boot as BOOT

    coll = ctx.coll("legs")
    out = []
    steps = [
        ("thigh", thigh_diamond),
        ("knee", knee_guard),
        ("chevron", silver_v),
        ("shin", shin_guard),
        ("backknee", back_knee_v),
        ("strap", calf_strap),
        ("fins", calf_fins),
        ("scales", leg_scales),
        ("boot", BOOT.boot),
    ]
    for name, fn in steps:
        try:
            fn(ctx, coll, out)
        except Exception:
            import traceback

            print("[legs] %s failed" % name)
            traceback.print_exc()
    # mirror everything authored on +X (meshes and glints)
    sided = [o for o in list(coll.objects) if o.name.endswith("_L")]
    for o in sided:
        L.mirror_x(o)
    print("[legs] %d objects, %d triangles" % (len(coll.objects), G.tri_count(coll.objects)))
