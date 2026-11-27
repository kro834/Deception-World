#!/bin/sh
# Re-run the whole bake. Stage order matters (ink reads compose output). 2 threads everywhere.
set -e
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python; G=$SP/node/node_modules/.bin/gltf-transform
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
cd "$(dirname "$0")"
mkdir -p dec/std dec/det
$G dequantize $SP/site/model-v10/standard-v14.glb dec/std/m.gltf   # also decodes meshopt
$G dequantize $SP/site/model-v10/detail-v14.gltf dec/det/m.gltf
$PY check_uv.py            # standard vs detail UV layout (IoU) + proofs/uvcmp_*.png
$PY geom.py detail         # welded mesh: curvature + toon normals -> cache/geom_detail_*.npz
$PY ao.py detail 256       # Cycles AO per vertex -> cache/ao_detail_*.npz  (~4 min)
$PY compose.py             # first pass (ink.py needs style G + coverage masks)
$PY ink.py
$PY compose.py ink         # final maps -> out/
$PY proof_maps.py standard out 0,180
$PY proof_maps.py detail out 0,180
$PY deliver.py             # atomic copy into work/model-v15/
