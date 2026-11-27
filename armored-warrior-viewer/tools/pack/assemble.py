#!/usr/bin/env python3
"""Assemble SP/release, the exact tree to deploy, from SP/work and SP/pack-out.

  SP/venv/bin/python tools/pack/assemble.py [--prune|--no-prune] [--keep GLOB ...] [--skip-crawl]

Steps
  1. copy index.html viewer.css ui.js viewer.js look/** (only the matcaps in --matcaps) vendor/** vercel.json
     previews-v15/ previews-v15p/ (an empty or missing second set only warns)
  2. model-v15/: the packed models from pack-out (+ the textures the detail glTF names), manifest.json, lines.json
     and every helper map the manifest lists (a superset; step 4 decides)
  3. two edits to the COPY, each an exact-string check that fails loudly if the source text changed:
       viewer.js     the MODELS constant -> model-v15 / standard-v15.glb / detail-v15.gltf
       manifest.json `paint` and `paintForce` removed for every material/mode the packer embedded
  4. log the real requests (Playwright, desktop standard+views+detail, then a phone profile) against the tree;
     any 4xx/5xx fails. Files never requested are listed and pruned (--prune, default) or the run fails
     (--no-prune). --keep globs and vercel.json are never pruned. The pruned tree is crawled again to prove it.
  5. the tree replaces SP/release only after all checks pass.
"""
import argparse, fnmatch, hashlib, json, os, re, shutil, subprocess, sys

SP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CRAWL = os.path.join(SP, 'tools', 'pack', 'crawl.cjs')
VIEWER_MODELS_OLD = "const MODELS = { folder: 'model-v10', standard: 'standard-v14.glb', detail: 'detail-v14.gltf' };"
VIEWER_MODELS_NEW = "const MODELS = { folder: 'model-v15', standard: 'standard-v15.glb', detail: 'detail-v15.gltf' };"
TOP_FILES = ['index.html', 'viewer.css', 'ui.js', 'viewer.js', 'diag.js', 'vercel.json']


def die(msg):
    sys.exit(f'assemble: ERROR: {msg}')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()


def copy_tree(src, dst):
    for root, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for f in sorted(files):
            if f.startswith('.'): continue
            rel = os.path.relpath(os.path.join(root, f), src)
            os.makedirs(os.path.dirname(os.path.join(dst, rel)), exist_ok=True)
            shutil.copyfile(os.path.join(root, f), os.path.join(dst, rel))


def list_files(root):
    out = []
    for r, dirs, files in os.walk(root):
        for f in files: out.append(os.path.relpath(os.path.join(r, f), root).replace(os.sep, '/'))
    return sorted(out)


def snapshot(work, matcaps):
    """(path, size, mtime_ns) of everything assemble reads from work/. Used to detect edits made while it runs."""
    out = []
    for d in ['index.html', 'viewer.css', 'ui.js', 'viewer.js', 'diag.js', 'vercel.json', 'vendor', 'look', 'previews-v15', 'previews-v15p', 'thumbs', 'model-v15']:
        p = os.path.join(work, d)
        if os.path.isfile(p): paths = [p]
        else: paths = [os.path.join(r, f) for r, _, fs in os.walk(p) for f in fs]
        for q in sorted(paths):
            st = os.stat(q); out.append((os.path.relpath(q, work), st.st_size, st.st_mtime_ns))
    return out


def must_replace_once(text, old, new, what):
    if text.count(old) != 1:
        die(f'{what}: expected exactly one occurrence of\n    {old}\n  found {text.count(old)}. The source changed; update assemble.py after checking the new text.')
    return text.replace(old, new)


def crawl(url, profile, outfile, timeout):
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node-tools/node_modules'))
    for attempt in (1, 2):   # one retry: the browser shares a busy machine and software GL can stall
        p = subprocess.run(['node', CRAWL, '--url', url, '--profile', profile, '--out', outfile, '--timeout', str(timeout)],
                           env=env, capture_output=True, text=True)
        print('   ', (p.stdout.strip() or p.stderr.strip().splitlines()[0]))
        if p.returncode == 0: break
        if attempt == 2: die(f'crawl ({profile}) failed twice:\n{p.stderr}')
        print('    retrying once')
    return json.load(open(outfile))


