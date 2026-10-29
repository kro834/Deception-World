"""Guardian (シエル) v5: the owner's anatomy — a slender serpent with a skeleton and poses.

「胴体は細長くヘビの様です。顔の部分と、右隣の胴体らしきものは1繋ぎで、蛇の尻尾が二股に分かれ、
顔の横から手が生えた様な形です。今の様に巨大な胴体ではありません。」「様々なポーズができる様に」

Macro: one slender ribbed body that coils into the big whorl at its upper end and forks into two
spined tails at the bottom; the glowing lattice head on a short neck beside the body; arms from
beside the head (a fan hand after two coils on the left, a paddle arm on the right, a lower-left
paddle arm). See handoff/goal/ciel3d/model/anatomy-v4.md.

Rig: armature "SerpentRig" (SpineRoot, SpineUp_xx, SpineDown_xx, TailA_xx, TailB_xx,
NeckBaseJoint, NeckHeadJoint, HeadPivot, JawPivot, MouthSocket, MouthAim, ArmL_xx, ArmR_xx,
TentaclePivot_00..10 + finger bones). Smooth analytic skin weights along every generating path.
Clips: Rest, Exhale (neck/head/jaw only), Coil, Rear, Swim (loop).

Usage: Blender --background --python dogs_guardian_v5.py -- --source browser.blend --out DIR
         [--stamp v5] [--export 1]
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
opts = {"source": "", "out": "", "export": "0", "stamp": "v5", "ao": "1", "tiles": "0"}
for i in range(0, len(argv), 2):
    opts[argv[i].lstrip("-")] = argv[i + 1]
OUT = Path(opts["out"]); OUT.mkdir(parents=True, exist_ok=True)
START = time.time()
STAMP = opts["stamp"]

bpy.ops.wm.open_mainfile(filepath=opts["source"])
root = bpy.data.objects["GuardianV_Root"]; body = bpy.data.objects["BodyPivot"]
oldHeadPivot = bpy.data.objects["HeadPivot"]
NEW_H = oldHeadPivot.matrix_local.copy()                     # head rotation pivot (Blender space)
JAW_L = bpy.data.objects["JawPivot"].matrix_local.copy()
SOCKET_L = bpy.data.objects["MouthSocket"].matrix_local.copy()
AIM_L = bpy.data.objects["MouthAim"].matrix_local.copy()
NOSE_LOCAL = Vector(oldHeadPivot["noseLocal"])
OLD_H = Matrix.Translation(Vector((-.58, -.68, .06))) @ Matrix.Rotation(math.radians(-18), 4, "Y")


def Pinv(b):
    return (b.x, b.z, -b.y)


def find(prefix):
    return next((o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(prefix)), None)


headmesh = find("Head |"); jawmesh = find("Jaw |"); mouthmesh = find("Mouth |")
# bring the jaw and oral membrane into body space (they were children of the JawPivot empty)
for ob in (jawmesh, mouthmesh):
    bpy.context.view_layer.update()
    to_body = body.matrix_world.inverted() @ ob.matrix_world
    for v in ob.data.vertices:
        v.co = to_body @ v.co
    ob.parent = body; ob.matrix_parent_inverse = Matrix.Identity(4); ob.matrix_basis = Matrix.Identity(4)
    ob.data.update()
# drop the old organs, the old rig and the pivot empties (they become bones)
for ob in list(bpy.data.objects):
    if ob.type == "MESH" and any(ob.name.startswith(p) for p in ("Shell |", "Bone |", "Frond_", "Tail |", "Face |")):
        bpy.data.objects.remove(ob, do_unlink=True)
for name in ["NeckRig", "MouthAim", "MouthSocket", "JawPivot", "HeadPivot"] + ["TentaclePivot_%02d" % i for i in range(11)]:  # the v2 blend has eleven
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)
for ob in (headmesh, jawmesh, mouthmesh):
    ob.modifiers.clear()
# the head sculpt keeps its authored weights: its root side now rides the last neck bone
headmesh.vertex_groups["NeckHeadJoint"].name = "HeadPivot"
headmesh.vertex_groups["NeckBaseJoint"].name = "NeckHeadJoint"

# ---------------------------------------------------------------- materials (v3 system)
BONE_MAT = bpy.data.materials.get("Bone | v3 lattice") or material_from("Bone | v2 clay", "Bone | v3 lattice")
INK_MAT = bpy.data.materials.get("Skin | v3 ink") or material_from("Skin | v2 clay", "Skin | v3 ink")
set_principled(INK_MAT, Roughness=0.58); set_principled(BONE_MAT, Roughness=0.66)
if opts["tiles"] == "1":   # budget: the micro normals (193 + 216 KB) are not worth it once the tiles and the atlas carry the detail
    for m_ in (INK_MAT, BONE_MAT):
        for node in list(m_.node_tree.nodes):
            if node.type in ("TEX_IMAGE", "NORMAL_MAP", "UVMAP"):
                m_.node_tree.nodes.remove(node)


def glow_material(name, color, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "GuardianSurface"
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Emission Color"].default_value = (*color, 1); b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.5
    return m


def comb_normal_image(name="serpent-comb-normal", size=512):
    """Tileable fine-detail normal map: rows of small crescent combs over wrinkled membrane.
    Authored for the tube UV (u along the body, v around it)."""
    img = bpy.data.images.get(name)
    if img:
        return img
    ys, xs = np.mgrid[0:size, 0:size]
    u = xs / size; v = ys / size
    h = np.zeros((size, size))
    # six rows of crescent combs; each row is a chain of small arcs leaning with the flow
    for row in range(6):
        vc = (row + 0.5) / 6
        phase = 0.5 * (row % 2)
        xx = (u * 8 + phase + 0.35 * np.sin(2 * np.pi * v * 3 + row)) % 1.0
        yy = (v - vc) * 6
        crescent = np.exp(-((xx - 0.5) ** 2) / 0.045 - (yy ** 2) / 0.18) * (0.6 + 0.4 * np.cos(2 * np.pi * xx))
        ridge = np.exp(-((((xx - 0.5) ** 2 + (yy * 0.55) ** 2) ** 0.5 - 0.22) ** 2) / 0.006)
        h += 0.55 * crescent + 0.75 * ridge * (yy < 0.1)
    # membrane wrinkles between the combs
    wr = (np.sin(2 * np.pi * (u * 13 + 0.4 * np.sin(2 * np.pi * v * 5))) * np.sin(2 * np.pi * (v * 9 + 0.3 * np.sin(2 * np.pi * u * 7))))
    h += 0.18 * wr + 0.08 * np.sin(2 * np.pi * u * 31) * np.sin(2 * np.pi * v * 27)
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * size * 0.5
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * size * 0.5
    strength = 0.012
    nx = -gx * strength; ny = -gy * strength; nz = np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2); nx /= ln; ny /= ln; nz /= ln
    rgba = np.zeros((size, size, 4)); rgba[..., 0] = nx * 0.5 + 0.5; rgba[..., 1] = ny * 0.5 + 0.5; rgba[..., 2] = nz * 0.5 + 0.5; rgba[..., 3] = 1
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel().astype(np.float32)); img.pack()
    return img


def comb_material(name, base_mat, strength=0.65):
    """Copy of the ink material whose normal map is the generated comb tile on the authored tube UV."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = base_mat.copy(); m.name = name
    nt = m.node_tree
    for node in nt.nodes:
        if node.type == "TEX_IMAGE":
            node.image = comb_normal_image()
        elif node.type == "UVMAP":
            node.uv_map = "AuthoredUV"
        elif node.type == "NORMAL_MAP":
            node.inputs["Strength"].default_value = strength
    return m


CORE_MAT = glow_material("Rune | v3 whorl core", (0.30, 0.95, 0.42), 1.0)
COMB_MAT = comb_material("Skin | v6 ink comb", INK_MAT)
TILES = opts["tiles"] == "1"
TILE_M = 0.40   # metres of organ per tile along AuthoredUV u
if TILES:
    import guardian_v8_tiles as v8
    TILE_IMGS = v8.make_tiles(1024, OUT)
    CRESCENT_MAT = v8.tile_material("Skin | v8 crescent combs", TILE_IMGS["crescent"], TILE_IMGS["crescent_n"], 0.9)
    CURL_MAT = v8.tile_material("Skin | v8 curl chains", TILE_IMGS["curl"], TILE_IMGS["curl_n"], 0.9)
    MEMB_MAT = v8.tile_material("Skin | v8 veined membrane", TILE_IMGS["membrane"], TILE_IMGS["membrane_n"], 0.8)
    print("TILES_DONE", round(time.time() - START, 1), flush=True)
else:
    CRESCENT_MAT = CURL_MAT = MEMB_MAT = COMB_MAT


