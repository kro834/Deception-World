"""Scorpion tail (suit's LEFT side, +X only): a segmented black-lacquer
metasoma rising from a socket on the upper back, arching over behind the left
shoulder and hanging a hooked crystal stinger outside the shoulder.

Read off the sheet (README mapping; checked by tracing the medial axis of the
tail in front-10, right-07 and back-09):
  front-10  rising leg X ~0.15 (Z 1.70-1.82), crest Z ~1.915 at X ~0.30,
            falling leg X ~0.50; collar Z 1.59-1.77, ~0.14 m across its
            horns; blade ~0.10 m wide, tip ~(0.49, 1.41); a large barb up and
            inward, a small one up and outward. Tube ~0.072 m across.
  right-07  depth: rising leg Y ~0.11, crest Y ~0.19, falling leg Y ~0.28
            (left-08 draws everything ~5 cm further back; right-07 decides).
  back-09   agrees with front-10 on X/Z; the root vanishes behind the fan.
Twelve segments. On every sheet the gold chevrons sit centred on the visible
face and point DOWN on both legs, like roof tiles: on the rising leg and the
crest each segment's proximal crown laps over the segment below it (V toward
the root), on the falling leg each distal crown laps over the next (V toward
the tip); the keystone segment at the crest carries both. A crown is a
four-point edge (dorsal, both flanks, ventral) that flares out over the next
segment's neck, trimmed by a raised, ridged gold band. The black shells are
tiled with grooved, domed diamond scale plates. Each segment carries a pair of
ridged crystal fins growing out of its crown near the dorsal line, swept
toward the tip; the largest sit on the crest's outer shoulder.
Stinger: a gold V-cone collar (GoldDark body, bright raised Gold borders)
whose rim rises in four horns and dips on the faces, its front and back plates
running down to points on the blade; a fat crystal sickle blade (convex inner
edge, tip hooking slightly outward and back, as all four views draw it) and
two crescent barbs. Socket: a gold boot in a gold-rimmed black plate.

Animation contract
  RX_Tail_Pivot00..12  empties, each parented to the previous one (Pivot00 at
  the socket, Pivot12 the stinger joint), located on the axis at the joint,
  identity rotation, parent inverse = identity (local translation = offset
  from the parent joint). Every mesh is a leaf child of its segment's pivot
  (matrix_parent_inverse = pivot inverse, so it stays where it was built);
  the stinger hangs from Pivot12. Custom properties on each pivot:
    rx_bend_axis       local unit vector (Blender axes; pivots carry no
                       rotation, so local = world) about which the joint flexes
                       in the plane of the arch: + opens the curl (stinger
                       swings up and out), - curls it toward the shoulder
    rx_side_axis       local unit vector for side-to-side sway
    rx_bend_axis_gltf, rx_side_axis_gltf
                       the same vectors in glTF axes (x, z, -y)
    rx_segment         index;  rx_joint_radius  tail radius at the joint (m)
  Crown tabs lap 2-4 cm over a narrow neck: tested at +-4 deg on every joint
  (bend and side) without opening a joint; ~1.5-2.5 deg per joint with a
  phase lag along the chain gives a living sway that keeps the stinger clear
  of the shoulder.
"""

import math
from bisect import bisect_right

import bmesh
import bpy
from mathutils import Matrix, Vector

import rx_lib as L

# ----------------------------------------------------------------- centreline
# World metres. The first point sits inside the back (the socket hides it);
# STING_JOINT marks the joint between the last segment and the stinger; the
# points after it continue down the stinger axis.
CTRL = [
    (0.108, 0.088, 1.478),
    (0.121, 0.112, 1.540),
    (0.134, 0.125, 1.608),
    (0.145, 0.119, 1.683),
    (0.153, 0.110, 1.753),
    (0.162, 0.107, 1.813),
    (0.181, 0.116, 1.858),
    (0.213, 0.137, 1.891),
    (0.256, 0.159, 1.911),
    (0.303, 0.187, 1.918),
    (0.351, 0.211, 1.912),
    (0.399, 0.235, 1.893),
    (0.442, 0.257, 1.862),
    (0.475, 0.272, 1.818),
    (0.494, 0.280, 1.765),
    (0.500, 0.284, 1.705),   # STING_JOINT
    (0.502, 0.287, 1.640),
    (0.503, 0.290, 1.580),
]
STING_JOINT = 15

