"""Geometry helpers for part_legs.py (legs + boots of the Rexonance suit).

Surface maps
    ViewMap(body, "front")   (h, z) view coordinates -> body point + smooth normal
    CylMap(body, top, bot)   (arc, s) around a leg axis -> body point + normal

Profile meshes
    A 2D outline (CCW, local (a, b) metres) is swept with a cross-section
    profile [(offset, height), ...]: every profile point becomes a ring
    offset_outline(base, offset) lifted to `height`. Plates end in a capped
    top (triangulated with interior points so they bend with the surface),
    bands (frames) close the profile into a loop. The flat result is then
    mapped vertex by vertex: (a, b, h) -> P(a, b) + N(a, b) * (gap + lift + h).
    Bevels are built into the profile, so they stay crisp after mapping.
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import rx_lib as L

# ------------------------------------------------------------------ maps


class ViewMap:
    """First body surface seen from a view; normals from finite differences."""

    def __init__(self, body, view="front", eps=0.010):
        self.body = body
        self.view = view
        self.org, self.d = L.VIEW_RAY[view]
        self.eps = eps
        self.cache = {}

    def _p(self, h, z):
        key = (round(h, 5), round(z, 5))
        if key in self.cache:
            return self.cache[key]
        r = self.body.ray(self.org(h, z), self.d)
        p = Vector(r[0]) if r else None
        self.cache[key] = p
        return p

    def point(self, h, z):
        p = self._p(h, z)
        if p is not None:
            return p
        # outside the silhouette: walk toward the given fallback depth
        org = self.org(h, z)
        guess = org + self.d * 3.0
        loc, _n = self.body.closest(guess)
        return Vector(loc)

    def at(self, h, z):
        p = self.point(h, z)
        e = self.eps
        a = self._p(h + e, z)
        b = self._p(h - e, z)
        c = self._p(h, z + e)
        d = self._p(h, z - e)
        th = (a - b) if (a and b) else ((a - p) if a else ((p - b) if b else None))
        tz = (c - d) if (c and d) else ((c - p) if c else ((p - d) if d else None))
        if th is None or tz is None:
            loc, n = self.body.closest(p)
            n = Vector(n)
        else:
            n = th.cross(tz)
        if n.length < 1e-12:
            n = -self.d
        n.normalize()
        if n.dot(self.d) > 0:
            n = -n
        return p, n


class CylMap:
    """Rays from a leg axis outward. a = arc (r_ref * phi), b = s (metres down
    the axis from `top`); phi = 0 faces front (-Y), +pi/2 faces +X."""

    def __init__(self, body, top, bottom, r_ref=0.06, eps=0.010, front=(0.0, -1.0, 0.0)):
        self.body = body
        self.p0 = Vector(top)
        self.p1 = Vector(bottom)
        self.length = (self.p1 - self.p0).length
        self.d = (self.p1 - self.p0).normalized()
        f = Vector(front)
        self.f = (f - self.d * f.dot(self.d)).normalized()
        self.l = self.f.cross(self.d).normalized()
        self.r_ref = r_ref
        self.eps = eps
        self.cache = {}

    def center(self, s):
        return self.p0 + self.d * s

    def direction(self, phi):
        return self.f * math.cos(phi) + self.l * math.sin(phi)

    def _p(self, a, s):
        key = (round(a, 5), round(s, 5))
        if key in self.cache:
            return self.cache[key]
        phi = a / self.r_ref
        c = self.center(s)
        d = self.direction(phi)
        r = self.body.ray(c, d, 1.0)
        p = Vector(r[0]) if r else c + d * self.r_ref
        self.cache[key] = p
        return p

    def at(self, a, s):
        p = self._p(a, s)
        e = self.eps
        ea = e  # arc step
        ta = self._p(a + ea, s) - self._p(a - ea, s)
        ts = self._p(a, s + e) - self._p(a, s - e)
        n = ta.cross(ts)
        out = p - self.center(s)
        if n.length < 1e-12:
            n = out.copy()
        n.normalize()
        if n.dot(out) < 0:
            n = -n
        return p, n

    def radius(self, a, s):
        p = self._p(a, s)
        v = p - self.center(s)
        return (v - self.d * v.dot(self.d)).length


# ------------------------------------------------------------------ profiles


def bevel_steps(b, seg=2):
    """Quarter-round bevel: [(inset, dh)] from the wall top (inset 0, dh -b)
    to the top face (inset b, dh 0)."""
    out = []
    for k in range(seg + 1):
        a = (math.pi / 2) * k / seg
        out.append((b * (1.0 - math.cos(a)), -b * (1.0 - math.sin(a))))
    return out


def plate_profile(t, b=0.0015, seg=2, h0=0.0):
    """Outer wall + bevelled top edge; the last ring is capped."""
    prof = [(0.0, h0)]
    if b <= 0:
        prof.append((0.0, h0 + t))
        return prof
    for inset, dh in bevel_steps(b, seg):
        prof.append((-inset, h0 + t + dh))
    return prof


def band_profile(w, t, b=0.0015, seg=2, h0=0.0, ridge=0.0, inner_t=None):
    """Closed cross-section of a frame band of width w (inward from the
    outline) and height t; optional ridge raises the band's centre line."""
    ti = t if inner_t is None else inner_t
    b = min(b, w * 0.3, t * 0.8, ti * 0.8)
    prof = [(0.0, h0)]
    for inset, dh in bevel_steps(b, seg):
        prof.append((-inset, h0 + t + dh))
    if ridge > 0:
        prof.append((-w * 0.5, h0 + max(t, ti) + ridge))
    for inset, dh in reversed(bevel_steps(b, seg)):
        prof.append((-w + inset, h0 + ti + dh))
    prof.append((-w, h0))
    return prof


