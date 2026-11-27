#!/usr/bin/env python3
"""Build the hand-over zip from SP/release for upload to a static host (ChatGPT Sites, believed to be
Cloudflare Workers static assets).

  SP/venv/bin/python tools/pack/make_zip.py [--release SP/release] [--out SP/handover]
                                            [--split-over BYTES] [--logs pack-out/logs/assemble-2] [--verify]

Output (SP/handover/):
  armored-warrior-viewer.zip     index.html at the zip root; same relative paths as release/; no vercel.json;
                                 no dot-files; no directory entries; forward slashes; fixed timestamps;
                                 MANIFEST.txt inside (excluded from itself)
  SUMMARY.txt                    count, bytes, five largest files, size warnings, how to verify
If the zip is larger than --split-over (default 45,000,000 bytes) two parts are written instead:
  armored-warrior-viewer-part1.zip   everything the standard mode needs for first render (has index.html)
  armored-warrior-viewer-part2.zip   files used only after the switch to detail mode
  each with MANIFEST-part1.txt / MANIFEST-part2.txt covering only its own files (so extracting both into
  one folder does not overwrite anything). Extract both into the SAME folder.
MANIFEST format (UTF-8, LF, tab-separated, sorted by path):
  line 1:  files=<N><TAB>bytes=<TOTAL>
  line 2+: <relative path><TAB><size in bytes><TAB><sha256 hex>
--verify: unzip into SP/pack-out/zipcheck/, check against the manifest(s), serve through the existing server
          and run the request log (both modes, desktop and phone profile): no 404 and no unrequested file.
"""
import argparse, fnmatch, hashlib, json, os, shutil, subprocess, sys, zipfile

SP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXCLUDE = ['vercel.json', 'MANIFEST*.txt']
STORED_EXT = {'.webp', '.jpg', '.jpeg', '.png', '.glb', '.bin', '.zip'}
CAP = 25 * 1024 * 1024   # believed single-file cap of the host: UNVERIFIED
WARN = 20 * 1024 * 1024
DATE = (2026, 1, 1, 0, 0, 0)


def die(m): sys.exit(f'make_zip: ERROR: {m}')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()


def files_of(root):
    out = []
    for r, dirs, fs in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for f in sorted(fs):
            if f.startswith('.'): continue
            rel = os.path.relpath(os.path.join(r, f), root).replace(os.sep, '/')
            if any(fnmatch.fnmatch(rel, g) for g in EXCLUDE): continue
            out.append(rel)
    return sorted(out)


def manifest_text(root, rels):
    rows = [(r, os.path.getsize(os.path.join(root, r)), sha(os.path.join(root, r))) for r in rels]
    head = f'files={len(rows)}\tbytes={sum(x[1] for x in rows)}\n'
    return head + ''.join(f'{r}\t{n}\t{h}\n' for r, n, h in rows)


def write_zip(path, root, rels, manifest_name):
    with zipfile.ZipFile(path + '.tmp', 'w') as z:
        def add(name, data=None, src=None):
            zi = zipfile.ZipInfo(name, DATE)
            zi.create_system = 3
            zi.external_attr = 0o100644 << 16
            zi.compress_type = zipfile.ZIP_STORED if os.path.splitext(name)[1].lower() in STORED_EXT else zipfile.ZIP_DEFLATED
            if data is not None: z.writestr(zi, data)
            else:
                with open(src, 'rb') as f, z.open(zi, 'w') as w: shutil.copyfileobj(f, w, 1 << 20)
        for r in rels: add(r, src=os.path.join(root, r))
        add(manifest_name, data=manifest_text(root, rels).encode('utf8'))
    os.replace(path + '.tmp', path)
    return os.path.getsize(path)


def check_zip(path):
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad: die(f'{path}: corrupt member {bad}')
        for i in z.infolist():
            n = i.filename
            if n.startswith('/') or '\\' in n or '..' in n.split('/') or n.endswith('/') or any(p.startswith('.') for p in n.split('/')) or i.extra:
                die(f'{path}: unacceptable member {n!r}')
        return [i.filename for i in z.infolist()]


def classify(release, rels, logprefix):
    std, anyreq = set(), set()
    for prof in ('desktop', 'mobile'):
        for tag in (logprefix,):
            p = f'{tag}-{prof}.json'
            if not os.path.isfile(p): die(f'request log {p} missing (run assemble.py first)')
            log = json.load(open(p))
            base = log['url']
            for q in log['requests']:
                if not q['url'].startswith(base): continue
                rel = q['url'][len(base):].split('?')[0] or 'index.html'
                anyreq.add(rel)
                if q['phase'] in ('load', 'standard-views'): std.add(rel)
    part1 = [r for r in rels if r in std or r == 'index.html']
    part2 = [r for r in rels if r not in part1]
    unknown = [r for r in part2 if r not in anyreq]
    if unknown: die(f'files in release that no request log mentions (cannot classify): {unknown[:6]}. Re-run assemble.py first.')
    return part1, part2