def tube_uv(arc, radii, sides):
    """AuthoredUV for a closed tube: u along the organ in tiles, v mirrored around (no wrap seam)."""
    per = max(1, round(2 * math.pi * float(np.mean(radii)) / TILE_M))
    return lambda i, t, j, a: (arc[i] / TILE_M, (1 - abs(2 * j / sides - 1)) * per / 2)
WALL_DARK = (0.012, 0.032, 0.016); WALL_MID = (0.040, 0.080, 0.042)
for ob in (headmesh, jawmesh):
    ob.data.materials.clear(); ob.data.materials.append(INK_MAT)
    for p in ob.data.polygons:
        p.material_index = 0

# ================================================================ paths (glTF axes)
YAW = math.radians(30)
E3 = unit(V((math.sin(YAW), 0, math.cos(YAW)))); E1 = unit(V((math.cos(YAW), 0, -math.sin(YAW)))); E2 = V((0, 1, 0))
C_WHORL = V((0.94, 2.62, -0.55))


K_WHORL = 0.115   # log-spiral pitch: turns touch when the tube radius is half the radial gap


def whorl_outward(R_out=1.05, turns=3.5, start_deg=206, n=640, back=0.52):
    """Filled logarithmic spiral winding to the centre (clockwise inward in the painting)."""
    pts = []
    for i in range(n):
        f = i / (n - 1)                      # 0 at the outer end ... 1 at the centre
        th = f * math.tau * turns
        r = R_out * math.exp(-K_WHORL * th)
        a = math.radians(start_deg) - th
        p = C_WHORL + E1 * (r * math.cos(a)) + E2 * (r * math.sin(a)) - E3 * (back * f ** 1.2)
        pts.append(p)
    return np.asarray(pts[::-1])             # centre -> outer


coil = whorl_outward()
descent = catmull([tuple(coil[-1]), (-0.10, 1.80, -0.35), (0.12, 1.35, 0.02), (0.36, 0.90, 0.22), (0.34, 0.40, 0.30),
                   (0.12, -0.10, 0.18), (-0.02, -0.55, -0.02)], 18)
MAIN = resample(np.concatenate([coil, descent[1:]], axis=0), spacing=0.02)
N_MAIN = len(MAIN)
arc_main = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(MAIN, axis=0), axis=1))))
S_MAIN = arc_main / arc_main[-1]
# radius profile along the main path by position: centre 0.09 -> outer coil 0.22 -> ribbed 0.27 -> fork 0.20
coil_len = sum(np.linalg.norm(np.diff(coil, axis=0), axis=1))
s_coil_end = coil_len / arc_main[-1]
J_POINT = V((0.30, 0.90, 0.22))
s_J = S_MAIN[np.argmin(np.linalg.norm(MAIN - J_POINT, axis=1))]
def coil_plane_radius(i):
    rv = MAIN[i] - C_WHORL; rv = rv - E3 * np.dot(rv, E3)
    return float(np.linalg.norm(rv))


def coil_tube_radius(i):
    # half the radial gap between turns (slightly more, so the turns touch and fill the spiral)
    return min(0.27, 0.5 * coil_plane_radius(i) * (1 - math.exp(-math.tau * K_WHORL)) * 1.08 + 0.015)


R_MAIN = np.array([
    coil_tube_radius(i) if s < s_coil_end
    else (0.27 + 0.07 * math.sin(math.pi * min(1, (s - s_coil_end) / (1 - s_coil_end)))) * (1 - 0.28 * max(0, (s - 0.85) / 0.15))
    for i, s in enumerate(S_MAIN)])
R_MAIN *= 1 + 0.03 * np.array([noise1(s * 40, 2) for s in S_MAIN])
F_POINT = MAIN[-1]
TAIL_A = resample(catmull([tuple(F_POINT), (0.08, -0.80, -0.26)] + [(.08 + .32 * math.sin(t * math.tau + math.pi) - .30 * t, -.80 - 2.95 * t, -.26 + .28 * math.sin(t * math.pi * 1.5)) for t in np.linspace(0.08, 1, 40)], 6), spacing=0.025)
TAIL_B = resample(catmull([tuple(F_POINT), (0.28, -0.78, 0.02), (0.68, -1.05, 0.14), (1.0, -1.45, 0.26), (1.12, -1.90, 0.36)], 10), spacing=0.025)
NECK = resample(catmull([(0.30, 0.90, 0.22), (-0.12, 0.95, 0.40), (-0.52, 0.92, 0.42)], 12), spacing=0.02)


def coil_path(center, r0, r1, turns, start_deg, z_step, n, cw=True):
    c = V(center); pts = []
    for i in range(n):
        f = i / (n - 1)
        th = f * math.tau * turns
        r = lerp(r0, r1, f)
        a = math.radians(start_deg) - th if cw else math.radians(start_deg) + th
        pts.append(c + V((r * math.cos(a), r * math.sin(a), z_step * f)))
    return np.asarray(pts)


ARM_L = resample(np.concatenate([
    catmull([(-0.85, 0.78, 0.45), (-0.90, 0.95, 0.62)], 6),
    coil_path((-0.62, 0.80, 0.72), 0.30, 0.035, 2.2, 150, 0.25, 110, cw=False)[1:],
    catmull([(-0.60, 0.88, 0.97), (-0.78, 1.12, 0.70), (-0.88, 1.35, 0.50)], 8)[1:],
    coil_path((-0.43, 1.53, 0.40), 0.46, 0.045, 2.4, 190, -0.40, 130, cw=True)[1:],
    catmull([(-0.40, 1.60, 0.0), (-0.34, 1.76, -0.22), (-0.30, 1.85, -0.30)], 8)[1:]], axis=0), spacing=0.02)
ARM_R = resample(catmull([(0.05, 1.00, 0.30), (0.25, 1.22, 0.10), (0.45, 1.45, -0.15), (0.76, 1.63, -0.38)], 12), spacing=0.02)

# fronds (v3 ribbon vocabulary with bigger curl chains); anchors are the v2 pivots
FRONDS = [
    ([(-.42, 1.73, -.35), (-1.18, 2.02, -.57), (-1.60, 2.75, -.77), (-1.76, 3.22, -.82)], .95, 1.05, +1, (.26, .32, .08)),
    ([(-.23, 1.94, -.30), (-.57, 2.49, -.13), (-.84, 3.14, .12), (-1.00, 3.44, .22)], .85, 1.05, +1, (.25, .30, .08)),
    ([(-.03, 2.02, -.28), (.03, 2.65, -.39), (-.16, 3.30, -.43), (-.36, 3.56, -.36)], .80, 1.0, +1, (.23, .28, .07)),
    ([(-.61, 1.42, -.13), (-1.27, 1.63, -.09), (-1.79, 2.19, -.04), (-2.04, 2.54, .01)], .90, 1.05, +1, (.25, .30, .08)),
    ([(.03, 1.98, -.30), (.32, 2.46, -.49), (.28, 3.00, -.59), (.40, 3.30, -.52)], .72, 1.0, -1, (.20, .24, .06)),
    ([(-.56, 1.07, .24), (-1.31, .69, .43), (-1.88, -.03, .72), (-1.86, -.78, .95), (-1.50, -1.26, 1.12)], 1.7, 1.5, +1, (.44, .52, .11)),
    ([(.76, 1.63, -.38), (1.62, 1.24, -.74), (1.99, .49, -.70), (1.84, -.23, -.38), (1.38, -.60, .08)], 1.6, 1.5, +1, (.42, .50, .11)),
    ([(-1.41, -1.22, .40), (-1.27, -1.66, .43), (-.95, -1.90, .40)], .62, 1.05, +1, (.22, .25, .06)),
    ([(1.48, -.42, .30), (1.54, -.90, .39), (1.26, -1.22, .47)], .60, 1.05, +1, (.23, .26, .06)),
    ([(1.28, -1.04, .40), (1.57, -1.43, .43), (1.40, -1.78, .48)], .55, 1.0, +1, (.20, .23, .06)),
    ([(-1.54, -1.18, .32), (-1.92, -1.44, .29), (-2.00, -1.84, .37)], .55, 1.0, +1, (.21, .24, .06)),
    ([(-.33, 1.85, -.32), (-.85, 2.30, -.40), (-1.20, 2.95, -.45), (-1.32, 3.35, -.45)], .85, 1.05, +1, (.24, .28, .07)),
]


def plane_normal(points):
    pts = np.asarray(points, float); c = pts.mean(axis=0)
    n = np.linalg.svd(pts - c)[2][-1]
    return unit(n if n[2] >= 0 else -n)


