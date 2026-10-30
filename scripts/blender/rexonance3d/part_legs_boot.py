"""Rexonance boot (suit's left, +X; part_legs mirrors it).

Read off front-10, right-07 / left-08 and back-09:
  * the foot splays outward ~22 deg (toe tip front-10 x~805, right-07 x~690);
  * three stacked gold "saddle" chevron cuffs around the ankle: high at the
    front and back (^ in front/back views), low at the sides (V in side views);
  * gold horn spikes at the back-sides pointing up and out;
  * black faceted foot shell, big faceted crystal on the instep, gold pointed
    toe cap, black sole with a gold welt, block heel with a gold heel counter,
    a crystal diamond on the back of the heel.

Frame: foot-local (u forward along the splayed foot, w lateral, z up) with
origin under the ankle; shaft-local (phi around the ankle, 0 = front,
+90 = lateral (+X), z up).
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import part_legs_geo as G
import rx_lib as L
import rx_ref as R

THETA = math.radians(25.0)
O = Vector((0.29, 0.03, 0.0))
FWD = Vector((math.sin(THETA), -math.cos(THETA), 0.0))
LAT = Vector((math.cos(THETA), math.sin(THETA), 0.0))
UP = Vector((0.0, 0.0, 1.0))

KNEE = Vector(R.LM["knee"])
ANKLE = Vector(R.LM["ankle"])


def W(u, w, z):
    return O + FWD * u + LAT * w + UP * z


def interp(xs, ys, x):
    return float(np.interp(x, xs, ys))


def smooth_interp(pts, x):
    """Catmull-Rom through (x, y) control points, sampled at x."""
    key = id(pts)
    cache = _SPL.get(key)
    if cache is None:
        cr = L.catmull_rom([Vector((a, b, 0.0)) for a, b in pts], 10)
        xs = np.array([p.x for p in cr])
        ys = np.array([p.y for p in cr])
        order = np.argsort(xs)
        cache = (xs[order], ys[order])
        _SPL[key] = cache
    return float(np.interp(x, cache[0], cache[1]))


_SPL = {}

# ------------------------------------------------------------------ foot shape
U_HEEL, U_TOE = -0.104, 0.272
LAT_W = [(-0.104, 0.0), (-0.098, 0.022), (-0.085, 0.036), (-0.060, 0.046), (-0.030, 0.049), (0.000, 0.050),
         (0.050, 0.055), (0.100, 0.059), (0.140, 0.058), (0.180, 0.051), (0.215, 0.038), (0.245, 0.020),
         (0.262, 0.007), (0.272, 0.0)]
MED_W = [(-0.104, 0.0), (-0.098, 0.022), (-0.085, 0.036), (-0.060, 0.045), (-0.030, 0.047), (0.000, 0.046),
         (0.050, 0.048), (0.100, 0.052), (0.140, 0.051), (0.180, 0.045), (0.215, 0.033), (0.245, 0.017),
         (0.262, 0.006), (0.272, 0.0)]
# top line of the foot shell (the gem / toe cap sit on it)
TOP_Z = [(-0.104, 0.105), (-0.090, 0.125), (-0.060, 0.135), (0.000, 0.150), (0.040, 0.166), (0.062, 0.166),
         (0.090, 0.140), (0.120, 0.112), (0.150, 0.094), (0.180, 0.084), (0.210, 0.075), (0.240, 0.064),
         (0.262, 0.053), (0.272, 0.046)]
Z_SOLE = 0.016  # top of the sole slab
Z_WELT = 0.034  # top of the gold welt (forefoot)


def half_w(u, side):
    tab = LAT_W if side > 0 else MED_W
    return interp([p[0] for p in tab], [p[1] for p in tab], u)


def top_z(u):
    return smooth_interp(TOP_Z, u)


def upper_point(u, th, p=2.6, inset=0.0):
    """Foot shell surface: th in [-pi/2, pi/2] (-: medial, +: lateral, 0: top).
    Returns (point, (w, z) local)."""
    side = 1.0 if th >= 0 else -1.0
    hw = max(half_w(u, side) - inset, 0.0)
    zb = Z_SOLE + 0.006
    zt = top_z(u) - inset
    s = math.sin(th)
    c = math.cos(th)
    ws = math.copysign(abs(s) ** (2.0 / p), s)
    zs = abs(c) ** (2.0 / p)
    # forefoot: a peaked roof (central ridge) over boxy sides
    k = max(0.0, min(1.0, (u - 0.07) / 0.06))
    if k > 0:
        roof = 1.0 - 0.42 * abs(th) / (math.pi / 2)
        zs = (1 - k) * zs + k * min(abs(c) ** (2.0 / 4.0), roof)
        ws = (1 - k) * ws + k * math.copysign(abs(s) ** (2.0 / 4.0), s)
    w = hw * ws
    z = zb + (zt - zb) * zs
    return W(u, w, z), (w, z)


def upper_normal(u, th, e=0.004):
    p0, _ = upper_point(u, th)
    du = (upper_point(min(u + e, U_TOE), th)[0] - upper_point(max(u - e, U_HEEL), th)[0])
    dt = (upper_point(u, th + 0.05)[0] - upper_point(u, th - 0.05)[0])
    n = dt.cross(du)
    if n.length < 1e-12:
        return UP.copy()
    n.normalize()
    # outward: away from the foot's centre line
    cen = W(u, 0.0, (Z_SOLE + top_z(u)) * 0.5)
    if n.dot(p0 - cen) < 0:
        n = -n
    return n


class UpperMap:
    """(a, b) = (arc-ish across, u along) -> foot shell point + normal."""

    def __init__(self, r_ref=0.05):
        self.r_ref = r_ref

    def at(self, a, b):
        th = max(-math.pi / 2, min(math.pi / 2, a / self.r_ref))
        u = max(U_HEEL + 0.002, min(U_TOE - 0.002, b))
        p, _ = upper_point(u, th)
        return p, upper_normal(u, th)


# ------------------------------------------------------------------ shaft
SHAFT_DY = 0.014


def axis_at(z):
    """Shin axis point at height z (+ the shaft's backward offset)."""
    t = (KNEE.z - z) / (KNEE.z - ANKLE.z)
    p = KNEE.lerp(ANKLE, t)
    return Vector((p.x, p.y + SHAFT_DY, z))


SHAFT_RX, SHAFT_RY = 0.074, 0.060


def shaft_point(phi, z, off=0.0, rx=SHAFT_RX, ry=SHAFT_RY):
    """Ellipse around the shaft axis; phi 0 = front (-Y), +90 = +X; off along the normal."""
    c = axis_at(z)
    s, co = math.sin(phi), math.cos(phi)
    p = c + Vector((rx * s, -ry * co, 0.0))
    n = Vector((s / rx, -co / ry, 0.0)).normalized()
    return p + n * off, n


def saddle(phi, z_front, z_side, z_back=None):
    """Chevron height around the ankle: z_front at phi=0, z_side at +-90,
    z_back at 180; linear in |phi| between (sharp creases)."""
    zb = z_front if z_back is None else z_back
    a = abs(math.atan2(math.sin(phi), math.cos(phi)))
    if a <= math.pi / 2:
        return z_front + (z_side - z_front) * (a / (math.pi / 2))
    return z_side + (zb - z_side) * ((a - math.pi / 2) / (math.pi / 2))


def phis(n_quarter=12):
    """Angles around the ankle with exact samples at 0, 90, 180, 270 deg."""
    out = []
    for q in range(4):
        for k in range(n_quarter):
            out.append(-math.pi + (q + k / n_quarter) * (math.pi / 2))
    return out


# cuff bands: (front apex z, side valley z, back apex z) of the band centre line
BANDS = [(0.282, 0.198, 0.288), (0.236, 0.152, 0.240), (0.190, 0.110, 0.194)]
BAND_HALF = 0.0180
RIM = (0.302, 0.218, 0.308)  # shaft opening (just above band 1's top edge)


def grid(rows, wrap_i=False, wrap_j=False, bm=None, uv=None):
    """Quads between rows[i][j] grid points."""
    bm = bm if bm is not None else bmesh.new()
    V = [[bm.verts.new(Vector(p)) for p in row] for row in rows]
    ni, nj = len(V), len(V[0])
    uvl = bm.loops.layers.uv.verify()
    faces = []
    for i in range(ni if wrap_i else ni - 1):
        i2 = (i + 1) % ni
        for j in range(nj if wrap_j else nj - 1):
            j2 = (j + 1) % nj
            try:
                f = bm.faces.new((V[i][j], V[i2][j], V[i2][j2], V[i][j2]))
            except ValueError:
                continue
            faces.append(f)
            if uv:
                for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    loop[uvl].uv = uv(a, b)
    bm.normal_update()
    return bm, faces


def orient_outward(bm, faces, centre_fn):
    for f in faces:
        c = f.calc_center_median()
        if f.normal.dot(c - centre_fn(c)) < 0:
            f.normal_flip()
    bm.normal_update()


# ------------------------------------------------------------------ pieces


def build_upper(coll, out):
    """Black faceted foot shell (lofted across u)."""
    us = list(np.linspace(U_HEEL + 0.002, U_TOE - 0.001, 46))
    # facet columns: medial bottom -> top -> lateral bottom
    ths = [-math.pi / 2, -1.25, -0.95, -0.62, -0.30, 0.0, 0.30, 0.62, 0.95, 1.25, math.pi / 2]
    rows = []
    for u in us:
        row = [upper_point(u, th)[0] for th in ths]
        # close the section along the bottom (flat, at the sole top)
        side_l = half_w(u, 1)
        side_m = half_w(u, -1)
        zb = Z_SOLE + 0.002
        bottom = [W(u, side_l * 0.5, zb), W(u, 0.0, zb), W(u, -side_m * 0.5, zb)]
        rows.append(row + bottom + [])
    bm = G.loft(rows, closed=False, cap_start=True, cap_end=True,
                uv=lambda i, j: (j / 14.0, i / (len(us) - 1)))
    out.append(L.from_bmesh(bm, "RX_Legs_BootFoot_L", coll, "Black", 26.0))


def build_shaft(ctx, coll, out):
    """Black boot shaft: elliptical tube from inside the foot up to a
    chevron-shaped rim, then an inward collar that meets the leg."""
    cm = G.CylMap(ctx.body, KNEE + Vector((0.0, -0.004, 0.0)), ANKLE, r_ref=0.06)
    angs = phis(14)
    rows = []
    nz = 14
    for phi in angs:
        z_rim = saddle(phi, *RIM[:2], RIM[2])
        col = []
        for k in range(nz):
            z = 0.034 + (z_rim - 0.034) * (k / (nz - 1))
            taper = max(0.0, min(1.0, (0.125 - z) / 0.09))
            p, n = shaft_point(phi, z, 0.0, SHAFT_RX - 0.014 * taper, SHAFT_RY - 0.006 * taper)
            col.append(p)
        # rim roll: out -> up -> in, then down onto the leg
        p_top, n_top = shaft_point(phi, z_rim)
        col.append(p_top + n_top * 0.002 + UP * 0.004)
        col.append(p_top - n_top * 0.010 + UP * 0.008)
        # inner end: the leg surface just above the rim
        s = (cm.p0.z - (z_rim + 0.010)) / max(-cm.d.z, 1e-6)
        dirv = Vector((math.sin(phi), -math.cos(phi), 0.0))
        a = math.atan2(dirv.dot(cm.l), dirv.dot(cm.f)) * cm.r_ref
        pl, nl = cm.at(a, s)
        col.append(pl + nl * 0.004)
        rows.append(col)
    bm, faces = grid(rows, wrap_i=True, wrap_j=False, uv=lambda i, j: (i / len(angs), j / (nz + 2)))
    orient_outward(bm, faces, lambda c: axis_at(c.z))
    out.append(L.from_bmesh(bm, "RX_Legs_BootShaft_L", coll, "Black", 32.0))


def build_bands(coll, out):
    """Three gold saddle-chevron cuffs: each band has a horizontal ridge (two
    facets, light above / dark below in the paint) and flares at the bottom."""
    bm = bmesh.new()
    angs = phis(16)
    for k, (zf, zs, zb) in enumerate(BANDS):
        sc = 1.0 - 0.05 * k
        hb = BAND_HALF * sc
        t_bot, t_mid, t_top = 0.010, 0.0165, 0.0075
        b = 0.0022
        secs = []
        for phi in angs:
            zc = saddle(phi, zf, zs, zb)
            prof = [
                (0.0, -hb),
                (t_bot - b, -hb),
                (t_bot, -hb + b),
                (t_mid, -hb * 0.08),
                (t_top + 0.001, hb - b),
                (t_top - b * 0.5, hb),
                (0.0, hb),
            ]
            sec = []
            for off, dz in prof:
                p, n = shaft_point(phi, zc + dz, 0.0015 + off)
                sec.append(p)
            secs.append(sec)
        G.loft(secs, closed=True, bm=bm, uv=lambda i, j: (i / len(angs), j / 7.0))
    out.append(L.from_bmesh(bm, "RX_Legs_BootCuffs_L", coll, "Gold", 30.0))


def build_spikes(coll, out):
    """Gold horns at the back-sides of the cuffs, curving up and out."""
    bm = bmesh.new()
    # (phi deg, band index, rise, reach, scale)
    specs = [(126, 0, 0.078, 0.060, 1.0), (118, 1, 0.062, 0.050, 0.8), (-124, 0, 0.072, 0.052, 0.95), (-116, 1, 0.056, 0.044, 0.78)]
    for phd, bi, rise, reach, sc in specs:
        phi = math.radians(phd)
        zf, zs, zb = BANDS[bi]
        zc = saddle(phi, zf, zs, zb)
        root, n = shaft_point(phi, zc - 0.004, 0.004)
        tang = Vector((math.cos(phi) / SHAFT_RX, math.sin(phi) / SHAFT_RY, 0.0)).normalized()  # around the ankle
        path = []
        N = 14
        for i in range(N):
            t = i / (N - 1)
            p = root + n * (reach * math.sin(t * math.pi / 2) ** 1.2) + UP * (rise * t ** 1.5)
            path.append(p)
        nrm = [tang for _ in path]
        G.blade(path, nrm, lambda t, sc=sc: 0.040 * sc * (1 - t) ** 0.85 + 0.0006,
                lambda t, sc=sc: 0.013 * sc * (1 - t) ** 0.7 + 0.0006, edge=0.30, bm=bm)
    out.append(L.from_bmesh(bm, "RX_Legs_BootSpikes_L", coll, "Gold", 30.0))


def foot_outline(n_side=26, inset=0.0, u0=U_HEEL, u1=U_TOE):
    """Plan outline of the foot (local (u, w)), CCW seen from above."""
    us = np.linspace(u0, u1, n_side)
    lat = [(u, max(half_w(u, 1) - inset, 0.0)) for u in us]
    med = [(u, -max(half_w(u, -1) - inset, 0.0)) for u in us[::-1]]
    pts = lat[1:-1] + [(u1, 0.0)] + med[1:-1] + [(u0, 0.0)]
    return pts


def outline_normals(pts):
    """Outward plan normals of a CCW (u, w) loop or open path."""
    n = len(pts)
    out = []
    for i in range(n):
        u0, w0 = pts[max(i - 1, 0)]
        u1, w1 = pts[min(i + 1, n - 1)]
        tu, tw = u1 - u0, w1 - w0
        ln = math.hypot(tu, tw) or 1.0
        out.append((tw / ln, -tu / ln))
    return out


def wall_band(path, zb_fn, zt_fn, t=0.006, b=0.002, inset=0.004, closed=False, bm=None):
    """Gold band standing on a plan path (u, w) (CCW => outward normals on the
    right), from zb_fn(u, w) to zt_fn(u, w), bevelled on the outside."""
    nr = outline_normals(path) if not closed else None
    if closed:
        n = len(path)
        nr = []
        for i in range(n):
            u0, w0 = path[i - 1]
            u1, w1 = path[(i + 1) % n]
            tu, tw = u1 - u0, w1 - w0
            ln = math.hypot(tu, tw) or 1.0
            nr.append((tw / ln, -tu / ln))
    secs = []
    for (u, w), (nu, nw) in zip(path, nr):
        z0, z1 = zb_fn(u, w), zt_fn(u, w)
        bb = min(b, max((z1 - z0) * 0.3, 0.0003))
        prof = [(-inset, z0), (t - bb, z0), (t, z0 + bb), (t, z1 - bb), (t - bb, z1), (-inset, z1)]
        secs.append([W(u + nu * o, w + nw * o, z) for o, z in prof])
    return G.loft(secs, closed=closed, bm=bm, uv=lambda i, j: (i / max(len(path) - 1, 1), j / 6.0))


def build_sole(coll, out):
    """Dark sole + midsole, black block heel with a gold cap, gold side strip
    from the arch around the toe (it merges with the toe cap)."""
    to_w = lambda a, b, h: W(b, a, h)  # noqa: E731  FlatMesh (a = w, b = u, h = z)

    def plan(u0, u1, inset=0.0, n=26):
        pts = foot_outline(n, inset, u0, u1)
        return [(w, u) for u, w in pts]

    # forefoot sole
    fm = G.profile_mesh(L.ccw(plan(0.024, U_TOE + 0.004, -0.0045)), G.plate_profile(0.020, 0.003, 2), res=0.03)
    out.append(L.from_bmesh(G.to_bmesh(fm, to_w, G.planar_uv(fm)), "RX_Legs_BootSole_L", coll, "Dark", 35.0))
    # midsole across the arch
    fm = G.profile_mesh(L.ccw(plan(U_HEEL + 0.004, U_TOE, -0.003)), G.plate_profile(0.013, 0.002, 1, h0=0.014), res=0.03)
    out.append(L.from_bmesh(G.to_bmesh(fm, to_w, G.planar_uv(fm)), "RX_Legs_BootMidsole_L", coll, "Dark", 35.0))
    # block heel
    fm = G.profile_mesh(L.ccw(plan(U_HEEL - 0.004, -0.012, -0.0045)), G.plate_profile(0.044, 0.003, 2), res=0.03)
    out.append(L.from_bmesh(G.to_bmesh(fm, to_w, G.planar_uv(fm)), "RX_Legs_BootHeel_L", coll, "Black", 35.0))

    gold = bmesh.new()
    # side strip: lateral side forward, round the toe, back along the medial side
    pts = foot_outline(70, -0.0025, U_HEEL, U_TOE)
    strip = [(u, w) for u, w in pts if u >= 0.004]
    # order: start at the lateral back end, go to the toe, then back medially
    lat = sorted([p for p in strip if p[1] > 0], key=lambda p: p[0])
    med = sorted([p for p in strip if p[1] < 0], key=lambda p: -p[0])
    tip = [(U_TOE + 0.0025, 0.0)]
    path = lat + tip + med

    def zb(u, w):
        return 0.024 - 0.012 * max(0.0, min(1.0, (u - 0.13) / 0.14))

    def zt(u, w):
        full = 0.064 - 0.008 * max(0.0, min(1.0, (u - 0.05) / 0.22))
        ramp = max(0.0, min(1.0, (u - 0.004) / 0.03))
        return zb(u, w) + max(0.002, (full - zb(u, w)) * ramp)

    wall_band(path, zb, zt, t=0.0065, b=0.0022, bm=gold)
    # heel cap: around the heel block, peaked at the back centre
    heel = [(u, w) for u, w in foot_outline(60, -0.003, U_HEEL, U_TOE) if u <= -0.010]
    hl = sorted([p for p in heel if p[1] >= 0], key=lambda p: -p[0])
    hm = sorted([p for p in heel if p[1] < 0], key=lambda p: p[0])
    hpath = hl + hm
    wall_band(hpath, lambda u, w: 0.041,
              lambda u, w: 0.060 + 0.026 * max(0.0, min(1.0, (-u - 0.025) / 0.075)) ** 1.3
              + 0.012 * max(0.0, 1.0 - abs(w) / 0.028) * (u < -0.07),
              t=0.0065, b=0.0022, bm=gold)
    out.append(L.from_bmesh(gold, "RX_Legs_BootTrim_L", coll, "Gold", 30.0))


def build_side_plates(coll, out):
    """Black segment plates along both sides of the foot (two shingled rows)."""
    um = UpperMap(r_ref=0.05)
    r = um.r_ref
    bm_all = []
    rows = [
        # (theta lo, theta hi, [u starts], length, slant)
        (1.02, 1.36, [0.010, 0.052, 0.094], 0.040, 0.012),
        (0.70, 1.04, [-0.004, 0.034, 0.072], 0.036, 0.012),
    ]
    fm_all = G.FlatMesh()
    for side in (1.0, -1.0):
        for th0, th1, starts, ln, sl in rows:
            for u0 in starts:
                a0, a1 = side * r * th0, side * r * th1
                quad = [(a0, u0), (a0, u0 + ln), (a1, u0 + ln + sl), (a1, u0 + sl)]
                quad = L.ccw(quad)
                rings = G.poly_rings(quad, 0.008)
                G.profile_mesh(lambda off, rings=rings: rings(off - 0.0012), G.plate_profile(0.0042, 0.0016, 2), res=0.012, fm=fm_all)
    mp = G.surface_mapper(um, 0.0012)
    bm = G.to_bmesh(fm_all, mp, G.planar_uv(fm_all))
    out.append(L.from_bmesh(bm, "RX_Legs_BootPlates_L", coll, "Black", 30.0))


def build_gem(coll, out):
    """Faceted crystal on the instep with a gold bezel, plus a star glint."""
    u_c = 0.098
    zc = top_z(u_c)
    e = 0.01
    slope = (top_z(u_c + e) - top_z(u_c - e)) / (2 * e)
    along = (FWD * 1.0 + UP * slope).normalized()  # down-forward along the instep
    nrm = LAT.cross(along).normalized()
    if nrm.z < 0:
        nrm = -nrm
    centre = W(u_c, 0.0, zc) + nrm * 0.004
    up = -along  # local +y toward the shaft
    m = L.frame(centre, LAT * -1.0 if False else LAT, up)
    # local frame: x = LAT, y = up the instep; z = x cross y must point out
    zl = Vector(LAT).cross(up)
    if zl.dot(nrm) < 0:
        m = L.frame(centre, -LAT, up)
    hh, hw = 0.070, 0.040
    rh = [(0.0, hh), (-hw, 0.0), (0.0, -hh), (hw, 0.0)]
    gem = G.faceted_gem(rh, 0.034, table=0.36, crown=0.70, back=0.5, matrix=m)
    ob = L.from_bmesh(gem, "RX_Legs_BootGem_L", coll, "Crystal", 15.0)
    L.tint(ob, pink=0.15, sparkle=0.8, edge=0.7)
    out.append(ob)
    core = G.faceted_gem([(0.0, 0.016), (-0.008, 0.0), (0.0, -0.016), (0.008, 0.0)], 0.005, table=0.4,
                         matrix=m @ Matrix.Translation((0.0, 0.0, 0.0325)))
    out.append(L.from_bmesh(core, "RX_Legs_BootGemCore_L", coll, "Gem", 15.0))
    # gold bezel (band around the rhombus, local frame)
    fm = G.profile_mesh(G.poly_rings([(x * 1.0, y * 1.0) for x, y in rh], 0.01), G.band_profile(0.0075, 0.010, 0.002, 2, h0=-0.004, ridge=0.001),
                        closed_profile=True, fm=None)
    # bezel ring sits outside the gem: outward offset
    fm2 = G.profile_mesh(lambda off: G.poly_rings(rh, 0.01)(off + 0.0045), G.band_profile(0.0045, 0.0105, 0.0016, 2, h0=-0.008),
                         closed_profile=True)
    out.append(L.from_bmesh(G.to_bmesh(fm2, G.rigid_mapper(m), G.planar_uv(fm2)), "RX_Legs_BootGemBezel_L", coll, "Black", 30.0))
    del fm
    L.glint("Legs_Foot_L", m @ Vector((0.0, 0.0, 0.042)), 0.06, coll, hue=0.6)


def build_toecap(coll, out):
    """Gold arrowhead on the toe ridge pointing up at the instep gem (front-10
    x~745-800, y~1440-1500), raised along its centre line."""
    um = UpperMap(r_ref=0.05)
    u_top, u_wide, u_bot = 0.150, 0.222, U_TOE - 0.003
    a_w = 0.024
    kite = L.ccw([(0.0, u_top), (-a_w, u_wide), (-0.6 * a_w, u_bot), (0.6 * a_w, u_bot), (a_w, u_wide)])
    rings = G.poly_rings(kite, 0.006)

    def ridge(a, b):
        return 0.0045 * max(0.0, 1.0 - abs(a) / a_w)

    mp = G.surface_mapper(um, 0.0016, ridge)
    fm = G.profile_mesh(rings, G.plate_profile(0.0055, 0.0018, 2), res=0.008)
    out.append(L.from_bmesh(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_BootToeArrow_L", coll, "Gold", 24.0))


def build_toe_plates(coll, out):
    """Black faceted plates on the toe top beside the arrowhead."""
    um = UpperMap(r_ref=0.05)
    r = um.r_ref
    fm = G.FlatMesh()
    for side in (1.0, -1.0):
        for (t0, t1, u0, u1, sl) in [(0.36, 0.78, 0.138, 0.188, 0.012), (0.40, 0.86, 0.196, 0.244, 0.010)]:
            a0, a1 = side * r * t0, side * r * t1
            quad = L.ccw([(a0, u0), (a0, u1), (a1, u1 + sl), (a1, u0 + sl)])
            rings = G.poly_rings(quad, 0.008)
            G.profile_mesh(lambda off, rings=rings: rings(off - 0.0012), G.plate_profile(0.0040, 0.0015, 2), res=0.012, fm=fm)
    mp = G.surface_mapper(um, 0.0012)
    out.append(L.from_bmesh(G.to_bmesh(fm, mp, G.planar_uv(fm)), "RX_Legs_BootToePlates_L", coll, "Black", 30.0))


def build_heel_back(coll, out):
    """Crystal diamond on the back of the heel, framed in gold."""
    phi = math.pi
    zc = 0.136
    p, n = shaft_point(phi, zc, 0.0)
    # sit on whichever is further out: shaft or heel
    p = p + n * 0.012
    m = L.frame(p, Vector((-1.0, 0.0, 0.0)) if n.y > 0 else Vector((1.0, 0.0, 0.0)), UP)
    if Vector(m.col[2][:3]).dot(n) < 0:
        m = L.frame(p, -Vector(m.col[0][:3]), UP)
    rh = [(0.0, 0.052), (-0.031, 0.0), (0.0, -0.050), (0.031, 0.0)]
    gem = G.faceted_gem(rh, 0.014, table=0.4, crown=0.7, back=0.6, matrix=m)
    ob = L.from_bmesh(gem, "RX_Legs_BootHeelCrystal_L", coll, "Crystal", 15.0)
    L.tint(ob, pink=0.3, sparkle=0.8, edge=0.7)
    out.append(ob)
    fm = G.profile_mesh(lambda off: G.poly_rings(rh, 0.01)(off + 0.006), G.band_profile(0.006, 0.010, 0.002, 2, h0=-0.005, ridge=0.001),
                        closed_profile=True)
    out.append(L.from_bmesh(G.to_bmesh(fm, G.rigid_mapper(m), G.planar_uv(fm)), "RX_Legs_BootHeelBezel_L", coll, "Gold", 30.0))
    L.glint("Legs_Heel_L", m @ Vector((0.0, 0.0, 0.02)), 0.04, coll, hue=0.7)


# ------------------------------------------------------------------ body foot


def splay_body_foot(ctx):
    """The undersuit's foot is a straight bar; turn it (and slim it) so it
    stays inside the splayed boot. Only vertices below the ankle move."""
    ob = ctx.body_ob
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    for sx in (1.0, -1.0):
        cx = 0.29 * sx
        sel = (co[:, 2] < 0.135) & (np.abs(co[:, 0] - cx) < 0.13) & (co[:, 1] > -0.26) & (co[:, 1] < 0.20)
        if not sel.any():
            continue
        z = co[sel, 2]
        wgt = np.clip((0.130 - z) / (0.130 - 0.080), 0.0, 1.0)
        wgt = wgt * wgt * (3 - 2 * wgt)
        ang = THETA * sx * wgt
        dx = co[sel, 0] - cx
        dy = co[sel, 1] - 0.03
        # shrink toward the foot axis a little so no part pokes through the shell
        dx2 = dx * (1.0 - 0.12 * wgt)
        dy2 = dy * (1.0 - 0.10 * wgt)
        ca, sa = np.cos(ang), np.sin(ang)
        # rotate (dx, dy) so that -Y (forward) turns toward +X for the left foot
        rx = dx2 * ca - dy2 * sa
        ry = dx2 * sa + dy2 * ca
        co[sel, 0] = cx + rx
        co[sel, 1] = 0.03 + ry
        co[sel, 2] = np.maximum(z, 0.004 + 0.0 * z)
    me.vertices.foreach_set("co", co.ravel())
    me.update()


# ------------------------------------------------------------------ entry


def boot(ctx, coll, out):
    splay_body_foot(ctx)
    build_upper(coll, out)
    build_shaft(ctx, coll, out)
    build_bands(coll, out)
    build_spikes(coll, out)
    build_sole(coll, out)
    build_side_plates(coll, out)
    build_gem(coll, out)
    build_toecap(coll, out)
    build_toe_plates(coll, out)
    build_heel_back(coll, out)
