"""Rexonance coat-tail ribbons: the big flowing crystal ribbons that hang from
the sides and back of the belt and sweep out and down to sickle points near
the shins (front-10 tips ~ (180, 1290) / (830, 1295); back-09 out to x ~110 /
910; right-07 trailing behind the legs at x ~270-450).

Each ribbon is one thin curved sheet: a lens section (thin rounded edges,
fullest in the middle) swept along a 3D spine with its own width direction,
asymmetric half-widths (the point of a sickle sits on one edge), a slight cup
across the width and a little thickness. UV v = 0 at the root, 1 at the tip;
u runs around the section. Each ribbon is its own object
RX_Ribbon_<n>_L / _R with rx_keep = 1 so the viewer can animate it.
"""

import math

import bmesh
import numpy as np
from mathutils import Vector

import rx_lib as L

# Spines are authored for the suit's LEFT side (+X) and mirrored.
# root : (angle around the waist from the front in degrees, lift off the body)
# ctrl : spine control points below the root (root -> tip)
# psi  : (t, angle) keys for the sheet normal's horizontal direction in degrees
#        (0 = +X, 90 = +Y); "body" at t = 0 means the body normal at the root.
#        The ribbons are sickle blades: below the hip each one lies roughly in a
#        vertical plane and curves inside it, so its normal stays horizontal.
# w    : (t, half-width on the outer/+W side, half-width on the inner side)
RIBBONS = [
    dict(  # outer ribbon: the narrow pink sickle that flares out the furthest
        name="1",
        root=(97.0, 0.024),
        ctrl=[(0.262, 0.062, 1.040), (0.305, 0.100, 0.930), (0.350, 0.130, 0.820), (0.392, 0.150, 0.712),
              (0.462, 0.160, 0.612), (0.528, 0.152, 0.518), (0.550, 0.136, 0.428), (0.526, 0.114, 0.354),
              (0.482, 0.090, 0.300), (0.444, 0.074, 0.278)],
        psi=[(0.0, "body"), (0.12, -40.0), (0.26, -66.0), (0.55, -76.0), (0.80, -68.0), (1.0, -62.0)],
        w=[(0.0, 0.014, 0.014), (0.12, 0.024, 0.020), (0.35, 0.036, 0.030), (0.60, 0.042, 0.034), (0.80, 0.036, 0.024),
           (0.92, 0.022, 0.009), (1.0, 0.0012, 0.0004)],
        thick=0.0062, cup=0.007, pink=0.25,
    ),
    dict(  # main ribbon: the widest, sweeps diagonally out along the back lapel
        name="2",
        root=(107.0, 0.033),
        ctrl=[(0.255, 0.117, 1.030), (0.300, 0.177, 0.925), (0.342, 0.230, 0.815), (0.385, 0.270, 0.705),
              (0.438, 0.292, 0.600), (0.488, 0.287, 0.500), (0.498, 0.270, 0.415), (0.474, 0.242, 0.345),
              (0.434, 0.207, 0.300), (0.400, 0.182, 0.282)],
        psi=[(0.0, "body"), (0.12, -18.0), (0.26, -45.0), (0.55, -50.0), (0.80, -44.0), (1.0, -40.0)],
        w=[(0.0, 0.020, 0.020), (0.12, 0.036, 0.032), (0.35, 0.060, 0.052), (0.60, 0.072, 0.060), (0.80, 0.060, 0.040),
           (0.92, 0.034, 0.012), (1.0, 0.0014, 0.0004)],
        thick=0.0074, cup=0.012, pink=0.0,
    ),
    dict(  # inner ribbon: from the back of the hip, trailing furthest behind the legs
        name="3",
        root=(116.0, 0.042),
        ctrl=[(0.218, 0.170, 1.030), (0.245, 0.250, 0.925), (0.268, 0.314, 0.815), (0.290, 0.364, 0.705),
              (0.312, 0.396, 0.600), (0.328, 0.410, 0.500), (0.330, 0.400, 0.420), (0.312, 0.375, 0.355),
              (0.285, 0.345, 0.312), (0.262, 0.322, 0.296)],
        psi=[(0.0, "body"), (0.12, 4.0), (0.26, -22.0), (0.55, -30.0), (0.80, -24.0), (1.0, -20.0)],
        w=[(0.0, 0.017, 0.017), (0.12, 0.028, 0.026), (0.35, 0.046, 0.040), (0.60, 0.052, 0.044), (0.80, 0.044, 0.030),
           (0.92, 0.024, 0.009), (1.0, 0.0010, 0.0004)],
        thick=0.0066, cup=0.010, pink=0.1,
    ),
]

