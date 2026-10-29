"""Shared geometry vocabulary for the guardian v3 rebuild (Blender 4.5 LTS).

Everything the reference paintings repeat is built from a few primitives:
rotation-minimizing-frame tubes and flat ribbons, log spirals, and the
"crosier" (a fern-fiddlehead hook: a straight stem that tightens into a curl).
Vertex colours are authored per vertex in linear RGB (COLOR_0 "GuardianSurface").

Coordinates: authoring happens in glTF axes (x right, y up, z toward the viewer)
and is converted to Blender axes with P() exactly like the v2 scripts.
"""
import math, random
import bpy, bmesh
import numpy as np
from mathutils import Vector


def P(x):
    """glTF (x, y, z) -> Blender (x, -z, y)."""
    return Vector((float(x[0]), -float(x[2]), float(x[1])))


def V(x):
    return np.asarray(x, float)


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def catmull(controls, steps=12):
    cs = np.asarray(controls, float)
    ps = []
    for i in range(len(cs) - 1):
        p0, p1, p2, p3 = cs[max(0, i - 1)], cs[i], cs[i + 1], cs[min(len(cs) - 1, i + 2)]
        for j in range(steps):
            t = j / steps
            ps.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                             + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    ps.append(cs[-1])
    return np.asarray(ps)


def arclength(points):
    d = np.linalg.norm(np.diff(points, axis=0), axis=1)
    return np.concatenate(([0.0], np.cumsum(d)))


def resample(points, count=None, spacing=None):
    """Arc-length resample of a polyline."""
    points = np.asarray(points, float)
    arc = arclength(points)
    if count is None:
        count = max(4, int(arc[-1] / spacing) + 1)
    s = np.linspace(0, arc[-1], count)
    return np.stack([np.interp(s, arc, points[:, c]) for c in range(3)], axis=1)


