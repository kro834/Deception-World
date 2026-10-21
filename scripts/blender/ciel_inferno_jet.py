"""Ciel's pressure-driven forest-green flame jet, rendered in real 3D.

Blender -b --factory-startup -P scripts/blender/ciel_inferno_jet.py -- \
  output/playwright/ciel-inferno-production --samples 64 --scale 2 --loop-check

32 periodic poses. Runtime tiles 256x128, left anchor [8,64], flow right.
Eight sealed, deformed volume meshes contain multiscale 4D fBm density;
three independently heated filaments carry the white-green pressure core.
This is a procedural volumetric render, not a baked fluid simulation.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("output")
parser.add_argument("--samples", type=int, default=64)
parser.add_argument("--scale", type=int, default=2)
parser.add_argument("--count", type=int, default=32)
parser.add_argument("--loop-check", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
os.makedirs(args.output, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.seed = 191027
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 4
scene.cycles.volume_bounces = 1
scene.cycles.volume_step_rate = 0.75
scene.render.use_persistent_data = True
scene.render.resolution_x = 256 * args.scale
scene.render.resolution_y = 128 * args.scale
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = -0.2
scene.world = bpy.data.worlds.new("Ciel transparent night")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
camera = bpy.data.cameras.new("orthographic directional jet")
camera.type = "ORTHO"
camera.ortho_scale = 4.9
camera_object = bpy.data.objects.new("orthographic directional jet", camera)
camera_object.location = (2.3, -9, 0)
camera_object.rotation_euler = (Vector((2.3, 0, 0)) - camera_object.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(camera_object)
scene.camera = camera_object


def scalar(nodes, links, operation, a, b):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for i, value in enumerate((a, b)):
        if isinstance(value, (int, float)):
            node.inputs[i].default_value = value
        else:
            links.new(value, node.inputs[i])
    return node.outputs[0]


fields = []
meshes = []


def material(index, core):
    mat = bpy.data.materials.new(f"Ciel {'hot filament' if core else 'turbulent envelope'} {index}")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (0.016, 0.105, 0.032, 1)
    volume.inputs["Anisotropy"].default_value = 0.35
    links.new(volume.outputs[0], output.inputs["Volume"])
    coordinates = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeVectorMath")
    mapping.operation = "ADD"
    links.new(coordinates.outputs["Object"], mapping.inputs[0])
    mapping.inputs[1].default_value = (0, 0, 0)
    stretch = nodes.new("ShaderNodeVectorMath")
    stretch.operation = "MULTIPLY"
    stretch.inputs[1].default_value = (0.62, 1.65, 1.65)
    links.new(mapping.outputs[0], stretch.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 3.7
    noise.inputs["Detail"].default_value = 4
    noise.inputs["Roughness"].default_value = 0.68
    noise.inputs["Distortion"].default_value = 1.8
    links.new(stretch.outputs[0], noise.inputs["Vector"])
    fine = nodes.new("ShaderNodeTexNoise")
    fine.noise_dimensions = "4D"
    fine.inputs["Scale"].default_value = 13
    fine.inputs["Detail"].default_value = 2
    fine.inputs["Roughness"].default_value = 0.7
    links.new(stretch.outputs[0], fine.inputs["Vector"])
    # A shared periodic phase drives the large rolling tongues and their torn
    # surface detail. Low absorption leaves the pressure filaments visible.
    fields.append((fine, mapping, index + 11))
    combined = scalar(nodes, links, "ADD", noise.outputs["Fac"], scalar(nodes, links, "MULTIPLY", fine.outputs["Fac"], 0.22))
    density = scalar(nodes, links, "SUBTRACT", combined, 0.53 if core else 0.55)
    density = scalar(nodes, links, "MAXIMUM", scalar(nodes, links, "MULTIPLY", density, 12), 0)
    links.new(scalar(nodes, links, "MULTIPLY", density, 1.3 if core else 1.35), volume.inputs["Density"])
    heat = scalar(nodes, links, "POWER", density, 1.35)
    # Heat leaves the nozzle before the outer shear envelope. Cool the real
    # volume downstream so its rolling tips retain detail instead of turning
    # into uniformly white billboards when the runtime overlaps two poses.
    position = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates.outputs["Object"], position.inputs[0])
    cooling = scalar(nodes, links, "MAXIMUM",
                     scalar(nodes, links, "SUBTRACT", 1.12,
                            scalar(nodes, links, "MULTIPLY", position.outputs["X"], 0.16)), 0.30)
    thermal = scalar(nodes, links, "MULTIPLY", heat, cooling)
    links.new(scalar(nodes, links, "MULTIPLY", thermal, 10.0 if core else 4.1), volume.inputs["Emission Strength"])
    if core:
        volume.inputs["Emission Color"].default_value = (0.42, 1, 0.25, 1)
    else:
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
        for position, colour in (
            (0, (0.003, 0.024, 0.011, 1)),
            (0.43, (0.008, 0.075, 0.026, 1)),
            (0.54, (0.015, 0.30, 0.095, 1)),
            (0.64, (0.10, 0.65, 0.22, 1)),
            (0.77, (0.62, 1, 0.43, 1)),
        ):
            element = ramp.color_ramp.elements[0] if position == 0 else ramp.color_ramp.elements.new(position)
            element.color = colour
        links.new(noise.outputs["Fac"], ramp.inputs[0])
        links.new(ramp.outputs[0], volume.inputs["Emission Color"])
    fields.append((noise, mapping, index))
    return mat


def jet(index, length, radius, branch, phase, core=False):
    rings, sides = 68, 20
    vertices, faces = [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        # Thin nozzle, accelerating shear expansion, disintegrating tip.
        width = radius * (0.18 + 1.60 * t) * (1 - t) ** 0.56 + 0.003
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append((length * t, math.sin(angle) * width, math.cos(angle) * width))
    faces.append(tuple(reversed(range(sides))))
    for ring in range(rings - 1):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple((rings - 1) * sides + side for side in range(sides)))
    mesh = bpy.data.meshes.new(f"sealed pressure stream {index}")
    # The X-axis rings run clockwise viewed from their positive end. Reverse
    # every face (including caps) so the volume enclosure points outwards.
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new(f"pressure stream {index}", mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material(index, core))
    meshes.append((obj, list(vertices), branch, phase, rings, sides, core))


for spec in (
    (0, 4.45, 0.29, 0.00, 0.0),
    (1, 4.18, 0.21, 0.36, 1.1),
    (2, 4.23, 0.19, -0.39, 2.7),
    (3, 3.84, 0.16, 0.72, 4.0),
    (4, 4.05, 0.15, -0.68, 5.1),
    (5, 3.42, 0.107, 0.00, 0.0, True),
    (6, 2.79, 0.065, 0.18, 1.1, True),
    (7, 3.09, 0.061, -0.21, 2.7, True),
):
    jet(*spec)


def pose(frame):
    phase = math.tau * (frame % 32) / 32
    for obj, vertices, branch, initial, rings, sides, core in meshes:
        for ring in range(rings):
            t = ring / (rings - 1)
            envelope = t ** 1.2
            # Pressure waves travel toward the tip; opposing helices roll up
            # into coherent three-dimensional eddies in the mixing layer.
            pulse = 1 + (0.20 if core else 0.31) * math.sin(phase * 3 - t * 24 + initial)
            pulse += (0.07 if core else 0.12) * math.sin(phase * 5 - t * 49 + initial * 2)
            curl = math.sin(phase * 2 - t * 15 + initial) * 0.16 * envelope
            curl += math.sin(phase * 4 - t * 31 + initial) * 0.045 * envelope
            depth = math.cos(phase * 2 - t * 15 + initial) * 0.14 * envelope
            centre = branch * t ** 2 + curl
            for side in range(sides):
                k = ring * sides + side
                x, y, z = vertices[k]
                angle = math.tau * side / sides
                roll = 1 + (0.10 if core else 0.18) * math.sin(angle * 3 + t * 21 - phase * 3 + initial)
                obj.data.vertices[k].co = (x, y * pulse * roll + depth, z * pulse * roll + centre)
        obj.data.update()
    for noise, mapping, index in fields:
        noise.inputs["W"].default_value = math.sin(phase) * 0.95 + index * 2.1
        mapping.inputs[1].default_value = (math.cos(phase) * 0.21, 0, 0)


for frame in range(min(32, args.count)):
    pose(frame)
    scene.render.filepath = os.path.join(args.output, f"jet-{frame:02d}.png")
    bpy.ops.render.render(write_still=True)
    print(f"CIEL_JET_FRAME {frame:02d}", flush=True)
pose(0)
first = [tuple(vertex.co) for obj, *_ in meshes for vertex in obj.data.vertices]
pose(32)
closing = [tuple(vertex.co) for obj, *_ in meshes for vertex in obj.data.vertices]
seam = max(abs(a - b) for p, q in zip(first, closing) for a, b in zip(p, q))
assert seam < 0.000001
if args.loop_check:
    scene.render.filepath = os.path.join(args.output, "loop-check.png")
    bpy.ops.render.render(write_still=True)
pose(0)
signed_volumes = []
for obj, *_ in meshes:
    obj.data.calc_loop_triangles()
    signed_volume = sum(
        obj.data.vertices[triangle.vertices[0]].co.dot(
            obj.data.vertices[triangle.vertices[1]].co.cross(obj.data.vertices[triangle.vertices[2]].co)
        ) / 6
        for triangle in obj.data.loop_triangles
    )
    assert signed_volume > 0, f"inward or degenerate enclosure: {obj.name}"
    signed_volumes.append(signed_volume)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.output, "ciel-inferno-jet.blend"))
with open(os.path.join(args.output, "render-provenance.json"), "w", encoding="utf8") as stream:
    json.dump({
        "generator": "scripts/blender/ciel_inferno_jet.py",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode(),
        "renderer": "Cycles CPU",
        "samples": args.samples,
        "renderFrameSize": [256 * args.scale, 128 * args.scale],
        "runtimeFrameSize": [256, 128],
        "frames": 32,
        "durationSeconds": 2,
        "volumeStreams": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj, *_ in meshes),
        "enclosureNormals": "outward",
        "signedVolumeMin": min(signed_volumes),
        "shader": "anisotropic multiscale fBm absorption/emission volumes with downstream thermal cooling, rolling lobes and three white-green pressure filaments",
        "loopGeometryMaxDelta": seam,
        "loopCheckRendered": args.loop_check,
        "flow": "left to right",
        "sourceAnchor": [8, 64],
        "colourManagement": "Standard, exposure -0.2",
    }, stream, indent=2)
