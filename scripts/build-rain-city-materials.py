#!/usr/bin/env python3
"""Bake periodic street materials with Blender Cycles, then encode runtime maps.

blender --background --factory-startup --python scripts/build-rain-city-materials.py
All texture pixels originate in Cycles NORMAL/EMIT bakes, never Python painting.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SEED = 73017


def args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--output", type=Path, default=ROOT / "public/rain-city-materials")
    parser.add_argument("--provenance", type=Path, default=ROOT / "design/rain-city-materials")
    parser.add_argument("--node", default="node")
    parser.add_argument("--keep-bakes", action="store_true", help="Keep the six full-resolution Cycles masters (otherwise only their SHA256s remain)")
    result = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if result.resolution not in (256, 512, 1024):
        parser.error("resolution must be 256, 512 or 1024")
    for directory in (result.output, result.provenance):
        if directory.exists() and any(directory.iterdir()):
            parser.error(f"Refusing to overwrite non-empty output: {directory}")
        directory.mkdir(parents=True, exist_ok=True)
    return result


def bind(tree, source, target):
    if isinstance(source, (int, float, tuple)):
        target.default_value = source
    else:
        tree.links.new(source, target)


def calc(tree, op, a, b=0):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = op
    bind(tree, a, node.inputs[0])
    bind(tree, b, node.inputs[1])
    return node.outputs[0]


def mix(tree, factor, a, b):
    node = tree.nodes.new("ShaderNodeMixRGB")
    bind(tree, factor, node.inputs[0])
    bind(tree, a, node.inputs[1])
    bind(tree, b, node.inputs[2])
    return node.outputs[0]


def ramp(tree, value, stops):
    node = tree.nodes.new("ShaderNodeValToRGB")
    tree.links.new(value, node.inputs[0])
    node.color_ramp.interpolation = "EASE"
    for index, (position, shade) in enumerate(stops):
        element = node.color_ramp.elements[index] if index < 2 else node.color_ramp.elements.new(position)
        element.position = position
        element.color = (shade, shade, shade, 1)
    return node.outputs["Color"]


def periodic_noise(tree, u, v, scale, anisotropy=1):
    # A torus embedded in 4D closes exactly at every UV boundary. Ordinary
    # object-space noise is not tileable; do not substitute it here.
    vector = tree.nodes.new("ShaderNodeCombineXYZ")
    for socket, phase, operation, amount in (
        (0, u, "COSINE", anisotropy), (1, u, "SINE", anisotropy), (2, v, "COSINE", 1)
    ):
        tree.links.new(calc(tree, "MULTIPLY", calc(tree, operation, phase), amount), vector.inputs[socket])
    node = tree.nodes.new("ShaderNodeTexNoise")
    node.noise_dimensions = "4D"
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = 2
    node.inputs["Roughness"].default_value = .62
    tree.links.new(vector.outputs[0], node.inputs["Vector"])
    tree.links.new(calc(tree, "SINE", v), node.inputs["W"])
    return node.outputs["Fac"]


def material_for(name):
    mat = bpy.data.materials.new(f"RainCity_{name}_Periodic_Cycles")
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    uv = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(uv.outputs["UV"], separate.inputs[0])
    u = calc(tree, "ADD", calc(tree, "MULTIPLY", separate.outputs[0], math.tau), .73017)
    v = calc(tree, "ADD", calc(tree, "MULTIPLY", separate.outputs[1], math.tau), 1.271828)
    broad = periodic_noise(tree, u, v, 1.7)
    medium = periodic_noise(tree, u, v, 8)
    grain = periodic_noise(tree, u, v, 57)
    if name == "concrete":
        stain = periodic_noise(tree, u, v, 2.8, 3)
        pits = ramp(tree, grain, [(.22, 0), (.36, 0), (.44, 1), (.75, 1)])
        variation = calc(tree, "MULTIPLY", calc(tree, "ADD", broad, medium), .5)
        color = mix(tree, variation, (.075, .085, .085, 1), (.27, .275, .255, 1))
        color = mix(tree, calc(tree, "MULTIPLY", stain, .25), color, (.075, .072, .06, 1))
        color = mix(tree, calc(tree, "MULTIPLY", calc(tree, "SUBTRACT", 1, pits), .42), color, (.025, .03, .027, 1))
        rough = calc(tree, "ADD", .54, calc(tree, "MULTIPLY", medium, .4))
        height = calc(tree, "ADD", calc(tree, "MULTIPLY", broad, .18), calc(tree, "MULTIPLY", grain, .24))
        height = calc(tree, "ADD", height, calc(tree, "MULTIPLY", pits, .14))
        distance, repeat = .035, 3
    else:
        puddle = ramp(tree, broad, [(.38, 0), (.57, 1)])
        aggregate = ramp(tree, grain, [(.28, .08), (.66, .75)])
        color = mix(tree, aggregate, (.006, .009, .011, 1), (.065, .074, .078, 1))
        color = mix(tree, calc(tree, "MULTIPLY", puddle, .65), color, (.005, .009, .013, 1))
        rough = mix(tree, puddle, (.72, .72, .72, 1), (.13, .13, .13, 1))
        height = calc(tree, "MULTIPLY", grain, calc(tree, "SUBTRACT", 1, calc(tree, "MULTIPLY", puddle, .88)))
        distance, repeat = .028, 4
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    surface = tree.nodes.new("ShaderNodeBsdfPrincipled")
    surface.inputs["Metallic"].default_value = 0
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .65
    bump.inputs["Distance"].default_value = distance
    tree.links.new(height, bump.inputs["Height"])
    tree.links.new(bump.outputs[0], surface.inputs["Normal"])
    tree.links.new(color, surface.inputs["Base Color"])
    tree.links.new(rough, surface.inputs["Roughness"])
    tree.links.new(surface.outputs[0], output.inputs[0])
    return mat, output, surface, color, rough, repeat


def bake(plane, material, output, surface, channel, socket, resolution, path):
    tree = material.node_tree
    image = bpy.data.images.new(path.stem, width=resolution, height=resolution, alpha=False)
    image.colorspace_settings.name = "sRGB" if channel == "albedo" else "Non-Color"
    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = image
    tree.nodes.active = target
    bpy.context.view_layer.objects.active = plane
    plane.select_set(True)
    emission = None
    if channel != "normal":
        emission = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(socket, emission.inputs["Color"])
        tree.links.new(emission.outputs[0], output.inputs[0])
    bpy.ops.object.bake(type="NORMAL" if channel == "normal" else "EMIT")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    if emission:
        tree.nodes.remove(emission)
    tree.links.new(surface.outputs[0], output.inputs[0])
    tree.nodes.remove(target)
    bpy.data.images.remove(image)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def preview(options):
    # Render the actual baked maps, not the procedural source: this catches
    # encoding, tangent handedness and color-space errors in the export.
    for index, name in enumerate(("concrete", "asphalt")):
        bpy.ops.mesh.primitive_plane_add(size=3, location=(-1.7 + index * 3.4, 0, 0))
        plane = bpy.context.object
        mat = bpy.data.materials.new(f"QA_{name}_baked")
        mat.use_nodes = True
        plane.data.materials.append(mat)
        tree = mat.node_tree
        surface = tree.nodes.get("Principled BSDF")
        for channel in ("albedo", "normal", "roughness"):
            image = bpy.data.images.load(str(options.provenance / f"{name}-{channel}-cycles.png"))
            image.colorspace_settings.name = "sRGB" if channel == "albedo" else "Non-Color"
            texture = tree.nodes.new("ShaderNodeTexImage")
            texture.image = image
            if channel == "normal":
                normal = tree.nodes.new("ShaderNodeNormalMap")
                tree.links.new(texture.outputs["Color"], normal.inputs["Color"])
                tree.links.new(normal.outputs[0], surface.inputs["Normal"])
            else:
                tree.links.new(texture.outputs["Color"], surface.inputs["Base Color" if channel == "albedo" else "Roughness"])
    scene = bpy.context.scene
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.17, .22, .27, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    for location, energy, color, size in (((-3, 2, 5), 650, (1, .76, .51), 3), ((4, 0, 4), 400, (.52, .76, 1), 4)):
        data = bpy.data.lights.new("QA_strip", "AREA")
        data.energy, data.color, data.shape, data.size, data.size_y = energy, color, "RECTANGLE", size, .55
        lamp = bpy.data.objects.new("QA_strip", data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (Vector((0, 0, 0)) - lamp.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("QA_camera")
    camera = bpy.data.objects.new("QA_camera", data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -6.6, 7.6)
    camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    data.type, data.ortho_scale = "ORTHO", 7.7
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 900, 580
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(options.provenance / "material-studio-preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    options = args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = SEED
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.render.bake.margin = 0
    scene.render.bake.normal_space = "TANGENT"
    scene.render.bake.normal_r = "POS_X"
    scene.render.bake.normal_g = "POS_Y"
    scene.render.bake.normal_b = "POS_Z"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    manifest = {"schemaVersion": 1, "generator": "scripts/build-rain-city-materials.py",
                "generatorSha256": digest(Path(__file__)), "seed": SEED,
                "blenderVersion": bpy.app.version_string, "engine": "CYCLES", "device": "CPU",
                "samples": 16, "resolution": options.resolution,
                "periodicity": "UV torus embedded in 4D noise; both axes analytic periodic",
                "normalConvention": "Tangent OpenGL +X +Y +Z", "assets": []}
    for name in ("concrete", "asphalt"):
        mat, output, surface, color, rough, repeat = material_for(name)
        bpy.ops.mesh.primitive_plane_add(size=repeat)
        plane = bpy.context.object
        plane.name = f"{name}_{repeat}m_UV_tile"
        plane.data.materials.append(mat)
        for channel, socket in (("albedo", color), ("normal", None), ("roughness", rough)):
            raw = options.provenance / f"{name}-{channel}-cycles.png"
            bake(plane, mat, output, surface, channel, socket, options.resolution, raw)
            dest = options.output / f"{name}-{channel}.{'webp' if channel == 'albedo' else 'png'}"
            data_resolution = min(512, options.resolution)
            encoder = "const sharp=require(process.argv[1]);let p=sharp(process.argv[2]).removeAlpha(); const c=process.argv[4],n=Number(process.argv[5]);if(c==='albedo')p=p.webp({quality:90,effort:6});else{p=p.resize({width:n,height:n,fit:'fill',kernel:'lanczos3'});if(c==='roughness')p=p.greyscale();p=p.png({compressionLevel:9});}p.toFile(process.argv[3]).catch(e=>{console.error(e);process.exit(1)});"
            subprocess.run([options.node, "-e", encoder, str(ROOT / "node_modules/sharp"), str(raw), str(dest), channel, str(data_resolution)], check=True)
            manifest["assets"].append({"path": f"/rain-city-materials/{dest.name}",
                                       "material": name, "channel": channel, "repeatMeters": repeat,
                                       "colorSpace": "sRGB" if channel == "albedo" else "Non-Color",
                                       "runtimeResolution": options.resolution if channel == "albedo" else data_resolution,
                                       "bytes": dest.stat().st_size, "sha256": digest(dest),
                                       "cyclesBakeSha256": digest(raw)})
        bpy.data.objects.remove(plane, do_unlink=True)
    preview(options)
    if not options.keep_bakes:
        # Only remove the six masters created above in this previously empty
        # output directory; never glob or clean an existing user directory.
        for name in ("concrete", "asphalt"):
            for channel in ("albedo", "normal", "roughness"):
                (options.provenance / f"{name}-{channel}-cycles.png").unlink()
    manifest["runtimeTotalBytes"] = sum(asset["bytes"] for asset in manifest["assets"])
    (options.provenance / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    runtime_manifest = {key: manifest[key] for key in (
        "schemaVersion", "generator", "generatorSha256", "normalConvention", "runtimeTotalBytes")}
    runtime_manifest["assets"] = [
        {key: value for key, value in asset.items() if key != "cyclesBakeSha256"}
        for asset in manifest["assets"]
    ]
    (options.output / "manifest.json").write_text(json.dumps(runtime_manifest, indent=2) + "\n")
    print(json.dumps({"baked": True, "runtimeTotalBytes": manifest["runtimeTotalBytes"]}))


if __name__ == "__main__":
    main()
