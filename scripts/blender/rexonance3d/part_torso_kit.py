"""Builders for the torso module (part_torso.py): trims, crystal inlays,
chevrons and keeled scale plates laid on the undersuit.

Coordinates: paths and outlines are given in reference-sheet pixels of one
view and converted with rx_ref.px(); everything is projected onto the body
along that view's rays.
"""

import math

import bmesh
import numpy as np
from mathutils import Vector

import rx_lib as L
import rx_ref as R


# ---------------------------------------------------------------- 2D helpers
def hz(view, pts):
    """Pixel points -> view coordinates (h, z)."""
    return [R.px(view, x, y) for x, y in pts]


def smooth_path(points_hz, samples=6):
    """Catmull-Rom through (h, z) points; returns (h, z) tuples."""
    if len(points_hz) < 3:
        return [tuple(p) for p in points_hz]
    V = [Vector((h, z, 0.0)) for h, z in points_hz]
    return [(v.x, v.y) for v in L.catmull_rom(V, samples)]


# ---------------------------------------------------------------- profiles
def lens(th, n=9, edge=0.18):
    """Crystal inlay section: flat back, domed face. x along the normal
    (metres, centred), y across (-0.5..0.5, scaled by the width)."""
    pts = [(-th / 2, -0.5), (-th / 2, 0.5)]
    for i in range(n):
        y = 0.5 - i / (n - 1)
        x = -th / 2 + th * (edge + (1 - edge) * max(1 - (2 * y) ** 2, 0.0) ** 0.5)
        pts.append((x, y))
    # drop duplicated corners
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > 1e-7 or abs(out[-1][1] - p[1]) > 1e-7):
            out.append(p)
    return out


def bevel_bar(th, cx=0.35, cy=0.12):
    """Flat trim section with chamfered top edges."""
    return [
        (-th / 2, -0.5), (th / 2 - th * cx, -0.5), (th / 2, -0.5 + cy),
        (th / 2, 0.5 - cy), (th / 2 - th * cx, 0.5), (-th / 2, 0.5),
    ]


def ridge_bar(th, cy=0.10, shoulder=0.72):
    """Trim with a central ridge (gabled top) and chamfered sides."""
    return [
        (-th / 2, -0.5), (th / 2 - th * (1 - shoulder) - th * 0.25, -0.5), (-th / 2 + th * shoulder, -0.5 + cy),
        (th / 2, 0.0), (-th / 2 + th * shoulder, 0.5 - cy), (th / 2 - th * (1 - shoulder) - th * 0.25, 0.5),
        (-th / 2, 0.5),
    ]


# ---------------------------------------------------------------- strips
def strip(body, view, pts_px, width, thick, profile=None, wf=None, gap=0.002, samples=6, res=0.006, lift_fn=None):
    """A raised trim/inlay along a pixel path in `view`; returns a bmesh."""
    path = smooth_path(hz(view, pts_px), samples)
    prof = profile or bevel_bar(thick)
    bm = L.conform_strip(body, view, path, width, thickness=thick, gap=gap, res=res, width_fn=wf, profile=prof, lift_fn=lift_fn)
    if len(bm.faces):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def pointed(p0=0.5, p1=0.6, a=0.15, b=0.85):
    """Width function: rises over [0, a], full until b, pointed at both ends."""

    def f(t):
        if t < a:
            return max((t / a) ** p0, 0.05)
        if t > b:
            return max(((1 - t) / (1 - b)) ** p1, 0.03)
        return 1.0

    return f


def taper(p=0.8, start=0.0, root=1.0):
    def f(t):
        if t < start:
            return root
        return max(root * ((1 - t) / (1 - start)) ** p, 0.03)

    return f


# ---------------------------------------------------------------- plates
def chevron_outline(hw, z_top, z_tip, aw, cut=0.35, xc=0.0):
    """Gold V (two arms meeting in a point) in (h, z): half-width hw at z_top,
    tip at (xc, z_tip), arm width aw (perpendicular). The arm ends are cut
    with a slant (`cut` x aw lower at the outer corner)."""
    H = z_top - z_tip
    alpha = math.atan2(hw, H)  # half-angle from vertical
    dz_in = aw / math.sin(alpha) if alpha > 1e-3 else aw
    dh = aw / math.cos(alpha)
    return [
        (xc, z_tip),
        (xc + hw, z_top - cut * aw),
        (xc + hw - dh, z_top),
        (xc, z_tip + dz_in),
        (xc - hw + dh, z_top),
        (xc - hw, z_top - cut * aw),
    ], dz_in, dh


