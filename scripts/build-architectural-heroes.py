#!/usr/bin/env python3
"""Create original, artwork-free architectural photographic plates with Cycles.

Run through Blender, not a stand-alone Python interpreter. Physical dimensions
are metres; no artwork, text, outside models, or third-party textures are used.
All visible materials are procedural, lit in an enclosed, modelled space.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SEED = 7102026


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def options():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--width', type=int, default=2560)
    parser.add_argument('--height', type=int, default=1600)
    parser.add_argument('--samples', type=int, default=192)
    parser.add_argument('--scene', choices=('world', 'dream', 'both'), default='both')
    parser.add_argument('--runtime-output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    args.output = args.output.resolve()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error('Output must be absent or empty; preserve earlier review batches.')
    if not 640 <= args.width <= 6000 or not 400 <= args.height <= 6000:
        parser.error('Supported dimensions are 640..6000 x 400..6000')
    if not 16 <= args.samples <= 1024:
        parser.error('Samples must be 16..1024')
    if args.runtime_output:
        args.runtime_output = args.runtime_output.resolve()
        if args.runtime_output.exists() and any(args.runtime_output.iterdir()):
            parser.error('Runtime output must be absent or empty.')
        if args.width < 2560 or args.height < 1600:
            parser.error('Runtime images require a full-resolution 2560 x 1600 master.')
    return args


def material(name, color, roughness=.5, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat, bsdf


def surface(mat, bsdf, colors, scale=4, bump=.0004, roughness=(.5, .65), stretch=(1, 1, 1), variation=False):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = stretch
    links.new(coord.outputs['Object'], mapping.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 5
    noise.inputs['Roughness'].default_value = .68
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*colors[0], 1)
    ramp.color_ramp.elements[1].color = (*colors[1], 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    if variation:
        info = nodes.new('ShaderNodeObjectInfo')
        amount = nodes.new('ShaderNodeMapRange')
        amount.inputs['To Min'].default_value = .83
        amount.inputs['To Max'].default_value = 1.1
        links.new(info.outputs['Random'], amount.inputs['Value'])
        mix = nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1
        links.new(ramp.outputs['Color'], mix.inputs[1])
        links.new(amount.outputs['Result'], mix.inputs[2])
        links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    micro = nodes.new('ShaderNodeTexNoise')
    micro.inputs['Scale'].default_value = 240
    micro.inputs['Detail'].default_value = 3
    links.new(mapping.outputs['Vector'], micro.inputs['Vector'])
    relief = nodes.new('ShaderNodeBump')
    relief.inputs['Strength'].default_value = .2
    relief.inputs['Distance'].default_value = bump
    links.new(micro.outputs['Fac'], relief.inputs['Height'])
    links.new(relief.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = roughness[0]
    rough.inputs['To Max'].default_value = roughness[1]
    links.new(noise.outputs['Fac'], rough.inputs['Value'])
    links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])


def box(name, location, size, mat, bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Real_edge_radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.harden_normals = True
        obj.modifiers.new('Weighted_normals', 'WEIGHTED_NORMAL')
    return obj


def cylinder(name, location, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Edge_softness', 'BEVEL')
    bevel.width = .003
    bevel.segments = 3
    obj.modifiers.new('Weighted_normals', 'WEIGHTED_NORMAL')
    return obj


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, target, energy, color, size, height=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = height if height is not None else size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def emissive(name, color, power):
    mat, bsdf = material(name, color)
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = power
    return mat


def reset(args, kind):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    # Metal is preferred when the official build exposes this device. CPU is
    # deterministic and supported as a fallback, never an installation action.
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        gpus = [device for device in prefs.devices if device.type == 'METAL']
        if gpus:
            for device in prefs.devices:
                device.use = device.type == 'METAL'
            scene.cycles.device = 'GPU'
    except (TypeError, AttributeError, RuntimeError):
        pass
    scene.cycles.seed = SEED
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .012
    scene.cycles.max_bounces = 12
    scene.cycles.diffuse_bounces = 6
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 8
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -.35 if kind == 'world' else -.35
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.52, .65, .8, 1)
    background.inputs['Strength'].default_value = .25
    bpy.ops.object.camera_add(location=(.0, -8.3, 2.25))
    camera = bpy.context.object
    camera.name = 'Architectural_two_point_camera'
    camera.data.lens = 24
    camera.data.sensor_width = 36
    camera.data.clip_end = 100
    camera.data.dof.use_dof = False
    aim(camera, (0, 5.1, 2.25))
    scene.camera = camera
    scene['Artwork_preservation'] = 'Architecture only. No artwork, writing, or user image pixels are embedded.'
    scene['Scale'] = 'Metres; floor slabs, joinery, recesses and window mullions modelled at architectural scale.'
    return scene


def world(args):
    scene = reset(args, 'world')
    plaster, bsdf = material('Charcoal_limewash', (.063, .068, .07), .91)
    surface(plaster, bsdf, ((.045, .048, .05), (.081, .083, .08)), scale=.9, bump=.0015, roughness=(.83, .94))
    stone, bsdf = material('Honed_basalt_slab', (.11, .115, .115), .32)
    surface(stone, bsdf, ((.06, .065, .064), (.105, .11, .105)), scale=2.8, bump=.00015, roughness=(.14, .24), variation=True)
    bronze, bsdf = material('Satin_architectural_bronze', (.32, .19, .075), .27, .85)
    surface(bronze, bsdf, ((.23, .12, .047), (.36, .23, .1)), scale=7, bump=.00005, roughness=(.24, .32), stretch=(1, 1, 45))
    black, _ = material('Anodized_black_recess', (.012, .014, .016), .48, .35)
    exterior, bsdf = material('Weathered_courtyard_concrete', (.38, .39, .37), .8)
    surface(exterior, bsdf, ((.31, .325, .32), (.47, .47, .43)), scale=1.5, bump=.001)
    glass, bsdf = material('Low_iron_window_glass', (.93, .98, 1), .015)
    bsdf.inputs['Transmission Weight'].default_value = 1
    bsdf.inputs['IOR'].default_value = 1.45
    light_strip = emissive('Warm_cove_diffuser', (1, .74, .43), 4)
    box('Foundation_shadow_joint', (0, -.5, -.12), (14, 15, .2), black)
    for row in range(10):
        for col in range(8):
            box(f'Basalt_slab_{row}_{col}', (-6.12 + col * 1.75, -7.5 + row * 1.4, -.025), (1.745, 1.395, .05), stone, .002)
    box('Quiet_continuous_gallery_wall', (0, 5.15, 3), (14, .28, 6), plaster, .006)
    box('Wall_shadow_reveal', (0, 4.99, .055), (14, .05, .065), black, .002)
    box('Bronze_skirting', (0, 4.975, .015), (14, .018, .025), bronze, .001)
    box('Right_solid_return', (7, -.6, 3), (.25, 11.5, 6), plaster)
    box('Ceiling_dark_soffit', (0, -.6, 5.2), (14, 11.5, .2), plaster)
    box('Ceiling_recess', (0, 4.5, 5.08), (13.9, .7, .05), black)
    box('Ceiling_cove_diffuser', (0, 4.78, 5.065), (12.8, .045, .025), light_strip, .001)
    area('Cove_bounce_to_wall', (0, 4.73, 5.03), (0, 5, 2.5), 180, (1, .74, .43), 12, .15)
    # A real, glazed side wall makes both the light source and its reflection
    # legible. Mullions interrupt the sun rather than painting fake shadows.
    for bay in range(7):
        y = -5.5 + bay * 1.5
        box(f'Bronze_window_mullion_{bay}', (-6.75, y, 2.5), (.1, .075, 5), bronze, .007)
        if bay < 6:
            box(f'Low_iron_window_pane_{bay}', (-6.76, y + .75, 2.5), (.018, 1.425, 4.8), glass, .001)
    for z in (.15, 4.93):
        box('Bronze_window_header_sill', (-6.75, -1, z), (.13, 10.5, .11), bronze, .005)
    box('Courtyard_ground', (-9.1, -.6, -.1), (4.6, 16, .1), exterior)
    box('Courtyard_outer_wall', (-10.5, 1.4, 2.2), (.3, 13, 4.4), exterior)
    for y in (-4.7, -1.5, 1.7, 4.9):
        box('Courtyard_vertical_reveal', (-10.32, y, 2.2), (.025, .02, 4.4), black, 0)
    # Right-hand bronze pilasters and a built-in ledge create quiet foreground
    # parallax cues, leaving the middle 72 percent free for original works.
    for y in (-1.8, .9, 3.6):
        box('Bronze_right_pilaster', (6.78, y, 2.6), (.1, .16, 5.2), bronze, .004)
    box('Solid_basalt_bench_seat', (5.55, 2.2, .48), (2.65, 1.05, .14), stone, .018)
    for x in (4.5, 6.6):
        box('Bench_bronze_leg', (x, 2.2, .21), (.07, .78, .42), bronze, .006)
    # The finite aperture is outside the glazing, with camera-side sky fill.
    area('Window_soft_daylight', (-7.4, -.8, 3.6), (1.2, 3, 1.6), 1100, (.77, .87, 1), 8, 3.8)
    area('Subtle_camera_bounce', (0, -6.8, 4.3), (0, 5, 2.3), 180, (.83, .88, 1), 8, 3)
    data = bpy.data.lights.new('Late_afternoon_sun', 'SUN')
    data.energy = 2.15
    data.angle = .012
    data.color = (1, .8, .54)
    sun = bpy.data.objects.new('Late_afternoon_sun', data)
    bpy.context.collection.objects.link(sun)
    sun.location = (-10, -4, 5.3)
    aim(sun, (2, 3, 0))
    return scene


def dream(args):
    scene = reset(args, 'dream')
    plaster, bsdf = material('Clay_lime_plaster', (.24, .20, .15), .91)
    surface(plaster, bsdf, ((.2, .17, .13), (.3, .255, .19)), scale=.8, bump=.0013, roughness=(.85, .95))
    timber, bsdf = material('Oiled_smoked_oak_joinery', (.16, .083, .031), .4)
    surface(timber, bsdf, ((.068, .028, .009), (.24, .12, .036)), scale=3.8, bump=.0002, roughness=(.31, .48), stretch=(7, 1, 7))
    floor, bsdf = material('Wide_fumed_oak_floor', (.13, .069, .03), .32)
    surface(floor, bsdf, ((.055, .025, .009), (.22, .118, .047)), scale=4.8, bump=.0002, roughness=(.24, .4), stretch=(10, 1, 3), variation=True)
    stone, bsdf = material('Flamed_granite_threshold', (.19, .19, .17), .65)
    surface(stone, bsdf, ((.13, .14, .13), (.29, .28, .24)), scale=15, bump=.0008, roughness=(.5, .7))
    recess, _ = material('Shadow_gaps', (.012, .009, .006), .6)
    paper, bsdf = material('Handmade_washi', (.77, .69, .51), .85)
    surface(paper, bsdf, ((.6, .53, .4), (.88, .83, .68)), scale=240, bump=.00012, roughness=(.79, .93))
    bsdf.inputs['Subsurface Weight'].default_value = .18
    bsdf.inputs['Subsurface Radius'].default_value = (.004, .003, .002)
    bsdf.inputs['Emission Color'].default_value = (1, .81, .55, 1)
    bsdf.inputs['Emission Strength'].default_value = .16
    silk = emissive('Lantern_warm_washi_diffuser', (1, .79, .47), 1.7)
    copper, _ = material('Patinated_lantern_brass', (.19, .10, .045), .37, .78)
    box('Continuous_floor_shadow_gap', (0, -.5, -.12), (14, 15, .2), recess)
    for row in range(6):
        for col in range(28):
            box(f'Oak_floor_board_{row}_{col}', (-6.75 + col * .5, -6.8 + row * 2.4, -.026), (.496, 2.394, .05), floor, .0015)
    box('Uninterrupted_warm_gallery_wall', (0, 5.15, 2.85), (14, .3, 5.7), plaster)
    box('Backwall_shadow_base', (0, 4.97, .07), (14, .055, .10), recess, .001)
    box('Oak_foot_rail', (0, 4.94, .022), (14, .08, .036), timber, .002)
    box('Ceiling_backing', (0, -.7, 5), (14, 12, .16), recess)
    for x in range(-18, 19):
        box(f'Oak_ceiling_batten_{x}', (x * .37, -.7, 4.9), (.072, 12, .11), timber, .002)
    box('Right_clay_return', (7, -.7, 2.5), (.24, 12, 5), plaster)
    # Luminous left shoji panels have wood grids, paper microtexture and an
    # exterior light source, not a flat self-lit white rectangle.
    for bay in range(7):
        y = -5.7 + bay * 1.5
        box('Shoji_post', (-6.6, y, 2.45), (.16, .14, 4.9), timber, .005)
        if bay < 6:
            box('Washi_shoji_sheet', (-6.63, y + .75, 2.4), (.012, 1.36, 4.65), paper, .001)
            for index in range(1, 4):
                box('Shoji_vertical_lattice', (-6.55, y + index * .375, 2.4), (.038, .021, 4.65), timber, .001)
            for index in range(1, 9):
                box('Shoji_horizontal_lattice', (-6.53, y + .75, index * .52), (.05, 1.38, .022), timber, .001)
    for z in (.10, 4.79):
        box('Shoji_track', (-6.57, -1.2, z), (.2, 10.5, .12), timber, .004)
    box('Garden_stone_border', (-6.05, -1, -.005), (.82, 11, .06), stone, .008)
    for y in (-2, 1.2, 4.5):
        box('Right_oak_structural_post', (6.72, y, 2.48), (.2, .22, 4.95), timber, .008)
    box('Stone_sitting_ledge', (5.7, 2.85, .41), (2.2, 1.1, .18), stone, .017)
    box('Stone_ledge_shadow_plinth', (5.7, 2.85, .145), (1.9, .88, .29), recess, .01)
    # Sculptural, real paper cylinders remain at the far right edge and cast
    # a warm reflection on the floor without occupying the overlay art zone.
    for x, y, z, radius, length in ((5.9, 1.8, 3.65, .31, 1.05), (6.25, 3.7, 3.9, .22, .7)):
        cylinder('Paper_lantern', (x, y, z), radius, length, silk)
        for index in range(15):
            ring = cylinder('Paper_lantern_bamboo_rib', (x, y, z - length / 2 + index * length / 14), radius + .006, .009, timber)
        cylinder('Lantern_brass_crown', (x, y, z + length / 2), radius * .25, .035, copper)
        cylinder('Lantern_hanging_wire', (x, y, (z + length / 2 + 4.87) / 2), .005, 4.87 - z - length / 2, copper, 12)
        area('Lantern_warm_floor_pool', (x, y, z - length / 2 - .01), (x, y, 0), 45, (1, .7, .36), .4)
    area('Shoji_daylight', (-6.35, -.2, 3), (1, 4, 1.7), 1500, (1, .88, .67), 8, 3.8)
    area('Open_portal_soft_fill', (0, -6, 3.4), (0, 5, 2), 330, (.8, .86, 1), 7, 3)
    area('Ceiling_warm_wallwash', (0, 4.7, 4.7), (0, 5, 2), 250, (1, .73, .42), 11, .12)
    return scene


def compose_tall_atrium(scene):
    """A 7.5 m hall fits a tall hero without cropping out the side glazing.

    Furniture and slabs retain their real dimensions; full-height construction
    rises to the tall ceiling and hanging lanterns become proportionally taller.
    """
    for obj in scene.objects:
        if obj.type == 'MESH':
            if obj.dimensions.z > 3 or obj.name.startswith(('Lantern_hanging_wire', 'Paper_lantern')):
                obj.location.z *= 1.5
                obj.scale.z *= 1.5
            elif obj.location.z > 3:
                obj.location.z *= 1.5
        elif obj.type == 'LIGHT' and obj.data.type != 'SUN':
            obj.location.z *= 1.5
    scene.camera.location.z = 3.2
    aim(scene.camera, (0, 5.1, 3.2))
    scene['Ceiling_height'] = '7.5 metres; architectural atrium, furniture retained at human scale'


def main():
    args = options()
    args.output.mkdir(parents=True)
    outputs = {}
    for kind in ('world', 'dream') if args.scene == 'both' else (args.scene,):
        scene = world(args) if kind == 'world' else dream(args)
        compose_tall_atrium(scene)
        blend = args.output / f'{kind}-atrium.blend'
        image = args.output / f'{kind}-atrium.png'
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        scene.render.filepath = str(image)
        bpy.ops.render.render(write_still=True)
        outputs[kind] = {
            'blend': blend.name, 'blendSha256': digest(blend),
            'image': image.name, 'imageSha256': digest(image),
            'resolution': [args.width, args.height], 'samples': args.samples,
            'device': scene.cycles.device,
            'overlayZone': {'x': [.14, .86], 'y': [.15, .78]},
        }
    manifest = {
        'version': 1, 'generator': 'scripts/build-architectural-heroes.py',
        'sourceSha256': digest(Path(__file__)), 'blender': bpy.app.version_string,
        'engine': 'Cycles', 'seed': SEED, 'viewTransform': 'AgX',
        'artworkPolicy': 'No user artwork, text or outside image is embedded. Original work must remain a separate unmodified UI image.',
        'materialPolicy': 'Original physically scaled geometry with procedural materials only; no third-party assets.',
        'outputs': outputs,
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    if args.runtime_output:
        node = shutil.which('node')
        if not node:
            raise RuntimeError('Node and the existing project sharp dependency are required for WebP delivery.')
        args.runtime_output.mkdir(parents=True, exist_ok=True)
        # This is encoding of generated renders, not image editing or repainting
        # of user artwork. Sharp is already a locked project dependency.
        encoder = """
const sharp = require('sharp');
const [source, output, size] = process.argv.slice(1);
sharp(source).resize({width:Number(size),withoutEnlargement:true})
  .webp({quality:92,effort:6,smartSubsample:true}).toFile(output)
  .catch(error=>{console.error(error);process.exitCode=1;});
"""
        assets = {}
        for kind in outputs:
            for width in (1280, 2560):
                target = args.runtime_output / f'{kind}-{width}.webp'
                subprocess.run([node, '-e', encoder, str(args.output / outputs[kind]['image']), str(target), str(width)], cwd=ROOT, check=True)
                assets[target.name] = {'sha256': digest(target), 'bytes': target.stat().st_size, 'width': width, 'height': round(width * args.height / args.width)}
        runtime = dict(manifest)
        runtime['assets'] = assets
        runtime['sourceManifest'] = str(args.output.relative_to(ROOT) / 'manifest.json')
        runtime['encoding'] = {'format': 'WebP', 'quality': 92, 'effort': 6, 'smartSubsample': True}
        (args.runtime_output / 'manifest.json').write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