ROOT_Z = 1.146
YC = 0.004

N_RINGS = 84
N_PROF = 18


def _interp_keys(keys, t):
    ts = [k[0] for k in keys]
    out = []
    for c in range(1, len(keys[0])):
        out.append(float(np.interp(t, ts, [k[c] for k in keys])))
    return out


def lens_section(n=N_PROF, sharp=1.35):
    """Unit lens: x in [-1, 1] across the width, y in [-0.5, 0.5] thickness."""
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        c, s = math.cos(a), math.sin(a)
        out.append((c, 0.5 * math.copysign(abs(s) ** sharp, s)))
    return out


def root_point(body, theta_deg, lift, z=ROOT_Z):
    """Point on the waist at angle theta (0 = front, 90 = suit's left) lifted
    along the body normal, and the normal."""
    th = math.radians(theta_deg)
    d = Vector((math.sin(th), -math.cos(th), 0.0))
    o = Vector((0.0, YC, z))
    hit = body.ray(o, d, 1.0)
    loc, n = hit
    n = Vector((n.x, n.y, 0.0)).normalized()
    if n.dot(d) < 0:
        n = -n
    return loc + n * lift, n


def ribbon_mesh(spec, body, n_rings=N_RINGS):
    th, lift = spec["root"]
    p0, n0 = root_point(body, th, lift)
    # second point on the pelvis below the belt (the body flares out there)
    p1, n1 = root_point(body, th + 2.0, lift + 0.010, z=ROOT_Z - 0.058)
    ctrl = [p0, p1] + [Vector(p) for p in spec["ctrl"]]
    spine = L.catmull_rom(ctrl, 12)
    spine = L.resample(spine, n_rings)
    lens = L.arc_lengths(spine)
    total = lens[-1]
    ts = [l / total for l in lens]
    psi_body = math.degrees(math.atan2(n0.y, n0.x))
    keys = [(t, psi_body if a == "body" else float(a)) for t, a in spec["psi"]]
    # unwrap so the interpolation takes the short way round
    for i in range(1, len(keys)):
        a0, a1 = keys[i - 1][1], keys[i][1]
        while a1 - a0 > 180.0:
            a1 -= 360.0
        while a1 - a0 < -180.0:
            a1 += 360.0
        keys[i] = (keys[i][0], a1)
    kt = [k[0] for k in keys]
    ka = [k[1] for k in keys]

    def normal_hint(t):
        # smoothstep between keys
        for i in range(len(kt) - 1):
            if kt[i] <= t <= kt[i + 1]:
                f = (t - kt[i]) / max(kt[i + 1] - kt[i], 1e-9)
                f = f * f * (3 - 2 * f)
                a = math.radians(ka[i] + (ka[i + 1] - ka[i]) * f)
                return Vector((math.cos(a), math.sin(a), 0.0))
        a = math.radians(ka[-1])
        return Vector((math.cos(a), math.sin(a), 0.0))

    sec = lens_section()
    bm = bmesh.new()
    rings = []
    prevW = None
    for i, p in enumerate(spine):
        t = ts[i]
        if i == 0:
            T = (spine[1] - spine[0]).normalized()
        elif i == len(spine) - 1:
            T = (spine[-1] - spine[-2]).normalized()
        else:
            T = (spine[i + 1] - spine[i - 1]).normalized()
        Nn = normal_hint(t)
        Nn = (Nn - T * Nn.dot(T)).normalized()
        W = Nn.cross(T).normalized()
        if prevW is None:
            # +W is the outer edge: away from the body's vertical axis
            out = Vector((p.x, p.y - YC, 0.0))
            if W.dot(out) < 0:
                W, Nn = -W, -Nn
        elif W.dot(prevW) < 0:
            W, Nn = -W, -Nn
        prevW = W
        wl, wr = _interp_keys(spec["w"], t)
        th = spec["thick"] * (0.35 + 0.65 * math.sin(math.pi * min(1.0, t * 1.15 + 0.08)) ** 0.5) * (1.0 - 0.75 * t ** 4)
        cup = spec["cup"] * math.sin(math.pi * min(t * 1.1, 1.0))
        ring = []
        for x, y in sec:
            off = x * (wl if x >= 0 else wr)
            # cup: edges bow toward +N; thin the very edges
            q = p + W * off + Nn * (y * th + cup * (x * x - 0.33))
            ring.append(bm.verts.new(q))
        rings.append(ring)
    uv = bm.loops.layers.uv.verify()
    m = len(sec)
    for i in range(len(rings) - 1):
        ra, rb = rings[i], rings[i + 1]
        ta, tb = ts[i], ts[i + 1]
        for k in range(m):
            k2 = (k + 1) % m
            f = bm.faces.new((ra[k], ra[k2], rb[k2], rb[k]))
            u0, u1 = k / m, (k + 1) / m
            for lp, (u, v) in zip(f.loops, ((u0, ta), (u1, ta), (u1, tb), (u0, tb))):
                lp[uv].uv = (u, v)
    for ring, t, rev in ((rings[0], 0.0, True), (rings[-1], 1.0, False)):
        vs = list(reversed(ring)) if rev else list(ring)
        f = bm.faces.new(vs)
        for lp in f.loops:
            lp[uv].uv = (0.5, t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.normal_update()
    return bm, spine


def _tint(bias):
    def fn(co, uv):
        u, v = uv
        pink = min(1.0, bias + (1.0 - bias) * min(1.0, max(0.0, (v - 0.48) / 0.44)) ** 1.3)
        edge = abs(math.cos(2 * math.pi * u)) ** 3
        return (pink * 0.95, 0.85, 0.35 + 0.65 * edge)

    return fn


def clearance(body, bm_or_ob, margin=0.02):
    """Smallest distance from any vertex to the body (for the rest-pose check)."""
    if hasattr(bm_or_ob, "data"):
        verts = [bm_or_ob.matrix_world @ v.co for v in bm_or_ob.data.vertices]
    else:
        verts = [v.co.copy() for v in bm_or_ob.verts]
    dmin = 1e9
    worst = None
    for p in verts[::3]:
        loc, _n = body.closest(p)
        d = (loc - p).length
        if d < dmin:
            dmin, worst = d, p
    return dmin, worst


def _bvh(ob):
    from mathutils.bvhtree import BVHTree

    me = ob.data
    mw = ob.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    polys = [tuple(pl.vertices) for pl in me.polygons]
    return BVHTree.FromPolygons(verts, polys)


def overlaps(ob, others):
    """[(name, n_overlapping_triangle_pairs)] for meshes that intersect ob."""
    out = []
    b0 = _bvh(ob)
    for o in others:
        if o is ob or o.type != "MESH" or not o.data.polygons:
            continue
        pairs = b0.overlap(_bvh(o))
        if pairs:
            me = ob.data
            cs = [me.polygons[i].center for i, _j in pairs]
            zs = sorted(c.z for c in cs)
            c = sum(cs, Vector()) / len(cs)
            out.append(("%s@(%.2f,%.2f,%.2f z%.2f-%.2f)" % (o.name, c.x, c.y, c.z, zs[0], zs[-1]), len(pairs)))
    return out


def build(ctx):
    import os

    import bpy

    coll = ctx.coll("ribbons")
    for spec in RIBBONS:
        bm, spine = ribbon_mesh(spec, ctx.body)
        name = "RX_Ribbon_%s_L" % spec["name"]
        ob = L.from_bmesh(bm, name, coll, "Crystal", 60)
        L.tint(ob, fn=_tint(spec.get("pink", 0.0)))
        ob["rx_keep"] = 1
        ob["rx_root"] = [round(c, 4) for c in spine[0]]
        ob["rx_tip"] = [round(c, 4) for c in spine[-1]]
        d, p = clearance(ctx.body, ob)
        print("[ribbons] %s clearance to body %.3f m at %s" % (name, d, tuple(round(c, 3) for c in p)))
        mir = L.mirror_x(ob)
        mir["rx_root"] = [-ob["rx_root"][0], ob["rx_root"][1], ob["rx_root"][2]]
        mir["rx_tip"] = [-ob["rx_tip"][0], ob["rx_tip"][1], ob["rx_tip"][2]]
        if os.environ.get("RX_RIBBON_DEBUG"):
            others = [o for o in bpy.data.objects if o.type == "MESH" and o not in (ob, mir)]
            for o2 in (ob,):
                hits = overlaps(o2, others)
                print("[ribbons] %s intersects: %s" % (o2.name, ", ".join("%s(%d)" % h for h in hits) or "nothing"))
    if os.environ.get("RX_WAIST_OVERLAP"):
        mine = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("RX_Waist_") and o.name.endswith(("_L", "Tasset_Black", "Tasset_Gold", "Belt", "BeltGold", "CellFrames"))]
        others = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith(("RX_Waist_", "RX_Ribbon_", "RX_Body"))]
        for o2 in mine:
            hits = overlaps(o2, others)
            if hits:
                print("[waist-x] %s intersects: %s" % (o2.name, ", ".join("%s(%d)" % h for h in hits)))
