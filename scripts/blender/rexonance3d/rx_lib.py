"""Shared geometry toolkit for the Rexonance 3D build (bpy 4.5+ / 5.x).

Conventions (see README.md in this folder):
  * metres, Blender world frame: +Z up, the suit faces -Y, its LEFT side is +X;
  * every mesh is built in world coordinates with an identity object transform;
  * symmetric pieces are authored on +X with names ending in "_L" and copied
    with mirror_x(), which names the copy "_R";
  * materials come only from material(family): the runtime viewer keys its
    shaders on the "RX_<Family>" names;
  * crystal pieces carry UV v = 0 at the root and v = 1 at the tip (the
    blue -> violet -> pink gradient runs along v) and an optional tint()
    colour attribute.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import rx_ref

# ------------------------------------------------------------------ materials
# base/emit are linear RGB. "view" is the Workbench review colour.
FAMILIES = {
    "Suit": dict(base=(0.010, 0.010, 0.013), metal=0.0, rough=0.34, view=(0.12, 0.12, 0.14)),
    "Black": dict(base=(0.006, 0.006, 0.008), metal=0.0, rough=0.16, coat=1.0, view=(0.07, 0.07, 0.085)),
    "Gold": dict(base=(0.80, 0.48, 0.22), metal=1.0, rough=0.22, view=(0.88, 0.62, 0.33)),
    "GoldDark": dict(base=(0.36, 0.20, 0.09), metal=1.0, rough=0.32, view=(0.52, 0.33, 0.16)),
    "Silver": dict(base=(0.86, 0.87, 0.92), metal=1.0, rough=0.14, view=(0.86, 0.87, 0.92)),
    "Crystal": dict(
        base=(0.16, 0.28, 1.00), metal=0.0, rough=0.10, emit=(0.22, 0.34, 1.0), emit_s=0.9, view=(0.40, 0.55, 1.0)
    ),
    "Gem": dict(base=(0.55, 0.70, 1.00), metal=0.0, rough=0.04, emit=(0.6, 0.78, 1.0), emit_s=2.5, view=(0.72, 0.86, 1.0)),
    "Glow": dict(base=(1.0, 0.78, 1.0), metal=0.0, rough=0.20, emit=(1.0, 0.72, 1.0), emit_s=5.0, view=(1.0, 0.80, 1.0)),
    "Visor": dict(base=(1.0, 0.32, 0.78), metal=0.0, rough=0.12, emit=(1.0, 0.34, 0.86), emit_s=3.5, view=(1.0, 0.45, 0.86)),
    "Dark": dict(base=(0.004, 0.004, 0.005), metal=0.0, rough=0.60, view=(0.035, 0.035, 0.04)),
}


def material(family):
    """The shared material for a family ("Suit", "Black", "Gold", "GoldDark",
    "Silver", "Crystal", "Gem", "Glow", "Visor", "Dark")."""
    spec = FAMILIES[family]
    name = "RX_" + family
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    if hasattr(mat, "use_nodes") and not mat.node_tree:
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*spec["base"], 1.0)
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    if spec.get("coat"):
        bsdf.inputs["Coat Weight"].default_value = spec["coat"]
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    if spec.get("emit"):
        bsdf.inputs["Emission Color"].default_value = (*spec["emit"], 1.0)
        bsdf.inputs["Emission Strength"].default_value = spec["emit_s"]
    mat.diffuse_color = (*spec["view"], 1.0)
    mat.metallic = min(spec["metal"], 0.6)
    mat.roughness = max(spec["rough"], 0.25)
    return mat


TINT_ATTR = "Color"


def tint(ob, pink=0.25, sparkle=0.5, edge=0.5, fn=None):
    """Crystal colour attribute (exported as glTF COLOR_0).

    R = pink bias (0 keeps the blue->pink gradient, 1 is pink throughout),
    G = sparkle density, B = edge glow. fn(co: Vector, uv: (u, v)) may return
    (r, g, b) per corner instead of the constants.
    """
    me = ob.data
    attr = me.color_attributes.get(TINT_ATTR) or me.color_attributes.new(TINT_ATTR, "BYTE_COLOR", "CORNER")
    uvl = me.uv_layers.active
    data = attr.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            if fn is None:
                c = (pink, sparkle, edge)
            else:
                co = me.vertices[me.loops[li].vertex_index].co
                uv = tuple(uvl.data[li].uv) if uvl else (0.0, 0.0)
                c = fn(co, uv)
            data[li].color = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = attr
    return ob


# ------------------------------------------------------------------ objects
def collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def smooth(ob, angle=35.0):
    """Smooth shading with hard edges above `angle` degrees (None = all smooth)."""
    me = ob.data
    me.shade_smooth()
    if angle is not None and angle < 180.0:
        me.set_sharp_from_angle(angle=math.radians(angle))
    return ob


def from_bmesh(bm, name, coll, family=None, angle=35.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if family:
        me.materials.append(material(family))
    smooth(ob, angle)
    return ob


def from_arrays(verts, faces, name, coll, family=None, angle=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in np.asarray(verts, dtype=float)], [], [tuple(f) for f in np.asarray(faces)])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if family:
        me.materials.append(material(family))
    smooth(ob, angle)
    return ob


def join(objects, name):
    """Join meshes (identity transforms) into the first one, renamed."""
    objects = [o for o in objects if o and o.type == "MESH"]
    if not objects:
        return None
    if len(objects) == 1:
        objects[0].name = name
        objects[0].data.name = name
        return objects[0]
    with bpy.context.temp_override(
        active_object=objects[0], selected_editable_objects=objects, selected_objects=objects
    ):
        bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = name
    return objects[0]


def mirror_x(ob, name=None):
    """Mirrored copy across X=0 (suit left <-> right). Keeps materials, UVs and colours."""
    if name is None:
        name = ob.name[:-2] + "_R" if ob.name.endswith("_L") else ob.name + "_R"
    # A fresh object's matrix_world stays identity until the depsgraph updates.
    bpy.context.view_layer.update()
    if ob.type == "EMPTY":
        out = ob.copy()
        out.name = name
        mw = ob.matrix_world.copy()
        flip = Matrix.Scale(-1.0, 4, (1.0, 0.0, 0.0))
        out.matrix_world = flip @ mw @ flip
        for c in ob.users_collection:
            c.objects.link(out)
        return out
    me = ob.data.copy()
    me.name = name
    me.transform(ob.matrix_world.copy())
    me.transform(Matrix.Scale(-1.0, 4, (1.0, 0.0, 0.0)))
    me.flip_normals()
    out = bpy.data.objects.new(name, me)
    for c in ob.users_collection:
        c.objects.link(out)
    for k in ob.keys():
        out[k] = ob[k]
    return out


def glint(name, loc, size=0.03, coll=None, hue=0.5):
    """A star-glint anchor: an empty the viewer replaces with a sparkling sprite.
    hue: 0 ice blue .. 1 pink."""
    e = bpy.data.objects.new("RX_Glint_" + name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = size
    e.location = Vector(loc)
    e["rx_glint_size"] = float(size)
    e["rx_glint_hue"] = float(hue)
    (coll or bpy.context.scene.collection).objects.link(e)
    return e


# ------------------------------------------------------------------ frames
def frame(origin, x_axis, y_axis):
    """4x4 matrix mapping local (x, y, z) to world, z = x cross y (orthonormalised)."""
    x = Vector(x_axis).normalized()
    y = Vector(y_axis)
    y = (y - x * y.dot(x)).normalized()
    z = x.cross(y)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2], m[i][3] = x[i], y[i], z[i], origin[i]
    return m


def frame_from_normal(origin, normal, up=(0.0, 0.0, 1.0)):
    """Local z = normal, local y = `up` projected on the tangent plane."""
    n = Vector(normal).normalized()
    u = Vector(up)
    u = u - n * u.dot(n)
    if u.length < 1e-6:
        u = Vector((0.0, 1.0, 0.0)) - n * n.y
    u.normalize()
    x = u.cross(n)
    return frame(origin, x, u)


def transform(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


# ------------------------------------------------------------------ curves
def catmull_rom(points, samples=8, closed=False):
    """Centripetal Catmull-Rom through `points` (Vectors); `samples` per segment."""
    P = [Vector(p) for p in points]
    if len(P) < 2:
        return P
    if closed:
        ext = [P[-1]] + P + [P[0], P[1]]
    else:
        ext = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    segs = len(P) if closed else len(P) - 1
    for i in range(segs):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]

        def tj(ti, a, b):
            return ti + max((b - a).length, 1e-6) ** 0.5

        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        for s in range(samples):
            t = t1 + (t2 - t1) * s / samples
            a1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            a2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            a3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            b1 = a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
            b2 = a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
            out.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
    if not closed:
        out.append(P[-1].copy())
    return out


def arc_lengths(points):
    L = [0.0]
    for a, b in zip(points, points[1:]):
        L.append(L[-1] + (Vector(b) - Vector(a)).length)
    return L


def resample(points, n):
    """n points evenly spaced by arc length along a polyline."""
    P = [Vector(p) for p in points]
    L = arc_lengths(P)
    total = L[-1]
    out = []
    j = 0
    for i in range(n):
        s = total * i / (n - 1)
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        seg = L[j + 1] - L[j]
        t = 0.0 if seg < 1e-12 else (s - L[j]) / seg
        out.append(P[j].lerp(P[j + 1], t))
    return out


def rmf(points, up=(0.0, 0.0, 1.0), closed=False):
    """Rotation-minimising frames (double reflection). Returns [(T, N, B)];
    N starts as `up` projected off the first tangent."""
    P = [Vector(p) for p in points]
    n = len(P)
    T = []
    for i in range(n):
        if closed:
            t = P[(i + 1) % n] - P[(i - 1) % n]
        elif i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        T.append(t.normalized())
    u = Vector(up)
    N0 = u - T[0] * u.dot(T[0])
    if N0.length < 1e-6:
        N0 = T[0].orthogonal()
    N = [N0.normalized()]
    for i in range(n - 1):
        v1 = P[i + 1] - P[i]
        c1 = v1.dot(v1)
        if c1 < 1e-16:
            N.append(N[-1].copy())
            continue
        rL = N[i] - (2.0 / c1) * v1.dot(N[i]) * v1
        tL = T[i] - (2.0 / c1) * v1.dot(T[i]) * v1
        v2 = T[i + 1] - tL
        c2 = v2.dot(v2)
        r = rL if c2 < 1e-16 else rL - (2.0 / c2) * v2.dot(rL) * v2
        N.append(r.normalized())
    return [(T[i], N[i], T[i].cross(N[i]).normalized()) for i in range(n)]


# ------------------------------------------------------------------ profiles
def circle_profile(n=12, rx=1.0, ry=None):
    ry = rx if ry is None else ry
    return [(rx * math.cos(2 * math.pi * i / n), ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def superellipse_profile(n=16, rx=1.0, ry=1.0, p=3.0):
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        out.append((rx * math.copysign(abs(c) ** (2.0 / p), c), ry * math.copysign(abs(s) ** (2.0 / p), s)))
    return out


def lens_profile(n=12, width=1.0, thickness=0.2, sharp=1.6):
    """Blade cross-section: thin at both edges (+-width/2 along x), fullest in
    the middle (thickness along y)."""
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        out.append((0.5 * width * c, 0.5 * thickness * math.copysign(abs(s) ** sharp, s)))
    return out


def rounded_rect_profile(w, h, r, seg=2):
    """Rectangle w x h with corner radius r (CCW)."""
    r = min(r, w * 0.5 - 1e-5, h * 0.5 - 1e-5)
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]
    for cx, cy, a0 in corners:
        for k in range(seg + 1):
            a = math.radians(a0 + 90.0 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# ------------------------------------------------------------------ sweeps
def sweep(path, profile, scale=None, twist=None, up=(0.0, 0.0, 1.0), normals=None, caps=True, closed=False, bm=None):
    """Extrude a closed 2D profile along a 3D path.

    path    : list of points (>= 2)
    profile : closed loop of (px, py); px runs along the frame normal N, py along B = T x N
    scale   : None | float | f(t) -> float or (sx, sy), t in [0, 1] by arc length
    twist   : None | f(t) -> radians about the tangent
    normals : optional list of N vectors (one per path point) overriding the
              rotation-minimising frame, e.g. surface normals
    UV      : u runs around the profile (0..1), v along the path (0..1).
    """
    bm = bm or bmesh.new()
    P = [Vector(p) for p in path]
    fr = rmf(P, up, closed=closed)
    if normals is not None:
        fr2 = []
        for (T, _N, _B), n in zip(fr, normals):
            n = Vector(n)
            n = (n - T * n.dot(T)).normalized()
            fr2.append((T, n, T.cross(n).normalized()))
        fr = fr2
    L = arc_lengths(P)
    total = max(L[-1], 1e-9)
    if closed:
        total += (P[0] - P[-1]).length
    m = len(profile)
    rings = []
    for i, p in enumerate(P):
        t = L[i] / total
        T, N, B = fr[i]
        if scale is None:
            sx = sy = 1.0
        elif callable(scale):
            s = scale(t)
            sx, sy = (s, s) if isinstance(s, (int, float)) else s
        else:
            sx = sy = float(scale)
        if twist is not None:
            a = twist(t)
            ca, sa = math.cos(a), math.sin(a)
            N, B = N * ca + B * sa, B * ca - N * sa
        ring = [bm.verts.new(p + N * (px * sx) + B * (py * sy)) for px, py in profile]
        rings.append((ring, t))
    uv = bm.loops.layers.uv.verify()
    count = len(rings) if closed else len(rings) - 1
    for i in range(count):
        ra, ta = rings[i]
        rb, tb = rings[(i + 1) % len(rings)]
        if closed and i == len(rings) - 1:
            tb = 1.0
        for j in range(m):
            j2 = (j + 1) % m
            try:
                f = bm.faces.new((ra[j], ra[j2], rb[j2], rb[j]))
            except ValueError:
                continue
            u0, u1 = j / m, (j + 1) / m
            for loop, (u, v) in zip(f.loops, ((u0, ta), (u1, ta), (u1, tb), (u0, tb))):
                loop[uv].uv = (u, v)
    if caps and not closed:
        for ring, t, rev in ((rings[0][0], 0.0, True), (rings[-1][0], 1.0, False)):
            verts = list(reversed(ring)) if rev else list(ring)
            try:
                f = bm.faces.new(verts)
                for loop in f.loops:
                    loop[uv].uv = (0.5, t)
            except ValueError:
                pass
    bm.normal_update()
    return bm


def tube(path, radius, sides=12, **kw):
    """Round tube; radius is a float or f(t) -> float."""
    prof = circle_profile(sides)
    return sweep(path, prof, scale=radius, **kw)


# ------------------------------------------------------------------ 2D outlines
def signed_area(outline):
    a = 0.0
    for (x0, y0), (x1, y1) in zip(outline, outline[1:] + outline[:1]):
        a += x0 * y1 - x1 * y0
    return 0.5 * a


def ccw(outline):
    outline = [tuple(p) for p in outline]
    return outline if signed_area(outline) > 0 else outline[::-1]


def blade_outline(spine, width, n=48, root_flat=True):
    """Closed CCW outline around a 2D spine (list of (x, y), root first).
    width(t) -> full width at t (0 root .. 1 tip); width(1) == 0 gives a point."""
    sp = [Vector((x, y, 0.0)) for x, y in spine]
    if len(sp) > 2:
        sp = catmull_rom(sp, 8)
    sp = resample(sp, n)
    left, right = [], []
    for i, p in enumerate(sp):
        if i == 0:
            t = sp[1] - sp[0]
        elif i == n - 1:
            t = sp[-1] - sp[-2]
        else:
            t = sp[i + 1] - sp[i - 1]
        t.normalize()
        nrm = Vector((-t.y, t.x, 0.0))
        w = width(i / (n - 1)) * 0.5
        left.append(p + nrm * w)
        right.append(p - nrm * w)
    if width(1.0) < 1e-6:
        out = left[:-1] + [sp[-1]] + list(reversed(right[:-1]))
    else:
        out = left + list(reversed(right))
    return ccw([(v.x, v.y) for v in out])


def offset_outline(outline, d, miter=2.5):
    """Offset a CCW polygon by d (positive = outward). Same vertex count."""
    n = len(outline)
    P = [Vector((x, y)) for x, y in outline]
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        e0 = (b - a).normalized()
        e1 = (c - b).normalized()
        n0 = Vector((e0.y, -e0.x))
        n1 = Vector((e1.y, -e1.x))
        m = n0 + n1
        if m.length < 1e-6:
            m = n0
        m.normalize()
        cosh = max(m.dot(n1), 1.0 / miter)
        out.append(tuple(b + m * (d / cosh)))
    return out


def point_in_polygon(pts, poly):
    """Vectorised even-odd test. pts (N, 2), poly list of (x, y)."""
    pts = np.asarray(pts, dtype=float)
    poly = np.asarray(poly, dtype=float)
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    xj, yj = poly[-1]
    for xi, yi in poly:
        cond = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-300) + xi)
        inside ^= cond
        xj, yj = xi, yi
    return inside


def densify(outline, step, closed=True):
    out = []
    pts = list(outline) + ([outline[0]] if closed else [])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        k = max(1, int(math.ceil(L / step)))
        for i in range(k):
            out.append((x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k))
    if not closed:
        out.append(pts[-1])
    return out


def _uv_from_xy(bm, xy_of_vert, bounds):
    (x0, x1), (y0, y1) = bounds
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for loop in f.loops:
            x, y = xy_of_vert(loop.vert)
            loop[uv].uv = ((x - x0) / max(x1 - x0, 1e-9), (y - y0) / max(y1 - y0, 1e-9))


def prism(outline, depth, bevel=0.0, bevel_seg=2, matrix=None, centered=False, uv_bounds=None):
    """Extrude a 2D CCW outline (local x, y) by `depth` along local +z.

    bevel     : bevel width on all outline edges (0 = sharp)
    matrix    : 4x4 local -> world (see frame(), frame_from_normal())
    centered  : extrude from -depth/2 to +depth/2
    UV        : planar from local (x, y): u across x, v along y (v = 0 at the
                outline's lowest y). Pass uv_bounds=((x0, x1), (y0, y1)) to fix it.
    """
    outline = ccw(outline)
    bm = bmesh.new()
    z0 = -depth / 2 if centered else 0.0
    verts = [bm.verts.new((x, y, z0)) for x, y in outline]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [e for e in res["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0.0, 0.0, depth), verts=top)
    bmesh.ops.reverse_faces(bm, faces=[face])
    bm.normal_update()
    if bevel > 0:
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=bevel_seg, affect="EDGES", profile=0.5, clamp_overlap=True)
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    bounds = uv_bounds or ((min(xs), max(xs)), (min(ys), max(ys)))
    _uv_from_xy(bm, lambda v: (v.co.x, v.co.y), bounds)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    if matrix is not None:
        transform(bm, matrix)
    bm.normal_update()
    return bm


def band(outline, width, depth, bevel=0.0, matrix=None, centered=False, outward=False):
    """A frame band between `outline` and its inset (or outset) by `width`,
    extruded by `depth`. Gold rims around crystals and gems."""
    outline = ccw(outline)
    other = offset_outline(outline, width if outward else -width)
    outer, inner = (other, outline) if outward else (outline, other)
    bm = bmesh.new()
    z0 = -depth / 2 if centered else 0.0
    n = len(outer)
    rings = []
    for z in (z0, z0 + depth):
        rings.append(([bm.verts.new((x, y, z)) for x, y in outer], [bm.verts.new((x, y, z)) for x, y in inner]))
    (ob, ib), (ot, it) = rings
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ot[i], ot[j], it[j], it[i]))  # top
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))  # bottom
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))  # outer wall
        bm.faces.new((ib[j], ib[i], it[i], it[j]))  # inner wall
    bm.normal_update()
    if bevel > 0:
        sharp = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    _uv_from_xy(bm, lambda v: (v.co.x, v.co.y), ((min(xs), max(xs)), (min(ys), max(ys))))
    if matrix is not None:
        transform(bm, matrix)
    bm.normal_update()
    return bm


def ring(r_out, r_in, depth, seg=64, round_edge=0.0, matrix=None):
    """Flat ring (washer) in the local xy plane, depth along +z (centred).
    round_edge > 0 rounds the four rims."""
    w = r_out - r_in
    prof = rounded_rect_profile(w, depth, round_edge, 2) if round_edge > 0 else [
        (w / 2, depth / 2), (-w / 2, depth / 2), (-w / 2, -depth / 2), (w / 2, -depth / 2)]
    rc = (r_out + r_in) / 2
    path = [Vector((rc * math.cos(2 * math.pi * i / seg), rc * math.sin(2 * math.pi * i / seg), 0.0)) for i in range(seg)]
    normals = [Vector((p.x, p.y, 0.0)).normalized() for p in path]
    bm = sweep(path, prof, normals=normals, closed=True)
    if matrix is not None:
        transform(bm, matrix)
    return bm


def disc(r, depth, seg=48, dome=0.0, matrix=None):
    """Closed disc (cylinder) of radius r, optional domed top of height `dome`."""
    bm = bmesh.new()
    bot = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), 0.0)) for i in range(seg)]
    top = [bm.verts.new((v.co.x, v.co.y, depth)) for v in bot]
    bm.faces.new(list(reversed(bot)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    if dome > 0:
        rings = 4
        prev = top
        for k in range(1, rings):
            a = (k / rings) * math.pi / 2
            rr = r * math.cos(a)
            z = depth + dome * math.sin(a)
            cur = [bm.verts.new((rr * math.cos(2 * math.pi * i / seg), rr * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
            for i in range(seg):
                j = (i + 1) % seg
                bm.faces.new((prev[i], prev[j], cur[j], cur[i]))
            prev = cur
        apex = bm.verts.new((0.0, 0.0, depth + dome))
        for i in range(seg):
            bm.faces.new((prev[i], prev[(i + 1) % seg], apex))
    else:
        bm.faces.new(top)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (0.5 + loop.vert.co.x / (2 * r), 0.5 + loop.vert.co.y / (2 * r))
    if matrix is not None:
        transform(bm, matrix)
    bm.normal_update()
    return bm


# ------------------------------------------------------------------ gems
def gem_kite(w, h, depth, table=0.45, matrix=None, h_top=None):
    """Faceted rhombus gem in the local xy plane, rising along +z.
    w, h: full width/height of the girdle; table: relative size of the flat top;
    h_top: optional upper half-height for kite shapes (default h/2)."""
    ht = h / 2 if h_top is None else h_top
    hb = h - ht
    girdle = [(w / 2, 0.0), (0.0, ht), (-w / 2, 0.0), (0.0, -hb)]
    mids = [((girdle[i][0] + girdle[(i + 1) % 4][0]) / 2, (girdle[i][1] + girdle[(i + 1) % 4][1]) / 2) for i in range(4)]
    bm = bmesh.new()
    g = []
    for i in range(4):
        g.append(bm.verts.new((*girdle[i], 0.0)))
        g.append(bm.verts.new((*mids[i], 0.0)))
    crown = [bm.verts.new((x * table, y * table, depth)) for x, y in girdle]
    star = [bm.verts.new((mx * (0.5 + table / 2), my * (0.5 + table / 2), depth * 0.72)) for mx, my in mids]
    for i in range(4):
        a, m, b = g[2 * i], g[2 * i + 1], g[(2 * i + 2) % 8]
        c0, c1 = crown[i], crown[(i + 1) % 4]
        s = star[i]
        bm.faces.new((a, m, s))
        bm.faces.new((m, b, s))
        bm.faces.new((a, s, c0))
        bm.faces.new((s, b, c1))
        bm.faces.new((c0, s, c1))
    bm.faces.new(crown)
    back = bm.verts.new((0.0, 0.0, -depth * 0.25))
    for i in range(8):
        bm.faces.new((g[(i + 1) % 8], g[i], back))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _uv_from_xy(bm, lambda v: (v.co.x, v.co.y), ((-w / 2, w / 2), (-hb, ht)))
    if matrix is not None:
        transform(bm, matrix)
    bm.normal_update()
    return bm


def gem_round(r, depth, n=16, table=0.5, matrix=None):
    """Round brilliant-style gem in the local xy plane, rising along +z."""
    bm = bmesh.new()
    gird = [bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), 0.0)) for i in range(n)]
    mid = [bm.verts.new((r * 0.78 * math.cos(2 * math.pi * (i + 0.5) / n), r * 0.78 * math.sin(2 * math.pi * (i + 0.5) / n), depth * 0.6)) for i in range(n)]
    top = [bm.verts.new((r * table * math.cos(2 * math.pi * i / n), r * table * math.sin(2 * math.pi * i / n), depth)) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((gird[i], gird[j], mid[i]))
        bm.faces.new((gird[j], top[j], mid[i]))
        bm.faces.new((gird[i], mid[i], top[i]))
        bm.faces.new((mid[i], top[j], top[i]))
    bm.faces.new(top)
    back = bm.verts.new((0.0, 0.0, -depth * 0.3))
    for i in range(n):
        bm.faces.new((gird[(i + 1) % n], gird[i], back))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _uv_from_xy(bm, lambda v: (v.co.x, v.co.y), ((-r, r), (-r, r)))
    if matrix is not None:
        transform(bm, matrix)
    bm.normal_update()
    return bm


# ------------------------------------------------------------------ body
VIEW_RAY = {
    "front": (lambda h, z: Vector((h, -3.0, z)), Vector((0.0, 1.0, 0.0))),
    "back": (lambda h, z: Vector((h, 3.0, z)), Vector((0.0, -1.0, 0.0))),
    "right": (lambda h, z: Vector((-3.0, h, z)), Vector((1.0, 0.0, 0.0))),
    "left": (lambda h, z: Vector((3.0, h, z)), Vector((-1.0, 0.0, 0.0))),
}


class Body:
    """Ray casts and closest points on the finished undersuit."""

    def __init__(self, ob):
        self.ob = ob
        me = ob.data
        verts = [ob.matrix_world @ v.co for v in me.vertices]
        polys = [tuple(p.vertices) for p in me.polygons]
        self.bvh = BVHTree.FromPolygons(verts, polys)

    def ray(self, origin, direction, dist=10.0):
        loc, nrm, _i, _d = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), dist)
        return (loc, nrm) if loc is not None else None

    def hit(self, view, h, z, smooth=0.008, start=None):
        """First surface point seen from `view` at view coords (h, z), with a
        normal averaged over a small cross of rays (radius `smooth`).
        start: optional distance of the ray origin from the mid-plane (metres),
        e.g. start=0.2 on a "left"/"right" view begins inside the arms so the
        ray lands on the flank instead of the arm."""
        org0, d = VIEW_RAY[view]
        if start is None:
            org = org0
        else:
            def org(hh, zz):
                o = org0(hh, zz)
                axis = 1 if view in ("front", "back") else 0
                o[axis] = math.copysign(start, o[axis])
                return o
        first = self.ray(org(h, z), d)
        if first is None:
            return None
        loc, n = first
        n = -n if n.dot(d) > 0 else n
        if smooth > 0:
            acc = Vector(n)
            for dh, dz in ((smooth, 0), (-smooth, 0), (0, smooth), (0, -smooth)):
                r = self.ray(org(h + dh, z + dz), d)
                if r is not None and (r[0] - loc).length < smooth * 3:
                    acc += -r[1] if r[1].dot(d) > 0 else r[1]
            n = acc.normalized()
        return loc, n

    def closest(self, p):
        loc, nrm, _i, _d = self.bvh.find_nearest(Vector(p))
        return loc, nrm


def surface_point(body, view, h, z, lift=0.0):
    r = body.hit(view, h, z)
    if r is None:
        return None
    loc, n = r
    return loc + n * lift, n


def conform_plate(body, view, outline, thickness=0.006, gap=0.003, res=0.012, bevel=0.0015, falloff=None):
    """A shell plate whose footprint is `outline` (CCW polygon of view
    coordinates (h, z) in metres, e.g. from rx_ref.px), laid on the body as
    seen from `view` ("front", "back", "right", "left").

    thickness may be a float or f(h, z) -> float (e.g. thicker in the middle).
    Returns a bmesh; UV is planar in (h, z) with v = 0 at the lowest z.
    """
    import scipy.spatial

    outline = ccw(outline)
    boundary = densify(outline, res * 0.75)
    xs = [p[0] for p in boundary]
    ys = [p[1] for p in boundary]
    gx, gy = np.meshgrid(np.arange(min(xs), max(xs), res), np.arange(min(ys), max(ys), res))
    grid = np.stack([gx.ravel(), gy.ravel()], axis=1)
    if len(grid):
        inside = point_in_polygon(grid, boundary)
        grid = grid[inside]
        B = np.asarray(boundary)
        if len(grid):
            dmin = np.min(np.linalg.norm(grid[:, None, :] - B[None, :, :], axis=2), axis=1)
            grid = grid[dmin > res * 0.45]
    pts2 = np.vstack([np.asarray(boundary), grid]) if len(grid) else np.asarray(boundary)
    nb = len(boundary)
    tri = scipy.spatial.Delaunay(pts2)
    simplices = []
    for s in tri.simplices:
        c = pts2[s].mean(axis=0)
        if point_in_polygon([c], boundary)[0]:
            simplices.append(s)
    # project
    hits = []
    last = None
    for h, z in pts2:
        r = body.hit(view, h, z)
        if r is None:
            # The footprint overhangs the silhouette: continue at the depth of
            # the previous hit (or the body's mid-plane) and snap to the body.
            org, d = VIEW_RAY[view]
            if last is None:
                guess = Vector((h, 0.0, z)) if view in ("front", "back") else Vector((0.0, h, z))
            else:
                guess = org(h, z) + d * ((last[0] - org(h, z)).dot(d))
            r = body.closest(guess)
        hits.append(r)
        last = r
    P = [Vector(r[0]) for r in hits]
    # vertex normals from the projected sheet itself (smooth), oriented like the hits
    acc = [Vector((0.0, 0.0, 0.0)) for _ in P]
    for a, b, c in simplices:
        n = (P[b] - P[a]).cross(P[c] - P[a])
        for i in (a, b, c):
            acc[i] += n
    N = []
    for i, n in enumerate(acc):
        n = n.normalized() if n.length > 1e-12 else Vector(hits[i][1])
        if n.dot(Vector(hits[i][1])) < 0:
            n = -n
        N.append(n)
    bm = bmesh.new()
    th = thickness if callable(thickness) else (lambda h, z, t=thickness: t)
    inner = [bm.verts.new(P[i] + N[i] * gap) for i in range(len(P))]
    outer = [bm.verts.new(P[i] + N[i] * (gap + th(*pts2[i]))) for i in range(len(P))]
    for a, b, c in simplices:
        # orient outer faces to point along N
        fa = (outer[a], outer[b], outer[c])
        n = (fa[1].co - fa[0].co).cross(fa[2].co - fa[0].co)
        if n.dot(N[a]) < 0:
            fa = (outer[a], outer[c], outer[b])
            fi = (inner[a], inner[b], inner[c])
        else:
            fi = (inner[a], inner[c], inner[b])
        bm.faces.new(fa)
        bm.faces.new(fi)
    for i in range(nb):
        j = (i + 1) % nb
        f = bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
        mid = (P[i] + P[j]) * 0.5
        if f.normal.dot(f.calc_center_median() - mid) < -1e-9:
            f.normal_flip()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if bevel > 0:
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5]
        outer_set = set(outer)
        rim = [e for e in rim if e.verts[0] in outer_set and e.verts[1] in outer_set]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    # planar UV from view coordinates
    uvmap = {}
    for i, v in enumerate(inner):
        uvmap[v] = pts2[i]
    for i, v in enumerate(outer):
        uvmap[v] = pts2[i]
    x0, x1 = float(np.min(pts2[:, 0])), float(np.max(pts2[:, 0]))
    y0, y1 = float(np.min(pts2[:, 1])), float(np.max(pts2[:, 1]))
    uv = bm.loops.layers.uv.verify()
    proj_axis = 0 if view in ("front", "back") else 1
    for f in bm.faces:
        for loop in f.loops:
            if loop.vert in uvmap:
                h, z = uvmap[loop.vert]
            else:
                h, z = loop.vert.co[proj_axis], loop.vert.co.z
            loop[uv].uv = ((h - x0) / max(x1 - x0, 1e-9), (z - y0) / max(y1 - y0, 1e-9))
    return bm


def conform_strip(body, view, path, width, thickness=0.004, gap=0.003, res=0.008, width_fn=None, profile=None, lift_fn=None):
    """A raised trim following a 2D path drawn in `view` coordinates (h, z),
    laid on the body. width_fn(t) scales the width along the path (0 root..1 end),
    e.g. lambda t: 1 - t for a tapering point. Returns a bmesh (UV v along path)."""
    P2 = densify([tuple(p) for p in path], res, closed=False)
    pts, nrms = [], []
    for h, z in P2:
        r = body.hit(view, h, z)
        if r is None:
            continue
        pts.append(r[0])
        nrms.append(r[1])
    if len(pts) < 2:
        return bmesh.new()
    lifted = []
    for i, (p, n) in enumerate(zip(pts, nrms)):
        t = i / (len(pts) - 1)
        extra = lift_fn(t) if lift_fn else 0.0
        lifted.append(p + n * (gap + thickness * 0.5 + extra))
    prof = profile or rounded_rect_profile(thickness, 1.0, thickness * 0.35, 2)
    # profile x runs along N (thickness), y along B (width)
    w = width
    wf = width_fn or (lambda t: 1.0)
    return sweep(lifted, prof, scale=lambda t: (1.0, max(w * wf(t), 1e-4)), normals=nrms)