# ------------------------------------------------------------------ meshing


def densify(outline, step):
    return L.densify([tuple(p) for p in outline], step, closed=True)


def _cap(ring2d, res):
    """Triangulate a simple polygon ring with interior grid points (constrained
    Delaunay, so concave outlines keep their boundary edges). Returns
    (extra_pts, tris) where tri indices < len(ring) refer to the ring."""
    from mathutils import geometry

    ring = np.asarray(ring2d, dtype=float)
    n = len(ring)
    grid = np.zeros((0, 2))
    if res and res > 0:
        x0, y0 = ring.min(axis=0)
        x1, y1 = ring.max(axis=0)
        gx, gy = np.meshgrid(np.arange(x0 + res * 0.5, x1, res), np.arange(y0 + res * 0.5, y1, res))
        g = np.stack([gx.ravel(), gy.ravel()], axis=1)
        if len(g):
            g = g[L.point_in_polygon(g, ring)]
        if len(g):
            dmin = np.min(np.linalg.norm(g[:, None, :] - ring[None, :, :], axis=2), axis=1)
            g = g[dmin > res * 0.55]
        grid = g
    pts = np.vstack([ring, grid]) if len(grid) else ring
    if len(pts) < 3:
        return np.zeros((0, 2)), []
    coords = [Vector((float(x), float(y))) for x, y in pts]
    edges = [(i, (i + 1) % n) for i in range(n)]
    try:
        vo, _eo, fo, orig_v, _oe, _of = geometry.delaunay_2d_cdt(coords, edges, [list(range(n))], 1, 1e-9, True)
    except TypeError:
        vo, _eo, fo, orig_v, _oe, _of = geometry.delaunay_2d_cdt(coords, edges, [list(range(n))], 1, 1e-9)
    # map output vertices back to input indices (CDT may reorder; new
    # intersection vertices only appear for self-intersecting rings)
    remap = []
    extra = []
    for i, ids in enumerate(orig_v):
        if ids:
            remap.append(int(ids[0]))
        else:
            remap.append(len(pts) + len(extra))
            extra.append((float(vo[i].x), float(vo[i].y)))
    tris = []
    for f in fo:
        f = [remap[i] for i in f]
        for k in range(1, len(f) - 1):
            tri = (f[0], f[k], f[k + 1])
            a, b, c = (pts[i] if i < len(pts) else np.asarray(extra[i - len(pts)]) for i in tri)
            area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(area) < 1e-14:
                continue
            tris.append(tri if area > 0 else (tri[0], tri[2], tri[1]))
    rest = np.vstack([grid, np.asarray(extra)]) if extra else grid
    return rest.reshape(-1, 2), tris


