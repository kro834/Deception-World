#!/bin/sh
# Atomic copy of out/paintcel_* (stage 1, live) and out/paintcel2_* (stage 2) into work/model-v15/.
set -e
D=$(cd "$(dirname "$0")/../.." && pwd)/work/model-v15
cd "$(dirname "$0")/out"
for f in paintcel_*_2560.webp paintcel_*_2048.webp paintcel2_*_2560.webp paintcel2_*_2048.webp; do cp "$f" "$D/.tmp-$f"; mv "$D/.tmp-$f" "$D/$f"; echo "$D/$f"; done
