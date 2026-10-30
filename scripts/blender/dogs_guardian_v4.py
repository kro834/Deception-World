"""Guardian (シエル) v4: r9 organ geometry + the v3 material/colour system + targeted gains.

Coordinator review of v3 (2026-10-29): the r9 shell lattice, whorl curl leaves and fronds read
closer to the paintings than the v3 rebuilds; keep them. Keep from v3: no ORM metal/gloss, role
vertex colours (bone pale / ink black-green / membrane deep green) with one cavity-AO multiply,
the glowing lattice leaf fused to the head, the bead rows on the tendrils, the rig.

Gains applied on top of the r9 geometry, each organ separately:
  fronds : large, dense crosier chains along the toothed edge; ink body with a pale edge
  shell  : pale rib-net contrast (outer walls bone, inner walls membrane), a dark inner core
           behind the cells (some left as real openings), a veined net branching from the
           spine over the dorsal shield
  whorls : dark arm with pale curl leaves (root dark -> tip pale), rim crosier chains that
           tighten toward a bright green emissive core

Usage:
  Blender --background --python dogs_guardian_v4.py -- --source browser.blend --out DIR
      [--gains fronds,whorls,shell,face,head,ao] [--export 1] [--stamp v4]
"""
import sys, math, json, time, hashlib, struct, os
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector, Quaternion, Matrix

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from guardian_v3_lib import (P, V, unit, lerp, smooth, catmull, resample, rmf_frames, crosier_path, noise1,
                             INK, MEMBRANE, MEMBRANE_LIT, BONE, BONE_EDGE, BONE_ROOT, GLOW, mix,
                             MeshBuilder, clean, mesh_audit, material_from, set_principled)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {"source": "", "out": "", "gains": "fronds,whorls,shell,face,head,ao", "export": "0", "decimate": "1",
        "stamp": "v4"}
for i in range(0, len(argv), 2):
    opts[argv[i].lstrip("-")] = argv[i + 1]
OUT = Path(opts["out"]); OUT.mkdir(parents=True, exist_ok=True)
GAINS = set(opts["gains"].split(","))
START = time.time()
SOURCE_SCRIPTS = ["scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v4.py",
                  "scripts/blender/dogs_guardian_v3_export.py"]
MANIFEST_STAGE = "v4: r9 organ geometry with the v3 material system, fused face and targeted gains"

bpy.ops.wm.open_mainfile(filepath=opts["source"])
root = bpy.data.objects["GuardianV_Root"]; body = bpy.data.objects["BodyPivot"]
head = bpy.data.objects["HeadPivot"]; jaw = bpy.data.objects["JawPivot"]; rig = bpy.data.objects["NeckRig"]
pivots = sorted([o for o in root.children_recursive if o.name.startswith("TentaclePivot_")], key=lambda o: o.name)


def Pinv(b):
    return (b.x, b.z, -b.y)


def find(prefix):
    return next((o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(prefix)), None)


def remove(prefixes):
    for ob in list(bpy.data.objects):
        if ob.type == "MESH" and any(ob.name.startswith(p) for p in prefixes):
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- materials (v3 system)
BONE_MAT = bpy.data.materials.get("Bone | v3 lattice") or material_from("Bone | v2 clay", "Bone | v3 lattice")
INK_MAT = bpy.data.materials.get("Skin | v3 ink") or material_from("Skin | v2 clay", "Skin | v3 ink")
set_principled(INK_MAT, Roughness=0.58)
set_principled(BONE_MAT, Roughness=0.66)


def glow_material(name, color, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "GuardianSurface"
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.5
    return m


CORE_MAT = glow_material("Rune | v3 whorl core", (0.30, 0.95, 0.42), 0.8)
WALL_DARK = (0.030, 0.062, 0.034)   # deep green body wall (the painting's dark ground)
WALL_MID = (0.085, 0.130, 0.080)    # wall catching light


def assign(ob, mat):
    me = ob.data
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons:
        p.material_index = 0


# ---------------------------------------------------------------- vertex helpers
def mesh_arrays(ob):
    """Vertex positions and normals in glTF axes (x right, y up, z front), object-local."""
    me = ob.data; n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    nr = np.empty(n * 3); me.vertices.foreach_get("normal", nr); nr = nr.reshape(-1, 3)
    g = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)
    gn = np.stack([nr[:, 0], nr[:, 2], -nr[:, 1]], 1)
    return g, gn


