#!/bin/sh
# Stage-2 proof set, three-way: source | P1 (+keep) | P1 + cuts
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python; O=$SP/pipeline/cel/out
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
cd "$(dirname "$0")"; S="src,$O/paintcel,$O/paintcel2"
for v in "front 0" "rear 180" "side 90" "q35 35" "q215 215"; do set -- $v; $PY celproof.py detail s2_$1 $2 --res 900 --sets $S; done
$PY celproof.py detail s2_chest 0 0 0.68 0.1 0.19 --res 900 --sets $S
$PY celproof.py detail s2_face 0 0 0.86 0.1 0.11 --res 900 --sets $S
$PY celproof.py detail s2_belt 0 0 0.54 0.1 0.19 --res 900 --sets $S
$PY celproof.py detail s2_belt_rear 180 0 0.5 0 0.19 --res 900 --sets $S
$PY celproof.py detail s2_ring 0 -0.12 0.72 0.1 0.06 --res 900 --sets $S
$PY celproof.py detail s2_horn 0 0.03 0.9 0.1 0.06 --res 900 --sets $S
$PY celproof.py detail s2_orb 0 0 0.68 0.14 0.035 --res 900 --sets $S
$PY celproof.py detail s2_drape 0 -0.2 0.32 0.1 0.05 --res 900 --sets $S
