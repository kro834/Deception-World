"""Geometry helpers for part_arms.py (the arm module's own toolkit).

ArmSurf   a cylindrical map of the undersuit arm: an axis curve from the
          shoulder to the fist and, around it, the body radius r(s, phi) found
          by ray casts. Pieces are authored in (s, phi) and laid on the body.
          s = metres along the axis from its top, phi = 0 lateral (+X),
          90 deg back (+Y), 180 medial, 270 front (-Y) (suit's left arm).
slab_solid  a closed hard-surface slab from a grid of top points and the
          matching bottom points (straps, inlays, panels), outward winding.
revolve   lathe a closed (r, h) profile around an axis (rings, cuffs, studs).
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import rx_lib as L

TAU = 2.0 * math.pi


class ArmSurf:
    def __init__(self, body, ctrl, ds=0.004, nphi=96, rmax=0.085, sigma=(1.2, 1.0)):
        from scipy.ndimage import gaussian_filter

        pts = L.catmull_rom([Vector(p) for p in ctrl], 16)
        total = L.arc_lengths(pts)[-1]
        n = int(round(total / ds)) + 1
        self.A = L.resample(pts, n)
        self.n = n
        self.ds = total / (n - 1)
        self.total = total
        self.T, self.E1, self.E2 = [], [], []
        for i in range(n):
            if i == 0:
                t = self.A[1] - self.A[0]
            elif i == n - 1:
                t = self.A[-1] - self.A[-2]
            else:
                t = self.A[i + 1] - self.A[i - 1]
            t.normalize()
            e1 = Vector((1.0, 0.0, 0.0))
            e1 = (e1 - t * e1.dot(t)).normalized()
            e2 = e1.cross(t).normalized()
            self.T.append(t)
            self.E1.append(e1)
            self.E2.append(e2)
        self.nphi = nphi
        Rg = np.zeros((n, nphi))
        for i in range(n):
            for j in range(nphi):
                a = TAU * j / nphi
                d = self.E1[i] * math.cos(a) + self.E2[i] * math.sin(a)
                hit = body.ray(self.A[i], d, 0.4)
                r = (hit[0] - self.A[i]).length if hit else rmax
                Rg[i, j] = min(r, rmax)
        self.R = gaussian_filter(Rg, sigma=sigma, mode=("nearest", "wrap"))
        self.shell = None  # optional extra thickness grid (same shape as R)

    # ---------------------------------------------------------------- lookup
    def _idx(self, s):
        x = min(max(s / self.ds, 0.0), self.n - 1.000001)
        i = int(x)
        return i, x - i

    def axis(self, s):
        i, f = self._idx(s)
        A = self.A[i].lerp(self.A[i + 1], f)
        e1 = self.E1[i].lerp(self.E1[i + 1], f)
        T = self.T[i].lerp(self.T[i + 1], f).normalized()
        e1 = (e1 - T * e1.dot(T)).normalized()
        e2 = e1.cross(T).normalized()
        return A, T, e1, e2

    def radius(self, s, phi, grid=None):
        G = self.R if grid is None else grid
        i, f = self._idx(s)
        x = (phi % TAU) / TAU * self.nphi
        j = int(math.floor(x)) % self.nphi
        g = x - math.floor(x)
        j2 = (j + 1) % self.nphi
        r0 = G[i, j] * (1 - g) + G[i, j2] * g
        r1 = G[i + 1, j] * (1 - g) + G[i + 1, j2] * g
        return r0 * (1 - f) + r1 * f

    def r_total(self, s, phi):
        r = self.radius(s, phi)
        if self.shell is not None:
            r += self.radius(s, phi, self.shell)
        return r

    def dir(self, s, phi):
        A, T, e1, e2 = self.axis(s)
        return e1 * math.cos(phi) + e2 * math.sin(phi)

    def base(self, s, phi):
        A, T, e1, e2 = self.axis(s)
        d = e1 * math.cos(phi) + e2 * math.sin(phi)
        return A + d * self.r_total(s, phi)

    def body_pt(self, s, phi, lift=0.0):
        """Point on the bare body (no build-up shell), lifted radially."""
        A, T, e1, e2 = self.axis(s)
        d = e1 * math.cos(phi) + e2 * math.sin(phi)
        return A + d * (self.radius(s, phi) + lift)

    def normal(self, s, phi, h=0.004):
        r = max(self.r_total(s, phi), 0.02)
        dp = h / r
        a = self.base(s + h, phi) - self.base(s - h, phi)
        b = self.base(s, phi + dp) - self.base(s, phi - dp)
        n = b.cross(a)
        if n.length < 1e-12:
            return self.dir(s, phi)
        n.normalize()
        if n.dot(self.dir(s, phi)) < 0:
            n = -n
        return n

    def point(self, s, phi, lift=0.0):
        return self.base(s, phi) + self.normal(s, phi) * lift

    def s_at_z(self, z):
        """Arc length where the axis crosses height z (axis runs downward)."""
        A = self.A
        if z >= A[0].z:
            return 0.0
        for i in range(self.n - 1):
            if A[i].z >= z >= A[i + 1].z:
                f = (A[i].z - z) / max(A[i].z - A[i + 1].z, 1e-9)
                return (i + f) * self.ds
        return self.total

    def set_shell(self, fn):
        """Extra thickness grid from fn(s, phi) -> metres (armour build-up)."""
        G = np.zeros_like(self.R)
        for i in range(self.n):
            s = i * self.ds
            for j in range(self.nphi):
                G[i, j] = fn(s, TAU * j / self.nphi)
        self.shell = G


# ------------------------------------------------------------------ slabs
def slab_solid(top, bot, uvs=None, flip_check=None):
    """Closed solid from a top point grid [i along][j across] and the bottom
    edge points bot[i] = (left, right) (or a full row; only its two ends are
    used). The bottom is one quad per row (it is never seen against the body).
    Winding is made outward by checking the middle top face against bottom.
    uvs: optional grid of (u, v) per top point."""
    bm = bmesh.new()
    n, m = len(top), len(top[0])
    TV = [[bm.verts.new(p) for p in row] for row in top]
    BV = [[bm.verts.new(row[0]), bm.verts.new(row[-1])] for row in bot]
    uvl = bm.loops.layers.uv.verify()
    if uvs is None:
        uvs = [[(j / max(m - 1, 1), i / max(n - 1, 1)) for j in range(m)] for i in range(n)]

    def face(vs, tex):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return None
        for lp, t in zip(f.loops, tex):
            lp[uvl].uv = t
        return f

    for i in range(n - 1):
        for j in range(m - 1):
            face((TV[i][j], TV[i + 1][j], TV[i + 1][j + 1], TV[i][j + 1]),
                 (uvs[i][j], uvs[i + 1][j], uvs[i + 1][j + 1], uvs[i][j + 1]))
        face((BV[i][0], BV[i][1], BV[i + 1][1], BV[i + 1][0]),
             (uvs[i][0], uvs[i][m - 1], uvs[i + 1][m - 1], uvs[i + 1][0]))
        face((TV[i][0], BV[i][0], BV[i + 1][0], TV[i + 1][0]),
             (uvs[i][0], uvs[i][0], uvs[i + 1][0], uvs[i + 1][0]))
        face((TV[i][m - 1], TV[i + 1][m - 1], BV[i + 1][1], BV[i][1]),
             (uvs[i][m - 1], uvs[i + 1][m - 1], uvs[i + 1][m - 1], uvs[i][m - 1]))
    face([TV[0][j] for j in range(m)] + [BV[0][1], BV[0][0]],
         [uvs[0][j] for j in range(m)] + [uvs[0][m - 1], uvs[0][0]])
    face([BV[n - 1][0], BV[n - 1][1]] + [TV[n - 1][j] for j in reversed(range(m))],
         [uvs[n - 1][0], uvs[n - 1][m - 1]] + [uvs[n - 1][j] for j in reversed(range(m))])
    bm.normal_update()
    # orientation check on the middle top face
    i, j = (n - 1) // 2, (m - 1) // 2
    a = top[min(i + 1, n - 1)][j] - top[i][j]
    b = top[i][min(j + 1, m - 1)] - top[i][j]
    up = top[i][j] - (bot[i][0] + bot[i][-1]) * 0.5
    if a.cross(b).dot(up) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return bm


def band_on_surf(surf, center, halfw, n_along, us, lift_top, lift_bot=-0.0012, v_range=(0.0, 1.0)):
    """A slab following a centre path on an ArmSurf.

    center(v) -> (s, phi), v in [0, 1]
    halfw(v)  -> half width in metres (perpendicular to the path, on the surface)
    us        -> across stations in [-1, 1]
    lift_top(u, v) -> height of the top surface above the body
    lift_bot  -> float or f(u, v): bottom surface (slightly sunk into the body)
    UV: u across (0..1), v along (v_range)."""
    top, bot, uvs = [], [], []
    eps = 1e-3
    for i in range(n_along):
        v = i / (n_along - 1)
        s, phi = center(v)
        s2, phi2 = center(min(v + eps, 1.0))
        s1, phi1 = center(max(v - eps, 0.0))
        r = max(surf.r_total(s, phi), 0.02)
        ds_, dt_ = s2 - s1, (phi2 - phi1) * r
        ln = math.hypot(ds_, dt_) or 1.0
        ps, pt = -dt_ / ln, ds_ / ln  # perpendicular in (s, tangential) metric
        hw = halfw(v)
        trow, brow, urow = [], [], []
        for u in us:
            w = u * hw
            ss = s + w * ps
            pp = phi + w * pt / r
            b = surf.base(ss, pp)
            nn = surf.normal(ss, pp)
            lt = lift_top(u, v)
            lb = lift_bot(u, v) if callable(lift_bot) else lift_bot
            trow.append(b + nn * lt)
            brow.append(b + nn * lb)
            urow.append(((u + 1) * 0.5, v_range[0] + (v_range[1] - v_range[0]) * v))
        top.append(trow)
        bot.append(brow)
        uvs.append(urow)
    return slab_solid(top, bot, uvs)


def helix_band(surf, psi_lo, psi_hi, s0, s1, k, n_s, us, lift_top, sink=0.0012, gap=0.0):
    """A band between two helices phi = psi - k*s (psi in [psi_lo, psi_hi]),
    cut square at s0 and s1 (horizontal hems). The top follows the surface
    (body + shell) lifted by lift_top(u, v) along the normal; the bottom sits
    `sink` inside the bare body so no gap shows under a build-up.
    gap: metres trimmed from each long edge. UV u across, v along s."""
    top, bot, uvs = [], [], []
    for i in range(n_s):
        v = i / (n_s - 1)
        s = s0 + (s1 - s0) * v
        r = max(surf.r_total(s, 0.5 * (psi_lo + psi_hi) - k * s), 0.02)
        dg = gap / r
        lo, hi = psi_lo + dg, psi_hi - dg
        trow, brow, urow = [], [], []
        for u in us:
            psi = lo + (hi - lo) * (u + 1) * 0.5
            phi = psi - k * s
            b = surf.base(s, phi)
            nn = surf.normal(s, phi)
            trow.append(b + nn * lift_top(u, v))
            brow.append(surf.body_pt(s, phi, -sink))
            urow.append(((u + 1) * 0.5, v))
        top.append(trow)
        bot.append(brow)
        uvs.append(urow)
    return slab_solid(top, bot, uvs)


def surf_patch(surf, s0, s1, phi_fn, n_s, us, lift_top, sink=0.0012):
    """A patch over [s0, s1] whose angular extent per row is phi_fn(v) ->
    (phi_lo, phi_hi); lift_top(u, v). For crystal panels and plates."""
    top, bot, uvs = [], [], []
    for i in range(n_s):
        v = i / (n_s - 1)
        s = s0 + (s1 - s0) * v
        lo, hi = phi_fn(v)
        trow, brow, urow = [], [], []
        for u in us:
            phi = lo + (hi - lo) * (u + 1) * 0.5
            b = surf.base(s, phi)
            nn = surf.normal(s, phi)
            trow.append(b + nn * lift_top(u, v))
            brow.append(surf.body_pt(s, phi, -sink))
            urow.append(((u + 1) * 0.5, v))
        top.append(trow)
        bot.append(brow)
        uvs.append(urow)
    return slab_solid(top, bot, uvs)


# ------------------------------------------------------------------ lathe
def revolve(profile, axis_origin, axis_dir, seg=48, ref=(1.0, 0.0, 0.0), closed_profile=True, phase=0.0):
    """Lathe a 2D profile [(r, h), ...] (CCW in the (r, h) plane for outward
    normals) around axis_dir through axis_origin. Returns a bmesh with UV
    u around, v along the profile."""
    o = Vector(axis_origin)
    z = Vector(axis_dir).normalized()
    x = Vector(ref)
    x = (x - z * x.dot(z))
    if x.length < 1e-6:
        x = z.orthogonal()
    x.normalize()
    y = z.cross(x)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    m = len(profile)
    rings = []
    for k in range(seg):
        a = TAU * k / seg + phase
        d = x * math.cos(a) + y * math.sin(a)
        rings.append([bm.verts.new(o + d * r + z * h) for r, h in profile])
    pm = m if closed_profile else m - 1
    for k in range(seg):
        k2 = (k + 1) % seg
        for j in range(pm):
            j2 = (j + 1) % m
            try:
                f = bm.faces.new((rings[k][j], rings[k][j2], rings[k2][j2], rings[k2][j]))
            except ValueError:
                continue
            u0, u1 = k / seg, (k + 1) / seg
            v0, v1 = j / m, (j + 1) / m
            for lp, t in zip(f.loops, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
                lp[uvl].uv = t
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.normal_update()
    # make normals point away from the axis on the outermost profile point
    jmax = max(range(m), key=lambda j: profile[j][0])
    f0 = None
    for f in bm.faces:
        f0 = f
        break
    if f0 is not None:
        c = f0.calc_center_median()
        radial = (c - o) - z * (c - o).dot(z)
        # find a face that uses the outermost profile vertex of ring 0
        v = rings[0][jmax]
        if v.is_valid and v.link_faces:
            f0 = v.link_faces[0]
            c = f0.calc_center_median()
            radial = (c - o) - z * (c - o).dot(z)
            if f0.normal.dot(radial) < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.normal_update()
    return bm


def chamfer_ring_profile(r_in, r_out, h0, h1, c_out=0.0, c_in=0.0, c_out_bot=None, c_in_bot=None):
    """Closed (r, h) profile of a ring with chamfered edges, CCW."""
    cb = c_out if c_out_bot is None else c_out_bot
    cib = c_in if c_in_bot is None else c_in_bot
    pts = []
    # bottom inner -> bottom outer -> top outer -> top inner (CCW in r-h)
    pts.append((r_in + cib, h0))
    pts.append((r_out - cb, h0))
    if cb > 0:
        pts.append((r_out, h0 + cb))
    if c_out > 0:
        pts.append((r_out, h1 - c_out))
    pts.append((r_out - c_out, h1))
    pts.append((r_in + c_in, h1))
    if c_in > 0:
        pts.append((r_in, h1 - c_in))
    if cib > 0:
        pts.append((r_in, h0 + cib))
    return pts


# ------------------------------------------------------------------ misc
def bm_join(parts):
    """Merge several bmeshes into one (frees the inputs)."""
    out = bmesh.new()
    uv_out = out.loops.layers.uv.verify()
    for bm in parts:
        if bm is None:
            continue
        uv_in = bm.loops.layers.uv.active
        vmap = {}
        for v in bm.verts:
            vmap[v] = out.verts.new(v.co)
        for f in bm.faces:
            try:
                nf = out.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = f.smooth
            if uv_in is not None:
                for l0, l1 in zip(f.loops, nf.loops):
                    l1[uv_out].uv = l0[uv_in].uv
        bm.free()
    out.normal_update()
    return out


def frame_m(origin, x, y, z):
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], origin[i]
    return m


def box(sx, sy, sz, bevel=0.0, seg=1, matrix=None, taper=None):
    """Box centred at the origin (sizes along local x, y, z) with optional
    bevel; taper=(fx, fy) scales the +z face (wedge / frustum)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        if taper is not None and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=seg, affect="EDGES", profile=0.5, clamp_overlap=True)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (0.5 + lp.vert.co.x / max(sx, 1e-6), 0.5 + lp.vert.co.z / max(sz, 1e-6))
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    bm.normal_update()
    return bm