def set_colors(ob, rgb):
    me = ob.data
    layer = me.color_attributes.get("GuardianSurface")
    if layer is not None and (layer.domain != "POINT" or layer.data_type != "BYTE_COLOR"):
        me.color_attributes.remove(layer); layer = None
    if layer is None:
        layer = me.color_attributes.new(name="GuardianSurface", type="BYTE_COLOR", domain="POINT")
    rgb = np.clip(np.asarray(rgb, float), 0, 1)
    layer.data.foreach_set("color", np.c_[rgb, np.ones(len(rgb))].ravel())
    idx = list(me.color_attributes).index(layer)
    me.color_attributes.active_color_index = idx; me.color_attributes.render_color_index = idx
    me.update()


def vmix(a, b, t):
    a = np.asarray(a, float); b = np.asarray(b, float); t = np.clip(np.asarray(t, float), 0, 1)
    if a.ndim == 1:
        a = a[None, :]
    if b.ndim == 1:
        b = b[None, :]
    return a + (b - a) * t[:, None]


def convexity(ob):
    """Per-vertex convex curvature in [0, ~1]: 0 on flat walls and inside hollows, high on the
    rounded rims where a surface turns into a hole or a curl edge. The paintings keep bone pale
    only on those rims, so this drives the pale/dark split of every bone surface."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    out = np.zeros(len(bm.verts))
    for v in bm.verts:
        n = v.normal; acc = 0.0; cnt = 0
        for e in v.link_edges:
            d = (e.other_vert(v).co - v.co)
            L = d.length
            if L > 1e-9:
                acc += max(0.0, -(d.dot(n)) / L); cnt += 1
        out[v.index] = acc / cnt if cnt else 0.0
    bm.free()
    return out


def nearest(points, targets, chunk=6000):
    """Index of the nearest target for every point (chunked brute force)."""
    out = np.empty(len(points), int)
    for s in range(0, len(points), chunk):
        d2 = ((points[s:s + chunk, None, :] - targets[None, :, :]) ** 2).sum(-1)
        out[s:s + chunk] = d2.argmin(1)
    return out


# ---------------------------------------------------------------- r9 anatomy (same formulas as dogs_guardian_v2.py)
SHELL_CONTROLS = [(.12, 2.28, -.70), (-.04, 1.9, -.46), (.22, 1.45, -.13), (.62, .95, .28), (.53, .40, .39),
                  (.16, -.12, .08), (-.08, -.62, -.22), (.02, -1.03, -.36)]
SHELL_W = [.65, .78, .86, .90, .71, .45, .27, .15]
SHELL_D = [.55, .73, .90, .96, .79, .49, .29, .16]
S_PATH = resample(catmull(SHELL_CONTROLS, 16), count=180)
S_T = np.linspace(0, 1, len(S_PATH))
S_W = np.interp(S_T, np.linspace(0, 1, len(SHELL_CONTROLS)), SHELL_W)
S_D = np.interp(S_T, np.linspace(0, 1, len(SHELL_CONTROLS)), SHELL_D)
S_FR = rmf_frames(S_PATH, hint=(0, 0, 1))


def surf(s, a, inset=0.0):
    T, N, B = S_FR
    n = len(S_PATH)
    k = s * (n - 1); i = int(min(n - 2, k)); f = k - i
    c = S_PATH[i] * (1 - f) + S_PATH[i + 1] * f
    w = (S_W[i] * (1 - f) + S_W[i + 1] * f) - inset
    d = (S_D[i] * (1 - f) + S_D[i + 1] * f) - inset
    nn = unit(N[i] * (1 - f) + N[i + 1] * f); bb = unit(B[i] * (1 - f) + B[i + 1] * f)
    return c + nn * (d * math.cos(a)) + bb * (w * math.sin(a))


def surf_normal(s, a):
    return unit(surf(s, a) - surf(s, a, inset=0.05))


WHORLS = [  # centre, rx, ry, turns, phase, basewidth, base_depth, yaw(rad), core radius
    ((.94, 2.65, -.57), 1.13, 1.0, 2.70, 3.75, .178, .34, math.radians(30), .17),
    ((-.43, 1.53, .40), .53, .50, 2.35, 4.1, .105, .18, 0.0, .085),
    ((-.60, .68, .61), .36, .38, 2.05, 3.7, .080, .14, 0.0, .06),
]


def whorl_path(center, rx, ry, turns, phase, basewidth, base_depth, yaw):
    ps, ws = [], []
    for t in np.linspace(0, 1, int(160 * turns)):
        a = phase - t * math.tau * turns; r = (1 - t) ** .88 + .018
        dx = math.cos(a) * rx * r + .035 * rx * math.sin(a * .67) * r
        x = center[0] + dx * math.cos(yaw)
        y = center[1] + math.sin(a) * ry * r + .025 * ry * math.cos(a * .54) * r
        z = center[2] + dx * math.sin(yaw) + .12 * rx * math.sin(a * .67) + .19 * rx * math.sin(t * math.pi)
        ps.append((x, y, z)); ws.append(basewidth * (.28 + .72 * r) * (1 + .15 * math.sin(a * 1.3)))
    return np.asarray(ps), np.asarray(ws)


WHORL_PATHS = [whorl_path(*w[:8]) for w in WHORLS]

FRONDS_V2 = [
    ([(-.42, 1.73, -.35), (-1.18, 2.02, -.57), (-1.60, 2.75, -.77), (-1.74, 3.29, -.82), (-1.57, 3.44, -.76), (-1.39, 3.27, -.60)], .19),
    ([(-.23, 1.94, -.30), (-.57, 2.49, -.13), (-.82, 3.19, .14), (-1.0, 3.47, .22), (-.81, 3.57, .34), (-.66, 3.41, .42)], .19),
    ([(-.03, 2.02, -.28), (.03, 2.65, -.39), (-.18, 3.36, -.43), (-.38, 3.57, -.35), (-.51, 3.45, -.26)], .17),
    ([(-.61, 1.42, -.13), (-1.27, 1.63, -.09), (-1.79, 2.19, -.04), (-2.02, 2.51, .01), (-1.88, 2.65, .10), (-1.71, 2.52, .15)], .18),
    ([(.03, 1.98, -.30), (.32, 2.46, -.49), (.26, 3.01, -.59), (.38, 3.29, -.51)], .13),
    ([(-.56, 1.07, .24), (-1.31, .69, .43), (-1.88, -.03, .72), (-1.84, -.78, .95), (-1.42, -1.26, 1.14), (-.98, -1.10, 1.23), (-1.00, -.70, 1.14), (-1.23, -.56, 1.02), (-1.38, -.75, .92)], .41),
    ([(.76, 1.63, -.38), (1.62, 1.24, -.74), (1.99, .49, -.70), (1.82, -.23, -.38), (1.31, -.56, .11), (1.18, -.21, .46), (1.43, .01, .58), (1.61, -.16, .56)], .39),
    ([(-1.41, -1.22, .40), (-1.24, -1.69, .43), (-.88, -1.90, .39), (-.66, -1.68, .40), (-.83, -1.50, .47)], .17),
    ([(1.48, -.42, .30), (1.52, -.91, .39), (1.23, -1.22, .47), (.98, -1.05, .57), (1.12, -.84, .59)], .18),
    ([(1.28, -1.04, .40), (1.56, -1.43, .43), (1.39, -1.77, .48), (1.12, -1.67, .52), (1.17, -1.47, .59)], .15),
    ([(-1.54, -1.18, .32), (-1.91, -1.44, .29), (-2.00, -1.82, .37), (-1.69, -1.98, .42), (-1.48, -1.76, .46)], .17),
]


def frond_frame(control, width):
    """Exactly the v2 frond centreline, widths and frames (pivot-local, glTF axes)."""
    anchor = V(control[0])
    src = catmull([V(p) - anchor for p in control], 24)
    arc = np.concatenate(([0], np.cumsum(np.linalg.norm(np.diff(src, axis=0), axis=1))))
    distances = np.linspace(0, arc[-1], max(90, int(arc[-1] / .016)))
    ps = np.array([np.interp(distances, arc, src[:, c]) for c in range(3)]).T
    n = len(ps); tt = distances / arc[-1]
    tang = np.array([unit(ps[min(n - 1, i + 1)] - ps[max(0, i - 1)]) for i in range(n)])
    sides = np.array([unit(np.cross(t, V((0, 0, 1)))) for t in tang])
    normals = np.array([unit(np.cross(sd, t)) for sd, t in zip(sides, tang)])
    kappa = np.zeros(n)
    for i in range(1, n - 1):
        kappa[i] = np.linalg.norm(tang[i + 1] - tang[i - 1]) / max(1e-6, distances[i + 1] - distances[i - 1])
    ws = width * (.43 + .57 * np.sin(np.minimum(tt / .98, 1) * math.pi) ** .55) * (1 - tt) ** .48 + .003
    ws = np.minimum(ws, .40 / np.maximum(kappa, .05)); ws = np.maximum(ws, .003)
    return ps, ws, tang, sides, normals, distances, tt


TAIL_PATH = np.asarray([(.08 + .32 * math.sin(t * math.tau + math.pi) - .30 * t, -.80 - 2.95 * t,
                         -.26 + .28 * math.sin(t * math.pi * 1.5)) for t in np.linspace(0, 1, 116)])

# ================================================================ gains
meshes = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
shell = find("Shell |"); leaves = find("Bone | overlapping"); tail = find("Tail |")
fronds = [find("Frond_%02d" % i) for i in range(11)]
headmesh = find("Head |"); jawmesh = find("Jaw |")

for ob in (shell, leaves, tail):
    assign(ob, BONE_MAT)
for ob in fronds + [headmesh, jawmesh]:
    assign(ob, INK_MAT)

# ---- shell: rib-net contrast, membrane inner walls, dark arm coils, pale tail back
if "shell" in GAINS:
    g, gn = mesh_arrays(shell)
    k = nearest(g, S_PATH)
    radial = g - S_PATH[k]; dist = np.linalg.norm(radial, axis=1) + 1e-9; rhat = radial / dist[:, None]
    w_s = S_W[k]
    outward = (gn * rhat).sum(1)
    # rims: local convexity normalised within the mesh (the voxel surface is bumpy, so the raw
    # value is high everywhere) plus a large-scale tilt away from the body's outward direction,
    # which only the rounded edges around the cells have
    # the painting keeps the body deep green and puts pale bone only on the rounded rims of the
    # lattice; rims come from the local convexity normalised within the mesh (the voxel surface
    # is bumpy, so the raw value is high everywhere)
    conv = convexity(shell)
    lo, hi = np.percentile(conv, [58, 93])
    rim = np.clip((conv - lo) / max(1e-6, hi - lo), 0, 1) ** 0.9
    wall = vmix(WALL_DARK, WALL_MID, np.clip(outward, 0, 1) * 0.8)
    col = vmix(wall, BONE_EDGE, rim * 0.95)
    inner = (outward < -0.15) & (dist < w_s * 1.2 + 0.04)
    col[inner] = vmix(INK, MEMBRANE, np.full(inner.sum(), 0.55))
    for (C, rx, ry, *_rest) in WHORLS:
        dc = np.linalg.norm(g - V(C), axis=1)
        # the coiled arm: anything near the whorl centre that is not part of the S body wall
        hose = (dc < rx * 1.25) & ((dist > w_s * 1.05) | (dc < rx * 0.75))
        if hose.any():
            ow = ((g[hose] - V(C)) / dc[hose][:, None] * gn[hose]).sum(1)
            arm = vmix(mix(INK, MEMBRANE, 0.6), WALL_MID, 0.15 + 0.35 * np.clip(ow, 0, 1))
            col[hose] = vmix(arm, BONE_EDGE, rim[hose] * 0.9)
            glow = np.clip(1 - dc[hose] / (rx * 0.42), 0, 1)
            col[hose] = vmix(col[hose], GLOW, glow * 0.6)
    tailmask = g[:, 1] < -1.0
    pale = np.clip(-gn[tailmask, 2], 0, 1) ** 1.5 * 0.75
    col[tailmask] = vmix(INK, mix(BONE, BONE_EDGE, 0.3), pale)
    set_colors(shell, col)
    # tail spines: dark at the root, pale toward the tips and on their rims
    g2, _ = mesh_arrays(tail)
    k2 = nearest(g2, TAIL_PATH)
    d2 = np.linalg.norm(g2 - TAIL_PATH[k2], axis=1)
    tip = np.clip((d2 - 0.2) / 0.7, 0, 1) ** 0.7
    set_colors(tail, vmix(vmix(BONE_ROOT, BONE, tip), BONE_EDGE, tip * 0.7))
    # dark inner core behind the cells; some regions stay open as real holes
    # a continuous dark membrane well inside the wall: the cells read as deep green instead of
    # see-through, while holes on the silhouette still show the background at grazing angles
    mb = MeshBuilder("ShellCore | dark membrane behind the lattice", body, [INK_MAT])
    core = []
    for s in np.linspace(0.12, 0.975, 56):
        w = float(np.interp(s, S_T, S_W))
        inset = 0.065 + 0.06 * w + 0.14 * max(0.0, 0.30 - s) / 0.30
        core.append([surf(s, a, inset=inset) for a in np.linspace(0, math.tau, 33)])
    mb.patch(np.asarray(core), color=mix(INK, MEMBRANE, 0.35))
    coreob = mb.finish(micro_uv_scale=2.0)
    # veined bone net branching from the dorsal spine, wrapped onto the actual r9 shell
    vb = MeshBuilder("ShellVeins | dorsal net branching from the spine", body, [BONE_MAT])

    def vein_col(i, t, j, a):
        crest = max(0.0, math.sin(a)) ** 1.2
        return mix(mix(BONE, BONE_EDGE, crest * 0.8), BONE_ROOT, 0.25 * (1 - crest))
    spine = np.asarray([surf(s, math.pi, inset=-0.03) for s in np.linspace(0.05, 0.95, 70)])
    vb.tube(spine, np.linspace(0.030, 0.013, len(spine)), sides=7, flat=0.7, color_fn=vein_col, hint=(0, 0, 1), cap=True)
    for vi, s0 in enumerate(np.linspace(0.08, 0.90, 13)):
        for side in (1, -1):
            pts = []
            for f in np.linspace(0, 1, 9):
                a = math.pi + side * (0.06 + 0.58 * f) * math.pi * (1 + 0.08 * noise1(f * 5 + vi, 3))
                s = min(0.97, s0 + 0.075 * f ** 1.3 + 0.012 * noise1(f * 7, vi))
                pts.append(surf(s, a, inset=-0.028))
            path = catmull(pts, 4)
            rr = (0.024 * (1 - 0.65 * np.linspace(0, 1, len(path))) + 0.006) * float(np.interp(s0, S_T, S_W)) / 0.8
            vb.tube(path, rr, sides=6, flat=0.7, color_fn=vein_col, hint=(0, 0, 1), cap=True, taper_end=True)
            # one fork from the middle of each vein, drooping further toward the tail
            fork = []
            for f2 in np.linspace(0, 1, 6):
                a = math.pi + side * (0.06 + 0.58 * 0.5 + 0.22 * f2) * math.pi
                s = min(0.97, s0 + 0.075 * 0.5 ** 1.3 + 0.10 * f2)
                fork.append(surf(s, a, inset=-0.026))
            fpath = catmull(fork, 4)
            rr2 = (0.015 * (1 - 0.7 * np.linspace(0, 1, len(fpath))) + 0.004) * float(np.interp(s0, S_T, S_W)) / 0.8
            vb.tube(fpath, rr2, sides=6, flat=0.7, color_fn=vein_col, hint=(0, 0, 1), cap=True, taper_end=True)
    veins = vb.finish(micro_uv_scale=2.0)
    bpy.context.view_layer.objects.active = veins
    sw = veins.modifiers.new("Wrap onto the r9 shell", "SHRINKWRAP")
    sw.target = shell; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.wrap_mode = "ABOVE_SURFACE"; sw.offset = 0.014
    bpy.ops.object.modifier_apply(modifier=sw.name)
    print("SHELL_GAINS_DONE", round(time.time() - START, 1), flush=True)

# ---- whorls: dark arm, pale curl leaves root->tip, rim crosier chains, bright emissive cores
if "whorls" in GAINS:
    g, gn = mesh_arrays(leaves)
    all_pts = np.concatenate([p for p, w in WHORL_PATHS]); all_ws = np.concatenate([w for p, w in WHORL_PATHS])
    all_nw = np.concatenate([np.tile(unit(V((math.sin(w[7]), 0, math.cos(w[7])))), (len(p), 1))
                             for w, (p, _) in zip(WHORLS, WHORL_PATHS)])
    k = nearest(g, all_pts)
    rel = g - all_pts[k]
    # measure the reach of each curl in the whorl plane: roots sit against the arm, tips reach inward
    rel_in_plane = rel - all_nw[k] * (rel * all_nw[k]).sum(1)[:, None]
    dist = np.linalg.norm(rel_in_plane, axis=1)
    pale = np.clip((dist - all_ws[k] * 0.55) / (all_ws[k] * 1.6 + 0.04), 0, 1) ** 0.8
    conv = convexity(leaves)
    lo, hi = np.percentile(conv, [55, 95])
    rim = np.clip((conv - lo) / max(1e-6, hi - lo), 0, 1)
    # curl leaves: deep green roots, pale toward the tips and along their sharp edges
    col = vmix(vmix(WALL_DARK, WALL_MID, pale), BONE_EDGE, np.clip(0.75 * pale ** 1.2 + 0.25 * rim * pale, 0, 1))
    for (C, rx, *_rest) in WHORLS:
        dc = np.linalg.norm(g - V(C), axis=1)
        col = vmix(col, GLOW, np.clip(1 - dc / (rx * 0.45), 0, 1) * 0.75)
    set_colors(leaves, col)
    cb = MeshBuilder("WhorlCurls | rim crosier chains and cores", body, [BONE_MAT, CORE_MAT])
    for (C, rx, ry, turns, phase, basewidth, base_depth, yaw, core_r), (path, ws) in zip(WHORLS, WHORL_PATHS):
        Nw = unit(V((math.sin(yaw), 0, math.cos(yaw))))
        s_acc = 0.0; last = -1.0; count = 0
        for i in range(3, len(path) - 5):
            s_acc += np.linalg.norm(path[i] - path[i - 1])
            spacing = 0.95 * ws[i] + 0.03
            if s_acc - last < spacing:
                continue
            last = s_acc; count += 1
            rvec = path[i] - V(C); rvec = rvec - Nw * np.dot(rvec, Nw); outward = unit(rvec)
            flow = unit(path[i + 2] - path[i - 2])
            tfrac = i / (len(path) - 1)
            g_ = smooth((tfrac - 0.70) / 0.30) if tfrac > 0.70 else 0.0
            big = count % 2 == 0
            length = (ws[i] * (1.45 if big else 1.0) + 0.05) * (1 + 0.15 * noise1(count * 1.7, 11))
            radius = ws[i] * (0.34 if big else 0.26) + 0.006
            cb.crosier(path[i] + outward * (ws[i] * 0.88), outward, flow, length, radius, turns=1.05, straight=0.10,
                       sides=7, color_root=mix(BONE_ROOT, BONE, 0.3), color_tip=mix(BONE_EDGE, GLOW, g_),
                       hint=Nw, mat=1 if g_ > 0.5 else 0, bend_power=1.45)
        # bright core at the eye of the coil
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=core_r)
        e1 = unit(V((math.cos(yaw), 0, -math.sin(yaw)))); e2 = V((0, 1, 0))
        sv = len(cb.v)
        for v in bm.verts:
            q = V(C) + e1 * v.co.x + e2 * v.co.y + Nw * (v.co.z * 0.8)
            cb.add_vertex(q, mix(GLOW, (1.0, 1.0, 0.95), 0.3))
        for f in bm.faces:
            cb.add_face(tuple(sv + v.index for v in f.verts), 1)
        bm.free()
    curls = cb.finish(micro_uv_scale=3.0)
    print("WHORL_GAINS_DONE", round(time.time() - START, 1), flush=True)

# ---- fronds: ink body with a pale toothed edge, plus large dense crosier chains along that edge
if "fronds" in GAINS:
    for idx, (fob, (control, width)) in enumerate(zip(fronds, FRONDS_V2)):
        ps, ws, tang, sides, normals, distances, tt = frond_frame(control, width)
        sg = 1 if idx % 2 == 0 else -1
        g, gn = mesh_arrays(fob)
        k = nearest(g, ps)
        lateral = ((g - ps[k]) * (sides[k] * sg)).sum(1)
        edge = np.clip((lateral - ws[k] * 0.40) / (ws[k] * 0.50 + 1e-6), 0, 1)
        face = np.clip((gn * normals[k]).sum(1), 0, 1)
        col = vmix(INK, (0.030, 0.062, 0.040), face ** 1.5 * 0.5)
        col = vmix(col, mix(BONE, BONE_EDGE, 0.4), edge * 0.9)
        set_colors(fob, col)
        mb = MeshBuilder("FrondCurls_%02d | crosier chain on the toothed edge" % idx, pivots[idx], [BONE_MAT])
        last = -1.0; count = 0
        for i in range(5, len(ps) - 3):
            if tt[i] > 0.96:
                break
            spacing = max(0.035, 0.40 * ws[i])
            if distances[i] - last < spacing:
                continue
            last = distances[i]; count += 1
            edge_dir = sides[i] * sg
            big = count % 2 == 0
            length = (ws[i] * (1.05 if big else 0.65) + 0.045) * (1 + 0.18 * noise1(i * 0.7, idx))
            radius = ws[i] * (0.15 if big else 0.11) + 0.008
            base = ps[i] + edge_dir * (ws[i] * 0.70) + normals[i] * (0.01 * noise1(i * 1.3, idx + 7))
            mb.crosier(base, edge_dir, tang[i], length, radius, turns=1.1, straight=0.10, sides=7,
                       color_root=mix(BONE_ROOT, BONE, 0.25), color_tip=BONE_EDGE, hint=normals[i], bend_power=1.45)
        mb.finish(micro_uv_scale=2.4)
    print("FROND_GAINS_DONE", round(time.time() - START, 1), flush=True)

# ---- face leaf and beads (v3), head recolour
def facepoint(t, u, front=True):
    w = np.interp(t, [0, .20, .50, .80, 1], [.30, .35, .255, .105, .001])
    x = u * w + .018 * (1 - t) ** 2
    y = .63 - 1.16 * t - .12 * u * (1 - t) ** 2 - .08 * abs(u) * (1 - t) ** 2
    z = .02 + .09 * t + ((.145 * (1 - abs(u)) * (1 - .55 * t) - .15 * (1 - abs(u)) * (1 - t) ** 4) if front else -(.045 + .15 * (1 - abs(u) ** 2)) * (1 - t) ** .8)
    if front:
        flow = u + .055 * math.sin(t * 4.7); crest = (.5 + .5 * math.cos(flow * math.pi * 12 + 1.2 * t)) ** 8
        z += .006 * (crest - .1) * (1 - abs(u)) * math.sin(math.pi * t)
    return P((x, y, z))


def lattice_image(name="face-lattice", size=512):
    img = bpy.data.images.get(name)
    if img:
        return img
    ys, xs = np.mgrid[0:size, 0:size]
    u = xs / (size - 1) * 2 - 1; t = ys / (size - 1)
    mask = np.zeros((size, size))
    width = np.interp(t, [0, .20, .50, .80, 1], [.30, .35, .255, .105, .001]) / .35
    un = np.clip(u / np.maximum(width, 1e-3), -1.2, 1.2)
    for u0 in np.linspace(-.92, .92, 9):
        uu = u0 * (1 - .22 * t) + .12 * u0 * np.sin(np.pi * t)
        d = np.abs(un - uu) * np.maximum(width, 0.05)
        mask = np.maximum(mask, np.exp(-(d / 0.0075) ** 2))
    for direction in (-1, 1):
        for j, base_t in enumerate([.02, .14, .26, .38, .50, .62, .74]):
            tc = base_t + direction * .16 * un + .22 * (1 - un ** 2) + .012 * np.sin(un * 4 + j)
            mask = np.maximum(mask, np.exp(-(np.abs(t - tc) / 0.0062) ** 2))
    inside = (np.abs(un) < 1.0) & (t > 0.015) & (t < 0.985)
    mask = mask * inside
    tip_glow = np.exp(-(((t - 0.93) / 0.12) ** 2 + (un / 0.35) ** 2)) * inside
    mask = np.clip(np.maximum(mask, tip_glow * 0.9), 0, 1)
    rgba = np.zeros((size, size, 4))
    rgba[..., 0] = 0.35 + 0.45 * mask; rgba[..., 1] = 0.95; rgba[..., 2] = 0.55 + 0.3 * mask; rgba[..., 3] = mask
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=False)
    img.pixels.foreach_set(rgba.ravel().astype(np.float32)); img.pack()
    return img


HORNS = [([(-.20, .29, .02), (-.43, .39, .02), (-.68, .64, -.04), (-.76, .96, -.10)], .080),
         ([(.21, .25, .025), (.44, .44, .01), (.49, .77, -.06), (.39, 1.06, -.14)], .088),
         ([(-.12, .025, .035), (-.32, .015, .045), (-.52, .00, .03), (-.84, .18, -.04), (-1.04, .39, -.11)], .095),
         ([(.12, .045, .035), (.32, .05, .045), (.57, .10, .025), (.93, .41, -.04), (1.04, .72, -.11)], .098)]
OLD_H = Matrix.Translation(Vector((-.58, -.68, .06))) @ Matrix.Rotation(math.radians(-18), 4, "Y")


def build_face():
    mat = bpy.data.materials.get("Rune | v3 face lattice")
    if not mat:
        mat = bpy.data.materials.new("Rune | v3 face lattice"); mat.use_nodes = True
        nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = lattice_image()
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "AuthoredUV"
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
        b.inputs["Emission Strength"].default_value = 1.1; b.inputs["Roughness"].default_value = 0.5
        mat.blend_method = "BLEND"; mat.use_backface_culling = False
    mb = MeshBuilder("Face | fused glowing lattice leaf", body, [mat])
    rows, cols = 44, 22
    grid = []
    for i in range(rows + 1):
        t = 0.02 + 0.965 * i / rows
        grid.append([Pinv(OLD_H @ facepoint(t, (-1 + 2 * j / cols) * 0.97)) for j in range(cols + 1)])
    mb.patch(np.asarray(grid), color=(0.4, 0.9, 0.5), uv_fn=lambda a, b_: ((b_ * 2 - 1) * 0.5 + 0.5, a))
    ob = mb.finish(micro_uv_scale=1.0)
    bpy.context.view_layer.objects.active = ob
    sw = ob.modifiers.new("Fuse to head surface", "SHRINKWRAP")
    sw.target = headmesh; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.wrap_mode = "ABOVE_SURFACE"; sw.offset = 0.006
    bpy.ops.object.modifier_apply(modifier=sw.name)
    dt = ob.modifiers.new("Copy neck weights", "DATA_TRANSFER")
    dt.object = headmesh; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    for gname in headmesh.vertex_groups:
        ob.vertex_groups.new(name=gname.name)
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    arm = ob.modifiers.new("Rooted cranial surface deformation", "ARMATURE")
    arm.object = rig; arm.use_vertex_groups = True
    return ob


def build_beads():
    bpy.context.view_layer.update()
    to_head = head.matrix_local.inverted() @ OLD_H
    mb = MeshBuilder("HeadBeads | pearl chains on the tendrils", head, [BONE_MAT])
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sphere = [(v.co.x, v.co.y, v.co.z) for v in bm.verts]; sfaces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    for cs, radius in HORNS:
        ps = catmull(cs, 14); n = len(ps); sg = 1 if cs[0][0] < 0 else -1
        acc = 0.0; last = -1.0
        for i in range(1, n - 1):
            acc += np.linalg.norm(ps[i] - ps[i - 1]); t = i / (n - 1)
            if t > 0.93:
                break
            if acc - last < 0.030 + 0.014 * (1 - t):
                continue
            last = acc
            tang = unit(ps[i + 1] - ps[i - 1]); side = unit(np.cross(tang, V((0, 0, 1)))) * sg
            w = radius * (1 - t) ** 1.1 * (1 + .28 * (1 - t) ** 3) + .0018
            centre = ps[i] + side * (w * 0.98); br = 0.0065 + 0.006 * (1 - t)
            sv = len(mb.v)
            for (x, y, z) in sphere:
                mb.add_vertex(Pinv(to_head @ (P(centre) + Vector((x, y, z)) * br)), BONE_EDGE)
            for f in sfaces:
                mb.add_face(tuple(sv + kk for kk in f), 0)
    return mb.finish(micro_uv_scale=1.0)


if "face" in GAINS:
    remove(["Face |", "HeadBeads |"])
    build_face(); build_beads()
    print("FACE_DONE", round(time.time() - START, 1), flush=True)

if "head" in GAINS:
    g, gn = mesh_arrays(headmesh)
    front = np.clip(gn[:, 2], 0, 1)
    set_colors(headmesh, vmix(INK, (0.05, 0.11, 0.06), front ** 1.5 * 0.8))
    g2, gn2 = mesh_arrays(jawmesh)
    set_colors(jawmesh, np.tile(np.asarray(mix(INK, MEMBRANE, 0.3)), (len(g2), 1)))

if "ao" in GAINS:
    from guardian_cavity_ao import bake_guardian_cavity
    stats = bake_guardian_cavity(root, radius=0.5, samples=10, strength=0.72)
    for ob in [o for o in root.children_recursive if o.type == "MESH"]:
        me = ob.data
        ao_layer = me.color_attributes.get("GuardianCavityAO"); col = me.color_attributes.get("GuardianSurface")
        if ao_layer is None or col is None or ob.name.startswith("Face |"):
            continue
        ao = np.empty(len(me.vertices) * 4); ao_layer.data.foreach_get("color", ao)
        cc = np.empty(len(me.vertices) * 4); col.data.foreach_get("color", cc)
        cc = cc.reshape(-1, 4); cc[:, :3] *= ao.reshape(-1, 4)[:, 0][:, None]
        col.data.foreach_set("color", cc.ravel()); me.color_attributes.remove(ao_layer)
        idx = [c.name for c in me.color_attributes].index("GuardianSurface")
        me.color_attributes.active_color_index = idx; me.color_attributes.render_color_index = idx
        me.update()
    print("AO_DONE", json.dumps(stats, default=str)[:200], round(time.time() - START, 1), flush=True)

audit = [mesh_audit(o) for o in root.children_recursive if o.type == "MESH"]
print("MESHES", json.dumps({"objects": len(audit), "vertices": sum(a["vertices"] for a in audit),
                            "triangles": sum(a["triangles"] for a in audit)}), flush=True)
for a in audit:
    print("  ", a["mesh"], a["vertices"], a["triangles"], flush=True)
stamp = opts["stamp"]
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"guardian-{stamp}.blend"))
print("SAVED", OUT / f"guardian-{stamp}.blend", round(time.time() - START, 1), flush=True)
if opts["export"] == "1":
    exec(open(str(HERE / "dogs_guardian_v3_export.py")).read())