def rel_in_tree(url, base):
    if not url.startswith(base): return None
    from urllib.parse import unquote, urlsplit
    path = unquote(urlsplit(url[len(base):]).path)
    return path if path and not path.endswith('/') else path + 'index.html'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--work', default=os.path.join(SP, 'work'))
    ap.add_argument('--pack', default=os.path.join(SP, 'pack-out', 'model-v15'))
    ap.add_argument('--out', default=os.path.join(SP, 'release'))
    ap.add_argument('--server', default='http://localhost:8765', help='existing static server whose root is SP')
    ap.add_argument('--matcaps', default='gold,armor')
    ap.add_argument('--keep', action='append', default=[], help='glob (relative to release) never pruned and never a failure')
    ap.add_argument('--prune', dest='prune', action='store_true', default=True)
    ap.add_argument('--no-prune', dest='prune', action='store_false')
    ap.add_argument('--skip-crawl', action='store_true', help='copy and edit only (no request check): NOT releasable')
    ap.add_argument('--timeout-ms', type=int, default=240000)
    a = ap.parse_args()

    work, pack, out = os.path.abspath(a.work), os.path.abspath(a.pack), os.path.abspath(a.out)
    if not out.startswith(SP + os.sep): die('--out must be inside SP')
    if os.path.realpath(out) == os.path.realpath(work): die('--out must not be the work folder')
    for f in ('standard-v15.glb', 'detail-v15.gltf', 'detail-v15.bin', 'pack-report.json'):
        if not os.path.isfile(os.path.join(pack, f)): die(f'{pack}/{f} missing: run tools/pack/pack_models.py first')
    report = json.load(open(os.path.join(pack, 'pack-report.json')))

    # a stale pack would silently ship old paintings: compare the mapped files with what the packer read
    for which in ('standard', 'detail'):
        for name, info in report[which]['replaced_base_colour'].items():
            f = info['file']
            if not os.path.isfile(f): die(f'mapped file vanished: {f}')
            if sha(f) != info['sha256']:
                die(f'pack-out is STALE: {f} changed after pack_models.py ran ({which}, {name}). Re-run pack_models.py.')

    snap0 = snapshot(work, a.matcaps)
    tmp = out + '.tmp'
    if os.path.isdir(tmp): shutil.rmtree(tmp)
    os.makedirs(tmp)
    os.chmod(tmp, 0o755)

    # ---- 1. site files
    for f in TOP_FILES:
        s = os.path.join(work, f)
        if not os.path.isfile(s): die(f'{s} missing')
        shutil.copyfile(s, os.path.join(tmp, f))
    for d in ('vendor',):
        if not os.path.isdir(os.path.join(work, d)): die(f'{work}/{d} missing')
        copy_tree(os.path.join(work, d), os.path.join(tmp, d))
    look_src = os.path.join(work, 'look')
    for root, dirs, files in os.walk(look_src):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d != 'matcaps')
        for f in sorted(files):
            if f.startswith('.'): continue
            rel = os.path.relpath(os.path.join(root, f), work)
            os.makedirs(os.path.dirname(os.path.join(tmp, rel)), exist_ok=True)
            shutil.copyfile(os.path.join(root, f), os.path.join(tmp, rel))
    for name in [m for m in a.matcaps.split(',') if m]:
        s = os.path.join(look_src, 'matcaps', f'{name}.webp')
        if not os.path.isfile(s): die(f'matcap {s} missing')
        os.makedirs(os.path.join(tmp, 'look', 'matcaps'), exist_ok=True)
        shutil.copyfile(s, os.path.join(tmp, 'look', 'matcaps', f'{name}.webp'))
    missing_dirs = []
    for d in ('previews-v15', 'previews-v15p', 'thumbs'):
        s = os.path.join(work, d)
        if os.path.isdir(s) and any(not f.startswith('.') for f in os.listdir(s)):
            copy_tree(s, os.path.join(tmp, d))
        else:
            missing_dirs.append(d + '/')
            print(f'WARNING: {d}/ is missing or empty in work/ (requests under it will 404 on a portrait phone; tolerated, deploy will have the same holes); continuing')

    # ---- 2. model-v15
    mdir = os.path.join(tmp, 'model-v15')
    os.makedirs(mdir)
    for f in ('standard-v15.glb', 'detail-v15.gltf', 'detail-v15.bin'):
        shutil.copyfile(os.path.join(pack, f), os.path.join(mdir, f))
    gltf = json.load(open(os.path.join(pack, 'detail-v15.gltf')))
    for im in gltf.get('images', []):
        uri = im['uri']
        if '/' in uri or uri.startswith('.'): die(f'detail image uri {uri!r} is not a plain file name')
        shutil.copyfile(os.path.join(pack, uri), os.path.join(mdir, uri))
    wm = os.path.join(work, 'model-v15')
    manifest_src = os.path.join(wm, 'manifest.json')
    if not os.path.isfile(manifest_src): die('work/model-v15/manifest.json missing')
    manifest_text = open(manifest_src, encoding='utf8').read()
    manifest = json.loads(manifest_text)
    # ---- 3a. viewer.js
    vp = os.path.join(tmp, 'viewer.js')
    vt = open(vp, encoding='utf8').read()
    open(vp, 'w', encoding='utf8').write(must_replace_once(vt, VIEWER_MODELS_OLD, VIEWER_MODELS_NEW, 'viewer.js MODELS'))
    ip = os.path.join(tmp, 'index.html'); it = open(ip, encoding='utf8').read()
    open(ip, 'w', encoding='utf8').write(must_replace_once(it, "'./model-v10/standard-v14.glb'", "'./model-v15/standard-v15.glb'", 'index.html early model URL'))
    # ---- 3b. manifest: drop paint/paintForce where the painting is now embedded
    edits = []
    for which in ('standard', 'detail'):
        for name, info in report[which]['replaced_base_colour'].items():
            entry = manifest.get('maps', {}).get(name, {}).get(which)
            if entry is None:
                print(f'note: manifest has no {which} entry for {name!r}; nothing to remove'); continue
            if 'paint' not in entry:
                print(f'note: manifest {which} entry of {name!r} has no `paint`; nothing to remove'); continue
            if entry['paint'] != os.path.basename(info['file']):
                print(f"note: manifest {which} paint of {name!r} was {entry['paint']!r} but the pack embedded {os.path.basename(info['file'])!r}; removing it anyway")
            edits.append((which, name, entry.pop('paint'), entry.pop('paintForce', None)))
    json.dump(manifest, open(os.path.join(mdir, 'manifest.json'), 'w', encoding='utf8'), indent=2, ensure_ascii=False)
    for which, name, p, forced in edits: print(f'manifest: removed paint {p!r} (paintForce={forced}) of {name!r} [{which}]')
    # helper maps: superset = every file the edited manifest names, then lines.json
    candidates = set()
    for modes in manifest.get('maps', {}).values():
        for entry in modes.values():
            candidates.update(v for v in entry.values() if isinstance(v, str))
    if os.path.isfile(os.path.join(wm, 'lines.json')): candidates.add('lines.json')
    for f in sorted(candidates):
        if os.path.exists(os.path.join(mdir, f)): continue   # packed detail textures win
        s = os.path.join(wm, f)
        if not os.path.isfile(s): print(f'WARNING: manifest names {f} but work/model-v15 lacks it'); continue
        shutil.copyfile(s, os.path.join(mdir, f))

    snapc = snapshot(work, a.matcaps)
    if snapc != snap0:
        changed = sorted({x[0] for x in set(snap0) ^ set(snapc)})
        die(f'work/ changed while it was being copied (the tree may mix versions): {changed[:12]}. Re-run when look-dev is idle.')
    keep = ['vercel.json'] + a.keep
    result = {'deployed': None, 'pruned': [], 'crawls': {}}
    if a.skip_crawl:
        print('--skip-crawl: tree NOT verified; not installing it as release'); print(tmp); return

    base = f"{a.server}/{os.path.relpath(tmp, SP).replace(os.sep, '/')}/"
    logdir = os.path.join(SP, 'pack-out', 'logs'); os.makedirs(logdir, exist_ok=True)

    def run_crawls(tag):
        res = {}
        for profile in ('desktop', 'mobile'):
            res[profile] = crawl(base, profile, os.path.join(logdir, f'{tag}-{profile}.json'), a.timeout_ms)
        return res

    def evaluate(res):
        bad, requested = [], set()
        for profile, r in res.items():
            tolerated = 0
            for q in r['requests']:
                rel = rel_in_tree(q['url'], base)
                if rel is None: bad.append(f"{profile}: request outside the tree: {q['url']}"); continue
                if q['status'] >= 400 and any(rel.startswith(m) for m in missing_dirs) and q['status'] == 404:
                    tolerated += 1; print(f'    tolerated 404 (warned-empty poster set): {rel}'); continue
                if q['status'] >= 400: bad.append(f"{profile}: {q['status']} {rel}")
                requested.add(rel)
            for p in r['problems']:
                if tolerated and p['type'] == 'console.error' and 'Failed to load resource' in p['text'] and '404' in p['text']:
                    tolerated -= 1; continue
                bad.append(f"{profile}: {p['type']}: {p['text']}")
            if r['state']['viewer'] != 'ready' or r['state']['mode'] != 'detail': bad.append(f"{profile}: ended in state {r['state']}")
        deployed = [f for f in list_files(tmp)]
        unrequested = [f for f in deployed if f not in requested and not any(fnmatch.fnmatch(f, g) for g in keep)]
        return bad, requested, unrequested

    print('crawl 1 (candidate tree):')
    res = run_crawls('assemble-1')
    bad, requested, unrequested = evaluate(res)
    if bad: die('requests failed:\n  ' + '\n  '.join(bad))
    if unrequested:
        print(f'{len(unrequested)} deployed file(s) were never requested:'); [print('   ', f) for f in unrequested]
        if not a.prune: die('unrequested files (use --prune or --keep)')
        for f in unrequested: os.remove(os.path.join(tmp, f))
        for r, dirs, files in os.walk(tmp, topdown=False):
            if not os.listdir(r): os.rmdir(r)
        result['pruned'] = unrequested
        print('pruned; crawl 2 (final tree):')
        res = run_crawls('assemble-2')
        bad, requested, unrequested = evaluate(res)
        if bad: die('requests failed after pruning:\n  ' + '\n  '.join(bad))
        if unrequested: die(f'still unrequested after pruning: {unrequested}')
    snap1 = snapshot(work, a.matcaps)
    if snap0 != snap1:
        changed = sorted({x[0] for x in set(snap0) ^ set(snap1)})
        print(f'WARNING: work/ changed after the copy was taken ({changed[:12]}). The release is a consistent copy of the EARLIER state; re-run to pick up the edits.')
    if os.path.isdir(out): shutil.rmtree(out)
    os.rename(tmp, out)
    files = list_files(out)
    total = sum(os.path.getsize(os.path.join(out, f)) for f in files)
    summary = {'files': len(files), 'bytes': total, 'pruned': result['pruned'], 'keep': keep,
               'marks': {p: r['marks'] for p, r in res.items()},
               'requested_in_either_mode': sorted(requested)}
    json.dump(summary, open(os.path.join(SP, 'pack-out', 'assemble-report.json'), 'w'), indent=1)
    print(f'release: {out}  {len(files)} files, {total:,} bytes ({total / 1e6:.1f} MB)')
    for p, r in res.items():
        m = r['marks']; print(f"  {p}: first render {m['firstRender']:,} bytes in {m['firstRenderRequests']} requests; detail switch +{m['afterDetail'] - m['afterViews']:,} bytes")
    print(f'  report: {os.path.join(SP, "pack-out", "assemble-report.json")}')


if __name__ == '__main__':
    main()
