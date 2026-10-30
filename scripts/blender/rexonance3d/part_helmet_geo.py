"""Geometry helpers for part_helmet.py (Rexonance helmet).

The helmet is built on one analytic "base" surface: a star-shaped shell around
a centre C, P(D) = C + R(D) D for unit directions D. It is the smooth union of
a dome (skull) and a prow-shaped face wedge, pushed out wherever the undersuit
head / neck would poke through. Every visible piece is layered on it:

  * param_panel() / panel()  shell plates cut out of the base in direction space
                   (outlines as azimuth/elevation degrees, or as "point specs"
                   traced in any reference view), so neighbours tile with even
                   seams even where a view sees the surface at a grazing angle;
  * view_plate()   a plate whose outline is drawn in a view plane and projected;
  * rail()         a profiled bar swept along a surface path (bands, trims), with
                   an optional mitre on X = 0 so mirrored halves meet exactly;
  * edge_blade() / edge_blade_part() / blade()   free-standing horns, feathers
                   (swept_edges() gives a feather's edges: hug the shell, then curve free);
  * NeckSurf / neck_plate()   the gorget lamellae around the undersuit neck.

Everything is built in world coordinates (identity transforms), metres.
"""

import math

import bmesh
import bpy
import numpy as np
import scipy.spatial
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from scipy.interpolate import PchipInterpolator, RegularGridInterpolator
from scipy.ndimage import gaussian_filter

import rx_lib as L
import rx_ref as R

S = R.S


# ------------------------------------------------------------------ small maths
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1.0 - h) + a * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def pchip(zs, vs):
    f = PchipInterpolator(np.asarray(zs, float), np.asarray(vs, float), extrapolate=True)
    lo, hi = float(min(zs)), float(max(zs))
    return lambda z: f(np.clip(z, lo, hi))


def dirs_from_angles(theta_deg, phi_deg):
    """azimuth theta (0 = front -Y, +90 = suit left +X), elevation phi -> unit (N, 3)."""
    t = np.radians(np.asarray(theta_deg, float))
    p = np.radians(np.asarray(phi_deg, float))
    return np.stack([np.sin(t) * np.cos(p), -np.cos(t) * np.cos(p), np.sin(p)], axis=-1)


def angles_from_dirs(D):
    D = np.asarray(D, float)
    th = np.degrees(np.arctan2(D[..., 0], -D[..., 1]))
    ph = np.degrees(np.arcsin(np.clip(D[..., 2], -1, 1)))
    return th, ph


# ------------------------------------------------------------------ base surface
class Base:
    """Star-shaped surface around C: P(D) = C + R(D) D.

    shape_G : list of vectorised implicit functions (N,3) -> (N,), < 0 inside;
              each is turned into a radius by bisection along rays from C and
              the radii are joined with a smooth max (k_union).
    body    : rx_lib.Body; the result is pushed out to body + margin.
    """

    def __init__(self, C, shape_G, k_union=0.006, body=None, margin=0.005, k_body=0.006, rmax=0.40, margin_fn=None):
        self.C = np.asarray(C, float)
        self.shape_G = shape_G
        self.k_union = k_union
        self.body = body
        self.margin = margin
        self.margin_fn = margin_fn
        self.k_body = k_body
        self.rmax = rmax
        self.bvh = None

    def _bisect(self, G, D):
        n = len(D)
        lo = np.full(n, 0.004)
        hi = np.full(n, self.rmax)
        # if the ray never leaves the shape inside rmax, treat it as rmax
        g_hi = G(self.C + D * hi[:, None])
        for _ in range(36):
            mid = 0.5 * (lo + hi)
            g = G(self.C + D * mid[:, None])
            inside = g < 0
            lo = np.where(inside, mid, lo)
            hi = np.where(inside, hi, mid)
        r = 0.5 * (lo + hi)
        return np.where(g_hi < 0, self.rmax, r)

    def body_radius(self, D):
        out = np.zeros(len(D))
        if self.body is None:
            return out
        c = Vector(self.C)
        for i, d in enumerate(D):
            hit = self.body.ray(c, Vector(d), dist=0.5)
            out[i] = (hit[0] - c).length if hit is not None else 0.0
        return out

    def radius(self, D):
        D = np.atleast_2d(np.asarray(D, float))
        r = None
        for G in self.shape_G:
            ri = self._bisect(G, D)
            r = ri if r is None else smax(r, ri, self.k_union)
        if self.body is not None:
            rb = self.body_radius(D)
            ok = rb > 0
            m = self.margin if self.margin_fn is None else self.margin_fn(D)
            r = np.where(ok, smax(r, rb + m, self.k_body), r)
        return r

    def points(self, D):
        D = np.atleast_2d(np.asarray(D, float))
        D = D / np.linalg.norm(D, axis=1)[:, None]
        return self.C + D * self.radius(D)[:, None]

    def points_normals(self, D, eps=0.004):
        """Surface points and outward unit normals for unit directions D (N, 3)."""
        D = np.atleast_2d(np.asarray(D, float))
        D = D / np.linalg.norm(D, axis=1)[:, None]
        n = len(D)
        a = np.where(np.abs(D[:, 2:3]) < 0.9, np.array([[0.0, 0.0, 1.0]]), np.array([[1.0, 0.0, 0.0]]))
        t1 = np.cross(D, a)
        t1 /= np.linalg.norm(t1, axis=1)[:, None]
        t2 = np.cross(D, t1)
        allD = np.concatenate([D, D + eps * t1, D - eps * t1, D + eps * t2, D - eps * t2])
        allD /= np.linalg.norm(allD, axis=1)[:, None]
        P = self.C + allD * self.radius(allD)[:, None]
        P0, P1a, P1b, P2a, P2b = P[:n], P[n:2 * n], P[2 * n:3 * n], P[3 * n:4 * n], P[4 * n:]
        N = np.cross(P1a - P1b, P2a - P2b)
        N /= np.maximum(np.linalg.norm(N, axis=1)[:, None], 1e-12)
        flip = np.sum(N * D, axis=1) < 0
        N[flip] *= -1
        return P0, N

    # -------------------------------------------------- mesh / bvh
    def grid(self, n_theta=144, phis=None):
        """Quad grid over (theta, phi); returns verts (V, 3), faces (list), and the
        (theta, phi) of each vertex. phis: elevations (deg), ascending, < 90; a pole
        vertex closes the top."""
        if phis is None:
            phis = np.linspace(-60.0, 88.0, 75)
        th = np.linspace(-180.0, 180.0, n_theta, endpoint=False)
        T, Pp = np.meshgrid(th, phis)
        D = dirs_from_angles(T.ravel(), Pp.ravel())
        V = self.points(D)
        pole = self.points(np.array([[0.0, 0.0, 1.0]]))
        V = np.vstack([V, pole])
        faces = []
        nr = len(phis)
        for i in range(nr - 1):
            for j in range(n_theta):
                a = i * n_theta + j
                b = i * n_theta + (j + 1) % n_theta
                c = (i + 1) * n_theta + (j + 1) % n_theta
                d = (i + 1) * n_theta + j
                faces.append((a, b, c, d))
        top = len(V) - 1
        for j in range(n_theta):
            a = (nr - 1) * n_theta + j
            b = (nr - 1) * n_theta + (j + 1) % n_theta
            faces.append((a, b, top))
        return V, faces

    def build_bvh(self, n_theta=180, phis=None):
        V, F = self.grid(n_theta, phis)
        self.bvh = BVHTree.FromPolygons([Vector(v) for v in V], F)
        return self.bvh

    def ray(self, origin, direction, dist=10.0):
        loc, nrm, _i, _d = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), dist)
        return (loc, nrm) if loc is not None else None


