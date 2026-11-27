#!/bin/sh
# Re-run the linework bake. Needs the bake agent's decoded models (pipeline/bake/dec) and welded-mesh
# caches (pipeline/bake/cache/geom_detail_*.npz) — read only. 2 threads everywhere. ~10 min.
set -e
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
cd "$(dirname "$0")"
$PY surf.py body helmet chest          # frame tensors (armour: vertical/long axis; crystal: long axis)
$PY lattice.py body helmet chest       # stripe families (scale rhombi R; facet streaks G)
$PY linebake.py body 2048 body 1024 helmet 2048 helmet 1024 chest 2048 chest 1024
$PY deliver.py --stage-only            # out/ (lossless WebP + lines.json)
$PY check.py body 2048 out 0.00068 0.00048
$PY check.py body 1024 out 0.0012 0.0010
$PY deliver.py                         # atomic copy into work/model-v15/, lines.json last