def rmf_frames(points, hint=(0, 0, 1)):
    """Rotation-minimizing frames (double reflection). Returns T, N, B arrays.
    N starts as the hint projected perpendicular to the first tangent and is
    transported without twist; planar curves keep N fixed when hint is the plane normal."""
    pts = np.asarray(points, float)
    n = len(pts)
    T = np.zeros((n, 3))
    for i in range(n):
        T[i] = unit(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
    h = V(hint)
    r0 = h - T[0] * np.dot(h, T[0])
    if np.linalg.norm(r0) < 1e-6:
        alt = V((1, 0, 0)) if abs(T[0][0]) < 0.9 else V((0, 1, 0))
        r0 = alt - T[0] * np.dot(alt, T[0])
    R = [unit(r0)]
    for i in range(n - 1):
        v1 = pts[i + 1] - pts[i]
        c1 = np.dot(v1, v1)
        if c1 < 1e-14:
            R.append(R[i])
            continue
        rL = R[i] - (2 / c1) * np.dot(v1, R[i]) * v1
        tL = T[i] - (2 / c1) * np.dot(v1, T[i]) * v1
        v2 = T[i + 1] - tL
        c2 = np.dot(v2, v2)
        r = rL - (2 / c2) * np.dot(v2, rL) * v2 if c2 > 1e-14 else rL
        R.append(unit(r))
    N = np.asarray(R)
    B = np.cross(T, N)
    return T, N, B


def log_spiral(center, e1, e2, R, k, turns, n, start_angle=0.0, direction=-1.0, lift=None):
    """Points of r = R*exp(-k*theta), theta in [0, 2*pi*turns].
    direction -1 = clockwise when (e1, e2) is (right, up) seen from the viewer.
    lift(theta_fraction) adds an offset along e3 = e1 x e2 (dome / cone)."""
    center, e1, e2 = V(center), unit(V(e1)), unit(V(e2))
    e3 = np.cross(e1, e2)
    pts = []
    for i in range(n):
        f = i / (n - 1)
        th = f * math.tau * turns
        r = R * math.exp(-k * th)
        a = start_angle + direction * th
        p = center + e1 * (r * math.cos(a)) + e2 * (r * math.sin(a))
        if lift is not None:
            p = p + e3 * lift(f, r / R)
        pts.append(p)
    return np.asarray(pts)


def crosier_path(base, direction, curl_toward, length, turns=0.85, straight=0.30, n=None, bend_power=2.2):
    """A fern-fiddlehead hook.  Starts at `base` heading along `direction`, then its
    heading angle increases toward `curl_toward` as ((s-s0)/(L-s0))**bend_power, ending
    after `turns` revolutions.  Planar: lies in the plane spanned by direction/curl_toward."""
    d = unit(V(direction))
    c = V(curl_toward) - d * np.dot(V(curl_toward), d)
    c = unit(c)
    if n is None:
        n = max(10, int(length / 0.012))
    pts = []
    pos = V(base).copy()
    ds = length / (n - 1)
    s0 = straight * length
    for i in range(n):
        s = i * ds
        pts.append(pos.copy())
        if s < s0:
            phi = 0.0
        else:
            phi = math.tau * turns * ((s - s0) / max(1e-9, length - s0)) ** bend_power
        pos = pos + (d * math.cos(phi) + c * math.sin(phi)) * ds
    return np.asarray(pts)


def noise1(x, seed=0.0):
    """Cheap deterministic 1D noise in [-1, 1]."""
    return (math.sin(x * 1.7 + seed) * 0.55 + math.sin(x * 4.3 + seed * 1.3 + 1.1) * 0.30
            + math.sin(x * 9.1 - seed * 0.7 + 2.3) * 0.15)


# ---------------------------------------------------------------- colours (linear RGB)
INK = (0.008, 0.020, 0.012)         # black-green body/tentacle ink
MEMBRANE = (0.012, 0.045, 0.022)    # dark green membrane cells
MEMBRANE_LIT = (0.045, 0.14, 0.07)  # membrane catching light near the glow
BONE = (0.22, 0.30, 0.21)           # pale grey-green bone
BONE_EDGE = (0.42, 0.54, 0.40)      # pale rim of a bone rib
BONE_ROOT = (0.07, 0.11, 0.07)      # bone darkening toward its root / cavity
GLOW = (0.55, 1.0, 0.62)            # emissive pale green (also used as vertex tint)


def mix(a, b, t):
    t = min(1.0, max(0.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


class MeshBuilder:
    """Collects vertices (Blender space), faces, per-vertex colours, optional per-vertex UVs."""

    def __init__(self, name, parent, materials):
        self.name = name
        self.parent = parent
        self.materials = list(materials) if isinstance(materials, (list, tuple)) else [materials]
        self.v = []
        self.c = []
        self.uv = []
        self.f = []
        self.fm = []  # material index per face
        self.vw = []  # per-vertex skin weights: list of (bone, weight) or None
        self.cur_w = None  # weights applied to vertices added while set

    # -- low level
    def add_vertex(self, p_gltf, color, uv=(0.0, 0.0), weights=None):
        self.v.append(tuple(P(p_gltf)))
        self.c.append(tuple(color))
        self.uv.append(tuple(uv))
        self.vw.append(weights if weights is not None else self.cur_w)
        return len(self.v) - 1

    def add_face(self, idx, mat=0):
        self.f.append(tuple(idx))
        self.fm.append(mat)

    # -- swept tube with an elliptical (optionally flattened) section
    def tube(self, path, radii, sides=8, flat=1.0, color=BONE, color_fn=None, hint=(0, 0, 1),
             cap=True, mat=0, uv_fn=None, frames=None, taper_end=False, profile=None, weights_fn=None):
        """path: (n,3) glTF points. radii: scalar or (n,). flat: scale along N (frame normal).
        color_fn(i, t, j, a) -> rgb per vertex (i: ring index, t: 0..1 along, j: side index, a: angle).
        profile(a) -> (x, y) multiplier pair in the (B, N) plane for custom sections."""
        path = np.asarray(path, float)
        n = len(path)
        rr = np.full(n, radii, float) if np.isscalar(radii) else np.asarray(radii, float)
        if frames is None:
            T, N, B = rmf_frames(path, hint)
        else:
            T, N, B = frames
        start = len(self.v)
        for i in range(n):
            t = i / max(1, n - 1)
            r = rr[i]
            if taper_end and i == n - 1:
                r = 0.0005
            w = weights_fn(i, t) if weights_fn else None
            for j in range(sides):
                a = j * math.tau / sides
                if profile is not None:
                    px, py = profile(a)
                else:
                    px, py = math.cos(a), math.sin(a)
                p = path[i] + B[i] * (px * r) + N[i] * (py * r * flat)
                col = color_fn(i, t, j, a) if color_fn else color
                uv = uv_fn(i, t, j, a) if uv_fn else (t, j / sides)
                self.add_vertex(p, col, uv, w)
        for i in range(n - 1):
            for j in range(sides):
                a = start + i * sides + j
                b = start + i * sides + (j + 1) % sides
                self.add_face((a, a + sides, b + sides, b), mat)
        if cap:
            self.add_face(tuple(start + j for j in range(sides)), mat)
            self.add_face(tuple(start + (n - 1) * sides + j for j in reversed(range(sides))), mat)
        return start, len(self.v)

    # -- flat ribbon: a lens-shaped closed section (width along B, thickness along N)
    def ribbon(self, path, widths, thick, sides=14, color=INK, color_fn=None, hint=(0, 0, 1),
               bulge=1.0, mat=0, uv_fn=None, edge_sharp=0.55, weights_fn=None):
        widths = np.asarray(widths, float) if not np.isscalar(widths) else np.full(len(path), widths)
        thick = np.asarray(thick, float) if not np.isscalar(thick) else np.full(len(path), thick)
        path = np.asarray(path, float)
        T, N, B = rmf_frames(path, hint)

        def prof(a):
            # superellipse-ish lens: wide along B, thin along N, sharp-ish edges
            cx, cy = math.cos(a), math.sin(a)
            return cx, math.copysign(abs(cy) ** edge_sharp, cy) * (1.0 if cy < 0 else bulge)

        radii = widths * 0.5
        start = len(self.v)
        n = len(path)
        for i in range(n):
            t = i / max(1, n - 1)
            w = weights_fn(i, t) if weights_fn else None
            for j in range(sides):
                a = j * math.tau / sides
                px, py = prof(a)
                p = path[i] + B[i] * (px * radii[i]) + N[i] * (py * thick[i] * 0.5)
                col = color_fn(i, t, j, a) if color_fn else color
                uv = uv_fn(i, t, j, a) if uv_fn else (t, j / sides)
                self.add_vertex(p, col, uv, w)
        for i in range(n - 1):
            for j in range(sides):
                a = start + i * sides + j
                b = start + i * sides + (j + 1) % sides
                self.add_face((a, a + sides, b + sides, b), mat)
        self.add_face(tuple(start + j for j in range(sides)), mat)
        self.add_face(tuple(start + (n - 1) * sides + j for j in reversed(range(sides))), mat)
        return (T, N, B), start

    # -- open quad patch from a grid of glTF points (rows x cols x 3)
    def patch(self, grid, color=MEMBRANE, color_fn=None, flip=False, mat=0, uv_fn=None, skip_fn=None):
        """skip_fn(u, v) -> True leaves that quad out (a real hole in the patch)."""
        grid = np.asarray(grid, float)
        rows, cols = grid.shape[0], grid.shape[1]
        start = len(self.v)
        for i in range(rows):
            for j in range(cols):
                col = color_fn(i / (rows - 1), j / (cols - 1)) if color_fn else color
                uv = uv_fn(i / (rows - 1), j / (cols - 1)) if uv_fn else (i / (rows - 1), j / (cols - 1))
                self.add_vertex(grid[i, j], col, uv)
        for i in range(rows - 1):
            for j in range(cols - 1):
                if skip_fn and skip_fn((i + 0.5) / (rows - 1), (j + 0.5) / (cols - 1)):
                    continue
                a = start + i * cols + j
                face = (a, a + cols, a + cols + 1, a + 1)
                self.add_face(tuple(reversed(face)) if flip else face, mat)
        return start

    # -- crosier hook as a tapered tube
    def crosier(self, base, direction, curl_toward, length, radius, turns=0.85, straight=0.30,
                sides=7, color_root=BONE_ROOT, color_tip=BONE_EDGE, hint=None, mat=0, taper=0.80,
                bend_power=2.2):
        path = crosier_path(base, direction, curl_toward, length, turns, straight, bend_power=bend_power)
        n = len(path)
        t = np.linspace(0, 1, n)
        radii = radius * (1 - taper * t ** 0.9) + 0.0008
        plane_normal = unit(np.cross(unit(V(direction)), unit(V(curl_toward))))
        h = plane_normal if hint is None else hint

        def cf(i, tt, j, a):
            return mix(color_root, color_tip, tt ** 0.7)

        return self.tube(path, radii, sides=sides, color_fn=cf, hint=h, mat=mat, taper_end=True)

    # -- finish into a Blender object
    def finish(self, smooth_shade=True, micro_uv_scale=2.1):
        me = bpy.data.meshes.new(self.name + "Mesh")
        me.from_pydata(self.v, [], self.f)
        me.update()
        for m in self.materials:
            me.materials.append(m)
        if len(self.materials) > 1:
            for poly, mi in zip(me.polygons, self.fm):
                poly.material_index = mi
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = self.parent
        if smooth_shade:
            for p in me.polygons:
                p.use_smooth = True
        # vertex colours (linear RGBA, POINT domain)
        col = me.color_attributes.new(name="GuardianSurface", type="BYTE_COLOR", domain="POINT")
        rgba = np.concatenate([np.asarray(self.c, float), np.ones((len(self.c), 1))], axis=1)
        col.data.foreach_set("color", rgba.ravel())
        me.color_attributes.active_color_index = 0
        me.color_attributes.render_color_index = 0
        # authored UV (emissive / detail maps) in a second layer, micro projection first
        write_micro_uv(me, micro_uv_scale)
        if any(abs(u[0]) + abs(u[1]) > 0 for u in self.uv):
            layer = me.uv_layers.new(name="AuthoredUV")
            vals = np.zeros((len(me.loops), 2))
            uvs = np.asarray(self.uv, float)
            for loop in me.loops:
                vals[loop.index] = uvs[loop.vertex_index]
            layer.data.foreach_set("uv", vals.ravel())
        # skin weights -> vertex groups (same vertex order as from_pydata)
        if any(w for w in self.vw):
            groups = {}
            for idx, w in enumerate(self.vw):
                if not w:
                    continue
                for bone, value in w:
                    if value > 1e-4:
                        groups.setdefault(bone, []).append((idx, value))
            for bone, items in groups.items():
                vg = ob.vertex_groups.new(name=bone)
                for idx, value in items:
                    vg.add([idx], float(value), "REPLACE")
        me.update()
        return ob


def write_micro_uv(me, scale=2.1):
    """Per-polygon planar projection along the dominant normal axis (tiled micro maps)."""
    uv = me.uv_layers.get("MicroSurfaceUV") or me.uv_layers.new(name="MicroSurfaceUV")
    co = np.array([tuple(v.co) for v in me.vertices])
    vals = np.zeros((len(me.loops), 2))
    for p in me.polygons:
        axis = int(np.argmax(np.abs(p.normal)))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for li in p.loop_indices:
            vals[li] = co[me.loops[li].vertex_index, list(axes)] * scale
    uv.data.foreach_set("uv", vals.ravel())


def clean(ob, dist=2e-5):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def mesh_audit(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    rec = {"mesh": ob.name, "vertices": len(bm.verts), "faces": len(bm.faces),
           "triangles": sum(len(f.verts) - 2 for f in bm.faces),
           "boundaryEdges": sum(e.is_boundary for e in bm.edges),
           "nonManifoldEdges": sum(not e.is_manifold for e in bm.edges)}
    bm.free()
    return rec


def material_from(src_name, new_name):
    """Copy a v2 material (vertex colour + tiled micro normal/ORM) but never drive Metallic
    from the ORM blue channel: a metallic ink surface mirrors the environment and reads grey."""
    src = bpy.data.materials.get(src_name)
    m = src.copy()
    m.name = new_name
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    # The old ORM green channel made the surface glossy (broad pale highlights on flat ink);
    # roughness is authored as a scalar per material and only the micro normal map is kept.
    for link in list(nt.links):
        if link.to_node == b and link.to_socket.name in ("Metallic", "Roughness"):
            nt.links.remove(link)
    for node in list(nt.nodes):
        if node.type == "TEX_IMAGE" and node.image and node.image.name.endswith("-orm"):
            nt.nodes.remove(node)
        elif node.type == "SEPARATE_COLOR":
            nt.nodes.remove(node)
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Coat Weight"].default_value = 0.0
    return m


def set_principled(m, **kw):
    b = m.node_tree.nodes.get("Principled BSDF")
    for key, val in kw.items():
        b.inputs[key].default_value = val
    return b
