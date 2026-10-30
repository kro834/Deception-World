"""Rexonance pauldrons: star medallion, layered sunburst fan, crystal back
shell, pendant and black cap.

Authored on the suit's LEFT (+X, "_L") and mirrored to the right with
rx_lib.mirror_x(). Pieces (per side):

  Medallion  segmented thick gold bezel, black ring, thin gold inner ring,
             black centre disc and a four-point star jewel (Gem) + glint, on
             a black boss that seats it on the cap. Faces outward-forward
             (MED_N) so it reads round in front-10 and as an upright ellipse
             in right-07 / left-08.
  Rays       gold sunburst teeth radiating from under the bezel.
  Fan        broad sickle blades (crystal with gold rims, black lacquer with
             gold edges, solid gold accents) in three layers. Each petal lies
             in a plane parallel to the medallion around FAN_C and curls back
             (-MED_N) toward its tip like a feather; the tips are placed from
             front-10 pixels, the curl from right-07 / left-08.
  Back       a faceted crystal shell in a gold frame on the back of the
             shoulder (back-09 kite / back-03 crescent) with a rosette of
             blades fanning out from under it, and feathers hanging over the
             outer side of the deltoid.
  Pendant    gold four-point star under the medallion on a short gold stem.
  Cap        black lacquer shell over the deltoid with a gold lower rim, so no
             undersuit shows between the blades.

Everything is built in world coordinates (identity transforms).
"""

import math

import bmesh
from mathutils import Vector

import rx_lib as L
import rx_ref as R

# ------------------------------------------------------------------ frame
# Medallion: front-10 centre (661.7, 349.2) -> X 0.214, Z 1.548. right-07 /
# left-08 put it at Y -0.04, inside our deltoid, so it sits on the front-outer
# face of the pauldron instead (front-10 decides). Normal: a compromise between
# front-10 (circle) and the side sheets (ellipse, width/height ~0.5).
MED_C = Vector((0.222, -0.108, 1.549))          # centre of the bezel's front face
MED_N = Vector((0.50, -0.862, 0.07)).normalized()
MED_R = 0.0711                                   # outer bezel radius (53.5 px)
SHOULDER_C = Vector((0.192, 0.004, 1.530))       # inside the deltoid (ray origin for the cap)
FAN_C = Vector((0.205, -0.030, 1.548))           # common centre of the petal planes
CAP_GAP, CAP_THICK = 0.010, 0.007


def med_axes():
    """(ex, ey, ez): ex outward-back, ey up, ez = MED_N (toward the viewer)."""
    m = L.frame_from_normal(MED_C, MED_N, (0.0, 0.0, 1.0))
    ex = Vector((m[0][0], m[1][0], m[2][0]))
    ey = Vector((m[0][1], m[1][1], m[2][1]))
    ez = Vector((m[0][2], m[1][2], m[2][2]))
    return ex, ey, ez


# ------------------------------------------------------------------ small mesh helpers
def _new_bm():
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    return bm


def _face(bm, verts, uvs=None):
    try:
        f = bm.faces.new(verts)
    except ValueError:
        return None
    if uvs is not None:
        lay = bm.loops.layers.uv.verify()
        for loop, uv in zip(f.loops, uvs):
            loop[lay].uv = uv
    return f


def _loft(bm, rings, closed_ring=True, cap0=True, cap1=True, vs=None):
    """Connect rings (lists of BMVerts of equal length) into a tube."""
    lay = bm.loops.layers.uv.verify()
    n = len(rings[0])
    m = len(rings)
    for i in range(m - 1):
        a, b = rings[i], rings[i + 1]
        va = vs[i] if vs else i / (m - 1)
        vb = vs[i + 1] if vs else (i + 1) / (m - 1)
        for j in range(n if closed_ring else n - 1):
            j2 = (j + 1) % n
            f = _face(bm, (a[j], a[j2], b[j2], b[j]))
            if f:
                for loop, uv in zip(f.loops, ((j / n, va), (j2 / n, va), (j2 / n, vb), (j / n, vb))):
                    loop[lay].uv = uv
    if cap0:
        _face(bm, list(reversed(rings[0])))
    if cap1:
        _face(bm, list(rings[-1]))


