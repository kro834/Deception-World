"""Illusionculum's articulated optical nanite. Blender 4.5, Cycles.
Run: blender -b --factory-startup -P <this file> -- <output> [size=96]
Machined silver frame, dark ceramic back, dichroic glass and gold hinges.
24 physical rotations and six unfolding poses for each of four tone slots.
"""
import bpy
import math
import os
import sys
from mathutils import Quaternion, Vector
args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
px = int(args[1]) if len(args) > 1 else 96
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.cycles.seed = 27
sc.render.resolution_x = sc.render.resolution_y = px
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('optical studio')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.07,.09,.14,1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = .7

def mat(name, color, metal=0, rough=.2, emission=0, glass=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color,1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = glass
    b.inputs['IOR'].default_value = 1.6
    b.inputs['Coat Weight'].default_value = .45
    b.inputs['Emission Color'].default_value = (*color,1)
    b.inputs['Emission Strength'].default_value = emission
    return m
silver = mat('polished titanium',(.5,.61,.7),1,.16)
black = mat('ceramic underside',(.018,.031,.052),.7,.25)
gold = mat('gold hinge',(.8,.46,.12),.9,.19)
root = bpy.data.objects.new('articulated nanite',None)
sc.collection.objects.link(root)

def cube(name, location, scale, material, parent=root, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o=bpy.context.object
    o.name=name
    o.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.parent=parent
    o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('machined radii','BEVEL'); mod.width=bevel; mod.segments=3
        o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    return o
cube('load bearing ceramic', (0,0,-.08),(1.24,1.24,.24),black)
# Four articulated quadrants, with a silver bezel surrounding a glass facet.
panels=[]; lenses=[]
for i,(x,y) in enumerate([(-1,-1),(1,-1),(1,1),(-1,1)]):
    pivot=bpy.data.objects.new('hinge '+str(i),None);sc.collection.objects.link(pivot);pivot.parent=root
    pivot.location=(x*.12,y*.12,0)
    cube('silver frame', (x*.25,y*.25,.08),(.65,.65,.17),silver,pivot)
    lens=cube('optical facet',(x*.25,y*.25,.19),(.47,.47,.12),black,pivot,.035)
    cube('gold lock',(x*.46,y*.46,.2),(.105,.105,.09),gold,pivot,.015)
    panels.append((pivot,x,y));lenses.append(lens)
# The core is a recessed emitter, rather than an opaque glowing disk.
cube('core socket',(0,0,.17),(.34,.34,.1),gold)
core=cube('core die',(0,0,.24),(.18,.18,.06),black,bevel=.025)
for x,y in [(0,-.59),(.59,0),(0,.59),(-.59,0)]:
    cube('edge contact',(x,y,.12),(.13,.13,.05),gold,bevel=.012)
cam=bpy.data.cameras.new('camera'); cam.type='ORTHO';cam.ortho_scale=2.15
obj=bpy.data.objects.new('camera',cam);sc.collection.objects.link(obj);obj.location=(0,0,9);sc.camera=obj
for name,loc,power,size,color in [
 ('key',(-3,4,6),650,3,(1,.94,.83)),('rim',(4,1,3),800,2,(.36,.76,1)),
 ('pink',(-2,-4,2),450,2,(1,.35,.65)),('strip',(0,1,7),250,.6,(1,1,1))]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
 o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
axis=Vector((.45,.8,.4)).normalized()
for tone,col in [('ice',(.28,.79,1)),('pink',(.88,.3,.7)),('white',(.83,.91,1)),('gold',(1,.66,.2))]:
 optical=mat(tone+' dichroic',col,.36,.12,.28,.28)
 glow=mat(tone+' die',col,.1,.18,3)
 for lens in lenses: lens.data.materials.clear();lens.data.materials.append(optical)
 core.data.materials.clear();core.data.materials.append(glow)
 for f in range(24):
  root.rotation_mode='QUATERNION';root.rotation_quaternion=Quaternion(axis,2*math.pi*f/24)
  sc.render.filepath=os.path.join(out,f'tumble-{tone}-{f:02}.png');bpy.ops.render.render(write_still=True)
 root.rotation_quaternion=Quaternion((1,0,0,0))
 for k in range(1,7):
  q=k/6
  for pivot,x,y in panels:
   pivot.location=(x*(.12+.1*q),y*(.12+.1*q),-.035*q)
   pivot.rotation_euler=(y*math.sin(q*math.pi)*.2,x*math.sin(q*math.pi)*.2,0)
  sc.render.filepath=os.path.join(out,f'unfold-{tone}-{k}.png');bpy.ops.render.render(write_still=True)
 for pivot,x,y in panels: pivot.location=(x*.12,y*.12,0);pivot.rotation_euler=(0,0,0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'illusionculum-nanite.blend'))
print('ILLUSIONCULUM-NANITE-DONE')
