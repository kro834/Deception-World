#!/bin/sh
# One iteration: bake paintcel4, point the test page at it, capture belt-rear / rear / rear34 (desktop) + phone rear.
# usage: sh pass4.sh <n>
set -e
SP=$(cd "$(dirname "$0")/../.." && pwd); PY=$SP/venv/bin/python; N=${1:-1}
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
cd "$(dirname "$0")"
$PY celrear4.py
cd page/model-v15
for r in 2560 2048; do ln -sf ../../out/paintcel4_body_$r.webp .; done
sed 's/paintcel2_body_/paintcel4_body_/g' $SP/work/model-v15/manifest.json > manifest.json.tmp && mv manifest.json.tmp manifest.json
cd $SP
node tools/shot.cjs --url "http://localhost:8765/pipeline/cel/page/?v=$N$$" --out shots/cel-04-p$N --views belt-rear,rear --orbits rear34:215:82 || \
node tools/shot.cjs --url "http://localhost:8765/pipeline/cel/page/?v=$N$$" --out shots/cel-04-p$N --views belt-rear,rear --orbits rear34:215:82
