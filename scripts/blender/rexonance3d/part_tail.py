"""Scorpion tail (suit's LEFT side, +X only): a segmented black-lacquer
metasoma rising from a socket on the upper back, arching over behind the left
shoulder and hanging a hooked crystal stinger outside the shoulder.

Read off the sheet (see README for the mapping):
  front-10  arch: rising leg X ~0.15 (Z 1.70-1.82), crest Z ~1.915 at X ~0.30,
            falling leg X ~0.50 (Z 1.80-1.72); collar Z 1.59-1.75; blade tip
            ~(0.49, 1.41); barbs: a large one up/inward, a small one up/outward.
  right-07  depth: rising leg Y ~0.10-0.13, crest Y ~0.17, falling leg
            Y ~0.28 (left-08 says 0.34; right-07 decides depth).
  back-09   agrees with front-10 on X/Z; the root vanishes behind the fan.
On every sheet the gold chevrons sit centred on the visible face and point
DOWN on both legs, like roof tiles: on the rising leg and the crest each
segment's proximal crown laps over the segment below it (V toward the root),
on the falling leg each distal crown laps over the next (V toward the tip);
the keystone segment at the crest carries both. A crown is a four-point edge
(dorsal, ventral, both flanks) trimmed by a raised, bevelled gold band. The
black shells are tiled with inset diamond plates (the sheet's glossy scale
plates); every segment carries a pair of long crystal fins on its dorsal side,
swept toward the tip.

Animation contract
  RX_Tail_Pivot00..NN  empties, each parented to the previous one (Pivot00 at
  the socket), located at the joint centre on the axis, identity rotation.
  Every mesh is a leaf child of its segment's pivot; the stinger hangs from
  the last pivot. Custom properties on each pivot:
    rx_bend_axis       local unit vector (Blender axes; the pivots carry no
                       rotation, so local = world) about which the joint flexes
                       in the plane of the arch
    rx_side_axis       local unit vector for side-to-side sway
    rx_bend_axis_gltf, rx_side_axis_gltf
                       the same vectors in glTF axes (x, z, -y)
    rx_segment         index;  rx_joint_radius  tail radius at the joint (m)
  Crown tabs lap ~2-4 cm over a narrow neck, so a few degrees of rotation
  either way never opens a joint.
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
    (0.121, 0.120, 1.540),
    (0.134, 0.136, 1.608),
    (0.142, 0.133, 1.683),
    (0.148, 0.125, 1.753),
    (0.157, 0.121, 1.813),
    (0.178, 0.128, 1.858),
    (0.213, 0.145, 1.891),
    (0.256, 0.164, 1.911),
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
BLADE_DIR = 25.0           # deg: blade width direction

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


def zig_slope(th, amps):
    """Mean |d zig / d th| either side of th (radians^-1)."""
    eps = 1e-4
    a = (zig(th, amps) - zig(th - eps, amps)) / eps
    b = (zig(th + eps, amps) - zig(th, amps)) / eps
    return 0.5 * (abs(a) + abs(b))


# ----------------------------------------------------------------- geometry
def lattice_shell(path, s_lo, s_hi, radius, M=8, R=9, t=0.0024, th0=0.0, inset=None, uv_v=None):
    """Closed hollow tube between the curves s_lo(th) and s_hi(th) along the
    path, its outside tiled with diamond plates (rings alternate by half a
    column). radius(s, th) is the outer radius; the inside is offset by t.
    R must be odd so both end rings hold the vertex angles th0 + k 2pi/M.
    inset(s) -> True insets that plate (thickness, depth) for a groove."""
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
            uv = ((th - th0) / (2 * math.pi), v if uv_v is None else uv_v(s))
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
        pick = [f for f in plates if inset[2](sum(info[v][1] for v in f.verts) / 4.0)]
        if pick:
            bmesh.ops.inset_individual(bm, faces=pick, thickness=th_, depth=dp_, use_even_offset=True,
                                       use_interpolate=True)
    bm.normal_update()
    return bm


def edge_band(path, s_rim, radius, amps, A, n=8, th0=0.0, w=0.016, h=0.0042, e=0.0018, t=0.0024,
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
        m = zig_slope(th - th0, amps) * A / max(rho, 1e-6)
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


def fin_spine(root, along, out, length, rise0, rise1, embed=0.007, steps=18, curl=0.0):
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


def swept_fin(root, along, out, lean, chord, sweep, height, thick=0.0050, bevel=0.0013, embed=0.007, n=14):
    """Crystal fin standing on a surface like a swept shark fin: its root chord
    (`chord` m) lies along `along` from `root`, the tip sits `sweep` m further
    along and `height` m out; convex leading edge, concave trailing edge (a
    claw). `lean` (rad) tilts the fin plane about `along` (splay). Bevelled
    prism; UV v = 0 at the root, 1 at the tip."""
    along = Vector(along).normalized()
    out = Vector(out)
    out = (out - along * out.dot(along)).normalized()
    side = along.cross(out)
    out3 = out * math.cos(lean) + side * math.sin(lean)
    tip = Vector((sweep, height))
    lead = [_bez(Vector((0.0, 0.0)), Vector((0.18 * sweep, 0.92 * height)), tip, i / n) for i in range(n + 1)]
    trail = [_bez(Vector((chord, 0.0)), Vector((0.72 * sweep, 0.10 * height)), tip, i / n) for i in range(n + 1)]
    pts2 = [Vector((chord, -embed)), Vector((0.0, -embed))] + lead + list(reversed(trail[:-1]))
    mid = Vector((0.5 * chord, -embed))
    cy = (tip - mid).normalized()
    cx = Vector((cy.y, -cy.x))
    loc = [((q - mid).dot(cx), (q - mid).dot(cy)) for q in pts2]
    xs = [q[0] for q in loc]
    ys = [q[1] for q in loc]
    bm = L.prism(loc, thick, bevel=bevel, bevel_seg=1, centered=True,
                 uv_bounds=((min(xs), max(xs)), (min(ys), max(ys))))
    X3 = along * cx.x + out3 * cx.y
    Y3 = along * cy.x + out3 * cy.y
    origin = Vector(root) + along * mid.x + out3 * mid.y
    L.transform(bm, L.frame(origin, X3, Y3))
    bm.normal_update()
    return bm


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
def _rhomb(a, b, ph):
    """Radius of a rhombus with half-diagonals a (ph = 0) and b (ph = 90 deg)."""
    return 1.0 / (abs(math.cos(ph)) / a + abs(math.sin(ph)) / b)


def build_stinger(coll, path, s_j, r_end, piv, ploc):
    """Gold V-cone collar: a funnel over the end of the last segment whose rim
    rises in two tall horns on the barb sides and dips front and back, closing
    downward into a flat sheath whose faces end in V points lying on the
    blade (front-10: ~0.14 m across the horns, Z 1.61-1.77). Below it the
    fat hooked crystal blade (~0.10 m wide, convex inner edge, tip Z ~1.41)
    and two crescent barbs in the plane STING_DIR (large one up/inward to
    ~0.11 m off the axis, small one up/outward)."""
    P, T, N, B = path.at(s_j)
    up = -T

    def hdir(deg):
        v = Vector((math.cos(math.radians(deg)), math.sin(math.radians(deg)), 0.0))
        return (v - T * v.dot(T)).normalized()

    w = hdir(STING_DIR)            # barb plane
    p = T.cross(w).normalized()
    wb = hdir(BLADE_DIR)           # blade width direction
    pb = T.cross(wb).normalized()

    def th_of(v):
        return math.atan2(v.dot(B), v.dot(N))

    th_w = th_of(w)
    X = hdir(0.0)
    Y = hdir(90.0)
    th_X = th_of(X)
    th_Y = th_of(Y)
    Lc = 0.110                     # joint -> tips of the V plates
    A_up = 0.050

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
            return 0.057 + 0.017 * min(-u / 0.45, 1.0)
        a = 0.057 - 0.017 * _smooth(u)
        b = max(0.057 - 0.046 * _smooth(u / 0.75), 0.0245)
        return a * b / math.sqrt((b * x) ** 2 + (a * y) ** 2 + 1e-12)

    bm = lattice_shell(path, s_lo, s_hi, radius, M=8, R=9, t=0.003, th0=th_X)
    collar = L.from_bmesh(bm, "RX_Tail_Stinger_Collar", coll, "Gold", angle=38.0)
    _parent(collar, piv, ploc)

    # blade: ridged hexagonal section, convex inner edge, tip hooking back out
    O = path.at(s_j + 0.020)[0]
    Lb = 0.275
    spine, dirs = [], []
    for i in range(49):
        t = i / 48.0
        off = -0.020 * math.sin(math.pi * t ** 0.9) + 0.016 * max(0.0, (t - 0.62) / 0.38) ** 2
        spine.append(O + T * (Lb * t) + wb * off)
        dirs.append(wb)

    def bw(t):
        if t < 0.22:
            return 0.060 + 0.050 * _smooth(t / 0.22)
        q = (t - 0.22) / 0.78
        return 0.110 * max(1.0 - q ** 1.45, 0.0) ** 0.80

    bm = crystal_blade(spine, dirs, bw, thick=0.40, n_sec=6)
    blade = L.from_bmesh(bm, "RX_Tail_Stinger_Blade", coll, "Crystal", angle=30.0)
    L.tint(blade, pink=0.30, sparkle=0.7, edge=0.7)

    barbs = [blade]
    for sgn, s_off, reach, rise, bow, wid in ((-1.0, 0.072, 0.075, 0.145, 0.066, 0.036),
                                              (1.0, 0.076, 0.080, 0.088, 0.064, 0.026)):
        th = th_w + (math.pi if sgn < 0 else 0.0)
        root = path.point(s_j + s_off, th, radius(s_j + s_off, th) * 0.45)
        out = w * sgn
        p0 = root
        c = root + out * bow + up * (0.08 * rise)
        p1 = root + out * reach + up * rise
        spine, dirs = [], []
        n = 24
        for i in range(n + 1):
            t = i / n
            q = _bez(p0, c, p1, t)
            dq = (c - p0) * (2 * (1 - t)) + (p1 - c) * (2 * t)
            spine.append(q)
            dirs.append(p.cross(dq).normalized())
        bm = crystal_blade(spine, dirs, lambda t, wd=wid: wd * (0.70 + 0.30 * math.sin(math.pi * min(t / 0.45, 1.0))) * (1.0 - t) ** 0.62,
                           thick=0.30, n_sec=4)
        ob = L.from_bmesh(bm, "RX_Tail_Stinger_Barb%s" % ("In" if sgn < 0 else "Out"), coll, "Crystal", angle=30.0)
        L.tint(ob, pink=0.35, sparkle=0.6, edge=0.7)
        barbs.append(ob)
    crystal = L.join(barbs, "RX_Tail_Stinger_Blade")
    _parent(crystal, piv, ploc)


# ----------------------------------------------------------------- socket
def build_socket(ctx, coll, path, s_j0, r0):
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

    def radius(s, th):
        u = (s - (s_exit - 0.03)) / max(s_j0 - (s_exit - 0.03), 1e-6)
        return _lerp(0.064, 0.036, _smooth(u) ** 0.7)

    bm = lattice_shell(path, lambda th: s_exit - 0.03, lambda th: s_j0 + 0.004, radius, M=8, R=5, t=0.003,
                       inset=(0.0016, 0.0008, lambda s: True))
    L.from_bmesh(bm, "RX_Tail_Socket_Boot", coll, "Gold", angle=25.0)

    # plate footprint seen from the back, around the exit
    h0 = P.x
    z0 = P.z - 0.012
    outline = [(h0, z0 + 0.075), (h0 - 0.050, z0 + 0.030), (h0 - 0.046, z0 - 0.035), (h0, z0 - 0.070),
               (h0 + 0.046, z0 - 0.035), (h0 + 0.050, z0 + 0.030)]
    outline = L.densify(outline, 0.012)
    bm = L.conform_plate(body, "back", outline, thickness=0.006, gap=0.004)
    L.from_bmesh(bm, "RX_Tail_Socket_Plate", coll, "Black", angle=30.0)
    rim = L.conform_strip(body, "back", outline + [outline[0]], 0.008, thickness=0.0045, gap=0.0085)
    L.from_bmesh(rim, "RX_Tail_Socket_Rim", coll, "Gold", angle=30.0)


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
        vis = lambda s, sa=sa, sb=sb, ln=ln: (sa - 0.6 * ln) < s < (sb + 0.02 * ln)
        bm = lattice_shell(path, s_lo, s_hi, radius, M=M_FACETS, R=RINGS, t=SHELL_T, inset=(0.0020, 0.0012, vis))
        shell = L.from_bmesh(bm, "RX_Tail_Seg%02d_Shell" % k, coll, "Black", angle=62.0)
        _parent(shell, piv, ploc)

        bands = []
        if prox == "crown":
            bm = edge_band(path, s_lo, radius, TAB_AMPS, A, n=M_FACETS, t=SHELL_T, toward=-1.0)
            bands.append(L.from_bmesh(bm, "RX_Tail_Seg%02d_CrownP" % k, coll, "Gold", angle=30.0))
        if dist == "crown":
            bm = edge_band(path, s_hi, radius, TAB_AMPS, A, n=M_FACETS, t=SHELL_T, toward=1.0)
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
                sr = s_hi(th)
                sf = sr - 0.55 * 0.016
                lift = 0.0
            elif prox == "crown":
                sr = s_lo(th)
                sf = sr + 0.55 * 0.016
                lift = 0.0
            else:
                sf = sa + 0.35 * ln
                lift = 0.0
            P, T, N, B = path.at(sf)
            d = N * math.cos(th) + B * math.sin(th)
            e = T.cross(d)
            lean = math.radians(FIN_LEAN + 8.0 * (jit - 0.5))
            d2 = d * math.cos(lean) + e * (sgn * math.sin(lean))
            root = path.point(sf, th, radius(sf, th) + lift)
            size = (1.0, 0.84)[(k + (sgn < 0)) % 2] * (0.92 + 0.16 * jit)
            flen = (0.060 + 0.105 * bump) * size
            fwid = (0.024 + 0.020 * bump) * size
            spine, dirs = fin_spine(root, T, d2, flen, 21.0 + 6.0 * jit, -13.0, embed=0.008)
            bm = crystal_blade(spine, dirs,
                               lambda t, fw=fwid: fw * (0.78 + 0.22 * math.sin(math.pi * min(t / 0.35, 1.0))) * (1.0 - t) ** 0.70,
                               thick=0.24, n_sec=4)
            ob = L.from_bmesh(bm, "RX_Tail_Seg%02d_Fin%s" % (k, "A" if sgn > 0 else "B"), coll, "Crystal", angle=30.0)
            L.tint(ob, pink=0.10 + 0.30 * bump, sparkle=0.5, edge=0.6)
            fins.append(ob)
        fin = L.join(fins, "RX_Tail_Seg%02d_Fins" % k)
        _parent(fin, piv, ploc)

    piv, ploc = pivots[N_SEG]
    build_stinger(coll, path, s_joint, radii[-1], piv, ploc)
    build_socket(ctx, coll, path, joints[0], radii[0])

    tris = 0
    for o in coll.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    print("[tail] path %.3f m, %d triangles" % (path.length, tris))
    for k, s in enumerate(joints):
        P = path.at(s)[0]
        print("[tail] joint %2d s=%.3f at (%.3f, %.3f, %.3f)" % (k, s, P.x, P.y, P.z))