class FlatMesh:
    """Vertices in local (a, b, h) + faces; mapped to world later."""

    def __init__(self):
        self.v = []  # (a, b, h)
        self.f = []  # index tuples
        self.uv = None  # optional per-vertex uv override

    def add_ring(self, pts2d, h):
        i0 = len(self.v)
        self.v.extend((float(x), float(y), float(h)) for x, y in pts2d)
        return list(range(i0, len(self.v)))

    def bridge(self, ra, rb, closed=True):
        n = len(ra)
        rng = range(n) if closed else range(n - 1)
        for j in rng:
            k = (j + 1) % n
            self.f.append((ra[j], ra[k], rb[k], rb[j]))

    def cap(self, ring_idx, res, flip=False):
        ring2d = [(self.v[i][0], self.v[i][1]) for i in ring_idx]
        h = self.v[ring_idx[0]][2]
        extra, tris = _cap(ring2d, res)
        ids = list(ring_idx) + self.add_ring(extra, h)
        for a, b, c in tris:
            t = (ids[a], ids[b], ids[c])
            self.f.append(t[::-1] if flip else t)

    def extend(self, other):
        off = len(self.v)
        self.v.extend(other.v)
        self.f.extend(tuple(i + off for i in f) for f in other.f)
        return self


def subdivided(coarse, counts):
    """Subdivide edge i of a closed polygon into counts[i] segments."""
    out = []
    n = len(coarse)
    for i in range(n):
        (x0, y0), (x1, y1) = coarse[i], coarse[(i + 1) % n]
        k = counts[i]
        for j in range(k):
            t = j / k
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def poly_rings(coarse, step):
    """Ring factory for a coarse polygon: offset first, then subdivide every
    edge the same number of times so all rings correspond 1:1."""
    coarse = L.ccw(coarse)
    n = len(coarse)
    counts = []
    for i in range(n):
        (x0, y0), (x1, y1) = coarse[i], coarse[(i + 1) % n]
        counts.append(max(1, int(math.ceil(math.hypot(x1 - x0, y1 - y0) / step))))

    def fn(off):
        ring = L.offset_outline(coarse, off) if abs(off) > 1e-12 else list(coarse)
        return subdivided(ring, counts)

    return fn


def lens_rings(c, half_h, half_w, tilt=0.0, n=48, power=1.0, tip_k=None):
    """Ring factory for nested almonds (offset < 0 shrinks)."""
    if tip_k is None:
        ang = math.atan2(2 * half_w * power, half_h)
        tip_k = 1.0 / max(math.sin(ang), 0.2)

    def fn(off):
        return lens_outline(c, max(half_h + off * tip_k, 1e-4), max(half_w + off, 1e-4), tilt, n, power)

    return fn


def profile_mesh(rings_fn, profile, closed_profile=False, cap_top=True, cap_bottom=True, res=0.012, fm=None):
    """Sweep `profile` [(offset, height)] around the outline given by
    rings_fn(offset) -> CCW ring (same vertex count for every offset), or a
    plain CCW outline (offset with rx_lib.offset_outline)."""
    if not callable(rings_fn):
        base = L.ccw(rings_fn)

        def rings_fn(off, base=base):
            return L.offset_outline(base, off) if abs(off) > 1e-12 else list(base)

    fm = fm or FlatMesh()
    rings = []
    for off, h in profile:
        rings.append(fm.add_ring(L.ccw(rings_fn(off)), h))
    for i in range(len(rings) - 1):
        fm.bridge(rings[i], rings[i + 1])
    if closed_profile:
        fm.bridge(rings[-1], rings[0])
    else:
        if cap_top:
            fm.cap(rings[-1], res, flip=False)
        if cap_bottom:
            fm.cap(rings[0], res, flip=True)
    return fm