N_SEG = 12                 # segments between the socket and the stinger
KEYSTONE = 7               # segments < KEYSTONE lap root-ward, > KEYSTONE tip-ward
SOCKET_S = 0.060           # arc length (m) of joint 0 (the socket)
R_ROOT, R_END = 0.040, 0.032
STING_DIR = 40.0           # deg: collar horns / barb plane, from +X toward +Y
BLADE_DIR = 30.0           # deg: blade width direction

M_FACETS = 8               # diamond plates around a shell
RINGS = 9
TAB = 0.48                 # crown tab length / segment length
TAB_AMPS = (1.0, 0.85, 0.55, 0.85)   # dorsal, +B flank, ventral, -B flank
NECK = 0.28                # hidden neck length / segment length
SHELL_T = 0.0024
FIN_THETA = 20.0           # deg either side of the dorsal line
FIN_LEAN = 14.0            # deg the fin planes splay apart


def _smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def _lerp(a, b, t):
    return a + (b - a) * t


def _hash(i):
    """Deterministic 0..1 jitter."""
    x = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


# ----------------------------------------------------------------- path frames
class Path:
    """Arc-length parametrised centreline with rotation-minimising frames whose
    N points to the outside of the arch (the tail's dorsal side)."""

    def __init__(self, ctrl, n=900):
        pts = L.catmull_rom([Vector(p) for p in ctrl], 16)
        pts = L.resample(pts, n)
        fr = L.rmf(pts, up=(0.0, 0.0, 1.0))
        top = max(range(n), key=lambda i: pts[i].z)
        T, N, B = fr[top]
        up = Vector((0.0, 0.0, 1.0))
        up = (up - T * up.dot(T)).normalized()
        a = math.atan2(up.dot(B), up.dot(N))
        ca, sa = math.cos(a), math.sin(a)
        self.P = pts
        self.T = [f[0] for f in fr]
        self.N = [(f[1] * ca + f[2] * sa).normalized() for f in fr]
        self.B = [self.T[i].cross(self.N[i]).normalized() for i in range(n)]
        self.S = L.arc_lengths(pts)
        self.length = self.S[-1]

    def s_of_point(self, p):
        p = Vector(p)
        i = min(range(len(self.P)), key=lambda k: (self.P[k] - p).length_squared)
        return self.S[i]

    def at(self, s):
        S = self.S
        if s <= 0.0:
            return self.P[0] + self.T[0] * s, self.T[0], self.N[0], self.B[0]
        if s >= S[-1]:
            return self.P[-1] + self.T[-1] * (s - S[-1]), self.T[-1], self.N[-1], self.B[-1]
        i = bisect_right(S, s) - 1
        f = (s - S[i]) / max(S[i + 1] - S[i], 1e-12)
        P = self.P[i].lerp(self.P[i + 1], f)
        T = self.T[i].lerp(self.T[i + 1], f).normalized()
        N = self.N[i].lerp(self.N[i + 1], f)
        N = (N - T * N.dot(T)).normalized()
        return P, T, N, T.cross(N).normalized()

    def point(self, s, th, rho):
        P, T, N, B = self.at(s)
        return P + (N * math.cos(th) + B * math.sin(th)) * rho


# ----------------------------------------------------------------- crown edge
def zig(th, amps):
    """Triangle wave: peaks amps[k] at k * 90 deg (k = 0 dorsal, 1 the +B flank,
    2 ventral, 3 the -B flank), zero in the valleys at 45 + k * 90 deg."""
    q = th / (math.pi / 2.0)
    k = int(math.floor(q + 0.5))
    d = abs(q - k)
    return amps[k % 4] * (1.0 - 2.0 * d)


