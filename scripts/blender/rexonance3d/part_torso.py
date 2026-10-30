"""Rexonance torso: the chest core (orb + whirlpool vanes), chest and abdomen
armour, and the back's chevron spine.

Zone: belt top (Z 1.262) to the neck base (Z ~1.585). Read off front-10
(widths, heights), right-07 / left-08 (depth) and back-09 (back details).

Chest core: front-10 puts the orb at (499, 403) px -> Z 1.477 (left-08 agrees:
y 395 -> 1.477); rx_ref.LM["chest_core"] says 1.514, which is ~3.5 cm high.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import part_torso_kit as K
import rx_lib as L
import rx_ref as R

# ---------------------------------------------------------------- core frame
CORE_Z = R.front(499, 403)[1]  # 1.477
SPIN_AXIS = Vector((0.0, -1.0, 0.0))  # the core faces the viewer (-Y)


def cpt(r, th, d):
    """Core polar point: radius r, angle th (CCW seen from the front, 0 = +X),
    depth d in front of the X-Z plane (world Y = -d)."""
    return Vector((r * math.cos(th), -d, CORE_Z + r * math.sin(th)))


def cdir(th):
    return Vector((math.cos(th), 0.0, math.sin(th)))


def finish(bm, name, coll, family, angle=35.0, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L.from_bmesh(bm, name, coll, family, angle)


def sweep_closed(path, profile, normals, scale, twist=None):
    bm = L.sweep(path, profile, scale=scale, twist=twist, normals=normals)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------------------------------------------------------------- the orb
ORB_BASE_R = 0.051  # outer edge of the dark-blue band (front-10: ~38 px)
ORB_INNER_R = 0.038  # the white ring / start of the band
ORB_D_BASE = 0.140  # depth of the band's outer edge
ORB_D_APEX = 0.174  # right-07: frontmost x ~662
ORB_H = ORB_D_APEX - ORB_D_BASE
ORB_RS = (ORB_BASE_R ** 2 + ORB_H ** 2) / (2 * ORB_H)  # sphere radius
ORB_DC = ORB_D_APEX - ORB_RS  # sphere centre depth


def orb_depth(r):
    return ORB_DC + math.sqrt(max(ORB_RS ** 2 - r * r, 0.0))


def orb_normal(r, th):
    c = Vector((r * math.cos(th), -(orb_depth(r) - ORB_DC), r * math.sin(th)))
    return c.normalized()


def sphere_zone(r0, r1, rings, seg, lift=0.0, back=None):
    """Sphere-cap zone between projected radii r0 (0 = apex) and r1."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    rows = []
    for i in range(rings + 1):
        r = r0 + (r1 - r0) * i / rings
        if r < 1e-6:
            rows.append([bm.verts.new(cpt(0.0, 0.0, ORB_D_APEX + lift))])
            continue
        row = []
        for j in range(seg):
            th = 2 * math.pi * j / seg
            p = cpt(r, th, orb_depth(r)) + orb_normal(r, th) * lift
            row.append(bm.verts.new(p))
        rows.append(row)
    if back is not None:
        rows.append([bm.verts.new(cpt(r1, 2 * math.pi * j / seg, back)) for j in range(seg)])
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[j2]))
            else:
                bm.faces.new((a[j], b[j], b[j2], a[j2]))
    if back is not None:
        bm.faces.new(list(reversed(rows[-1])))
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (0.5 + co.x / (2 * ORB_BASE_R), 0.5 + (co.z - CORE_Z) / (2 * ORB_BASE_R))
    return bm