def _orient_outward(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()


def _chamfer_rect(w0, w1, h0, h1, c):
    """CCW octagon (a, b): a from w0..w1, b from h0..h1, corners chamfered by c."""
    c = min(c, (w1 - w0) * 0.45, (h1 - h0) * 0.45)
    return [(w0, h0 + c), (w0 + c, h0), (w1 - c, h0), (w1, h0 + c), (w1, h1 - c), (w1 - c, h1), (w0 + c, h1), (w0, h1 - c)]


def _smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


# ------------------------------------------------------------------ clearance
BODY = None          # rx_lib.Body, set by build()
ARM_TOP_Z = 1.535    # below this the arm armour (braids ~2 cm proud) wraps the suit


def clearance(p):
    return 0.034 if p.z < ARM_TOP_Z else 0.022


ARM_AXIS = (Vector(R.LM["shoulder"]), Vector(R.LM["elbow"]))
DRAPE_CLEAR = 0.027  # blades hanging in front of the arm: just clear of the braids (<= 0.021)
LOW_Z = 1.51         # petals whose tips hang below this drape over the arm armour
LAYER_STEP = 0.016   # clearance added per stacking layer (a little over one blade thickness)
WIDTH_K = 0.92       # global blade width scale (front-10 blades are 25-35 px wide)
RIM_ROOTS = True     # front petals radiate from under the medallion bezel


def _axis_point(p):
    a, b = ARM_AXIS
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return a + ab * t


def radial_dir(p):
    """Unit direction from the upper-arm axis to p and the distance."""
    u = p - _axis_point(p)
    r = u.length
    return (u / r if r > 1e-9 else Vector((1.0, 0.0, 0.0))), r


def snap_need(p, add=0.0, u=None):
    """Signed distance to move p along u (radial from the upper-arm axis) so
    it sits exactly clearance(p) + add off the suit; None where the ray
    leaves the shoulder / arm."""
    if BODY is None:
        return None
    A = _axis_point(p)
    if u is None:
        u, r_p = radial_dir(p)
    else:
        r_p = (p - A).dot(u)
    hit = BODY.ray(A, u, 1.0)
    if hit is None:
        return None
    r_s = (Vector(hit[0]) - A).length
    if r_s > 0.20:
        return None
    return r_s + clearance(p) + add - r_p


def push_out(p, add=0.0, u=None):
    """Displacement that lifts world point p to at least clearance(p) + add
    off the suit: radially from the upper-arm axis (shoulder joint -> elbow)
    along u (default: p's own radial direction), measured with a ray cast,
    which stays well defined in the armpit crease where nearest-surface
    normals flip."""
    zero = Vector((0.0, 0.0, 0.0))
    if BODY is None:
        return zero
    A = _axis_point(p)
    if u is None:
        u, r_p = radial_dir(p)
    else:
        r_p = (p - A).dot(u)
    c = clearance(p) + add
    hit = BODY.ray(A, u, 1.0)
    if hit is None:
        return zero
    r_s = (Vector(hit[0]) - A).length
    if r_s > 0.20:      # the ray left the arm/shoulder (e.g. toward the head)
        loc, n = BODY.closest(p)
        n = Vector(n)
        d = (p - Vector(loc)).dot(n)
        return n * (c - d) if d < c else zero
    need = r_s + c - r_p
    return u * need if need > 0 else zero


# ------------------------------------------------------------------ blades
def leaf_shape(root_w=0.50, peak=0.40, tip_p=0.85):
    """Width profile 0..1 along the blade: broad body, sharp tip."""
    def g(t):
        return (root_w + (1.0 - root_w) * math.sin(min(t / peak, 1.0) * math.pi / 2)) * (1.0 - t) ** tip_p

    mx = max(g(i / 200.0) for i in range(201))
    return lambda t: g(t) / mx


def blade_pieces(root, tip, face_hint, width, kind="crystal", skew=0.42, sickle=0.07, bow=0.08,
                 thick=0.0075, edge=0.0012, rim_w=0.0060, rim=("L", "R"), n_len=16,
                 wshape=None, bot=0.6, rim_lift=0.0013, clear_from=0.12, clear_add=0.0,
                 clear_ramp=0.28, clear_max=0.045, snap=False, tip_lift=0.0):
    """A curved sickle blade from `root` to `tip` (world), face normal ~ face_hint.

    Local frame: y along the chord, z = face normal, x = y cross z. The spine
    bows sideways by `sickle` (fraction of the length; > 0 bulges toward -x so
    the tip turns toward +x) and arches toward +z by `bow`. Diamond section:
    a crisp centre ridge `thick` high, `edge` at the outline. Gold rims run
    along both edges and meet at the tip. Returns [(bm, family)], body first;
    UV v runs root (0) -> tip (1).
    """
    root, tip = Vector(root), Vector(tip)
    chord = tip - root
    Lb = chord.length
    yax = chord.normalized()
    fn = Vector(face_hint)
    fn = fn - yax * fn.dot(yax)
    if fn.length < 1e-6:
        fn = yax.orthogonal()
    fn.normalize()
    xax = yax.cross(fn)
    M = L.frame(root, xax, yax)  # z = x cross y = fn
    ws = wshape or leaf_shape()
    T = [i / (n_len - 1) for i in range(n_len)]

    def spine(t):
        return Vector((sickle * Lb * (t * t - t) * 2.5 * (1.0 + 0.6 * t), t * Lb, 0.0))

    def dz(t):
        return bow * Lb * math.sin(math.pi * min(1.0, t ** 0.8))

    sp = [spine(t) for t in T]
    nrm = []
    for i in range(n_len):
        a = sp[max(i - 1, 0)]
        b = sp[min(i + 1, n_len - 1)]
        t = (b - a).normalized()
        nrm.append(Vector((-t.y, t.x, 0.0)))  # left (+x for a +y spine)
    wl = [width * ws(t) * skew for t in T]
    wr = [width * ws(t) * (1.0 - skew) for t in T]
    th = [max(edge * 1.3, thick * (1.0 - 0.5 * t)) for t in T]
    cols = (-1.0, 0.0, 1.0)

    # clearance: lift whole stations (keeping the blade's thickness) so the
    # blade drapes over the cap / arm armour instead of cutting into them
    R3 = M.to_3x3()
    Ri = R3.transposed()
    D = []
    # one push direction per station: its own radial direction when it is
    # clearly off the arm axis, else that of the blade's outer half
    far_u = None
    for i in range(n_len - 1, -1, -1):
        w = M @ Vector((sp[i].x, sp[i].y, dz(T[i])))
        u, r = radial_dir(w)
        if r > 0.05:
            far_u = u
            break
    for i, t in enumerate(T):
        best = Vector((0.0, 0.0, 0.0))
        wc = M @ Vector((sp[i].x, sp[i].y, dz(t)))
        u, r = radial_dir(wc)
        if r < 0.05 and far_u is not None:
            u = (u * (r / 0.05) + far_u * (1.0 - r / 0.05)).normalized()
        if snap:
            # sit exactly on the offset surface (no part below it), so the
            # stacked rings of a draped set never cut through each other
            need = None
            for off in (0.0, 0.5 * wl[i], wl[i] + rim_w * 0.2, -0.5 * wr[i], -wr[i] - rim_w * 0.2):
                q = sp[i] + nrm[i] * off
                w = M @ Vector((q.x, q.y, dz(t) - th[i] * bot - rim_lift))
                n_ = snap_need(w, clear_add, u)
                if n_ is not None and (need is None or n_ > need):
                    need = n_
            need = 0.0 if need is None else max(-clear_max, min(clear_max, need))
            need += tip_lift * _smoothstep(0.55, 1.0, t)
            D.append(u * need * _smoothstep(clear_from, clear_from + clear_ramp, t))
            continue
        for off in (0.0, 0.5 * wl[i], wl[i] + rim_w * 0.2, -0.5 * wr[i], -wr[i] - rim_w * 0.2):
            q = sp[i] + nrm[i] * off
            w = M @ Vector((q.x, q.y, dz(t) - th[i] * bot - rim_lift))
            d = push_out(w, clear_add, u)
            if d.length > best.length:
                best = d
        if best.length > clear_max:
            best = best * (clear_max / best.length)
        D.append(best * _smoothstep(clear_from, clear_from + clear_ramp, t))
    # max-filter then smooth, so a local push is not averaged away
    Dm = []
    for i in range(n_len):
        c = [D[k] for k in (max(i - 1, 0), i, min(i + 1, n_len - 1))]
        Dm.append(D[i] if snap else max(c, key=lambda v: v.length))
    D = [(Dm[max(i - 1, 0)] + Dm[i] * 2.0 + Dm[min(i + 1, n_len - 1)]) / 4.0 for i in range(n_len)]
    Dl = [Ri @ d for d in D]

    def pos(i, s, top):
        off = s * (wl[i] if s >= 0 else wr[i])
        p = sp[i] + nrm[i] * off
        a = 1.0 - abs(s)
        z = (edge + (th[i] - edge) * a) if top else -(edge + (th[i] * bot - edge) * a)
        return Vector((p.x, p.y, z + dz(T[i]))) + Dl[i]

    bm = _new_bm()
    lay = bm.loops.layers.uv.verify()
    top = [[bm.verts.new(pos(i, s, True)) for s in cols] for i in range(n_len - 1)]
    btm = [[bm.verts.new(pos(i, s, False)) for s in cols] for i in range(n_len - 1)]
    tipv = bm.verts.new(sp[-1] + Vector((0.0, 0.0, dz(1.0))) + Dl[-1])
    U = (0.0, 0.5, 1.0)
    for i in range(n_len - 2):
        v0, v1 = T[i], T[i + 1]
        for c in range(2):
            u0, u1 = U[c], U[c + 1]
            f = _face(bm, (top[i][c], top[i][c + 1], top[i + 1][c + 1], top[i + 1][c]))
            if f:
                for loop, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                    loop[lay].uv = uv
            f = _face(bm, (btm[i][c + 1], btm[i][c], btm[i + 1][c], btm[i + 1][c + 1]))
            if f:
                for loop, uv in zip(f.loops, ((u1, v0), (u0, v0), (u0, v1), (u1, v1))):
                    loop[lay].uv = uv
        _face(bm, (top[i][0], top[i + 1][0], btm[i + 1][0], btm[i][0]), ((0, v0), (0, v1), (0, v1), (0, v0)))
        _face(bm, (top[i + 1][2], top[i][2], btm[i][2], btm[i + 1][2]), ((1, v1), (1, v0), (1, v0), (1, v1)))
    i = n_len - 2
    for c in range(2):
        _face(bm, (top[i][c], top[i][c + 1], tipv), ((U[c], T[i]), (U[c + 1], T[i]), (0.5, 1.0)))
        _face(bm, (btm[i][c + 1], btm[i][c], tipv), ((U[c + 1], T[i]), (U[c], T[i]), (0.5, 1.0)))
    _face(bm, (top[i][0], tipv, btm[i][0]), ((0, T[i]), (0.5, 1), (0, T[i])))
    _face(bm, (tipv, top[i][2], btm[i][2]), ((0.5, 1), (1, T[i]), (1, T[i])))
    _face(bm, [top[0][2], top[0][1], top[0][0], btm[0][0], btm[0][1], btm[0][2]],
          [(1, 0), (0.5, 0), (0, 0), (0, 0), (0.5, 0), (1, 0)])
    _orient_outward(bm)
    L.transform(bm, M)
    fam = {"crystal": "Crystal", "black": "Black", "gold": "Gold", "dark": "GoldDark"}[kind]
    pieces = [(bm, fam)]

    for side in rim:
        sgn = 1.0 if side == "L" else -1.0
        wv = wl if side == "L" else wr
        rb = _new_bm()
        rings, vs = [], []
        for i in range(n_len - 1):
            t = T[i]
            w = max(wv[i], 1e-5)
            rw = min(rim_w * (1.0 - 0.5 * t ** 2), w * 0.85)
            s_in = max(0.0, 1.0 - rw / w)
            rh = edge + (th[i] - edge) * (1.0 - s_in) + rim_lift
            e = sp[i] + nrm[i] * (sgn * w)
            inward = -nrm[i] * sgn
            base = dz(t)
            ring = []
            for a, b in _chamfer_rect(-0.0007, rw, -rh, rh, min(0.0010, rh * 0.45)):
                p = e + inward * a
                ring.append(rb.verts.new(Vector((p.x, p.y, base + b)) + Dl[i]))
            if sgn < 0:
                ring.reverse()
            rings.append(ring)
            vs.append(t)
        tv = rb.verts.new(sp[-1] + Vector((0.0, 0.0, dz(1.0))) + Dl[-1])
        _loft(rb, rings, cap0=True, cap1=False, vs=vs)
        last = rings[-1]
        for j in range(len(last)):
            _face(rb, (last[j], last[(j + 1) % len(last)], tv))
        _orient_outward(rb)
        L.transform(rb, M)
        pieces.append((rb, "Gold"))
    return pieces


# ------------------------------------------------------------------ round parts
def _sector(r0, r1, a0, a1, h_in, h_out, z0, chamfer, n=8, crown=0.0035):
    """Annular sector (bezel segment) in the local xy plane: walls h_in (inner)
    and h_out (outer) high, joined by a convex polished top that bulges by
    `crown` above the straight slope, with chamfered shoulders."""
    bm = _new_bm()
    c = chamfer
    top = []
    k = 6
    for i in range(k + 1):
        t = i / k
        r = (r0 + c) + (r1 - c - (r0 + c)) * t
        h = (h_in + (h_out - h_in) * t) + crown * math.sin(math.pi * t)
        top.append((r, z0 + h))
    prof = [(r0, z0), (r1, z0), (r1, z0 + h_out - c)] + top[::-1] + [(r0, z0 + h_in - c)]
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in prof])
    _loft(bm, rings, cap0=True, cap1=True)
    _orient_outward(bm)
    return bm


