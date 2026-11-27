#!/usr/bin/env python3
"""Byte-level packing of the viewer's glTF containers (no geometry decode / re-encode).

  standard-v14.glb  -> standard-v15.glb
  detail-v14.gltf (+ .bin, + external images) -> detail-v15.gltf, detail-v15.bin (byte copy), textures
  plus pack-report.json

What changes:
  * every material loses normalTexture, occlusionTexture and metallicRoughnessTexture (the viewer's shader
    never samples them); textures / images / samplers / bufferViews nothing references are pruned
  * base-colour images are replaced per material from a mapping file (WebP via EXT_texture_webp)
  * optional --emissive-webp re-encodes the emissive PNGs
What does NOT change: every geometry bufferView's bytes (EXT_meshopt_compression payloads are copied as is).
Only offsets move: the BIN chunk is rebuilt from the kept blocks (4-byte aligned) and the
`byteOffset` of each EXT_meshopt_compression extension is rewritten.

Usage:
  pack_models.py --src SP/work/model-v10 --out SP/pack-out/model-v15 --mapping mapping.json \
                 [--emissive-webp 90|lossless]
mapping.json: {"standard": {"<material name>": "<file>"}, "detail": {...}}; relative paths resolve against
the mapping file. Files are read at run time and never cached.
"""
import argparse, copy, hashlib, io, json, os, shutil, struct, sys, tempfile
from PIL import Image

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942
DROP_TEX = ('normalTexture', 'occlusionTexture')
WEBP = 'EXT_texture_webp'
MESHOPT = 'EXT_meshopt_compression'


def die(msg):
    sys.exit(f'pack_models: ERROR: {msg}')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def align4(n):
    return (n + 3) & ~3


# ---------------------------------------------------------------- GLB io
def read_glb(path):
    d = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', d, 0)
    if magic != 0x46546C67 or version != 2 or length != len(d):
        die(f'{path}: not a valid GLB 2 (magic/version/length)')
    off, js, binc = 12, None, None
    while off < len(d):
        clen, ctype = struct.unpack_from('<II', d, off)
        body = d[off + 8: off + 8 + clen]
        if ctype == JSON_CHUNK and js is None:
            js = json.loads(body.decode('utf8'))
        elif ctype == BIN_CHUNK and binc is None:
            binc = body
        off += 8 + clen
    if js is None or binc is None:
        die(f'{path}: missing JSON or BIN chunk')
    return js, binc


def write_glb(path, js, binc):
    jb = json.dumps(js, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    jb += b' ' * (align4(len(jb)) - len(jb))
    binc = binc + b'\0' * (align4(len(binc)) - len(binc))
    total = 12 + 8 + len(jb) + 8 + len(binc)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), JSON_CHUNK) + jb)
        f.write(struct.pack('<II', len(binc), BIN_CHUNK) + binc)


# ---------------------------------------------------------------- shared material surgery
def tex_refs(material):
    """Yield (container, key) for every textureInfo in a material (core + extensions)."""
    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k.endswith('Texture') and isinstance(v, dict) and 'index' in v:
                    yield obj, k
                else:
                    yield from walk(v)
    yield from walk(material)


def strip_unused_maps(js):
    removed = 0
    for m in js.get('materials', []):
        for k in DROP_TEX:
            if k in m:
                del m[k]; removed += 1
        pbr = m.get('pbrMetallicRoughness')
        if pbr and 'metallicRoughnessTexture' in pbr:
            del pbr['metallicRoughnessTexture']; removed += 1
        # anything else still pointing at textures must be a map we know the viewer reads
        for c, k in tex_refs(m):
            if k not in ('baseColorTexture', 'emissiveTexture'):
                die(f"material {m.get('name')!r} still has {k}: unexpected, refusing to guess")
    return removed


def tex_image_indices(tex):
    out = []
    if 'source' in tex: out.append(tex['source'])
    if WEBP in tex.get('extensions', {}) and 'source' in tex['extensions'][WEBP]:
        out.append(tex['extensions'][WEBP]['source'])
    return out