def frond_path(controls, curl_len, curl_turns, side):
    nrm = plane_normal(controls)
    base = resample(catmull(controls, 20), spacing=0.02)
    tang = unit(base[-1] - base[-3]); lateral = unit(np.cross(nrm, tang)) * side
    curl = crosier_path(base[-1], tang, lateral, curl_len, turns=max(curl_turns, 1.35), straight=0.10, bend_power=1.5)
    path = resample(np.concatenate([base[:-1], curl], axis=0), spacing=0.018)
    base_len = sum(np.linalg.norm(np.diff(base, axis=0), axis=1))
    return path, nrm, lateral, base_len / (base_len + curl_len)


# ================================================================ armature
arm = bpy.data.armatures.new("SerpentRig"); rig = bpy.data.objects.new("SerpentRig", arm)
bpy.context.collection.objects.link(rig); rig.parent = body
bpy.ops.object.select_all(action="DESELECT"); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
EB = {}
VIEW = Vector((0, -1, 0))   # toward the viewer in Blender space


def add_bone(name, head_g, tail_g, parent=None, roll_z=None, matrix=None, length=None):
    eb = arm.edit_bones.new(name)
    if matrix is not None:
        eb.matrix = matrix; eb.length = length or 0.1
    else:
        eb.head = P(head_g); eb.tail = P(tail_g)
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.05))
        eb.align_roll(roll_z if roll_z is not None else VIEW)
    if parent is not None:
        eb.parent = EB[parent]; eb.use_connect = False
    EB[name] = eb
    return eb


def add_chain(prefix, path, count, parent, names=None):
    """Bones along a glTF path; returns [(name, s_center)] for skin weights."""
    arc = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))))
    ss = arc / arc[-1]
    cuts = np.linspace(0, 1, count + 1)
    out = []; prev = parent
    for k in range(count):
        a = path[np.searchsorted(ss, cuts[k])]; b = path[min(len(path) - 1, np.searchsorted(ss, cuts[k + 1]))]
        name = names[k] if names else f"{prefix}_{k:02d}"
        add_bone(name, a, b, prev); prev = name
        out.append((name, (cuts[k] + cuts[k + 1]) / 2))
    return out


add_bone("SpineRoot", tuple(J_POINT), tuple(J_POINT + V((0, 0.08, 0))))
i_J = int(np.argmin(np.linalg.norm(MAIN - J_POINT, axis=1)))
up_path = MAIN[i_J::-1]; down_path = MAIN[i_J:]
UP = add_chain("SpineUp", up_path, 16, "SpineRoot")
DOWN = add_chain("SpineDown", down_path, 10, "SpineRoot")
# stations on the main path parameter for weights (SpineUp runs backwards toward the centre)
s_up0 = S_MAIN[i_J]
MAIN_STATIONS = sorted([(n, s_up0 * (1 - c)) for n, c in UP] + [(n, s_up0 + (1 - s_up0) * c) for n, c in DOWN], key=lambda x: x[1])
TAILA = add_chain("TailA", TAIL_A, 8, DOWN[-1][0])
TAILB = add_chain("TailB", TAIL_B, 5, DOWN[-1][0])
# neck: NeckBaseJoint (body side) -> NeckHeadJoint (skull side) -> HeadPivot (pivot bone) -> JawPivot
Xh = (NEW_H.to_3x3() @ Vector((1, 0, 0))).normalized()


def neck_roll(a_g, b_g):
    d = (P(b_g) - P(a_g)).normalized()
    x = (Xh - d * Xh.dot(d)).normalized()
    return x.cross(d)


