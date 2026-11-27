#!/bin/sh
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python; O=$SP/pipeline/cel/out
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 DIFF=1
cd "$(dirname "$0")"; S="$O/paintcel2,$O/paintcel3"
$PY celproof.py detail r_belt_rear 180 0 0.6 0 0.2 --res 800 --sets $S
for v in "rear 180" "rear34 215" "rear34b 145" "front 0"; do set -- $v; $PY celproof.py detail r_$1 $2 --res 900 --sets $S; done
$PY celproof.py detail r_drape_rear 200 0.1 0.3 0 0.14 --res 900 --sets $S