def bipyramid(rx, ry, h_top, h_bot, n=4, bevel=0.0, matrix=None, phase=0.0, mid=None, star=0.0):
    """Spike knob: an n-sided bipyramid (girdle in local xy, apexes on +-z).
    star > 0 adds n inner girdle points at radius `star` (relative), giving
    concave 4-point star flanges like the sheet's pendant knobs."""
    bm = bmesh.new()
    pts = []
    for k in range(n):
        a = TAU * k / n + phase
        pts.append((rx * math.cos(a), ry * math.sin(a)))
        if star > 0:
            a2 = a + math.pi / n
            pts.append((rx * star * math.cos(a2), ry * star * math.sin(a2)))
    g = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    m = len(g)
    top = bm.verts.new((0.0, 0.0, h_top))
    bot = bm.verts.new((0.0, 0.0, -h_bot))
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((g[k], g[k2], top))
        bm.faces.new((g[k2], g[k], bot))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES", profile=0.5, clamp_overlap=True)
    uvl = bm.loops.layers.uv.verify()
    hh = max(h_top + h_bot, 1e-6)
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (0.5 + lp.vert.co.x / (2 * max(rx, 1e-6)), (lp.vert.co.z + h_bot) / hh)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    bm.normal_update()
    return bm


def loft_plate(outer, inner, z_outer, z_inner, z_bottom, matrix=None):
    """Faceted armour plate: `outer` and `inner` are CCW outlines in local
    (x, y) with the same vertex count; the plate has a flat bottom at z_bottom,
    walls up to z_outer, sloped facets from the outer to the inner outline and a
    plateau at z_inner (the facets catch light like cut armour)."""
    bm = bmesh.new()
    n = len(outer)
    B = [bm.verts.new((x, y, z_bottom)) for x, y in outer]
    O = [bm.verts.new((x, y, z_outer)) for x, y in outer]
    I = [bm.verts.new((x, y, z_inner)) for x, y in inner]
    bm.faces.new(list(reversed(B)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((B[i], B[j], O[j], O[i]))
        bm.faces.new((O[i], O[j], I[j], I[i]))
    bm.faces.new(I)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (lp.vert.co.x * 10.0 + 0.5, lp.vert.co.y * 10.0 + 0.5)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    bm.normal_update()
    return bm


def tris(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)