def _ring_solid(r0, r1, z0, h, chamfer, seg=72, crown=0.0):
    """Closed ring with chamfered top edges; crown raises the middle of the top."""
    bm = _new_bm()
    c = chamfer
    rm = (r0 + r1) / 2
    prof = [(r0, z0), (r1, z0), (r1, z0 + h - c), (r1 - c, z0 + h), (rm, z0 + h + crown), (r0 + c, z0 + h), (r0, z0 + h - c)]
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in prof])
    n = len(prof)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(n):
            j2 = (j + 1) % n
            _face(bm, (a[j], a[j2], b[j2], b[j]))
    _orient_outward(bm)
    return bm


def _disc_solid(r, z0, h, dome=0.0, seg=64, chamfer=0.0008, r_back=None):
    """Disc with a chamfered top edge and optional dome; r_back makes the
    bottom a different radius (frustum boss)."""
    bm = _new_bm()
    rb = r if r_back is None else r_back
    prof = [(rb, z0), (r, z0 + h - chamfer), (r - chamfer, z0 + h)]
    for k in range(1, 4):
        rr = (r - chamfer) * (1 - k / 4)
        prof.append((rr, z0 + h + dome * (1 - (rr / r) ** 2)))
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((rr * ca, rr * sa, z)) for rr, z in prof])
    bc = bm.verts.new((0, 0, z0))
    tc = bm.verts.new((0, 0, z0 + h + dome))
    n = len(prof)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(n - 1):
            _face(bm, (a[j], a[j + 1], b[j + 1], b[j]))
        _face(bm, (b[0], a[0], bc))
        _face(bm, (a[-1], b[-1], tc))
    _orient_outward(bm)
    return bm


