"""Mask stage A2: local thickness per subdivided vertex = distance along -N to the same part's surface
(mathutils BVH ray cast, max 0.1; miss = open sheet -> 0). Thin blades/drapes/petals vs thick torso/limbs.
Writes cache/mthick_<short>.npy"""
import os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakelib as B
import bpy  # noqa: F401  (makes mathutils importable)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
C = os.path.join(B.HERE, 'cache')
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None
for mat in B.TEXTURED:
    s = B.SHORT[mat]
    if ONLY and s not in ONLY: continue
    t0 = time.time()
    g = np.load(os.path.join(C, f'geom_detail_{s}.npz'))
    d = np.load(os.path.join(C, f'mfeat_{s}.npz'))
    bvh = BVHTree.FromPolygons(g['P'].tolist(), g['F'].tolist(), all_triangles=True, epsilon=0.0)
    P = d['P']; N = d['N']
    O = P - N * 2e-4
    out = np.empty(len(P), np.float32)
    rc = bvh.ray_cast
    for i in range(len(P)):
        hit = rc(Vector(O[i]), Vector(-N[i]), 0.1)
        out[i] = hit[3] if hit[0] is not None else 0.0
    np.save(os.path.join(C, f'mthick_{s}.npy'), out)
    print(s, 'thickness pct', np.round(np.percentile(out, [5, 25, 50, 75, 95]) * 1000, 1), 'mm', f'{time.time()-t0:.0f}s', flush=True)
