"""Render Rexonance's forest-green fire as genuinely three-dimensional volumes.

Blender 5.2 LTS, no add-ons or simulation caches required:
  Blender -b --factory-startup -P scripts/blender/rexonance_flame.py -- \
    output/playwright/flame-production --frames 32 --samples 48 --scale 2 --render-loop-check

Each 128 x 256 tile is viewed straight on: origin bottom-centre, up is -Y
in canvas coordinates. The 32 poses describe a seamless two-second cycle.
The closed, bent meshes contain absorbing/emissive heterogeneous volumes;
4D fBm cuts thin turbulent filaments through the flame, not flat glow blobs.
PNG renders and a .blend are intermediate build artefacts, never runtime.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--frames", type=int, default=32)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--count", type=int, default=None)
    parser.add_argument("--render-loop-check", action="store_true")
    return parser.parse_args(argv)


ARGS = arguments()
os.makedirs(ARGS.output, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene
SCENE.render.engine = "CYCLES"
SCENE.cycles.device = "CPU"
SCENE.cycles.samples = ARGS.samples
SCENE.cycles.use_denoising = True
SCENE.cycles.denoiser = "OPENIMAGEDENOISE"
SCENE.cycles.seed = 191019
SCENE.cycles.max_bounces = 4
SCENE.cycles.volume_bounces = 1
SCENE.cycles.volume_step_rate = 0.75
SCENE.render.use_persistent_data = True
SCENE.render.resolution_x = 128 * ARGS.scale
SCENE.render.resolution_y = 256 * ARGS.scale
SCENE.render.resolution_percentage = 100
SCENE.render.film_transparent = True
SCENE.render.image_settings.file_format = "PNG"
SCENE.render.image_settings.color_mode = "RGBA"
SCENE.render.image_settings.color_depth = "8"
SCENE.view_settings.view_transform = "Standard"
SCENE.view_settings.look = "None"
SCENE.view_settings.exposure = -0.2
SCENE.world = bpy.data.worlds.new("transparent night")
SCENE.world.use_nodes = True
SCENE.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0

CAMERA = bpy.data.cameras.new("orthographic flame camera")
CAMERA.type = "ORTHO"
CAMERA.ortho_scale = 4.9
CAMERA_OBJ = bpy.data.objects.new("orthographic flame camera", CAMERA)
SCENE.collection.objects.link(CAMERA_OBJ)
CAMERA_OBJ.location = (0, -9, 2.3)
CAMERA_OBJ.rotation_euler = (Vector((0, 0, 2.3)) - CAMERA_OBJ.location).to_track_quat("-Z", "Y").to_euler()
SCENE.camera = CAMERA_OBJ


def math_node(nodes, links, operation, a, b=None):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate((a, b)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            links.new(value, node.inputs[index])
    return node.outputs[0]


NOISES = []


def volume_material(index):
    hot_core = index >= 5
    material = bpy.data.materials.new(f"forest fire heterogeneous volume {index}")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (0.021, 0.11, 0.035, 1)
    volume.inputs["Anisotropy"].default_value = 0.18
    links.new(volume.outputs[0], output.inputs["Volume"])
    coordinates = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeVectorMath")
    mapping.operation = "MULTIPLY"
    mapping.inputs[1].default_value = (3.8, 3.8, 1.7)
    links.new(coordinates.outputs["Object"], mapping.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 4
    noise.inputs["Roughness"].default_value = 0.72
    noise.inputs["Distortion"].default_value = 0.8
    links.new(mapping.outputs[0], noise.inputs["Vector"])
    NOISES.append((noise, mapping, index))
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates.outputs["Object"], separate.inputs[0])
    # The physical mesh tapers; a softer inner radial field keeps it wispy
    # instead of revealing its boundary. fBm both erodes and heats filaments.
    x = separate.outputs["X"]
    y = separate.outputs["Y"]
    xx = math_node(nodes, links, "MULTIPLY", x, x)
    yy = math_node(nodes, links, "MULTIPLY", y, y)
    radius = math_node(nodes, links, "SQRT", math_node(nodes, links, "ADD", xx, yy))
    edge = math_node(nodes, links, "SUBTRACT", 1.1, radius)
    structure = math_node(nodes, links, "SUBTRACT", noise.outputs["Fac"], 0.49)
    structure = math_node(nodes, links, "MULTIPLY", structure, 15)
    edge = math_node(nodes, links, "MULTIPLY", edge, 4)
    density = math_node(nodes, links, "MULTIPLY", structure, edge)
    density = math_node(nodes, links, "MAXIMUM", density, 0)
    links.new(math_node(nodes, links, "MULTIPLY", density, 1.6 if not hot_core else 3.8), volume.inputs["Density"])
    links.new(math_node(nodes, links, "MULTIPLY", density, 0.60 if not hot_core else 4.0), volume.inputs["Emission Strength"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
    for pos, colour in (
        (0.0, (0.009, 0.08, 0.016, 1)),
        (0.46, (0.018, 0.30, 0.045, 1)),
        (0.56, (0.095, 0.62, 0.16, 1)),
        (0.64, (0.46, 0.91, 0.42, 1)),
        (0.72, (0.89, 1, 0.78, 1)),
    ):
        element = ramp.color_ramp.elements[0] if pos == 0 else ramp.color_ramp.elements.new(pos)
        element.color = colour
    links.new(noise.outputs["Fac"], ramp.inputs[0])
    if hot_core:
        volume.inputs["Emission Color"].default_value = (0.72, 1, 0.56, 1)
    else:
        links.new(ramp.outputs[0], volume.inputs["Emission Color"])
    return material


TONGUES = []


def tongue(index, height, width, offset, phase):
    rings, sides = 42, 14
    vertices, faces = [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        # A real bent, narrowing enclosure. The centreline is rebuilt each
        # frame so rising curls remain coherent between adjacent frames.
        radius = max(0.009, width * (1 - t) ** 0.79)
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append((offset + math.cos(angle) * radius, math.sin(angle) * radius * 0.65, t * height))
    faces.append(tuple(reversed(range(sides))))
    for ring in range(rings - 1):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple((rings - 1) * sides + k for k in range(sides)))
    mesh = bpy.data.meshes.new(f"sealed tapered tongue mesh {index}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"turbulent flame tongue {index}", mesh)
    SCENE.collection.objects.link(obj)
    obj.data.materials.append(volume_material(index))
    TONGUES.append((obj, list(vertices), height, width, offset, phase, rings, sides))


for spec in (
    (0, 4.15, 0.40, -0.05, 0.0),
    (1, 2.75, 0.35, -0.43, 1.1),
    (2, 3.30, 0.29, 0.40, 2.8),
    (3, 2.03, 0.27, -0.68, 3.9),
    (4, 2.43, 0.24, 0.70, 5.0),
    # Independent hot filaments, much narrower than the absorbing envelope.
    # Heating is not tied to opacity: the luminous muscles show through the
    # cooler curls, while empty pockets remain genuinely transparent.
    (5, 3.54, 0.083, -0.08, 0.0),
    (6, 2.48, 0.070, -0.42, 1.1),
    (7, 2.86, 0.058, 0.39, 2.8),
):
    tongue(*spec)


def pose(frame):
    phase = math.tau * frame / ARGS.frames
    for obj, vertices, height, width, offset, initial, rings, sides in TONGUES:
        for ring in range(rings):
            t = ring / (rings - 1)
            curl = math.sin(phase * 2 - t * 8.7 + initial) * (0.10 + 0.24 * t) * t
            broad = math.sin(phase - t * 3.8 + initial) * 0.16 * t
            depth = math.cos(phase * 2 - t * 7.1 + initial) * 0.16 * t
            pulse = 1 + 0.17 * math.sin(phase * 2 - t * 12 + initial) + 0.055 * math.sin(phase * 3 - t * 31 + initial)
            for side in range(sides):
                k = ring * sides + side
                x, y, z = vertices[k]
                obj.data.vertices[k].co = (offset + (x - offset) * pulse + curl + broad, y + depth, z * (1 + 0.035 * math.sin(phase + initial)))
        obj.data.update()
    # Sampling the noise along a closed circle makes frame 31 -> frame 0
    # as continuous as every other pair, unlike an abruptly reset 4D clock.
    for noise, mapping, index in NOISES:
        noise.inputs["W"].default_value = math.sin(phase) * 0.85 + index * 2.1
        mapping.inputs[1].default_value = (3.8, 3.8, 1.7)
        noise.inputs["Distortion"].default_value = 0.75 + 0.20 * math.cos(phase)


count = ARGS.count if ARGS.count is not None else ARGS.frames - ARGS.start
for frame in range(ARGS.start, min(ARGS.frames, ARGS.start + count)):
    pose(frame)
    SCENE.render.filepath = os.path.join(ARGS.output, f"flame-{frame:02d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"REXONANCE_FLAME_FRAME {frame:02d}", flush=True)
pose(0)
first_pose = [tuple(vertex.co) for obj, *_ in TONGUES for vertex in obj.data.vertices]
pose(ARGS.frames)
last_pose = [tuple(vertex.co) for obj, *_ in TONGUES for vertex in obj.data.vertices]
seam_error = max(abs(a - b) for left, right in zip(first_pose, last_pose) for a, b in zip(left, right))
assert seam_error < 0.000001, f"loop geometry seam: {seam_error}"
if ARGS.render_loop_check:
    SCENE.render.filepath = os.path.join(ARGS.output, "loop-check.png")
    bpy.ops.render.render(write_still=True)
pose(0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ARGS.output, "rexonance-forest-fire.blend"))
with open(os.path.join(ARGS.output, "render-provenance.json"), "w", encoding="utf8") as stream:
    json.dump({
        "generator": "scripts/blender/rexonance_flame.py",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode(),
        "renderer": "Cycles CPU",
        "samples": ARGS.samples,
        "renderFrameSize": [128 * ARGS.scale, 256 * ARGS.scale],
        "runtimeFrameSize": [128, 256],
        "frames": ARGS.frames,
        "durationSeconds": 2,
        "loopGeometryMaxDelta": seam_error,
        "loopCheckRendered": ARGS.render_loop_check,
        "loop": "closed-periodic 3D centreline and 4D fBm fields",
        "volumeTongues": len(TONGUES),
        "vertices": sum(len(obj.data.vertices) for obj, *_ in TONGUES),
        "shader": "heterogeneous Principled Volume, fBm density and emission, dark forest-green absorption, pale lime core",
        "camera": "orthographic; transparent world; root bottom-centre; rising upwards",
        "colourManagement": "Standard, exposure -0.2",
    }, stream, indent=2)
