"""Stage 2: per-vertex ambient occlusion with Cycles (bpy), baked to a POINT-domain colour attribute
on the welded mesh of each textured primitive. All 12 glTF primitives are present as occluders.
Usage: python ao.py <mode> [samples] [only,comma,list]
"""
import os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
import bpy

MODE = sys.argv[1] if len(sys.argv) > 1 else 'detail'
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 256
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None
C = os.path.join(B.HERE, 'cache')
# AO ray distance per material (metres). Figure is ~0.98 tall. Long enough to darken creases between
# plates/scales and the insides of folds, short enough that open surfaces stay white.
DIST = {'body': 0.025, 'helmet': 0.010, 'buckle': 0.006, 'clasp': 0.008, 'chest': 0.010}


def make_obj(name, P, F, N=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(P)); me.vertices.foreach_set('co', P.astype(np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F))
    me.polygons.foreach_set('loop_start', (np.arange(len(F)) * 3).astype(np.int32))
    me.update(); me.validate(clean_customdata=False)
    if N is not None:
        try:
            me.normals_split_custom_set_from_vertices(N.astype(np.float32))
        except Exception as e:
            print('custom normals failed', e)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.threads_mode = 'FIXED'; sc.render.threads = 2
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    world = bpy.data.worlds.new('W'); sc.world = world
    mat = bpy.data.materials.new('M'); mat.use_nodes = True

    g, prims = B.load_gltf(MODE)
    # occluders: every primitive except the textured target being baked (the target is added welded)
    targets = {}
    occ = []
    for i, p in enumerate(prims):
        s = B.SHORT.get(p['material'])
        if s is not None:
            d = np.load(os.path.join(C, f'geom_{MODE}_{s}.npz'))
            ob = make_obj('T_' + s, d['P'], d['F'], d['N'])
            targets[s] = ob
        else:
            ob = make_obj(f'O_{i}', p['pos'], p['idx'])
        ob.data.materials.append(mat)
    for s, ob in targets.items():
        if ONLY and s not in ONLY:
            continue
        t0 = time.time()
        world.light_settings.distance = DIST[s]
        me = ob.data
        attr = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = attr
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        a = np.empty(len(me.vertices) * 4, np.float32); attr.data.foreach_get('color', a)
        ao = a.reshape(-1, 4)[:, 0].copy()
        np.savez_compressed(os.path.join(C, f'ao_{MODE}_{s}.npz'), ao=ao, dist=DIST[s], samples=SAMPLES)
        print(f'{s:7s} AO dist {DIST[s]} samples {SAMPLES}: pct', np.round(np.percentile(ao, [1, 5, 25, 50, 75]), 3),
              f'{time.time()-t0:.1f}s', flush=True)


if __name__ == '__main__':
    main()