# ----------------------------------------------------------------- geometry
def lattice_shell(path, s_lo, s_hi, radius, M=8, R=9, t=0.0024, th0=0.0, inset=None):
    """Closed hollow tube between the curves s_lo(th) and s_hi(th) along the
    path, its outside tiled with diamond plates (rings alternate by half a
    column). radius(s, th) is the outer radius; the inside is offset by t.
    R must be odd so both end rings hold the vertex angles th0 + k 2pi/M.
    inset = (thickness, depth, pick(s), dome): plates whose centre s passes
    pick(s) are inset for a groove and their centres poked out by dome."""
    assert R % 2 == 1
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    dth = 2.0 * math.pi / M
    outer, inner, info = [], [], {}
    for i in range(R):
        v = i / (R - 1)
        ro, ri = [], []
        for j in range(M):
            th = th0 + (j + 0.5 * (i % 2)) * dth
            s = _lerp(s_lo(th), s_hi(th), v)
            rr = radius(s, th)
            P, T, N, B = path.at(s)
            d = N * math.cos(th) + B * math.sin(th)
            a = bm.verts.new(P + d * rr)
            b = bm.verts.new(P + d * max(rr - t, rr * 0.5))
            uv = ((th - th0) / (2 * math.pi), v)
            info[a] = (uv, s)
            info[b] = (uv, s)
            ro.append(a)
            ri.append(b)
        outer.append(ro)
        inner.append(ri)

    def faces(rings, flip):
        quads, tris = [], []
        for i in range(R - 2):
            for j in range(M):
                if i % 2 == 0:
                    q = (rings[i][j], rings[i + 1][j], rings[i + 2][j], rings[i + 1][j - 1])
                else:
                    q = (rings[i][j], rings[i + 1][(j + 1) % M], rings[i + 2][j], rings[i + 1][j])
                quads.append(tuple(reversed(q)) if flip else q)
        for j in range(M):
            for f in ((rings[0][j], rings[0][(j + 1) % M], rings[1][j]),
                      (rings[R - 2][j], rings[R - 1][(j + 1) % M], rings[R - 1][j])):
                tris.append(tuple(reversed(f)) if flip else f)
        return quads, tris

    oq, ot = faces(outer, False)
    iq, it = faces(inner, True)
    plates = [bm.faces.new(f) for f in oq]
    for f in ot + iq + it:
        bm.faces.new(f)
    for ring_o, ring_i in ((outer[0], inner[0]), (outer[-1], inner[-1])):
        for j in range(M):
            k = (j + 1) % M
            bm.faces.new((ring_o[j], ring_o[k], ring_i[k], ring_i[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = info[lp.vert][0]
    if inset:
        th_, dp_ = inset[0], inset[1]
        dome = inset[3] if len(inset) > 3 else 0.0
        pick = [f for f in plates if inset[2](sum(info[v][1] for v in f.verts) / 4.0)]
        if pick:
            bmesh.ops.inset_individual(bm, faces=pick, thickness=th_, depth=dp_, use_even_offset=True,
                                       use_interpolate=True)
            if dome > 0.0:
                # raise each plate's centre: domed scales, rounder silhouette
                bmesh.ops.poke(bm, faces=pick, offset=dome, use_relative_offset=False)
    bm.normal_update()
    return bm


def edge_band(path, s_rim, radius, n=8, th0=0.0, w=0.016, h=0.0042, e=0.0018, t=0.0024,
              sink=0.0024, lip=0.0007, toward=1.0):
    """Raised gold trim riding the zigzag rim s_rim(th) of a shell, sampled at
    the shell's n vertex angles so it follows the plates exactly: a ridged bar
    (two roof facets that catch the light on one side) w wide square to the
    edge, h proud of the shell, its outer lip wrapping over the rim.
    toward=+1: the shell lies at s < rim (a distal crown); -1: the shell lies at
    s > rim (a proximal crown)."""
    bm = bmesh.new()
    rings = []
    for k in range(n):
        th = th0 + 2.0 * math.pi * k / n
        sr = s_rim(th)
        rho = radius(sr, th)
        eps = 1e-3
        m = 0.5 * (abs(sr - s_rim(th - eps)) + abs(s_rim(th + eps) - sr)) / eps / max(rho, 1e-6)
        ws = w * math.sqrt(1.0 + m * m)
        ridge = -0.42 * ws
        prof = [(-ws, -sink), (-ws, 0.40 * h), (ridge, h), (e, 0.55 * h), (e, -(t + lip)),
                (-0.002, -(t + lip)), (-0.002, -sink)]
        ring = []
        for ds, dr in prof:
            s = sr + toward * ds
            ring.append(bm.verts.new(path.point(s, th, radius(s, th) + dr)))
        rings.append(ring)
    m = len(rings[0])
    for k in range(n):
        a, b = rings[k], rings[(k + 1) % n]
        for p in range(m):
            q = (p + 1) % m
            bm.faces.new((a[p], a[q], b[q], b[p]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (0.5, 0.5)
    bm.normal_update()
    return bm


def crystal_blade(spine, side_dirs, width, thick=0.38, n_sec=4):
    """Crystal shard swept along `spine` (root first): a rhombic (n_sec=4) or
    ridged hexagonal (n_sec=6) section whose long axis follows side_dirs[i];
    width(t) is the full width, thickness = thick * width (+0.6 mm).
    UV v runs 0 at the root to 1 at the tip."""
    if n_sec == 4:
        prof = [(0.5, 0.0), (0.0, 0.5), (-0.5, 0.0), (0.0, -0.5)]
    else:
        prof = [(0.5, 0.0), (0.16, 0.5), (-0.16, 0.5), (-0.5, 0.0), (-0.16, -0.5), (0.16, -0.5)]

    def sc(t):
        w = max(width(t), 0.0006)
        return (w, w * thick + 0.0006 * (1.0 - t))

    bm = L.sweep(spine, prof, scale=sc, normals=side_dirs)
    return bm


def fin_spine(root, along, out, length, rise0, rise1, embed=0.007, steps=18):
    """Spine of a swept fin in the (along, out) plane: leaves the surface at
    rise0 deg above `along`, curls to rise1 at the tip; starts `embed` below
    the surface. Returns (points, width directions in the plane)."""
    along = Vector(along).normalized()
    out = Vector(out)
    out = (out - along * out.dot(along)).normalized()
    p = Vector(root) - out * embed
    pts = [p.copy()]
    dirs = []
    step = (length + embed) / steps
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(_lerp(rise0, rise1, t ** 0.8))
        d = along * math.cos(a) + out * math.sin(a)
        if i < steps:
            p = p + d * step
            pts.append(p.copy())
        dirs.append(-along * math.sin(a) + out * math.cos(a))
    return pts, dirs[: len(pts)]


def _bez(p0, c, p1, t):
    return p0 * ((1 - t) ** 2) + c * (2 * (1 - t) * t) + p1 * (t * t)


# ----------------------------------------------------------------- objects
def _parent(ob, pivot, pivot_loc):
    ob.parent = pivot
    ob.matrix_parent_inverse = Matrix.Translation(Vector(pivot_loc)).inverted()


def _gltf(v):
    return (float(v[0]), float(v[2]), float(-v[1]))


def _pivot(name, loc, parent, parent_loc, coll, bend, side, index, radius):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.03
    coll.objects.link(e)
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = Vector(loc) - Vector(parent_loc)
    else:
        e.location = Vector(loc)
    bend = Vector(bend).normalized()
    side = Vector(side).normalized()
    e["rx_bend_axis"] = [float(x) for x in bend]
    e["rx_side_axis"] = [float(x) for x in side]
    e["rx_bend_axis_gltf"] = list(_gltf(bend))
    e["rx_side_axis_gltf"] = list(_gltf(side))
    e["rx_segment"] = int(index)
    e["rx_joint_radius"] = float(radius)
    return e


def _end_factor(u, kind, tab):
    """Radius factor near one end of a segment; u = distance from that end in
    segment lengths (u < 0 beyond the end). kind 'crown' flares and runs on
    into the tabs; 'neck' pinches into the hidden neck."""
    if kind == "crown":
        if u < 0.0:
            return 1.07 + 0.30 * min(-u / max(tab, 1e-6), 1.2)
        if u < 0.38:
            return 1.07 - 0.07 * _smooth(u / 0.38)
        return 1.0
    if u <= 0.0:
        return 0.80
    if u < 0.45:
        return 0.80 + 0.20 * _smooth(u / 0.45)
    return 1.0


# ----------------------------------------------------------------- stinger
def build_stinger(coll, path, s_j, piv, ploc):
    """Gold V-cone collar over the end of the last segment: its rim rises in
    four horns on the diagonals and dips on the faces (every view sees a
    V-notch with horns at its edges), and narrows into a flat sheath whose
    front and back plates end in points lying on the blade (front-10: ~0.14 m
    across the horns, Z 1.59-1.77). Below it the fat hooked crystal blade
    (~0.11 m wide in front-10, convex inner edge, tip Z ~1.41) and two
    crescent barbs in the plane STING_DIR (large one up/inward ~0.09 m off
    the axis, small one up/outward)."""
    _P, T, N, B = path.at(s_j)
    up = -T

    def hdir(deg):
        v = Vector((math.cos(math.radians(deg)), math.sin(math.radians(deg)), 0.0))
        return (v - T * v.dot(T)).normalized()

    w = hdir(STING_DIR)            # barb plane
    p = T.cross(w).normalized()
    wb = hdir(BLADE_DIR)           # blade width direction

    def th_of(v):
        return math.atan2(v.dot(B), v.dot(N))

    th_w = th_of(w)
    X = hdir(0.0)
    Y = hdir(90.0)
    th_X = th_of(X)
    th_Y = th_of(Y)
    Lc = 0.110                     # joint -> tips of the V plates
    A_up = 0.060

    def s_lo(th):
        # horns on the four diagonals, V-notch dips on the faces
        return s_j - 0.010 - A_up * zig(th - th_X - math.pi / 4.0, (1.0, 1.0, 1.0, 1.0))

    def s_hi(th):
        # front/back (+-Y) V plates reach down onto the blade; the +-X sides
        # are cut away high up where the blade's edges come out
        q = ((th - th_Y) / math.pi) % 1.0
        tri = 1.0 - 2.0 * min(q, 1.0 - q)
        return s_j + 0.014 + (Lc - 0.014) * tri

    def radius(s, th):
        u = (s - s_j) / Lc
        d = path.at(s)
        dv = d[2] * math.cos(th) + d[3] * math.sin(th)
        x, y = dv.dot(X), dv.dot(Y)
        if u < 0.0:
            return 0.061 + 0.019 * min(-u / 0.45, 1.0)
        a = 0.061 - 0.020 * _smooth(u)
        b = max(0.061 - 0.050 * _smooth(u / 0.75), 0.0285)
        ell = a * b / math.sqrt((b * x) ** 2 + (a * y) ** 2 + 1e-12)
        rho = 1.0 / (abs(x) / a + abs(y) / b + 1e-12)       # rhombus: ridge down each V plate
        return _lerp(ell, max(rho, b), 0.75 * _smooth((u - 0.10) / 0.55))

    bm = lattice_shell(path, s_lo, s_hi, radius, M=16, R=9, t=0.003, th0=th_X)
    collar = L.from_bmesh(bm, "RX_Tail_Stinger_Collar", coll, "GoldDark", angle=38.0)
    _parent(collar, piv, ploc)
    # bright raised borders: the horned upper rim and the V edges of the plates
    rims = []
    for s_rim, tw in ((s_lo, -1.0), (s_hi, 1.0)):
        bm = edge_band(path, s_rim, radius, n=16, th0=th_X, w=0.015, h=0.0040, t=0.003, toward=tw)
        rims.append(L.from_bmesh(bm, "RX_Tail_Stinger_CollarRim", coll, "Gold", angle=30.0))
    rim = L.join(rims, "RX_Tail_Stinger_CollarRim")
    _parent(rim, piv, ploc)

    # blade: ridged hexagonal section, convex inner edge, tip hooking back out
    O = path.at(s_j + 0.020)[0]
    Lb = 0.275
    spine, dirs = [], []
    for i in range(49):
        t = i / 48.0
        off = -0.013 * math.sin(math.pi * t ** 0.9) + 0.012 * max(0.0, (t - 0.62) / 0.38) ** 2
        spine.append(O + T * (Lb * t) + wb * off)
        dirs.append(wb)

    def bw(t):
        if t < 0.25:
            return 0.060 + 0.070 * _smooth(t / 0.25)
        q = (t - 0.25) / 0.75
        return 0.130 * max(1.0 - q ** 1.40, 0.0) ** 0.78

    bm = crystal_blade(spine, dirs, bw, thick=0.32, n_sec=6)
    blade = L.from_bmesh(bm, "RX_Tail_Stinger_Blade", coll, "Crystal", angle=30.0)
    L.tint(blade, pink=0.30, sparkle=0.7, edge=0.7)

    barbs = [blade]
    for sgn, s_off, reach, rise, bow, lift, wid in ((-1.0, 0.084, 0.050, 0.165, 0.068, 0.040, 0.036),
                                                    (1.0, 0.090, 0.066, 0.100, 0.072, 0.026, 0.028)):
        th = th_w + (math.pi if sgn < 0 else 0.0)
        root = path.point(s_j + s_off, th, radius(s_j + s_off, th) - 0.008)
        out = w * sgn
        p0 = root
        c = root + out * bow + up * lift
        p1 = root + out * reach + up * rise
        spine, dirs = [], []
        n = 24
        for i in range(n + 1):
            t = i / n
            q = _bez(p0, c, p1, t)
            dq = (c - p0) * (2 * (1 - t)) + (p1 - c) * (2 * t)
            spine.append(q)
            dirs.append(p.cross(dq).normalized())
        bm = crystal_blade(spine, dirs, lambda t, wd=wid: wd * max(math.sin(math.pi * (0.1 + 0.9 * t) ** 0.9), 0.0) ** 0.8,
                           thick=0.28, n_sec=4)
        ob = L.from_bmesh(bm, "RX_Tail_Stinger_Barb%s" % ("In" if sgn < 0 else "Out"), coll, "Crystal", angle=30.0)
        L.tint(ob, pink=0.35, sparkle=0.6, edge=0.7)
        barbs.append(ob)
    crystal = L.join(barbs, "RX_Tail_Stinger_Blade")
    _parent(crystal, piv, ploc)


# ----------------------------------------------------------------- socket
def build_socket(ctx, coll, path, s_j0):
    """Static mount on the upper back: a gold boot flaring out of a
    gold-rimmed black plate; the first segment's crown laps over its top."""
    body = ctx.body
    s_exit = 0.0
    for i in range(300):
        s = i * 0.0005
        q = path.at(s)[0]
        loc, n = body.closest(q)
        if (q - loc).dot(n) > 0.0:
            s_exit = s
            break
    P, T, N, B = path.at(s_exit)

    s_base = s_exit - 0.050

    def radius(s, th):
        u = (s - s_base) / max(s_j0 - s_base, 1e-6)
        return _lerp(0.066, 0.0365, _smooth(min(max(u, 0.0), 1.0)) ** 0.75)

    bm = lattice_shell(path, lambda th: s_base, lambda th: s_j0 + 0.004, radius, M=8, R=7, t=0.004)
    L.from_bmesh(bm, "RX_Tail_Socket_Boot", coll, "Gold", angle=40.0)

    # gold-rimmed black mount plate around the boot, seen from the back. It
    # floats just above whatever back armour the torso part has laid there
    # (measured at build time; the torso builds before the tail).
    h0 = P.x - 0.002
    z0 = P.z - 0.012
    outline = [(h0, z0 + 0.068), (h0 - 0.042, z0 + 0.026), (h0 - 0.040, z0 - 0.032), (h0, z0 - 0.064),
               (h0 + 0.040, z0 - 0.032), (h0 + 0.042, z0 + 0.026)]
    gap = 0.004 + _armour_standoff(body, outline)
    outline = L.densify(outline, 0.010)
    bm = L.conform_plate(body, "back", outline, thickness=0.006, gap=gap)
    L.from_bmesh(bm, "RX_Tail_Socket_Plate", coll, "Black", angle=30.0)
    rim = L.conform_strip(body, "back", outline + [outline[0]], 0.008, thickness=0.0045, gap=gap + 0.0045)
    L.from_bmesh(rim, "RX_Tail_Socket_Rim", coll, "Gold", angle=30.0)


def _armour_standoff(body, outline, prefix="RX_Torso"):
    """Largest height (m, capped at 2 cm) by which meshes already built by the
    torso part stand off the body inside `outline` (view 'back')."""
    from mathutils.bvhtree import BVHTree
    obs = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(prefix)]
    if not obs:
        return 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in obs:
        tmp = bmesh.new()
        tmp.from_object(o, dg)
        tmp.transform(o.matrix_world)
        me = bpy.data.meshes.new("_rx_tail_tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    xs = [p[0] for p in outline]
    zs = [p[1] for p in outline]
    best = 0.0
    for i in range(9):
        for j in range(9):
            x = _lerp(min(xs), max(xs), (i + 0.5) / 9)
            z = _lerp(min(zs), max(zs), (j + 0.5) / 9)
            if not L.point_in_polygon([(x, z)], outline)[0]:
                continue
            o, d = Vector((x, 3.0, z)), Vector((0.0, -1.0, 0.0))
            hb = body.ray(o, d)
            ha = tree.ray_cast(o, d, 10.0)
            if hb and ha[0] is not None:
                h = ha[0].y - hb[0].y
                if 0.0 < h < 0.02:
                    best = max(best, h)
    return best


# ----------------------------------------------------------------- build
def build(ctx):
    coll = ctx.coll("tail")
    path = Path(CTRL)
    s_joint = path.s_of_point(CTRL[STING_JOINT])
    s0 = SOCKET_S
    # segment joints: lengths shrink slightly toward the tip
    w = [1.0 - 0.20 * (k / (N_SEG - 1)) for k in range(N_SEG)]
    tot = sum(w)
    joints = [s0]
    for k in range(N_SEG):
        joints.append(joints[-1] + (s_joint - s0) * w[k] / tot)
    radii = [_lerp(R_ROOT, R_END, (k / (N_SEG - 1)) ** 0.9) for k in range(N_SEG)]

    pivots = []
    prev, prev_loc = None, None
    for k in range(N_SEG + 1):
        P, T, N, B = path.at(joints[k])
        r = radii[min(k, N_SEG - 1)]
        piv = _pivot("RX_Tail_Pivot%02d" % k, P, prev, prev_loc, coll, bend=B, side=N, index=k, radius=r)
        pivots.append((piv, P.copy()))
        prev, prev_loc = piv, P.copy()

    for k in range(N_SEG):
        sa, sb = joints[k], joints[k + 1]
        ln = sb - sa
        r = radii[k]
        A = TAB * ln
        piv, ploc = pivots[k]
        prox = "crown" if k <= KEYSTONE else "neck"
        dist = "crown" if (KEYSTONE <= k < N_SEG - 1) else "neck"
        tabr = TAB

        def radius(s, th, sa=sa, ln=ln, r=r, prox=prox, dist=dist, tabr=tabr):
            u = (s - sa) / ln
            return r * _end_factor(u, prox, tabr) * _end_factor(1.0 - u, dist, tabr)

        if prox == "crown":
            s_lo = lambda th, sa=sa, A=A: sa - A * zig(th, TAB_AMPS)
        else:
            s_lo = lambda th, sa=sa, ln=ln: sa - NECK * ln
        if dist == "crown":
            s_hi = lambda th, sb=sb, A=A: sb + A * zig(th, TAB_AMPS)
        else:
            s_hi = lambda th, sb=sb, ln=ln: sb + NECK * ln
        top = sb + (A if dist == "crown" else 0.02 * ln)
        vis = lambda s, sa=sa, ln=ln, top=top: (sa - 0.6 * ln) < s < top
        bm = lattice_shell(path, s_lo, s_hi, radius, M=M_FACETS, R=RINGS, t=SHELL_T, inset=(0.0020, 0.0012, vis, 0.0016))
        shell = L.from_bmesh(bm, "RX_Tail_Seg%02d_Shell" % k, coll, "Black", angle=62.0)
        _parent(shell, piv, ploc)

        bands = []
        if prox == "crown":
            bm = edge_band(path, s_lo, radius, n=M_FACETS, t=SHELL_T, toward=-1.0)
            bands.append(L.from_bmesh(bm, "RX_Tail_Seg%02d_CrownP" % k, coll, "Gold", angle=30.0))
        if dist == "crown":
            bm = edge_band(path, s_hi, radius, n=M_FACETS, t=SHELL_T, toward=1.0)
            bands.append(L.from_bmesh(bm, "RX_Tail_Seg%02d_CrownD" % k, coll, "Gold", angle=30.0))
        if bands:
            band = L.join(bands, "RX_Tail_Seg%02d_Chevron" % k)
            _parent(band, piv, ploc)

        # paired crystal fins near the dorsal line, growing out of the crown
        # (the highest point of a segment, so they clear the next crown) and
        # swept toward the tip along the arch; front-10 / back-09 see them
        # face-on as the sheet's crest of blades.
        tk = k / (N_SEG - 1)
        bump = math.exp(-((tk - 0.70) / 0.26) ** 2)
        fins = []
        for sgn in (1.0, -1.0):
            jit = _hash(k * 2 + (sgn < 0))
            th = sgn * math.radians(FIN_THETA + 6.0 * (jit - 0.5))
            if dist == "crown":
                sf = s_hi(th) - 0.55 * 0.016
            elif prox == "crown":
                sf = s_lo(th) + 0.55 * 0.016
            else:
                sf = sa + 0.35 * ln
            P, T, N, B = path.at(sf)
            d = N * math.cos(th) + B * math.sin(th)
            e = T.cross(d)
            lean = math.radians(FIN_LEAN + 8.0 * (jit - 0.5))
            d2 = d * math.cos(lean) + e * (sgn * math.sin(lean))
            root = path.point(sf, th, radius(sf, th))
            size = (1.0, 0.84)[(k + (sgn < 0)) % 2] * (0.92 + 0.16 * jit)
            flen = (0.060 + 0.105 * bump) * size
            fwid = (0.024 + 0.020 * bump) * size
            spine, dirs = fin_spine(root, T, d2, flen, 21.0 + 6.0 * jit, -13.0, embed=0.008)
            bm = crystal_blade(spine, dirs,
                               lambda t, fw=fwid: fw * (0.78 + 0.22 * math.sin(math.pi * min(t / 0.35, 1.0))) * (1.0 - t) ** 0.70,
                               thick=0.26, n_sec=6)
            ob = L.from_bmesh(bm, "RX_Tail_Seg%02d_Fin%s" % (k, "A" if sgn > 0 else "B"), coll, "Crystal", angle=30.0)
            L.tint(ob, pink=0.10 + 0.30 * bump, sparkle=0.5, edge=0.6)
            fins.append(ob)
        fin = L.join(fins, "RX_Tail_Seg%02d_Fins" % k)
        _parent(fin, piv, ploc)

    piv, ploc = pivots[N_SEG]
    build_stinger(coll, path, s_joint, piv, ploc)
    build_socket(ctx, coll, path, joints[0])

    tris = 0
    for o in coll.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    print("[tail] %d segments + stinger, path %.3f m, %d triangles" % (N_SEG, path.length, tris))