def plate(base, t, bevel=0.0015, seg=2, h0=0.0, res=0.012, fm=None, cap_bottom=True):
    return profile_mesh(base, plate_profile(t, bevel, seg, h0), cap_bottom=cap_bottom, res=res, fm=fm)


def band(base, w, t, bevel=0.0015, seg=2, h0=0.0, ridge=0.0, inner_t=None, fm=None):
    return profile_mesh(base, band_profile(w, t, bevel, seg, h0, ridge, inner_t), closed_profile=True, fm=fm)


def to_bmesh(fm, mapper, uv_fn=None, recalc=True):
    """mapper(a, b, h) -> world Vector. uv_fn(a, b, h) -> (u, v)."""
    bm = bmesh.new()
    verts = [bm.verts.new(mapper(a, b, h)) for a, b, h in fm.v]
    uvl = bm.loops.layers.uv.verify()
    for f in fm.f:
        if len(set(f)) < len(f):
            continue
        try:
            face = bm.faces.new([verts[i] for i in f])
        except ValueError:
            continue
        if uv_fn is not None:
            for loop, i in zip(face.loops, f):
                loop[uvl].uv = uv_fn(*fm.v[i])
    bm.verts.ensure_lookup_table()
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    return bm


def planar_uv(fm, axis_v=1, flip=False, vrange=None):
    """UV planar in local (a, b): u across, v along axis_v (0 = a, 1 = b)."""
    A = np.asarray([p[0] for p in fm.v])
    B = np.asarray([p[1] for p in fm.v])
    U, V = (B, A) if axis_v == 0 else (A, B)
    u0, u1 = U.min(), U.max()
    v0, v1 = (V.min(), V.max()) if vrange is None else vrange

    def fn(a, b, h):
        u, v = (b, a) if axis_v == 0 else (a, b)
        vv = (v - v0) / max(v1 - v0, 1e-9)
        if flip:
            vv = 1.0 - vv
        return ((u - u0) / max(u1 - u0, 1e-9), vv)

    return fn


def surface_mapper(smap, gap=0.0, lift=None):
    """mapper for to_bmesh from a ViewMap/CylMap: (a, b, h) -> P + N (gap + lift + h)."""
    cache = {}

    def m(a, b, h):
        key = (round(a, 6), round(b, 6))
        r = cache.get(key)
        if r is None:
            r = smap.at(a, b)
            cache[key] = r
        p, n = r
        extra = lift(a, b) if lift else 0.0
        return p + n * (gap + extra + h)

    return m


def rigid_mapper(matrix):
    def m(a, b, h):
        return matrix @ Vector((a, b, h))

    return m


# ------------------------------------------------------------------ outlines


def rhombus(c, half_h, half_w, tilt=0.0, top_frac=0.5):
    """Vertical rhombus centred at c=(x, y), rotated by tilt (radians, +CCW)."""
    ct, st = math.cos(tilt), math.sin(tilt)
    up = (-st, ct)
    rt = (ct, st)
    hh_top = half_h * 2 * top_frac
    hh_bot = half_h * 2 * (1 - top_frac)
    pts = [
        (c[0] + up[0] * hh_top, c[1] + up[1] * hh_top),
        (c[0] - rt[0] * half_w, c[1] - rt[1] * half_w),
        (c[0] - up[0] * hh_bot, c[1] - up[1] * hh_bot),
        (c[0] + rt[0] * half_w, c[1] + rt[1] * half_w),
    ]
    return L.ccw(pts)