nb = add_bone("NeckBaseJoint", tuple(NECK[0]), tuple(NECK[len(NECK) // 2]), "SpineRoot", roll_z=neck_roll(NECK[0], NECK[len(NECK) // 2]))
add_bone("NeckHeadJoint", tuple(NECK[len(NECK) // 2]), tuple(NECK[-1]), "NeckBaseJoint", roll_z=neck_roll(NECK[len(NECK) // 2], NECK[-1]))
add_bone("HeadPivot", None, None, "NeckHeadJoint", matrix=NEW_H, length=0.12)
add_bone("JawPivot", None, None, "HeadPivot", matrix=NEW_H @ JAW_L, length=0.08)
add_bone("MouthSocket", None, None, "HeadPivot", matrix=NEW_H @ SOCKET_L, length=0.04)
add_bone("MouthAim", None, None, "HeadPivot", matrix=NEW_H @ AIM_L, length=0.04)
NECK_STATIONS = [("NeckBaseJoint", 0.25), ("NeckHeadJoint", 0.75)]
ARML = add_chain("ArmL", ARM_L, 10, "NeckHeadJoint")
ARMR = add_chain("ArmR", ARM_R, 5, "NeckBaseJoint")
FROND_DATA = []
FINGER_PARENT = {0: ARML[-1][0], 1: ARML[-1][0], 2: ARML[-1][0], 3: ARML[-1][0], 4: ARML[-1][0],
                 5: "NeckBaseJoint", 6: ARMR[-1][0], 7: "Frond05_2", 8: "Frond06_2", 9: "Frond06_2", 10: "Frond05_2",
                 11: ARML[-1][0]}
CLUSTER_PARENT = {7: 5, 10: 5, 8: 6, 9: 6}   # the lower-left / lower-right curl clusters hang from the big arms' tips
for idx in range(len(FRONDS)):
    controls, cl, ct, side, widths = FRONDS[idx]
    if idx in CLUSTER_PARENT:
        tip = FROND_DATA[CLUSTER_PARENT[idx]][1][-1]
        shift = tip - V(controls[0]); controls = [tuple(V(c) + shift) for c in controls]
    path, nrm, lateral, s_base_end = frond_path(controls, cl, ct, side)
    names = ["TentaclePivot_%02d" % idx, "Frond%02d_1" % idx, "Frond%02d_2" % idx]
    stations = add_chain("Frond%02d" % idx, path, 3, FINGER_PARENT[idx], names=names)
    FROND_DATA.append((idx, path, nrm, lateral, s_base_end, widths, stations))
bpy.ops.object.mode_set(mode="OBJECT")
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"
print("BONES", len(rig.pose.bones), round(time.time() - START, 1), flush=True)


def chain_weights(s, stations):
    """Smooth two-bone blend along a chain by centre parameters."""
    s = min(1.0, max(0.0, s))
    if s <= stations[0][1]:
        return [(stations[0][0], 1.0)]
    if s >= stations[-1][1]:
        return [(stations[-1][0], 1.0)]
    for k in range(len(stations) - 1):
        a, b = stations[k], stations[k + 1]
        if a[1] <= s <= b[1]:
            f = smooth((s - a[1]) / max(1e-9, b[1] - a[1]))
            return [(a[0], 1 - f), (b[0], f)]
    return [(stations[-1][0], 1.0)]


def attach(ob):
    # skinned meshes are children of the armature (the glTF exporter expects that); the rig sits
    # at identity under BodyPivot so vertex coordinates stay in body space
    ob.parent = rig; ob.matrix_parent_inverse = Matrix.Identity(4); ob.matrix_basis = Matrix.Identity(4)
    mod = ob.modifiers.new("Serpent skin", "ARMATURE"); mod.object = rig; mod.use_vertex_groups = True
    return ob


# ================================================================ geometry
def segmented_tube(mb, path, radii, stations, crest_fn, arc_ext=100, spacing=(0.42, 0.015), ribs=True,
                   crest=True, comb_fn=None, glow_fn=None, mat_dark=0, mat_bone=1, mat_glow=2, sides=12,
                   rib_scale=1.0, hint=(0, 0, 1), scales=0, scale_size=1.0, rib_width=0.32, paired=False, crest_scale=1.0):
    """A dark membrane tube with transverse bone arcs over its front, rows of crescent scales
    (hooked curls lying on the surface) across the front, a crosier crest on the side given by
    crest_fn(i) (unit vector or None) and optional comb spines from comb_fn(i)."""
    path = np.asarray(path); n = len(path)
    T, Nn, B = rmf_frames(path, hint=hint)
    arc = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1)))); ss = arc / arc[-1]

    def wf(i, t):
        return chain_weights(ss[i], stations)

    def dark_col(i, t, j, a):
        g = glow_fn(i) if glow_fn else 0.0
        if TILES:   # the tile carries the colour; the vertex colour is only an AO/glow multiplier
            return mix((0.92, 1.0, 0.92), (0.75, 1.0, 0.80), g)
        c = mix(WALL_DARK, WALL_MID, 0.25 + 0.75 * max(0.0, math.sin(a)) ** 1.4)
        return mix(c, GLOW, g * 0.6)
    f0 = len(mb.f)
    mb.tube(path, radii, sides=sides, color_fn=dark_col, hint=hint, weights_fn=wf, mat=mat_dark, taper_end=radii[-1] < 0.02,
            uv_fn=tube_uv(arc, radii, sides) if TILES else (lambda i, t, j, a: (arc[i] / 0.16, j / sides * 4.0)))
    if glow_fn is not None:   # rings deep in the glow use the emissive core material
        for i in range(n - 1):
            if glow_fn(i) > 0.5:
                for j in range(sides):
                    mb.fm[f0 + i * sides + j] = mat_glow
    if paired:   # a dark spine along the front face; the paired ribs grow from it at each station
        spine = np.asarray([path[i] + Nn[i] * (radii[i] * 0.96) for i in range(n)])
        mb.tube(spine, 0.06 * radii + 0.004, sides=6, flat=0.7, color=(0.02, 0.045, 0.025), hint=hint, weights_fn=wf, mat=mat_bone, taper_end=True)
    last = -1.0; count = 0
    for i in range(2, n - 2):
        sp = (spacing[0] * radii[i] + spacing[1]) * (1 + 0.18 * noise1(count * 1.9, 23))
        if arc[i] - last < sp:
            continue
        last = arc[i]; count += 1
        mb.cur_w = chain_weights(ss[i], stations)
        flow = T[i]; front = unit(Nn[i]); lat = unit(B[i]); r = radii[i]
        g = glow_fn(i) if glow_fn else 0.0
        if ribs and r > 0.03:
            ext = math.radians(arc_ext + 16 * noise1(count * 0.77, 13)); segs = 18
            bend = 0.3 * sp * (1 + 0.4 * noise1(count * 0.61, 29))
            ring = []
            for k in range(segs + 1):
                a = -ext + 2 * ext * k / segs
                wob = 1 + 0.05 * noise1(a * 2 + count, 5)
                ring.append(path[i] + (front * math.cos(a) + lat * math.sin(a)) * (r * 1.0 * wob) + flow * (bend * math.cos(a) ** 2))
            ring = np.asarray(ring)
            height = (0.16 * sp + 0.004) * rib_scale; halfw = rib_width * sp * (1 + 0.18 * noise1(count * 1.3, 9)) * rib_scale
            prof = np.array([(0.25 + 0.75 * math.sin(math.pi * k / segs) ** 0.45) for k in range(segs + 1)])

            def rib_col(ii, tt, jj, aa, g=g):
                rim = math.sin(math.pi * tt) ** 0.8; crest_ = max(0.0, math.cos(aa)) ** 1.1
                c = mix(mix(BONE_ROOT, BONE, 0.45), BONE_EDGE, 0.2 + 0.7 * crest_ * rim)
                return mix(mix(WALL_DARK, c, 0.2 + 0.8 * rim ** 1.3), GLOW, g * 0.5)
            mb.tube(ring, height * prof, sides=7, flat=halfw / height, color_fn=rib_col, hint=flow, cap=True, mat=mat_glow if g > 0.5 else mat_bone)
        if paired and r > 0.03:
            # paired ribs: from the spine, curving outward and sweeping toward the tail, tapering
            for side in (1, -1):
                p0 = path[i] + front * (r * 0.92)
                p1 = path[i] + (front * math.cos(0.75) + lat * (side * math.sin(0.75))) * (r * 1.04) + flow * (0.35 * sp)
                p2 = path[i] + (front * math.cos(1.5) + lat * (side * math.sin(1.5))) * (r * 1.0) + flow * (0.95 * sp)
                rp = catmull([p0, p1, p2], 6)
                rr = (0.17 * sp + 0.004) * (1 - np.linspace(0, 1, len(rp))) ** 0.7 + 0.004
                mb.tube(rp, rr, sides=7, flat=0.65, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE_ROOT, BONE, 0.5), BONE_EDGE, (1 - t1) ** 0.6),
                        hint=front, mat=mat_bone, taper_end=True)
        # crescent scales: hooked curls lying on the surface across the front, curling with the flow
        if scales and r > 0.03:
            for k in range(scales):
                a = (-0.62 + 1.24 * k / max(1, scales - 1)) * math.radians(78) + math.radians(9 * noise1(count * 1.1 + k, 41))
                if scales == 1:
                    a = math.radians(14 * noise1(count * 0.9, 43))
                nrm_s = unit(front * math.cos(a) + lat * math.sin(a))
                base = path[i] + nrm_s * (r * 0.96) + flow * (sp * 0.25 * ((count + k) % 2))
                side = unit(np.cross(nrm_s, flow)) * (1 if (count + k) % 2 else -1)
                length = (0.95 * sp + 0.02) * scale_size * (1 + 0.2 * noise1(count * 1.7 + k * 3, 47))
                mb.crosier(base, flow, side, length, (0.17 * sp + 0.004) * scale_size, turns=0.95, straight=0.18, sides=6,
                           color_root=mix(BONE_ROOT, BONE, 0.25), color_tip=mix(BONE_EDGE, GLOW, g), hint=nrm_s,
                           mat=mat_glow if g > 0.5 else mat_bone, bend_power=1.5)
        cd = crest_fn(i) if crest else None
        if cd is not None and r > 0.03:
            big = count % 2 == 0
            hook_len = (sp * (3.6 if big else 2.4) + 0.06) * (1 + 0.12 * noise1(count * 2.1, 17)) * crest_scale
            mb.crosier(path[i] + cd * (r * 0.9), cd, flow, hook_len, (sp * (0.42 if big else 0.30) + 0.006) * (0.75 if crest_scale > 1 else 1.0), turns=1.05,
                       straight=0.10, sides=6, color_root=mix(BONE_ROOT, BONE, 0.3), color_tip=mix(BONE_EDGE, GLOW, g),
                       hint=unit(np.cross(cd, flow)), mat=mat_glow if g > 0.5 else mat_bone, bend_power=1.45)
        if comb_fn is not None:
            cm = comb_fn(i)
            if cm is not None:
                direction, length = cm
                tip = path[i] + direction * (r * 0.7 + length) - flow * (length * 0.25)
                spine = catmull([path[i] + direction * (r * 0.5), path[i] + direction * (r * 0.7 + length * 0.4), tip], 6)
                rr = (0.065 * r + 0.012) * (1 - np.linspace(0, 1, len(spine))) ** 0.8 + 0.003
                mb.tube(spine, rr, sides=7, flat=0.6, color_fn=lambda a1, t1, b1, c1: mix(BONE_ROOT, BONE_EDGE, t1 ** 0.6),
                        hint=front, mat=mat_bone, taper_end=True)
        mb.cur_w = None


# --- serpent body (coil + ribbed descent)
mbody = MeshBuilder("Serpent | ribbed vertebral body", body, [CRESCENT_MAT, BONE_MAT, CORE_MAT, MEMB_MAT])
MAIN_FR = rmf_frames(MAIN, hint=(0, 0, 1))


def body_crest(i):
    s = S_MAIN[i]
    if s < s_coil_end:   # outward from the coil centre, in the coil plane
        rv = MAIN[i] - C_WHORL; rv = rv - E3 * np.dot(rv, E3)
        return unit(rv - MAIN_FR[0][i] * np.dot(rv, MAIN_FR[0][i]))
    if s > 0.97:
        return None
    lat = MAIN_FR[2][i]     # B ~ -x for a downward path with front hint
    return unit(-lat if lat[0] < 0 else lat)   # the creature's left flank (+x)


def body_comb(i):
    s = S_MAIN[i]
    if s < s_coil_end + 0.02 or MAIN[i][1] > 0.55 or s > 0.96:
        return None
    lat = MAIN_FR[2][i]
    d = unit(lat if lat[0] < 0 else -lat)      # -x side
    return d, 0.10 + 0.10 * (1 - abs(MAIN[i][1]) / 1.2)


def body_glow(i):
    # the innermost turns of the coil turn bright: a core of glowing coils, not a sphere
    return smooth(1 - coil_plane_radius(i) / 0.34) if S_MAIN[i] < s_coil_end else 0.0


def body_scales_split(i):
    return S_MAIN[i] < s_coil_end


# the coil: thin ribs plus three rows of crescent scales tightening to the core; the descent: ribs,
# two rows of scales and the comb spines
i_split = int(np.searchsorted(S_MAIN, s_coil_end))
segmented_tube(mbody, MAIN[:i_split + 2], R_MAIN[:i_split + 2], MAIN_STATIONS, body_crest, arc_ext=100, spacing=(0.26, 0.010),
               glow_fn=body_glow, rib_scale=0.7, scales=2, scale_size=1.0, rib_width=0.22, crest_scale=1.6)