# ------------------------------------------------------------------ views
def view_axes(alpha=0.0, beta=0.0):
    """Camera looking along `dir` (alpha: azimuth, 0 = front camera at -Y,
    -90 = 'right' camera at -X, 90 = 'left', 180 = back; beta: elevation of the
    camera). Returns (right, up, dir) so that a view-plane point (u, v) is
    u * right + v * up. For the four reference views u = (x - cx) * S and
    v = (sole - y) * S (see ref_uv)."""
    a, b = math.radians(alpha), math.radians(beta)
    d = Vector((-math.sin(a) * math.cos(b), math.cos(a) * math.cos(b), -math.sin(b)))
    right = Vector((math.cos(a), math.sin(a), 0.0))
    up = right.cross(d).normalized()
    return right, up, d


VIEW_ALPHA = {"front": 0.0, "right": -90.0, "back": 180.0, "left": 90.0}


def ref_uv(view, x, y):
    v = R.VIEWS[view]
    return ((x - v["cx"]) * S, (v["sole"] - y) * S)


# ------------------------------------------------------------------ triangulation
def ccw(outline):
    return L.ccw([tuple(p) for p in outline])


def orient_outward(bm):
    """Flip any closed island whose signed volume is negative (inside-out).
    recalc_face_normals guesses wrong on thin curved blades."""
    bm.faces.ensure_lookup_table()
    seen = set()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        if not all(len(e.link_faces) == 2 for g in isl for e in g.edges):
            continue
        vol = 0.0
        for g in isl:
            vs = [lp.vert.co for lp in g.loops]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if vol < 0:
            bmesh.ops.reverse_faces(bm, faces=isl)
    bm.normal_update()
    return bm


def _dist_to_polyline(P, B, closed=True):
    P = np.asarray(P, float)
    A = B
    Bn = np.roll(B, -1, axis=0) if closed else B[1:]
    A = A if closed else B[:-1]
    d = np.full(len(P), np.inf)
    for a, b in zip(A, Bn):
        ab = b - a
        L2 = max(float(ab @ ab), 1e-18)
        t = np.clip(((P - a) @ ab) / L2, 0.0, 1.0)
        q = a + t[:, None] * ab
        d = np.minimum(d, np.linalg.norm(P - q, axis=1))
    return d


# ------------------------------------------------------------------ plates
def plate_bmesh(pts2, tris, nb, P, N, thick, lift=0.0, bevel=0.0012, bevel_seg=2, inner_lift=None):
    """Solid plate from a triangulated 2D patch mapped onto a surface.
    P, N: (n, 3) surface points / outward normals; thick: float or (n,) array.
    The outer rim gets a bevel. UV = normalised pts2."""
    n = len(pts2)
    th = np.full(n, float(thick)) if np.isscalar(thick) else np.asarray(thick, float)
    lf = np.full(n, float(lift)) if np.isscalar(lift) else np.asarray(lift, float)
    il = lf if inner_lift is None else inner_lift
    il = np.full(n, float(il)) if np.isscalar(il) else np.asarray(il, float)
    bm = bmesh.new()
    inner = [bm.verts.new(Vector(P[i] + N[i] * il[i])) for i in range(n)]
    outer = [bm.verts.new(Vector(P[i] + N[i] * (lf[i] + th[i]))) for i in range(n)]
    for a, b, c in tris:
        fa = (outer[a], outer[b], outer[c])
        nn = (fa[1].co - fa[0].co).cross(fa[2].co - fa[0].co)
        if nn.dot(Vector(N[a])) < 0:
            fa = (outer[a], outer[c], outer[b])
            fi = (inner[a], inner[b], inner[c])
        else:
            fi = (inner[a], inner[c], inner[b])
        try:
            bm.faces.new(fa)
            bm.faces.new(fi)
        except ValueError:
            pass
    for i in range(nb):
        j = (i + 1) % nb
        try:
            bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if bevel > 0:
        outer_set = set(outer)
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and e.verts[0] in outer_set and e.verts[1] in outer_set
               and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.6]
        if rim:
            bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=bevel_seg, affect="EDGES", profile=0.5, clamp_overlap=True)
    x0, y0 = pts2.min(axis=0)
    x1, y1 = pts2.max(axis=0)
    uv = bm.loops.layers.uv.verify()
    lookup = {}
    for i in range(n):
        lookup[inner[i]] = pts2[i]
        lookup[outer[i]] = pts2[i]
    for f in bm.faces:
        for loop in f.loops:
            p = lookup.get(loop.vert)
            if p is None:
                p = (x0, y0)
            loop[uv].uv = ((p[0] - x0) / max(x1 - x0, 1e-9), (p[1] - y0) / max(y1 - y0, 1e-9))
    bm.normal_update()
    orient_outward(bm)
    return bm