def lens_outline(c, half_h, half_w, tilt=0.0, n=48, power=1.0):
    """Pointed-oval (vesica) outline: half-width w(y) = half_w * (1 - (y/half_h)^2)^power."""
    ct, st = math.cos(tilt), math.sin(tilt)
    m = n // 2
    right, left = [], []
    for i in range(m + 1):
        y = -half_h + 2 * half_h * i / m
        w = half_w * max(0.0, 1.0 - (y / half_h) ** 2) ** power
        right.append((w, y))
        left.append((-w, y))
    pts = right + list(reversed(left[1:-1]))
    out = [(c[0] + x * ct - y * st, c[1] + x * st + y * ct) for x, y in pts]
    return L.ccw(out)


def polyline_offset(path, d):
    """Offset an open 2D polyline by d (left normal)."""
    P = [Vector((x, y)) for x, y in path]
    out = []
    n = len(P)
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        t.normalize()
        nrm = Vector((-t.y, t.x))
        out.append(tuple(P[i] + nrm * d))
    return out


def smooth_path(points, samples=6):
    return [tuple(p) for p in L.catmull_rom([Vector((x, y, 0.0)) for x, y in points], samples)]


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


# ------------------------------------------------------------------ lofts & gems


def loft(sections, closed=False, cap_start=True, cap_end=True, bm=None, uv=None):
    """Bridge closed cross-sections (lists of 3D points, equal counts).
    closed: also bridge the last section back to the first (a ring).
    uv(i_section, j_point) -> (u, v)."""
    bm = bm if bm is not None else bmesh.new()
    rows = [[bm.verts.new(Vector(p)) for p in sec] for sec in sections]
    n = len(rows[0])
    m = len(rows)
    uvl = bm.loops.layers.uv.verify()
    count = m if closed else m - 1
    new_faces = []
    for i in range(count):
        i2 = (i + 1) % m
        ra, rb = rows[i], rows[i2]
        for j in range(n):
            k = (j + 1) % n
            try:
                f = bm.faces.new((ra[j], ra[k], rb[k], rb[j]))
            except ValueError:
                continue
            new_faces.append(f)
            if uv is not None:
                for loop, (ii, jj) in zip(f.loops, ((i, j), (i, k + (n if k == 0 else 0)), (i + 1, k + (n if k == 0 else 0)), (i + 1, j))):
                    loop[uvl].uv = uv(ii, jj)
    if not closed:
        for row, cap in ((rows[0], cap_start), (rows[-1], cap_end)):
            if not cap:
                continue
            try:
                f = bm.faces.new(row)
                new_faces.append(f)
                if uv is not None:
                    for loop in f.loops:
                        loop[uvl].uv = (0.5, 0.0 if row is rows[0] else 1.0)
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=new_faces)
    ngons = [f for f in new_faces if f.is_valid and len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.normal_update()
    return bm


def faceted_gem(outline, depth, table=0.45, crown=0.72, back=0.3, bm=None, matrix=None):
    """Faceted jewel over a convex 2D outline (local xy, centred on 0), rising
    along +z: girdle -> crown ring (scaled by `crown`, at 0.6 depth) -> table
    (scaled by `table`, at depth) and a pavilion point below."""
    bm = bm if bm is not None else bmesh.new()
    n = len(outline)
    g = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    mids = []
    for i in range(n):
        x0, y0 = outline[i]
        x1, y1 = outline[(i + 1) % n]
        mids.append(((x0 + x1) * 0.5 * crown, (y0 + y1) * 0.5 * crown))
    s = [bm.verts.new((x, y, depth * 0.62)) for x, y in mids]
    t = [bm.verts.new((x * table, y * table, depth)) for x, y in outline]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((g[i], g[j], s[i])))
        faces.append(bm.faces.new((g[i], s[i], t[i])))
        faces.append(bm.faces.new((s[i], g[j], t[j])))
        faces.append(bm.faces.new((t[i], s[i], t[j])))
    faces.append(bm.faces.new(t))
    pb = bm.verts.new((0.0, 0.0, -depth * back))
    for i in range(n):
        faces.append(bm.faces.new((g[(i + 1) % n], g[i], pb)))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    uvl = bm.loops.layers.uv.verify()
    for f in faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uvl].uv = ((co.x - min(xs)) / max(max(xs) - min(xs), 1e-9), (co.y - min(ys)) / max(max(ys) - min(ys), 1e-9))
    if matrix is not None:
        vs = list({v for f in faces for v in f.verts})
        bmesh.ops.transform(bm, matrix=matrix, verts=vs)
    bm.normal_update()
    return bm