segmented_tube(mbody, MAIN[i_split:], R_MAIN[i_split:], [(nm, (sc - S_MAIN[i_split]) / (1 - S_MAIN[i_split])) for nm, sc in MAIN_STATIONS if sc >= S_MAIN[i_split] - 1e-9] or MAIN_STATIONS,
               lambda i: body_crest(i + i_split), arc_ext=110, spacing=(0.40, 0.014), comb_fn=lambda i: body_comb(i + i_split),
               ribs=False, paired=True, scales=1, scale_size=0.8)
# neck
NECK_R = np.array([lerp(0.21, 0.16, t) for t in np.linspace(0, 1, len(NECK))])
segmented_tube(mbody, NECK, NECK_R, NECK_STATIONS, lambda i: None, ribs=True, crest=False, spacing=(0.55, 0.02), rib_scale=0.8, mat_dark=3)
serpent = attach(mbody.finish(micro_uv_scale=2.4))
clean(serpent)
print("BODY_DONE", round(time.time() - START, 1), flush=True)

# --- forked tails with spines
mtail = MeshBuilder("Tails | forked spined tails", body, [MEMB_MAT, BONE_MAT, CORE_MAT])
for path, stations, rad0, spines in ((TAIL_A, TAILA, 0.24, 14), (TAIL_B, TAILB, 0.20, 6)):
    n = len(path); tt = np.linspace(0, 1, n)
    radii = rad0 * (1 - tt) ** 0.85 + 0.006
    radii *= 1 + 0.022 * np.sin(tt * 150) + 0.012 * np.sin(tt * 37 + 1)
    T, Nn, B = rmf_frames(path, hint=(0, 0, 1))
    arc = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1)))); ss = arc / arc[-1]

    def tail_col(i, t, j, a):
        pale = max(0.0, -math.cos(a)) ** 1.6
        if TILES:
            return mix((0.78, 0.86, 0.78), (1.0, 1.0, 1.0), pale)
        return mix(INK, mix(BONE, BONE_EDGE, 0.3), pale * (0.85 - 0.3 * t))
    mtail.tube(path, radii, sides=14, color_fn=tail_col, hint=(0, 0, 1), mat=0, taper_end=True,
               weights_fn=lambda i, t, ss=ss, st=stations: chain_weights(ss[i], st),
               uv_fn=tube_uv(arc, radii, 14) if TILES else (lambda i, t, j, a, arc=arc: (arc[i] / 0.16, j / 14 * 4.0)))
    is_a = path is TAIL_A
    lengths = [1.13, 1.31, 1.28, 1.15, 1.04, .95, .87, .80, .85, .90, .83, .72, .60, .46] if is_a else [.95, 1.05, .95, .80, .62, .45]
    for ii, (t, le) in enumerate(zip(np.linspace(.07 if is_a else .12, .89, spines), lengths)):
        i = int(t * (n - 1)); p = path[i]; tang = T[i]
        side = unit(np.cross(tang, V((0, 0, 1)))); normal = unit(np.cross(side, tang))
        if is_a:
            u = min(1, max(0, (t - .40) / .45)); roll = math.pi * (u * u * (3 - 2 * u))
            edge = side * math.cos(roll) + normal * math.sin(roll)
        else:
            edge = unit(V((0.75, -0.45, 0.35)) + side * 0.2)
        tip = p + edge * (le * 1.25) + tang * (.12 + .16 * t)
        sp = catmull([p - edge * radii[i] * 0.4, p + edge * le * .30 + tang * .02, tip], 8)
        rr = (.060 * (1 - t * .45)) * (1 - np.linspace(0, 1, len(sp))) ** .9 + .003
        mtail.cur_w = chain_weights(ss[i], stations)
        mtail.tube(sp, rr, sides=8, flat=0.6, color_fn=lambda a1, t1, b1, c1: mix(BONE_ROOT, BONE_EDGE, t1 ** 0.6), hint=normal, mat=1, taper_end=True)
        mtail.cur_w = None
tails = attach(mtail.finish(micro_uv_scale=2.2))
clean(tails)
print("TAILS_DONE", round(time.time() - START, 1), flush=True)

# --- arms (coiled left arm with the fan hand, right arm to the paddle)
marm = MeshBuilder("Arms | coiled arms", body, [CURL_MAT, BONE_MAT, CORE_MAT])
for path, stations, r0, r1, glow_centre in ((ARM_L, ARML, 0.095, 0.13, (V((-0.62, 0.80, 0.72)), V((-0.43, 1.53, 0.40)))), (ARM_R, ARMR, 0.11, 0.14, ())):
    n = len(path); tt = np.linspace(0, 1, n)
    radii = np.array([lerp(r0, r1, t) for t in tt]) * (1 + 0.04 * np.array([noise1(t * 30, 4) for t in tt]))
    for c in glow_centre:   # thinner as the arm winds into each coil centre, so the turns fill the spiral
        d = np.linalg.norm((path - c) * np.array([1, 1, 0.0]), axis=1)
        radii = radii * np.clip(d / 0.42, 0.22, 1.0)
    T, Nn, B = rmf_frames(path, hint=(0, 0, 1))

    def arm_crest(i, path=path, T=T, B=B):
        # crest toward the outside of the nearest coil, else toward the viewer's left
        for c in glow_centre:
            if np.linalg.norm(path[i] - c) < 0.55:
                rv = path[i] - c; rv[2] = 0
                return unit(rv - T[i] * np.dot(rv, T[i]))
        lat = B[i]
        return unit(lat if lat[0] < 0 else -lat)

    def arm_glow(i, path=path):
        g = 0.0
        for c in glow_centre:
            g = max(g, smooth(1 - np.linalg.norm((path[i] - c) * np.array([1, 1, 0.0])) / 0.24))
        return g
    segmented_tube(marm, path, radii, stations, arm_crest, arc_ext=90, spacing=(0.45, 0.012), glow_fn=arm_glow, rib_scale=0.9,
                   scales=2, scale_size=0.95)
arms = attach(marm.finish(micro_uv_scale=2.4))
clean(arms)
print("ARMS_DONE", round(time.time() - START, 1), flush=True)

def knob_box(mb, centre, along, outward, normal, sa, so, st, color, mat):
    """A rounded-looking 8-vertex knob (12 tris) standing on an edge: narrower and thinner at its top."""
    sv = len(mb.v)
    for a in (-1, 1):
        for o in (0, 1):
            for nn in (-1, 1):
                shrink = 1.0 if o == 0 else 0.72
                p = centre + along * (a * sa * 0.5 * shrink) + outward * (o * so) + normal * (nn * st * 0.5 * shrink)
                mb.add_vertex(p, color)

    def I(a, o, nn):
        return sv + a * 4 + o * 2 + nn
    for f in ((I(0, 0, 0), I(1, 0, 0), I(1, 0, 1), I(0, 0, 1)), (I(0, 1, 0), I(0, 1, 1), I(1, 1, 1), I(1, 1, 0)),
              (I(0, 0, 0), I(0, 1, 0), I(1, 1, 0), I(1, 0, 0)), (I(0, 0, 1), I(1, 0, 1), I(1, 1, 1), I(0, 1, 1)),
              (I(0, 0, 0), I(0, 0, 1), I(0, 1, 1), I(0, 1, 0)), (I(1, 0, 0), I(1, 1, 0), I(1, 1, 1), I(1, 0, 1))):
        mb.add_face(f, mat)


def rim_knobs(mb, path, ws, ts, frames, lateral, weights_fn, color=(0.30, 0.36, 0.30), mat=0, frac=1 / 9.0, start=2):
    """Owner: 黒っぽい腕の淵の細部. A dense, even, continuous row of dark knobs along the OUTER edge
    (the side away from the curl), each about 1/9 of the local width, following every turn."""
    T, Nn, B = frames; n = len(path)
    s_acc = 0.0; last = -1.0
    for i in range(start, n - 1):
        s_acc += np.linalg.norm(path[i] - path[i - 1]); w = ws[i]
        size = max(0.010, w * frac)
        if s_acc - last < size * 1.15:
            continue
        last = s_acc
        inner = unit(B[i] * (np.sign(np.dot(B[i], lateral)) if abs(np.dot(B[i], lateral)) > 1e-6 else 1.0))
        outer = -inner
        mb.cur_w = weights_fn(i / (n - 1))
        knob_box(mb, path[i] + outer * (w * 0.47), T[i], outer, Nn[i], size * 0.85, size * 0.9, max(0.006, ts[i] * 0.6), color, mat)
        mb.cur_w = None