def v_outline(A, T, B, aw):
    """General V (two arms meeting at tip T) from top ends A and B with arm
    width aw. Returns (outline, ridge, inner_tip, A_in, B_in)."""
    A, T, B = Vector(A), Vector(T), Vector(B)
    dA = (T - A).normalized()
    dB = (T - B).normalized()
    nA = Vector((-dA.y, dA.x))
    if nA.dot(B - A) < 0:
        nA = -nA
    nB = Vector((-dB.y, dB.x))
    if nB.dot(A - B) < 0:
        nB = -nB
    pA, pB = A + nA * aw, B + nB * aw
    # intersect pA + s dA with pB + t dB
    det = dA.x * (-dB.y) - dA.y * (-dB.x)
    if abs(det) < 1e-9:
        inner = T + (nA + nB).normalized() * aw
    else:
        rhs = pB - pA
        s_ = (rhs.x * (-dB.y) - rhs.y * (-dB.x)) / det
        inner = pA + dA * s_
    outline = [tuple(T), tuple(B), tuple(pB), tuple(inner), tuple(pA), tuple(A)]
    ridge = [tuple(A + nA * aw * 0.5 + dA * 0.002), tuple(T.lerp(inner, 0.5)), tuple(B + nB * aw * 0.5 + dB * 0.002)]
    return outline, ridge, tuple(inner), tuple(pA), tuple(pB)


class SideBody:
    """Body proxy whose side-view rays start at |X| = x0 (between the torso
    and the hanging arm) instead of outside the whole figure."""

    def __init__(self, body, x0=0.24, x_max=None):
        self.body = body
        self.x0 = x0
        self.x_max = x_max if x_max is not None else x0 - 0.01
        self.bvh = body.bvh

    def _org(self, view, h, z):
        if view == "left":
            return Vector((self.x0, h, z)), Vector((-1.0, 0.0, 0.0))
        if view == "right":
            return Vector((-self.x0, h, z)), Vector((1.0, 0.0, 0.0))
        org, d = L.VIEW_RAY[view]
        return org(h, z), d

    def ray(self, o, d, dist=10.0):
        return self.body.ray(o, d, dist)

    def hit(self, view, h, z, smooth=0.008):
        o, d = self._org(view, h, z)
        first = self.body.ray(o, d)
        if first is None:
            return None
        loc, n = first
        if view in ("left", "right") and abs(loc.x) > self.x_max:
            return None
        n = -n if n.dot(d) > 0 else n
        if smooth > 0:
            acc = Vector(n)
            for dh, dz in ((smooth, 0), (-smooth, 0), (0, smooth), (0, -smooth)):
                o2, _ = self._org(view, h + dh, z + dz)
                r = self.body.ray(o2, d)
                if r is not None and (r[0] - loc).length < smooth * 3:
                    acc += -r[1] if r[1].dot(d) > 0 else r[1]
            n = acc.normalized()
        return loc, n

    def closest(self, p):
        return self.body.closest(p)


def ridge_plate(bm, body, view, outline_hz, ridge_hz, th_edge, th_ridge, gap=0.002, step=0.006, scale_fn=None, smooth=0.006, bottom=True, dense=True):
    """Faceted plate on the body: a 2D outline (CCW or CW, view coords) and a
    ridge polyline inside it; the top rises from th_edge at the outline to
    th_ridge on the ridge with flat facets in between (crisp creases).
    scale_fn(h, z) -> multiplier of both heights (e.g. thin root, thick tip).
    bottom=False leaves out the hidden underside (plates lying on the suit).
    Faces are oriented explicitly (top along the body normal, walls outward).
    Appends to `bm`; returns the list of new top-outline edges or None."""
    import scipy.spatial

    outline = L.ccw(outline_hz)
    ob = L.densify(outline, step) if dense else list(outline)
    rd = L.densify(ridge_hz, step, closed=False) if len(ridge_hz) > 1 else list(ridge_hz)
    pts = np.asarray(ob + rd, dtype=float)
    nb = len(ob)
    keep = list(range(nb))
    B = np.asarray(ob)
    for i in range(nb, len(pts)):
        if np.min(np.linalg.norm(B - pts[i], axis=1)) > step * 0.35:
            keep.append(i)
    pts = pts[keep]
    tri = scipy.spatial.Delaunay(pts)
    simp = [s_ for s_ in tri.simplices if L.point_in_polygon([pts[s_].mean(axis=0)], ob)[0]]
    hits = []
    for h, z in pts:
        r = body.hit(view, h, z, smooth=smooth)
        if r is None:
            return None
        hits.append(r)
    top, bot = [], []
    for i, (h, z) in enumerate(pts):
        p, n = hits[i]
        k = scale_fn(h, z) if scale_fn else 1.0
        th = (th_edge if i < nb else th_ridge) * k
        g = gap(h, z) if callable(gap) else gap
        top.append(bm.verts.new(p + n * (g + th)))
        bot.append(bm.verts.new(p + n * g))
    centre = sum((Vector(hh[0]) for hh in hits), Vector()) / len(hits)

    def add(vs, want):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return None
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
        return f

    for a_, b_, c_ in simp:
        nrm = (hits[a_][1] + hits[b_][1] + hits[c_][1]).normalized()
        add((top[a_], top[b_], top[c_]), nrm)
        if bottom:
            add((bot[a_], bot[b_], bot[c_]), -nrm)
    rim = []
    for i in range(nb):
        j = (i + 1) % nb
        mid = (hits[i][0] + hits[j][0]) * 0.5
        add((top[i], bot[i], bot[j], top[j]), mid - centre)
        e = bm.edges.get((top[i], top[j]))
        if e:
            rim.append(e)
    return rim


