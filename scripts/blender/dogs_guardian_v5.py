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
# v14: the head group moves forward (glTF +z); the front silhouette is unchanged, the side gains width
HEAD_SHIFT = Vector((0.0, -0.35, 0.0))   # Blender -y = glTF +z
for ob in (headmesh, jawmesh, mouthmesh):
    for v in ob.data.vertices:
        v.co = v.co + HEAD_SHIFT
    ob.data.update()
NEW_H = Matrix.Translation(HEAD_SHIFT) @ NEW_H
OLD_H = Matrix.Translation(HEAD_SHIFT) @ OLD_H
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


def glass_material(name, rgb=(0.188, 0.578, 0.262)):
    """05's arm ladder and the flame hooks: pale translucent green glass (sRGB ~(120,200,140), alpha 1; the
    runtime makes the `Glass` family translucent). Constant base colour, never painted, no vertex colours."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = 0.3; b.inputs["Metallic"].default_value = 0.0
    return m


GLASS_MAT = glass_material("Glass | arm ladder")
HORN_MAT = glass_material("Horn | face crown", rgb=(0.0037, 0.0070, 0.0050))   # sRGB ~(12,20,16); roughness set below
HORN_MAT.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.25
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
    CRESCENT_MAT = v8.tile_material("Skin | v8 crescent combs", TILE_IMGS["crescent"], TILE_IMGS["crescent_n"], 0.35)   # v20: low normal strength (toon ramp)
    CURL_MAT = v8.tile_material("Skin | v8 curl chains", TILE_IMGS["curl"], TILE_IMGS["curl_n"], 0.6)
    MEMB_MAT = v8.tile_material("Skin | v8 veined membrane", TILE_IMGS["membrane"], TILE_IMGS["membrane_n"], 0.3)
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
C_WHORL = V((1.17, 2.52, -0.90))


K_WHORL = 0.115   # log-spiral pitch: turns touch when the tube radius is half the radial gap


def whorl_outward(R_out=1.12, turns=3.5, start_deg=206, n=640, back=0.52):
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
descent = catmull([tuple(coil[-1]), (-0.10, 1.80, 0.10), (0.12, 1.35, 0.35), (0.36, 0.90, 0.45), (0.34, 0.40, 0.42),
                   (0.12, -0.10, 0.38), (-0.02, -0.55, 0.45)], 18)
MAIN = resample(np.concatenate([coil, descent[1:]], axis=0), spacing=0.02)
N_MAIN = len(MAIN)
arc_main = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(MAIN, axis=0), axis=1))))
S_MAIN = arc_main / arc_main[-1]
# radius profile along the main path by position: centre 0.09 -> outer coil 0.22 -> ribbed 0.27 -> fork 0.20
coil_len = sum(np.linalg.norm(np.diff(coil, axis=0), axis=1))
s_coil_end = coil_len / arc_main[-1]
J_POINT = V((0.30, 0.90, 0.42))
s_J = S_MAIN[np.argmin(np.linalg.norm(MAIN - J_POINT, axis=1))]
def coil_plane_radius(i):
    rv = MAIN[i] - C_WHORL; rv = rv - E3 * np.dot(rv, E3)
    return float(np.linalg.norm(rv))


def coil_tube_radius(i):
    # half the radial gap between turns (slightly more, so the turns touch and fill the spiral)
    return min(0.33, 0.5 * coil_plane_radius(i) * (1 - math.exp(-math.tau * K_WHORL)) * 1.08 + 0.015)


R_MAIN = np.array([
    coil_tube_radius(i) if s < s_coil_end
    else (0.27 + 0.07 * math.sin(math.pi * min(1, (s - s_coil_end) / (1 - s_coil_end)))) * (1 - 0.28 * max(0, (s - 0.85) / 0.15))
    for i, s in enumerate(S_MAIN)])
R_MAIN *= 1 + 0.03 * np.array([noise1(s * 40, 2) for s in S_MAIN])
F_POINT = MAIN[-1]
TAIL_A = resample(catmull([tuple(F_POINT), (0.08, -0.80, 0.52)] + [(.08 + .32 * math.sin(t * math.tau + math.pi) - .30 * t, -.80 - 2.95 * t, .55 + .90 * t + .28 * math.sin(t * math.pi * 1.5)) for t in np.linspace(0.08, 1, 40)], 6), spacing=0.025)
TAIL_B = resample(catmull([tuple(F_POINT), (0.28, -0.78, 0.45), (0.68, -1.05, 0.52), (1.0, -1.45, 0.55), (1.12, -1.90, 0.50)], 10), spacing=0.025)
NECK = resample(catmull([(0.30, 0.90, 0.42), (-0.12, 0.95, 0.70), (-0.52, 0.92, 0.77)], 12), spacing=0.02)


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
    catmull([(-0.85, 0.78, 1.00), (-0.90, 0.95, 1.15)], 6),
    coil_path((-0.62, 0.80, 1.30), 0.30, 0.035, 2.2, 150, 0.25, 110, cw=False)[1:],
    catmull([(-0.60, 0.88, 1.55), (-0.78, 1.12, 1.45), (-0.88, 1.35, 1.35)], 8)[1:],
    coil_path((-0.43, 1.53, 1.25), 0.46, 0.045, 2.4, 190, -0.40, 130, cw=True)[1:],
    catmull([(-0.40, 1.60, 0.90), (-0.34, 1.76, 1.05), (-0.30, 1.85, 1.20)], 8)[1:]], axis=0), spacing=0.02)
ARM_R = resample(catmull([(0.05, 1.00, 0.35), (0.25, 1.22, 0.00), (0.45, 1.45, -0.35), (0.76, 1.63, -0.60)], 12), spacing=0.02)

# fronds (v3 ribbon vocabulary with bigger curl chains); anchors are the v2 pivots
FRONDS = [
    # fan (front-left): v12's x/y; z ramps root -> tip from the hi-res side views (anatomy-v5.md)
    ([(-.42, 1.73, 1.20), (-1.18, 2.02, 1.43), (-1.60, 2.75, 1.67), (-1.76, 3.22, 1.90)], .80, 1.05, +1, (.23, .29, .07)),
    ([(-.23, 1.94, 1.20), (-.57, 2.49, 1.30), (-.84, 3.14, 1.40), (-1.00, 3.44, 1.50)], .72, 1.05, +1, (.22, .27, .07)),
    ([(-.03, 2.02, 1.15), (.03, 2.65, 1.13), (-.16, 3.30, 1.12), (-.36, 3.56, 1.10)], .68, 1.0, +1, (.21, .25, .06)),
    ([(-.61, 1.42, 1.25), (-1.27, 1.63, 1.48), (-1.79, 2.19, 1.72), (-2.04, 2.54, 1.95)], .77, 1.05, +1, (.22, .27, .07)),
    ([(.03, 1.98, 1.10), (.32, 2.46, .93), (.28, 3.00, .77), (.40, 3.30, .60)], .61, 1.0, -1, (.18, .22, .05)),
    # big arms: v12's x/y arcs, behind the body (05/07 put them at the back)
    ([(-.56, 1.07, .10), (-1.45, .85, -.70), (-2.15, .15, -1.25), (-2.18, -.55, -1.25), (-1.85, -1.05, -.95)], 2.8, 1.6, +1, (.44, .52, .12)),
    ([(.76, 1.63, -.60), (1.70, 1.45, -1.05), (2.20, .70, -1.45), (2.15, -.10, -1.45), (1.72, -.65, -1.15)], 2.6, 1.6, +1, (.42, .50, .12)),
    # curl clusters (05, crops/arm-rims.jpg): big fiddleheads growing straight out of the arm just before its own
    # end curl, no stalks; deltas from that anchor (CLUSTER_PARENT), one in front of the arm and one behind
    ([(0, 0, 0), (0.18, -0.22, 0.15), (0.32, -0.40, 0.22)], 2.3, 1.6, +1, (.20, .23, .07)),
    ([(0, 0, 0), (-0.18, -0.22, 0.15), (-0.32, -0.40, 0.22)], 2.3, 1.6, -1, (.20, .23, .07)),
    ([(0, 0, 0), (0.22, -0.18, -0.15), (0.40, -0.34, -0.22)], 1.7, 1.5, +1, (.17, .18, .06)),
    ([(0, 0, 0), (-0.22, -0.18, -0.15), (-0.40, -0.34, -0.22)], 1.7, 1.5, -1, (.17, .18, .06)),
    ([(-.33, 1.85, 1.20), (-.85, 2.30, 1.37), (-1.20, 2.95, 1.53), (-1.32, 3.35, 1.70)], .72, 1.05, +1, (.22, .25, .06)),
    ([(-.95, 1.90, 1.30), (-1.35, 1.85, 1.53), (-1.70, 1.95, 1.77), (-1.85, 2.00, 2.00)], .68, 1.35, +1, (.22, .25, .06)),
]


def plane_normal(points):
    pts = np.asarray(points, float); c = pts.mean(axis=0)
    n = np.linalg.svd(pts - c)[2][-1]
    return unit(n if n[2] >= 0 else -n)


def fiddlehead_path(base, direction, curl_toward, length, turns, a=0.36, n=None):
    """A rolled-up fern fiddlehead: the heading turns as 2*pi*turns*(a*u + (1-a)*u^2), so the roll starts at a
    large radius right away and tightens toward its centre (05's curl clusters); planar like crosier_path."""
    d = unit(V(direction)); c = unit(V(curl_toward) - d * np.dot(V(curl_toward), d))
    if n is None:
        n = max(9, int(length / 0.017))
    pts = []; pos = V(base).copy(); ds = length / (n - 1)
    for i in range(n):
        u = i / (n - 1); pts.append(pos.copy())
        phi = math.tau * turns * (a * u + (1 - a) * u * u)
        pos = pos + (d * math.cos(phi) + c * math.sin(phi)) * ds
    return np.asarray(pts)


def frond_path(controls, curl_len, curl_turns, side, roll=None, nrm_override=None):
    nrm = plane_normal(controls) if nrm_override is None else unit(V(nrm_override))
    base = resample(catmull(controls, 20), spacing=0.02)
    tang = unit(base[-1] - base[-3]); lateral = unit(np.cross(nrm, tang)) * side
    if roll is not None:
        curl = fiddlehead_path(base[-1], tang, lateral, curl_len, curl_turns, a=roll)
    else:
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
TIP_B = ((OLD_H @ P((0.0, -1.0, 0.0))) - (OLD_H @ P((0.0, 0.0, 0.0)))).normalized()   # the bud's tip direction (body space)
add_bone("MouthSocket", None, None, "HeadPivot", matrix=Matrix.Translation(TIP_B * 0.35) @ NEW_H @ SOCKET_L, length=0.04)
add_bone("MouthAim", None, None, "HeadPivot", matrix=NEW_H @ AIM_L, length=0.04)
NECK_STATIONS = [("NeckBaseJoint", 0.25), ("NeckHeadJoint", 0.75)]
ARML = add_chain("ArmL", ARM_L, 10, "NeckHeadJoint")
ARMR = add_chain("ArmR", ARM_R, 5, "NeckBaseJoint")
FROND_DATA = []
FINGER_PARENT = {0: ARML[-1][0], 1: ARML[-1][0], 2: ARML[-1][0], 3: ARML[-1][0], 4: ARML[-1][0],
                 5: "NeckBaseJoint", 6: ARMR[-1][0], 7: "Frond05_2", 8: "Frond06_2", 9: "Frond06_2", 10: "Frond05_2",
                 11: ARML[-1][0], 12: ARML[-1][0]}
CLUSTER_PARENT = {7: 5, 10: 5, 8: 6, 9: 6}   # the lower-left / lower-right curl clusters hang from the big arms' tips
for idx in range(len(FRONDS)):
    controls, cl, ct, side, widths = FRONDS[idx]
    if idx in CLUSTER_PARENT:   # anchor: the parent arm just before its end curl begins (not the curl's end)
        ppath = FROND_DATA[CLUSTER_PARENT[idx]][1]; s_end = FROND_DATA[CLUSTER_PARENT[idx]][4]
        tip = ppath[int(max(0.0, s_end - 0.05) * (len(ppath) - 1))]
        shift = tip - V(controls[0]); controls = [tuple(V(c) + shift) for c in controls]
    # cluster curls lie in the picture plane like 05's (their three controls are nearly collinear, so the fitted plane is not usable)
    path, nrm, lateral, s_base_end = frond_path(controls, cl, ct, side, roll=0.36 if (idx in CLUSTER_PARENT or widths[1] > 0.4) else None,
                                                nrm_override=(0.0, 0.08, 1.0) if idx in CLUSTER_PARENT else None)
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
                   rib_scale=1.0, hint=(0, 0, 1), scales=0, scale_size=1.0, rib_width=0.32, paired=False, crest_scale=1.0,
                   uv_override=None, bands=None, station_phase=None, blades=0, blade_back=1.0, front_sign=1.0):
    """A dark membrane tube with transverse bone arcs over its front, rows of crescent scales
    (hooked curls lying on the surface) across the front, a crosier crest on the side given by
    crest_fn(i) (unit vector or None) and optional comb spines from comb_fn(i)."""
    path = np.asarray(path); n = len(path)
    T, Nn, B = rmf_frames(path, hint=hint)
    if front_sign < 0:   # the coil's RMF normal comes out facing the back; flip N and B together (handedness kept)
        Nn = -Nn; B = -B
    arc = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1)))); ss = arc / arc[-1]

    def wf(i, t):
        return chain_weights(ss[i], stations)

    def dark_col(i, t, j, a):
        g = glow_fn(i) if glow_fn else 0.0
        if TILES:   # the tile carries the colour; the vertex colour is only an AO/glow multiplier
            return mix((0.92, 1.0, 0.92) if not paired else (0.50, 0.68, 0.54), (0.75, 1.0, 0.80), g)   # paired: recessed, darker
        c = mix(WALL_DARK, WALL_MID, 0.25 + 0.75 * max(0.0, math.sin(a)) ** 1.4)
        return mix(c, GLOW, g * 0.6)
    f0 = len(mb.f)
    mb.tube(path, radii * (0.86 if paired else 1.0), sides=sides, color_fn=dark_col, hint=hint, weights_fn=wf, mat=mat_dark, taper_end=radii[-1] < 0.02,
            uv_fn=uv_override if uv_override is not None else (tube_uv(arc, radii, sides) if TILES else (lambda i, t, j, a: (arc[i] / 0.16, j / sides * 4.0))))
    if glow_fn is not None:   # rings deep in the glow use the emissive core material
        for i in range(n - 1):
            if glow_fn(i) > 0.5:
                for j in range(sides):
                    mb.fm[f0 + i * sides + j] = mat_glow
    if bands:   # v19 (05's whorl): pale ridge bands run along the coil between rows of dark pits and flow into the bright centre
        for ang in bands:
            a_ = math.radians(ang)
            bp = np.asarray([path[i] + (B[i] * math.cos(a_) + Nn[i] * math.sin(a_)) * (radii[i] * 1.0) for i in range(n)])
            br = 0.14 * radii + 0.004
            mb.tube(bp, br, sides=5, color_fn=lambda i2, t2, j2, a2: mix(mix(BONE, BONE_EDGE, 0.5), GLOW, (glow_fn(i2) if glow_fn else 0.0) * 0.6),
                    hint=hint, weights_fn=wf, mat=mat_bone, taper_end=True, uv_fn=tube_uv(arc, br, 5))
    if paired and not blades:   # 05: a pale bone spine along the front face; the paired ribs grow from it at each station
        spine = np.asarray([path[i] + Nn[i] * (radii[i] * 0.96) for i in range(n)])
        srad = 0.075 * radii + 0.005
        mb.tube(spine, srad, sides=6, flat=0.7, color_fn=lambda a1, t1, b1, c1: mix(BONE, BONE_EDGE, 0.45 + 0.4 * max(0.0, math.cos(c1))), hint=hint,
                weights_fn=wf, mat=mat_bone, taper_end=True, uv_fn=tube_uv(arc, srad, 6))
    last = -1.0; count = 0; last_phase = None
    for i in range(2, n - 2):
        if station_phase is not None:   # v20: stations locked to the tile's pit phase (one rib per pit gap, no jitter)
            ph = int(math.floor(station_phase[i] + 0.5))
            if last_phase is None:
                last_phase = ph; continue
            if ph == last_phase:
                continue
            last_phase = ph; sp = spacing[0] * radii[i] + spacing[1]
        else:
            sp = (spacing[0] * radii[i] + spacing[1]) * (1 + 0.18 * noise1(count * 1.9, 23))
            if arc[i] - last < sp:
                continue
            last = arc[i]
        count += 1
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
        if paired and blades and r > 0.03:
            # v20 (05/07 from every angle): a BOTTLE BRUSH - flat tapered pale blades radiating around the dark core at each
            # station, each curving back toward the tail and ending in a small outward curl; the dorsal slot is the flame crest
            cdv = crest_fn(i) if crest else None
            for k in range(blades):
                a_k = math.tau * (k + 0.5 * (count % 2)) / blades
                d_k = unit(front * math.cos(a_k) + lat * math.sin(a_k))
                if cdv is not None and float(np.dot(d_k, cdv)) > math.cos(math.radians(30)):
                    continue
                back = flow * blade_back
                q0 = path[i] + d_k * (r * 0.95); q1 = path[i] + d_k * (r * 1.35) + back * (0.25 * sp)
                q2 = path[i] + d_k * (r * 1.70) + back * (0.65 * sp); q3 = path[i] + d_k * (r * 1.85) + back * (1.05 * sp)
                bp = resample(catmull([q0, q1, q2, q3], 8), spacing=max(0.012, sp * 0.1))
                tipdir = unit(bp[-1] - bp[-2])
                curl = crosier_path(bp[-1], tipdir, d_k, 0.3 * sp + 0.02, turns=0.55, straight=0.2, bend_power=1.5)
                bp = np.concatenate([bp[:-1], curl], axis=0); tb = np.linspace(0, 1, len(bp))
                bw = (0.42 * sp + 0.006) * (1 - 0.8 * tb ** 1.2) + 0.005
                mb.ribbon(bp, bw, np.maximum(0.005, bw * 0.25), sides=8, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE, BONE_EDGE, 0.2), BONE_EDGE, abs(math.cos(c1)) ** 2.0),
                          hint=unit(np.cross(d_k, flow)), mat=mat_bone, uv_fn=lambda i2, t2, j2, a2, u0=arc[i] / TILE_M: (u0 + t2 * 0.5, j2 / 8.0))
        elif paired and r > 0.03:
            # 05 (crops/face-neck.jpg): a pale fern frond / fish skeleton - broad flat ribs with paler rims curve outward
            # from the spine and sweep back; the recessed dark membrane between them reads as oval holes.
            # AuthoredUV on the ribs: u = body arc (m / TILE_M) + 0.5 x the rib's own arc, v = around the rib section.
            for side in (1, -1):
                # v19: the ribs splay SIDEWAYS from the spine like fern leaflets (flat, 4:1), not around the tube
                p0 = path[i] + front * (r * 0.95)
                p1 = path[i] + front * (r * 0.92) + lat * (side * 0.55 * r) + flow * (0.25 * sp)
                p2 = path[i] + front * (r * 0.72) + lat * (side * 1.15 * r) + flow * (0.60 * sp)
                p3 = path[i] + front * (r * 0.40) + lat * (side * 1.55 * r) + flow * (0.95 * sp)
                rp = resample(catmull([p0, p1, p2, p3], 8), spacing=max(0.012, sp * 0.08))
                tr = np.linspace(0, 1, len(rp))
                rw = (0.42 * sp + 0.006) * (0.45 + 0.55 * np.sin(np.pi * np.clip(tr * 0.85 + 0.1, 0, 1)) ** 0.6) * (1 - 0.5 * tr ** 2) + 0.005
                rth = np.maximum(0.005, rw * 0.25)   # flat blades, 4:1
                mb.ribbon(rp, rw, rth, sides=8, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE, BONE_EDGE, 0.2), BONE_EDGE, abs(math.cos(c1)) ** 2.0),
                          hint=front, mat=mat_bone, uv_fn=lambda i2, t2, j2, a2, u0=arc[i] / TILE_M: (u0 + t2 * 0.5, j2 / 8.0))
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
            if paired:   # 05: pale flame-shaped curling crests along the dorsal edge, flat in the plane of the hook
                cp = crosier_path(path[i] + cd * (r * 0.9), cd, flow, hook_len, turns=0.85, straight=0.15, bend_power=1.5)
                tc = np.linspace(0, 1, len(cp))
                fw = hook_len * (0.34 if big else 0.26) * np.sin(np.pi * np.clip(tc, 0, 1) ** 0.65) ** 0.7 + 0.006
                mb.ribbon(cp, fw, fw * 0.22 + 0.004, sides=8, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE, BONE_EDGE, 0.3), BONE_EDGE, abs(math.cos(c1)) ** 2.5),
                          hint=unit(np.cross(cd, flow)), mat=mat_bone, uv_fn=lambda i2, t2, j2, a2, u0=arc[i] / TILE_M: (u0 + t2 * 0.6, j2 / 8.0))
            else:
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
# whorl scales (05): regular rows of scales following the spiral like a pinecone, shrinking toward the bright
# centre. AuthoredUV u runs along the coil and v across it; the tile cell is proportional to the tube radius
# (which itself shrinks with the coil radius), so the same number of rows runs around every turn and the scales
# get smaller toward the core. The projection only modulates this.
R_COIL = R_MAIN[:i_split + 2]; R_REF = float(R_COIL.max()); COIL_TILE = 1.15   # metres per tile at the outer turn
k_coil = np.maximum(0.12, R_COIL / R_REF)
seg_coil = np.linalg.norm(np.diff(MAIN[:i_split + 2], axis=0), axis=1)
U_COIL = np.concatenate(([0.0], np.cumsum(seg_coil / (COIL_TILE * 0.5 * (k_coil[:-1] + k_coil[1:])))))
PER_COIL = max(1, round(2 * math.pi * R_REF / COIL_TILE))
# v20: the whorl is the neck's fern wound into the spiral - one pale rachis along the coil, short paired ribs across it every
# quarter tube-width (phase-locked to the pit tile so a dark oval pit sits in every gap), spikes on the rim, glowing core
segmented_tube(mbody, MAIN[:i_split + 2], R_MAIN[:i_split + 2], MAIN_STATIONS, body_crest, spacing=(0.5, 0.0),
               glow_fn=body_glow, ribs=True, arc_ext=70, rib_scale=1.0, rib_width=0.12, scales=0, crest_scale=1.6, mat_dark=3,
               bands=(90,), station_phase=U_COIL * 7, front_sign=-1.0, uv_override=(lambda i, t, j, a: (U_COIL[i], (1 - abs(2 * j / 12 - 1)) * PER_COIL / 2)) if TILES else None)
