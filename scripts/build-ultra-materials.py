#!/usr/bin/env python3
"""Bake artwork-mount surface maps with Blender, without touching artwork pixels.

Run with Blender 4.5 LTS or newer:
  blender --background --factory-startup --python scripts/build-ultra-materials.py -- \
    --resolution 1024

The periodic shader is analytic, so all four tile boundaries join. Cycles performs
the actual normal and emission bakes; Python does not synthesize image pixels.
"""

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SEED = 271828


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--output", type=Path, default=ROOT / "public/ultra-materials")
    parser.add_argument("--provenance", type=Path, default=ROOT / "design/ultra-materials")
    parser.add_argument("--skip-preview", action="store_true")
    parser.add_argument("--skip-frame-rim", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.resolution < 128 or args.resolution > 1024:
        parser.error("--resolution must be between 128 and 1024")
    if args.resolution & (args.resolution - 1):
        parser.error("--resolution must be a power of two")
    args.output = args.output.resolve()
    args.provenance = args.provenance.resolve()
    if args.output == args.provenance:
        parser.error("Runtime assets and provenance must use separate directories")
    # Refuse to overwrite existing results silently; reproduction gets a fresh directory.
    for directory in (args.output, args.provenance):
        if directory.exists() and any(directory.iterdir()):
            parser.error(f"Output directory must be absent or empty: {directory}")
    return args


def math_node(tree, operation, first, second=None, label=None):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    node.label = label or operation
    for socket, value in zip(node.inputs, (first, second)):
        if value is None:
            continue
        if isinstance(value, (float, int)):
            socket.default_value = value
        else:
            tree.links.new(value, socket)
    return node.outputs[0]


def periodic_wave(tree, u, v, frequency_u, frequency_v, phase):
    x = math_node(tree, "MULTIPLY", u, frequency_u)
    y = math_node(tree, "MULTIPLY", v, frequency_v)
    cycles = math_node(tree, "ADD", math_node(tree, "ADD", x, y), phase)
    return math_node(tree, "SINE", math_node(tree, "MULTIPLY", cycles, math.tau))


def surface_fields(tree):
    uv = tree.nodes.new("ShaderNodeTexCoord")
    uv.label = "Periodic UV surface; no object-space noise seams"
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(uv.outputs["UV"], split.inputs[0])
    u, v = split.outputs["X"], split.outputs["Y"]
    # Long parallel grooves with a slight periodic drift along their length.
    # Frequencies stay below the Nyquist limit even for the 512px production bake.
    harmonics = (
        (1, 61, 0.13, 0.105),
        (2, 113, 0.37, 0.065),
        (0, 173, 0.71, 0.036),
        (3, 229, 0.23, 0.019),
        (37, 43, 0.59, 0.013),
        (67, -59, 0.83, 0.009),
        (101, 89, 0.41, 0.006),
    )
    height = 0.5
    for index, (fu, fv, phase, amplitude) in enumerate(harmonics):
        wave = periodic_wave(tree, u, v, fu, fv, phase)
        height = math_node(tree, "ADD", height,
                           math_node(tree, "MULTIPLY", wave, amplitude),
                           label=f"Machining harmonic {index + 1}")
    roughness = math_node(tree, "ADD", 0.29,
                          math_node(tree, "MULTIPLY", height, 0.19))
    broad = periodic_wave(tree, u, v, 2, 3, 0.31)
    roughness = math_node(tree, "ADD", roughness,
                          math_node(tree, "MULTIPLY", broad, 0.025))
    return height, roughness


def create_surface():
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    plane = bpy.context.object
    plane.name = "BakeSurface_UV_Repeat_1m"
    material = bpy.data.materials.new("Ultra_Dark_Brushed_Alloy")
    material.use_nodes = True
    material["purpose"] = "Artwork-bound metal mounts only; original artwork remains unchanged"
    plane.data.materials.append(material)
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    output.location = (1100, 0)
    principled = tree.nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (850, 0)
    principled.inputs["Base Color"].default_value = (0.018, 0.026, 0.037, 1)
    principled.inputs["Metallic"].default_value = 1.0
    # The anisotropic setting belongs to the runtime material, not the maps.
    anisotropic = principled.inputs.get("Anisotropic IOR Level") or principled.inputs.get("Anisotropic")
    if anisotropic is not None:
        anisotropic.default_value = 0.62
    height, roughness = surface_fields(tree)
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    bump.inputs["Distance"].default_value = 0.0012
    tree.links.new(height, bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    tree.links.new(roughness, principled.inputs["Roughness"])
    tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return plane, material, output, principled, roughness


def bake_map(plane, material, output, principled, roughness, kind, resolution, path):
    tree = material.node_tree
    image = bpy.data.images.new(path.stem, width=resolution, height=resolution,
                               alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color"
    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = image
    target.label = f"Cycles {kind} bake target"
    target.select = True
    tree.nodes.active = target
    bpy.context.view_layer.objects.active = plane
    plane.select_set(True)
    emission = None
    if kind == "EMIT":
        emission = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(roughness, emission.inputs["Color"])
        tree.links.new(emission.outputs[0], output.inputs["Surface"])
    bpy.ops.object.bake(type=kind)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    # Keep the .blend standalone and auditable after it leaves this checkout.
    image.pack()
    if emission is not None:
        tree.nodes.remove(emission)
        tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    target.select = False
    return image


def aim(object_, target):
    object_.rotation_euler = (Vector(target) - object_.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, color, size, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size * 0.18
    object_ = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(object_)
    object_.location = location
    aim(object_, target)


def preview_scene(plane, material):
    plane.hide_render = True
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
    sample = bpy.context.object
    sample.name = "Surface_QA_Slab_Not_Runtime_Geometry"
    sample.scale = (1, 0.64, 0.024)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    sample.data.materials.append(material)
    bevel = sample.modifiers.new("Machined_edge_12mm", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 4
    for polygon in sample.data.polygons:
        polygon.use_smooth = True
    sample.modifiers.new("Weighted_surface_normals", "WEIGHTED_NORMAL")
    add_area("Studio_warm_strip", (-1.6, 0.4, 2.0), 150, (1.0, 0.85, 0.67), 2.6)
    add_area("Studio_cool_strip", (1.4, -0.8, 1.2), 90, (0.66, 0.83, 1.0), 1.7)
    add_area("Studio_soft_fill", (0, 2.0, 2.3), 45, (0.85, 0.91, 1.0), 3.0)
    camera_data = bpy.data.cameras.new("Surface_QA_Camera")
    camera = bpy.data.objects.new("Surface_QA_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (1.6, -2.1, 3.7)
    aim(camera, (0, 0, 0))
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.85
    bpy.context.scene.camera = camera
    return sample


def create_frame(material):
    """Four 45-degree mitered trapezoid prisms, with a real open center.

    Blender units are meters. The outside is 2m square, aperture 1.786m square,
    rail width 107mm, depth 36mm, and bevel 3mm. A 2.04m orthographic span puts
    each rail plus transparent outer margin inside a 64px slice at 1024px.
    """
    inner = 0.893
    rings = (
        ("Top", [(-1, 1), (-inner, inner), (inner, inner), (1, 1)]),
        ("Right", [(1, 1), (inner, inner), (inner, -inner), (1, -1)]),
        ("Bottom", [(1, -1), (inner, -inner), (-inner, -inner), (-1, -1)]),
        ("Left", [(-1, -1), (-inner, -inner), (-inner, inner), (-1, 1)]),
    )
    objects = []
    for name, outline in rings:
        vertices = [(x, y, -0.018) for x, y in outline]
        vertices += [(x, y, 0.018) for x, y in outline]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
        faces += [(index, (index + 1) % 4, (index + 1) % 4 + 4, index + 4)
                  for index in range(4)]
        mesh = bpy.data.meshes.new(f"Mitered_{name}_Rail_Mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        rail = bpy.data.objects.new(f"Artwork_Mount_{name}_Rail", mesh)
        bpy.context.collection.objects.link(rail)
        mesh.materials.append(material)
        uv_layer = mesh.uv_layers.new(name="Rail_Brush_U")
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                if name == "Top":
                    uv = ((vertex.x + 1) / 2, (vertex.y - inner) / (1 - inner))
                elif name == "Bottom":
                    uv = ((vertex.x + 1) / 2, (-vertex.y - inner) / (1 - inner))
                elif name == "Right":
                    uv = ((vertex.y + 1) / 2, (vertex.x - inner) / (1 - inner))
                else:
                    uv = ((vertex.y + 1) / 2, (-vertex.x - inner) / (1 - inner))
                uv_layer.data[loop_index].uv = uv
        bevel = rail.modifiers.new("Machined_bevel_3mm", "BEVEL")
        bevel.width = 0.003
        bevel.segments = 4
        bevel.affect = "EDGES"
        bevel.harden_normals = True
        # Keep the long flat face flat; weighted normals soften the tiny bevels.
        rail.modifiers.new("Weighted_machined_normals", "WEIGHTED_NORMAL")
        rail["rail_width_m"] = 0.107
        rail["depth_m"] = 0.036
        rail["bevel_m"] = 0.003
        rail["miter_degrees"] = 45
        objects.append(rail)
    return objects


def verify_frame_alpha(path, resolution):
    """Check the saved PNG, not an assumed transparent scene setting."""
    image = bpy.data.images.load(str(path), check_existing=False)
    if tuple(image.size) != (resolution, resolution) or image.channels != 4:
        raise RuntimeError("Frame must be a square RGBA render at the requested resolution")
    pixels = array("f", [0]) * (resolution * resolution * 4)
    image.pixels.foreach_get(pixels)
    # The CSS center slice is never painted; check its interior remains empty.
    inset = resolution // 16 + 4
    center_alpha_max = max(pixels[(y * resolution + x) * 4 + 3]
                           for y in range(inset, resolution - inset)
                           for x in range(inset, resolution - inset))
    points = [(0.5, 0.969), (0.969, 0.5), (0.5, 0.031), (0.031, 0.5)]
    rail_alpha_min = min(pixels[(int(y * resolution) * resolution + int(x * resolution)) * 4 + 3]
                         for x, y in points)
    bpy.data.images.remove(image)
    if center_alpha_max > 1 / 255 or rail_alpha_min < 0.99:
        raise RuntimeError(f"Invalid frame alpha: center {center_alpha_max}, rails {rail_alpha_min}")
    return {"centerAlphaMax": center_alpha_max, "railAlphaMin": rail_alpha_min,
            "centerCheckedInsetPx": inset}


def render_frame(scene, sample, material, resolution, path):
    sample.hide_render = True
    rails = create_frame(material)
    camera = scene.camera
    camera.location = (0, 0, 4)
    aim(camera, (0, 0, 0))
    camera.data.ortho_scale = 2.04
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    checks = verify_frame_alpha(path, resolution)
    return rails, checks


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    args = arguments()
    for directory in (args.output, args.provenance):
        directory.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = SEED
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.render.bake.margin = 0
    scene.render.bake.use_clear = True
    scene.render.bake.normal_space = "TANGENT"
    scene.render.bake.normal_r = "POS_X"
    scene.render.bake.normal_g = "POS_Y"
    scene.render.bake.normal_b = "POS_Z"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.06, 0.08, 0.11, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    plane, material, output, principled, roughness = create_surface()
    normal_path = args.output / "brushed-alloy-normal.png"
    roughness_path = args.output / "brushed-alloy-roughness.png"
    bake_map(plane, material, output, principled, roughness, "NORMAL", args.resolution, normal_path)
    bake_map(plane, material, output, principled, roughness, "EMIT", args.resolution, roughness_path)
    sample = preview_scene(plane, material)
    if not args.skip_preview:
        scene.render.resolution_x = 768
        scene.render.resolution_y = 512
        scene.render.resolution_percentage = 100
        scene.render.filepath = str(args.provenance / "brushed-alloy-studio-preview.png")
        bpy.ops.render.render(write_still=True)
    frame_path = args.output / "frame-rim.png"
    frame_checks = None
    if not args.skip_frame_rim:
        _, frame_checks = render_frame(scene, sample, material, args.resolution, frame_path)
    blend_path = args.provenance / "ultra-brushed-alloy.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    manifest = {
        "schemaVersion": 1,
        "generator": "scripts/build-ultra-materials.py",
        "generatorSha256": digest(Path(__file__)),
        "blenderVersion": bpy.app.version_string,
        "engine": "CYCLES",
        "device": "CPU",
        "seed": SEED,
        "samples": scene.cycles.samples,
        "resolution": args.resolution,
        "purpose": "Repeatable surface detail for metal artwork mounts; no artwork baked",
        "material": {
            "baseColorLinear": [0.018, 0.026, 0.037],
            "metallic": 1.0,
            "anisotropy": 0.62,
            "roughnessRange": [0.311, 0.459],
            "normalConvention": "Tangent OpenGL +X +Y +Z",
            "uvBrushDirection": "U; rotate UV for vertical frame rails",
        },
        "maps": {
            "normal": {"file": normal_path.name, "sha256": digest(normal_path), "colorSpace": "linear", "repeat": True},
            "roughness": {"file": roughness_path.name, "sha256": digest(roughness_path), "colorSpace": "linear", "channel": "R", "repeat": True},
        },
        "frame": None if args.skip_frame_rim else {
            "file": frame_path.name,
            "sha256": digest(frame_path),
            "colorSpace": "sRGB",
            "transparent": True,
            "borderImageSlice": args.resolution // 16,
            "borderImageFill": False,
            "outerSizeMeters": 2,
            "apertureSizeMeters": 1.786,
            "railWidthMeters": 0.107,
            "depthMeters": 0.036,
            "bevelMeters": 0.003,
            "miterDegrees": 45,
            "alphaChecks": frame_checks,
        },
        "provenance": {
            "blend": blend_path.name,
            "blendSha256": digest(blend_path),
            "preview": None if args.skip_preview else "brushed-alloy-studio-preview.png",
        },
    }
    serialized = json.dumps(manifest, indent=2) + "\n"
    (args.output / "manifest.json").write_text(serialized, encoding="utf-8")
    (args.provenance / "manifest.json").write_text(serialized, encoding="utf-8")
    print(f"Blender {bpy.app.version_string}: baked {args.resolution}px alloy maps to {args.output}")
    print(f"Packed Blender scene and QA preview: {args.provenance}")


if __name__ == "__main__":
    main()