def _star(points, z0, height, back=0.0):
    """Faceted star: CCW outline (x, y) at z0, apex at the centre raised by
    `height` (ridges run to the outline's convex points); back apex at -back."""
    bm = _new_bm()
    ring = [bm.verts.new((x, y, z0)) for x, y in points]
    apex = bm.verts.new((0.0, 0.0, z0 + height))
    n = len(ring)
    for i in range(n):
        _face(bm, (ring[i], ring[(i + 1) % n], apex))
    if back > 0:
        bapex = bm.verts.new((0.0, 0.0, z0 - back))
        for i in range(n):
            _face(bm, (ring[(i + 1) % n], ring[i], bapex))
    else:
        _face(bm, list(reversed(ring)))
    _orient_outward(bm)
    uv = bm.loops.layers.uv.verify()
    R0 = max(math.hypot(x, y) for x, y in points)
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (0.5 + loop.vert.co.x / (2 * R0), 0.5 + loop.vert.co.y / (2 * R0))
    return bm


def star_outline(r_long, r_short, n_points=4, rot=0.0, r_inner=None):
    """Alternating long/short star outline with inner corners (CCW)."""
    pts = []
    m = n_points * 2
    ri = r_inner if r_inner is not None else r_short * 0.42
    for i in range(m):
        a = math.radians(rot + 360.0 * i / m)
        r = r_long if i % 2 == 0 else r_short
        pts.append((r * math.cos(a), r * math.sin(a)))
        a2 = math.radians(rot + 360.0 * (i + 0.5) / m)
        pts.append((ri * math.cos(a2), ri * math.sin(a2)))
    return pts


def _kite_star(tips, pinch=0.78):
    """Four-point star from 4 tips (CCW); inner corners at `pinch` x the
    midpoint of neighbouring tips (1.0 = straight-sided kite)."""
    pts = []
    n = len(tips)
    for i in range(n):
        a, b = Vector(tips[i]), Vector(tips[(i + 1) % n])
        pts.append(tuple(a))
        m = (a + b) * 0.5 * pinch
        pts.append((m.x, m.y))
    return pts


# ------------------------------------------------------------------ medallion
def medallion_pieces():
    """Medallion in its local frame (z = MED_N), z = 0 at the bezel's back.
    front-10: bezel r 53.5 px, bezel inner edge 40 px, inner gold ring
    29-32.5 px, star arms ~36 px (they cross the inner ring)."""
    out = []
    Rb = MED_R
    # black boss seating the medallion on the cap (the cap falls away under
    # the medallion's outer half)
    out.append((_disc_solid(Rb * 0.86, -0.050, 0.056, chamfer=0.002, seg=48, r_back=Rb * 0.70), "Black"))
    # thick gold bezel: 12 segments with thin dark gaps
    nseg = 12
    gap = math.radians(1.5)
    for i in range(nseg):
        a0 = 2 * math.pi * i / nseg + gap / 2 + math.radians(15)
        a1 = 2 * math.pi * (i + 1) / nseg - gap / 2 + math.radians(15)
        out.append((_sector(0.0525, Rb, a0, a1, 0.0185, 0.0135, 0.004, 0.0016, n=6), "Gold"))
    # recessed black ring, thin inner gold ring, black centre disc
    out.append((_ring_solid(0.0420, 0.0535, 0.004, 0.0080, 0.0008, seg=64), "Black"))
    out.append((_ring_solid(0.0384, 0.0434, 0.004, 0.0120, 0.0011, seg=64, crown=0.0007), "Gold"))
    out.append((_disc_solid(0.0390, 0.004, 0.0072, dome=0.0016, seg=48), "Black"))
    # centre (front-10): a faceted gold four-point cross whose arms cross the
    # inner ring, blue-white light rays on the diagonals (a smaller Gem star)
    # and a glowing jewel core (+ glint)
    diag = []
    for i in range(4):
        a = math.radians(45 + 90 * i)
        diag.append((0.0340 * math.cos(a), 0.0340 * math.sin(a)))
        a2 = math.radians(90 + 90 * i)
        diag.append((0.0042 * math.cos(a2), 0.0042 * math.sin(a2)))
    out.append((_star(diag, 0.0110, 0.0040, back=0.002), "Gem"))
    cross = []
    for i in range(4):
        a = math.radians(90 * i)
        r = 0.0478 if i % 2 else 0.0470
        cross.append((r * math.cos(a), r * math.sin(a)))
        a2 = math.radians(45 + 90 * i)
        cross.append((0.0085 * math.cos(a2), 0.0085 * math.sin(a2)))
    out.append((_star(cross, 0.0118, 0.0080, back=0.002), "Gold"))
    core = L.gem_round(0.0072, 0.0042, n=12, table=0.45)
    L.transform(core, L.frame((0.0, 0.0, 0.0185), (1, 0, 0), (0, 1, 0)))
    out.append((core, "Gem"))
    return out


def rays_pieces():
    """Gold sunburst teeth from under the bezel (local medallion frame)."""
    out = []
    spec = [  # (angle, length beyond the bezel, base width)
        (6, 0.034, 0.028), (30, 0.022, 0.022), (52, 0.030, 0.026), (75, 0.024, 0.022),
        (97, 0.032, 0.028), (122, 0.022, 0.022), (146, 0.026, 0.024), (205, 0.016, 0.020),
        (238, 0.022, 0.022), (270, 0.030, 0.026), (296, 0.024, 0.022), (318, 0.028, 0.026),
        (340, 0.024, 0.022),
    ]
    for ang, ln, w in spec:
        a = math.radians(ang)
        d = Vector((math.cos(a), math.sin(a), 0.0))
        side = Vector((-d.y, d.x, 0.0))
        r0 = MED_R - 0.011
        tip = d * (MED_R + ln)
        b0 = d * r0 + side * (w / 2)
        b1 = d * r0 - side * (w / 2)
        bm = _new_bm()
        z0 = -0.002
        v_tip = bm.verts.new((tip.x, tip.y, z0 + 0.002))
        v_b0 = bm.verts.new((b0.x, b0.y, z0))
        v_b1 = bm.verts.new((b1.x, b1.y, z0))
        v_r = bm.verts.new(((d * r0).x, (d * r0).y, z0 + 0.0115))
        v_bk = bm.verts.new(((d * r0).x, (d * r0).y, z0 - 0.004))
        _face(bm, (v_b0, v_r, v_tip))
        _face(bm, (v_r, v_b1, v_tip))
        _face(bm, (v_b1, v_bk, v_tip))
        _face(bm, (v_bk, v_b0, v_tip))
        _face(bm, (v_b0, v_bk, v_b1, v_r))
        _orient_outward(bm)
        out.append((bm, "Gold"))
    return out