segmented_tube(mbody, MAIN[i_split:], R_MAIN[i_split:], [(nm, (sc - S_MAIN[i_split]) / (1 - S_MAIN[i_split])) for nm, sc in MAIN_STATIONS if sc >= S_MAIN[i_split] - 1e-9] or MAIN_STATIONS,
               lambda i: body_crest(i + i_split), arc_ext=110, spacing=(0.45, 0.012), comb_fn=lambda i: body_comb(i + i_split),
               ribs=False, paired=True, blades=7, blade_back=1.0, scales=0, mat_dark=3)
# neck
NECK_R = np.array([lerp(0.21, 0.16, t) for t in np.linspace(0, 1, len(NECK))])
segmented_tube(mbody, NECK, NECK_R, NECK_STATIONS, lambda i: unit(V((0.0, 1.0, 0.15))), ribs=False, crest=True, paired=True,
               blades=7, blade_back=-1.0, spacing=(0.45, 0.012), mat_dark=3)   # 07: the neck behind the head is the same fern skeleton with dorsal flame crests
# --- subtle dorsal lattice (06/07/08): an irregular bone net close around the back and the +x flank of
# the ribbed body, with flame fins; it never reaches in front of the ribs, so the front keeps v12's read
desc = MAIN[i_split:]; n_d = len(desc)
T_d, N_d, B_d = rmf_frames(desc, hint=(0, 0, 1))
st_desc = [(nm, (sc - S_MAIN[i_split]) / (1 - S_MAIN[i_split])) for nm, sc in MAIN_STATIONS if sc >= S_MAIN[i_split] - 1e-9] or MAIN_STATIONS


