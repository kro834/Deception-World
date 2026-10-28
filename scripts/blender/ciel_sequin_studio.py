"""Physical studio reflection panorama for Ciel's Three.js sequins.

Blender 4.5 / Cycles CPU. No owner artwork is included in this scene.
blender -b --factory-startup -P scripts/blender/ciel_sequin_studio.py -- OUTPUT
The lightweight equirectangular bake is used only after the inferno has ended.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.cycles.seed = 28
scene.render.resolution_x = 768
scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('Low emerald studio ambient')
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.009, .016, .014, 1)
background.inputs['Strength'].default_value = .35


def material(name, color, roughness=.45, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat


def panel(name, location, size, mat, target=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('Z', 'Y').to_euler()
    obj.scale = (*size, 1)
    obj.data.materials.append(mat)
    return obj


shell = material('Emerald charcoal acoustic wall', (.012, .025, .022), .8)
floor = material('Brushed graphite floor', (.035, .047, .044), .27, .4)
white = material('Large neutral silk diffusion', (.78, .9, .86), emission=2.4)
cool = material('Cool narrow softbox', (.42, .67, .75), emission=1.5)
warm = material('Champagne edge strip', (.65, .48, .26), emission=1.25)
green = material('Muted emerald bounce card', (.025, .12, .075), emission=.8)

# Large enclosed surfaces make the darker reflections contain real bounced
# light rather than a painted gradient. Camera sits at the eventual tile centre.
panel('Floor', (0, 0, -5), (30, 30), floor)
panel('Ceiling', (0, 0, 8), (30, 30), shell)
for name, pos in [('North', (0, 12, 1)), ('South', (0, -12, 1)),
                  ('East', (12, 0, 1)), ('West', (-12, 0, 1))]:
    panel(name + ' wall', pos, (30, 22), shell)

# Unequal broad and narrow softboxes give a rolling metallic highlight as a
# disc turns. Their panel geometry is visible in the panorama and its bounce.
panel('Main silk softbox', (-4, 7, 5), (4.4, 7.0), white)
panel('Cool overhead strip', (6, 2, 6), (1.0, 7.5), cool)
panel('Warm rim strip', (-7, -4, 3), (.7, 6.0), warm)
panel('Emerald broad return', (5, -8, 1), (5.0, 5.5), green)
panel('Low neutral card', (2, 6, -2), (2.5, 1.3), white)

bpy.ops.object.camera_add(location=(0, 0, 0))
camera = bpy.context.object
camera.name = 'Sequin centre equirectangular capture'
camera.rotation_euler = Vector((0, 1, 0)).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'PANO'
camera.data.panorama_type = 'EQUIRECTANGULAR'
scene.camera = camera
scene.render.filepath = os.path.join(out, 'studio.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'ciel-sequin-studio.blend'))
bpy.ops.render.render(write_still=True)
