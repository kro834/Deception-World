"""Blender light rig for the cel look (lighting agent).

Run:  $SP/venv/bin/python pipeline/light/rig.py [--figure] [--no-passes]

Builds pipeline/light/rig.blend with
  * Figure      - decoded standard-v14 glb (decoded/standard-decoded.glb), front facing the camera
  * Rig         - camera-relative key / fill / rim sun lights + a banded "anime studio" world
  * MatcapStage - unit spheres (smooth + faceted) under an orthographic camera that frames r=1 exactly

All rig directions are defined in VIEW space (x right, y up, z towards the viewer), the same space as
lightrig.json and the matcap lookup. Front camera looks along Blender +Y, so
view (x, y, z)  ->  Blender (x, -z, y).

Then renders the linear passes the painter (paint.py) turns into cel matcaps:
  d_key, d_fill, d_rim   : white Lambert sphere lit by one light each
  g_env                  : glossy sphere reflecting only the banded world (anime metal bands)
  s_key, s_rim           : glossy sphere, specular from one light
  f_env, f_key           : faceted (low-poly icosphere) glossy sphere: gem facets for crystal
  raw_gold, raw_armor    : plain physically lit reference spheres (for the before/after sheet)
Passes go to pipeline/light/out/passes/*.exr (float, linear).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PASSES = os.path.join(OUT, 'passes')
FIGURE_GLB = os.path.join(HERE, 'decoded', 'standard-decoded.glb')
RES = 1024
THREADS = 2

# ---------------------------------------------------------------- the rig (view space)
RIG = json.load(open(os.path.join(HERE, 'rig_spec.json')))


def v2b(v):
    """view-space vector -> Blender world vector (front camera looks along +Y)."""
    x, y, z = v
    return Vector((x, -z, y)).normalized()


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4))


# ---------------------------------------------------------------- scene setup
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'  # linear passes, no filmic curve
    sc.view_settings.look = 'None'
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.filter_size = 1.0
    return sc


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)


def make_sun(name, spec, col):
    data = bpy.data.lights.new(name, 'SUN')
    data.color = hex_lin(spec['color'])
    data.energy = spec['blender_strength']
    data.angle = math.radians(spec['angle_deg'])
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    d = v2b(spec['dir'])
    # A sun shines along its local -Z, so point +Z at the light.
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    obj.location = d * 6.0
    return obj


def band_world(name, bands, strength=1.0, strips=None):
    """World whose radiance depends only on the ELEVATION of the direction (view-space y).

    bands: list of [elevation_deg_lower_edge, value] sorted ascending; constant interpolation
    gives hard-edged strip reflections, the classic painted-metal studio."""
    w = bpy.data.worlds.new(name)
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])  # world 'Generated' = direction
    # direction.z is sin(elevation) in [-1, 1]; ramp expects 0..1
    mapr = nt.nodes.new('ShaderNodeMapRange')
    mapr.inputs['From Min'].default_value = -1.0
    mapr.inputs['From Max'].default_value = 1.0
    nt.links.new(sep.outputs['Z'], mapr.inputs['Value'])
    nt.links.new(mapr.outputs['Result'], ramp.inputs['Fac'])
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    for i, (deg, val) in enumerate(bands):
        pos = (math.sin(math.radians(deg)) + 1) / 2
        e = els[0] if i == 0 else els.new(pos)
        if i == 0:
            e.position = 0.0
        e.color = (val, val, val, 1)
    color_out = ramp.outputs['Color']
    if strips:
        # Vertical strips by view-space x of the direction (Blender X): a bright softbox strip on the
        # key side and a dark flag on the far side, so left/right-facing planes split into light/dark.
        mx = nt.nodes.new('ShaderNodeMapRange')
        mx.inputs['From Min'].default_value = -1.0
        mx.inputs['From Max'].default_value = 1.0
        nt.links.new(sep.outputs['X'], mx.inputs['Value'])
        rx = nt.nodes.new('ShaderNodeValToRGB')
        rx.color_ramp.interpolation = 'CONSTANT'
        xe = rx.color_ramp.elements
        while len(xe) > 1:
            xe.remove(xe[-1])
        for i, (x, val) in enumerate(strips):  # val is a multiplier / 2
            e = xe[0] if i == 0 else xe.new((x + 1) / 2)
            if i == 0:
                e.position = 0.0
            e.color = (val, val, val, 1)
        nt.links.new(mx.outputs['Result'], rx.inputs['Fac'])
        mul = nt.nodes.new('ShaderNodeVectorMath')
        mul.operation = 'MULTIPLY'
        nt.links.new(ramp.outputs['Color'], mul.inputs[0])
        nt.links.new(rx.outputs['Color'], mul.inputs[1])
        color_out = mul.outputs['Vector']
        strength *= 2.0
    nt.links.new(color_out, bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return w


def mat_diffuse(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    d = nt.nodes.new('ShaderNodeBsdfDiffuse')
    d.inputs['Color'].default_value = (1, 1, 1, 1)
    nt.links.new(d.outputs[0], o.inputs['Surface'])
    return m


def mat_glossy(name, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    g = nt.nodes.new('ShaderNodeBsdfGlossy')
    g.inputs['Color'].default_value = (1, 1, 1, 1)
    g.inputs['Roughness'].default_value = rough
    nt.links.new(g.outputs[0], o.inputs['Surface'])
    return m


def mat_principled(name, base_hex, metallic, rough, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*hex_lin(base_hex), 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.05
    return m


def build():
    sc = reset()
    rig_col = collection('Rig')
    stage_col = collection('MatcapStage')
    fig_col = collection('Figure')

    lights = {k: make_sun(f'{k.capitalize()}Light', RIG[k], rig_col) for k in ('key', 'fill', 'rim')}

    worlds = {
        'studio': band_world('StudioBands', RIG['env']['bands'], RIG['env']['strength'], RIG['env'].get('strips')),
        'black': band_world('Black', [[-90, 0.0]], 0.0),
    }
    sc.world = worlds['studio']

    # --- matcap stage: ortho camera framing the unit sphere edge-to-edge
    cam_data = bpy.data.cameras.new('MatcapCam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.0
    cam = bpy.data.objects.new('MatcapCam', cam_data)
    stage_col.objects.link(cam)
    cam.location = (0, -10, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)  # looks along +Y, up = +Z
    cam_data.clip_end = 100

    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=1.0, location=(0, 0, 0))
    smooth = bpy.context.active_object
    smooth.name = 'SphereSmooth'
    bpy.ops.object.shade_smooth()
    link(smooth, stage_col)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(0, 0, 0))
    facet = bpy.context.active_object
    facet.name = 'SphereFacet'
    facet.rotation_euler = (math.radians(13), math.radians(7), math.radians(21))
    # Jitter the vertices so neighbouring facets tilt differently: the reflections break into a
    # gem-like mosaic instead of following the studio bands smoothly.
    import random
    rnd = random.Random(7)
    for vtx in facet.data.vertices:
        vtx.co = vtx.co * (1.0 + rnd.uniform(-0.07, 0.07)) + Vector((rnd.uniform(-1, 1) for _ in range(3))) * 0.035
    bpy.ops.object.shade_flat()
    link(facet, stage_col)

    mats = {
        'diffuse': mat_diffuse('M_WhiteLambert'),
        'glossy': mat_glossy('M_WhiteGloss', RIG['env']['gloss_roughness']),
        'facet': mat_glossy('M_FacetGloss', 0.02),
        'gold': mat_principled('M_RawGold', '#b07a48', 1.0, 0.28),
        'armor': mat_principled('M_RawArmor', '#0c0c10', 0.0, 0.35, coat=1.0),
    }

    # --- figure
    if '--figure' in sys.argv or '--save' in sys.argv:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=FIGURE_GLB)
        for ob in set(bpy.data.objects) - before:
            link(ob, fig_col)
        fig_cam_data = bpy.data.cameras.new('FigureCam')
        fig_cam_data.lens_unit = 'FOV'
        fig_cam_data.angle_y = math.radians(34)
        fig_cam_data.sensor_fit = 'VERTICAL'
        fig_cam = bpy.data.objects.new('FigureCam', fig_cam_data)
        rig_col.objects.link(fig_cam)
        fig_cam.location = (0, -2.05, 0.49 + 0.09 * 2.05)
        fig_cam.rotation_euler = (math.radians(90 - math.degrees(math.atan(0.09))), 0, 0)
        # Viewer's 'front' direction is [0, 0.09, 1]: camera slightly above, looking at the figure centre.
    return sc, lights, worlds, mats, smooth, facet, stage_col, fig_col


def render_pass(sc, name, obj_show, mat, lights_on, world, lights, stage_objs):
    for o in stage_objs:
        o.hide_render = o is not obj_show
    obj_show.data.materials.clear()
    obj_show.data.materials.append(mat)
    for k, l in lights.items():
        l.hide_render = k not in lights_on
    sc.world = world
    sc.camera = bpy.data.objects['MatcapCam']
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.image_settings.exr_codec = 'ZIP'
    path = os.path.join(PASSES, name + '.exr')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('pass', name, flush=True)


def main():
    os.makedirs(PASSES, exist_ok=True)
    sc, lights, worlds, mats, smooth, facet, stage_col, fig_col = build()
    for o in fig_col.objects:
        o.hide_render = True
    stage = [smooth, facet]
    if '--no-passes' not in sys.argv:
        S, F = smooth, facet
        jobs = [
            ('d_key', S, mats['diffuse'], ['key'], 'black'),
            ('d_fill', S, mats['diffuse'], ['fill'], 'black'),
            ('d_rim', S, mats['diffuse'], ['rim'], 'black'),
            ('g_env', S, mats['glossy'], [], 'studio'),
            ('s_key', S, mats['glossy'], ['key'], 'black'),
            ('s_rim', S, mats['glossy'], ['rim'], 'black'),
            ('f_env', F, mats['facet'], [], 'studio'),
            ('f_key', F, mats['facet'], ['key'], 'black'),
            ('raw_gold', S, mats['gold'], ['key', 'fill', 'rim'], 'studio'),
            ('raw_armor', S, mats['armor'], ['key', 'fill', 'rim'], 'studio'),
        ]
        only = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--only=')]
        for name, obj, mat, on, world in jobs:
            if only and name not in only[0].split(','):
                continue
            render_pass(sc, name, obj, mat, on, worlds[world], lights, stage)
    # leave the stage presentable in the saved file: smooth sphere, gold, full rig
    smooth.hide_render = False
    facet.hide_render = True
    smooth.data.materials.clear()
    smooth.data.materials.append(mats['gold'])
    for l in lights.values():
        l.hide_render = False
    sc.world = worlds['studio']
    sc.camera = bpy.data.objects['MatcapCam']
    sc.render.image_settings.file_format = 'PNG'
    if '--figure-render' in sys.argv and 'FigureCam' in bpy.data.objects:
        # proof render of the rig on the figure (low res, Cycles CPU, 2 threads)
        smooth.hide_render = True
        for o in fig_col.objects:
            o.hide_render = False
        sc.camera = bpy.data.objects['FigureCam']
        sc.render.film_transparent = False
        sc.render.resolution_x, sc.render.resolution_y = 450, 560
        sc.cycles.samples = 48
        sc.view_settings.view_transform = 'AgX'
        sc.render.filepath = os.path.join(OUT, 'figure_rig_cycles.png')
        bpy.ops.render.render(write_still=True)
        sc.render.resolution_x = sc.render.resolution_y = RES
        sc.view_settings.view_transform = 'Standard'
        sc.render.film_transparent = True
        sc.cycles.samples = 256
        smooth.hide_render = False
    if '--save' in sys.argv:
        tmp = os.path.join(HERE, 'rig.tmp.blend')
        bpy.ops.wm.save_as_mainfile(filepath=tmp, compress=True)
        os.replace(tmp, os.path.join(HERE, 'rig.blend'))
        print('saved rig.blend', flush=True)


if __name__ == '__main__':
    main()