def shield_point(u, v, lift=0.0, jitter=True):
    k = (0.05 + 0.90 * u) * (n_d - 1); i = int(k); f = k - i
    p = desc[i] * (1 - f) + desc[min(n_d - 1, i + 1)] * f
    back = unit(-N_d[i]); lat = unit(B_d[i])
    lat = lat if lat[0] > 0 else -lat
    bell = math.sin(math.pi * min(1.0, max(0.0, (u + 0.08) / 1.1))) ** 0.75
    a = v * math.radians(110)
    d_back = (0.28 + 0.50 * bell * max(0.0, math.cos(a))) + lift
    d_lat = (0.72 if v > 0 else 0.42) * bell * math.sin(a)
    if jitter:
        d_back += 0.05 * bell * noise1(u * 9 + v * 4, 3); d_lat += 0.05 * bell * noise1(u * 7 - v * 5, 8)
    return p + back * d_back + lat * d_lat


mshield = MeshBuilder("Shield | dorsal lattice and fins", body, [MEMB_MAT, BONE_MAT])
NU, NV = 12, 11
U_J = np.array([[i / (NU - 1) + (0.45 / (NU - 1)) * noise1(i * 1.3 + j * 0.7, 11) for j in range(NV)] for i in range(NU)])
V_J = np.array([[-1 + 2 * j / (NV - 1) + (0.7 / (NV - 1)) * noise1(j * 1.1 + i * 0.6, 17) for j in range(NV)] for i in range(NU)])
U_J[0, :] = 0.0; U_J[-1, :] = 1.0; V_J[:, 0] = -1.0; V_J[:, -1] = 1.0
grid = np.asarray([[shield_point(float(np.clip(U_J[i, j], 0, 1)), float(np.clip(V_J[i, j], -1, 1))) for j in range(NV)] for i in range(NU)])