def set_tex_source_webp(tex, image_index):
    tex.pop('source', None)
    tex.setdefault('extensions', {})[WEBP] = {'source': image_index}


def clamp_sampler(js):
    """Index of a clamp-to-edge, mipmapped sampler (what the viewer's run-time `paint` textures used)."""
    want = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}
    s = js.setdefault('samplers', [])
    for i, x in enumerate(s):
        if x == want: return i
    s.append(want); return len(s) - 1


def replace_base_colour(js, mapping, add_image):
    """mapping: material name -> file path. add_image(name, path) -> new image index."""
    done = {}
    by_name = {m.get('name'): m for m in js['materials']}
    for name in mapping:
        if name not in by_name:
            die(f'mapping names material {name!r} which the model does not have: {sorted(n for n in by_name if n)}')
    for name, path in mapping.items():
        m = by_name[name]
        info = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if not info:
            die(f'material {name!r} has no baseColorTexture to replace')
        img = add_image(name, path)
        js['textures'].append({'sampler': clamp_sampler(js)})
        set_tex_source_webp(js['textures'][-1], img)
        info['index'] = len(js['textures']) - 1
        done[name] = os.path.basename(path)
    return done


def prune(js, keep_image_bufferviews=None):
    """Remove unreferenced textures, images, samplers; remap indices. Returns kept image indices (new order)."""
    used_tex = sorted({info['index'] for m in js['materials'] for c, k in tex_refs(m) for info in [c[k]]})
    tmap = {o: i for i, o in enumerate(used_tex)}
    for m in js['materials']:
        for c, k in tex_refs(m):
            c[k]['index'] = tmap[c[k]['index']]
    js['textures'] = [js['textures'][o] for o in used_tex]
    used_img = sorted({i for t in js['textures'] for i in tex_image_indices(t)})
    imap = {o: i for i, o in enumerate(used_img)}
    for t in js['textures']:
        if 'source' in t: t['source'] = imap[t['source']]
        if WEBP in t.get('extensions', {}) and 'source' in t['extensions'][WEBP]:
            t['extensions'][WEBP]['source'] = imap[t['extensions'][WEBP]['source']]
    old_images = js['images']
    js['images'] = [old_images[o] for o in used_img]
    used_s = sorted({t['sampler'] for t in js['textures'] if 'sampler' in t})
    smap = {o: i for i, o in enumerate(used_s)}
    for t in js['textures']:
        if 'sampler' in t: t['sampler'] = smap[t['sampler']]
    js['samplers'] = [js['samplers'][o] for o in used_s]
    if not js['samplers']: del js['samplers']
    if not js['textures']: del js['textures']
    if not js['images']: del js['images']
    return used_img


def fix_extension_lists(js):
    webp_used = any(WEBP in t.get('extensions', {}) for t in js.get('textures', []))
    for key in ('extensionsUsed', 'extensionsRequired'):
        if key in js and not webp_used and WEBP in js[key]:
            js[key].remove(WEBP)


def emissive_image_indices(js):
    return {js['textures'][m['emissiveTexture']['index']].get('source', None) if 'source' in js['textures'][m['emissiveTexture']['index']]
            else js['textures'][m['emissiveTexture']['index']]['extensions'][WEBP]['source']
            for m in js['materials'] if 'emissiveTexture' in m}


