#!/usr/bin/env python3
"""Build a physically scaled exhibition-room study with Blender Cycles.

The source artwork is read as an image texture and packed without editing or
resaving it. Run with Blender, not a stand-alone Python image library:
  blender -b --factory-startup --python scripts/build-exhibition-studio.py -- \
    --output design/exhibition-studio-v1 --samples 64 --width 1200 --height 900
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SEED = 271828


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def args_from_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "design/exhibition-studio-v1")
    parser.add_argument("--artwork", type=Path, default=ROOT / "public/gallery/g19-1672.webp")
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--samples", type=int, default=64)
    parser.add_argument("--runtime-output", type=Path)
    parser.add_argument("--runtime-only", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.output = args.output.resolve()
    args.artwork = args.artwork.resolve()
    if args.runtime_output:
        args.runtime_output = args.runtime_output.resolve()
        if args.runtime_output.exists() and any(args.runtime_output.iterdir()):
            parser.error("Runtime output must be absent or empty")
    if args.runtime_only and not args.runtime_output:
        parser.error("--runtime-only requires --runtime-output")
    if not args.artwork.is_file():
        parser.error("The read-only artwork must exist")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Output must be absent or empty; use a new directory for each review")
    if not 320 <= args.width <= 6000 or not 240 <= args.height <= 6000:
        parser.error("Render dimensions are outside the supported range")
    if not 16 <= args.samples <= 2048:
        parser.error("Samples must be 16..2048")
    return args


def material(name, color, roughness=0.5, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat, bsdf


def noise_surface(mat, bsdf, scale, distance, strength, colors=None):
    tree = mat.node_tree
    tex = tree.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 3
    tex.inputs["Roughness"].default_value = 0.7
    coord = tree.nodes.new("ShaderNodeTexCoord")
    tree.links.new(coord.outputs["Object"], tex.inputs["Vector"])
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = distance
    bump.inputs["Strength"].default_value = strength
    tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if colors:
        ramp = tree.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.12
        ramp.color_ramp.elements[0].color = (*colors[0], 1)
        ramp.color_ramp.elements[1].position = 0.9
        ramp.color_ramp.elements[1].color = (*colors[1], 1)
        tree.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])


def cube(name, location, dimensions, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Manufactured_edge_radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
        modifier.harden_normals = True
        obj.modifiers.new("Weighted_surface_normals", "WEIGHTED_NORMAL")
    return obj


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, target, energy, color, width, height):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = width
    data.size_y = height
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def ring_prisms(name, outer_w, outer_h, inner_w, inner_h, front_y, back_y, z, mat, bevel):
    """Four actual 45 degree miter prisms; the opening contains no geometry."""
    x, h, ix, ih = outer_w / 2, outer_h / 2, inner_w / 2, inner_h / 2
    outlines = (
        ("Top", [(-x, h), (-ix, ih), (ix, ih), (x, h)]),
        ("Right", [(x, h), (ix, ih), (ix, -ih), (x, -h)]),
        ("Bottom", [(x, -h), (ix, -ih), (-ix, -ih), (-x, -h)]),
        ("Left", [(-x, -h), (-ix, -ih), (-ix, ih), (-x, h)]),
    )
    results = []
    for label, outline in outlines:
        vertices = [(px, back_y, pz + z) for px, pz in outline]
        vertices += [(px, front_y, pz + z) for px, pz in outline]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
        faces += [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)]
        mesh = bpy.data.meshes.new(f"{name}_{label}_Mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(f"{name}_{label}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(mat)
        if bevel:
            mod = obj.modifiers.new("Physical_edge_bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 4
            mod.harden_normals = True
            obj.modifiers.new("Weighted_normals", "WEIGHTED_NORMAL")
        results.append(obj)
    return results


def image_plane(image, width, height, y, z):
    # Explicit UVs avoid mirroring and use the whole source, without cropping.
    vertices = [(-width / 2, y, z - height / 2), (width / 2, y, z - height / 2),
                (width / 2, y, z + height / 2), (-width / 2, y, z + height / 2)]
    mesh = bpy.data.meshes.new("Unaltered_artwork_print_mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="Full_source_no_crop")
    for loop, value in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = value
    obj = bpy.data.objects.new("Original_artwork_on_archival_print", mesh)
    bpy.context.collection.objects.link(obj)
    mat, bsdf = material("Archival_pigment_print_original_texture", (1, 1, 1), 0.78)
    bsdf.inputs["Specular IOR Level"].default_value = 0.24
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "CLIP"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.append(mat)
    obj["source_pixels"] = "Original image, read-only; packed, never edited or resaved"
    return obj


def build_scene(args):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = SEED
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.35
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.45, 0.49, 0.53, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.12

    plaster, p = material("Warm_greige_fine_lime_plaster", (0.56, 0.525, 0.46), 0.86)
    noise_surface(plaster, p, 680, 0.00023, 0.35)
    # Broad trowel variation is deliberately gentle, not a dirty/noisy wall effect.
    tree = plaster.node_tree
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.6
    noise.inputs["Detail"].default_value = 2
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.515, 0.485, 0.435, 1)
    ramp.color_ramp.elements[1].color = (0.575, 0.545, 0.49, 1)
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    floor, f = material("Honed_warm_limestone", (0.30, 0.28, 0.245), 0.61)
    noise_surface(floor, f, 115, 0.0004, 0.23, ((0.275, 0.26, 0.232), (0.355, 0.33, 0.292)))
    skirting, s = material("Painted_skirting_satin", (0.40, 0.38, 0.345), 0.49)
    black, b = material("Blackened_brushed_aluminium", (0.035, 0.044, 0.052), 0.27, 0.86)
    noise_surface(black, b, 1100, 0.00004, 0.17)
    anisotropy = b.inputs.get("Anisotropic IOR Level") or b.inputs.get("Anisotropic")
    if anisotropy is not None:
        anisotropy.default_value = 0.42
    reveal, r = material("Inner_reveal_soft_anodised_aluminium", (0.085, 0.094, 0.10), 0.36, 0.9)
    mat, m = material("Uncoated_warm_cotton_rag_board", (0.78, 0.745, 0.68), 0.9)
    noise_surface(mat, m, 1450, 0.00012, 0.24)
    m.inputs["Specular IOR Level"].default_value = 0.15
    back, _ = material("Archival_backing_and_spacers", (0.022, 0.025, 0.027), 0.85)
    glass, g = material("Museum_low_iron_glass_2mm", (0.995, 0.998, 1.0), 0.018)
    g.inputs["Transmission Weight"].default_value = 1
    g.inputs["IOR"].default_value = 1.46
    # A quarter-wave dielectric coating, not a lowered light contribution:
    # sqrt(1.46) = 1.208 and 550nm / (4 * 1.208) = approximately 114nm.
    # Principled's physical thin-film layer also acts on transmitted glass.
    g.inputs["Thin Film Thickness"].default_value = 114
    g.inputs["Thin Film IOR"].default_value = 1.208
    # No emission, image filter, synthetic flare or artwork retouching.

    cube("Back_wall_480cm_wide_300cm_high", (0, 0.10, 1.5), (4.8, 0.20, 3.0), plaster)
    cube("Right_return_wall", (2.50, -1.6, 1.5), (0.20, 3.6, 3.0), plaster)
    cube("Honed_stone_floor", (0, -1.8, -0.06), (5.2, 4.8, 0.12), floor)
    cube("Back_skirting_7cm", (0, -0.014, 0.035), (4.8, 0.026, 0.07), skirting, 0.001)
    cube("Right_skirting_7cm", (2.382, -1.60, 0.035), (0.026, 3.2, 0.07), skirting, 0.001)
    grout, _ = material("Fine_limestone_joint", (0.20, 0.191, 0.175), 0.92)
    for x in [-1.8, -0.6, 0.6, 1.8]:
        cube(f"Stone_joint_x_{x}", (x, -1.8, 0.0001), (0.0015, 4.4, 0.0002), grout)
    for y in [-0.9, -2.1, -3.3]:
        cube(f"Stone_joint_y_{y}", (0, y, 0.0001), (4.8, 0.0015, 0.0002), grout)

    image = bpy.data.images.load(str(args.artwork), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    source_width, source_height = image.size
    if source_width < 1 or source_height < 1:
        raise RuntimeError("Blender did not decode the original artwork")
    image.pack()
    if not image.packed_file or hashlib.sha256(image.packed_file.data).hexdigest() != digest(args.artwork):
        raise RuntimeError("Packed artwork bytes differ from the read-only source")
    print_width = 1.65
    print_height = print_width * source_height / source_width
    center_z = 1.53
    mat_width = print_width + 0.13
    mat_height = print_height + 0.13
    outer_width = mat_width + 0.05
    outer_height = mat_height + 0.05
    cube("Backing_panel", (0, -0.040, center_z), (mat_width, 0.016, mat_height), back, 0.001)
    for x in [-0.55, 0.55]:
        cube(f"Wall_spacer_{x}", (x, -0.012, center_z + 0.27), (0.07, 0.024, 0.07), back, 0.001)
    image_plane(image, print_width, print_height, -0.058, center_z)
    ring_prisms("Cotton_mat_65mm", mat_width, mat_height, print_width, print_height,
                -0.061, -0.0585, center_z, mat, 0.00035)
    ring_prisms("Mitered_frame_25mm_face_46mm_deep", outer_width, outer_height,
                mat_width, mat_height, -0.078, -0.032, center_z, black, 0.0012)
    ring_prisms("Machined_inner_reveal", mat_width + 0.0015, mat_height + 0.0015,
                mat_width - 0.002, mat_height - 0.002, -0.074, -0.067, center_z, reveal, 0.0003)
    cube("Museum_glazing_2mm", (0, -0.066, center_z), (mat_width - 0.001, 0.002, mat_height - 0.001), glass, 0.0002)

    # Visible physical fixtures and a real out-of-frame studio window supply
    # causal illumination/reflections instead of free-floating visual effects.
    fixture, _ = material("Powder_coated_track_fixture", (0.025, 0.029, 0.033), 0.42, 0.2)
    cube("Ceiling_lighting_track", (0, -0.44, 2.94), (2.8, 0.05, 0.045), fixture, 0.003)
    for x in [-0.65, 0.65]:
        cube(f"Track_spot_housing_{x}", (x, -0.43, 2.855), (0.10, 0.12, 0.14), fixture, 0.008)
        area(f"Warm_gallery_spot_{x}", (x, -0.49, 2.75), (x * 0.3, 0, 1.4),
             42, (1.0, 0.87, 0.70), 0.11, 0.11)
    window = area("Large_soft_daylight_window", (-2.8, -2.0, 2.0), (0, 0, 1.2),
                  420, (0.89, 0.94, 1.0), 1.4, 2.1)
    area("Camera_side_soft_bounce", (1.6, -3.2, 2.15), (0, -0.04, 1.5),
         45, (1.0, 0.92, 0.83), 2.1, 1.6)
    # A slender window mullion placed across the emitter creates a real shadow
    # division and appears in reflected paths. It is not visible in either view.
    mullion = cube("Out_of_view_window_mullion", (-2.67, -1.92, 2.0), (0.035, 0.035, 2.05), fixture)
    mullion["purpose"] = "Physical window divider for reflection and light occlusion"
    window["purpose"] = "Window-sized daylight source outside the camera frustum"

    label_mat, _ = material("Museum_caption_card", (0.69, 0.65, 0.58), 0.86)
    cube("Small_physical_caption_card", (outer_width / 2 - 0.11, -0.008, center_z - outer_height / 2 - 0.11),
         (0.22, 0.003, 0.070), label_mat, 0.001)
    ink, _ = material("Caption_ink", (0.025, 0.03, 0.034), 0.85)
    # No invented artwork title: use only this collection's established name.
    text_curve = bpy.data.curves.new("Collection_caption_type", "FONT")
    text_curve.body = "DECEPTION WORLD\nVISUAL COLLECTION / 019"
    text_curve.size = 0.0057
    text_curve.space_line = 1.45
    text_obj = bpy.data.objects.new("Caption_lettering", text_curve)
    bpy.context.collection.objects.link(text_obj)
    text_obj.location = (outer_width / 2 - 0.209, -0.010, center_z - outer_height / 2 - 0.104)
    text_obj.rotation_euler = (math.pi / 2, 0, 0)
    text_curve.materials.append(ink)

    return scene, {
        "room": {"width": 4.8, "height": 3.0, "floorDepth": 4.8, "skirtingHeight": 0.07},
        "artwork": {"width": print_width, "height": print_height, "centerHeight": center_z},
        "mount": {"outerWidth": outer_width, "outerHeight": outer_height,
                  "railFaceWidth": 0.025, "railDepth": 0.046, "railBevel": 0.0012,
                  "cottonMatWidth": 0.065, "glassThickness": 0.002, "wallGap": 0.032},
        "sourceDimensions": [source_width, source_height],
    }


def runtime_assets(scene, args):
    """Render an artwork-free room probe and bake the real plaster material."""
    output = args.runtime_output
    output.mkdir(parents=True, exist_ok=True)
    saved_camera = scene.camera
    saved_samples = scene.cycles.samples
    saved_width, saved_height = scene.render.resolution_x, scene.render.resolution_y
    saved_format, saved_depth = scene.render.image_settings.file_format, scene.render.image_settings.color_depth
    hidden = []
    prefixes = ("Backing_panel", "Wall_spacer_", "Original_artwork_", "Cotton_mat_",
                "Mitered_frame_", "Machined_inner_reveal", "Museum_glazing_",
                "Small_physical_caption_card", "Caption_lettering")
    for obj in scene.objects:
        if obj.name.startswith(prefixes):
            hidden.append((obj, obj.hide_render))
            obj.hide_render = True
    data = bpy.data.cameras.new("Artwork_free_HDR_probe")
    data.type = "PANO"
    data.panorama_type = "EQUIRECTANGULAR"
    probe = bpy.data.objects.new("Artwork_free_HDR_probe", data)
    bpy.context.collection.objects.link(probe)
    probe.location = (0, -0.35, 1.53)
    probe.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = probe
    scene.cycles.samples = 32
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "HDR"
    hdr = output / "studio-light.hdr"
    scene.render.filepath = str(hdr)
    bpy.ops.render.render(write_still=True)
    loaded = bpy.data.images.load(str(hdr), check_existing=False)
    if list(loaded.size) != [2048, 1024] or loaded.channels < 3:
        raise RuntimeError("Invalid environment probe dimensions")
    # Read Blender's actual linear pixels to prove the file retains HDR radiance.
    pixels = loaded.pixels[:]
    maximum = max(value for index, value in enumerate(pixels) if index % 4 != 3)
    if not math.isfinite(maximum) or maximum <= 1:
        raise RuntimeError(f"Environment has no HDR radiance: {maximum}")
    loaded.pack()
    scene.camera = saved_camera
    for obj, state in hidden:
        obj.hide_render = state
    probe.hide_render = True

    # Actual Cycles bakes of a 25cm sample of the room's plaster; no Python
    # pixel synthesis. Tile scale is recorded for the runtime normal-map UVs.
    bpy.ops.mesh.primitive_plane_add(size=0.25, location=(0, -8, 0))
    surface = bpy.context.object
    surface.name = "Plaster_25cm_Cycles_bake_sample_not_display_geometry"
    plaster = bpy.data.materials["Warm_greige_fine_lime_plaster"].copy()
    plaster.name = "Plaster_runtime_bake_copy"
    surface.data.materials.append(plaster)
    tree = plaster.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    out = tree.nodes.get("Material Output")
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    scene.render.bake.normal_space = "TANGENT"
    scene.render.bake.normal_r = "POS_X"
    scene.render.bake.normal_g = "POS_Y"
    scene.render.bake.normal_b = "POS_Z"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    bpy.ops.object.select_all(action="DESELECT")
    surface.select_set(True)
    bpy.context.view_layer.objects.active = surface
    maps = {}
    for kind, filename in (("NORMAL", "plaster-normal.png"), ("EMIT", "plaster-roughness.png")):
        image = bpy.data.images.new(filename, width=512, height=512, alpha=False)
        image.colorspace_settings.name = "Non-Color"
        target = tree.nodes.new("ShaderNodeTexImage")
        target.image = image
        tree.nodes.active = target
        emission = None
        if kind == "EMIT":
            emission = tree.nodes.new("ShaderNodeEmission")
            emission.inputs["Color"].default_value = (bsdf.inputs["Roughness"].default_value,) * 3 + (1,)
            tree.links.new(emission.outputs[0], out.inputs["Surface"])
        bpy.ops.object.bake(type=kind)
        path = output / filename
        image.file_format = "PNG"
        image.filepath_raw = str(path)
        image.save()
        image.pack()
        maps[filename] = {"sha256": digest(path), "colorSpace": "linear",
                          "resolution": [512, 512], "sampleWidthMeters": 0.25}
        if emission:
            tree.nodes.remove(emission)
            tree.links.new(bsdf.outputs[0], out.inputs["Surface"])
    surface.hide_render = True
    surface.hide_viewport = True
    scene.cycles.samples = saved_samples
    scene.render.resolution_x, scene.render.resolution_y = saved_width, saved_height
    scene.render.image_settings.file_format = saved_format
    scene.render.image_settings.color_depth = saved_depth
    return {
        "probe": {"file": hdr.name, "sha256": digest(hdr), "resolution": [2048, 1024],
                  "samples": 32, "positionMeters": [0, -0.35, 1.53],
                  "rotationEulerRadians": [math.pi / 2, 0, 0], "projection": "equirectangular",
                  "maximumLinearRadiance": maximum, "excludedObjects": [obj.name for obj, _ in hidden],
                  "artworkBakedIntoEnvironment": False},
        "maps": maps,
    }


def main():
    args = args_from_cli()
    source_hash = digest(args.artwork)
    args.output.mkdir(parents=True, exist_ok=True)
    scene, dimensions = build_scene(args)
    camera_data = bpy.data.cameras.new("Gallery_review_camera_45mm")
    camera = bpy.data.objects.new("Gallery_review_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.lens = 45
    camera_data.sensor_width = 36
    camera_data.clip_start = 0.01
    camera_data.clip_end = 100
    # Deep focus keeps material, print and wall contact readable in both views.
    camera_data.dof.use_dof = False
    scene.camera = camera
    views = {
        "front": {"location": [0, -3.85, 1.40], "target": [0, -0.04, 1.13]},
        "oblique": {"location": [1.72, -3.2, 1.68], "target": [0, -0.03, 1.42]},
    }
    outputs = {}
    for name, view in ([] if args.runtime_only else views.items()):
        camera.location = view["location"]
        aim(camera, view["target"])
        path = args.output / f"exhibition-{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        if not path.is_file() or path.stat().st_size < 1000:
            raise RuntimeError(f"Missing rendered output: {path}")
        outputs[name] = {"file": path.name, "sha256": digest(path), **view}
    runtime = runtime_assets(scene, args) if args.runtime_output else None
    camera.location = views["front"]["location"]
    aim(camera, views["front"]["target"])
    scene.render.filepath = str(args.output / "exhibition-front.png")
    blend = args.output / "exhibition-studio.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    if digest(args.artwork) != source_hash:
        raise RuntimeError("The read-only source artwork changed during generation")
    manifest = {
        "schemaVersion": 1, "generator": "scripts/build-exhibition-studio.py",
        "generatorSha256": digest(Path(__file__)), "blenderVersion": bpy.app.version_string,
        "engine": "CYCLES", "samples": args.samples, "denoising": True,
        "seed": SEED, "resolution": [args.width, args.height], "units": "meters",
        "colorManagement": {"viewTransform": "AgX", "exposure": 0.35},
        "glass": {"ior": 1.46, "thinFilmIor": 1.208, "thinFilmThicknessNm": 114,
                  "note": "Single quarter-wave AR coating; not a manufacturer-specific spectral model"},
        "sourceArtwork": {"path": str(args.artwork.relative_to(ROOT)) if args.artwork.is_relative_to(ROOT) else str(args.artwork),
                          "sha256Before": source_hash, "sha256After": digest(args.artwork),
                          "packedOriginalBytes": True, "editedOrResaved": False},
        "dimensions": dimensions, "objects": len(scene.objects),
        "outputs": outputs, "blend": {"file": blend.name, "sha256": digest(blend)},
        "runtimeAssets": runtime,
        "purpose": "Physical exhibition lighting/material QA; not a retouched replacement of the source artwork",
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    if runtime:
        runtime_manifest = {"schemaVersion": 1, "generator": manifest["generator"],
                            "generatorSha256": manifest["generatorSha256"],
                            "blenderVersion": manifest["blenderVersion"], "engine": "CYCLES",
                            "sourceArtworkUnchanged": source_hash == digest(args.artwork), **runtime}
        (args.runtime_output / "manifest.json").write_text(json.dumps(runtime_manifest, indent=2) + "\n", encoding="utf8")
    print(f"EXHIBITION_COMPLETE {args.output}", flush=True)


if __name__ == "__main__":
    main()