def hole(u, v):
    iu, iv = int(u * (NU - 1)), int(v * (NV - 1))
    h = math.sin(iu * 12.9898 + iv * 78.233) * 43758.5453; h -= math.floor(h)
    cu, cv = (u * (NU - 1)) % 1.0, (v * (NV - 1)) % 1.0
    return h < 0.75 and ((cu - 0.5) / 0.46) ** 2 + ((cv - 0.5) / 0.44) ** 2 < 1.0


mshield.patch(grid, color=(0.85, 0.95, 0.85) if TILES else mix(WALL_DARK, WALL_MID, 0.3), mat=0, skip_fn=hole)
for vi in range(len(mshield.v)):
    mshield.vw[vi] = chain_weights((vi // NV) / (NU - 1), st_desc)
RIDGE = mix(BONE, BONE_EDGE, 0.3)   # 08: pale ridges framing the lattice holes


def keep_bar(seed):
    h = math.sin(seed * 12.9898) * 43758.5453; h -= math.floor(h)
    return h > 0.30


for iu in range(NU):
    if not keep_bar(iu * 7.1 + 3):
        continue
    line = grid[iu]
    rr = np.clip(0.028 * (1 + 0.7 * np.array([noise1(j * 0.9 + iu * 2.1, 5) for j in range(NV)])), 0.012, 0.045)
    mshield.cur_w = chain_weights(iu / (NU - 1), st_desc)
    mshield.tube(line, rr, sides=6, color=RIDGE, hint=(0, 0, 1), mat=1)
for iv in range(NV):
    if not keep_bar(iv * 5.3 + 11):
        continue
    line = grid[:, iv]
    rr = np.clip(0.026 * (1 + 0.7 * np.array([noise1(i * 1.1 + iv * 1.7, 7) for i in range(NU)])), 0.012, 0.045)
    pts_w = [chain_weights(iu / (NU - 1), st_desc) for iu in range(NU)]
    mshield.tube(line, rr, sides=6, color=RIDGE, hint=(0, 0, 1), mat=1,
                 weights_fn=lambda i2, t2, pw=pts_w: pw[min(NU - 1, int(round(t2 * (NU - 1))))])
for u in np.linspace(0.08, 0.92, 8):
    for vv, scale in ((0.0, 1.0), (0.62, 0.75)):
        base = shield_point(u, vv, jitter=False); out_ = unit(shield_point(u, vv, lift=0.3, jitter=False) - base)
        k = int((0.05 + 0.90 * u) * (n_d - 1)); up = unit(-T_d[k])
        length = (0.60 + 0.40 * math.sin(math.pi * u)) * scale
        tip = base + out_ * (length * 0.75) + up * (length * 0.65)
        fp = catmull([base, base + out_ * (length * 0.35) + up * (length * 0.15), tip], 8)
        tt = np.linspace(0, 1, len(fp))
        fw = (0.30 * scale) * (1 - tt) ** 0.7 * (0.55 + 0.45 * np.sin(3 * math.pi * tt) ** 2) + 0.01
        ft = 0.03 * (1 - tt) + 0.006
        mshield.cur_w = chain_weights(u, st_desc)
        mshield.ribbon(fp, fw, ft, sides=10, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE_ROOT, BONE, 0.6), BONE_EDGE, 0.5 * t1), hint=unit(np.cross(out_, up)), mat=1)