def blade_profile(edge=0.18):
    """Diamond blade section with a sharp centre ridge: x = thickness (along
    the sweep normal), y = width. Unit size; scale with sweep(scale=(t, w))."""
    e = edge * 0.5
    return [(0.0, 0.5), (e, 0.36), (0.5, 0.0), (e, -0.36), (0.0, -0.5), (-e, -0.36), (-0.5, 0.0), (-e, 0.36)]


def blade(path, normals, width_fn, thick_fn, edge=0.18, bm=None):
    """Tapering blade along `path` (root first). normals: face normal per point
    (the blade's flat side). width_fn/thick_fn: t -> metres."""
    prof = L.ccw(blade_profile(edge))  # CCW profile -> outward faces from rx_lib.sweep
    out = L.sweep(path, prof, scale=lambda t: (max(thick_fn(t), 1e-4), max(width_fn(t), 1e-4)), normals=normals, bm=bm)
    return out


def bm_merge(dst, src):
    """Append bmesh src into dst (uv kept)."""
    me = bpy_mesh_from_bm(src)
    dst.from_mesh(me)
    import bpy

    bpy.data.meshes.remove(me)
    return dst


def bpy_mesh_from_bm(bm):
    import bpy

    me = bpy.data.meshes.new("_tmp_legs")
    bm.to_mesh(me)
    return me


def shell_grid(outer, inner, chamfer=0.35, bm=None, uv=None):
    """Closed shell from two matching grids rows[i][j] (outer and inner
    surface). The outer boundary loop is pulled toward the inner surface by
    `chamfer` (fraction) to make a bevelled rim."""
    bm = bm if bm is not None else bmesh.new()
    ni, nj = len(outer), len(outer[0])
    O = [[Vector(p) for p in row] for row in outer]
    I = [[Vector(p) for p in row] for row in inner]
    # chamfer: insert a ring one step in from the boundary at full height and
    # pull the boundary itself down toward the inner surface
    for i in range(ni):
        for j in range(nj):
            if i in (0, ni - 1) or j in (0, nj - 1):
                O[i][j] = O[i][j].lerp(I[i][j], chamfer)
    vo = [[bm.verts.new(p) for p in row] for row in O]
    vi = [[bm.verts.new(p) for p in row] for row in I]
    uvl = bm.loops.layers.uv.verify()
    faces = []

    def quad(a, b, c, d, uvs=None):
        try:
            f = bm.faces.new((a, b, c, d))
        except ValueError:
            return
        faces.append(f)
        if uv is not None and uvs is not None:
            for loop, q in zip(f.loops, uvs):
                loop[uvl].uv = uv(*q)

    for i in range(ni - 1):
        for j in range(nj - 1):
            quad(vo[i][j], vo[i + 1][j], vo[i + 1][j + 1], vo[i][j + 1], ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)))
            quad(vi[i][j + 1], vi[i + 1][j + 1], vi[i + 1][j], vi[i][j], ((i, j + 1), (i + 1, j + 1), (i + 1, j), (i, j)))
    # walls along the four boundary edges
    for i in range(ni - 1):
        for j in (0, nj - 1):
            quad(vo[i][j], vi[i][j], vi[i + 1][j], vo[i + 1][j], ((i, j), (i, j), (i + 1, j), (i + 1, j)))
    for j in range(nj - 1):
        for i in (0, ni - 1):
            quad(vo[i][j], vo[i][j + 1], vi[i][j + 1], vi[i][j], ((i, j), (i, j + 1), (i, j + 1), (i, j)))
    bmesh.ops.remove_doubles(bm, verts=[v for row in vo for v in row] + [v for row in vi for v in row], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.is_valid])
    bm.normal_update()
    return bm


