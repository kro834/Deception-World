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
# ctrl: spine control points root -> tip; whint: width-direction hints at the
# same points (the positive side is the "outer"/leading edge);
# w: (t, half-width +side, half-width -side) keys; cup: sheet curl across the
# width (+ bows toward the sheet normal side).
RIBBONS = [
    dict(  # outer ribbon: rises at the side, flares out behind the fist, sweeps widest, front sickle
        name="1",
        root=(97.0, 0.024),  # (angle around the waist from the front, deg; lift off the body)
        ctrl=[(0.262, 0.074, 1.010), (0.318, 0.104, 0.925), (0.386, 0.134, 0.830), (0.446, 0.152, 0.720),
              (0.484, 0.162, 0.600), (0.498, 0.164, 0.490), (0.480, 0.152, 0.392), (0.440, 0.128, 0.318),
              (0.402, 0.100, 0.284)],
        whint=[(0.10, -1.0, 0.0), (0.22, -0.97, 0.0), (0.40, -0.92, 0.0), (0.55, -0.84, 0.0), (0.75, -0.66, 0.0),
               (0.90, -0.43, 0.0), (0.96, -0.26, -0.05), (0.90, -0.20, -0.38), (0.74, -0.22, -0.63),
               (0.60, -0.24, -0.76)],
        w=[(0.0, 0.022, 0.022), (0.12, 0.036, 0.032), (0.35, 0.060, 0.046), (0.6, 0.070, 0.056), (0.8, 0.056, 0.038),
           (0.92, 0.032, 0.012), (1.0, 0.0012, 0.0004)],
        thick=0.0072, cup=0.012,
    ),
    dict(  # middle ribbon: from the back of the hip, across the back of the thigh
        name="2",
        root=(117.0, 0.027),
        ctrl=[(0.206, 0.156, 0.985), (0.252, 0.234, 0.850), (0.322, 0.274, 0.710), (0.398, 0.272, 0.590),
              (0.428, 0.266, 0.470), (0.410, 0.250, 0.372), (0.372, 0.222, 0.310), (0.342, 0.192, 0.284)],
        whint=[(0.45, -0.89, 0.0), (0.42, -0.91, 0.0), (0.42, -0.91, 0.0), (0.62, -0.78, 0.0), (0.88, -0.47, 0.0),
               (0.94, -0.30, -0.05), (0.88, -0.25, -0.40), (0.72, -0.25, -0.64), (0.58, -0.25, -0.78)],
        w=[(0.0, 0.020, 0.020), (0.12, 0.032, 0.031), (0.35, 0.054, 0.046), (0.6, 0.062, 0.050), (0.8, 0.049, 0.034),
           (0.92, 0.027, 0.010), (1.0, 0.0012, 0.0004)],
        thick=0.0066, cup=0.011,
    ),
    dict(  # inner ribbon: from the back, trailing furthest behind the legs
        name="3",
        root=(133.0, 0.030),
        ctrl=[(0.162, 0.186, 0.995), (0.204, 0.270, 0.860), (0.250, 0.332, 0.720), (0.294, 0.366, 0.600),
              (0.324, 0.374, 0.488), (0.320, 0.362, 0.398), (0.296, 0.340, 0.340), (0.270, 0.312, 0.314)],
        whint=[(0.70, -0.71, 0.0), (0.55, -0.83, 0.0), (0.52, -0.85, 0.0), (0.66, -0.75, 0.0), (0.85, -0.52, 0.0),
               (0.90, -0.42, -0.08), (0.82, -0.36, -0.44), (0.66, -0.36, -0.66), (0.55, -0.36, -0.76)],
        w=[(0.0, 0.018, 0.018), (0.12, 0.028, 0.027), (0.35, 0.044, 0.040), (0.6, 0.048, 0.043), (0.8, 0.041, 0.029),
           (0.92, 0.022, 0.008), (1.0, 0.0010, 0.0004)],
        thick=0.0062, cup=0.010,
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
    # parameter of each control point along the resampled spine (for the hints)
    lens = L.arc_lengths(spine)
    total = lens[-1]
    ts = [l / total for l in lens]
    cl = L.arc_lengths(L.catmull_rom(ctrl, 12))
    # control point t values: nearest spine sample to each control point
    ct = []
    for p in ctrl:
        k = min(range(len(spine)), key=lambda i: (spine[i] - p).length)
        ct.append(ts[k])
    ct[0], ct[-1] = 0.0, 1.0
    hints = [Vector(h).normalized() for h in spec["whint"]]
    hints = [hints[0]] + hints  # the extra root leg shares the first hint

    def hint(t):
        for i in range(len(ct) - 1):
            if ct[i] <= t <= ct[i + 1]:
                f = (t - ct[i]) / max(ct[i + 1] - ct[i], 1e-9)
                f = f * f * (3 - 2 * f)
                return hints[i].lerp(hints[i + 1], f).normalized()
        return hints[-1]

    sec = lens_section()
    bm = bmesh.new()
    uv_rings = []
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
        W = hint(t)
        W = (W - T * W.dot(T)).normalized()
        if prevW is not None and W.dot(prevW) < 0:
            W = -W
        prevW = W
        Nn = T.cross(W).normalized()
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


def _tint_fn(co, uv):
    u, v = uv
    pink = min(1.0, max(0.0, (v - 0.50) / 0.42)) ** 1.3 * 0.95
    edge = abs(math.cos(2 * math.pi * u)) ** 3
    return (pink, 0.85, 0.35 + 0.65 * edge)


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
        L.tint(ob, fn=_tint_fn)
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