mshield.cur_w = None
shield = attach(mshield.finish(micro_uv_scale=2.0)); clean(shield)
print("SHIELD_DONE", round(time.time() - START, 1), flush=True)
serpent = attach(mbody.finish(micro_uv_scale=2.4))
clean(serpent)
print("BODY_DONE", round(time.time() - START, 1), flush=True)

# --- forked tails with spines
# 05/06: the forked tails are pale grey-green with dark scale rows, like the flank, not ink membrane
mtail = MeshBuilder("Tails | forked spined tails", body, [CRESCENT_MAT, BONE_MAT, CORE_MAT])
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
for path, stations, r0, r1, glow_centre in ((ARM_R, ARMR, 0.11, 0.14, ()),):
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
# the head's two spirals (05/07): smooth dark-emerald domes sitting flush on the head, covered with spiral rows of small
# pale-mint scales that wind into a softly bright centre. Conformal log-polar AuthoredUV rotated by phi makes the scale
# rows log spirals and shrinks the scales toward the centre; the tile repeats (m cos phi, m sin phi) = (5, 3) times around
# so the seam is invisible. Each dome rides one arm bone rigidly.
def head_dome(mb, centre, R, H, bone, segs=48, rings=20, m_cos=5, m_sin=3):
    c = V(centre); m = math.hypot(m_cos, m_sin); phi = math.atan2(m_sin, m_cos)
    rhos = [0.035 * (1 / 0.035) ** (k / (rings - 1)) for k in range(rings)]   # geometric: even in log-polar
    mb.cur_w = [(bone, 1.0)]
    idx = []
    for k, rho in enumerate(rhos):
        ring = []
        for j in range(segs + 1):
            th = j / segs * math.tau
            a, b = th, math.log(rho)
            u = (math.cos(phi) * a - math.sin(phi) * b) * m / math.tau; v = (math.sin(phi) * a + math.cos(phi) * b) * m / math.tau
            p = c + V((R * rho * math.cos(th), R * rho * math.sin(th), H * math.sqrt(max(0.0, 1 - rho * rho))))
            ring.append(mb.add_vertex(p, (0.92, 1.0, 0.92), uv=(u, v)))
        idx.append(ring)
    top = mb.add_vertex(c + V((0, 0, H)), (0.75, 1.0, 0.80), uv=(0.0, 0.0))
    for j in range(segs):
        mb.add_face((top, idx[0][j], idx[0][j + 1]), 1)
    for k in range(rings - 1):
        for j in range(segs):
            mat = 1 if rhos[k + 1] < 0.08 else 0
            mb.add_face((idx[k][j], idx[k + 1][j], idx[k + 1][j + 1], idx[k][j + 1]), mat)
    # back: a shallow dark cap closing the volume
    back = [mb.add_vertex(c + V((R * math.cos(j / segs * math.tau), R * math.sin(j / segs * math.tau), 0.0)), (0.6, 0.8, 0.65), uv=(0.0, 0.0)) for j in range(segs + 1)]
    bc = mb.add_vertex(c + V((0, 0, -0.15 * R)), (0.6, 0.8, 0.65), uv=(0.0, 0.0))
    for j in range(segs):
        mb.add_face((idx[-1][j], idx[-1][j + 1], back[j + 1], back[j]), 2)
        mb.add_face((back[j + 1], bc, back[j]), 2)
    mb.cur_w = None