def build_orb(coll):
    out = []
    # bright core: the inner cap (white-blue centre, pink below)
    bm = sphere_zone(0.0, ORB_INNER_R, 9, 64, back=ORB_D_BASE - 0.012)
    out.append(finish(bm, "RX_Torso_CoreOrb", coll, "Glow", angle=None))
    # dark-blue band: the outer zone of the same sphere, a hair proud
    bm = sphere_zone(ORB_INNER_R - 0.0015, ORB_BASE_R, 4, 64, lift=0.0004, back=ORB_D_BASE - 0.010)
    band = finish(bm, "RX_Torso_CoreBand", coll, "Crystal", angle=None)
    L.tint(band, pink=0.0, sparkle=0.8, edge=0.2)
    out.append(band)
    # black bezel ring around the orb
    prof = [(0.0, -0.5), (0.7, -0.5), (1.0, -0.2), (1.0, 0.25), (0.6, 0.5), (0.0, 0.5)]
    seg = 72
    rr = ORB_BASE_R + 0.0040
    path = [cpt(rr, 2 * math.pi * j / seg, ORB_D_BASE + 0.003) for j in range(seg)]
    nrm = [(SPIN_AXIS * 0.9 + cdir(2 * math.pi * j / seg) * 0.35).normalized() for j in range(seg)]
    bm = L.sweep(path, [(x * 0.0120 - 0.006, y * 0.0068) for x, y in prof], normals=nrm, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out.append(L.from_bmesh(bm, "RX_Torso_CoreBezel", coll, "Black", 30.0))
    # the radial web: 10 spokes and a ring of white lines
    web = bmesh.new()
    rib = [(-0.0006, -0.5), (0.0006, -0.5), (0.0010, -0.2), (0.0010, 0.2), (0.0006, 0.5), (-0.0006, 0.5)]
    for k in range(10):
        th = math.radians(90.0 + 36.0 * k)
        rs = [0.004 + (ORB_BASE_R - 0.0025 - 0.004) * i / 13 for i in range(14)]
        path = [cpt(r, th, orb_depth(r)) + orb_normal(r, th) * 0.0006 for r in rs]
        nrm = [orb_normal(r, th) for r in rs]
        w0 = 0.0016

        def wf(t, w0=w0):
            return (1.0, w0 * (0.55 + 0.45 * t) if t < 0.85 else w0 * (0.55 + 0.45 * 0.85) * (1 - (t - 0.85) / 0.15 * 0.5))

        L.sweep(path, rib, scale=wf, normals=nrm, bm=web)
    seg = 80
    rr = ORB_INNER_R - 0.0012
    path = [cpt(rr, 2 * math.pi * j / seg, orb_depth(rr)) + orb_normal(rr, 2 * math.pi * j / seg) * 0.0006 for j in range(seg)]
    nrm = [orb_normal(rr, 2 * math.pi * j / seg) for j in range(seg)]
    L.sweep(path, rib, scale=lambda t: (1.0, 0.0017), normals=nrm, closed=True, bm=web)
    bmesh.ops.recalc_face_normals(web, faces=web.faces)
    out.append(L.from_bmesh(web, "RX_Torso_CoreWeb", coll, "Gem", 40.0))
    L.glint("TorsoCore", cpt(0.0, 0.0, ORB_D_APEX + 0.004), 0.07, coll, hue=0.45)
    return out


# ---------------------------------------------------------------- the vanes
N_VANES = 14
VANE = dict(
    r_root=0.052,
    r_tip=0.109,
    sweep=math.radians(100.0),
    d_root=0.142,
    d_tip=0.116,
    w_max=0.030,
    th=0.0085,
    tilt=math.radians(12.0),
    th0=math.radians(-12.0),
)

# profile (x = along the normal in thickness units, y = across: -0.5 inner .. +0.5 outer)
VANE_CRYSTAL = [  # wedge: thin inner edge rising to the gold spine
    (-0.10, -0.50), (0.10, -0.50), (0.38, -0.30), (0.62, -0.08), (0.80, 0.12), (0.84, 0.24),
    (-0.22, 0.24), (-0.24, -0.10), (-0.18, -0.36),
]
VANE_GOLD = [  # chamfered bead along the outer edge
    (-0.26, 0.20), (0.74, 0.19), (0.98, 0.26), (1.03, 0.35), (0.97, 0.45), (0.74, 0.50), (-0.26, 0.50),
]


def vane_frames(k, n=24):
    V = VANE
    th0 = V["th0"] + 2 * math.pi * k / N_VANES
    path, nrm = [], []
    for i in range(n):
        t = i / (n - 1)
        r = V["r_root"] + (V["r_tip"] - V["r_root"]) * (0.55 * t + 0.45 * t * t)
        th = th0 + V["sweep"] * t
        d = V["d_root"] + (V["d_tip"] - V["d_root"]) * t ** 0.9
        if t < 0.16:  # the root dives under the orb's bezel
            d -= 0.010 * (1.0 - t / 0.16) ** 2
        path.append(cpt(r, th, d))
        # dish normal: toward the viewer, leaning outward with the dish slope
        nrm.append((SPIN_AXIS + cdir(th) * 0.30).normalized())
    return path, nrm


def vane_width(t):
    """Sickle: quick rise from the root, long straight taper to a sharp tip."""
    t = min(max(t, 0.0), 1.0)
    rise = math.sin(min(t / 0.24, 1.0) * math.pi / 2) ** 0.6
    fall = (1.0 - max(t - 0.30, 0.0) / 0.70) ** 0.85
    return max(VANE["w_max"] * rise * fall, 0.0005)


def build_vanes(coll, pivot):
    crys = bmesh.new()
    gold = bmesh.new()
    V = VANE

    def scale(t):
        return (V["th"] * (1.0 - 0.55 * t), vane_width(t))

    for k in range(N_VANES):
        path, nrm = vane_frames(k)
        L.sweep(path, VANE_CRYSTAL, scale=scale, twist=lambda t: -V["tilt"], normals=nrm, bm=crys)
        L.sweep(path, VANE_GOLD, scale=scale, twist=lambda t: -V["tilt"], normals=nrm, bm=gold)
    bmesh.ops.recalc_face_normals(crys, faces=crys.faces)
    bmesh.ops.recalc_face_normals(gold, faces=gold.faces)
    cob = L.from_bmesh(crys, "RX_Torso_CoreVanes", coll, "Crystal", 30.0)
    def vane_tint(co, uv):
        # pinker toward the tips, and every other blade a little pinker overall (front-10 mixes them)
        th = math.atan2(co.z - CORE_Z, co.x)
        k = 0.5 + 0.5 * math.sin(th * 3.0 + 0.7)
        return (min(1.0, 0.12 + 0.55 * uv[1] ** 1.2 + 0.25 * k), 0.65, 0.65)

    L.tint(cob, fn=vane_tint)
    gob = L.from_bmesh(gold, "RX_Torso_CoreVaneRims", coll, "Gold", 30.0)
    for ob in (cob, gob):
        ob.parent = pivot
        ob.matrix_parent_inverse = pivot.matrix_world.inverted()
    return [cob, gob]


def build_housing(ctx, coll):
    """Black turbine dish under the vanes, closing the gaps down to the chest."""
    body = ctx.body
    seg = 96
    prof = [(0.040, 0.124), (0.055, 0.120), (0.072, 0.117), (0.088, 0.115)]
    bm = bmesh.new()
    rows = []
    for (r, d) in prof:
        rows.append([bm.verts.new(cpt(r, 2 * math.pi * j / seg, d)) for j in range(seg)])
    # flared skirt down onto the chest (deep only above the core, where the chest recedes)
    for rr, frac in ((0.100, 0.55), (0.110, 1.0)):
        row = []
        for j in range(seg):
            th = 2 * math.pi * j / seg
            p = cpt(rr, th, 0.2)
            hit = body.ray(p, Vector((0.0, 1.0, 0.0)))
            d_body = (-hit[0].y if hit else 0.10) - 0.004
            d = min(0.115 + (d_body - 0.115) * frac, 0.115)
            row.append(bm.verts.new(cpt(rr, th, d)))
        rows.append(row)
    back = [bm.verts.new(cpt(0.104, 2 * math.pi * j / seg, 0.06)) for j in range(seg)]
    rows.append(back)
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            bm.faces.new((a[j], b[j], b[j2], a[j2]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    return finish(bm, "RX_Torso_CoreHousing", coll, "Black", 30.0)


def build_core(ctx, coll):
    pivot = bpy.data.objects.new("RX_Torso_CorePivot", None)
    pivot.empty_display_type = "ARROWS"
    pivot.empty_display_size = 0.08
    pivot.location = (0.0, -0.13, CORE_Z)
    pivot.rotation_euler = (math.pi / 2, 0.0, 0.0)  # local +Z = world -Y (out of the chest)
    pivot["rx_keep"] = 1
    pivot["rx_spin_axis"] = "z"
    pivot["rx_spin_rate"] = -0.35  # rad/s, clockwise seen from the front: the whirlpool draws inward
    coll.objects.link(pivot)
    bpy.context.view_layer.update()
    build_orb(coll)
    build_vanes(coll, pivot)
    build_housing(ctx, coll)


# ---------------------------------------------------------------- spikes
def facet_kite(base, tip, side, normal, half_w, shoulder=0.38, height=0.008, back=0.003):
    """Faceted gold spike: base point, tip point, shoulders at `shoulder` of the
    way (half-width half_w along `side`), ridge apex raised along `normal`."""
    bm = bmesh.new()
    base, tip, side, normal = Vector(base), Vector(tip), Vector(side).normalized(), Vector(normal).normalized()
    m = base.lerp(tip, shoulder)
    B = bm.verts.new(base)
    T = bm.verts.new(tip)
    S1 = bm.verts.new(m + side * half_w)
    S2 = bm.verts.new(m - side * half_w)
    A = bm.verts.new(m + normal * height)
    A2 = bm.verts.new(base.lerp(tip, shoulder + 0.30) + normal * height * 0.55)
    K = bm.verts.new(m - normal * back)
    for f in ((B, S1, A), (S1, A2, A), (S1, T, A2), (T, S2, A2), (S2, A, A2), (S2, B, A),
              (B, K, S1), (S1, K, T), (T, K, S2), (S2, K, B)):
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_spikes(ctx, coll):
    body = ctx.body
    # gold spike above the core: front-10 tip (499, 303), shoulders y 330
    zb, zt = R.front(499, 352)[1], R.front(499, 302)[1]
    base = Vector((0.0, -0.118, zb))
    tip = Vector((0.0, -0.090, zt))
    n = Vector((0.0, -1.0, 0.45)).normalized()
    bm = facet_kite(base, tip, (1, 0, 0), n, half_w=12 * R.S, shoulder=0.45, height=0.010, back=0.004)
    finish(bm, "RX_Torso_SpikeUp", coll, "Gold", 25.0)
    # pink-gold V below the core: a faceted tongue hanging from the orb's bezel
    # over the lower vanes (front-10: gold point to y 523, pink inset y 452-506)
    za, zb_, zc = R.front(500, 440)[1], R.front(500, 482)[1], R.front(500, 523)[1]

    def dfun(z):
        if z >= zb_:
            return 0.1315 + (0.1505 - 0.1315) * (z - zb_) / (za - zb_)
        return 0.1095 + (0.1315 - 0.1095) * (z - zc) / (zb_ - zc)

    def xz(pts):
        return [R.front(x, y) for x, y in pts]

    gold = bmesh.new()
    rims = K.float_plate(gold, xz([(500, 436), (525, 458), (500, 524), (475, 458)]), xz([(500, 440), (500, 520)]),
                         dfun, 0.0030, 0.0075, base=0.0035)
    K.finish_plates(gold, 0.0009, rims)
    finish(gold, "RX_Torso_SpikeLow", coll, "Gold", 28.0, recalc=False)
    gem = bmesh.new()
    rims = K.float_plate(gem, xz([(500, 452), (515, 467), (500, 507), (485, 467)]), xz([(500, 454), (500, 504)]),
                         lambda z: dfun(z) + 0.0040, 0.0022, 0.0060, base=0.002)
    K.finish_plates(gem, 0.0006, rims)
    ob = finish(gem, "RX_Torso_SpikeLowGem", coll, "Crystal", 28.0, recalc=False)
    L.tint(ob, pink=0.95, sparkle=0.8, edge=0.8)


# ---------------------------------------------------------------- front trims
CRYS = "Crystal"


def add_strip(bm_by_fam, body, view, pts, width, thick, fam, wf=None, profile=None, gap=0.002):
    prof = profile or (K.lens(thick) if fam == CRYS else K.bevel_bar(thick))
    bm = K.strip(body, view, pts, width, thick, profile=prof, wf=wf, gap=gap)
    if not len(bm.verts):
        return
    tmp = bpy.data.meshes.new("_tmp")
    bm.to_mesh(tmp)
    bm.free()
    bm_by_fam.setdefault(fam, bmesh.new()).from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def emit(bm_by_fam, name, coll, mirror=True, tint=None):
    out = []
    for fam, bm in bm_by_fam.items():
        ob = finish(bm, "RX_Torso_%s%s_L" % (name, fam), coll, fam, 30.0)
        if fam == CRYS:
            L.tint(ob, fn=tint or (lambda co, uv: (0.15 + 0.75 * uv[1] ** 1.5, 0.7, 0.7)))
        out.append(ob)
        if mirror:
            out.append(L.mirror_x(ob))
    return out


def build_front(ctx, coll):
    body = ctx.body
    fam = {}
    # upper chest: gold strip and crystal streak fanning from the core to the shoulder
    add_strip(fam, body, "front", [(535, 334), (558, 311), (589, 288)], 0.015, 0.0050, "Gold", wf=K.pointed(a=0.08, b=0.75), profile=K.ridge_bar(0.0050))
    add_strip(fam, body, "front", [(544, 354), (566, 337), (596, 316)], 0.014, 0.0045, CRYS, wf=K.pointed(a=0.2, b=0.65))
    # pec / side streaks running up under the pauldron
    add_strip(fam, body, "front", [(555, 447), (582, 421), (609, 396)], 0.013, 0.0045, CRYS, wf=K.pointed(a=0.25, b=0.6))
    add_strip(fam, body, "front", [(570, 461), (596, 435), (622, 412)], 0.011, 0.0040, CRYS, wf=K.pointed(a=0.25, b=0.6))
    # long abdomen streak curving down to the belt
    add_strip(fam, body, "front", [(598, 454), (587, 474), (571, 502), (558, 532), (549, 563)], 0.016, 0.0048, CRYS, wf=K.pointed(a=0.12, b=0.62, p1=0.9))
    # gold blade on the flank
    add_strip(fam, body, "front", [(625, 445), (608, 467), (592, 491)], 0.013, 0.0045, "Gold", wf=K.taper(p=0.8, start=0.3), profile=K.ridge_bar(0.0045))
    # gold arch strap on the flank, rising from the belt (left-08), rays from between torso and arm
    add_strip(fam, K.SideBody(body, 0.24), "left", [(395, 573), (403, 548), (422, 532), (448, 528), (469, 539), (478, 566)], 0.016, 0.0062, "Gold", profile=K.ridge_bar(0.0062))
    emit(fam, "Front", coll)


# ---------------------------------------------------------------- back
SPINE = [  # back-09: (tip y, top y, half-width px, arm width px)
    (330, 288, 47, 14),
    (382, 330, 37, 13),
    (430, 390, 26, 12),
    (467, 428, 23, 11.5),
    (511, 468, 22, 11.5),
    (560, 518, 22, 11.5),
]


def v_chevron(gold, black, body, view, hw, z_top, z_tip, aw, cut=0.6, th=(0.0025, 0.0062), inner=True, xc=0.0, gap=0.0025):
    """Faceted V chevron (ridged gold arms) with an optional black inner V."""
    outline, dz_in, dh = K.chevron_outline(hw, z_top, z_tip, aw, cut=cut, xc=xc)
    ridge = [
        (xc - hw + dh * 0.55, z_top - cut * aw * 0.5 - 0.0015),
        (xc, z_tip + dz_in * 0.5),
        (xc + hw - dh * 0.55, z_top - cut * aw * 0.5 - 0.0015),
    ]
    H = z_top - z_tip

    def ramp(h, z):
        return 0.55 + 0.45 * min(1.0, max(0.0, (z_top - z) / (0.45 * H)))

    rims = K.ridge_plate(gold, body, view, outline, ridge, th[0], th[1], gap=gap, step=0.005, scale_fn=ramp)
    if inner:
        inset = 0.0016
        wi = hw - dh - inset
        tri = [(xc, z_tip + dz_in + inset * 2), (xc + wi, z_top + 0.005), (xc, z_top + 0.002), (xc - wi, z_top + 0.005)]
        K.ridge_plate(black, body, view, tri, [(xc, z_top), (xc, z_tip + dz_in + inset * 3)], 0.0012, 0.0042, gap=gap - 0.0005, step=0.005)
    return rims


def build_spine(ctx, coll):
    body = ctx.body
    gold = bmesh.new()
    black = bmesh.new()
    S = R.S
    rims = []
    for i, (y_tip, y_top, hw_px, aw_px) in enumerate(SPINE):
        z_tip = R.back(510, y_tip)[1]
        z_top = R.back(510, y_top)[1]
        r = v_chevron(gold, black, body, "back", hw_px * S, z_top, z_tip, aw_px * S)
        rims += r or []
    K.finish_plates(gold, 0.0010, rims)
    K.finish_plates(black)
    finish(gold, "RX_Torso_SpineChevrons", coll, "Gold", 28.0, recalc=False)
    finish(black, "RX_Torso_SpineInner", coll, "Black", 28.0, recalc=False)


SCAPULA_VS = [  # back-09 px, suit's left: (top outer, tip, top inner, arm width px)
    ((366, 292), (419, 344), (440, 282), 17),
    ((386, 352), (423, 421), (444, 346), 15),
]


def build_scapula(ctx, coll):
    body = ctx.body
    gold = bmesh.new()
    black = bmesh.new()
    rims = []
    for A, T, B, aw in SCAPULA_VS:
        A, T, B = R.back(*A), R.back(*T), R.back(*B)
        outline, ridge, inner, pA, pB = K.v_outline(A, T, B, aw * R.S)
        H = max(A[1], B[1]) - T[1]
        ztop = max(A[1], B[1])

        def ramp(h, z, ztop=ztop, H=H):
            return 0.55 + 0.45 * min(1.0, max(0.0, (ztop - z) / (0.45 * H)))

        r = K.ridge_plate(gold, body, "back", outline, ridge, 0.0025, 0.0062, gap=0.0028, step=0.005, scale_fn=ramp)
        rims += r or []
        tri = [inner, (pB[0], pB[1] + 0.004), ((pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2 + 0.001), (pA[0], pA[1] + 0.004)]
        K.ridge_plate(black, body, "back", tri, [((pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2), inner], 0.0012, 0.0040, gap=0.0022, step=0.005)
    K.finish_plates(gold, 0.0010, rims)
    g = finish(gold, "RX_Torso_ScapulaChevrons_L", coll, "Gold", 28.0, recalc=False)
    b = finish(black, "RX_Torso_ScapulaInner_L", coll, "Black", 28.0, recalc=False)
    L.mirror_x(g)
    L.mirror_x(b)


def build_back(ctx, coll):
    body = ctx.body
    build_scapula(ctx, coll)
    fam = {}
    # upper-back gold blades reaching in under the second chevron
    add_strip(fam, body, "back", [(431, 315), (458, 337), (491, 369)], 0.019, 0.0058, "Gold", wf=K.taper(p=0.9, start=0.35), profile=K.ridge_bar(0.0058))
    # lat crystal streaks
    add_strip(fam, body, "back", [(443, 360), (459, 388), (480, 422)], 0.013, 0.0042, CRYS, wf=K.pointed(a=0.2, b=0.6))
    add_strip(fam, body, "back", [(416, 453), (437, 479), (455, 512), (468, 557)], 0.016, 0.0048, CRYS, wf=K.pointed(a=0.12, b=0.6, p1=0.9))
    # gold arch strap rising from the belt on the back-side (twin of the front arch)
    add_strip(fam, body, "back", [(409, 584), (413, 556), (427, 535), (447, 529), (464, 540), (471, 572)], 0.017, 0.0062, "Gold", profile=K.ridge_bar(0.0062))
    emit(fam, "Back", coll)


# ---------------------------------------------------------------- black scale armour
def _dir_px(view, x0, y0, x1, y1):
    """Angle (view coords) of the pixel direction (x0, y0) -> (x1, y1)."""
    h0, z0 = R.px(view, x0, y0)
    h1, z1 = R.px(view, x1, y1)
    return math.atan2(z1 - z0, h1 - h0)


# plate fields (suit's left side; mirrored): (view, region px, tip angle, length px, width px)
FIELDS = [
    # abdomen beside the centre ridge, feathers running down-inward along the long streak
    ("front", [(522, 470), (560, 452), (612, 462), (630, 505), (612, 548), (596, 580), (516, 584), (514, 520)],
     _dir_px("front", 598, 454, 549, 563), 50, 19),
    # side of the chest under the shoulder medallion: feathers fanning up-outward
    ("front", [(568, 372), (612, 384), (642, 420), (634, 462), (600, 470), (566, 452)],
     _dir_px("front", 556, 446, 608, 397), 46, 18),
    # upper chest between the core and the collar, up to the neck base
    ("front", [(503, 322), (540, 316), (572, 302), (600, 312), (606, 348), (590, 372), (562, 364), (532, 350), (505, 342)],
     _dir_px("front", 536, 340, 588, 292), 36, 16),
    # back: between the spine and the lat streaks, feathers pointing down toward the spine
    ("back", [(492, 250), (492, 586), (412, 586), (392, 470), (418, 372), (448, 262)],
     lambda h, z: _dir_px("back", 440, 360, 482, 420) if z > 1.40 else _dir_px("back", 437, 479, 468, 556), 60, 20),
]
ABS_VS = [(530, 494, 36, 15), (557, 524, 35, 15)]  # front-10 black chevrons: tip y, top y, half-width, arm


def build_scales(ctx, coll):
    body = ctx.body
    bm = bmesh.new()
    rims = []
    for view, region, ang, Lp, Wp in FIELDS:
        n = K.tile_field(bm, body, view, region, ang, Lp, Wp, rims=rims)
        print("[torso] field %s: %d plates" % (view, n))
    K.finish_plates(bm, 0.0008, rims)
    ob = finish(bm, "RX_Torso_Scales_L", coll, "Black", 28.0, recalc=False)
    L.mirror_x(ob)
    # abdomen ridge: nested black chevrons below the pink V
    gold_dummy = bmesh.new()
    vb = bmesh.new()
    rims = []
    for y_tip, y_top, hw_px, aw_px in ABS_VS:
        z_tip, z_top = R.front(500, y_tip)[1], R.front(500, y_top)[1]
        r = v_chevron(vb, gold_dummy, body, "front", hw_px * R.S, z_top, z_tip, aw_px * R.S, cut=0.9, th=(0.0016, 0.0055), inner=False)
        rims += r or []
    gold_dummy.free()
    K.finish_plates(vb, 0.0008, rims)
    finish(vb, "RX_Torso_AbsChevrons", coll, "Black", 28.0, recalc=False)
    # upper chest: a black chevron behind the gold spike, under the collar
    vb = bmesh.new()
    gold_dummy = bmesh.new()
    z_tip, z_top = R.front(500, 352)[1], R.front(500, 314)[1]
    r = v_chevron(vb, gold_dummy, body, "front", 44 * R.S, z_top, z_tip, 15 * R.S, cut=0.9, th=(0.0018, 0.0060), inner=False, gap=0.004)
    gold_dummy.free()
    K.finish_plates(vb, 0.0008, r or [])
    finish(vb, "RX_Torso_SternumChevron", coll, "Black", 28.0, recalc=False)
    # flank plates under the arm (left-08, rays from between torso and arm)
    bm = bmesh.new()
    rims = []
    side = K.SideBody(body, 0.195, x_max=0.185)
    n = K.tile_field(bm, side, "left", [(392, 450), (470, 446), (522, 470), (520, 528), (470, 532), (402, 534)],
                     _dir_px("left", 470, 440, 405, 520), 44, 18, rims=rims)
    print("[torso] field flank: %d plates" % n)
    K.finish_plates(bm, 0.0008, rims)
    ob = finish(bm, "RX_Torso_FlankScales_L", coll, "Black", 28.0, recalc=False)
    L.mirror_x(ob)


# ---------------------------------------------------------------- entry
def build(ctx):
    coll = ctx.coll("torso")
    build_core(ctx, coll)
    build_spikes(ctx, coll)
    build_front(ctx, coll)
    build_spine(ctx, coll)
    build_back(ctx, coll)
    build_scales(ctx, coll)