# --- fronds (v10 silhouette pass): broad base with a strong taper, a 2:1 ribbon section with a
# pale ridge line, the tip spiral baked into the rest pose, and a comb of real flat hooked teeth
# along the inner (concave) edge, each about 1/3-1/2 of the local width, smaller toward the tip
for idx, path, nrm, lateral, s_base_end, widths, stations in FROND_DATA:
    n = len(path); arcp = np.linspace(0, 1, n)
    w0, w1, w2 = widths
    big = w1 > 0.4
    base_w = w1 * (1.0 if big else 1.25); taper_exp = 1.6 if big else 1.15
    ws = np.array([base_w * ((0.22 if big else 0.33) + (0.78 if big else 0.67) * (1 - t) ** taper_exp) * (1 - 0.62 * max(0.0, (t - 0.80) / 0.20)) + 0.006 for t in arcp])
    ws *= 1 + 0.05 * np.array([noise1(t * 9, idx) for t in arcp]); ts = ws * 0.45 + 0.008
    mb = MeshBuilder("Frond_%02d | ink ribbon with crosier edge" % idx, body, [CURL_MAT if TILES else INK_MAT, BONE_MAT])

    def rib_color(i, t, j, a):
        if TILES:
            return (0.95, 1.0, 0.95)
        return mix(INK, (0.030, 0.062, 0.040), max(0.0, math.sin(a)) ** 1.5 * (0.5 + 0.5 * (1 - t)))
    frames, _ = mb.ribbon(path, ws, ts, sides=14, color_fn=rib_color, hint=nrm, bulge=1.2, mat=0,
                          weights_fn=lambda i, t, st=stations: chain_weights(t, st),
                          uv_fn=(lambda i, t, j, a: (i * 0.018 / TILE_M, (1 - abs(2 * j / 14 - 1)) * 1.0)) if TILES else None)
    T, Nn, B = frames
    # pale ridge line along the convex face
    ridge = np.asarray([path[i] + Nn[i] * (ts[i] * 0.5 * 1.2 * 0.92) for i in range(n)])
    mb.tube(ridge, 0.035 * ws + 0.004, sides=6, color=mix(BONE, BONE_EDGE, 0.6), hint=nrm, mat=1, taper_end=True,
            weights_fn=lambda i, t, st=stations: chain_weights(t, st))
    # the comb of hooked teeth
    s_acc = 0.0; last = -1.0
    for i in range(3, n - 2):
        s_acc += np.linalg.norm(path[i] - path[i - 1]); w = ws[i]
        length = min(0.30, max(0.025, (0.55 if big else 0.48) * w)) * (1 + 0.15 * noise1(i * 0.9, idx))
        if s_acc - last < max(0.024, 0.55 * length):
            continue
        last = s_acc
        edge_dir = unit(B[i] * (np.sign(np.dot(B[i], lateral)) if abs(np.dot(B[i], lateral)) > 1e-6 else 1.0))
        d0 = unit(edge_dir * 0.75 + T[i] * 0.65)
        tp = crosier_path(path[i] + edge_dir * (w * 0.46), d0, T[i], length, turns=0.72, straight=0.28, bend_power=1.6)
        tt_ = np.linspace(0, 1, len(tp))
        tw = (0.34 * length) * (1 - tt_) ** 0.8 + 0.004
        tth = np.maximum(0.005, 0.10 * length) * (1 - 0.6 * tt_)
        mb.cur_w = chain_weights(i / (n - 1), stations)
        mb.ribbon(tp, tw, tth, sides=8, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE_ROOT, BONE, 0.4), BONE_EDGE, t1 ** 0.7),
                  hint=nrm, bulge=1.0, mat=1)
        mb.cur_w = None
    # dark crenellated knob row along the outer edge, through the tip spiral
    rim_knobs(mb, path, ws, ts, (T, Nn, B), lateral, lambda t_: chain_weights(t_, stations))
    # curl clusters: two extra spirals sprouting from each cluster frond (curls on curls), each with its own knob row
    if idx in CLUSTER_PARENT:
        for fr_ in (0.42, 0.70):
            k = int(fr_ * (n - 1)); w = ws[k]
            inner = unit(B[k] * (np.sign(np.dot(B[k], lateral)) if abs(np.dot(B[k], lateral)) > 1e-6 else 1.0)); outer = -inner
            d0 = unit(outer * 0.7 + T[k] * 0.7)
            sp = resample(crosier_path(path[k] + outer * (w * 0.45), d0, T[k], w * 2.4 + 0.12, turns=1.25, straight=0.3, bend_power=1.5), spacing=0.016)
            m_ = len(sp); tt_ = np.linspace(0, 1, m_)
            sw = (w * 0.55) * (1 - tt_) ** 1.1 + 0.006; sth = sw * 0.45 + 0.006
            wfix = chain_weights(k / (n - 1), stations)
            fr2, _ = mb.ribbon(sp, sw, sth, sides=10, color_fn=rib_color, hint=nrm, bulge=1.2, mat=0, weights_fn=lambda i2, t2, wf=wfix: wf)
            rim_knobs(mb, sp, sw, sth, fr2, T[k], lambda t_, wf=wfix: wf, start=1)
    fob = attach(mb.finish(micro_uv_scale=2.4)); clean(fob)
print("FRONDS_DONE", round(time.time() - START, 1), flush=True)


# --- face leaf, beads, head/jaw skin
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
    ys, xs = np.mgrid[0:size, 0:size]; u = xs / (size - 1) * 2 - 1; t = ys / (size - 1)
    mask = np.zeros((size, size))
    width = np.interp(t, [0, .20, .50, .80, 1], [.30, .35, .255, .105, .001]) / .35
    un = np.clip(u / np.maximum(width, 1e-3), -1.2, 1.2)
    for u0 in np.linspace(-.92, .92, 9):
        uu = u0 * (1 - .22 * t) + .12 * u0 * np.sin(np.pi * t)
        mask = np.maximum(mask, np.exp(-((np.abs(un - uu) * np.maximum(width, 0.05)) / 0.0075) ** 2))
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


mat = v8.face_material() if TILES else bpy.data.materials.get("Rune | v3 face lattice")
if not mat:
    mat = bpy.data.materials.new("Rune | v3 face lattice"); mat.use_nodes = True
    nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = lattice_image()
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "AuthoredUV"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"]); nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"]); nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Emission Strength"].default_value = 1.1; b.inputs["Roughness"].default_value = 0.5
    mat.blend_method = "BLEND"; mat.use_backface_culling = False
mface = MeshBuilder("Face | fused glowing lattice leaf", body, [mat])
rows, cols = 44, 22
grid = [[Pinv(OLD_H @ facepoint(0.02 + 0.965 * i / rows, (-1 + 2 * j / cols) * 0.97)) for j in range(cols + 1)] for i in range(rows + 1)]
mface.patch(np.asarray(grid), color=(1.0, 1.0, 1.0) if TILES else (0.4, 0.9, 0.5), uv_fn=lambda a, b_: ((b_ * 2 - 1) * 0.5 + 0.5, a))
face = mface.finish(micro_uv_scale=1.0)
bpy.context.view_layer.objects.active = face
sw = face.modifiers.new("Fuse to head surface", "SHRINKWRAP")
sw.target = headmesh; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.wrap_mode = "ABOVE_SURFACE"; sw.offset = 0.006
bpy.ops.object.modifier_apply(modifier=sw.name)
dt = face.modifiers.new("Copy neck weights", "DATA_TRANSFER")
dt.object = headmesh; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
for g_ in headmesh.vertex_groups:
    face.vertex_groups.new(name=g_.name)
bpy.ops.object.datalayout_transfer(modifier=dt.name); bpy.ops.object.modifier_apply(modifier=dt.name)
attach(face)
HORNS = [([(-.20, .29, .02), (-.43, .39, .02), (-.68, .64, -.04), (-.76, .96, -.10)], .080),
         ([(.21, .25, .025), (.44, .44, .01), (.49, .77, -.06), (.39, 1.06, -.14)], .088),
         ([(-.12, .025, .035), (-.32, .015, .045), (-.52, .00, .03), (-.84, .18, -.04), (-1.04, .39, -.11)], .095),
         ([(.12, .045, .035), (.32, .05, .045), (.57, .10, .025), (.93, .41, -.04), (1.04, .72, -.11)], .098)]
mbead = MeshBuilder("HeadBeads | pearl chains on the tendrils", body, [BONE_MAT])
mbead.cur_w = [("HeadPivot", 1.0)]
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
sphere = [(v.co.x, v.co.y, v.co.z) for v in bm.verts]; sfaces = [tuple(v.index for v in f.verts) for f in bm.faces]; bm.free()
for cs, radius in HORNS:
    ps = catmull(cs, 14); n = len(ps); sg = 1 if cs[0][0] < 0 else -1; acc = 0.0; last = -1.0
    for i in range(1, n - 1):
        acc += np.linalg.norm(ps[i] - ps[i - 1]); t = i / (n - 1)
        if t > 0.93:
            break
        if acc - last < 0.030 + 0.014 * (1 - t):
            continue
        last = acc
        tang = unit(ps[i + 1] - ps[i - 1]); side = unit(np.cross(tang, V((0, 0, 1)))) * sg
        w = radius * (1 - t) ** 1.1 * (1 + .28 * (1 - t) ** 3) + .0018
        centre = ps[i] + side * (w * 0.98); br = 0.0065 + 0.006 * (1 - t); sv = len(mbead.v)
        for (x, y, z) in sphere:
            mbead.add_vertex(Pinv(OLD_H @ (P(centre) + Vector((x, y, z)) * br)), BONE_EDGE)
        for f in sfaces:
            mbead.add_face(tuple(sv + kk for kk in f), 0)