mdome = MeshBuilder("Arms | head scale domes", body, [CRESCENT_MAT, CORE_MAT, MEMB_MAT])
head_dome(mdome, (-0.62, 0.80, 1.12), 0.34, 0.085, "ArmL_02", m_cos=2, m_sin=1)     # v20: flatter galaxy domes (H 0.25R)
head_dome(mdome, (-0.43, 1.53, 1.00), 0.52, 0.13, "ArmL_06", m_cos=2, m_sin=1)
attach(mdome.finish(micro_uv_scale=1.0))
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
    big = w1 > 0.4; cluster = idx in CLUSTER_PARENT; fan = not big and not cluster
    base_w = w1 * (1.0 if big else 1.25); taper_exp = 1.4 if big else 1.15   # big arms: v12's width, a little fuller mid-arc
    if cluster:   # fiddlehead: thick ribbon that only thins inside the roll
        ws = np.array([base_w * (0.55 + 0.45 * (1 - t)) * (1 - 0.55 * max(0.0, (t - 0.75) / 0.25)) + 0.006 for t in arcp])
    elif big:   # v12's arc width; the end roll keeps a thick band that only thins inside the roll (05's biggest curl)
        ws = np.array([base_w * (0.36 + 0.64 * (1 - t) ** taper_exp) * (1 - 0.50 * max(0.0, (t - 0.85) / 0.15)) + 0.006 for t in arcp])
    else:
        ws = np.array([base_w * (0.33 + 0.67 * (1 - t) ** taper_exp) * (1 - 0.62 * max(0.0, (t - 0.80) / 0.20)) + 0.006 for t in arcp])
    ws *= 1 + 0.05 * np.array([noise1(t * 9, idx) for t in arcp])
    ts = ws * (0.30 if cluster else (0.36 if big else 0.45)) + 0.008   # 05's curls are flat dark ribbons, not round tubes
    mb = MeshBuilder("Frond_%02d | ink ribbon with crosier edge" % idx, body, [CURL_MAT if TILES else INK_MAT, BONE_MAT, GLASS_MAT])

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
    # the comb of hooked teeth; on the fan (05, crops/arm-rims.jpg right) a broad, tightly packed pale-bone
    # S-curl zipper about 40% of the tentacle's width, running into the tip curl
    s_acc = 0.0; last = -1.0
    for i in range(3, n - 2):
        s_acc += np.linalg.norm(path[i] - path[i - 1]); w = ws[i]
        edge_dir = unit(B[i] * (np.sign(np.dot(B[i], lateral)) if abs(np.dot(B[i], lateral)) > 1e-6 else 1.0))
        if fan:   # 05's zipper: S-hooks lying ACROSS the inner 40% of the tentacle, packed so they overlap into a
                  # continuous pale-bone chain that runs into the tip curl; low-poly, they are small on screen
            length = min(0.24, max(0.02, 0.58 * w)) * (1 + 0.12 * noise1(i * 0.9, idx))
            if s_acc - last < max(0.02, 0.36 * length):
                continue
            last = s_acc
            d0 = unit(edge_dir * 0.85 + T[i] * 0.45)
            tp = crosier_path(path[i] + edge_dir * (w * 0.06) + Nn[i] * (ts[i] * 0.45), d0, T[i], length, turns=0.75, straight=0.25, n=7, bend_power=1.5)
            tt_ = np.linspace(0, 1, len(tp))
            tw = (0.50 * length) * (1 - tt_) ** 0.7 + 0.004
            tth = np.maximum(0.005, 0.22 * length) * (1 - 0.5 * tt_)
            mb.cur_w = chain_weights(i / (n - 1), stations)
            mb.ribbon(tp, tw, tth, sides=6, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE_ROOT, BONE, 0.4), BONE_EDGE, t1 ** 0.7),
                      hint=nrm, bulge=1.0, mat=1)
            mb.cur_w = None
            continue
        length = min(0.30, max(0.025, (0.55 if big else 0.48) * w)) * (1 + 0.15 * noise1(i * 0.9, idx))
        if s_acc - last < max(0.024, 0.55 * length):
            continue
        last = s_acc
        d0 = unit(edge_dir * 0.75 + T[i] * 0.65)
        tp = crosier_path(path[i] + edge_dir * (w * 0.46), d0, T[i], length, turns=0.72, straight=0.28, bend_power=1.6)
        tt_ = np.linspace(0, 1, len(tp))
        # big arms (05): flame-shaped hooks of pale green glass along the inner edge; elsewhere bone hooks
        tw = ((0.50 if big else 0.34) * length) * (1 - tt_) ** 0.8 + 0.004
        tth = np.maximum(0.005, (0.12 if big else 0.10) * length) * (1 - 0.6 * tt_)
        mb.cur_w = chain_weights(i / (n - 1), stations)
        mb.ribbon(tp, tw, tth, sides=8, color_fn=lambda a1, t1, b1, c1: mix(mix(BONE_ROOT, BONE, 0.4), BONE_EDGE, t1 ** 0.7),
                  hint=nrm, bulge=1.0, mat=2 if big else 1)
        mb.cur_w = None
    # big arms (05, crops/arm-rims.jpg left): a pale translucent ladder along the inner edge, about 30% of the
    # arm's width over the whole arc: a flat bone channel on the convex face, two rails and rungs across it
    if big:
        wfn = lambda i_, t_, st=stations: chain_weights(t_, st)
        band_c = 0.31; band_w = 0.30
        inner_of = lambda i_: unit(B[i_] * (np.sign(np.dot(B[i_], lateral)) if abs(np.dot(B[i_], lateral)) > 1e-6 else 1.0))
        lift = lambda i_: ts[i_] * 0.55 + 0.006
        i_end = int(0.93 * (n - 1))
        chan = np.asarray([path[i] + inner_of(i) * (ws[i] * band_c) + Nn[i] * lift(i) for i in range(i_end)])
        mb.ribbon(chan, ws[:i_end] * band_w, np.full(i_end, 0.010), sides=6, color=mix(BONE, BONE_EDGE, 0.45), hint=nrm, bulge=1.0, mat=2,
                  weights_fn=wfn, edge_sharp=1.0)
        for side_f in (band_c + band_w * 0.5, band_c - band_w * 0.5):
            rail = np.asarray([path[i] + inner_of(i) * (ws[i] * side_f) + Nn[i] * (lift(i) + 0.004) for i in range(i_end)])
            mb.tube(rail, 0.022 * ws[:i_end] + 0.004, sides=6, color=mix(BONE, BONE_EDGE, 0.7), hint=nrm, mat=2, taper_end=True, weights_fn=wfn)
        s_acc = 0.0; last = -1.0
        for i in range(2, i_end):
            s_acc += np.linalg.norm(path[i] - path[i - 1]); w = ws[i]
            if s_acc - last < max(0.03, 0.15 * w):
                continue
            last = s_acc
            a_ = path[i] + inner_of(i) * (w * (band_c + band_w * 0.5)) + Nn[i] * (lift(i) + 0.004)
            b_ = path[i] + inner_of(i) * (w * (band_c - band_w * 0.5)) + Nn[i] * (lift(i) + 0.004)
            mid = (a_ + b_) * 0.5 + Nn[i] * (0.03 * w)
            mb.cur_w = chain_weights(i / (n - 1), stations)
            mb.tube(catmull([a_, mid, b_], 4), 0.032 * w + 0.004, sides=6, flat=0.6, color=mix(BONE_ROOT, BONE_EDGE, 0.6), hint=nrm, mat=2)
            mb.cur_w = None
    # dark crenellated knob row along the outer edge, through the tip spiral
    rim_knobs(mb, path, ws, ts, (T, Nn, B), lateral, lambda t_: chain_weights(t_, stations))
    # curl clusters: one more fiddlehead sprouting from the short straight part of each cluster curl, with its own knob row
    if idx in CLUSTER_PARENT:
        for fr_ in (0.14,):
            k = int(fr_ * (n - 1)); w = ws[k]
            inner = unit(B[k] * (np.sign(np.dot(B[k], lateral)) if abs(np.dot(B[k], lateral)) > 1e-6 else 1.0)); outer = -inner
            d0 = unit(outer * 0.7 + T[k] * 0.7)
            sp = resample(fiddlehead_path(path[k] + outer * (w * 0.45), d0, T[k], 1.0, 1.4, a=0.4), spacing=0.016)
            m_ = len(sp); tt_ = np.linspace(0, 1, m_)
            sw = (w * 0.70) * (1 - 0.6 * tt_) + 0.006; sth = sw * 0.30 + 0.006
            wfix = chain_weights(k / (n - 1), stations)
            fr2, _ = mb.ribbon(sp, sw, sth, sides=10, color_fn=rib_color, hint=nrm, bulge=1.2, mat=0, weights_fn=lambda i2, t2, wf=wfix: wf)
            rim_knobs(mb, sp, sw, sth, fr2, T[k], lambda t_, wf=wfix: wf, start=1)
    fob = attach(mb.finish(micro_uv_scale=2.4)); clean(fob)