def encode_webp(png_bytes, quality):
    im = Image.open(io.BytesIO(png_bytes)); im.load()
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.mode or im.mode == 'P' else 'RGB')
    out = io.BytesIO()
    if quality == 'lossless':
        im.save(out, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(out, 'WEBP', quality=int(quality), method=6)
    return out.getvalue()


def parse_q(v):
    if v is None: return None
    if v == 'lossless': return v
    q = int(v)
    if not 1 <= q <= 100: die('--emissive-webp must be 1..100 or "lossless"')
    return q


def load_mapping(path, which):
    m = json.load(open(path))
    base = os.path.dirname(os.path.abspath(path))
    out = {}
    for name, f in m.get(which, {}).items():
        p = f if os.path.isabs(f) else os.path.join(base, f)
        if not os.path.isfile(p): die(f'mapping file for {name!r} ({which}) not found: {p}')
        out[name] = p
    return out


# ---------------------------------------------------------------- standard GLB
def pack_standard(src, out_path, mapping, emissive_q):
    js, binc = read_glb(src)
    orig = copy.deepcopy(js)
    # structure checks
    bufs = js['buffers']
    if len(bufs) != 2 or 'uri' in bufs[0] or 'uri' in bufs[1] or bufs[0]['byteLength'] != len(binc) \
            or not bufs[1].get('extensions', {}).get(MESHOPT, {}).get('fallback'):
        die(f'unexpected buffers layout: {json.dumps(bufs)[:300]} (BIN chunk {len(binc)} bytes)')
    bvs = js['bufferViews']
    for i, bv in enumerate(bvs):
        e = bv.get('extensions', {}).get(MESHOPT)
        if bv['buffer'] == 0 and e: die(f'bufferView {i}: compressed view on the real buffer, unexpected')
        if bv['buffer'] == 1 and not e: die(f'bufferView {i}: fallback view without meshopt extension')
        if e and e['buffer'] != 0: die(f'bufferView {i}: meshopt source buffer is not 0')

    removed = strip_unused_maps(js)
    # images held in bufferViews: image index -> (kind, data)
    image_data = {}   # old image index -> bytes
    for i, im in enumerate(js['images']):
        if 'bufferView' not in im: die(f'image {i} is not embedded')
        bv = bvs[im['bufferView']]
        image_data[i] = bytes(binc[bv['byteOffset']: bv['byteOffset'] + bv['byteLength']])
        if bv['buffer'] != 0: die(f'image {i} view not in buffer 0')

    # emissive recompression (before pruning, by image index)
    emissive_log = {}
    if emissive_q is not None:
        for t in js['textures']:
            pass
        used = {}
        for m in js['materials']:
            if 'emissiveTexture' in m:
                t = js['textures'][m['emissiveTexture']['index']]
                src_i = t.get('source')
                if src_i is None: continue
                if js['images'][src_i]['mimeType'] != 'image/png': continue
                used[src_i] = t
        for src_i, t in used.items():
            before = image_data[src_i]
            after = encode_webp(before, emissive_q)
            image_data[src_i] = after
            js['images'][src_i]['mimeType'] = 'image/webp'
            set_tex_source_webp(t, src_i)
            emissive_log[js['images'][src_i].get('name', str(src_i))] = {'png_bytes': len(before), 'webp_bytes': len(after)}

    new_data = {}   # new image index (appended) -> bytes
    replaced_files = {}

    def add_image(name, path):
        data = open(path, 'rb').read()
        if data[:4] != b'RIFF' or data[8:12] != b'WEBP': die(f'{path} is not a WebP file')
        js['images'].append({'name': f'paint | {name}', 'mimeType': 'image/webp', 'bufferView': -1})
        idx = len(js['images']) - 1
        image_data[idx] = data
        replaced_files[name] = {'file': path, 'bytes': len(data), 'sha256': sha(data)}
        return idx
    replace_base_colour(js, mapping, add_image)

    kept_images = prune(js)           # old (extended) indices that survive, in order
    # ---- gather blocks: kept image blobs, then compressed geometry payloads, in original order
    blocks = []   # (old_sort_key, kind, ref)
    for new_i, old_i in enumerate(kept_images):
        im = js['images'][new_i]
        if im['bufferView'] == -1:
            blocks.append((1 << 60 | old_i, 'image', new_i, image_data[old_i]))
        elif old_i in image_data and image_data[old_i] is not None:
            old_bv = orig['images'][old_i]['bufferView']
            blocks.append((bvs[old_bv]['byteOffset'], 'image', new_i, image_data[old_i]))
    geo = []      # bufferView indices that are geometry (all with ext)
    for i, bv in enumerate(bvs):
        e = bv.get('extensions', {}).get(MESHOPT)
        if e:
            geo.append(i)
            blocks.append((e['byteOffset'], 'geo', i, bytes(binc[e['byteOffset']: e['byteOffset'] + e['byteLength']])))
    blocks.sort(key=lambda b: b[0])

    # new bufferViews list: image views are rebuilt, geometry views keep their order and fallback layout
    new_bvs_img = {}
    out_bin = bytearray()
    geo_old_to_hash = {}
    geo_new_off = {}
    for _, kind, ref, data in blocks:
        out_bin += b'\0' * (align4(len(out_bin)) - len(out_bin))
        off = len(out_bin)
        out_bin += data
        if kind == 'image':
            new_bvs_img[ref] = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        else:
            geo_new_off[ref] = off
    # rebuild bufferViews: images first? keep geometry indices stable by appending image views after geometry views
    new_bvs = []
    geo_map = {}
    for i in geo:
        bv = copy.deepcopy(bvs[i])
        bv['extensions'][MESHOPT]['byteOffset'] = geo_new_off[i]
        geo_map[i] = len(new_bvs)
        new_bvs.append(bv)
    img_bv_index = {}
    for new_i in sorted(new_bvs_img):
        img_bv_index[new_i] = len(new_bvs)
        new_bvs.append(new_bvs_img[new_i])
        js['images'][new_i]['bufferView'] = img_bv_index[new_i]
    # accessors: remap bufferView index (geometry only; accessors never reference image views)
    for a in js['accessors']:
        if 'bufferView' in a:
            if a['bufferView'] not in geo_map: die('accessor references a non-geometry bufferView')
            a['bufferView'] = geo_map[a['bufferView']]
    js['bufferViews'] = new_bvs
    js['buffers'][0]['byteLength'] = len(out_bin)
    fix_extension_lists(js)
    # ---- sanity: any bufferView referenced anywhere else?
    for k in ('meshes', 'skins', 'animations', 'cameras'):
        if k in js and json.dumps(js[k]).count('bufferView'): die(f'{k} references bufferViews: not handled')

    write_glb(out_path + '.tmp', js, bytes(out_bin))
    os.replace(out_path + '.tmp', out_path)

    # ---- verify by re-reading the written file
    js2, bin2 = read_glb(out_path)
    hashes = []
    for old_i in geo:
        e0 = orig['bufferViews'][old_i]['extensions'][MESHOPT]
        before = sha(binc[e0['byteOffset']: e0['byteOffset'] + e0['byteLength']])
        nb = js2['bufferViews'][geo_map[old_i]]
        e1 = nb['extensions'][MESHOPT]
        after = sha(bin2[e1['byteOffset']: e1['byteOffset'] + e1['byteLength']])
        a, b = copy.deepcopy(orig['bufferViews'][old_i]), copy.deepcopy(nb)
        a['extensions'][MESHOPT].pop('byteOffset'); b['extensions'][MESHOPT].pop('byteOffset')
        same_json = a == b
        hashes.append({'bufferView_before': old_i, 'bufferView_after': geo_map[old_i], 'sha256_before': before,
                       'sha256_after': after, 'bytes': e0['byteLength'], 'match': before == after and same_json,
                       'offset_before': e0['byteOffset'], 'offset_after': e1['byteOffset']})
    if not all(h['match'] for h in hashes): die('geometry bytes differ after packing')
    # accessors/meshes must be unchanged apart from the bufferView renumbering
    for a0, a1 in zip(orig['accessors'], js2['accessors']):
        x, y = dict(a0), dict(a1); x.pop('bufferView', None); y.pop('bufferView', None)
        if x != y: die('accessor changed')
    if orig['meshes'] != js2['meshes'] or orig['nodes'] != js2['nodes']: die('meshes/nodes changed')
    return {'out': out_path, 'bytes_before': os.path.getsize(src), 'bytes_after': os.path.getsize(out_path),
            'bin_bytes_before': len(binc), 'bin_bytes_after': len(bin2), 'json_bytes_after': len(json.dumps(js2)),
            'removed_texture_refs': removed, 'images_before': len(orig['images']), 'images_after': len(js2['images']),
            'textures_after': len(js2.get('textures', [])), 'geometry_views': len(hashes),
            'geometry_all_match': True, 'geometry_hashes': hashes, 'replaced_base_colour': replaced_files,
            'emissive': emissive_log, 'image_sizes_after': [
                {'name': im.get('name'), 'mime': im['mimeType'], 'bytes': js2['bufferViews'][im['bufferView']]['byteLength']} for im in js2['images']]}


# ---------------------------------------------------------------- detail glTF
def pack_detail(src, out_dir, mapping, emissive_q):
    srcdir = os.path.dirname(os.path.abspath(src))
    js = json.load(open(src))
    orig = copy.deepcopy(js)
    bufs = js['buffers']
    if len(bufs) != 2 or bufs[0].get('uri') is None or 'uri' in bufs[1] \
            or not bufs[1].get('extensions', {}).get(MESHOPT, {}).get('fallback'):
        die(f'detail: unexpected buffers layout {json.dumps(bufs)[:300]}')
    binname = bufs[0]['uri']
    if os.path.getsize(os.path.join(srcdir, binname)) != bufs[0]['byteLength']: die('detail .bin size differs from the glTF')
    removed = strip_unused_maps(js)
    files = {}   # new image index (old extended) -> (out filename, bytes)
    emissive_log = {}
    for i, im in enumerate(js['images']):
        files[i] = None
    for m in js['materials']:
        if 'emissiveTexture' in m and emissive_q is not None:
            t = js['textures'][m['emissiveTexture']['index']]
            i = t.get('source')
            im = js['images'][i] if i is not None else None
            if im and im['mimeType'] == 'image/png':
                data = open(os.path.join(srcdir, im['uri']), 'rb').read()
                w = encode_webp(data, emissive_q)
                newname = os.path.splitext(im['uri'])[0] + '.webp'
                files[i] = (newname, w)
                emissive_log[im['uri']] = {'png_bytes': len(data), 'webp_bytes': len(w), 'as': newname}
                im['uri'] = newname; im['mimeType'] = 'image/webp'
                set_tex_source_webp(t, i)
    replaced = {}

    def add_image(name, path):
        data = open(path, 'rb').read()
        if data[:4] != b'RIFF' or data[8:12] != b'WEBP': die(f'{path} is not a WebP file')
        fname = os.path.basename(path)
        js['images'].append({'name': f'paint | {name}', 'mimeType': 'image/webp', 'uri': fname})
        idx = len(js['images']) - 1
        files[idx] = (fname, data)
        replaced[name] = {'file': path, 'bytes': len(data), 'sha256': sha(data)}
        return idx
    replace_base_colour(js, mapping, add_image)
    kept = prune(js)
    os.makedirs(out_dir, exist_ok=True)
    written = {}
    for new_i, old_i in enumerate(kept):
        uri = js['images'][new_i]['uri']
        if files.get(old_i):
            data = files[old_i][1]
        else:
            data = open(os.path.join(srcdir, uri), 'rb').read()
        with open(os.path.join(out_dir, uri), 'wb') as f: f.write(data)
        written[uri] = len(data)
    new_bin = 'detail-v15.bin'
    shutil.copyfile(os.path.join(srcdir, binname), os.path.join(out_dir, new_bin))
    js['buffers'][0]['uri'] = new_bin
    fix_extension_lists(js)
    # geometry must be untouched: bufferViews / accessors / meshes identical to the source
    for k in ('bufferViews', 'accessors', 'meshes', 'nodes'):
        if orig[k] != js[k]: die(f'detail: {k} changed unexpectedly')
    out_gltf = os.path.join(out_dir, 'detail-v15.gltf')
    with open(out_gltf + '.tmp', 'w', encoding='utf8') as f:
        json.dump(js, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(out_gltf + '.tmp', out_gltf)
    b0 = open(os.path.join(srcdir, binname), 'rb').read(); b1 = open(os.path.join(out_dir, new_bin), 'rb').read()
    hashes = []
    for i, bv in enumerate(js['bufferViews']):
        e = bv['extensions'][MESHOPT]
        hashes.append({'bufferView': i, 'bytes': e['byteLength'], 'sha256_before': sha(b0[e['byteOffset']:e['byteOffset'] + e['byteLength']]),
                       'sha256_after': sha(b1[e['byteOffset']:e['byteOffset'] + e['byteLength']])})
    for h in hashes: h['match'] = h['sha256_before'] == h['sha256_after']
    if b0 != b1 or not all(h['match'] for h in hashes): die('detail .bin is not byte-identical')
    size_before = os.path.getsize(src) + len(b0) + sum(os.path.getsize(os.path.join(srcdir, im['uri'])) for im in orig['images'])
    size_after = os.path.getsize(out_gltf) + len(b1) + sum(written.values())
    return {'gltf': out_gltf, 'bin': os.path.join(out_dir, new_bin), 'bin_sha256': sha(b1), 'bin_identical': True,
            'total_bytes_before_incl_images_and_bin': size_before, 'total_bytes_after': size_after,
            'removed_texture_refs': removed, 'images_before': len(orig['images']), 'images_after': len(js['images']),
            'files_written': written, 'geometry_views': len(hashes), 'geometry_all_match': True, 'geometry_hashes': hashes,
            'replaced_base_colour': replaced, 'emissive': emissive_log}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, help='folder holding standard-v14.glb, detail-v14.gltf, detail-v14.bin and images')
    ap.add_argument('--out', required=True, help='output folder (SP/pack-out/model-v15); replaced as a whole')
    ap.add_argument('--mapping', required=True)
    ap.add_argument('--emissive-webp', metavar='Q', help='1..100 or "lossless"; default keeps the PNGs')
    a = ap.parse_args()
    q = parse_q(a.emissive_webp)
    out = os.path.abspath(a.out)
    if os.path.basename(os.path.dirname(out)) == 'work' or '/work/' in out + '/':
        die('refusing to write inside a work/ folder')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='.pack-', dir=os.path.dirname(out))
    os.chmod(tmp, 0o755)
    try:
        std = pack_standard(os.path.join(a.src, 'standard-v14.glb'), os.path.join(tmp, 'standard-v15.glb'),
                            load_mapping(a.mapping, 'standard'), q)
        det = pack_detail(os.path.join(a.src, 'detail-v14.gltf'), tmp, load_mapping(a.mapping, 'detail'), q)
        report = {'mapping_file': os.path.abspath(a.mapping), 'mapping': json.load(open(a.mapping)),
                  'emissive_webp': a.emissive_webp or 'keep PNG', 'standard': std, 'detail': det}
        std['out'] = os.path.join(out, 'standard-v15.glb'); det['gltf'] = os.path.join(out, 'detail-v15.gltf'); det['bin'] = os.path.join(out, 'detail-v15.bin')
        json.dump(report, open(os.path.join(tmp, 'pack-report.json'), 'w'), indent=1)
        if os.path.isdir(out): shutil.rmtree(out)
        os.rename(tmp, out)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True); raise
    print(f"standard: {std['bytes_before']:,} -> {std['bytes_after']:,} bytes; geometry views identical: {std['geometry_views']}")
    print(f"detail:   {det['total_bytes_before_incl_images_and_bin']:,} -> {det['total_bytes_after']:,} bytes (gltf+bin+images); .bin byte-identical")
    print(f'report: {os.path.join(out, "pack-report.json")}')


if __name__ == '__main__':
    main()