# ------------------------------------------------------------------ pendant
# front-10: centre (672.5, 473.3), tips top 34 px, bottom 28 px, sides 22 px.
PEND_C = Vector((0.2285, -0.104, 1.3837))


def pendant_pieces():
    out = []
    ex, ey, ez = med_axes()
    n = (MED_N * 0.75 + Vector((0, -1, 0)) * 0.25 + Vector((0, 0, 0.12))).normalized()
    m = L.frame_from_normal(PEND_C, n, (0, 0, 1))
    tips = [(0.0285, 0.0), (0.0, 0.045), (-0.0300, 0.0), (0.0, -0.037)]
    bm = _star(_kite_star(tips, 0.74), 0.0, 0.0125, back=0.0065)
    L.transform(bm, m)
    out.append((bm, "Gold"))
    top = m @ Vector((0.0, 0.043, 0.002))
    start = MED_C - ez * 0.016 - ey * (MED_R - 0.010)
    mid = start.lerp(top, 0.5) + ez * 0.003
    bm = L.tube(L.catmull_rom([start, mid, top], 4), lambda t: 0.0030 * (1.0 - 0.3 * t), sides=8)
    out.append((bm, "Gold"))
    bead = L.disc(0.0042, 0.004, seg=12, dome=0.0015, matrix=L.frame_from_normal(top - n * 0.002, n, (0, 0, 1)))
    out.append((bead, "Gold"))
    return out


# ------------------------------------------------------------------ cap shell
def _cap_dir(th, el):
    return Vector((math.cos(el) * math.cos(th), math.cos(el) * math.sin(th), math.sin(el)))


def cap_point(body, th_deg, el_deg, lift=0.0):
    """Point on the cap's outer surface at (azimuth from +X toward +Y,
    elevation) seen from SHOULDER_C, plus its outward normal."""
    def hit(t, e):
        d = _cap_dir(math.radians(t), math.radians(e))
        h = body.ray(SHOULDER_C, d)
        return Vector(h[0]) if h else SHOULDER_C + d * 0.09

    p = hit(th_deg, el_deg)
    a = hit(th_deg + 3, el_deg) - hit(th_deg - 3, el_deg)
    b = hit(th_deg, el_deg + 3) - hit(th_deg, el_deg - 3)
    n = a.cross(b)
    if n.dot(p - SHOULDER_C) < 0:
        n = -n
    n.normalize()
    return p + n * (CAP_GAP + CAP_THICK + lift), n


