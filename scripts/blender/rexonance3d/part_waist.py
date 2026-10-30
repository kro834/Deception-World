"""Rexonance waist: belt band, crystal cells, sun buckle, back plaque,
front / back tassets, hip lapels, scaled hip skirt, coat tails and hip pendants.

Read off front-10 (widths, heights), right-07 (depth) and back-09 (the back
plaque and back tasset). Every piece is built in world coordinates; the belt
pieces are laid out along one closed contour that wraps the body just above
the hips (Z 1.152 .. 1.258).
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import rx_lib as L
import rx_ref as R

# ------------------------------------------------------------------ constants
YC = 0.004  # waist section centre (Y)
Z_BOT, Z_TOP = 1.152, 1.258  # belt band
Z_MID = 0.5 * (Z_BOT + Z_TOP)
BAND_GAP = 0.006  # body -> inside of the band
BAND_T = 0.013  # band thickness
CELL_W, CELL_H, CELL_D = 0.0265, 0.092, 0.016
CELL_PITCH = 0.0305
CELL_Z = 1.200
BUCKLE_Z = R.front(500, 610)[1]  # 1.2026


# ------------------------------------------------------------------ small helpers
class Acc:
    """Accumulates bmeshes into one object (one material)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.n = 0

    def add(self, bm):
        me = bpy.data.meshes.new("_rx_tmp")
        bm.to_mesh(me)
        bm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self.n += 1

    def build(self, name, coll, family, angle=35.0):
        if self.n == 0:
            self.bm.free()
            return None
        return L.from_bmesh(self.bm, name, coll, family, angle)


def _v(*a):
    return Vector(a)


def arc_resample(poly, n, start_angle=-math.pi / 2):
    """Closed polygon resampled to n points evenly by arc length, starting
    where the ray from the origin at start_angle crosses it (CCW order)."""
    P = [Vector((x, y, 0.0)) for x, y in L.ccw(poly)]
    d = Vector((math.cos(start_angle), math.sin(start_angle), 0.0))
    best = None
    m = len(P)
    for i in range(m):
        a, b = P[i], P[(i + 1) % m]
        e = b - a
        den = d.x * e.y - d.y * e.x
        if abs(den) < 1e-14:
            continue
        t = (a.x * e.y - a.y * e.x) / den
        u = (a.x * d.y - a.y * d.x) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best[0]):
            best = (t, i, u)
    if best is None:
        k0 = max(range(m), key=lambda i: P[i].dot(d))
        Q = P[k0:] + P[:k0] + [P[k0]]
    else:
        _t, i, u = best
        start = P[i].lerp(P[(i + 1) % m], u)
        Q = [start] + P[i + 1:] + P[: i + 1] + [start]
    pts = L.resample(Q, n + 1)[:-1]
    return [(p.x, p.y) for p in pts]


def lens_outline(a, b, n=32, pinch=1.0):
    """Pointed lens (vesica): half-width a, half-height b (tips on +-y)."""
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n
        s, c = math.sin(t), math.cos(t)
        # x follows a circular-arc-ish bulge that pinches to points at the tips
        y = b * s
        x = a * math.copysign(abs(c) ** pinch, c) * (1.0 - 0.0 * s * s)
        out.append((x, y))
    return out


def vesica(a, b, n=32):
    """Exact two-arc lens: half-width a, half-height b (tips on +-y), CCW."""
    Rr = (a * a + b * b) / (2 * a)
    cx = Rr - a
    phi0 = math.asin(min(1.0, b / Rr))
    half = n // 2
    right = []
    for k in range(half):
        ph = -phi0 + 2 * phi0 * k / half
        right.append((-cx + Rr * math.cos(ph), Rr * math.sin(ph)))
    left = [(-x, -y) for x, y in right]
    return L.ccw(right + left)


def frame_ring(outer, inner, z0, z1, zi=None, bevel=0.0012, seg=2):
    """Solid frame between two matched CCW outlines (same count), walls z0..z1.
    zi: z of the inner wall's foot (default z0)."""
    bm = bmesh.new()
    n = len(outer)
    zi = z0 if zi is None else zi
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    it = [bm.verts.new((x, y, z1)) for x, y in inner]
    ib = [bm.verts.new((x, y, zi)) for x, y in inner]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((it[j], it[i], ib[i], ib[j]))
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if bevel > 0:
        top = set(ot) | set(it)
        rim = [e for e in bm.edges if e.verts[0] in top and e.verts[1] in top and len(e.link_faces) == 2
               and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.6]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=seg, affect="EDGES", profile=0.5, clamp_overlap=True)
    _planar_uv(bm)
    return bm


def _planar_uv(bm, bounds=None):
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    (x0, x1), (y0, y1) = bounds or ((min(xs), max(xs)), (min(ys), max(ys)))
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uv].uv = ((lp.vert.co.x - x0) / max(x1 - x0, 1e-9), (lp.vert.co.y - y0) / max(y1 - y0, 1e-9))