print("FRONDS_DONE", round(time.time() - START, 1), flush=True)


# --- face leaf, beads, head/jaw skin
FACE_SCALE = 1.3   # 05: the bud is the head's dominant element


def facepoint(t, u, front=True):
    S = FACE_SCALE
    w = np.interp(t, [0, .20, .50, .80, 1], [.32, .37, .28, .12, .001]) * S
    x = u * w + .018 * (1 - t) ** 2
    y = .63 - 1.16 * S * t - (.12 * u + .08 * abs(u)) * S * (1 - t) ** 2
    bulge = (1 - u * u) ** 0.7
    z = .02 + .09 * t + ((.26 * S * bulge * (1 - .5 * t) - .15 * (1 - abs(u)) * (1 - t) ** 4) if front else -(.06 + .22 * bulge) * S * (1 - t) ** .8)
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


mat = v8.face_material("Rune | face lattice") if TILES else bpy.data.materials.get("Rune | v3 face lattice")
if not mat:
    mat = bpy.data.materials.new("Rune | v3 face lattice"); mat.use_nodes = True
    nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = lattice_image()
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "AuthoredUV"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"]); nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"]); nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Emission Strength"].default_value = 1.1; b.inputs["Roughness"].default_value = 0.5
    mat.blend_method = "BLEND"; mat.use_backface_culling = False
def budpoint(t, alpha):
    """05's lotus bud: a closed almond, broad convex back, sharp point at the lower front. alpha runs around the
    section (0 = back centre = the UV seam, pi = front centre); head-local frame of facepoint."""
    S = FACE_SCALE
    w = np.interp(t, [0, .20, .50, .80, 1], [.32, .37, .28, .12, .001]) * S
    zf = .26 * S * (1 - .5 * t); zb = .28 * S * (1 - t) ** .8
    sn, c = math.sin(alpha), math.cos(alpha)
    x = w * sn + .018 * (1 - t) ** 2
    y = .63 - 1.16 * S * t - (.12 * sn + .08 * abs(sn)) * S * (1 - t) ** 2
    z = .02 + .09 * t - c * (zf if c < 0 else zb) * abs(c) ** 0.85
    return P((x, y, z))