def float_plate(bm, outline_xz, ridge_xz, dfun, th_edge, th_ridge, base=0.003, step=0.004):
    """Faceted slab floating in front of the body (front view outline in X-Z):
    the mid-surface sits at depth dfun(z) (world Y = -d), the top rises from
    th_edge at the outline to th_ridge on the ridge, the back is `base` behind.
    Returns the top-outline edges (for a bevel)."""
    import scipy.spatial

    outline = L.ccw(outline_xz)
    ob = L.densify(outline, step)
    rd = L.densify(ridge_xz, step, closed=False)
    pts = np.asarray(ob + rd, dtype=float)
    nb = len(ob)
    keep = list(range(nb)) + [i for i in range(nb, len(pts)) if np.min(np.linalg.norm(np.asarray(ob) - pts[i], axis=1)) > step * 0.35]
    pts = pts[keep]
    tri = scipy.spatial.Delaunay(pts)
    simp = [s_ for s_ in tri.simplices if L.point_in_polygon([pts[s_].mean(axis=0)], ob)[0]]
    fwd = Vector((0.0, -1.0, 0.0))
    top, bot = [], []
    for i, (x, z) in enumerate(pts):
        p = Vector((x, -dfun(z), z))
        th = th_edge if i < nb else th_ridge
        top.append(bm.verts.new(p + fwd * th))
        bot.append(bm.verts.new(p - fwd * base))
    centre = Vector((float(np.mean(pts[:, 0])), 0.0, float(np.mean(pts[:, 1]))))

    def add(vs, want):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()

    for a_, b_, c_ in simp:
        add((top[a_], top[b_], top[c_]), fwd)
        add((bot[a_], bot[b_], bot[c_]), -fwd)
    rim = []
    for i in range(nb):
        j = (i + 1) % nb
        mid = Vector(((pts[i][0] + pts[j][0]) / 2, 0.0, (pts[i][1] + pts[j][1]) / 2))
        add((top[i], bot[i], bot[j], top[j]), mid - centre)
        e = bm.edges.get((top[i], top[j]))
        if e:
            rim.append(e)
    return rim