def cap_pieces(body):
    """Black lacquer shell over the deltoid: rays from SHOULDER_C over an
    (azimuth, elevation) window, offset off the suit, gold rim on the lower edge."""
    nth, nel = 28, 14
    th0, th1 = math.radians(-112), math.radians(88)   # back edge stops short of the tail socket

    def el_range(th):
        f = abs(math.sin(th))
        lo = -13 + 9 * f
        # in front, run the lower edge down behind the medallion boss
        front = _smoothstep(math.radians(-35), math.radians(-75), th)
        lo = lo * (1.0 - front) + (-26.0) * front
        return math.radians(lo), math.radians(76 - 6 * f)

    def gap(i, j):
        # flare the lower edge out over the arm armour's top (outer side only)
        th = th0 + (th1 - th0) * i / (nth - 1)
        side = 1.0 - _smoothstep(math.radians(-30), math.radians(-70), th)
        return CAP_GAP + 0.014 * side * (1.0 - _smoothstep(0.0, 0.45, j / (nel - 1)))

    P = []
    for i in range(nth):
        th = th0 + (th1 - th0) * i / (nth - 1)
        e0, e1 = el_range(th)
        row = []
        for j in range(nel):
            el = e0 + (e1 - e0) * j / (nel - 1)
            d = _cap_dir(th, el)
            hit = body.ray(SHOULDER_C, d)
            row.append(Vector(hit[0]) if hit else SHOULDER_C + d * 0.09)
        P.append(row)
    N = []
    for i in range(nth):
        row = []
        for j in range(nel):
            a = P[min(i + 1, nth - 1)][j] - P[max(i - 1, 0)][j]
            b = P[i][min(j + 1, nel - 1)] - P[i][max(j - 1, 0)]
            n = a.cross(b)
            if n.dot(P[i][j] - SHOULDER_C) < 0:
                n = -n
            row.append(n.normalized())
        N.append(row)
    inner = [[P[i][j] + N[i][j] * gap(i, j) for j in range(nel)] for i in range(nth)]
    outer = [[P[i][j] + N[i][j] * (gap(i, j) + CAP_THICK) for j in range(nel)] for i in range(nth)]
    bm = _new_bm()
    vi = [[bm.verts.new(p) for p in row] for row in inner]
    vo = [[bm.verts.new(p) for p in row] for row in outer]
    for i in range(nth - 1):
        for j in range(nel - 1):
            _face(bm, (vo[i][j], vo[i + 1][j], vo[i + 1][j + 1], vo[i][j + 1]))
            _face(bm, (vi[i][j + 1], vi[i + 1][j + 1], vi[i + 1][j], vi[i][j]))
    for i in range(nth - 1):
        for j in (0, nel - 1):
            _face(bm, (vi[i][j], vi[i + 1][j], vo[i + 1][j], vo[i][j]))
    for j in range(nel - 1):
        for i in (0, nth - 1):
            _face(bm, (vi[i][j], vi[i][j + 1], vo[i][j + 1], vo[i][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    inward = [f for f in bm.faces if (f.calc_center_median() - SHOULDER_C).dot(f.normal) < 0]
    if len(inward) > len(bm.faces) * 0.5:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    pieces = [(bm, "Black")]
    path = [outer[i][0] for i in range(nth)]
    nn = [N[i][0] for i in range(nth)]
    prof = _chamfer_rect(-0.0005, 0.0045, -0.006, 0.006, 0.0012)
    pieces.append((L.sweep(path, [(b, a) for a, b in prof], normals=nn), "Gold"))
    return pieces


# ------------------------------------------------------------------ fan layout
def S(x, y):
    """front-10 pixel -> (X, Z)."""
    return R.front(x, y)


# Front fan petals. tip: front-10 pixel of the tip (suit's left; mostly the
# mirrored, clearer suit's-right drawing); rf: how far the tip curls back
# behind its plane (sets the depth seen in right-07 / left-08); z: plane offset
# along MED_N from FAN_C (layer); w: max width.
PETALS = [
    # back layer: long, curled further back (fills the side view's back edge)
    dict(tip=(768, 166), rf=0.040, z=-0.026, kind="black", w=0.054),
    dict(tip=(838, 252), rf=0.070, z=-0.026, kind="black", w=0.056),
    dict(tip=(866, 352), rf=0.085, z=-0.026, kind="crystal", w=0.058, pink=0.55),
    dict(tip=(856, 472), rf=0.085, z=-0.026, kind="crystal", w=0.054, pink=0.40),
    dict(tip=(842, 506), rf=0.075, z=-0.026, kind="black", w=0.050),
    # main ring (front-10 tips)
    dict(tip=(604, 204), rf=0.030, z=0.000, kind="black", w=0.044),
    dict(tip=(725, 152), rf=0.035, z=0.000, kind="crystal", w=0.058, pink=0.30),
    dict(tip=(802, 186), rf=0.060, z=0.000, kind="crystal", w=0.060, pink=0.45),
    dict(tip=(860, 322), rf=0.085, z=0.000, kind="crystal", w=0.064, pink=0.70),
    dict(tip=(842, 386), rf=0.080, z=0.000, kind="black", w=0.052),
    dict(tip=(836, 448), rf=0.075, z=0.000, kind="black", w=0.052),
    dict(tip=(864, 515), rf=0.085, z=0.000, kind="crystal", w=0.056, pink=0.30),
    dict(tip=(776, 516), rf=0.050, z=0.000, kind="black", w=0.048, drape=True),
    dict(tip=(742, 528), rf=0.040, z=-0.012, kind="crystal", w=0.046, pink=0.40, drape=True),
    dict(tip=(712, 510), rf=0.030, z=0.000, kind="black", w=0.044, drape=True),
    dict(tip=(632, 500), rf=0.020, z=0.004, kind="black", w=0.040, drape=True),
    # front accents (short)
    dict(tip=(756, 236), rf=0.012, z=0.028, kind="crystal", w=0.042, pink=0.25),
    dict(tip=(796, 280), rf=0.020, z=0.028, kind="gold", w=0.034),
    dict(tip=(800, 398), rf=0.020, z=0.028, kind="black", w=0.042),
    dict(tip=(750, 468), rf=0.015, z=0.028, kind="crystal", w=0.040, pink=0.35, drape=True),
]

# Feathers hanging over the outer side of the deltoid. root: cap (azimuth,
# elevation) in degrees; tip in world metres.
WRAP = []   # superseded by the side sunburst

# Side sunburst: the side sheets (left-08 / right-07) show the medallion
# facing the camera with blades radiating round it over the outer face of the
# shoulder. Blades rooted under the medallion's outer edge (cap azimuth /
# elevation SIDE_C) radiate in the side view (phi from back (+Y) toward up,
# in-plane length L), drape over the deltoid (clearance pass) and stand free
# where they leave it.
SIDE_C = (-14.0, 2.0)
SIDE_X = 0.310
SIDE = [
    dict(phi=50, L=0.170, kind="black", w=0.054),
    dict(phi=18, L=0.175, kind="crystal", w=0.056, pink=0.55),
    dict(phi=-14, L=0.170, kind="black", w=0.056),
    dict(phi=-46, L=0.170, kind="crystal", w=0.054, pink=0.40),
    dict(phi=-78, L=0.160, kind="black", w=0.050),
    # inner ring, shorter, on top
    dict(phi=34, L=0.110, kind="gold", w=0.032, layer=1),
    dict(phi=2, L=0.115, kind="crystal", w=0.040, pink=0.45, layer=1),
    dict(phi=-30, L=0.115, kind="gold", w=0.032, layer=1),
    dict(phi=-62, L=0.105, kind="black", w=0.038, layer=1),
]

# Back: crystal shell footprint in the back view (back-09 kite, suit's right
# mirrored): bottom, outer, top, inner corners as back-09 pixels.
SHELL_BACK = [(716, 400), (740, 330), (676, 274), (660, 352)]
SHELL_SCALE = 1.0

# Rosette fanning out from under the shell in a plane facing back (BACK_N);
# phi from the outward (+X) in-plane axis toward up; rf > 0 curls the tip
# toward the shoulder, and the clearance pass drapes the petals over it.
BACK_N = Vector((0.18, 0.96, 0.22)).normalized()
BACK = [
    dict(phi=-78, L=0.130, rf=0.020, kind="crystal", w=0.048, pink=0.5),
    dict(phi=-102, L=0.150, rf=0.025, kind="black", w=0.052),
    dict(phi=-126, L=0.120, rf=0.020, kind="crystal", w=0.046, pink=0.6),
    # inner ring, shorter, on top
    dict(phi=-90, L=0.095, rf=0.010, kind="gold", w=0.030, layer=1),
    dict(phi=-114, L=0.090, rf=0.010, kind="gold", w=0.030, layer=1),
]


def petal_root_tip(p):
    """Root and tip of a front petal: the tip lies on the petal plane
    (FAN_C + z ez) moved back by rf along -ez, and projects onto the given
    front-10 pixel."""
    ex, ey, ez = med_axes()
    X, Z = S(*p["tip"])
    c = FAN_C + ez * (p["z"] - p["rf"])
    # solve c + a ex + b ey = (X, ?, Z) in X and Z
    a11, a12, b1 = ex.x, ey.x, X - c.x
    a21, a22, b2 = ex.z, ey.z, Z - c.z
    det = a11 * a22 - a12 * a21
    a = (b1 * a22 - a12 * b2) / det
    b = (a11 * b2 - a21 * b1) / det
    tip = c + ex * a + ey * b
    d = (ex * a + ey * b).normalized()
    c0 = FAN_C + ez * p["z"]
    root = c0 + d * p.get("r0", 0.055)
    if p.get("rim", RIM_ROOTS) and not p.get("drape") and tip.z >= LOW_Z:
        # radiate from under the bezel: root behind the bezel's outer half,
        # deeper for the back layers
        dm = (tip - MED_C)
        dm = (dm - ez * dm.dot(ez)).normalized()
        root = MED_C + dm * (MED_R * 0.70) - ez * (0.018 + 0.5 * max(0.0, -p["z"]))
        return root, tip, ez
    if BODY is not None and not p.get("drape"):
        # start where the petal's line leaves the suit, so it emerges from
        # under the cap instead of running through the deltoid; petals that
        # hang down start higher so they leave the deltoid above the arm armour
        if tip.z < LOW_Z:
            # hangs over the outer side of the arm: root it on the upper-outer
            # cap (sunk under the shell) and let it drape down over the deltoid
            th = math.degrees(math.atan2(tip.y - SHOULDER_C.y, tip.x - SHOULDER_C.x))
            root, _n = cap_point(BODY, max(-30.0, min(55.0, th)), p.get("root_el", 34.0), lift=-0.014)
        else:
            dd = (tip - c0).normalized()
            h = BODY.ray(c0, dd, (tip - c0).length * 0.7)
            if h is not None and (Vector(h[1]).dot(dd) > 0.0):
                root = Vector(h[0]) - dd * 0.025   # root face buried in the suit
    if p.get("drape") and BODY is not None:
        # hangs in front of the upper arm: keep the front-10 X/Z of the tip,
        # put it a standoff in front of the arm, root it behind the
        # medallion's lower half
        h = BODY.hit("front", X, Z, smooth=0.012)
        if h is not None:
            loc, n = Vector(h[0]), Vector(h[1])
            tip = loc + n * (DRAPE_CLEAR + 0.006 + p.get("stand", 0.0) + 0.6 * max(0.0, p["z"]))
        root = (MED_C - ey * (MED_R * 0.62) - ez * (0.036 + 0.3 * max(0.0, -p["z"]))
                + ex * p.get("rx", 0.0))
    return root, tip, ez


def _blade_spec_pieces(root, tip, hint, p):
    kind = p["kind"]
    Lb = (tip - root).length
    rf = abs(p.get("rf", 0.03))
    bow = p.get("bow", 0.05 + 0.45 * rf / max(Lb, 1e-3))
    low = tip.z < LOW_Z
    layer = p.get("z", 0.0)
    if p.get("drape"):
        cf, add = 0.12, DRAPE_CLEAR - 0.034 + 0.004 * layer / 0.03   # root hidden in the medallion boss
        p = dict(p)
        p.setdefault("bow", 0.012)
    elif low:
        cf, add = 0.06, 0.007 + 0.26 * max(-0.026, min(0.03, layer))
    elif RIM_ROOTS and "tip" in p:
        # drape over the cap from the bezel, stacked by layer
        cf, add = 0.12, LAYER_STEP * max(0, 1 + round(layer / 0.027))
    else:
        cf, add = 9.0, 0.0   # clear of the arm: no push
    bow = p.get("bow", bow)
    pcs = blade_pieces(root, tip, hint, p["w"] * WIDTH_K, kind=kind, sickle=p.get("sickle", 0.10),
                       bow=bow, skew=p.get("skew", 0.42),
                       thick=p.get("thick", 0.0090 if kind == "crystal" else 0.0080),
                       rim=() if kind == "gold" else p.get("rim", ("L", "R")),
                       rim_w=p.get("rim_w", 0.0085 if kind == "crystal" else 0.0075),
                       clear_from=p.get("clear_from", cf),
                       clear_add=p.get("clear_add", add),
                       clear_ramp=p.get("clear_ramp", 0.22 if low and not p.get("drape") else 0.28),
                       clear_max=p.get("clear_max", 0.065 if low and not p.get("drape") else 0.045),
                       snap=p.get("snap", False), tip_lift=p.get("tip_lift", 0.0))
    tint = p.get("pink", 0.35)
    return [(bm, fam, tint if fam == "Crystal" else None) for bm, fam in pcs]


def _cap_at_back_view(body, X, Z):
    """Cap point whose back-view projection is (X, Z) (fixed-point search over
    the radial direction from SHOULDER_C), with its normal."""
    q = Vector((X, 0.10, Z))
    p, n = None, None
    for _ in range(5):
        d = q - SHOULDER_C
        th = math.degrees(math.atan2(d.y, d.x))
        el = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
        p, n = cap_point(body, th, el)
        q = q + Vector((X - p.x, 0.0, Z - p.z)) * 0.9
    return p, n


def shell_patch(body, nu=9, nv=9):
    """Grid of (point on the cap's outer surface, normal, u, v) over the
    back-view kite SHELL_BACK; u runs bottom->outer edge, v bottom->inner."""
    # back-09 pixels are the suit's right shoulder: mirror X to the left
    K = [Vector((-R.back(x, y)[0], R.back(x, y)[1])) for x, y in SHELL_BACK]
    cen = sum(K, Vector((0.0, 0.0))) / 4.0
    A, B, C, D = [cen + (k - cen) * SHELL_SCALE for k in K]
    grid = []
    for i in range(nu):
        u = i / (nu - 1)
        row = []
        for j in range(nv):
            v = j / (nv - 1)
            q = A * (1 - u) * (1 - v) + B * u * (1 - v) + C * u * v + D * (1 - u) * v
            p, n = _cap_at_back_view(body, q.x, q.y)
            row.append((p, n, u, v))
        grid.append(row)
    return grid


def shell_pieces(body):
    """Faceted crystal shell in a gold frame on the back of the shoulder."""
    grid = shell_patch(body)
    nu, nv = len(grid), len(grid[0])
    lift0 = 0.004
    ridge = 0.011
    bm = _new_bm()
    lay = bm.loops.layers.uv.verify()
    top, bot = [], []
    for i in range(nu):
        rt, rb = [], []
        for j in range(nv):
            p, n, u, v = grid[i][j]
            pyr = 1.0 - max(abs(u - v), abs(u + v - 1.0))
            rt.append(bm.verts.new(p + n * (lift0 + 0.003 + ridge * pyr)))
            rb.append(bm.verts.new(p + n * lift0))
        top.append(rt)
        bot.append(rb)

    def uvof(i, j):
        u, v = i / (nu - 1), j / (nv - 1)
        return ((u - v + 1) / 2, (u + v) / 2)

    for i in range(nu - 1):
        for j in range(nv - 1):
            # split each quad along the pyramid's ridges for crisp facets
            q = (top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])
            uq = (uvof(i, j), uvof(i + 1, j), uvof(i + 1, j + 1), uvof(i, j + 1))
            if i + j == nu - 2 and i != j:
                tris = ((0, 1, 3), (1, 2, 3))
            else:
                tris = ((0, 1, 2), (0, 2, 3))
            for t in tris:
                f = _face(bm, [q[k] for k in t])
                if f:
                    for loop, k in zip(f.loops, t):
                        loop[lay].uv = uq[k]
            _face(bm, (bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j]))
    edges = []
    edges.append([(i, 0) for i in range(nu)])
    edges.append([(nu - 1, j) for j in range(nv)])
    edges.append([(i, nv - 1) for i in reversed(range(nu))])
    edges.append([(0, j) for j in reversed(range(nv))])
    for e in edges:
        for (i0, j0), (i1, j1) in zip(e, e[1:]):
            _face(bm, (bot[i0][j0], bot[i1][j1], top[i1][j1], top[i0][j0]))
    _orient_outward(bm)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    pieces = [(bm, "Crystal", 0.55)]
    # gold frame: one sweep per edge, a little proud of the crystal
    prof = _chamfer_rect(-0.0050, 0.0060, -0.0060, 0.0060, 0.0016)
    for e in edges:
        path, nn = [], []
        for i, j in e:
            p, n, u, v = grid[i][j]
            path.append(p + n * (lift0 + 0.005))
            nn.append(n)
        d0 = (path[1] - path[0]).normalized()
        d1 = (path[-1] - path[-2]).normalized()
        path[0] = path[0] - d0 * 0.004
        path[-1] = path[-1] + d1 * 0.004
        pieces.append((L.sweep(path, prof, normals=nn), "Gold", None))
    return pieces


def back_frame(body):
    """Centre (shell centre on the cap), outward axis, up axis and normal of
    the back rosette."""
    grid = shell_patch(body, 3, 3)
    c = grid[1][1][0]
    n = BACK_N
    bo = Vector((1.0, 0.0, 0.0))
    bo = (bo - n * bo.dot(n)).normalized()
    bu = n.cross(bo).normalized()
    if bu.z < 0:
        bu = -bu
    return c, bo, bu, n


def blade_specs(body):
    """Every fan blade as (name, root, tip, face_hint, spec), in build order."""
    out = []
    for k, p in enumerate(PETALS):
        root, tip, ez = petal_root_tip(p)
        hint = ez
        if p.get("drape") and BODY is not None:
            loc, n = BODY.closest(tip)
            hint = (Vector(n) + ez).normalized()
        out.append(("PETAL%02d" % k, root, tip, hint, p))
    for k, p in enumerate(WRAP):
        root, n = cap_point(body, *p["root"], lift=-0.014)   # root sunk under the cap shell
        tip = Vector(p["tip"])
        mid = (root + tip) * 0.5
        hint = (n + (mid - SHOULDER_C).normalized()).normalized()
        out.append(("WRAP%d" % k, root, tip, hint, p))
    rc, _n = cap_point(body, *SIDE_C)
    for k, p in enumerate(SIDE):
        a = math.radians(p["phi"])
        dY, dZ = math.cos(a), math.sin(a)
        root, _n = cap_point(body, SIDE_C[0] + 9.0 * dY, SIDE_C[1] + 9.0 * dZ, lift=-0.012)
        lay = LAYER_STEP * p.get("layer", 0)
        tip0 = Vector((SIDE_X - p.get("rf", 0.02), rc.y + p["L"] * dY, rc.z + p["L"] * dZ))
        tip = tip0 + push_out(tip0, 0.004 + lay)
        mid = (root + tip) * 0.5
        u, _r = radial_dir(mid)
        hint = (u + Vector((1.0, 0.0, 0.0))).normalized()
        q = dict(p)
        q.setdefault("bow", 0.0)
        q.setdefault("clear_from", 0.0)
        q.setdefault("clear_ramp", 0.16)
        q.setdefault("clear_add", 0.004 + lay)
        q.setdefault("clear_max", 0.085)
        q.setdefault("z", 0.0)
        q.setdefault("snap", True)
        q.setdefault("tip_lift", 0.006)
        out.append(("SIDE%02d" % k, root, tip, hint, q))
    c, bo, bu, bn = back_frame(body)
    for k, p in enumerate(BACK):
        a = math.radians(p["phi"])
        dr = bo * math.cos(a) + bu * math.sin(a)
        lay = LAYER_STEP * (p.get("layer", 0) + 0.5)          # half a layer over the side set
        cc = c + bn * lay
        root = cc + dr * p.get("r0", 0.040) - bn * 0.012     # tucked under the shell
        tip = cc + dr * p["L"] - bn * p["rf"]
        q = dict(p)
        q.setdefault("bow", 0.0)
        q.setdefault("z", 0.0)
        # drape over the shoulder like scales, layered by ring
        q.setdefault("clear_from", 0.06)
        q.setdefault("clear_ramp", 0.16)
        q.setdefault("clear_add", 0.004 + lay)
        q.setdefault("clear_max", 0.085)
        q.setdefault("snap", True)
        q.setdefault("tip_lift", 0.006)
        out.append(("BACK%02d" % k, root, tip, bn, q))
    return out


def fan_pieces(body):
    out = []
    for _name, root, tip, hint, p in blade_specs(body):
        out.extend(_blade_spec_pieces(root, tip, hint, p))
    return out


# ------------------------------------------------------------------ build
def build(ctx):
    global BODY
    BODY = ctx.body
    coll = ctx.coll("shoulders")
    groups = {}

    def add(bm, fam, tint=None, angle=30.0):
        ob = L.from_bmesh(bm, "RX_Shoulders_tmp_%s_%d" % (fam, sum(len(v) for v in groups.values())), coll, fam, angle)
        if fam == "Crystal":
            L.tint(ob, pink=0.35 if tint is None else tint, sparkle=0.55, edge=0.6)
        groups.setdefault(fam, []).append(ob)
        return ob

    Mm = L.frame_from_normal(MED_C - MED_N * 0.020, MED_N, (0.0, 0.0, 1.0))
    for bm, fam in medallion_pieces() + rays_pieces():
        L.transform(bm, Mm)
        add(bm, fam, angle=40.0)
    for bm, fam in pendant_pieces():
        add(bm, fam, angle=40.0)
    for bm, fam, tint in fan_pieces(ctx.body):
        add(bm, fam, tint, angle=28.0)
    for bm, fam, tint in shell_pieces(ctx.body):
        add(bm, fam, tint, angle=25.0)
    for bm, fam in cap_pieces(ctx.body):
        add(bm, fam, angle=50.0)

    made = [L.join(obs, "RX_Shoulders_%s_L" % fam) for fam, obs in groups.items()]
    for ob in made:
        L.mirror_x(ob)
    # glints (mirror_x on empties reads a stale matrix_world, so place both directly)
    star = MED_C + MED_N * 0.0045
    L.glint("Shoulders_Medallion_L", star, 0.05, coll, 0.35)
    L.glint("Shoulders_Medallion_R", (-star.x, star.y, star.z), 0.05, coll, 0.35)