def mib(n): return f'{n / 1048576:.2f} MiB'


def verify(outdir, parts, release_rels):
    chk = os.path.join(SP, 'pack-out', 'zipcheck'); shutil.rmtree(chk, ignore_errors=True); os.makedirs(chk)
    os.chmod(chk, 0o755)
    for zp, mname in parts:
        check_zip(zp)
        with zipfile.ZipFile(zp) as z: z.extractall(chk)
    for r, d, f in os.walk(chk):
        os.chmod(r, 0o755)
        for x in f: os.chmod(os.path.join(r, x), 0o644)
    # manifest check, exactly as the receiving model would do it
    seen = set()
    for _, mname in parts:
        lines = open(os.path.join(chk, mname), encoding='utf8').read().split('\n')
        assert lines[-1] == '', 'manifest must end with LF'
        head = lines[0]; rows = [l.split('\t') for l in lines[1:-1]]
        n = int(head.split('\t')[0].split('=')[1]); total = int(head.split('\t')[1].split('=')[1])
        assert n == len(rows) and total == sum(int(r[1]) for r in rows), 'manifest header mismatch'
        assert [r[0] for r in rows] == sorted(r[0] for r in rows), 'manifest not sorted'
        for p, size, h in rows:
            fp = os.path.join(chk, p)
            if os.path.getsize(fp) != int(size) or sha(fp) != h: die(f'extracted {p} does not match {mname}')
            seen.add(p)
    extracted = {os.path.relpath(os.path.join(r, f), chk).replace(os.sep, '/') for r, _, fs in os.walk(chk) for f in fs} - {m for _, m in parts}
    if extracted != seen or seen != set(release_rels): die(f'extracted tree differs from the release: {sorted(extracted ^ set(release_rels))[:8]}')
    print(f'verify: manifest OK for {len(seen)} files; extracted tree == release minus vercel.json')
    base = f"http://localhost:8765/{os.path.relpath(chk, SP).replace(os.sep, '/')}/"
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH', '/opt/node-tools/node_modules'))
    requested, problems = set(), []
    logdir = os.path.join(SP, 'pack-out', 'logs')
    for prof in ('desktop', 'mobile'):
        of = os.path.join(logdir, f'zipcheck-{prof}.json')
        p = subprocess.run(['node', os.path.join(SP, 'tools', 'pack', 'crawl.cjs'), '--url', base, '--profile', prof, '--out', of, '--timeout', '240000'], env=env, capture_output=True, text=True)
        print('   ', p.stdout.strip() or p.stderr.strip())
        if p.returncode: die('crawl failed')
        r = json.load(open(of))
        for q in r['requests']:
            rel = q['url'][len(base):].split('?')[0] or 'index.html'
            if q['status'] == 404 and rel.startswith('previews-v15p/'): print(f'    tolerated 404 (empty portrait poster set): {rel}'); continue
            if q['status'] >= 400: problems.append(f'{prof}: {q["status"]} {rel}')
            requested.add(rel)
        for pr in r['problems']:
            if not ('Failed to load resource' in pr['text'] and '404' in pr['text']): problems.append(f'{prof}: {pr["type"]}: {pr["text"]}')
        if r['state']['mode'] != 'detail' or r['state']['viewer'] != 'ready': problems.append(f'{prof}: ended in {r["state"]}')
    unreq = sorted(seen - requested - {'index.html'})
    if problems: die('request check failed: ' + '; '.join(problems))
    if unreq: die(f'unrequested files in the zip: {unreq}')
    print('verify: request log clean (no 404 outside the empty portrait set, no unrequested file, both modes, desktop + phone)')
    if len(parts) == 2:
        for prof in ('desktop',):
            shutil.rmtree(chk); os.makedirs(chk); os.chmod(chk, 0o755)
            with zipfile.ZipFile(parts[0][0]) as z: z.extractall(chk)
            for r, d, f in os.walk(chk):
                os.chmod(r, 0o755)
                for x in f: os.chmod(os.path.join(r, x), 0o644)
            of = os.path.join(logdir, 'zipcheck-part1-desktop.json')
            p = subprocess.run(['node', os.path.join(SP, 'tools', 'pack', 'crawl.cjs'), '--url', base, '--profile', prof, '--out', of, '--standardOnly', '1', '--timeout', '240000'], env=env, capture_output=True, text=True)
            print('   ', p.stdout.strip() or p.stderr.strip())
            r = json.load(open(of))
            bad = [q['url'] for q in r['requests'] if q['status'] >= 400]
            if bad or r['state']['viewer'] != 'ready': die(f'part 1 alone does not render standard mode: {bad}')
        print('verify: part 1 alone renders standard mode with no 404')
    return chk


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--release', default=os.path.join(SP, 'release'))
    ap.add_argument('--out', default=os.path.join(SP, 'handover'))
    ap.add_argument('--split-over', type=int, default=45_000_000)
    ap.add_argument('--logs', default=os.path.join(SP, 'pack-out', 'logs', 'assemble-2'))
    ap.add_argument('--verify', action='store_true')
    a = ap.parse_args()
    release = os.path.abspath(a.release); out = os.path.abspath(a.out)
    if not os.path.isfile(os.path.join(release, 'index.html')): die(f'{release}/index.html missing')
    rels = files_of(release)
    total = sum(os.path.getsize(os.path.join(release, r)) for r in rels)
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('armored-warrior-viewer') or f == 'SUMMARY.txt': os.remove(os.path.join(out, f))
    zpath = os.path.join(out, 'armored-warrior-viewer.zip')
    size = write_zip(zpath, release, rels, 'MANIFEST.txt')
    parts = [(zpath, 'MANIFEST.txt')]
    split = size > a.split_over
    p1 = p2 = None
    if split:
        os.remove(zpath)
        p1, p2 = classify(release, rels, a.logs)
        z1 = os.path.join(out, 'armored-warrior-viewer-part1.zip'); z2 = os.path.join(out, 'armored-warrior-viewer-part2.zip')
        s1 = write_zip(z1, release, p1, 'MANIFEST-part1.txt'); s2 = write_zip(z2, release, p2, 'MANIFEST-part2.txt')
        parts = [(z1, 'MANIFEST-part1.txt'), (z2, 'MANIFEST-part2.txt')]
    for zp, _ in parts: check_zip(zp)
    largest = sorted(rels, key=lambda r: -os.path.getsize(os.path.join(release, r)))[:5]
    L = [f'Armored Warrior viewer: hand-over summary', f'release folder: {release}',
         f'files (excluding MANIFEST*.txt and vercel.json): {len(rels)}', f'total bytes: {total} ({mib(total)})', '', 'five largest files:']
    L += [f'  {os.path.getsize(os.path.join(release, r)):>10}  {mib(os.path.getsize(os.path.join(release, r))):>10}  {r}' for r in largest]
    over = [(r, os.path.getsize(os.path.join(release, r))) for r in rels if os.path.getsize(os.path.join(release, r)) > WARN]
    L += ['', 'single-file size check (host believed to cap one file at 25 MiB = 26214400 bytes; UNVERIFIED):']
    L += [f'  FLAG over 20 MiB: {r}  {n} bytes ({mib(n)}){"  OVER 25 MiB" if n > CAP else ""}' for r, n in over] or ['  no file above 20 MiB']
    L += ['', 'zip files:']
    for zp, mn in parts: L.append(f'  {os.path.basename(zp)}  {os.path.getsize(zp)} bytes ({mib(os.path.getsize(zp))})  manifest inside: {mn}')
    if split:
        L += ['', f'SPLIT because the single zip would exceed {a.split_over} bytes.',
              f'  part1 = everything the standard mode needs for first render, has index.html at the root ({len(p1)} files)',
              f'  part2 = files requested only after switching to detail mode ({len(p2)} files)',
              '  Extract BOTH zips into the SAME folder. Each manifest covers only its own zip; the folder is complete when both pass.',
              '  Part 1 alone is a working site in standard mode (the detail button would fail without part 2).']
    L += ['', 'how to check an extracted tree against MANIFEST.txt (tab-separated; line 1 = files=N<TAB>bytes=TOTAL):',
          '  tail -n +2 MANIFEST.txt | while IFS=$\'\\t\' read -r p n h; do [ "$(stat -c %s "$p")" = "$n" ] && [ "$(sha256sum "$p" | cut -d" " -f1)" = "$h" ] || echo "BAD $p"; done',
          'nothing was published; vercel.json is intentionally not included.']
    open(os.path.join(out, 'SUMMARY.txt'), 'w', encoding='utf8').write('\n'.join(L) + '\n')
    print('\n'.join(L))
    if a.verify: verify(out, parts, rels)


if __name__ == '__main__':
    main()