def finish_plates(bm, bevel=0.0, rims=None, recalc=False):
    """Optional bevel of the given top-outline edges (faces are already oriented)."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0 and rims:
        rims = [e for e in rims if e.is_valid]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=1, affect="EDGES", profile=0.5, clamp_overlap=True)
    bm.normal_update()
    return bm


def leaf_outline(c, length, width, angle, root=0.35, n_side=5, tip_power=0.9, root_power=0.6):
    """Pointed-leaf outline (view coords) centred at c, tip along `angle`."""
    u = (math.cos(angle), math.sin(angle))
    v = (-u[1], u[0])
    left, right = [], []
    for i in range(n_side + 1):
        s = i / n_side
        if s <= root:
            f = 0.35 + 0.65 * (s / root) ** root_power
        else:
            f = ((1 - s) / (1 - root)) ** tip_power
        hw = 0.5 * width * f
        ph = c[0] + u[0] * (s - 0.5) * length
        pz = c[1] + u[1] * (s - 0.5) * length
        left.append((ph + v[0] * hw, pz + v[1] * hw))
        right.append((ph - v[0] * hw, pz - v[1] * hw))
    tip = (c[0] + u[0] * 0.5 * length, c[1] + u[1] * 0.5 * length)
    outline = left[:-1] + [tip] + list(reversed(right[:-1]))
    ridge = [(c[0] - u[0] * 0.40 * length, c[1] - u[1] * 0.40 * length), (c[0] + u[0] * 0.44 * length, c[1] + u[1] * 0.44 * length)]
    return outline, ridge


def tile_field(bm, body, view, region_px, angle, length_px, width_px, row_step=0.50, col_step=0.92, th_tip=0.0042, keel=2.0, gap=0.0018, rims=None, step=0.016):
    """Fill a pixel polygon of `view` with staggered overlapping keeled plates.
    angle: tip direction in view coords (radians, from +h), constant or
    f(h, z) -> radians. Rows run across the mean direction; each row's tips
    cover the next row's thin roots. Returns the number of plates."""
    region = hz(view, region_px)
    Lm, Wm = length_px * R.S, width_px * R.S
    xs = [p[0] for p in region]
    zs = [p[1] for p in region]
    c0 = (sum(xs) / len(xs), sum(zs) / len(zs))
    a0 = angle(*c0) if callable(angle) else angle
    u = Vector((math.cos(a0), math.sin(a0)))
    v = Vector((-u.y, u.x))
    # lattice extents in the (u, v) frame
    us = [(Vector(p) - Vector(c0)).dot(u) for p in region]
    vs = [(Vector(p) - Vector(c0)).dot(v) for p in region]
    du, dv = Lm * row_step, Wm * col_step
    n = 0
    i = 0
    uu = min(us) - du * 0.5
    while uu <= max(us) + du * 0.5:
        off = 0.5 * dv if i % 2 else 0.0
        vv = min(vs) - dv + off
        while vv <= max(vs) + dv:
            ch = c0[0] + u.x * uu + v.x * vv
            cz = c0[1] + u.y * uu + v.y * vv
            if L.point_in_polygon([(ch, cz)], region)[0]:
                ang = angle(ch, cz) if callable(angle) else angle
                outline, ridge = leaf_outline((ch, cz), Lm, Wm, ang)
                tdir = Vector((math.cos(ang), math.sin(ang), 0.0))
                root = Vector((ch, cz, 0.0)) - tdir * (Lm * 0.5)

                def ramp(h, z, root=root, tdir=tdir):
                    s_ = (Vector((h, z, 0.0)) - root).dot(tdir) / Lm
                    return 0.25 + 0.75 * min(max(s_, 0.0), 1.0) ** 0.8

                r = ridge_plate(bm, body, view, outline, ridge, th_tip * 0.42, th_tip * keel * 0.42, gap=gap, step=step, scale_fn=ramp, bottom=False, dense=False)
                if r is not None:
                    n += 1
                    if rims is not None:
                        rims.extend(r)
            vv += dv
        uu += du
        i += 1
    return n


def clearance_profile(body, view, objects, h_samples, z0, z1, n=12, pad=0.002):
    """How far other parts' meshes (e.g. the helmet's gorget) stand off the body
    along `view` rays: returns f(z) -> extra lift (metres), the max over the
    h samples, padded and made monotone toward the top. Zero when `objects`
    is empty or nothing covers the band."""
    from mathutils.bvhtree import BVHTree
    import bpy

    if not objects:
        return lambda z: 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    trees = []
    for o in objects:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        verts = [o.matrix_world @ v.co for v in me.vertices]
        polys = [tuple(p.vertices) for p in me.polygons]
        if polys:
            trees.append(BVHTree.FromPolygons(verts, polys))
        ev.to_mesh_clear()
    org, d = L.VIEW_RAY[view]
    zs = [z0 + (z1 - z0) * i / (n - 1) for i in range(n)]
    lift = []
    for z in zs:
        best = 0.0
        for h in h_samples:
            rb = body.ray(org(h, z), d)
            if rb is None:
                continue
            for t in trees:
                loc, _n, _i, _dist = t.ray_cast(org(h, z), d)
                if loc is not None:
                    stand = (rb[0] - loc).dot(d)  # >0 when the part is in front of the body
                    best = max(best, stand)
        lift.append(best + pad if best > 0 else 0.0)
    # monotone non-decreasing toward the top (z1), so the plate rises smoothly onto the collar
    for i in range(1, n):
        lift[i] = max(lift[i], lift[i - 1]) if z1 > z0 else lift[i]

    def f(z):
        if z <= zs[0]:
            return lift[0]
        if z >= zs[-1]:
            return lift[-1]
        t = (z - zs[0]) / (zs[-1] - zs[0]) * (n - 1)
        i = min(int(t), n - 2)
        u = t - i
        u = u * u * (3 - 2 * u)
        return lift[i] * (1 - u) + lift[i + 1] * u

    return f