def ridge_ribbon(path, hw, h_edge, h_ridge, bevel=0.0012, nt=2, nb=2, h_base=0.0, fm=None, miter_min=0.35):
    """Closed solid along an open 2D polyline `path` [(a, b)]: flat bottom at
    h_base, side walls up to h_edge (bevelled), and a roof whose two facets
    meet in a crisp crease along the path at h_ridge.

    hw: half-width (float or f(s), s = 0..1 by arc length). Sharp corners
    in the path are mitred, so V-shaped chevrons keep straight creases."""
    fm = fm if fm is not None else FlatMesh()
    P = [Vector((float(x), float(y))) for x, y in path]
    n = len(P)
    Ls = [0.0]
    for i in range(1, n):
        Ls.append(Ls[-1] + (P[i] - P[i - 1]).length)
    tot = max(Ls[-1], 1e-9)
    hwf = hw if callable(hw) else (lambda s, v=hw: v)
    # cross-section (t across -1..1, h) as a closed loop: right wall up, roof
    # over the ridge, left wall down, bottom back
    sec = [(1.0, h_base), (1.0, h_edge - bevel)]
    for k in range(nt + 1):
        t = 1.0 - k / nt  # 1 .. 0
        sec.append((t, h_edge + (h_ridge - h_edge) * (1.0 - t)))
    for k in range(1, nt + 1):
        t = -k / nt
        sec.append((t, h_edge + (h_ridge - h_edge) * (1.0 - abs(t))))
    sec.append((-1.0, h_edge - bevel))
    sec.append((-1.0, h_base))
    for k in range(1, 2 * nb):
        sec.append((-1.0 + k / nb, h_base))
    rings = []
    for i in range(n):
        if i == 0:
            d = (P[1] - P[0]).normalized()
            nrm = Vector((-d.y, d.x))
            sc = 1.0
        elif i == n - 1:
            d = (P[-1] - P[-2]).normalized()
            nrm = Vector((-d.y, d.x))
            sc = 1.0
        else:
            d0 = (P[i] - P[i - 1]).normalized()
            d1 = (P[i + 1] - P[i]).normalized()
            n0 = Vector((-d0.y, d0.x))
            n1 = Vector((-d1.y, d1.x))
            nrm = n0 + n1
            if nrm.length < 1e-9:
                nrm = n0
            nrm.normalize()
            sc = 1.0 / max(nrm.dot(n0), miter_min)
        w = max(hwf(Ls[i] / tot), 1e-4) * sc
        bev_t = min(bevel / max(w, 1e-6), 0.4)
        pts = []
        for t, h in sec:
            tt = t
            if abs(abs(t) - 1.0) < 1e-9 and abs(h - (h_edge - bevel)) > 1e-12 and h > h_base + 1e-12:
                tt = t
            pts.append((P[i].x + nrm.x * w * tt, P[i].y + nrm.y * w * tt, h))
        # pull the first roof points in by the bevel so the edge is chamfered
        ring = []
        for (x, y, h), (t, _h) in zip(pts, sec):
            if abs(abs(t) - 1.0) < 1e-9 and abs(_h - h_edge) < 1e-12:
                x = P[i].x + nrm.x * w * t * (1.0 - bev_t)
                y = P[i].y + nrm.y * w * t * (1.0 - bev_t)
            ring.append((x, y, h))
        i0 = len(fm.v)
        fm.v.extend(ring)
        rings.append(list(range(i0, len(fm.v))))
    for i in range(n - 1):
        fm.bridge(rings[i], rings[i + 1])
    fm.f.append(tuple(reversed(rings[0])))
    fm.f.append(tuple(rings[-1]))
    return fm
