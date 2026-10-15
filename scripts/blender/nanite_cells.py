# The Rexonance nanite chip (owner, 2026-10-16: 「超大幅な改善で。」), for
# public/rexonance-nanites-20261016/cells.webp. Blender 5.2, Cycles on the GPU.
#
#   Blender -b --factory-startup -P scripts/blender/nanite_cells.py -- <out dir> [px=128]
#
# Writes 128 px PNGs (scripts/build-rexonance-nanites.mjs downsamples them
# with lanczos3 to the 32 px cells and 16 px mips):
#   tumble-<tone>-<f>.png  f 00-23: R_f = quaternion(normalize(0.45, 0.8, 0.4), 2πf/24)
#   unfold-<tone>-<k>.png  k 1-6 (k0 is tumble f0): the hex prism → a square slab
#   bead-<k>.png           k 0-7: the molten gold bead's wobble
# The chip: a hex prism r 1.0, depth 0.34, its top inset 0.30 then 0.06 at
# -0.08 (a recess), bevelled 0.07 x 3; an emissive hex core r 0.42 at z 0.12
# (7 at its white-hot centre, 15% over the rest of the lens, so the tone
# survives the Standard view's clip), an emissive corner pin r 0.10 at (0.78, 0, 0.17) so a tumble
# reads, and on its back a dark anodised plate with an emissive hex seam
# (0.8). Lit by RIG-A.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Quaternion, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
PX = int(ARGS[1]) if len(ARGS) > 1 else 128
os.makedirs(OUT, exist_ok=True)

ORTHO = 2.08  # the 32 px cell: the hex (2.0 vertex to vertex) and the 1.92 slab fit
TONES = {
    # body base colour (linear), roughness, core emission colour (linear)
    "ice": ((0.16, 0.18, 0.21), 0.30, (0.47, 0.91, 1.0)),
    "pink": ((0.18, 0.15, 0.19), 0.30, (1.0, 0.56, 0.85)),
    "white": ((0.22, 0.23, 0.26), 0.30, (0.96, 0.98, 1.0)),
    "gold": ((1.0, 0.70, 0.30), 0.22, (1.0, 0.95, 0.80)),
}
AXIS = Vector((0.45, 0.8, 0.4)).normalized()


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return tuple(f(v) for v in c)


