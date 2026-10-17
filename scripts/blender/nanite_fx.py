# The Rexonance nanite effects (owner, 2026-10-16: 「超大幅な改善で。」), for
# public/rexonance-nanites-20261016/fx.webp. Blender 4.5/5.2: Cycles on the GPU
# (the scan plane in Eevee).
#
#   Blender -b --factory-startup -P scripts/blender/nanite_fx.py -- <out dir>
# NANITE_CPU=1 uses Cycles CPU when Metal is unavailable; hardware-only
# rendering (NANITE_HARDWARE_ONLY=1) keeps all twelve original clamp/latch poses.
#
# Writes PNGs at 4x their sheet size (the build script downsamples them with
# lanczos3):
#   clamp-<tl|tr|bl|br>-<f>.png  f 00-11, 192 px: the gold-chrome corner clamp
#   latch-<f>.png                f 00-11, 192 px: the hardpoint latch
#   scan.png                     512 x 128: the perspective scan plane (Eevee)
#   drop-<e>-<a>.png             96 px: molten droplets, elongation e, angle a
#   shock-<k>.png                768 x 288: the shock ring, k 0-9
import math
import os
import random
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Quaternion, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)

ICE = (0.47, 0.91, 1.0)


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return tuple(f(v) for v in c)


def scene(width, height, engine="CYCLES", samples=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    if engine == "CYCLES":
        sc.render.engine = "CYCLES"
        if os.environ.get("NANITE_CPU") == "1":
            sc.cycles.device = "CPU"
        else:
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
    else:
        sc.render.engine = "BLENDER_EEVEE"
        sc.eevee.taa_render_samples = samples
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


def ortho_camera(sc, scale, location=(0, 0, 10), rotation=(0, 0, 0)):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.clip_end = 100
    obj = bpy.data.objects.new("camera", data)
    obj.location = location
    obj.rotation_euler = rotation
    sc.collection.objects.link(obj)
    sc.camera = obj
    return obj


def principled(name, base, metallic, roughness, emission=None, strength=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def machined(mat, strength=0.2):
    """A faint machined micro-texture (noise bump) on a metal: a flat gold
    face seen straight on would mirror only the dark world; the texture lets
    it catch RIG-A's key and rim as it would on a real part."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 30
    noise.inputs["Detail"].default_value = 4
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.05
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], nodes["Principled BSDF"].inputs["Normal"])
    return mat


def emitter(name, colour, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    emission.inputs["Strength"].default_value = strength
    mat.node_tree.links.new(emission.outputs[0], out.inputs["Surface"])
    return mat


def set_strength(mat, strength):
    mat.node_tree.nodes["Emission"].inputs["Strength"].default_value = strength


def box(name, size, location, mat, bevel=None, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("bevel", "BEVEL")
        modifier.width, modifier.segments = bevel
        modifier.limit_method = "ANGLE"
        modifier.harden_normals = True
        for poly in obj.data.polygons:
            poly.use_smooth = True
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def render(sc, name):
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def ease_out(u):
    return 1 - (1 - u) ** 3


# --- Clamps ---------------------------------------------------------------------------
# An L of two bevelled bars 1.0 x 0.22 x 0.14 whose inner corner sits on the
# gold box's corner (the clamp's origin), the bars outside the box along its
# edges; a bolt (r 0.09) on the corner with an ice LED; an ice groove (0.6)
# along each arm. Built for the top-left corner, then turned 0, -90, 90 and
# 180° about the view axis (never mirrored: the light stays the same). 20 px
# per unit at 48 px, so the camera puts the origin on the anchor pixel.
CLAMP_PX = 20
CLAMP_CELL = 48
CORNERS = {"tl": (0, (12, 12)), "tr": (-90, (36, 12)), "bl": (90, (12, 36)), "br": (180, (36, 36))}


def clamps():
    sc = scene(CLAMP_CELL * 4, CLAMP_CELL * 4)
    rig_a(sc, key_gain=1.5)
    camera = ortho_camera(sc, CLAMP_CELL / CLAMP_PX)
    gold = machined(principled("gold-chrome", (1, 0.76, 0.35), 1.0, 0.22, coat=0.2))
    dark = principled("bolt", (0.16, 0.18, 0.21), 1.0, 0.3)
    groove = emitter("groove", ICE, 0.6)
    led = emitter("led", ICE, 0.6)
    corner = bpy.data.objects.new("corner", None)
    sc.collection.objects.link(corner)
    clamp = bpy.data.objects.new("clamp", None)
    sc.collection.objects.link(clamp)
    clamp.parent = corner
    box("bar-h", (1.0, 0.22, 0.14), (0.28, 0.11, 0), gold, (0.035, 4), clamp)
    box("bar-v", (0.22, 1.0, 0.14), (-0.11, -0.28, 0), gold, (0.035, 4), clamp)
    # Recessed steel channels and a raised hexagonal bolt head make the
    # metallic shoulders and LED inlays read as machined parts, not lines.
    box("channel-h", (0.68, 0.065, 0.018), (0.36, 0.11, 0.07), dark, (0.008, 2), clamp)
    box("channel-v", (0.065, 0.68, 0.018), (-0.11, -0.36, 0.07), dark, (0.008, 2), clamp)
    box("groove-h", (0.62, 0.035, 0.012), (0.36, 0.11, 0.081), groove, None, clamp)
    box("groove-v", (0.035, 0.62, 0.012), (-0.11, -0.36, 0.081), groove, None, clamp)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.10, depth=0.07, location=(-0.11, 0.11, 0.09))
    bolt = bpy.context.active_object
    bolt.data.materials.append(dark)
    bolt.parent = clamp
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.05, depth=0.01, location=(-0.11, 0.11, 0.125))
    lamp = bpy.context.active_object
    lamp.data.materials.append(led)
    lamp.parent = clamp
    out = Vector((-1, 1, 0)).normalized()
    for name, (angle, (ax, ay)) in CORNERS.items():
        corner.rotation_euler = (0, 0, math.radians(angle))
        # The anchor pixel is the origin: the cell's centre is (24, 24).
        camera.location = ((CLAMP_CELL / 2 - ax) / CLAMP_PX, -(CLAMP_CELL / 2 - ay) / CLAMP_PX, 10)
        for f in range(12):
            if f < 8:
                e = ease_out(f / 7)
                clamp.location = out * (0.5 * (1 - e))
                clamp.rotation_euler = Euler((math.radians(35 * (1 - e)), 0, math.radians(75 * (1 - e))), "XYZ")
                clamp.scale = (1.45 - 0.45 * e,) * 3
                set_strength(led, 0.6)
            else:
                v = (f - 7) / 4
                clamp.location = Vector((0.06 * v, -0.06 * v, 0))
                clamp.rotation_euler = (0, 0, 0)
                clamp.scale = (1, 1, 1)
                set_strength(led, 0.6 + 2.4 * v)
            render(sc, f"clamp-{name}-{f:02d}")
    print("NANITE rendered clamps", flush=True)


# --- Latch ----------------------------------------------------------------------------
# The hardpoint: a gunmetal torus (R 0.78, r 0.07), an ice ring (R 0.62,
# r 0.025), six gold claw cones (r 0.16, depth 0.5) pointing in. Idle 0-5:
# the iris turns 0 → 50° (frame 6 would be 60°, the same as 0); bite 6-11: the
# claws close 0.95 → 0.40 (u²) as the ice ring brightens 1 → 3.
def latch():
    sc = scene(192, 192)
    rig_a(sc)
    ortho_camera(sc, 2.6)
    gunmetal = principled("gunmetal", (0.16, 0.18, 0.21), 1.0, 0.3)
    gold = machined(principled("gold-chrome", (1, 0.76, 0.35), 1.0, 0.22, coat=0.2))
    ring = emitter("ice-ring", ICE, 1.0)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.78, minor_radius=0.07, major_segments=96, minor_segments=16)
    outer = bpy.context.active_object
    outer.data.materials.append(gunmetal)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.025, major_segments=96, minor_segments=8)
    inner = bpy.context.active_object
    inner.data.materials.append(ring)
    for obj in (outer, inner):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    # Six raised fasteners and their inset LED faces remain anchored while
    # the iris closes; the original twelve poses and pivots stay unchanged.
    for k in range(6):
        a = k * math.pi / 3
        xy = (math.cos(a) * 0.78, math.sin(a) * 0.78)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.085, depth=0.09, location=(*xy, 0.06))
        bpy.context.active_object.data.materials.append(gold)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.03, depth=0.012, location=(*xy, 0.11))
        bpy.context.active_object.data.materials.append(ring)
    claws = []
    for k in range(6):
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.16, radius2=0.0, depth=0.5)
        cone = bpy.context.active_object
        for poly in cone.data.polygons:
            poly.use_smooth = True
        cone.data.materials.append(gold)
        cone.rotation_mode = "QUATERNION"
        claws.append(cone)
    for f in range(12):
        if f < 6:
            turn = math.radians(10 * f)
            radius = 0.95
            set_strength(ring, 1.0)
        else:
            u = (f - 6) / 5
            turn = 0.0
            radius = 0.95 - 0.55 * u * u
            set_strength(ring, 1 + 2 * u)
        for k, cone in enumerate(claws):
            a = turn + k * math.pi / 3
            inward = Vector((-math.cos(a), -math.sin(a), 0))
            cone.location = (math.cos(a) * radius, math.sin(a) * radius, 0.12)
            cone.rotation_quaternion = inward.to_track_quat("Z", "Y")
        render(sc, f"latch-{f:02d}")
    print("NANITE rendered latch", flush=True)


# --- Scan plane (Eevee) ------------------------------------------------------------------
# A 4 x 1 plane receding from the camera (35 mm, tilted 68°): ice grid lines
# (fract(uv (16, 4)) < 0.04) at 2 over a 0.25 ice base whose alpha falls to 0
# at the far edge, and a bright leading edge at 4 on the sheet's row 32.
def scan():
    width, height = 512, 128
    sc = scene(width, height, "BLENDER_EEVEE", 64)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.5, 0))
    plane = bpy.context.active_object
    plane.scale = (4, 1, 1)
    mat = bpy.data.materials.new("scan")
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    uv = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], split.inputs[0])

    def math_node(op, a, b=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = op
        for index, value in enumerate((a, b)):
            if value is None:
                continue
            if isinstance(value, (int, float)):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    u, v = split.outputs["X"], split.outputs["Y"]
    line_u = math_node("LESS_THAN", math_node("FRACT", math_node("MULTIPLY", u, 16.0)), 0.04)
    line_v = math_node("LESS_THAN", math_node("FRACT", math_node("MULTIPLY", v, 4.0)), 0.04)
    line = math_node("MAXIMUM", line_u, line_v)
    edge = math_node("LESS_THAN", v, 0.035)
    fade = math_node("SUBTRACT", 1.0, v)
    # strength: 0.25 base, 2 on the lines, 4 on the leading edge
    strength = math_node("ADD", 0.25, math_node("ADD", math_node("MULTIPLY", line, 1.75), math_node("MULTIPLY", edge, 3.75)))
    # alpha: the base 0.45 falling to 0 at the far edge; lines 0.9 likewise; the edge 1
    alpha = math_node("MAXIMUM", math_node("MULTIPLY", fade, math_node("ADD", 0.45, math_node("MULTIPLY", line, 0.45))), edge)
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (0.55, 0.93, 1.0, 1)
    links.new(strength, emission.inputs["Strength"])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(alpha, mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    plane.data.materials.append(mat)
    data = bpy.data.cameras.new("camera")
    data.lens = 35
    data.sensor_fit = "HORIZONTAL"
    data.clip_end = 100
    cam = bpy.data.objects.new("camera", data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.rotation_euler = (math.radians(68), 0, 0)
    look = Vector((0, math.sin(math.radians(68)), -math.cos(math.radians(68))))
    # The near edge spans 98% of the width.
    half = math.tan(math.atan(18 / 35))
    distance = 4 / (0.98 * 2 * half)
    cam.location = -look * distance
    bpy.context.view_layer.update()
    # Centre the bright leading band (v 0 → 0.035) on the sheet's row 32 of
    # 64: render rows 64-65 of 128 (camera view y is up).
    target = 1 - 65 / height
    for _ in range(4):
        bpy.context.view_layer.update()
        projected = world_to_camera_view(sc, cam, Vector((0, 0.0175, 0)))
        data.shift_y += (projected.y - target) * (height / width)
    render(sc, "scan")
    print("NANITE rendered scan", flush=True)


# --- Drops ------------------------------------------------------------------------------
# A UV sphere r 0.42 scaled (e, 1/√e, 1/√e), its long axis a · 22.5° clockwise
# from +x on screen; molten gold sRGB (255, 176, 60), metallic 1, roughness
# 0.14, emission (255, 214, 120) at 0.9. 96 px for the 24 px cell.
def drops():
    sc = scene(96, 96)
    rig_a(sc)
    ortho_camera(sc, 2.7)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42, segments=48, ring_count=24)
    drop = bpy.context.active_object
    for poly in drop.data.polygons:
        poly.use_smooth = True
    drop.data.materials.append(principled("molten", srgb((255, 176, 60)), 1.0, 0.14, srgb((255, 214, 120)), 0.9))
    for index, e in enumerate((1.6, 2.3, 3.0)):
        drop.scale = (e, 1 / math.sqrt(e), 1 / math.sqrt(e))
        for a in range(8):
            drop.rotation_euler = (0, 0, -math.radians(22.5 * a))
            render(sc, f"drop-{index}-{a}")
    print("NANITE rendered drops", flush=True)


# --- Shock ring --------------------------------------------------------------------------
# A torus of light (R 1, r 0.04) in the ground plane, seen 22° from above
# (orthographic), expanding 0.25 + 1.55e (e = 1 - (1 - u)²), its height
# 1 + 4(1 - u), its light 14(1 - u)^1.5 × facing², mixed with a transparent
# BSDF so it fades to alpha (never to black); 28 shard cubes of 0.05 flung
# out at 18(1 - u). u = (k + 0.5) / 10.
def light_fading_to_alpha(name, colour, facing):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.name = "Emission"
    emission.inputs["Color"].default_value = (*colour, 1)
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    # The cover: facing² (or 1 for the shards), times min(1, strength / 4).
    gain = nodes.new("ShaderNodeValue")
    gain.name = "Gain"
    cover = nodes.new("ShaderNodeMath")
    cover.operation = "MULTIPLY"
    links.new(gain.outputs[0], cover.inputs[0])
    if facing:
        weight = nodes.new("ShaderNodeLayerWeight")
        weight.inputs["Blend"].default_value = 0.5
        square = nodes.new("ShaderNodeMath")
        square.operation = "POWER"
        square.inputs[1].default_value = 2.0
        links.new(weight.outputs["Facing"], square.inputs[0])
        links.new(square.outputs[0], cover.inputs[1])
        light = nodes.new("ShaderNodeMath")
        light.operation = "MULTIPLY"
        light.name = "Light"
        links.new(square.outputs[0], light.inputs[0])
        links.new(light.outputs[0], emission.inputs["Strength"])
    else:
        cover.inputs[1].default_value = 1.0
    links.new(cover.outputs[0], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def set_light(mat, strength):
    mat.node_tree.nodes["Gain"].outputs[0].default_value = min(1.0, strength / 4)
    if "Light" in mat.node_tree.nodes:
        mat.node_tree.nodes["Light"].inputs[1].default_value = strength
    else:
        mat.node_tree.nodes["Emission"].inputs["Strength"].default_value = strength


def shock():
    sc = scene(768, 288)
    rig_a(sc)
    tilt = math.radians(68)
    look = Vector((0, math.sin(tilt), -math.cos(tilt)))
    ortho_camera(sc, 4.0, tuple(-look * 10), (tilt, 0, 0))
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.04, major_segments=160, minor_segments=16)
    ring = bpy.context.active_object
    for poly in ring.data.polygons:
        poly.use_smooth = True
    ring_light = light_fading_to_alpha("ring", (0.85, 0.97, 1.0), True)
    ring.data.materials.append(ring_light)
    shard_light = light_fading_to_alpha("shard", (1.0, 0.95, 0.85), False)
    rng = random.Random(7)
    shards = []
    for _ in range(28):
        bpy.ops.mesh.primitive_cube_add(size=0.05)
        cube = bpy.context.active_object
        cube.data.materials.append(shard_light)
        shards.append((cube, rng.uniform(0, 2 * math.pi), rng.uniform(0.7, 1.0), rng.uniform(0.2, 1.0), rng.uniform(0, math.pi)))
    for k in range(10):
        u = (k + 0.5) / 10
        e = 1 - (1 - u) ** 2
        radius = 0.25 + 1.55 * e
        ring.scale = (radius, radius, 1 + 4 * (1 - u))
        set_light(ring_light, 14 * (1 - u) ** 1.5)
        set_light(shard_light, 18 * (1 - u))
        for cube, angle, speed, lift, spin in shards:
            # Flung out within the frame (r ≤ 1.6, a low arc).
            r = 0.15 + speed * 1.45 * e
            cube.location = (math.cos(angle) * r, math.sin(angle) * r, lift * 0.14 * math.sin(math.pi * u))
            cube.rotation_euler = (spin + 7 * u, 5 * u, angle)
            cube.scale = (1 - 0.6 * u,) * 3
        render(sc, f"shock-{k}")
    print("NANITE rendered shock", flush=True)


clamps()
latch()
if not os.environ.get("NANITE_HARDWARE_ONLY"):
    scan()
    drops()
    shock()
print("NANITE-DONE", flush=True)
