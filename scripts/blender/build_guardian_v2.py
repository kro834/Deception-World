"""Rebuild the authored guardian from source using an actual Blender binary.

Usage: python3 scripts/blender/build_guardian_v2.py --blender /path/to/blender
All generated assets stay in output/dogs-archive/rebuild-v2; this never publishes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
STAGES = [
    "dogs_guardian_v2.py",
    "dogs_guardian_v2_finish.py",
    "dogs_guardian_v2_head_junction.py",
    "dogs_guardian_v2_optimize.py",
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", default=shutil.which("blender"))
    parser.add_argument("--from-stage", choices=["base", "finish", "junction", "optimize"], default="base")
    args = parser.parse_args()
    if not args.blender:
        parser.error("Provide the actual Blender executable with --blender")
    out = ROOT / "output/dogs-archive/rebuild-v2"
    out.mkdir(parents=True, exist_ok=True)
    start = ["base", "finish", "junction", "optimize"].index(args.from_stage)
    record = {"started": time.time(), "blender": str(args.blender), "stages": []}
    for name in STAGES[start:]:
        script = ROOT / "scripts/blender" / name
        log = out / (script.stem + ".log")
        begin = time.time()
        with log.open("w") as stream:
            subprocess.run([str(args.blender), "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(script)], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, check=True)
        record["stages"].append({"script": str(script.relative_to(ROOT)), "sha256": hashlib.sha256(script.read_bytes()).hexdigest(), "seconds": time.time()-begin, "log": str(log.relative_to(ROOT))})
        (out / "regeneration.json").write_text(json.dumps(record, indent=2))
        print(f"Completed {name}: {time.time()-begin:.1f}s", flush=True)

if __name__ == "__main__":
    main()