attach(mbead.finish(micro_uv_scale=1.0))
mhook = MeshBuilder("FacePetals | dark hooks framing the leaf", body, [INK_MAT]); mhook.cur_w = [("HeadPivot", 1.0)]
for sgn in (-1, 1):
    for t_ in np.linspace(0.10, 0.80, 6):
        p0 = V(Pinv(OLD_H @ facepoint(t_, sgn * 0.98))); p1 = V(Pinv(OLD_H @ facepoint(t_ + 0.02, sgn * 0.98))); p2 = V(Pinv(OLD_H @ facepoint(t_, sgn * 0.80)))
        out_ = unit(p0 - p2); flow_ = unit(p1 - p0)
        mhook.crosier(p0, out_, flow_, 0.14 + 0.06 * (1 - t_), 0.014, turns=0.9, straight=0.25, sides=6,
                      color_root=INK, color_tip=mix(INK, MEMBRANE, 0.6), hint=unit(np.cross(out_, flow_)), mat=0, bend_power=1.5)
        # a dot row along one edge of each hook, like a comb's back (owner: 腕の淵の細部)
        L_ = 0.14 + 0.06 * (1 - t_)
        hp = crosier_path(p0, out_, flow_, L_, turns=0.9, straight=0.25, bend_power=1.5)
        hT, hN, hB = rmf_frames(hp, hint=unit(np.cross(out_, flow_)))
        acc_ = 0.0; last_ = -1.0
        for k_ in range(1, len(hp) - 1):
            acc_ += np.linalg.norm(hp[k_] - hp[k_ - 1])
            if acc_ - last_ < 0.016:
                continue
            last_ = acc_
            r_ = 0.014 * (1 - 0.8 * (k_ / len(hp)) ** 0.9) + 0.0008
            knob_box(mhook, hp[k_] + hB[k_] * (r_ * 0.9), hT[k_], hB[k_], hN[k_], 0.009, 0.007, 0.006, (0.02, 0.045, 0.028), 0)
attach(mhook.finish(micro_uv_scale=1.0))
# head colours + skin; jaw and oral membrane ride the jaw bone
g_, gn_ = (lambda me: (np.array([tuple(v.co) for v in me.vertices]), np.array([tuple(v.normal) for v in me.vertices])))(headmesh.data)
front = np.clip(-gn_[:, 1], 0, 1)
cols_ = np.array([mix(INK, (0.05, 0.11, 0.06), float(f) ** 1.5 * 0.8) for f in front])
layer = headmesh.data.color_attributes.get("GuardianSurface")
layer.data.foreach_set("color", np.c_[cols_, np.ones(len(cols_))].ravel()); headmesh.data.update()
attach(headmesh)
for ob in (jawmesh, mouthmesh):
    vg = ob.vertex_groups.new(name="JawPivot"); vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    attach(ob)
print("HEAD_DONE", round(time.time() - START, 1), flush=True)

# --- cavity AO into the colours
if opts["ao"] == "1":
    from guardian_cavity_ao import bake_guardian_cavity
    stats = bake_guardian_cavity(root, radius=0.45, samples=10, strength=0.70)
    for ob in [o for o in root.children_recursive if o.type == "MESH"]:
        me = ob.data; ao_layer = me.color_attributes.get("GuardianCavityAO"); col = me.color_attributes.get("GuardianSurface")
        if ao_layer is None or col is None or ob.name.startswith("Face |"):
            continue
        ao = np.empty(len(me.vertices) * 4); ao_layer.data.foreach_get("color", ao)
        cc = np.empty(len(me.vertices) * 4); col.data.foreach_get("color", cc); cc = cc.reshape(-1, 4)
        cc[:, :3] *= ao.reshape(-1, 4)[:, 0][:, None]
        col.data.foreach_set("color", cc.ravel()); me.color_attributes.remove(ao_layer)
        idx = [c.name for c in me.color_attributes].index("GuardianSurface")
        me.color_attributes.active_color_index = idx; me.color_attributes.render_color_index = idx; me.update()
    print("AO_DONE", round(time.time() - START, 1), flush=True)

# ================================================================ poses
rig.animation_data_create()
bones = rig.pose.bones
BX, BY, BZ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def q(axis, deg):
    return Quaternion(axis, math.radians(deg))


def chain_names(prefix, count):
    return [f"{prefix}_{k:02d}" for k in range(count)]


HEAD_BONES = ["NeckBaseJoint", "NeckHeadJoint", "HeadPivot", "JawPivot"]
ALL = [pb.name for pb in bones]


def pose_exhale(f=1.0):
    return {"NeckBaseJoint": q(BX, -14 * f), "NeckHeadJoint": q(BX, -22 * f), "HeadPivot": q(BX, -30 * f), "JawPivot": q(BX, 62 * f)}


def pose_coil():
    out = {}
    for k, n in enumerate(chain_names("SpineUp", 16)):
        out[n] = Quaternion()                       # the coil stays tight
    for k, n in enumerate(chain_names("SpineDown", 10)):
        out[n] = q(BZ, 15) @ q(BX, -4)
    for k, n in enumerate(chain_names("TailA", 8)):
        out[n] = q(BZ, 16) @ q(BX, 3)
    for k, n in enumerate(chain_names("TailB", 5)):
        out[n] = q(BZ, -17)
    for k, n in enumerate(chain_names("ArmL", 10)):
        out[n] = q(BZ, -5)
    for k, n in enumerate(chain_names("ArmR", 5)):
        out[n] = q(BZ, 10)
    out.update({"NeckBaseJoint": q(BX, 10), "NeckHeadJoint": q(BX, 8), "HeadPivot": q(BX, 12)})
    for i in range(len(FRONDS)):
        for n in ["TentaclePivot_%02d" % i, "Frond%02d_1" % i, "Frond%02d_2" % i]:
            out[n] = q(BZ, 7 if i % 2 else -6)
    return out


def pose_rear():
    out = {}
    for k, n in enumerate(chain_names("SpineUp", 16)):
        out[n] = q(BZ, 3) @ q(BX, -4)
    for k, n in enumerate(chain_names("SpineDown", 10)):
        out[n] = q(BX, -7 * (1 - k / 10))
    for k, n in enumerate(chain_names("TailA", 8)):
        out[n] = q(BZ, -8) @ q(BX, 5)
    for k, n in enumerate(chain_names("TailB", 5)):
        out[n] = q(BZ, 9)
    for k, n in enumerate(chain_names("ArmL", 10)):
        out[n] = q(BZ, 6) @ q(BX, 4)
    for k, n in enumerate(chain_names("ArmR", 5)):
        out[n] = q(BZ, -14) @ q(BX, -6)
    out.update({"NeckBaseJoint": q(BX, -24), "NeckHeadJoint": q(BX, -24), "HeadPivot": q(BX, -16), "JawPivot": q(BX, 18)})
    for i in range(len(FRONDS)):
        spread = 14 if i < 5 else 10
        for n in ["TentaclePivot_%02d" % i, "Frond%02d_1" % i, "Frond%02d_2" % i]:
            out[n] = q(BZ, spread if i % 2 else -spread) @ q(BX, -5)
    return out


def pose_swim(phase):
    out = {}
    for k, n in enumerate(chain_names("SpineUp", 16)):
        out[n] = q(BZ, 4.5 * math.sin(phase - k * 0.42)) @ q(BX, 2.5 * math.sin(phase * 2 - k * 0.3))
    for k, n in enumerate(chain_names("SpineDown", 10)):
        out[n] = q(BZ, 6 * math.sin(phase + k * 0.5)) @ q(BX, 3 * math.cos(phase + k * 0.4))
    for k, n in enumerate(chain_names("TailA", 8)):
        out[n] = q(BZ, 9 * math.sin(phase + 1.6 + k * 0.55))
    for k, n in enumerate(chain_names("TailB", 5)):
        out[n] = q(BZ, 8 * math.sin(phase + 2.3 + k * 0.6))
    for k, n in enumerate(chain_names("ArmL", 10)):
        out[n] = q(BZ, 3.5 * math.sin(phase + 0.8 + k * 0.35))
    for k, n in enumerate(chain_names("ArmR", 5)):
        out[n] = q(BZ, 4 * math.sin(phase + 2.0 + k * 0.4))
    out.update({"NeckBaseJoint": q(BX, 4 * math.sin(phase)), "NeckHeadJoint": q(BX, 3 * math.sin(phase + 0.5)), "HeadPivot": q(BX, 3 * math.sin(phase + 1.0))})
    for i in range(len(FRONDS)):
        for kk, n in enumerate(["TentaclePivot_%02d" % i, "Frond%02d_1" % i, "Frond%02d_2" % i]):
            out[n] = q(BZ, 5 * math.sin(phase + i * 0.7 + kk * 0.5))
    return out


