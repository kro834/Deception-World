#!/bin/bash
# One command for the final run: mapping from the manifest -> pack (lossless emissive) -> assemble -> zip (+verify).
# Needs the static server on :8765 and Playwright. Takes ~10-15 minutes under software GL. Publishes nothing.
set -e
cd "$(dirname "$0")/../.."
export NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules}
venv/bin/python tools/pack/mapping_from_manifest.py
venv/bin/python tools/pack/pack_models.py --src work/model-v10 --out pack-out/model-v15 \
  --mapping tools/pack/mapping.from-manifest.json --emissive-webp lossless
venv/bin/python -u tools/pack/assemble.py
venv/bin/python tools/pack/make_zip.py --verify
