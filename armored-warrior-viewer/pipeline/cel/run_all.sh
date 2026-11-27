#!/bin/sh
# Cel paint: stage 1 (P1 flatten + keep rule) and stage 2 (gold 3-tone cut, crystal half-cut). ~25 min, 2 threads.
# Re-run after the bake agent replaces paintfix_* (the P1 flatten cache is invalidated by the source's mtime).
set -e
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
cd "$(dirname "$0")"
$PY celgeo.py body helmet chest      # only needed when the mesh changes
$PY celflat.py body helmet chest     # -> out/paintcel_*  (+ cache/flat_*, keep_*)
$PY celcut.py body helmet chest      # -> out/paintcel2_*
$PY celcheck.py body helmet chest
$PY keepcheck.py body out/paintcel_body_2560.webp
sh proofs2.sh
sh deliver.sh
