# The gold guideway conduit (owner, 2026-10-16: 「金のガイドラインもより立体的に
# 未来的に。」 and 「超大幅な改善で。」), for public/rexonance-nanites-20261016/
# guide.webp. Blender 5.2, Cycles on the GPU.
#
#   Blender -b --factory-startup -P scripts/blender/nanite_guide.py -- <prep.json> <out.png>
#
# prep.json (scripts/build-rexonance-nanites.mjs): per plate, its trims'
# contours (gold.webp's alpha > 96 in its atlas cell, upsampled x2,
# marching squares, Douglas–Peucker 0.5) and their skeleton (Zhang–Suen),
# in atlas px at 2x (y down). Rendered orthographically top-down at
# 2048 x 2976, 1 unit = 1 px, film transparent, Standard view, 64 spp, OIDN:
#   rails    every contour as a curve, bevel 1.6 x 3: gold Principled sRGB
#            (242, 200, 120), metallic 1, roughness 0.22, coat 1 / 0.05
#   glass    the filled contours at z -0.8: ice (0.55, 0.85, 1.0), alpha
#            0.28, ice emission 0.6
#   channel  the skeleton, bevel 0.5, at z +0.2: emission sRGB (200, 245, 255)
#            at 3
# Lit by RIG-A scaled to the atlas (key upper-left, ice rim lower-right).
# The build script downsamples x2 (lanczos3) and clips it to each plate's
# gold (alpha 0 where gold.webp's alpha <= 32, dilated by 2 px).
import json
import math
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
PREP, OUT = ARGS[0], ARGS[1]
with open(PREP) as handle:
    prep = json.load(handle)
W, H = prep["width"], prep["height"]


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return tuple(f(v) for v in c)


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == "METAL"
sc.cycles.device = "GPU"
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.cycles.denoiser = "OPENIMAGEDENOISE"
sc.cycles.seed = 16
sc.render.resolution_x = W
sc.render.resolution_y = H
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
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.07, 0.10, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

# The camera: 1 unit = 1 px of the 2x atlas; image (x, y) is world (x, H - y).
camera_data = bpy.data.cameras.new("camera")
camera_data.type = "ORTHO"
camera_data.sensor_fit = "VERTICAL"
camera_data.ortho_scale = H
camera_data.clip_start = 1
camera_data.clip_end = 400
camera = bpy.data.objects.new("camera", camera_data)
camera.location = (W / 2, H / 2, 200)
sc.collection.objects.link(camera)
sc.camera = camera

# RIG-A, scaled about the atlas's centre so every plate sees the same light
# directions (S units per RIG-A unit; power x S² keeps its irradiance).
S = 1500
centre = Vector((W / 2, H / 2, 0))
for name, location, power, size, colour in (
    ("key", (-4.5, 4.5, 7), 700, 5, (1, 0.94, 0.85)),
    ("rim", (6, -1, 2), 380, 2.5, (0.55, 0.9, 1)),
    ("under", (-1.2, -6.5, 1.5), 180, 3, (1, 0.7, 0.9)),
):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = power * S * S
    light.size = size * S
    light.color = colour
    obj = bpy.data.objects.new(name, light)
    obj.location = centre + Vector(location) * S
    obj.rotation_euler = (centre - obj.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(obj)


def curve(name, loops, cyclic, dimensions, bevel, z):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = dimensions
    if dimensions == "3D":
        data.fill_mode = "FULL"
        data.twist_mode = "Z_UP"
    else:
        data.fill_mode = "BOTH"
    data.bevel_depth = bevel
    data.bevel_resolution = 3
    data.resolution_u = 1
    for points in loops:
        spline = data.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, (x, y) in zip(spline.points, points):
            point.co = (x, H - y, 0, 1)
        spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    obj.location.z = z
    sc.collection.objects.link(obj)
    return obj


contours = [loop for piece in prep["pieces"] for loop in piece["contours"]]
skeleton = [path for piece in prep["pieces"] for path in piece["skeleton"]]
rails = curve("rails", contours, True, "3D", 1.6, 0.0)
glass = curve("glass", contours, True, "2D", 0.0, -0.8)
channel = curve("channel", skeleton, False, "3D", 0.5, 0.2)

gold = bpy.data.materials.new("rail")
gold.use_nodes = True
bsdf = gold.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (*srgb((242, 200, 120)), 1)
bsdf.inputs["Metallic"].default_value = 1.0
bsdf.inputs["Roughness"].default_value = 0.22
bsdf.inputs["Coat Weight"].default_value = 1.0
bsdf.inputs["Coat Roughness"].default_value = 0.05
rails.data.materials.append(gold)

ice = bpy.data.materials.new("glass")
ice.use_nodes = True
bsdf = ice.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.55, 0.85, 1.0, 1)
bsdf.inputs["Roughness"].default_value = 0.1
bsdf.inputs["Alpha"].default_value = 0.28
bsdf.inputs["Emission Color"].default_value = (0.55, 0.85, 1.0, 1)
bsdf.inputs["Emission Strength"].default_value = 0.6
glass.data.materials.append(ice)

glow = bpy.data.materials.new("channel")
glow.use_nodes = True
nodes = glow.node_tree.nodes
nodes.clear()
emission = nodes.new("ShaderNodeEmission")
emission.inputs["Color"].default_value = (*srgb((200, 245, 255)), 1)
emission.inputs["Strength"].default_value = 3.0
output = nodes.new("ShaderNodeOutputMaterial")
glow.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
channel.data.materials.append(glow)

print("NANITE guide", len(contours), "contours,", len(skeleton), "channel paths", flush=True)
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("NANITE-DONE", flush=True)