mface = MeshBuilder("Face | fused glowing lattice leaf", body, [mat]); mface.cur_w = [("HeadPivot", 1.0)]
B_ROWS, B_COLS = 48, 64
bud_idx = []
for i in range(B_ROWS + 1):
    t = 0.02 + 0.975 * i / B_ROWS; ring = []
    for j in range(B_COLS + 1):
        alpha = j / B_COLS * math.tau
        ring.append(mface.add_vertex(Pinv(OLD_H @ budpoint(t, alpha)), (1.0, 1.0, 1.0) if TILES else (0.4, 0.9, 0.5), uv=(j / B_COLS, t)))
    bud_idx.append(ring)
for i in range(B_ROWS):
    for j in range(B_COLS):
        mface.add_face((bud_idx[i][j], bud_idx[i + 1][j], bud_idx[i + 1][j + 1], bud_idx[i][j + 1]), 0)
face = mface.finish(micro_uv_scale=1.0)
attach(face)
HORNS = [([(-.20, .29, .02), (-.43, .39, .02), (-.68, .64, -.04), (-.76, .96, -.10)], .080),
         ([(.21, .25, .025), (.44, .44, .01), (.49, .77, -.06), (.39, 1.06, -.14)], .088),
         ([(-.12, .025, .035), (-.32, .015, .045), (-.52, .00, .03), (-.84, .18, -.04), (-1.04, .39, -.11)], .095),
         ([(.12, .045, .035), (.32, .05, .045), (.57, .10, .025), (.93, .41, -.04), (1.04, .72, -.11)], .098)]
# (v18: the pearl bead chains are gone; the face crown horns stand where the tendrils were)
mhook = MeshBuilder("FacePetals | face crown horns", body, [HORN_MAT]); mhook.cur_w = [("HeadPivot", 1.0)]
# 05 front: two long horns sweep up-left and up-right beside the bud, two go left / lower-left, shorter ones to the right;
# each thick at the base, tapering, strongly curved, the tip curling outward into a small hook. Head-local frame of facepoint
# (x across, +y toward the base, -y toward the tip, +z front); lengths 0.6-1.0x the bud (1.5).
CROWN = [([(-.22, .40, -.05), (-.50, .62, -.07), (-.80, .95, -.13), (-.98, 1.30, -.22)], .110, -1),
         ([(.20, .38, -.04), (.48, .60, -.06), (.62, .95, -.13), (.58, 1.30, -.22)], .110, +1),
         ([(-.26, .20, -.03), (-.60, .22, -.01), (-.95, .32, -.07), (-1.25, .50, -.15)], .100, -1),
         ([(-.24, .02, -.01), (-.55, -.08, .02), (-.90, -.10, -.03), (-1.15, .05, -.11)], .090, -1),
         ([(.25, .18, -.03), (.55, .22, -.01), (.85, .38, -.07), (1.00, .62, -.13)], .090, +1),
         ([(.24, .00, -.01), (.52, -.06, .01), (.78, -.02, -.03), (.92, .14, -.09)], .080, +1),
         ([(-.12, .52, -.07), (-.30, .80, -.11), (-.42, 1.05, -.17)], .080, -1),
         ([(.10, .52, -.07), (.28, .82, -.11), (.36, 1.05, -.17)], .080, +1)]
HORN_KNOB = (0.0037, 0.0070, 0.0050)
_bm = bmesh.new(); bmesh.ops.create_icosphere(_bm, subdivisions=1, radius=1.0)
SPH = [(vv.co.x, vv.co.y, vv.co.z) for vv in _bm.verts]; SPHF = [tuple(vv.index for vv in f.verts) for f in _bm.faces]; _bm.free()
for cs, r0, sg in CROWN:
    base_pts = catmull(cs, 10)
    tang = unit(base_pts[-1] - base_pts[-3])
    away = unit(V((sg, 0.25, 0.0)) - tang * np.dot(V((sg, 0.25, 0.0)), tang))         # outward from the bud
    hook = crosier_path(base_pts[-1], tang, away, 0.16, turns=0.6, straight=0.2, bend_power=1.6)
    local = resample(np.concatenate([base_pts[:-1], hook], axis=0), spacing=0.02)
    pts = np.asarray([Pinv(OLD_H @ P(tuple(q))) for q in local]); n = len(pts); tt = np.linspace(0, 1, n)
    radii = r0 * (1 - tt) ** 1.15 + 0.009
    T, Nn, Bb = rmf_frames(pts, hint=(0, 0, 1))
    mhook.tube(pts, radii, sides=10, color=HORN_KNOB, hint=(0, 0, 1), mat=0, taper_end=True)
    # knob row along the OUTER convex edge (the side away from the bud), shrinking toward the tip
    out_local = V((sg, 0.0, 0.0))
    acc = 0.0; last = -1.0
    for i in range(2, n - 2):
        acc += np.linalg.norm(pts[i] - pts[i - 1])
        if acc - last < 0.032 + 0.02 * (1 - tt[i]):
            continue
        last = acc
        o = Pinv(OLD_H @ P(tuple(local[i] + out_local))) - pts[i]; o = unit(o - T[i] * np.dot(o, T[i]))
        kr = 0.014 + 0.016 * (1 - tt[i])   # v19: round beads, a little bigger, so the dotted edge reads at page scale
        sv_ = len(mhook.v); c_ = pts[i] + o * (radii[i] * 0.95)
        for (x_, y_, z_) in SPH:
            mhook.add_vertex(c_ + V((x_, y_, z_)) * kr, HORN_KNOB)
        for f_ in SPHF:
            mhook.add_face(tuple(sv_ + k_ for k_ in f_), 0)
attach(mhook.finish(micro_uv_scale=1.0))
# head colours + skin; jaw and oral membrane ride the jaw bone
g_, gn_ = (lambda me: (np.array([tuple(v.co) for v in me.vertices]), np.array([tuple(v.normal) for v in me.vertices])))(headmesh.data)
front = np.clip(-gn_[:, 1], 0, 1)
cols_ = np.array([mix((0.012, 0.058, 0.026), (0.05, 0.13, 0.07), float(f) ** 1.5 * 0.5) for f in front])   # anime: flat deep emerald, soft front lift
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