class DirFrame:
    """Azimuthal-equidistant flattening of directions around a mean direction m."""

    def __init__(self, m, up=(0.0, 0.0, 1.0)):
        m = np.asarray(m, float)
        self.m = m / np.linalg.norm(m)
        u = np.asarray(up, float)
        u = u - self.m * (u @ self.m)
        if np.linalg.norm(u) < 1e-6:
            u = np.array([0.0, 1.0, 0.0]) - self.m * self.m[1]
        self.e2 = u / np.linalg.norm(u)
        self.e1 = np.cross(self.e2, self.m)

    def to2(self, D):
        D = np.atleast_2d(D)
        c = np.clip(D @ self.m, -1, 1)
        rho = np.arccos(c)
        a = np.arctan2(D @ self.e2, D @ self.e1)
        return np.stack([rho * np.cos(a), rho * np.sin(a)], axis=1)

    def to3(self, Q):
        Q = np.atleast_2d(Q)
        rho = np.linalg.norm(Q, axis=1)
        a = np.arctan2(Q[:, 1], Q[:, 0])
        s = np.sin(rho)
        D = np.cos(rho)[:, None] * self.m + s[:, None] * (np.cos(a)[:, None] * self.e1 + np.sin(a)[:, None] * self.e2)
        return D


def param_panel(base, outline_deg, thick, lift=0.0, res=0.010, gap=0.0015, bevel=0.0012, mean_dir=None):
    """Shell panel on the base from an outline of (azimuth, elevation) degrees,
    densified along straight lines of the azimuthal flattening. gap: outline inset
    (metres) so neighbouring panels show an even seam."""
    D0 = dirs_from_angles([p[0] for p in outline_deg], [p[1] for p in outline_deg])
    m = np.mean(D0, axis=0) if mean_dir is None else np.asarray(mean_dir, float)
    fr = DirFrame(m)
    Q = fr.to2(D0)
    rmean = float(np.mean(base.radius(D0)))
    poly = ccw([tuple(q) for q in Q])
    if gap > 0:
        poly = L.offset_outline(poly, -gap / rmean)
    pts2, tris, nb = triangulate(poly, res / rmean)
    D = fr.to3(pts2)
    P, N = base.points_normals(D)
    return plate_bmesh(pts2, tris, nb, P, N, thick, lift=lift, bevel=bevel)


def view_hits(base, view, uv_pts, alpha=None, beta=0.0):
    """Project view-plane points onto the base: returns (P (n,3), N (n,3), ok)."""
    a = VIEW_ALPHA[view] if isinstance(view, str) else float(view)
    if alpha is not None:
        a = alpha
    right, up, d = view_axes(a, beta)
    P = np.zeros((len(uv_pts), 3))
    ok = np.zeros(len(uv_pts), bool)
    D = np.zeros((len(uv_pts), 3))
    for i, (u, v) in enumerate(uv_pts):
        o = right * u + up * v - d * 4.0
        h = base.ray(o, d)
        if h is None:
            continue
        P[i] = h[0]
        ok[i] = True
    # exact points + normals from the analytic surface through the hit directions
    if ok.any():
        Dh = P[ok] - base.C
        Dh /= np.linalg.norm(Dh, axis=1)[:, None]
        Pa, Na = base.points_normals(Dh)
        P[ok] = Pa
        D[ok] = Na
    return P, D, ok


def view_plate(base, view, outline_uv, thick, lift=0.0, res=0.006, bevel=0.0012, thick_fn=None, beta=0.0,
               inner_lift=None, extra=None):
    """Plate whose outline is drawn in a view plane (u, v) and projected onto the base."""
    pts2, tris, nb = triangulate(outline_uv, res, extra=extra)
    P, N, ok = view_hits(base, view, pts2, beta=beta)
    if not ok.all():
        # fill misses from the nearest hit point (overhangs of the silhouette)
        good = np.where(ok)[0]
        tree = scipy.spatial.cKDTree(pts2[good])
        for i in np.where(~ok)[0]:
            _, j = tree.query(pts2[i])
            P[i] = P[good[j]]
            N[i] = N[good[j]]
    th = thick if thick_fn is None else thick_fn(pts2, P)
    il = inner_lift
    if callable(inner_lift):
        il = inner_lift(pts2, P)
    return plate_bmesh(pts2, tris, nb, P, N, th, lift=lift, bevel=bevel, inner_lift=il)


def blade(spine, width_fn, thick_fn, side_ref, n=40):
    """Free-standing diamond-section blade along a 3D spine (edge trims, spikes).

    spine    : 3D control points root -> tip (Catmull-Rom smoothed)
    width_fn : t -> full width (t = 0 root .. 1 tip); thick_fn: t -> full thickness
    side_ref : t -> 3D vector giving the width direction (orthogonalised)
    UV: u around the section, v along the spine (0 root, 1 tip)."""
    pts = L.resample(L.catmull_rom([Vector(p) for p in spine], 10), n)
    bm = bmesh.new()
    rings = []
    m = len(pts)
    for i, p in enumerate(pts):
        t = i / (m - 1)
        if i == 0:
            tan = pts[1] - pts[0]
        elif i == m - 1:
            tan = pts[-1] - pts[-2]
        else:
            tan = pts[i + 1] - pts[i - 1]
        tan.normalize()
        w = Vector(side_ref(t))
        w = (w - tan * w.dot(tan)).normalized()
        th = tan.cross(w).normalized()
        hw = max(width_fn(t), 0.0) * 0.5
        ht = max(thick_fn(t), 0.0) * 0.5
        sec = [(hw, 0.0), (0.0, ht), (-hw, 0.0), (0.0, -ht)]
        rings.append(([bm.verts.new(p + w * a + th * b) for a, b in sec], t))
    uv = bm.loops.layers.uv.verify()
    k = 4
    for i in range(m - 1):
        ra, ta = rings[i]
        rb, tb = rings[i + 1]
        for j in range(k):
            j2 = (j + 1) % k
            f = bm.faces.new((ra[j], ra[j2], rb[j2], rb[j]))
            for loop, (u, v) in zip(f.loops, ((j / k, ta), ((j + 1) / k, ta), ((j + 1) / k, tb), (j / k, tb))):
                loop[uv].uv = (u, v)
    for ring, t, rev in ((rings[0][0], 0.0, True), (rings[-1][0], 1.0, False)):
        try:
            f = bm.faces.new(list(reversed(ring)) if rev else ring)
            for loop in f.loops:
                loop[uv].uv = (0.5, t)
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    orient_outward(bm)
    return bm