def set_pose(values, names=None):
    for n in (names or ALL):
        bones[n].rotation_quaternion = values.get(n, Quaternion())


def key_pose(action, values, frame, names):
    rig.animation_data.action = action
    for n in names:
        pb = bones[n]; pb.rotation_quaternion = values.get(n, Quaternion())
        pb.keyframe_insert("rotation_quaternion", frame=frame)


CLIPS = {}
for name, maker, names, frames in (("Rest", lambda: {}, ALL, (1, 49)), ("Exhale", pose_exhale, HEAD_BONES, (1, 49)),
                                   ("Coil", pose_coil, ALL, (1, 49)), ("Rear", pose_rear, ALL, (1, 49))):
    ac = bpy.data.actions.new(name); values = maker()
    for fr in frames:
        key_pose(ac, values, fr, names)
    CLIPS[name] = ac
ac = bpy.data.actions.new("Swim")
for fr in range(1, 122, 6):
    key_pose(ac, pose_swim(math.tau * (fr - 1) / 120), fr, ALL)
CLIPS["Swim"] = ac
rig.animation_data.action = None
for name, ac in CLIPS.items():
    tr = rig.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 1, ac); st.action_frame_start = 1; st.action_frame_end = 121 if name == "Swim" else 49
    tr.mute = name != "Rest"
set_pose({})
scene = bpy.context.scene; scene.render.fps = 30; scene.frame_start = 1; scene.frame_end = 121; scene.frame_set(1)

# pose checks (mouth anchors from the posed bones)
def solo(name):
    for tr in rig.animation_data.nla_tracks:
        tr.mute = tr.name != name
    scene.frame_set(1); bpy.context.view_layer.update()


posechecks = {}
for name in ("Rest", "Exhale"):
    solo(name)
    socket = rig.matrix_world @ bones["MouthSocket"].head; aim = rig.matrix_world @ bones["MouthAim"].head
    nose = rig.matrix_world @ (bones["HeadPivot"].matrix @ NOSE_LOCAL); lower = rig.matrix_world @ (bones["JawPivot"].matrix @ P((0, -.34, .09)))
    gl = lambda p: [round(p.x, 7), round(p.z, 7), round(-p.y, 7)]
    posechecks[name] = {"mouthSocket": gl(socket), "mouthAim": gl(aim), "direction": gl((aim - socket).normalized()), "jawTipSeparation": (nose - lower).length}
solo("Rest")
audit = [mesh_audit(o) for o in root.children_recursive if o.type == "MESH"]
print("MESHES", json.dumps({"objects": len(audit), "vertices": sum(a["vertices"] for a in audit), "triangles": sum(a["triangles"] for a in audit)}), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"guardian-{STAMP}.blend"))
print("SAVED", round(time.time() - START, 1), flush=True)

# ================================================================ export
if opts["export"] == "1":
    for tr in rig.animation_data.nla_tracks:
        tr.mute = False
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, *root.children_recursive]:
        ob.select_set(True)

    def strip_exhale(path):
        """Keep only the neck/head/jaw channels in Exhale (so it can be used additively from any pose)."""
        raw = path.read_bytes(); jlen = struct.unpack_from("<I", raw, 12)[0]; g = json.loads(raw[20:20 + jlen])
        rest = raw[20 + jlen:]
        names = {i: n.get("name") for i, n in enumerate(g["nodes"])}
        for anim in g["animations"]:
            if anim["name"] != "Exhale":
                continue
            keep = [ch for ch in anim["channels"] if names.get(ch["target"]["node"]) in HEAD_BONES]
            used = sorted({ch["sampler"] for ch in keep}); remap = {s: k for k, s in enumerate(used)}
            anim["samplers"] = [anim["samplers"][s] for s in used]
            for ch in keep:
                ch["sampler"] = remap[ch["sampler"]]
            anim["channels"] = keep
        js = json.dumps(g, separators=(",", ":"), ensure_ascii=True).encode(); js += b" " * ((-len(js)) % 4)
        out = struct.pack("<III", 0x46546c67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4e4f534a) + js + rest
        path.write_bytes(out); return g
    assets = []; lastg = None
    for compressed, name in [(False, f"guardian-{STAMP}.glb"), (True, f"guardian-{STAMP}-draco.glb")]:
        path = OUT / name
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
                                  export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                                  export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=True,
                                  export_def_bones=False, export_rest_position_armature=True, export_skins=True,
                                  export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_image_format="AUTO",
                                  export_draco_mesh_compression_enable=compressed, export_draco_mesh_compression_level=7,
                                  export_draco_position_quantization=14, export_draco_normal_quantization=10,
                                  export_draco_texcoord_quantization=12, export_draco_color_quantization=10)
        lastg = strip_exhale(path)
        assets.append({"file": name, "draco": compressed, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    names = {n.get("name") for n in lastg["nodes"]}
    report = {"stage": "v5 serpent: slender ribbed body with a skeleton and pose clips", "version": 5, "revision": STAMP,
              "model": assets[-1]["file"], "assetBytes": assets[-1]["bytes"], "assetSha256": assets[-1]["sha256"],
              "coordinateSystem": {"up": "+Y", "front": "+Z", "unit": "meter"},
              "nodes": {"root": root.name, "body": body.name, "rig": "SerpentRig", "head": "HeadPivot", "jaw": "JawPivot",
                        "mouth": "MouthSocket", "mouthAim": "MouthAim", "neck": ["NeckBaseJoint", "NeckHeadJoint"],
                        "spineRoot": "SpineRoot", "spineUp": chain_names("SpineUp", 16), "spineDown": chain_names("SpineDown", 10),
                        "tailA": chain_names("TailA", 8), "tailB": chain_names("TailB", 5), "armL": chain_names("ArmL", 10),
                        "armR": chain_names("ArmR", 5), "tentacles": ["TentaclePivot_%02d" % i for i in range(len(FRONDS))],
                        "fingers": {("TentaclePivot_%02d" % i): ["Frond%02d_1" % i, "Frond%02d_2" % i] for i in range(len(FRONDS))},
                        "neckRig": "SerpentRig", "joints": ["NeckBaseJoint", "NeckHeadJoint"]},
              "animations": list(CLIPS.keys()), "transitionSeconds": 1.6,
              "poseClips": {"Rest": "reference pose, all bones", "Exhale": "neck/head/jaw only (NeckBaseJoint, NeckHeadJoint, HeadPivot, JawPivot); convert to additive against Rest to breathe from any pose",
                            "Coil": "coiled, all bones", "Rear": "rearing threat, raised head, spread arms, all bones", "Swim": "4 s undulation loop, all bones"},
              "breath": {"bones": HEAD_BONES, "additiveReference": "Rest", "headRotationDegrees": {"NeckBaseJoint": -14, "NeckHeadJoint": -22, "HeadPivot": -30, "JawPivot": 62}},
              "poseChecks": posechecks, "meshAudit": audit,
              "meshStats": {"objects": len(audit), "vertices": sum(a["vertices"] for a in audit), "triangles": sum(a["triangles"] for a in audit)},
              "assets": assets, "skinCount": len(lastg.get("skins", [])), "skinJoints": len(lastg["skins"][0]["joints"]) if lastg.get("skins") else 0,
              "colorAttribute": "GuardianSurface COLOR_0: role colours (bone/ink/membrane/glow) with cavity AO multiplied once",
              "sourceScripts": ["scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v5.py"],
              "sourceSha256": {p: hashlib.sha256((HERE.parent.parent / p).read_bytes()).hexdigest() for p in ["scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v5.py"]},
              "referenceImagesUsedAsTexture": False, "anatomy": "handoff/goal/ciel3d/model/anatomy-v4.md",
              "secondsBeforeRender": time.time() - START}
    (OUT / "model-manifest.json").write_text(json.dumps(report, indent=2))
    print("EXPORT_DONE", round(time.time() - START, 1), json.dumps(assets), "nodes", len(names), flush=True)
