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


def framed_rhombus(ctx, coll, out, view, c, H, W, tilt, name, hb=None, frame_w=0.0095, depth=0.011,
                   glint_size=0.05, tint_pink=0.12):
    """Crystal rhombus in a double gold frame (gold band, thin black gap, inner
    gold lip) laid on the body as seen from `view`. c, H (top half-height),
    W (half-width) in view coordinates; hb = bottom half-height (default H)."""
    hb = H if hb is None else hb
    vm = G.ViewMap(ctx.body, view, eps=0.012)
    top_frac = H / (H + hb)
    half = 0.5 * (H + hb)
    # centre of the (asymmetric) rhombus outline sits at c
    rings = G.poly_rings(G.rhombus(c, half, W, tilt, top_frac), 0.006)
    gap = 0.0025
    mp = G.surface_mapper(vm, gap)

    fm = G.profile_mesh(rings, G.plate_profile(0.0035, 0.0008, 1), res=0.012)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_%sSeat_L" % name, coll, "Dark"))
    fm = G.profile_mesh(rings, G.band_profile(frame_w, 0.0062, 0.0018, 2, h0=0.0, ridge=0.0016, inner_t=0.0052),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_%sFrame_L" % name, coll, "Gold"))
    fm = G.profile_mesh(lambda off: rings(off - (frame_w + 0.0017)), G.band_profile(0.0022, 0.0052, 0.0006, 1, h0=0.0),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_%sFrameInner_L" % name, coll, "Gold"))

    ins = frame_w + 0.0041
    ang_t = math.atan2(W, H)
    ang_b = math.atan2(W, hb)
    hh = H - ins / math.sin(ang_t)
    hbb = hb - ins / math.sin(ang_b)
    hw = W - ins / math.cos(0.5 * (ang_t + ang_b))
    crys = gem_rhombus_flat(c, hh, hw, tilt, depth=depth, h0=0.0026, hb=hbb)
    out.append(obj(G.to_bmesh(crys, mp, G.planar_uv(crys)), "RX_Legs_%sCrystal_L" % name, coll, "Crystal", angle=20.0))
    L.tint(out[-1], pink=tint_pink, sparkle=0.75, edge=0.6)

    p, n = vm.at(*c)
    tip = p + n * (gap + 0.0026 + depth)
    gb = G.faceted_gem(G.rhombus((0, 0), 0.016, 0.008), 0.004, table=0.4, matrix=L.frame_from_normal(tip - n * 0.002, n))
    out.append(obj(gb, "RX_Legs_%sGem_L" % name, coll, "Gem", angle=20.0))
    L.glint("Legs_%s_L" % name, tip + n * 0.004, glint_size, coll, hue=0.6)


THIGH_C = F(602, 828)
THIGH_TILT = math.radians(5.9)
BACK_THIGH_C = R.back(370, 872)


def thigh_diamond(ctx, coll, out):
    framed_rhombus(ctx, coll, out, "front", THIGH_C, 0.121, 0.052, THIGH_TILT, "Thigh")


def back_thigh_crystal(ctx, coll, out):
    """Framed crystal on the back of the thigh (back-09 x~350-395, y~815-932;
    back-03 shows it as a framed rhombus), long point down."""
    framed_rhombus(ctx, coll, out, "back", BACK_THIGH_C, 0.066, 0.027, math.radians(-2.0), "ThighBack",
                   hb=0.082, frame_w=0.0068, depth=0.008, glint_size=0.035, tint_pink=0.3)


def gem_rhombus_flat(c, hh, hw, tilt, depth, h0=0.0, sub=4, hb=None):
    """FlatMesh rhombus crystal: 8 star facets meeting at a raised centre,
    with the corner ridges higher than the edge valleys."""
    ct, st = math.cos(tilt), math.sin(tilt)

    def P(x, y):
        return (c[0] + x * ct - y * st, c[1] + x * st + y * ct)

    corners = [(0.0, hh), (-hw, 0.0), (0.0, -(hh if hb is None else hb)), (hw, 0.0)]
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
    # flat bottom + walls, subdivided like the girdle so the piece is closed
    zb = h0 - 0.0015
    cb = (0.0, 0.0, zb)
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        m = mids[i]
        tri((*m, zb), (*a, zb), cb)
        tri((*b, zb), (*m, zb), cb)
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        m = mids[i]
        for p0, p1 in ((a, m), (m, b)):
            for k in range(sub):
                t0, t1 = k / sub, (k + 1) / sub
                q0 = (p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0)
                q1 = (p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1)
                fm.f.append((V(*q0, zb), V(*q1, zb), V(*q1, girdle_h), V(*q0, girdle_h)))
    return fm


# ====================================================================== knee


KNEE_C = F(650, 1018)
KNEE_TILT = math.radians(6.5)
KNEE_HH, KNEE_HW = 0.116, 0.070


def knee_lift(a, b):
    """Dome of the knee shield above the body (metres)."""
    ct, st = math.cos(KNEE_TILT), math.sin(KNEE_TILT)
    dx, dy = a - KNEE_C[0], b - KNEE_C[1]
    x = dx * ct + dy * st
    y = -dx * st + dy * ct
    rho2 = (x / KNEE_HW) ** 2 + (y / KNEE_HH) ** 2
    return 0.005 + 0.011 * max(0.0, 1.0 - rho2)


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
    fm = G.profile_mesh(lens, G.band_profile(0.017, 0.0075, 0.002, 2, h0=base_t - 0.001, ridge=0.0018, inner_t=0.006),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeFrame_L", coll, "Gold"))

    # inner gold almond
    fm = G.profile_mesh(lambda off: lens(off - 0.025), G.band_profile(0.012, 0.0068, 0.0016, 2, h0=base_t - 0.001, ridge=0.0012),
                        closed_profile=True)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeFrameInner_L", coll, "Gold"))

    # recessed dark floor under the gem
    fm = G.profile_mesh(lambda off: lens(off - 0.036), G.plate_profile(0.002, 0.0, 1, h0=base_t - 0.0005), res=0.008)
    out.append(obj(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_KneeGemSeat_L", coll, "Dark"))

    # star gem: faceted almond, rigid, on the dome
    p, n = vm.at(*KNEE_C)
    centre = p + n * (gap + knee_lift(*KNEE_C) + base_t - 0.002)
    up = Vector((-math.sin(KNEE_TILT), 0.0, math.cos(KNEE_TILT)))
    m = L.frame_from_normal(centre, n, up)
    ghh = KNEE_HH - 0.039 * 1.30
    ghw = KNEE_HW - 0.039
    gl = [(x, y) for x, y in G.lens_outline((0.0, 0.0), ghh, ghw, 0.0, n=12, power=1.0)]
    gb = G.faceted_gem(gl, 0.014, table=0.42, crown=0.7, matrix=m)
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
        ((0.256, -0.052, 0.688), (0.268, 0.012, 0.752), (0.250, 0.090, 0.806), 0.040),
        ((0.264, -0.046, 0.632), (0.281, 0.022, 0.692), (0.274, 0.104, 0.742), 0.042),
        ((0.270, -0.038, 0.576), (0.289, 0.032, 0.622), (0.292, 0.114, 0.666), 0.040),
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
    prof_s = [(0.150, 0.004), (0.170, 0.024), (0.200, 0.040), (0.240, 0.047), (0.290, 0.046), (0.340, 0.044), (0.390, 0.043)]

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


def flame_fin(cm, ph_root, z_root, ph_tip, z_tip, lift, w0, th0, bm, twist=0.35, sway=0.0, n=24, belly=0.45):
    """Crystal flame tongue radiating from the leg: rooted inside the boot
    cuff, it widens (belly), sways sideways and curls outward to a point."""

    def wfn(t):
        return w0 * (1.0 - t) ** 0.55 * (0.55 + belly * math.sin(math.pi * min(1.0, t * 1.15))) + 0.0004

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
        out = lift * math.sin(0.5 * math.pi * t) ** 2.4 + 0.005 * math.sin(math.pi * t)
        path.append(p + radial * (0.5 * wfn(t) + 0.002 + out))
        circ = cm.d.cross(radial).normalized()
        a = twist * t
        nrms.append((circ * math.cos(a) + radial * math.sin(a)).normalized())
    G.blade(path, nrms, wfn, lambda t: th0 * (1.0 - 0.7 * t), edge=0.16, bm=bm)


def calf_fins(ctx, coll, out):
    """Crystal flame fins rising out of the boot cuff up both sides of the calf
    (front-10 / back-09: a tall one up the back-lateral calf, a broad one
    sweeping up and in on the medial side, slimmer ones beside the shin)."""
    import part_legs_boot as BOOT

    cm = G.CylMap(ctx.body, KNEE + Vector((0.0, -0.004, 0.0)), ANKLE, r_ref=0.06)
    bms = bmesh.new()

    def root_z(ph):
        return BOOT.saddle(math.radians(ph), *BOOT.RIM) - 0.014

    # (phi root, phi tip, z tip, lift, root width, thickness, twist, sway, belly)
    specs = [
        (120, 132, 0.620, 0.060, 0.060, 0.012, 0.30, 8, 0.50),     # back-lateral, tall
        (150, 163, 0.520, 0.056, 0.050, 0.011, -0.25, -8, 0.45),   # back-lateral, short
        (84, 88, 0.565, 0.024, 0.034, 0.008, 0.20, 4, 0.35),       # beside the shin, slim
        (102, 118, 0.500, 0.050, 0.046, 0.010, -0.20, 6, 0.45),    # lateral, outer
        (-104, -94, 0.585, 0.096, 0.074, 0.012, -0.30, -10, 0.55),  # medial, big
        (-82, -86, 0.490, 0.040, 0.040, 0.009, 0.25, 5, 0.40),     # medial front
        (-146, -154, 0.515, 0.066, 0.056, 0.011, 0.25, 6, 0.50),   # medial back
        (178, 182, 0.445, 0.036, 0.038, 0.009, 0.20, 0, 0.40),     # back centre, small
    ]
    for pr, pt, zt, lt, w0, th0, tw, sw, bl in specs:
        flame_fin(cm, pr, root_z(pr), pt, zt, lt, w0, th0, bms, twist=tw, sway=sw, belly=bl)
    ob = obj(bms, "RX_Legs_CalfFins_L", coll, "Crystal", angle=30.0)
    L.tint(ob, pink=0.2, sparkle=0.7, edge=0.8)
    out.append(ob)


# ====================================================================== scales


def _inside_grown(poly, pt, grow):
    """Point-in-polygon after growing the polygon by `grow` (approx, via offset)."""
    g = L.offset_outline(L.ccw(poly), grow)
    return bool(L.point_in_polygon([pt], g)[0])


def scale_field(cm, z_top, z_bot, ph_lo, ph_hi, w, h, fm, exclude=None, t=0.0024, lift0=0.0010, tilt=0.0030,
                bevel=0.0010, r_max=0.125):
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
            r_hit = cm.radius(a_c, sc)
            ok = r_hit < r_max and p_c.x > 0.03
            if ok and (exclude is None or not exclude(p_c)):
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

    diamond = G.rhombus(THIGH_C, 0.121, 0.052, THIGH_TILT)
    back_crys = G.rhombus(BACK_THIGH_C, 0.074, 0.027, 0.0, 0.066 / 0.148)
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
            if _inside_grown(back_v, fx, 0.012) or _inside_grown(back_crys, fx, 0.014):
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
        ("thighback", back_thigh_crystal),
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