def mesh_obj(V, F, name, coll, family, angle=None):
    """Object from vertex array + mixed polygon list (rx_lib.from_arrays needs
    one polygon size)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in V], [], [tuple(int(i) for i in f) for f in F])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    me.materials.append(L.material(family))
    L.smooth(ob, angle)
    return ob


# ------------------------------------------------------------------ mixed-view point specs
def spec_dirs(base, specs):
    """Unit directions (from base.C) for a list of point specs, all on the +X side:
      ("f", x, y)   front-10 pixel, front camera
      ("s", x, y)   right-07 pixel read as the suit's LEFT side (camera at +X), u = Y
      ("b", x, y)   back-09 pixel, back camera (x < cx is +X)
      ("a", th, ph) azimuth / elevation degrees
      ("p", X, Y, Z) a 3D point (its direction from C)
    """
    out = []
    for sp in specs:
        kind = sp[0]
        if kind == "a":
            out.append(dirs_from_angles(sp[1], sp[2]))
            continue
        if kind == "p":
            d = np.asarray(sp[1:4], float) - base.C
            out.append(d / np.linalg.norm(d))
            continue
        if kind == "f":
            uv, alpha = ref_uv("front", sp[1], sp[2]), 0.0
        elif kind == "s":
            Y = (R.VIEWS["right"]["cx"] - sp[1]) * S
            uv, alpha = (Y, (R.VIEWS["right"]["sole"] - sp[2]) * S), 90.0
        elif kind == "b":
            uv, alpha = ref_uv("back", sp[1], sp[2]), 180.0
        else:
            raise ValueError(sp)
        right, up, d = view_axes(alpha, 0.0)
        o = right * uv[0] + up * uv[1] - d * 4.0
        h = base.ray(o, d)
        if h is None:
            # silhouette overhang: use the ray point that comes closest to the surface
            ts = np.linspace(3.6, 4.4, 161)
            Pr = np.asarray(o, float)[None, :] + np.asarray(d, float)[None, :] * ts[:, None]
            Dv = Pr - base.C
            dist = np.linalg.norm(Dv, axis=1)
            Dv /= dist[:, None]
            gapv = dist - base.radius(Dv)
            v = Dv[int(np.argmin(gapv))]
            out.append(v)
            continue
        v = np.asarray(h[0], float) - base.C
        out.append(v / np.linalg.norm(v))
    return np.asarray(out, float)


def slerp_path(D, n):
    """Smooth path through unit directions (Catmull-Rom on the vectors, renormalised),
    resampled to n points evenly by arc length (on the unit sphere)."""
    P = L.catmull_rom([Vector(d) for d in D], 12)
    P = [p.normalized() for p in P]
    P = L.resample(P, n)
    return np.asarray([tuple(p.normalized()) for p in P], float)


def panel(base, specs, thick, lift=0.0004, res=0.008, gap=0.0, bevel=0.0012, thick_fn=None, mean_dir=None,
          ridge=None):
    """Plate on the base from an outline of point specs (see spec_dirs) or a
    direction array, triangulated in an azimuthal flattening around the outline's
    mean direction. gap: inset of the outline (metres), so neighbours show a seam.
    ridge: specs of a polyline whose points become vertices, so a thickness
    crease along it follows mesh edges. thick_fn(P (n,3), Q (n,2) flattened
    metres, d_ridge (n,) metres or None) -> (n,) thickness."""
    D0 = dirs(base, specs)
    m = np.mean(D0, axis=0) if mean_dir is None else np.asarray(mean_dir, float)
    fr = DirFrame(m)
    Q = fr.to2(D0)
    rmean = float(np.mean(base.radius(D0)))
    poly = ccw([tuple(q) for q in Q])
    if gap > 0:
        poly = L.offset_outline(poly, -gap / rmean)
    extra = None
    ridge2 = None
    if ridge is not None:
        Dr = dirs(base, ridge)
        ridge2 = fr.to2(Dr)
        extra = np.asarray(L.densify([tuple(q) for q in ridge2], res / rmean * 0.6, closed=False))
        inside = L.point_in_polygon(extra, L.densify(poly, res / rmean * 0.5))
        extra = extra[inside]
    pts2, tris, nb = triangulate(poly, res / rmean, extra)
    D = fr.to3(pts2)
    P, N = base.points_normals(D)
    if thick_fn is None:
        th = thick
    else:
        dr = None
        if ridge2 is not None:
            dr = _dist_to_polyline(pts2, ridge2, closed=False) * rmean
        th = thick_fn(P, pts2 * rmean, dr)
    return plate_bmesh(pts2, tris, nb, P, N, th, lift=lift, bevel=bevel)


def triangulate(outline, res, extra=None):
    """Delaunay triangulation of a polygon (2D) with a staggered interior grid of
    spacing res. extra: points that must be vertices (e.g. along a ridge); grid
    points close to them are dropped. Returns pts2 (n, 2), tris (m, 3) and nb: the
    first nb points are the densified boundary loop, in order."""
    outline = ccw(outline)
    boundary = L.densify(outline, res * 0.7)
    B = np.asarray(boundary)
    xs, ys = B[:, 0], B[:, 1]
    gx, gy = np.meshgrid(np.arange(xs.min() + res * 0.5, xs.max(), res), np.arange(ys.min() + res * 0.5, ys.max(), res))
    grid = np.stack([gx.ravel(), gy.ravel()], axis=1)
    if len(grid):
        row = np.round((grid[:, 1] - ys.min()) / res).astype(int)
        grid[:, 0] += np.where(row % 2 == 1, res * 0.5, 0.0)
        inside = L.point_in_polygon(grid, boundary)
        grid = grid[inside]
    if len(grid):
        grid = grid[_dist_to_polyline(grid, B, closed=True) > res * 0.5]
    E = np.zeros((0, 2))
    if extra is not None and len(extra):
        E = np.asarray(extra, float)
        E = E[_dist_to_polyline(E, B, closed=True) > res * 0.3]
    if len(E):
        if len(grid):
            dd = np.min(np.linalg.norm(grid[:, None, :] - E[None, :, :], axis=2), axis=1)
            grid = grid[dd > res * 0.55]
            grid = np.vstack([grid, E])
        else:
            grid = E
    pts2 = np.vstack([B, grid]) if len(grid) else B
    tri = scipy.spatial.Delaunay(pts2)
    simp = tri.simplices
    cent = pts2[simp].mean(axis=1)
    keep = L.point_in_polygon(cent, boundary)
    return pts2, simp[keep], len(B)


def rail(base, specs, profile, width_fn, height_fn, lift=0.0004, n=48, mitre_x0=False, caps=True):
    """Bar swept along a surface path through point specs.
    profile: closed CCW loop of (a, h), a across the path (-0.5..0.5, scaled by width),
    h along the surface normal (0..1, scaled by height). mitre_x0: the first ring is
    projected onto the X=0 plane along the path (the mirrored copy meets it exactly).
    UV: u around the profile, v along the path (0 start .. 1 end)."""
    Dp = slerp_path(dirs(base, specs), n)
    P, N = base.points_normals(Dp)
    return rail_pts(P, N, profile, width_fn, height_fn, lift=lift, mitre_x0=mitre_x0, caps=caps)


def rail_pts(P, N, profile, width_fn, height_fn, lift=0.0004, mitre_x0=False, caps=True):
    """rail() on explicit path points P (n,3) and surface normals N (n,3)."""
    Pv = [Vector(p) for p in P]
    Nv = [Vector(q) for q in N]
    m = len(Pv)
    Ls = L.arc_lengths(Pv)
    tot = max(Ls[-1], 1e-9)
    bm = bmesh.new()
    rings = []
    for i in range(m):
        t = Ls[i] / tot
        if i == 0:
            T = Pv[1] - Pv[0]
        elif i == m - 1:
            T = Pv[-1] - Pv[-2]
        else:
            T = Pv[i + 1] - Pv[i - 1]
        T.normalize()
        Nn = (Nv[i] - T * Nv[i].dot(T)).normalized()
        B = T.cross(Nn).normalized()
        w = max(width_fn(t), 1e-5)
        h = max(height_fn(t), 1e-5)
        base_pt = Pv[i] + Nn * lift
        ring = []
        for a, hh in profile:
            ring.append(base_pt + B * (a * w) + Nn * (hh * h))
        rings.append((ring, t, T))
    if mitre_x0:
        ring, t, T = rings[0]
        if abs(T.x) > 1e-4:
            rings[0] = ([v - T * (v.x / T.x) for v in ring], t, T)
    uv = bm.loops.layers.uv.verify()
    k = len(profile)
    vr = [[bm.verts.new(v) for v in ring] for ring, _t, _T in rings]
    for i in range(m - 1):
        ta, tb = rings[i][1], rings[i + 1][1]
        for j in range(k):
            j2 = (j + 1) % k
            try:
                f = bm.faces.new((vr[i][j], vr[i][j2], vr[i + 1][j2], vr[i + 1][j]))
            except ValueError:
                continue
            for loop, (u, v) in zip(f.loops, ((j / k, ta), ((j + 1) / k, ta), ((j + 1) / k, tb), (j / k, tb))):
                loop[uv].uv = (u, v)
    if caps:
        for ring, t, rev in ((vr[0], 0.0, True), (vr[-1], 1.0, False)):
            vs = list(reversed(ring)) if rev else list(ring)
            try:
                f = bm.faces.new(vs)
                for loop in f.loops:
                    loop[uv].uv = (0.5, t)
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    orient_outward(bm)
    return bm


# common rail profiles: (across, up)
PROF_ROOF = [(-0.5, 0.0), (0.5, 0.0), (0.5, 0.42), (0.36, 0.66), (0.0, 1.0), (-0.36, 0.66), (-0.5, 0.42)]
PROF_FLAT = [(-0.5, 0.0), (0.5, 0.0), (0.5, 0.55), (0.40, 0.92), (0.0, 1.0), (-0.40, 0.92), (-0.5, 0.55)]


def edge_blade(LE, TE, thick_fn, n_span=28, ridge_a=0.5, outward=(1.0, 0.0, 0.0), samples=10, section="diamond"):
    """Blade lofted between a leading-edge curve LE and a trailing-edge curve TE
    (3D control points, root first; both end at the tip). The section is a lens
    between the two edges, thick_fn(s) thick at the ridge (chord position ridge_a),
    offset along the blade normal (oriented toward `outward`).
    section: "diamond" (sharp central ridge) or "hex" (flat crown, chamfered
    sides). The section is piecewise linear across the chord, so vertices sit only
    on the edges and the creases: crisp ridges at a quarter of the triangles.
    UV: u across the chord (0 LE .. 1 TE), v along the span (0 root .. 1 tip)."""
    le = L.resample(L.catmull_rom([Vector(p) for p in LE], samples), n_span)
    te = L.resample(L.catmull_rom([Vector(p) for p in TE], samples), n_span)
    out_v = Vector(outward)
    stations = [0.0, 0.28, 0.72, 1.0] if section == "hex" else [0.0, ridge_a, 1.0]
    n_chord = len(stations) - 1
    bm = bmesh.new()
    rows_a = []
    rows_b = []
    mid = [(a + b) * 0.5 for a, b in zip(le, te)]
    for i in range(n_span):
        s = i / (n_span - 1)
        chord = te[i] - le[i]
        if i == 0:
            span = mid[1] - mid[0]
        elif i == n_span - 1:
            span = mid[-1] - mid[-2]
        else:
            span = mid[i + 1] - mid[i - 1]
        nrm = chord.cross(span)
        if nrm.length < 1e-9:
            nrm = Vector(out_v)
        nrm.normalize()
        if nrm.dot(out_v) < 0:
            nrm = -nrm
        th = max(thick_fn(s), 0.0) * 0.5
        ra, rb = [], []
        for a in stations:
            if section == "hex":
                f = min(1.0, a / 0.28, (1.0 - a) / 0.28)
            else:
                f = a / ridge_a if a <= ridge_a else (1.0 - a) / (1.0 - ridge_a)
            f = max(f, 0.0)
            p = le[i].lerp(te[i], a)
            ra.append(p + nrm * (th * f))
            rb.append(p - nrm * (th * f))
        rows_a.append(ra)
        rows_b.append(rb)
    # verts: shared edge verts (j = 0 and j = n_chord) between the two faces
    VA, VB = [], []
    for i in range(n_span):
        va = [bm.verts.new(v) for v in rows_a[i]]
        vb = [va[0]] + [bm.verts.new(v) for v in rows_b[i][1:-1]] + [va[-1]]
        VA.append(va)
        VB.append(vb)
    uv = bm.loops.layers.uv.verify()
    for i in range(n_span - 1):
        sa, sb = i / (n_span - 1), (i + 1) / (n_span - 1)
        for j in range(n_chord):
            ua, ub = stations[j], stations[j + 1]
            for rows, flip in ((VA, False), (VB, True)):
                q = (rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j])
                if flip:
                    q = q[::-1]
                try:
                    f = bm.faces.new(q)
                except ValueError:
                    continue
                uvs = ((ua, sa), (ub, sa), (ub, sb), (ua, sb))
                if flip:
                    uvs = uvs[::-1]
                for loop, c in zip(f.loops, uvs):
                    loop[uv].uv = c
    # root cap
    root = VA[0] + VB[0][1:-1][::-1]
    try:
        f = bm.faces.new(root)
        for loop in f.loops:
            loop[uv].uv = (0.5, 0.0)
    except ValueError:
        pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    orient_outward(bm)
    return bm


def on_surface(base, specs, lift=0.0):
    """Surface points (+ lift along the normal) for point specs."""
    D = spec_dirs(base, specs)
    P, N = base.points_normals(D)
    return P + N * lift, N


def hug_frames(base, specs, n=40):
    """Points, normals, tangents and in-surface binormals along a surface path."""
    Dp = slerp_path(dirs(base, specs), n)
    P, N = base.points_normals(Dp)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    N = N - T * np.sum(N * T, axis=1)[:, None]
    N /= np.linalg.norm(N, axis=1)[:, None]
    B = np.cross(N, T)
    return P, N, T, B


# ------------------------------------------------------------------ neck (gorget) surface
class NeckSurf:
    """Surface around the neck: axis from A0 to A1 (lerped by Z), radius
    r(theta, Z) = undersuit radius + clearance (ray casts from outside, capped),
    smoothed. theta: 0 = front (-Y), +90 = suit left (+X)."""

    def __init__(self, body, A0=(0.0, 0.012, 1.53), A1=(0.0, -0.002, 1.70), z0=1.56, z1=1.74,
                 clearance=0.004, r_cap=0.105, n_theta=72, n_z=37):
        self.A0 = np.asarray(A0, float)
        self.A1 = np.asarray(A1, float)
        self.th = np.linspace(-180.0, 180.0, n_theta + 1)
        self.zs = np.linspace(z0, z1, n_z)
        Rg = np.zeros((n_z, n_theta + 1))
        for j, z in enumerate(self.zs):
            a = self.axis(z)
            for i, t in enumerate(self.th[:-1]):
                d = np.array([math.sin(math.radians(t)), -math.cos(math.radians(t)), 0.0])
                o = a + d * r_cap
                h = body.ray(Vector(o), Vector(-d), r_cap)
                r = r_cap - (h[0] - Vector(o)).length if h is not None else r_cap
                Rg[j, i] = min(r, r_cap)
            Rg[j, -1] = Rg[j, 0]
        # smooth around theta and along z
        Rw = np.concatenate([Rg[:, -9:-1], Rg, Rg[:, 1:9]], axis=1)
        Rw = gaussian_filter(Rw, sigma=(1.0, 1.6))
        self.R = Rw[:, 8:-8] + clearance
        self._interp = RegularGridInterpolator((self.zs, self.th), self.R, bounds_error=False, fill_value=None)

    def axis(self, z):
        t = (np.asarray(z, float) - 1.53) / 0.17
        return self.A0 + (self.A1 - self.A0) * t[..., None] if np.ndim(z) else self.A0 + (self.A1 - self.A0) * t

    def radius(self, th, z):
        th = ((np.asarray(th, float) + 180.0) % 360.0) - 180.0
        return self._interp(np.stack([np.clip(z, self.zs[0], self.zs[-1]), th], axis=-1))

    def points(self, th, z):
        th = np.asarray(th, float)
        z = np.asarray(z, float)
        r = self.radius(th, z)
        a = np.stack([np.zeros_like(z), self.A0[1] + (self.A1[1] - self.A0[1]) * (z - 1.53) / 0.17, z], axis=-1)
        t = np.radians(th)
        d = np.stack([np.sin(t), -np.cos(t), np.zeros_like(t)], axis=-1)
        return a + d * r[..., None]

    def points_normals(self, th, z, eps_t=0.5, eps_z=0.002):
        P = self.points(th, z)
        Pt = self.points(th + eps_t, z) - self.points(th - eps_t, z)
        Pz = self.points(th, z + eps_z) - self.points(th, z - eps_z)
        N = np.cross(Pz, Pt)
        N /= np.linalg.norm(N, axis=-1)[..., None]
        t = np.radians(th)
        d = np.stack([np.sin(t), -np.cos(t), np.zeros_like(t)], axis=-1)
        flip = np.sum(N * d, axis=-1) < 0
        N[flip] *= -1
        return P, N


def neck_plate(ns, outline, thick, lift_fn, res=0.006, bevel=0.0010, ridge=None, ridge_h=0.0, r_ref=0.068):
    """Plate on the neck surface from an outline of (theta_deg, Z); triangulated in
    (theta * r_ref, Z). lift_fn(Z) -> inner lift; ridge: (theta_c) adds a ridge."""
    k = math.radians(1.0) * r_ref
    poly = [(t * k, z) for t, z in outline]
    extra = None
    if ridge is not None:
        zs = [z for _t, z in outline]
        ext = np.linspace(min(zs), max(zs), 30)
        extra = np.stack([np.full_like(ext, ridge * k), ext], axis=1)
    pts2, tris, nb = triangulate(poly, res, extra)
    th = pts2[:, 0] / k
    zz = pts2[:, 1]
    P, N = ns.points_normals(th, zz)
    lift = np.asarray([lift_fn(z) for z in zz])
    T = np.full(len(pts2), float(thick))
    if ridge is not None and ridge_h > 0:
        hw = max(np.ptp(pts2[:, 0]) * 0.5, 1e-6)
        T = T + ridge_h * np.clip(1.0 - np.abs(pts2[:, 0] - ridge * k) / hw, 0.0, 1.0)
    return plate_bmesh(pts2, tris, nb, P, N, T, lift=lift, bevel=bevel, inner_lift=lift)


def offset_dirs(base, specs, n, d_fn, extend_x0=False, t_range=(0.0, 1.0)):
    """Directions of a curve offset in the surface from a parent path (point specs):
    point(t) = P(t) + B(t) * d_fn(t), B = N x T (for a path running out from the
    centre along the brow, +B points up/inward). extend_x0 prepends the point where
    the start tangent meets X = 0 (so mirrored copies meet on the centre line)."""
    P, N, T, B = hug_frames(base, specs, n)
    ts = np.linspace(0.0, 1.0, n)
    keep = (ts >= t_range[0] - 1e-9) & (ts <= t_range[1] + 1e-9)
    Q = P + B * np.asarray([d_fn(t) for t in ts])[:, None]
    Q, Tk = Q[keep], T[keep]
    if extend_x0 and abs(Q[0, 0]) > 1e-6:
        t0 = Tk[0]
        if abs(t0[0]) > 1e-6:
            Q = np.vstack([Q[0] - t0 * (Q[0, 0] / t0[0]), Q])
    D = Q - base.C
    D /= np.linalg.norm(D, axis=1)[:, None]
    return D


def dirs(base, specs):
    """spec list or direction array -> direction array"""
    if isinstance(specs, np.ndarray):
        return specs
    return spec_dirs(base, specs)


def chain(base, *parts):
    """Concatenate outline parts (spec lists / direction arrays) into one direction array."""
    return np.vstack([dirs(base, p) for p in parts if len(p)])


def bezier(p0, p1, p2, n):
    p0, p1, p2 = (np.asarray(p, float) for p in (p0, p1, p2))
    t = np.linspace(0.0, 1.0, n)[:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def swept_edges(base, root_specs, tip, width_fn, bend=(0.0, 0.0, 0.0), lift=0.003, n_root=6, n_free=14,
                twist=0.0):
    """Leading / trailing edge polylines of a blade that hugs the shell along a
    root path (point specs), then curves free to `tip` (quadratic Bezier; `bend`
    offsets its control point, making a sickle). width_fn(s), s = 0 root .. 1 tip.
    lift: float or f(s) (height of the centre line above the shell).
    twist: radians the chord turns toward the surface normal along the free part.
    Returns LE, TE (lists of 3D tuples, LE on the in-surface +B side), the centre
    line and per-point side vectors, and the mean surface normal."""
    P, N, T, B = hug_frames(base, root_specs, n_root)
    lf = lift if callable(lift) else (lambda s, v=lift: v)
    tipv = np.asarray(tip, float)
    # centre line: provisional arc length for the lift profile
    start = P[-1] + N[-1] * lf(0.4)
    ctrl = start + T[-1] * (np.linalg.norm(tipv - start) * 0.45) + np.asarray(bend, float)
    free = bezier(start, ctrl, tipv, n_free + 1)[1:]
    cen = np.vstack([P, free])
    seg = np.linalg.norm(np.diff(cen, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    s /= s[-1]
    cen[:n_root] = P + N * np.asarray([lf(v) for v in s[:n_root]])[:, None]
    m = len(cen)
    side0, nrm0 = B[-1], N[-1]
    LE, TE, sides = [], [], []
    for i in range(m):
        if i < n_root:
            side = B[i]
        else:
            k = (s[i] - s[n_root - 1]) / max(1.0 - s[n_root - 1], 1e-6)
            a = twist * k
            side = side0 * math.cos(a) + nrm0 * math.sin(a)
        if 0 < i < m - 1:
            tan = cen[i + 1] - cen[i - 1]
        elif i == 0:
            tan = cen[1] - cen[0]
        else:
            tan = cen[-1] - cen[-2]
        tan = tan / np.linalg.norm(tan)
        side = side - tan * np.dot(side, tan)
        side /= max(np.linalg.norm(side), 1e-9)
        w = width_fn(s[i]) * 0.5
        LE.append(tuple(cen[i] + side * w))
        TE.append(tuple(cen[i] - side * w))
        sides.append(side)
    return LE, TE, cen, np.asarray(sides), s, np.mean(N, axis=0)


def blade_inlay(LE, TE, thick_fn, a0, a1, s0, s1, outward, ridge_a=0.45, n_span=24, samples=10, raise_=0.0004,
                strip_th=0.0006):
    """Thin strip lying on the outer face of an edge_blade between chord positions
    a0..a1 and span s0..s1 (a GoldDark recess line on a horn). Same parameters as
    the edge_blade it decorates."""
    le = L.resample(L.catmull_rom([Vector(p) for p in LE], samples), 64)
    te = L.resample(L.catmull_rom([Vector(p) for p in TE], samples), 64)
    mid = [(a + b) * 0.5 for a, b in zip(le, te)]
    out_v = Vector(outward)
    rows = []
    for k in range(n_span):
        s = s0 + (s1 - s0) * k / (n_span - 1)
        i = min(int(s * 63), 62)
        f = s * 63 - i
        pl = le[i].lerp(le[i + 1], f)
        pt = te[i].lerp(te[i + 1], f)
        chord = pt - pl
        span = mid[i + 1] - mid[i]
        nrm = chord.cross(span)
        if nrm.length < 1e-12:
            nrm = Vector(out_v)
        nrm.normalize()
        if nrm.dot(out_v) < 0:
            nrm = -nrm
        th = max(thick_fn(s), 0.0) * 0.5
        taper = min(1.0, (s1 - s) / max((s1 - s0) * 0.25, 1e-6))
        ring = []
        for a in (a0, (a0 + a1) * 0.5, a1):   # keep a0..a1 on one side of the ridge
            fa = a / ridge_a if a <= ridge_a else (1.0 - a) / (1.0 - ridge_a)
            ring.append(pl.lerp(pt, a) + nrm * (th * fa + raise_))
        # narrow the strip toward its end
        c = ring[1]
        ring = [c + (ring[0] - c) * taper, c, c + (ring[2] - c) * taper]
        rows.append((ring, nrm))
    bm = bmesh.new()
    vt, vb = [], []
    for ring, nrm in rows:
        vt.append([bm.verts.new(p) for p in ring])
        vb.append([bm.verts.new(p - nrm * strip_th) for p in ring])
    for k in range(n_span - 1):
        for j in range(2):
            bm.faces.new((vt[k][j], vt[k][j + 1], vt[k + 1][j + 1], vt[k + 1][j]))
            bm.faces.new((vb[k + 1][j], vb[k + 1][j + 1], vb[k][j + 1], vb[k][j]))
        bm.faces.new((vt[k][0], vt[k + 1][0], vb[k + 1][0], vb[k][0]))
        bm.faces.new((vt[k + 1][2], vt[k][2], vb[k][2], vb[k + 1][2]))
    bm.faces.new((vt[0][2], vt[0][1], vt[0][0], vb[0][0], vb[0][1], vb[0][2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (0.5, 0.5)
    bm.normal_update()
    orient_outward(bm)
    return bm


def edge_blade_part(LE, TE, thick_fn, a0=0.0, a1=1.0, ridge_a=0.5, outward=(1.0, 0.0, 0.0), samples=2):
    """The chord range a0..a1 of an edge_blade (diamond section, same LE / TE /
    thickness), closed with walls along any cut. Two parts split at the same a
    share their boundary exactly, so one blade can carry two materials (e.g. a
    gold upper facet and a black lower facet split along the ridge)."""
    n_span = len(LE)
    le = L.resample(L.catmull_rom([Vector(p) for p in LE], samples), n_span)
    te = L.resample(L.catmull_rom([Vector(p) for p in TE], samples), n_span)
    out_v = Vector(outward)
    st = [a0] + ([ridge_a] if a0 < ridge_a < a1 else []) + [a1]
    mid = [(a + b) * 0.5 for a, b in zip(le, te)]

    def f(a):
        return max(a / ridge_a if a <= ridge_a else (1.0 - a) / (1.0 - ridge_a), 0.0)

    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    VA, VB = [], []
    for i in range(n_span):
        chord = te[i] - le[i]
        span = mid[min(i + 1, n_span - 1)] - mid[max(i - 1, 0)]
        nrm = chord.cross(span)
        nrm = Vector(out_v) if nrm.length < 1e-9 else nrm.normalized()
        if nrm.dot(out_v) < 0:
            nrm = -nrm
        th = max(thick_fn(i / (n_span - 1)), 0.0) * 0.5
        va, vb = [], []
        for a in st:
            p = le[i].lerp(te[i], a)
            v = bm.verts.new(p + nrm * (th * f(a)))
            va.append(v)
            vb.append(v if f(a) < 1e-9 else bm.verts.new(p - nrm * (th * f(a))))
        VA.append(va)
        VB.append(vb)
    k = len(st)

    def face(vs, uvs):
        try:
            fc = bm.faces.new(vs)
        except ValueError:
            return
        for loop, c in zip(fc.loops, uvs):
            loop[uv].uv = c

    for i in range(n_span - 1):
        sa, sb = i / (n_span - 1), (i + 1) / (n_span - 1)
        for j in range(k - 1):
            ua, ub = st[j], st[j + 1]
            face((VA[i][j], VA[i][j + 1], VA[i + 1][j + 1], VA[i + 1][j]), ((ua, sa), (ub, sa), (ub, sb), (ua, sb)))
            face((VB[i + 1][j], VB[i + 1][j + 1], VB[i][j + 1], VB[i][j]), ((ua, sb), (ub, sb), (ub, sa), (ua, sa)))
        for j in (0, k - 1):                       # walls along cut sides
            if VA[i][j] is not VB[i][j] or VA[i + 1][j] is not VB[i + 1][j]:
                face((VA[i][j], VA[i + 1][j], VB[i + 1][j], VB[i][j]), ((st[j], sa), (st[j], sb), (st[j], sb), (st[j], sa)))
    ring = VA[0] + [v for v in reversed(VB[0]) if v not in VA[0]]
    face(ring, [(0.5, 0.0)] * len(ring))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[fc for fc in bm.faces if len(fc.verts) > 4])
    bm.normal_update()
    orient_outward(bm)
    return bm
