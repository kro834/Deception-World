"""Copy staged maps from out/ to work/model-v15/ atomically (temp name in the target folder, then rename).
The manifest is merged: keys this pipeline produces (style, toonNormal, mask, maskSpread) come from out/;
any other keys already in the delivered manifest (e.g. another agent's 'lines'/'linesSpread') are kept.
manifest.json goes last so it never references a file that is not there yet."""
import os, shutil, json
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'out')
DST = os.path.join(HERE, '..', '..', 'work', 'model-v15')
os.makedirs(DST, exist_ok=True)
man = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
old = {}
if os.path.exists(os.path.join(DST, 'manifest.json')):
    old = json.load(open(os.path.join(DST, 'manifest.json'), encoding='utf-8'))
files = sorted({v for e in man['maps'].values() for m in e.values() for v in m.values()
                if isinstance(v, str) and v.endswith('.webp')})
for f in files:
    tmp = os.path.join(DST, '.' + f + '.tmp')
    shutil.copyfile(os.path.join(SRC, f), tmp)
    os.replace(tmp, os.path.join(DST, f))
    print('delivered', f, os.path.getsize(os.path.join(DST, f)))
for mat, e in old.get('maps', {}).items():
    for mode, m in e.items():
        for k, v in m.items():
            if k not in ('style', 'toonNormal', 'mask', 'maskSpread', 'conf', 'paint'):
                man['maps'].setdefault(mat, {}).setdefault(mode, {})[k] = v
for k, v in old.items():
    if k not in ('maps', 'version'):
        man[k] = v
tmp = os.path.join(DST, '.manifest.json.tmp')
with open(tmp, 'w', encoding='utf-8') as fh:
    json.dump(man, fh, ensure_ascii=False, indent=2)
os.replace(tmp, os.path.join(DST, 'manifest.json'))
print('delivered manifest.json')