def scene(width, height, samples=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.seed = 16
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    world = bpy.data.worlds.new("world")
    sc.world = world
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (0.05, 0.07, 0.10, 1)
    background.inputs[1].default_value = 1.0
    return sc


def rig_a(sc, key_gain=1.0):
    """RIG-A: area lights aimed at the origin; key upper-left, ice rim lower-right."""
    for name, location, power, size, colour in (
        ("key", (-4.5, 4.5, 7), 700 * key_gain, 5, (1, 0.94, 0.85)),
        ("rim", (6, -1, 2), 380, 2.5, (0.55, 0.9, 1)),
        ("under", (-1.2, -6.5, 1.5), 180, 3, (1, 0.7, 0.9)),
    ):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = power
        light.size = size
        light.color = colour
        obj = bpy.data.objects.new(name, light)
        obj.location = Vector(location)
        obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(obj)


def camera(sc, scale):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    obj = bpy.data.objects.new("camera", data)
    obj.location = (0, 0, 10)
    sc.collection.objects.link(obj)
    sc.camera = obj


def principled(name, base, metallic, roughness, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def emitter(name, colour, strength, radius=None):
    """Pure emission. With `radius`, `strength` is the core's peak: a
    white-hot die at its centre falling (smoothstep) to 15% of the peak by
    `radius` (object space), so the lens around the die keeps its tone
    instead of clipping to white in the Standard view."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    emission.inputs["Strength"].default_value = strength
    if radius:
        coords = nodes.new("ShaderNodeTexCoord")
        separate = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coords.outputs["Object"], separate.inputs[0])
        combine = nodes.new("ShaderNodeCombineXYZ")
        links.new(separate.outputs["X"], combine.inputs["X"])
        links.new(separate.outputs["Y"], combine.inputs["Y"])
        length = nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        links.new(combine.outputs[0], length.inputs[0])
        falloff = nodes.new("ShaderNodeMapRange")
        falloff.inputs["From Min"].default_value = 0.0
        falloff.inputs["From Max"].default_value = radius * 0.4
        falloff.inputs["To Min"].default_value = strength
        falloff.inputs["To Max"].default_value = strength * 0.15
        falloff.interpolation_type = "SMOOTHSTEP"
        links.new(length.outputs["Value"], falloff.inputs["Value"])
        links.new(falloff.outputs["Result"], emission.inputs["Strength"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    return mat


def hex_prism(bm, radius, depth, split=1):
    """A hex prism with a vertex on +x, each side split into `split` collinear
    segments; returns (top face, bottom face)."""
    ring = []
    for k in range(6):
        a = (radius * math.cos(k * math.pi / 3), radius * math.sin(k * math.pi / 3))
        b = (radius * math.cos((k + 1) * math.pi / 3), radius * math.sin((k + 1) * math.pi / 3))
        for j in range(split):
            t = j / split
            ring.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    top = [bm.verts.new((x, y, depth / 2)) for x, y in ring]
    bottom = [bm.verts.new((v.co.x, v.co.y, -depth / 2)) for v in top]
    top_face = bm.faces.new(top)
    bottom_face = bm.faces.new(list(reversed(bottom)))
    for k in range(len(ring)):
        j = (k + 1) % len(ring)
        bm.faces.new((bottom[k], bottom[j], top[j], top[k]))
    bm.normal_update()
    return top_face, bottom_face


def hex_to_square(x, y, half):
    """The point of a regular hex (vertex on +x) at the same relative radius
    and perimeter fraction on a square of half-extent `half` (its right edge's
    midpoint on +x): similar hex rings become similar square rings, and the
    hex's perimeter eighths (vertices of the 4-way split sides) its corners."""
    rho = math.hypot(x, y)
    if rho < 1e-9:
        return x, y
    phi = math.atan2(y, x) % (2 * math.pi)
    k = min(5, int(phi // (math.pi / 3)))
    a = Vector((math.cos(k * math.pi / 3), math.sin(k * math.pi / 3)))
    b = Vector((math.cos((k + 1) * math.pi / 3), math.sin((k + 1) * math.pi / 3)))
    d = Vector((math.cos(phi), math.sin(phi)))
    # The ray from the centre meets the unit hex's side a-b at a + t(b - a).
    e = b - a
    t = (d.x * a.y - d.y * a.x) / (d.y * e.x - d.x * e.y) if abs(d.y * e.x - d.x * e.y) > 1e-12 else 0.0
    hit = a + e * t
    scale = rho / hit.length
    s = ((k + t) / 6) % 1.0
    # Around the square from (half, 0), counter-clockwise; perimeter 8 half.
    u = s * 8
    if u < 1:
        q = (1, u)
    elif u < 3:
        q = (1 - (u - 1), 1)
    elif u < 5:
        q = (-1, 1 - (u - 3))
    elif u < 7:
        q = (-1 + (u - 5), -1)
    else:
        q = (1, -1 + (u - 7))
    return q[0] * half * scale, q[1] * half * scale


def build_chip(sc):
    bm = bmesh.new()
    # Each side split in four, so the unfold can put vertices on the square's corners.
    top, bottom = hex_prism(bm, 1.0, 0.34, split=4)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.30, depth=0.0)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.06, depth=-0.08)
    # The back: a dark plate (slot 2) with a hex seam ring 0.05 wide, 0.22 in
    # from the edge (slot 1).
    rim = bmesh.ops.inset_region(bm, faces=[bottom], thickness=0.22, depth=0.0)["faces"]
    seam = bmesh.ops.inset_region(bm, faces=[bottom], thickness=0.05, depth=0.0)["faces"]
    for face in seam:
        face.material_index = 1
    for face in [*rim, bottom]:
        face.material_index = 2
    mesh = bpy.data.meshes.new("chip")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    body = bpy.data.objects.new("chip", mesh)
    sc.collection.objects.link(body)
    bevel = body.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.07
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.harden_normals = True

    # The unfold: a shape key from the hex prism to a 0.96 x 0.96 x 0.04
    # (half-extent) square slab.
    body.shape_key_add(name="basis")
    slab = body.shape_key_add(name="slab")
    for vertex, point in zip(mesh.vertices, slab.data):
        x, y, z = vertex.co
        x, y = hex_to_square(x, y, 0.96)
        point.co = (x, y, z * (0.04 / 0.17))

    core_mesh = bpy.data.meshes.new("core")
    bm = bmesh.new()
    hex_prism(bm, 0.42, 0.05)
    bm.to_mesh(core_mesh)
    bm.free()
    core = bpy.data.objects.new("core", core_mesh)
    core.location = (0, 0, 0.12)
    sc.collection.objects.link(core)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.10, segments=24, ring_count=12, location=(0.78, 0, 0.17))
    pin = bpy.context.active_object
    for poly in pin.data.polygons:
        poly.use_smooth = True

    root = bpy.data.objects.new("nanite", None)
    sc.collection.objects.link(root)
    for obj in (body, core, pin):
        obj.parent = root
    root.rotation_mode = "QUATERNION"
    return root, body, core, pin


def render(sc, name):
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


sc = scene(PX, PX)
camera(sc, ORTHO)
rig_a(sc)
root, body, core, pin = build_chip(sc)
# Three slots on the body (0 the metal, 1 the back seam, 2 the back plate), one on the core and
# the pin; each tone swaps the slots' materials (clearing the slots would
# reset the faces' material indices).
for obj, slots in ((body, 3), (core, 1), (pin, 1)):
    for _ in range(slots):
        obj.data.materials.append(None)
for tone, (base, roughness, glow) in TONES.items():
    body.data.materials[0] = principled(f"{tone}-body", base, 1.0, roughness)
    body.data.materials[1] = emitter(f"{tone}-seam", glow, 0.8)
    # The back plate: dark anodised gunmetal for every tone, duller, so a
    # chip seen from behind is a dark hex lit by its seam (RIG-A's under
    # light would otherwise mirror off it brighter than the face).
    body.data.materials[2] = principled(f"{tone}-back", (0.10, 0.11, 0.13), 1.0, 0.45)
    core_material = emitter(f"{tone}-core", glow, 7.0, radius=0.42)
    pin_material = emitter(f"{tone}-pin", glow, 7.0)
    core.data.materials[0] = core_material
    pin.data.materials[0] = pin_material
    body.data.shape_keys.key_blocks["slab"].value = 0.0
    core.location.z = 0.12
    pin.location.z = 0.17
    for f in range(24):
        root.rotation_quaternion = Quaternion(AXIS, 2 * math.pi * f / 24)
        render(sc, f"tumble-{tone}-{f:02d}")
    if tone == "gold":
        continue
    # The unfold, face-on: k1-k6 (k0 is tumble f0). The core dims 7 → 1.5.
    root.rotation_quaternion = Quaternion((1, 0, 0, 0))
    for k in range(1, 7):
        s = k / 6
        body.data.shape_keys.key_blocks["slab"].value = s
        core.location.z = 0.12 * (1 - s) + 0.045 * s
        pin.location.z = 0.17 * (1 - s) + 0.05 * s
        pin.scale = (1 - 0.5 * s,) * 3
        strength = 7.0 - 5.5 * s
        nodes = core_material.node_tree.nodes
        ramp = next(n for n in nodes if n.type == "MAP_RANGE")
        ramp.inputs["To Min"].default_value = strength
        ramp.inputs["To Max"].default_value = strength * 0.15
        pin_material.node_tree.nodes["Emission"].inputs["Strength"].default_value = strength
        render(sc, f"unfold-{tone}-{k}")
    pin.scale = (1, 1, 1)
    print("NANITE rendered", tone, flush=True)

# The molten gold bead: a metaball pair, wobbling.
for obj in list(sc.collection.objects):
    if obj.type in {"MESH", "EMPTY"}:
        bpy.data.objects.remove(obj)
ball = bpy.data.metaballs.new("bead")
ball.resolution = 0.02
ball.render_resolution = 0.02
for co, radius in (((-0.20, 0.05, 0), 0.62), ((0.26, -0.06, 0), 0.50)):
    element = ball.elements.new()
    element.co = co
    element.radius = radius
bead = bpy.data.objects.new("bead", ball)
sc.collection.objects.link(bead)
bead.data.materials.append(principled("molten", srgb((255, 176, 60)), 1.0, 0.14, srgb((255, 214, 120)), 0.9))
for k in range(8):
    w = 0.12 * math.sin(2 * math.pi * k / 8)
    bead.scale = (1 + w, 1 - w, 1)
    render(sc, f"bead-{k}")
print("NANITE-DONE", flush=True)
