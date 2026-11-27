#!/usr/bin/env python3
"""Write a packing mapping from the manifest: every material/mode whose `paint` has `paintForce: true`
(those are replaced unconditionally at run time, so embedding them changes nothing visible).
  mapping_from_manifest.py [--manifest work/model-v15/manifest.json] [--out tools/pack/mapping.from-manifest.json]
Paths are absolute and read by pack_models.py when it runs. Re-generate before every pack."""
import argparse, json, os, sys
SP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('--manifest', default=os.path.join(SP, 'work', 'model-v15', 'manifest.json'))
ap.add_argument('--out', default=os.path.join(SP, 'tools', 'pack', 'mapping.from-manifest.json'))
ap.add_argument('--all-paint', action='store_true', help='also embed non-forced `paint` entries (changes behaviour: they are used only where the embedded map is sparse)')
a = ap.parse_args()
a.manifest = os.path.abspath(a.manifest); m = json.load(open(a.manifest)); base = os.path.dirname(a.manifest)
out = {'_note': f'generated from {a.manifest}', 'standard': {}, 'detail': {}}
for name, modes in m['maps'].items():
    for mode, e in modes.items():
        if mode in out and e.get('paint') and (e.get('paintForce') is True or a.all_paint):
            p = os.path.join(base, e['paint'])
            if not os.path.isfile(p): sys.exit(f'{p} missing')
            out[mode][name] = p
json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
for mode in ('standard', 'detail'):
    for name, p in out[mode].items(): print(f'{mode:8s} {name[:40]:40s} {os.path.basename(p)}')