def faceted_lens(outline, z0, z1, ridge=0.55, m=5, uv_flip=False):
    """Faceted crystal cabochon over a CCW outline (long along local y): the
    girdle sits at z0 and a central ridge along y rises to z1."""
    bm = bmesh.new()
    ys = [p[1] for p in outline]
    ymin, ymax = min(ys), max(ys)
    ry = [ymin * ridge + (ymax - ymin) * ridge * k / (m - 1) for k in range(m)]
    rv = [bm.verts.new((0.0, y, z1)) for y in ry]
    g = [bm.verts.new((x, y, z0)) for x, y in outline]
    n = len(g)

    def near(y):
        return min(range(m), key=lambda k: abs(ry[k] - y))

    for i in range(n):
        j = (i + 1) % n
        a, b = g[i], g[j]
        ka, kb = near(a.co.y), near(b.co.y)
        if ka == kb:
            bm.faces.new((a, b, rv[ka]))
        else:
            step = 1 if kb > ka else -1
            # fan over the intermediate ridge points
            ks = list(range(ka, kb + step, step))
            bm.faces.new((a, b, rv[ks[-1]]))
            for k0, k1 in zip(ks[:-1], ks[1:]):
                bm.faces.new((a, rv[k1], rv[k0]))
    bm.faces.new(list(reversed(g)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _planar_uv(bm)
    if uv_flip:
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for lp in f.loops:
                u, v = lp[uv].uv
                lp[uv].uv = (u, 1.0 - v)
    bm.normal_update()
    return bm


def spike(base_w, length, height, back=0.0, matrix=None, tip_z=None):
    """Faceted pyramid spike in local xy: base centred on the origin across x
    (width base_w), tip at +y = length; ridge height `height` along +z."""
    bm = bmesh.new()
    tz = height * 0.25 if tip_z is None else tip_z
    bl = bm.verts.new((-base_w / 2, 0.0, 0.0))
    br = bm.verts.new((base_w / 2, 0.0, 0.0))
    top = bm.verts.new((0.0, 0.0, height))
    bot = bm.verts.new((0.0, 0.0, -back))
    tip = bm.verts.new((0.0, length, tz))
    bm.faces.new((tip, top, bl))
    bm.faces.new((tip, br, top))
    bm.faces.new((tip, bot, br))
    bm.faces.new((tip, bl, bot))
    bm.faces.new((bl, top, br, bot))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _planar_uv(bm)
    if matrix is not None:
        L.transform(bm, matrix)
    bm.normal_update()
    return bm


# ------------------------------------------------------------------ belt contour
class Contour:
    """Closed belt contour around the waist (horizontal), parametrised by arc
    length s from the front centre (s > 0 toward the suit's left, +X)."""

    def __init__(self, body, n=192):
        self.body = body
        samples = []
        for k in range(n):
            th = 2 * math.pi * k / n
            d = Vector((math.sin(th), -math.cos(th), 0.0))
            r = 0.0
            for z in np.linspace(Z_BOT - 0.012, Z_TOP + 0.006, 9):
                o = Vector((0.0, YC, z))
                hit = body.ray(o, d, 1.0)
                if hit is not None:
                    r = max(r, (hit[0] - o).length)
            samples.append((r * math.sin(th), YC - r * math.cos(th)))
        # convex hull, symmetrised in X, smoothed
        import scipy.spatial

        pts = np.array(samples + [(-x, y) for x, y in samples])
        hull = scipy.spatial.ConvexHull(pts)
        poly = [tuple(pts[i]) for i in hull.vertices]
        poly = arc_resample(poly, 256, start_angle=-math.pi / 2)
        P = np.array(poly)
        for _ in range(6):
            P = 0.5 * P + 0.25 * (np.roll(P, 1, axis=0) + np.roll(P, -1, axis=0))
        # offset outward by the gap
        self.base = self._offset(P, BAND_GAP)
        # parametrise from the front centre (min y on x=0) toward +X
        self._param()

    @staticmethod
    def _offset(P, d):
        n = len(P)
        out = []
        for i in range(n):
            t = P[(i + 1) % n] - P[i - 1]
            nrm = np.array([t[1], -t[0]])
            nrm /= np.linalg.norm(nrm)
            out.append(P[i] + nrm * d)
        out = np.array(out)
        # make sure the normals pointed outward (area grows)
        a0 = L.signed_area([tuple(p) for p in P])
        a1 = L.signed_area([tuple(p) for p in out])
        if abs(a1) < abs(a0):
            out = np.array([P[i] - (out[i] - P[i]) for i in range(n)])
        return out

    def _param(self):
        P = self.base
        # orientation: going from the front centre toward +X
        i0 = int(np.argmin(np.abs(P[:, 0]) + 10.0 * (P[:, 1] > 0)))
        P = np.roll(P, -i0, axis=0)
        if P[1][0] < 0:
            P = P[::-1]
            P = np.roll(P, 1, axis=0)
        # snap the start exactly to x=0
        P[0][0] = 0.0
        self.P = P
        seg = np.linalg.norm(np.roll(P, -1, axis=0) - P, axis=1)
        self.s = np.concatenate([[0.0], np.cumsum(seg)])
        self.total = self.s[-1]

    def at(self, s, lift=0.0, z=Z_MID):
        """Point, tangent (toward +s), outward normal at arc length s (wraps)."""
        s = s % self.total
        i = int(np.searchsorted(self.s, s, side="right") - 1)
        i = min(i, len(self.P) - 1)
        j = (i + 1) % len(self.P)
        f = (s - self.s[i]) / max(self.s[i + 1] - self.s[i], 1e-12)
        p = self.P[i] * (1 - f) + self.P[j] * f
        # smooth tangent from neighbours
        a = self.P[i - 1]
        b = self.P[(j + 1) % len(self.P)]
        t = b - a
        t /= np.linalg.norm(t)
        T = Vector((t[0], t[1], 0.0))
        N = Vector((t[1], -t[0], 0.0))
        c = Vector((p[0], p[1], 0.0))
        if N.dot(c - Vector((0.0, YC, 0.0))) < 0:
            N = -N
        return Vector((p[0], p[1], z)) + N * lift, T, N

    def s_of_side(self):
        """Arc length of the suit's left side (max X)."""
        return float(self.s[int(np.argmax(self.P[:, 0]))])

    def s_back(self):
        return self.total * 0.5

    def matrix(self, s, lift, z):
        """Local frame on the band: x along +s, y up, z outward."""
        p, T, N = self.at(s, lift, z)
        return L.frame(p, T, (0.0, 0.0, 1.0)) if T.cross(Vector((0, 0, 1))).dot(N) > 0 else L.frame(p, -T, (0.0, 0.0, 1.0))


# ------------------------------------------------------------------ belt pieces
def band_mesh(C):
    """The dark belt band: rounded section swept around the contour."""
    path = []
    normals = []
    for i in range(0, len(C.P), 2):
        p, T, N = C.at(C.s[i], BAND_T * 0.5, Z_MID)
        path.append(p)
        normals.append(N)
    H = Z_TOP - Z_BOT
    prof = L.rounded_rect_profile(BAND_T, H, 0.0045, 2)
    bm = L.sweep(path, prof, normals=normals, closed=True)
    # make sure the profile's y runs up (B = T x N)
    zs = [v.co.z for v in bm.verts]
    if max(zs) - min(zs) < H * 0.5:
        raise RuntimeError("band sweep orientation")
    return bm


def liner_mesh(C, body):
    """Dark liners that close the band's top and bottom to the body."""
    bm = bmesh.new()
    rings = []
    for z_band, z_body, sgn in ((Z_TOP - 0.002, Z_TOP + 0.016, 1), (Z_BOT + 0.002, Z_BOT - 0.012, -1)):
        a_ring, b_ring = [], []
        for i in range(0, len(C.P), 2):
            p, T, N = C.at(C.s[i], 0.0, z_band)
            # body point at z_body along -N
            o = Vector((p.x, p.y, z_body)) + N * 0.05
            hit = body.ray(o, -N, 0.3)
            q = hit[0] + N * 0.0015 if hit is not None else Vector((p.x, p.y, z_body)) - N * BAND_GAP
            a_ring.append(bm.verts.new(p + N * 0.001))
            b_ring.append(bm.verts.new(q))
        rings.append((a_ring, b_ring))
    for a_ring, b_ring in rings:
        n = len(a_ring)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a_ring[i], a_ring[j], b_ring[j], b_ring[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _planar_uv(bm)
    return bm


def cell_meshes(C, s, gold, crystal, coll, name, glints=True):
    """One crystal cell centred at arc length s: gold frame + faceted lens."""
    lift = BAND_T - 0.002
    M = C.matrix(s, lift, CELL_Z)
    outer = arc_resample(L.rounded_rect_profile(CELL_W, CELL_H, 0.0052, 3), 32)
    win = vesica(0.0090, 0.0385, 48)
    inner = arc_resample(win, 32)
    fr = frame_ring(outer, inner, 0.0, CELL_D, zi=0.0, bevel=0.0012)
    L.transform(fr, M)
    gold.add(fr)
    lens = faceted_lens(arc_resample(vesica(0.0087, 0.0378, 24), 24), 0.001, 0.0112, ridge=0.62)
    L.transform(lens, M)
    crystal.add(lens)
    if glints:
        g = M @ Vector((0.0, 0.0, 0.012))
        L.glint("Waist_Cell_%s" % name, g, 0.016, coll, 0.45)


def block_meshes(C, s, gold, gdark, w=0.032, h=0.096):
    """A solid gold block with a faceted vertical ridge (beside the buckle and
    the back plaque) over a dark-gold base plate."""
    lift = BAND_T - 0.002
    M = C.matrix(s, lift, CELL_Z)
    base = L.prism(arc_resample(L.rounded_rect_profile(w + 0.004, h + 0.004, 0.006, 3), 40), 0.008, bevel=0.0012)
    L.transform(base, M)
    gdark.add(base)
    body = L.prism(arc_resample(L.rounded_rect_profile(w, h, 0.0055, 3), 40), CELL_D - 0.004, bevel=0.0018)
    L.transform(body, M)
    gold.add(body)
    ridge = faceted_lens(arc_resample(L.rounded_rect_profile(w - 0.008, h - 0.010, 0.004, 2), 24), CELL_D - 0.0045,
                         CELL_D + 0.0045, ridge=0.86)
    L.transform(ridge, M)
    gold.add(ridge)


def buckle(C, coll, acc):
    """Round sun buckle: black backplate, faceted gold ring with 8 spikes,
    dark groove, crystal orb with a glowing radial web, glowing core."""
    p0, T, N = C.at(0.0, BAND_T, BUCKLE_Z)
    O = Vector((0.0, p0.y, BUCKLE_Z))
    M = L.frame(O, (1.0, 0.0, 0.0), (0.0, 0.0, 1.0))  # local z = -Y (forward)

    # backplate (black), slightly larger than the ring
    bp = L.disc(0.058, 0.012, seg=48)
    bmesh.ops.translate(bp, vec=(0.0, 0.0, -0.004), verts=bp.verts)
    L.transform(bp, M)
    acc["Black"].add(bp)

    # faceted gold ring: 16 flat facets, bezel-chamfered front
    r_in, r_out = 0.0455, 0.0595
    z_back, z_front = 0.006, 0.026
    w = r_out - r_in
    prof = [(w / 2, z_back), (w / 2, z_front - 0.007), (w / 2 - 0.004, z_front), (-w / 2 + 0.003, z_front),
            (-w / 2, z_front - 0.004), (-w / 2, z_back)]
    rc = (r_out + r_in) / 2
    seg = 16
    path = [Vector((rc * math.cos(2 * math.pi * (i + 0.5) / seg), rc * math.sin(2 * math.pi * (i + 0.5) / seg), 0.0)) for i in range(seg)]
    normals = [Vector((p.x, p.y, 0.0)).normalized() for p in path]
    # profile x along N (radial), y along B; the sweep centre is at z=0 so shift after
    ring = L.sweep(path, [(x, y) for x, y in prof], normals=normals, closed=True)
    # B may point to -z: fix by checking
    zs = [v.co.z for v in ring.verts]
    if abs(max(zs) - z_front) > 1e-4:
        for v in ring.verts:
            v.co.z = -v.co.z
        bmesh.ops.reverse_faces(ring, faces=ring.faces)
    L.transform(ring, M)
    acc["Gold"].add(ring)
    # inner dark-gold step ring
    ring2 = L.ring(0.0465, 0.0425, 0.010, seg=48, round_edge=0.0015)
    bmesh.ops.translate(ring2, vec=(0.0, 0.0, 0.016), verts=ring2.verts)
    L.transform(ring2, M)
    acc["GoldDark"].add(ring2)

    # eight sun spikes (gold), the bottom one longer
    for ang, length, bw in ((0, 0.016, 0.017), (52, 0.020, 0.016), (90, 0.022, 0.017), (128, 0.020, 0.016),
                            (180, 0.026, 0.018), (-52, 0.020, 0.016), (-90, 0.022, 0.017), (-128, 0.020, 0.016)):
        a = math.radians(ang)
        d = Vector((math.sin(a), math.cos(a), 0.0))  # 0 = up (+local y)
        base = d * (r_out - 0.004)
        sm = L.frame(Vector((base.x, base.y, 0.012)), Vector((d.y, -d.x, 0.0)), d)
        sp = spike(bw, length + 0.004, 0.010, back=0.004, matrix=sm, tip_z=0.002)
        L.transform(sp, M)
        acc["Gold"].add(sp)
    # two small pink crystal spikes at the lower diagonals
    for ang in (150, -150):
        a = math.radians(ang)
        d = Vector((math.sin(a), math.cos(a), 0.0))
        base = d * (r_out - 0.006)
        sm = L.frame(Vector((base.x, base.y, 0.008)), Vector((d.y, -d.x, 0.0)), d)
        sp = spike(0.007, 0.020, 0.006, back=0.002, matrix=sm, tip_z=0.0)
        L.transform(sp, M)
        acc["CrystalPink"].add(sp)

    # dark groove between orb and ring
    gr = L.ring(0.0455, 0.0405, 0.008, seg=48)
    bmesh.ops.translate(gr, vec=(0.0, 0.0, 0.012), verts=gr.verts)
    L.transform(gr, M)
    acc["Dark"].add(gr)

    # crystal orb: low dome, pink toward the bottom (UV v = 1 at the bottom)
    orb = L.disc(0.0415, 0.006, seg=48, dome=0.019)
    bmesh.ops.translate(orb, vec=(0.0, 0.0, 0.010), verts=orb.verts)
    uv = orb.loops.layers.uv.verify()
    for f in orb.faces:
        for lp in f.loops:
            lp[uv].uv = (0.5 + lp.vert.co.x / 0.083, 0.5 - lp.vert.co.y / 0.083)
    L.transform(orb, M)
    acc["CrystalOrb"].add(orb)

    # glowing radial web on the orb: 8 spokes + one ring, lying on the dome
    def dome_pt(x, y, lift=0.0006):
        r = math.hypot(x, y) / 0.0415
        r = min(r, 1.0)
        # disc(): rings at angle a: rr = r cos a, z = depth + dome sin a
        z = 0.010 + 0.006 + 0.019 * math.sqrt(max(0.0, 1.0 - r * r))
        return Vector((x, y, z + lift))

    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8 * 0
        pts = [dome_pt(rr * math.sin(a), rr * math.cos(a)) for rr in np.linspace(0.006, 0.039, 8)]
        sp = L.tube(pts, lambda t: 0.0011 * (1.0 - 0.4 * t), sides=6)
        L.transform(sp, M)
        acc["Glow"].add(sp)
    ring_pts = [dome_pt(0.026 * math.cos(2 * math.pi * k / 40), 0.026 * math.sin(2 * math.pi * k / 40)) for k in range(40)]
    rp = L.sweep(ring_pts, L.circle_profile(6, 0.0009), closed=True)
    L.transform(rp, M)
    acc["Glow"].add(rp)
    # glowing core
    core = L.disc(0.013, 0.002, seg=24, dome=0.006)
    bmesh.ops.translate(core, vec=(0.0, 0.0, 0.031), verts=core.verts)
    L.transform(core, M)
    acc["Glow"].add(core)
    L.glint("Waist_Buckle", M @ Vector((0.0, 0.0, 0.040)), 0.07, coll, 0.3)
    return M


def back_plaque(C, coll, acc):
    """Centre back: black plate, two gold I-bars and a diamond gem."""
    sb = C.s_back()
    p0, T, N = C.at(sb, BAND_T, Z_MID)
    O = Vector((0.0, p0.y, Z_MID))
    M = L.frame(O, (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0))  # local z = +Y (outward at the back)
    # black plate
    plate = L.prism(L.rounded_rect_profile(0.112, Z_TOP - Z_BOT + 0.004, 0.006, 3), 0.008, bevel=0.0015)
    bmesh.ops.translate(plate, vec=(0.0, 0.0, -0.004), verts=plate.verts)
    L.transform(plate, M)
    acc["Black"].add(plate)
    # gold I-bars (x = +-0.046 in back-09), run from the band top down into the back tasset
    for sx in (-1.0, 1.0):
        cx = 0.0465 * sx
        bar = L.prism(L.rounded_rect_profile(0.020, Z_TOP - Z_BOT + 0.010, 0.003, 2), 0.012, bevel=0.0016)
        bmesh.ops.translate(bar, vec=(cx, -0.002, 0.002), verts=bar.verts)
        L.transform(bar, M)
        acc["Gold"].add(bar)
        cap = L.prism(L.rounded_rect_profile(0.034, 0.013, 0.003, 2), 0.014, bevel=0.0016)
        bmesh.ops.translate(cap, vec=(cx - 0.004 * sx, (Z_TOP - Z_BOT) / 2 - 0.004, 0.002), verts=cap.verts)
        L.transform(cap, M)
        acc["Gold"].add(cap)
        # angled gold tooth on the outer side of each bar (back-09 y ~640)
        tooth = L.prism([(0.0, 0.0), (0.020, -0.016), (0.020, -0.004), (0.0, 0.012)], 0.010, bevel=0.0012)
        L.transform(tooth, Matrix.Translation((cx + 0.010 * sx, -0.012, 0.003)) @ Matrix.Scale(sx, 4, (1, 0, 0)))
        bmesh.ops.recalc_face_normals(tooth, faces=tooth.faces)
        L.transform(tooth, M)
        acc["Gold"].add(tooth)
    # diamond gem with a gold rim (back-09 x 497-527, y 578-650)
    gw, gh = 0.034, 0.090
    rim_out = [(gw / 2 + 0.005, 0.0), (0.0, gh / 2 + 0.007), (-gw / 2 - 0.005, 0.0), (0.0, -gh / 2 - 0.007)]
    rim_in = [(gw / 2, 0.0), (0.0, gh / 2), (-gw / 2, 0.0), (0.0, -gh / 2)]
    rim = frame_ring(L.ccw(rim_out), L.ccw(rim_in), 0.002, 0.013, bevel=0.0012)
    L.transform(rim, M)
    acc["Gold"].add(rim)
    gem = L.gem_kite(gw, gh, 0.012, table=0.35)
    bmesh.ops.translate(gem, vec=(0.0, 0.0, 0.004), verts=gem.verts)
    L.transform(gem, M)
    acc["Gem"].add(gem)
    L.glint("Waist_BackGem", M @ Vector((0.0, 0.004, 0.016)), 0.035, coll, 0.5)
    return M


def belt(ctx, coll, C):
    acc = {k: Acc() for k in ("Black", "Gold", "GoldDark", "Dark", "Glow", "Gem", "CrystalOrb", "CrystalPink")}
    cells_gold, cells_crystal = Acc(), Acc()

    acc["Black"].add(band_mesh(C))
    liner = liner_mesh(C, ctx.body)

    buckle(C, coll, acc)
    back_plaque(C, coll, acc)

    # layout along one side (s > 0), mirrored by symmetry of the contour:
    # gold block beside the buckle, crystal cells all round, gold block beside the plaque
    s_back = C.s_back()
    layout = []  # (s, kind)
    s_block_front = 0.0790
    s_block_back = s_back - 0.0800
    layout.append((s_block_front, "block"))
    a0 = s_block_front + 0.016 + 0.0025 + CELL_W / 2
    a1 = s_block_back - 0.016 - 0.0025 - CELL_W / 2
    n = int(round((a1 - a0) / CELL_PITCH)) + 1
    layout += [(a0 + (a1 - a0) * k / (n - 1), "cell") for k in range(n)]
    layout.append((s_block_back, "block"))

    for side in (1, -1):
        for i, (s, kind) in enumerate(layout):
            ss = s if side > 0 else C.total - s
            tag = "%s%d_%s" % (kind, i, "L" if side > 0 else "R")
            if kind == "cell":
                cell_meshes(C, ss, cells_gold, cells_crystal, coll, tag)
            else:
                block_meshes(C, ss, acc["Gold"], acc["GoldDark"])

    out = {}
    out["band"] = acc["Black"].build("RX_Waist_Belt", coll, "Black", 40)
    out["liner"] = L.from_bmesh(liner, "RX_Waist_BeltLiner", coll, "Dark", 60)
    out["gold"] = acc["Gold"].build("RX_Waist_BeltGold", coll, "Gold", 30)
    out["golddark"] = acc["GoldDark"].build("RX_Waist_BeltGoldDark", coll, "GoldDark", 30)
    out["dark"] = acc["Dark"].build("RX_Waist_BuckleGroove", coll, "Dark", 30)
    out["glow"] = acc["Glow"].build("RX_Waist_BuckleWeb", coll, "Glow", 60)
    out["gem"] = acc["Gem"].build("RX_Waist_BackGem", coll, "Gem", 20)
    orb = acc["CrystalOrb"].build("RX_Waist_BuckleOrb", coll, "Crystal", 25)
    L.tint(orb, pink=0.15, sparkle=0.7, edge=0.6)
    pinks = acc["CrystalPink"].build("RX_Waist_BuckleSpikes", coll, "Crystal", 30)
    L.tint(pinks, pink=1.0, sparkle=0.3, edge=0.8)
    frames = cells_gold.build("RX_Waist_CellFrames", coll, "Gold", 30)
    crys = cells_crystal.build("RX_Waist_CellCrystals", coll, "Crystal", 30)
    # cells: pink at both ends, blue in the middle (v runs bottom -> top)
    L.tint(crys, fn=lambda co, uv: (min(1.0, abs(uv[1] - 0.5) * 2.0) ** 1.5 * 0.9, 0.8, 0.7))
    return out


# ------------------------------------------------------------------ hanging panels
class HangSurface:
    """A stiff panel hanging from the belt: Y = yc(z) - o * c * x^2, where o
    is the outward sign (-1 front, +1 back). yc follows the body (plus a gap)
    while the body bulges out and drops vertically once it recedes."""

    def __init__(self, body, out_sign, halfwidth, z_top, z_bot, gap, c, y_top=None, lean=0.0):
        self.o = out_sign
        self.c = c
        zs = np.linspace(z_top, z_bot, 60)
        ys = []
        run = None
        for z in zs:
            w = halfwidth(z)
            best = None
            for x in np.linspace(-w, w, 9):
                org = Vector((x, 2.0 * out_sign, z))
                hit = body.ray(org, Vector((0.0, -out_sign, 0.0)), 4.0)
                if hit is None:
                    continue
                y = hit[0].y + out_sign * gap + out_sign * c * x * x
                best = y if best is None else (max(best, y) if out_sign > 0 else min(best, y))
            if best is not None:
                run = best if run is None else (max(run, best) if out_sign > 0 else min(run, best))
            ys.append(run if run is not None else (y_top or 0.0))
        ys = np.array(ys, dtype=float)
        if y_top is not None:
            ys = np.maximum(ys, y_top) if out_sign > 0 else np.minimum(ys, y_top)
        # gentle lean toward the bottom (positive lean = outward)
        ys = ys + out_sign * lean * (z_top - zs) / max(z_top - z_bot, 1e-6)
        # smooth
        for _ in range(4):
            ys[1:-1] = 0.5 * ys[1:-1] + 0.25 * (ys[:-2] + ys[2:])
        self.zs = zs[::-1]
        self.ys = ys[::-1]

    def yc(self, z):
        return float(np.interp(z, self.zs, self.ys))

    def point(self, x, z):
        return Vector((x, self.yc(z) - self.o * self.c * x * x, z))

    def normal(self, x, z):
        dz = 0.004
        dy = (self.yc(z + dz) - self.yc(z - dz)) / (2 * dz)
        # outward = o * grad(Y - f), grad = (2 o c x, 1, -dy)
        return Vector((2 * self.c * x, self.o, -self.o * dy)).normalized()


def _tri_grid(outline, res, edge):
    """Boundary points (step `edge`) + interior grid (step `res`, None = none),
    Delaunay triangles inside the outline."""
    import scipy.spatial

    outline = L.ccw(outline)
    boundary = L.densify(outline, edge)
    B = np.asarray(boundary)
    grid = np.zeros((0, 2))
    if res:
        xs, ys = B[:, 0], B[:, 1]
        gx, gy = np.meshgrid(np.arange(xs.min() + res * 0.5, xs.max(), res), np.arange(ys.min() + res * 0.5, ys.max(), res))
        grid = np.stack([gx.ravel(), gy.ravel()], axis=1)
        if len(grid):
            grid = grid[L.point_in_polygon(grid, boundary)]
        if len(grid):
            dmin = np.min(np.linalg.norm(grid[:, None, :] - B[None, :, :], axis=2), axis=1)
            grid = grid[dmin > max(res, edge) * 0.55]
    pts = np.vstack([B, grid]) if len(grid) else B
    tri = scipy.spatial.Delaunay(pts)
    cent = pts[tri.simplices].mean(axis=1)
    keep = L.point_in_polygon(cent, boundary)
    return pts, tri.simplices[keep], len(B)


def sheet_plate(outline, surf, t0, thick, res=None, edge=0.008, bevel=0.0012, uv_fn=None, bevel_seg=2, back=False):
    """Plate over a 2D outline (x, z), laid on surf (point(x, z), normal(x, z))
    between heights t0 and t0 + thick (thick may be f(x, z)). back=False leaves
    the hidden underside open (stacked layers)."""
    pts, simp, nb = _tri_grid(outline, res, edge)
    th = thick if callable(thick) else (lambda x, z, t=thick: t)
    bm = bmesh.new()
    P = [surf.point(x, z) for x, z in pts]
    N = [surf.normal(x, z) for x, z in pts]
    inner = [bm.verts.new(P[i] + N[i] * t0) for i in range(len(P))]
    outer = [bm.verts.new(P[i] + N[i] * (t0 + th(*pts[i]))) for i in range(len(P))]

    def oriented(verts, want):
        e1 = verts[1].co - verts[0].co
        e2 = verts[2].co - verts[0].co
        return verts if e1.cross(e2).dot(want) >= 0 else verts[::-1]

    for a_, b_, c_ in simp:
        n = N[a_] + N[b_] + N[c_]
        try:
            bm.faces.new(oriented([outer[a_], outer[b_], outer[c_]], n))
            if back:
                bm.faces.new(oriented([inner[a_], inner[b_], inner[c_]], -n))
        except ValueError:
            pass
    for i in range(nb):
        j = (i + 1) % nb
        (x0_, z0_), (x1_, z1_) = pts[i], pts[j]
        dx, dz = x1_ - x0_, z1_ - z0_
        ln = math.hypot(dx, dz)
        if ln < 1e-12:
            continue
        nx, nz = dz / ln, -dx / ln  # outward for a CCW outline
        mx, mz = 0.5 * (x0_ + x1_), 0.5 * (z0_ + z1_)
        want = surf.point(mx + nx * 0.002, mz + nz * 0.002) - surf.point(mx, mz)
        try:
            bm.faces.new(oriented([inner[i], inner[j], outer[j], outer[i]], want))
        except ValueError:
            pass
    bm.normal_update()
    if bevel > 0:
        oset = set(outer)
        rim = [e for e in bm.edges if e.verts[0] in oset and e.verts[1] in oset and len(e.link_faces) == 2
               and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=bevel_seg, affect="EDGES", profile=0.5, clamp_overlap=True)
    uvmap = {}
    for i, v in enumerate(inner):
        uvmap[v] = pts[i]
    for i, v in enumerate(outer):
        uvmap[v] = pts[i]
    x0, x1 = float(pts[:, 0].min()), float(pts[:, 0].max())
    z0, z1 = float(pts[:, 1].min()), float(pts[:, 1].max())
    fn = uv_fn or (lambda x, z: ((x - x0) / max(x1 - x0, 1e-9), (z - z0) / max(z1 - z0, 1e-9)))
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            if lp.vert in uvmap:
                x, z = uvmap[lp.vert]
            else:
                x, z = lp.vert.co.x, lp.vert.co.z
            lp[uv].uv = fn(x, z)
    unused = [v for v in bm.verts if not v.link_faces]
    if unused:
        bmesh.ops.delete(bm, geom=unused, context="VERTS")
    return bm


def _px_outline(view, half, mirror=True):
    """Symmetric outline from the right half given as (dx_px, y_px) top -> bottom
    (dx > 0 = the suit's left). Returns CCW (X, Z)."""
    v = R.VIEWS[view]
    pts = [(dx * R.S, (v["sole"] - y) * R.S) for dx, y in half]
    if mirror:
        left = [(-x, z) for x, z in reversed(pts) if abs(x) > 1e-9]
        if abs(pts[-1][0]) < 1e-9:
            full = pts + left
        else:
            full = pts + left
    else:
        full = pts
    return L.ccw(full)


def _z(view, y):
    v = R.VIEWS[view]
    return (v["sole"] - y) * R.S


def _vband(view, outer_half, inner_half):
    """Closed V-band polygon from the outer and inner edges of its right half
    (both top -> bottom, ending on the centre line); mirrored to the left."""
    v = R.VIEWS[view]
    o = [(dx * R.S, (v["sole"] - y) * R.S) for dx, y in outer_half]
    i = [(dx * R.S, (v["sole"] - y) * R.S) for dx, y in inner_half]
    right_outer = o
    left_outer = [(-x, z) for x, z in reversed(o[:-1])]
    left_inner = [(-x, z) for x, z in i[:-1]]
    right_inner = list(reversed(i))
    poly = right_outer + left_outer + left_inner + right_inner
    return L.ccw(poly)


def _strip(view, outer_edge, inner_edge):
    """Closed strip polygon between two edges (each top -> bottom, px)."""
    v = R.VIEWS[view]
    o = [(dx * R.S, (v["sole"] - y) * R.S) for dx, y in outer_edge]
    i = [(dx * R.S, (v["sole"] - y) * R.S) for dx, y in inner_edge]
    return L.ccw(o + list(reversed(i)))


def _mirror2(poly):
    return L.ccw([(-x, z) for x, z in poly])


def tasset(ctx, coll, side):
    """Layered V tasset hanging from the belt: black base with a dagger tail,
    outer gold V frame, glowing crystal V band, stacked black chevrons, a gold
    arrowhead (front), a violet crystal V and a gold spike pendant."""
    body = ctx.body
    front = side == "front"
    view = "front" if front else "back"
    o = -1.0 if front else 1.0
    z_top = Z_BOT - 0.001
    z_bot = _z(view, 1180)
    if front:
        base_half = [(72, 650), (66, 700), (58, 775), (50, 845), (45, 885), (46, 935), (46, 985), (42, 1030),
                     (34, 1070), (24, 1105), (13, 1142), (0, 1178)]
        hw = lambda z: 0.10 if z > 0.9 else 0.065  # noqa: E731
        surf = HangSurface(body, o, hw, z_top + 0.01, z_bot - 0.01, gap=0.010, c=0.55, y_top=-0.112, lean=0.010)
    else:
        base_half = [(58, 650), (53, 700), (45, 780), (37, 860), (33, 905), (32, 950), (30, 1000), (26, 1050),
                     (21, 1090), (16, 1125), (8, 1158), (0, 1181)]
        hw = lambda z: 0.075 if z > 0.95 else 0.05  # noqa: E731
        surf = HangSurface(body, o, hw, z_top + 0.01, z_bot - 0.01, gap=0.011, c=0.9, y_top=0.120, lean=0.004)

    def vmap(z):
        return (z_top - z) / (z_top - z_bot)

    uv_down = lambda x, z: (0.5 + x / 0.2, vmap(z))  # noqa: E731

    pieces = {"Black": [], "Gold": [], "Crystal": [], "CrystalViolet": [], "GoldDark": []}
    base = sheet_plate(_px_outline(view, base_half), surf, 0.0, 0.007, res=0.018, edge=0.010, bevel=0.0018, back=True)
    pieces["Black"].append(base)
    if front:
        # outer gold V frame (one band, kinked at y ~863)
        gold_o = [(73, 650), (65, 730), (53, 797), (40, 863), (39, 900), (35, 940), (23, 980), (11, 1018), (0, 1039)]
        gold_i = [(62, 650), (55, 730), (42, 797), (29, 863), (28, 900), (27, 940), (16, 980), (6, 1012), (0, 1023)]
        pieces["Gold"].append(sheet_plate(_vband(view, gold_o, gold_i), surf, 0.006, 0.0075, edge=0.008, bevel=0.0016))
        # glowing crystal V band (root at the belt, tip at the V point)
        cry_o = [(59, 651), (53, 673), (31, 763), (10, 843), (0, 886)]
        cry_i = [(51, 651), (45, 673), (23, 763), (5, 843), (0, 867)]
        pieces["Crystal"].append(sheet_plate(_vband(view, cry_o, cry_i), surf, 0.005, 0.0045, edge=0.008, bevel=0.001,
                                             uv_fn=uv_down))
        # black recess between gold frame and crystal band (GoldDark lip under the gold)
        # stacked chevron plates in the centre V (top plate highest)
        chev = [
            [(50, 650), (40, 690), (0, 731), (-40, 690), (-50, 650)],
            [(41, 685), (21, 770), (0, 808), (-21, 770), (-41, 685), (0, 724)],
            [(21, 766), (0, 865), (-21, 766), (0, 802)],
        ]
        for k, half in enumerate(chev):
            poly = [(dx * R.S, _z(view, y)) for dx, y in half]
            pieces["Black"].append(sheet_plate(L.ccw(poly), surf, 0.006, 0.0062 - 0.0012 * k + 0.0024 * (2 - k) * 0.5,
                                               edge=0.008, bevel=0.0014))
        # gold arrowhead below the crystal V, with a centre crease
        crease = lambda x, z: 0.0082 + 0.0040 * max(0.0, 1.0 - abs(x) / 0.041)  # noqa: E731
        for sx in (1, -1):
            half = [(31, 866), (28, 886), (17, 940), (0, 968), (0, 895)]
            poly = [(sx * dx * R.S, _z(view, y)) for dx, y in half]
            pieces["Gold"].append(sheet_plate(L.ccw(poly), surf, 0.006, crease, edge=0.006, bevel=0.0010))
        # violet crystal V inside the lower gold frame
        vio = [(29, 893), (28, 940), (16, 980), (6, 1012), (0, 1026), (-6, 1012), (-16, 980), (-28, 940), (-29, 893)]
        pieces["CrystalViolet"].append(sheet_plate(L.ccw([(dx * R.S, _z(view, y)) for dx, y in vio]), surf, 0.005,
                                                   0.0042, edge=0.006, bevel=0.0008, uv_fn=uv_down))
        pend = dict(stem=(1039, 1085), top=1083, wide=1121, bot=1155, hw=19)
    else:
        gold_o = [(57, 650), (52, 720), (42, 790), (32, 840), (16, 880), (0, 898)]
        gold_i = [(43, 650), (38, 720), (28, 790), (15, 840), (0, 876)]
        pieces["Gold"].append(sheet_plate(_vband(view, gold_o, gold_i), surf, 0.006, 0.0075, edge=0.008, bevel=0.0016))
        low_o = [(31, 904), (23, 960), (13, 1000), (0, 1036)]
        low_i = [(19, 910), (15, 960), (5, 1000), (0, 1017)]
        pieces["Gold"].append(sheet_plate(_vband(view, low_o, low_i), surf, 0.006, 0.0072, edge=0.007, bevel=0.0014))
        # crystal: V band whose bottom is filled down to the gold point
        cr = [(40, 688), (28, 790), (15, 840), (0, 878), (-15, 840), (-28, 790), (-40, 688), (-31, 688), (0, 791), (31, 688)]
        pieces["Crystal"].append(sheet_plate(L.ccw([(dx * R.S, _z(view, y)) for dx, y in cr]), surf, 0.005, 0.0045,
                                             edge=0.008, bevel=0.001, uv_fn=uv_down))
        chev = [
            [(42, 650), (31, 688), (0, 737), (-31, 688), (-42, 650)],
            [(31, 685), (0, 790), (-31, 685), (0, 732)],
        ]
        for k, half in enumerate(chev):
            poly = [(dx * R.S, _z(view, y)) for dx, y in half]
            pieces["Black"].append(sheet_plate(L.ccw(poly), surf, 0.006, 0.0058 - 0.0012 * k, edge=0.008, bevel=0.0014))
        vio = [(20, 906), (15, 960), (5, 1000), (0, 1019), (-5, 1000), (-15, 960), (-20, 906)]
        pieces["CrystalViolet"].append(sheet_plate(L.ccw([(dx * R.S, _z(view, y)) for dx, y in vio]), surf, 0.005,
                                                   0.0042, edge=0.006, bevel=0.0008, uv_fn=uv_down))
        pend = dict(stem=(1036, 1097), top=1095, wide=1122, bot=1179, hw=18)

    # gold spike pendant on a short stem
    zt, zb = _z(view, pend["stem"][0]), _z(view, pend["stem"][1])
    stem_pts = [surf.point(0.0, z) + surf.normal(0.0, z) * 0.0105 for z in np.linspace(zt + 0.004, zb - 0.004, 6)]
    pieces["Gold"].append(L.tube(stem_pts, 0.0028, sides=10))
    z_top_p, z_w, z_bot_p = _z(view, pend["top"]), _z(view, pend["wide"]), _z(view, pend["bot"])
    w = 2 * pend["hw"] * R.S
    c0 = surf.point(0.0, z_w)
    nrm = surf.normal(0.0, z_w)
    M = L.frame(c0 + nrm * 0.008, (1.0, 0.0, 0.0) if front else (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    if M.col[2].xyz.dot(nrm) < 0:
        M = L.frame(c0 + nrm * 0.008, (-1.0, 0.0, 0.0) if front else (1.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    sp = L.gem_kite(w, z_top_p - z_bot_p, 0.011, table=0.18, h_top=z_top_p - z_w)
    # a back half so the pendant reads as a solid spearhead from the side
    L.transform(sp, M)
    pieces["Gold"].append(sp)
    sp2 = L.gem_kite(w * 0.9, (z_top_p - z_bot_p) * 0.95, 0.007, table=0.2, h_top=(z_top_p - z_w) * 0.95)
    L.transform(sp2, M @ Matrix.Rotation(math.pi, 4, "Y"))
    pieces["GoldDark"].append(sp2)

    if front:
        # gold pointer under the buckle (front-10 x 488-512, y 662-690)
        zt2, zb2 = _z(view, 658), _z(view, 692)
        p = surf.point(0.0, zt2)
        nn = surf.normal(0.0, zt2)
        Mp = L.frame(p + nn * 0.010, (1.0, 0.0, 0.0), (0.0, 0.0, -1.0))
        if Mp.col[2].xyz.dot(nn) < 0:
            Mp = L.frame(p + nn * 0.010, (-1.0, 0.0, 0.0), (0.0, 0.0, -1.0))
        pieces["Gold"].append(spike(0.026, zt2 - zb2, 0.008, back=0.004, matrix=Mp, tip_z=0.001))

    tag = "Front" if front else "Back"
    obs = {}
    for fam, bms in pieces.items():
        if not bms:
            continue
        acc = Acc()
        for b in bms:
            acc.add(b)
        family = "Crystal" if fam.startswith("Crystal") else fam
        ob = acc.build("RX_Waist_%sTasset_%s" % (tag, fam), coll, family, 32)
        obs[fam] = ob
    if "Crystal" in obs:
        L.tint(obs["Crystal"], fn=lambda co, uv: (min(1.0, max(0.0, (uv[1] - 0.45) / 0.55)) * 0.9, 0.7, 0.8))
    if "CrystalViolet" in obs:
        L.tint(obs["CrystalViolet"], fn=lambda co, uv: (0.55 + 0.4 * min(1.0, max(0.0, (uv[1] - 0.6) / 0.4)), 0.5, 0.7))
    return surf


# ------------------------------------------------------------------ hips
def _smooth01(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hip_axis(z):
    """Internal vertical axis for radial projection on the suit's left hip:
    the torso centre above the hips, the thigh centre below."""
    t = _smooth01(0.95, 1.12, z)
    return Vector((0.125 * (1 - t), -0.006 * (1 - t) + YC * t, z))


def theta_of(p):
    c = hip_axis(p[2])
    return math.atan2(p[0] - c.x, -(p[1] - c.y))


def body_radial(body, theta, z):
    """Surface point and outward normal at angle theta (0 = front, +90 = +X)
    around hip_axis(z)."""
    c = hip_axis(z)
    d = Vector((math.sin(theta), -math.cos(theta), 0.0))
    hit = body.ray(c, d, 1.0)
    if hit is None:
        return None
    loc, n = hit
    if n.dot(d) < 0:
        n = -n
    return loc, n


def _norm_smooth(N, k=2):
    N = [Vector(n) for n in N]
    for _ in range(k):
        N = [N[0]] + [(N[i - 1] + 2 * N[i] + N[i + 1]).normalized() for i in range(1, len(N) - 1)] + [N[-1]]
    return N


class SurfPath:
    """A path on the body: theta(z) around hip_axis(z), resolved radially so it
    hugs the surface. Built from (z, theta) keys."""

    def __init__(self, body, keys):
        keys = sorted(keys, key=lambda k: -k[0])
        self.zs = [k[0] for k in keys]
        self.th = [k[1] for k in keys]
        self.body = body

    def theta(self, z):
        return float(np.interp(-z, [-v for v in self.zs], self.th))

    def sample(self, n, z0=None, z1=None):
        z0 = self.zs[0] if z0 is None else z0
        z1 = self.zs[-1] if z1 is None else z1
        P, N = [], []
        for z in np.linspace(z0, z1, n):
            r = body_radial(self.body, self.theta(z), z)
            if r is None:
                continue
            P.append(r[0])
            N.append(r[1])
        return P, _norm_smooth(N, 3)


def solve_theta(body, z, x_target, lo, hi, lift):
    """Angle in [lo, hi] (radians, X monotonic there) whose surface point,
    lifted along the normal, has world X = x_target (clamped to the range)."""

    def X(th):
        r = body_radial(body, th, z)
        return (r[0] + r[1] * lift).x if r is not None else None

    xl, xh = X(lo), X(hi)
    inc = xh > xl
    if x_target <= min(xl, xh):
        return lo if inc else hi
    if x_target >= max(xl, xh):
        return hi if inc else lo
    for _ in range(28):
        mid = 0.5 * (lo + hi)
        xm = X(mid)
        if (xm < x_target) == inc:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# lapel centre lines read off the sheet: (Z, X) in front-10 / back-09
FRONT_LAPEL_X = [(1.153, 0.118), (1.100, 0.148), (1.060, 0.171), (1.020, 0.198), (0.980, 0.224)]
BACK_LAPEL_X = [(1.153, 0.112), (1.100, 0.156), (1.060, 0.190), (1.025, 0.212)]
JUNCTION_Z = 0.915
JUNCTION_TH = math.radians(97.0)
PANEL_T0, PANEL_T1 = 0.0090, 0.0145  # over the legs' thigh scales (3-8 mm)
LAPEL_LIFT = 0.0140


def lapel_paths(body):
    fk = [(z, solve_theta(body, z, x, math.radians(15), math.radians(96), LAPEL_LIFT)) for z, x in FRONT_LAPEL_X]
    bk = [(z, solve_theta(body, z, x, math.radians(98), math.radians(175), LAPEL_LIFT)) for z, x in BACK_LAPEL_X]
    fk.append((JUNCTION_Z, JUNCTION_TH))
    bk.append((JUNCTION_Z, JUNCTION_TH))
    return SurfPath(body, fk), SurfPath(body, bk)


def bar_profile(t, ridge=0.0016, chamfer=0.16):
    """Gold strip section: x along the surface normal (thickness t), y across
    the width normalised to 1: flat back, chamfered edges, a low centre ridge."""
    return [(-t / 2, -0.5), (t * 0.18, -0.5), (t / 2, -0.5 + chamfer), (t / 2 + ridge, 0.0),
            (t / 2, 0.5 - chamfer), (t * 0.18, 0.5), (-t / 2, 0.5)]


def surface_strip(P, N, width, thick, lift, width_fn=None, ridge=0.0016):
    """Gold strip swept along surface points P with normals N."""
    path = [p + n * (lift + thick / 2) for p, n in zip(P, N)]
    wf = width_fn or (lambda t: 1.0)
    path = [Vector(p) for p in path]
    return L.sweep(path, bar_profile(thick, ridge), scale=lambda t: (1.0, max(width * wf(t), 1e-4)), normals=N)


def grid_slab(P, N, t0, t1, bevel=0.0015, thick_fn=None, uv_fn=None):
    """Closed slab from a (rows x cols) grid of surface points/normals: bottom
    at t0, top at t1 (or t0 + thick_fn(i, j)) along the normals."""
    rows, cols = len(P), len(P[0])
    bm = bmesh.new()
    top = [[None] * cols for _ in range(rows)]
    bot = [[None] * cols for _ in range(rows)]
    for i in range(rows):
        for j in range(cols):
            tt = t1 if thick_fn is None else t0 + thick_fn(i, j)
            top[i][j] = bm.verts.new(P[i][j] + N[i][j] * tt)
            bot[i][j] = bm.verts.new(P[i][j] + N[i][j] * t0)

    def face(vs, want):
        e1 = vs[1].co - vs[0].co
        e2 = vs[2].co - vs[0].co
        if e1.cross(e2).dot(want) < 0:
            vs = vs[::-1]
        try:
            return bm.faces.new(vs)
        except ValueError:
            return None

    for i in range(rows - 1):
        for j in range(cols - 1):
            n = N[i][j] + N[i + 1][j + 1]
            face([top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]], n)
            face([bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]], -n)
    # walls around the boundary
    ring = [(0, j) for j in range(cols)] + [(i, cols - 1) for i in range(1, rows)] + \
           [(rows - 1, j) for j in range(cols - 2, -1, -1)] + [(i, 0) for i in range(rows - 2, 0, -1)]
    cen = sum((P[i][j] for i in range(rows) for j in range(cols)), Vector()) / (rows * cols)
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        mid = (P[a[0]][a[1]] + P[b[0]][b[1]]) * 0.5
        want = mid - cen
        face([bot[a[0]][a[1]], bot[b[0]][b[1]], top[b[0]][b[1]], top[a[0]][a[1]]], want)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if bevel > 0:
        tset = set(v for row in top for v in row if v.is_valid)
        rim = [e for e in bm.edges if e.verts[0] in tset and e.verts[1] in tset and len(e.link_faces) == 2
               and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = uv_fn(co) if uv_fn else (co.y * 4.0, co.z * 4.0)
    return bm


def hips(ctx, coll):
    """Suit's left hip (mirrored): gold front and back lapels meeting at a
    clasp on the outer thigh, the scaled side panel between them that runs on
    as a short coat tail, a black front hip plate, overlapping feather plates
    over the buttock and the hip pendant on its rod."""
    body = ctx.body
    gold, suit, black, gdark = Acc(), Acc(), Acc(), Acc()
    fl, bl = lapel_paths(body)
    z_top = Z_BOT + 0.002
    nrows = 26

    # --- side panel between the lapels (scaled), down to the junction
    zs = np.linspace(z_top, JUNCTION_Z, nrows)
    P, N = [], []
    for z in zs:
        t0, t1 = fl.theta(z), bl.theta(z)
        row_p, row_n = [], []
        for u in np.linspace(0.0, 1.0, 9):
            r = body_radial(body, t0 + (t1 - t0) * u, z)
            row_p.append(r[0])
            row_n.append(r[1])
        P.append(row_p)
        N.append(row_n)
    suit.add(grid_slab(P, N, PANEL_T0, PANEL_T1, bevel=0.0015))

    # --- coat tail below the junction: a stiff scaled flap on the outer thigh,
    # standing over the thigh scales and ending above the knee blades
    ct_z = np.linspace(JUNCTION_Z + 0.035, 0.800, 16)
    P, N = [], []
    for k, z in enumerate(ct_z):
        f = k / (len(ct_z) - 1)
        half = 0.050 * (1.0 - f ** 1.5) + 0.003
        lift = 0.016 + 0.012 * f
        row_p, row_n = [], []
        c = hip_axis(z)
        r0 = body_radial(body, JUNCTION_TH, z)
        rad = (Vector((r0[0].x, r0[0].y, 0)) - Vector((c.x, c.y, 0))).length
        dth = half / max(rad, 0.05)
        for u in np.linspace(-1.0, 1.0, 9):
            r = body_radial(body, JUNCTION_TH + dth * u, z)
            row_p.append(r[0] + r[1] * (lift - 0.004 * u * u))
            row_n.append(r[1])
        P.append(row_p)
        N.append(row_n)
    suit.add(grid_slab(P, N, 0.0, 0.0055, bevel=0.0015))

    # --- gold lapels with a raised centre ridge, tapering into the clasp
    for path in (fl, bl):
        Pp, Nn = path.sample(44, z_top, JUNCTION_Z)
        gold.add(surface_strip(Pp, Nn, 0.026, 0.0065, LAPEL_LIFT, width_fn=lambda t: 1.0 - 0.35 * t))
        # dark-gold under-lip so the lapel reads as a layered edge
        gdark.add(surface_strip(Pp, Nn, 0.033, 0.003, LAPEL_LIFT - 0.0018, width_fn=lambda t: 1.0 - 0.4 * t, ridge=0.0))

    # --- clasp at the junction: faceted gold diamond over a dark-gold seat
    rj = body_radial(body, JUNCTION_TH, JUNCTION_Z)
    cj = rj[0] + rj[1] * (LAPEL_LIFT + 0.006)
    Mj = L.frame_from_normal(cj, rj[1], (0.0, 0.0, 1.0))
    clasp = L.gem_kite(0.034, 0.058, 0.012, table=0.3)
    L.transform(clasp, Mj)
    gold.add(clasp)
    seat = L.gem_kite(0.044, 0.070, 0.004, table=0.8)
    bmesh.ops.translate(seat, vec=(0.0, 0.0, -0.003), verts=seat.verts)
    L.transform(seat, Mj)
    gdark.add(seat)

    # --- hip pendant on a thin rod (front-10 ~ (232, 1055-1160), left-08 Y ~ +0.10):
    # the rod leaves the clasp outward and drops nearly vertically
    hub_x, hub_y = 0.349, 0.084
    wide_z = R.front(232, 1095)[1]
    bot_z = R.front(232, 1160)[1]
    top = Vector((hub_x, hub_y, 0.612))
    rod_ctrl = [cj + rj[1] * 0.004, Vector((0.300, 0.040, 0.875)), Vector((0.333, 0.068, 0.800)),
                Vector((0.344, 0.080, 0.700)), top]
    rod = L.catmull_rom(rod_ctrl, 8)
    gold.add(L.tube(rod, 0.0030, sides=10))
    hub = Vector((hub_x, hub_y, wide_z))
    # square bipyramid turned 45 deg: a diamond outline from the front and the side
    bm = bmesh.new()
    w = 0.027
    girdle = [bm.verts.new(hub + Vector((w * math.cos(a), w * math.sin(a), 0.0)))
              for a in (math.radians(45 + 90 * k) for k in range(4))]
    vt = bm.verts.new(top)
    vb = bm.verts.new(Vector((hub.x, hub.y, bot_z)))
    for k in range(4):
        a, b = girdle[k], girdle[(k + 1) % 4]
        bm.faces.new((a, b, vt))
        bm.faces.new((b, a, vb))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _planar_uv(bm)
    gold.add(bm)
    # cross guard at the widest point
    guard = L.tube([hub + Vector((-0.030, 0.0, 0.0)), hub + Vector((0.030, 0.0, 0.0))], 0.0035, sides=8)
    gold.add(guard)
    for sx in (-1, 1):
        tip = spike(0.010, 0.012, 0.005, back=0.005,
                    matrix=L.frame(hub + Vector((0.030 * sx, 0.0, 0.0)), (0.0, 0.0, 1.0), (sx, 0.0, 0.0)), tip_z=0.0)
        gold.add(tip)

    # --- black front hip plate between the tasset and the front lapel (front-10:
    # a big lacquer plate with a diagonal crease above the thigh diamond)
    # (outline in front-view X, Z; notched over the legs' thigh diamond, whose
    # top point sits at about (0.135, 1.035))
    fx = [(1.151, 0.099), (1.151, fl_x(fl, body, 1.151) - 0.014), (1.080, fl_x(fl, body, 1.080) - 0.016),
          (1.010, fl_x(fl, body, 1.010) - 0.017), (0.990, 0.180), (1.056, 0.1345), (1.000, 0.104), (1.030, 0.091)]
    outline = L.ccw([(x, z) for z, x in fx])
    crease = lambda h, z: 0.0042 + 0.0028 * max(0.0, 1.0 - abs((h - 0.112) - (1.151 - z) * 0.62) / 0.03)  # noqa: E731
    black.add(L.conform_plate(body, "front", outline, thickness=crease, gap=PANEL_T0, res=0.008, bevel=0.0015))

    # --- feather plates over the buttock (back-09), between back lapel and tasset
    feathers(ctx, black, gold)

    obs = [
        suit.build("RX_Waist_HipPanel_L", coll, "Suit", 40),
        gold.build("RX_Waist_HipGold_L", coll, "Gold", 30),
        gdark.build("RX_Waist_HipGoldDark_L", coll, "GoldDark", 30),
        black.build("RX_Waist_Feathers_L", coll, "Black", 32),
    ]
    for ob in obs:
        if ob is not None:
            L.mirror_x(ob)


def fl_x(path, body, z):
    r = body_radial(body, path.theta(z), z)
    return (r[0] + r[1] * LAPEL_LIFT).x


def feathers(ctx, black, gold):
    """Rows of overlapping pointed plates on the buttock, pointing down and in
    (herringbone, back-09); the plate nearest the lapel in each row sits on a
    slightly larger gold plate so it reads gold-edged."""
    body = ctx.body
    rows = [  # (y centre px, gap, x centres px) in back-09; upper rows overlap lower ones
        (702, 0.0175, [446, 417]),
        (774, 0.0150, [452, 422, 393]),
        (846, 0.0125, [447, 418, 389, 360]),
    ]
    lapel_x = lambda y: 425 + (300 - 425) * (y - 650) / (820 - 650)  # noqa: E731
    for y, gap, xs in rows:
        outer = min(x for x in xs if not (x < lapel_x(y) + 10 and y < 820))
        for x in xs:
            if x < lapel_x(y) + 10 and y < 820:
                continue
            d = Vector((0.30, 1.0, 0.0)).normalized()  # px: down and toward the centre
            nrm = Vector((-d.y, d.x, 0.0))
            Lh, Wh = 50.0, 14.5
            c = Vector((x, y, 0.0))
            pts_px = [c - d * Lh, c + nrm * Wh - d * Lh * 0.30, c + nrm * Wh * 0.55 + d * Lh * 0.55, c + d * Lh * 1.12,
                      c - nrm * Wh * 0.55 + d * Lh * 0.55, c - nrm * Wh - d * Lh * 0.30]
            outline = L.ccw([R.back(p.x, p.y) for p in pts_px])
            black.add(L.conform_plate(body, "back", outline, thickness=0.0038, gap=gap, res=0.012, bevel=0.0014))
            if x == outer:
                rim = L.ccw(L.offset_outline(outline, 0.0035))
                gold.add(L.conform_plate(body, "back", rim, thickness=0.0030, gap=gap - 0.0012, res=0.012, bevel=0.0010))


# ------------------------------------------------------------------ entry
def _report(coll):
    import os

    if not os.environ.get("RX_WAIST_DEBUG"):
        return
    rows = []
    for ob in coll.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            rows.append((len(ob.data.loop_triangles), ob.name))
    for n, name in sorted(rows, reverse=True):
        print("[waist] %7d %s" % (n, name))
    print("[waist] total %d" % sum(n for n, _ in rows))


def build(ctx):
    coll = ctx.coll("waist")
    C = Contour(ctx.body)
    belt(ctx, coll, C)
    tasset(ctx, coll, "front")
    tasset(ctx, coll, "back")
    hips(ctx, coll)
    _report(coll)
