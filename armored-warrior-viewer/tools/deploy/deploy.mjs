#!/usr/bin/env node
// Static-site deploy to Vercel through the REST API, using curl for all network I/O.
// Node 22, no npm dependencies. Never handles a real token: the egress proxy injects the
// Authorization header for api.vercel.com. See README.md next to this file.
//
// Endpoints used (checked against the Vercel REST docs, see README "API facts"):
//   POST /v2/files                 body = raw bytes; headers Content-Length, x-vercel-digest (sha1 hex)
//   POST /v13/deployments          JSON: { name, project, target?, files:[{file,sha,size}], projectSettings }
//   GET  /v13/deployments/{id}     poll readyState until READY / ERROR / CANCELED
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join, resolve, sep } from 'node:path';

const MB = 1024 * 1024;
const USAGE = `Usage: node deploy.mjs [dir] [options]

  dir                      folder to publish (default: current directory)
  --name <project>         Vercel project name (default: armored-warrior-3d-viewer)
  --prod                   production deployment (default: preview)
  --team <id|slug>         team scope; "team_..." is sent as teamId, anything else as slug
  --dry-run                walk + hash + print the plan; NO network calls
  --print-requests         print the exact curl commands (contents elided); NO network calls
  --ignore <glob>          extra ignore pattern (repeatable). Matches a path or a basename.
                           Built in: node_modules, *.log, Thumbs.db, and every dotfile/dotdir
  --concurrency <n>        parallel uploads (default 4, max 8)
  --upload-all             upload every file instead of only the ones the API reports missing
  --force-new              ask Vercel not to de-duplicate against a previous identical deployment
  --max-file-mb <n>        warn/fail threshold per file (default 100; UNVERIFIED limit, see README)
  --no-wait                do not poll after creating the deployment
  --wait-seconds <n>       polling budget (default 600)
  --api <url>              API base (default https://api.vercel.com)
  -h, --help

Env: VERCEL_DUMMY_AUTH  optional DUMMY value sent as "Authorization: Bearer <value>" in case the
                        proxy refuses header-less requests. Never put a real token here.`;

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { dir: '.', name: 'armored-warrior-3d-viewer', prod: false, team: null, dryRun: false,
    printRequests: false, ignore: [], concurrency: 4, uploadAll: false, forceNew: false,
    maxFileMb: 100, wait: true, waitSeconds: 600, api: 'https://api.vercel.com' };
  const need = (i, f) => { if (i + 1 >= argv.length) usageErr(`${f} needs a value`); return argv[i + 1]; };
  let dirSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': console.log(USAGE); process.exit(0); break;
      case '--name': o.name = need(i++, a); break;
      case '--prod': o.prod = true; break;
      case '--team': o.team = need(i++, a); break;
      case '--dry-run': o.dryRun = true; break;
      case '--print-requests': o.printRequests = true; break;
      case '--ignore': o.ignore.push(need(i++, a)); break;
      case '--concurrency': o.concurrency = Math.max(1, Math.min(8, Number(need(i++, a)) || 4)); break;
      case '--upload-all': o.uploadAll = true; break;
      case '--force-new': o.forceNew = true; break;
      case '--max-file-mb': o.maxFileMb = Number(need(i++, a)); break;
      case '--no-wait': o.wait = false; break;
      case '--wait-seconds': o.waitSeconds = Number(need(i++, a)) || 600; break;
      case '--api': o.api = need(i++, a).replace(/\/+$/, ''); break;
      default:
        if (a.startsWith('-')) usageErr(`unknown option ${a}`);
        if (dirSet) usageErr(`unexpected extra argument ${a}`);
        o.dir = a; dirSet = true;
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(o.name) || o.name.includes('---'))
    usageErr(`invalid project name "${o.name}" (lowercase letters, digits, ".", "_", "-"; max 100; no "---")`);
  if (!/^https:\/\//.test(o.api) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(o.api))
    usageErr('--api must be an https:// URL (TLS verification is never disabled); plain http is accepted for loopback test servers only');
  return o;
}
function usageErr(msg) { console.error(`error: ${msg}\n\n${USAGE}`); process.exit(2); }

// ---------------------------------------------------------------- walk
function globToRegex(g) {
  const re = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${re}$`);
}
function makeIgnorer(extra) {
  const rx = ['node_modules', '*.log', 'Thumbs.db', ...extra].map((g) => ({ g, re: globToRegex(g.replace(/\/+$/, '')) }));
  return (rel, name) => rx.some(({ re }) => re.test(name) || re.test(rel));
}

function walk(root, ignored) {
  const files = [], problems = [], skipped = [];
  const stack = new Set(); // real paths of directories currently being walked (symlink loop guard)
  (function rec(absDir, relDir) {
    let real; try { real = realpathSync(absDir); } catch { return; }
    if (stack.has(real)) { problems.push({ kind: 'symlink-loop', path: relDir || '.', note: 'directory symlink loop, not followed' }); return; }
    stack.add(real);
    for (const name of readdirSync(absDir).sort()) {
      const rel = relDir ? `${relDir}/${name}` : name;
      if (name.startsWith('.')) { skipped.push({ path: rel, why: 'dotfile' }); continue; }
      if (ignored(rel, name)) { skipped.push({ path: rel, why: 'ignore list' }); continue; }
      const abs = join(absDir, name);
      let st, isLink = false;
      try { isLink = lstatSync(abs).isSymbolicLink(); st = statSync(abs); } // statSync follows symlinks
      catch (e) { problems.push({ kind: 'broken-symlink', path: rel, note: e.code || String(e) }); continue; }
      if (st.isDirectory()) rec(abs, rel);
      else if (st.isFile()) files.push({ rel, abs, size: st.size, symlink: isLink });
      else skipped.push({ path: rel, why: 'not a regular file' });
    }
    stack.delete(real);
  })(root, '');
  return { files, problems, skipped };
}

function sha1File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha1');
    createReadStream(path).on('data', (c) => h.update(c)).on('error', rej).on('end', () => res(h.digest('hex')));
  });
}

// ---------------------------------------------------------------- plan
const fmt = (n) => (n >= MB ? `${(n / MB).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function analyse(files, problems, opts) {
  const warns = problems.map((p) => `${p.kind}: ${p.path} (${p.note})`);
  const lower = new Map();
  for (const f of files) {
    if (f.size > opts.maxFileMb * MB) warns.push(`over per-file threshold (${opts.maxFileMb} MB): ${f.rel} is ${fmt(f.size)}`);
    if (f.size === 0) warns.push(`empty file: ${f.rel}`);
    if (/[^A-Za-z0-9._~\-\/]/.test(f.rel)) warns.push(`name needs URL-encoding or is non-ASCII: ${f.rel}  ->  ${encodeURI(f.rel)}`);
    if (f.rel.includes('\\')) warns.push(`backslash in name: ${f.rel}`);
    const k = f.rel.toLowerCase();
    if (lower.has(k)) warns.push(`case-insensitive name collision: ${lower.get(k)} vs ${f.rel}`); else lower.set(k, f.rel);
    if (f.symlink) warns.push(`symlink followed: ${f.rel} (uploaded as a regular file)`);
  }
  return warns;
}

function printPlan(root, opts, files, skipped, warns) {
  const total = files.reduce((s, f) => s + f.size, 0);
  const L = console.log;
  L(`Plan (${opts.dryRun ? 'dry run, no network' : 'live'})`);
  L(`  root         ${root}`);
  L(`  project      ${opts.name}   target ${opts.prod ? 'production' : 'preview'}   scope ${opts.team ?? '(token default / personal)'}`);
  L(`  files        ${files.length}`);
  L(`  total        ${total} bytes (${fmt(total)})`);
  L(`  skipped      ${skipped.length}${skipped.length ? '  [' + skipped.slice(0, 8).map((s) => `${s.path}: ${s.why}`).join('; ') + (skipped.length > 8 ? '; ...' : '') + ']' : ''}`);
  L('  ten largest:');
  for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 10)) L(`    ${String(f.size).padStart(10)}  ${fmt(f.size).padStart(9)}  ${f.rel}`);
  if (warns.length) { L(`  SUSPICIOUS (${warns.length}):`); for (const w of warns) L(`    ! ${w}`); }
  else L('  suspicious   none');
}

// ---------------------------------------------------------------- curl
function scope(o) {
  if (!o.team) return {};
  return /^team_/.test(o.team) ? { teamId: o.team } : { slug: o.team };
}
function url(o, path, extra = {}) {
  const q = new URLSearchParams({ ...scope(o), ...extra }).toString();
  return `${o.api}${path}${q ? '?' + q : ''}`;
}
function authHeaders() {
  const d = process.env.VERCEL_DUMMY_AUTH;
  return d ? ['-H', `Authorization: Bearer ${d}`] : [];
}
let loopback = false; // set for local mock servers: bypass the egress proxy for them
const common = () => ['-sS', '--connect-timeout', '20', '--max-time', '900', ...(loopback ? ['--noproxy', '*'] : []), '-w', '\n%{http_code}'];

function uploadArgs(o, f) {
  return [...common(), '-X', 'POST', url(o, '/v2/files'), ...authHeaders(),
    '-H', 'Content-Type: application/octet-stream', '-H', `Content-Length: ${f.size}`, '-H', `x-vercel-digest: ${f.sha}`,
    '-H', 'Expect:', '--data-binary', `@${f.abs}`];
}
function deployBody(o, files) {
  const body = { name: o.name, project: o.name,
    files: files.map((f) => ({ file: f.rel, sha: f.sha, size: f.size })),
    projectSettings: { framework: null } }; // static: no framework, no build
  if (o.prod) body.target = 'production';
  return body;
}
function deployArgs(o) {
  const extra = { skipAutoDetectionConfirmation: '1' };
  if (o.forceNew) extra.forceNew = '1';
  return [...common(), '-X', 'POST', url(o, '/v13/deployments', extra), ...authHeaders(),
    '-H', 'Content-Type: application/json', '--data-binary', '@-'];
}
function pollArgs(o, id) { return [...common(), url(o, `/v13/deployments/${encodeURIComponent(id)}`), ...authHeaders()]; }

function runCurl(args, stdin) {
  return new Promise((res) => {
    const p = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => res({ code: -1, status: 0, body: '', err: String(e) }));
    p.on('close', (code) => {
      const text = Buffer.concat(out).toString('utf8');
      const i = text.lastIndexOf('\n');
      res({ code, status: Number(text.slice(i + 1)) || 0, body: i >= 0 ? text.slice(0, i) : text, err: Buffer.concat(err).toString('utf8').trim() });
    });
    p.stdin.on('error', () => {});
    p.stdin.end(stdin ?? '');
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

// request with retries on network failure / 429 / 5xx. 4xx (other than 429) returns immediately.
async function request(label, args, stdin, tries = 4) {
  let last;
  for (let a = 1; a <= tries; a++) {
    last = await runCurl(args, stdin);
    const transient = last.code !== 0 || last.status === 429 || last.status >= 500;
    if (!transient) return last;
    if (a < tries) { const ms = 1000 * 2 ** (a - 1); console.error(`  retry ${a}/${tries - 1} for ${label} in ${ms} ms (curl exit ${last.code}, http ${last.status}${last.err ? ', ' + last.err.split('\n').pop() : ''})`); await sleep(ms); }
  }
  return last;
}
function describeFailure(label, r) {
  const parts = [`${label} failed: http ${r.status || 'none'}, curl exit ${r.code}`];
  if (r.err) parts.push(`curl stderr: ${r.err}`);
  if (r.body) parts.push(`response body: ${r.body.slice(0, 2000)}`);
  if (r.status === 0) parts.push('(no HTTP response: is api.vercel.com allowed by the egress proxy? see README)');
  if (r.status === 401 || r.status === 403) parts.push('(auth refused: the proxy should add the Authorization header for api.vercel.com; if it does not, set VERCEL_DUMMY_AUTH to a dummy value; if that is refused too, the network secret is not configured yet)');
  return parts.join('\n  ');
}

async function pool(items, n, worker) {
  let i = 0, failed = null;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (!failed && i < items.length) { const it = items[i++]; try { await worker(it); } catch (e) { failed = failed ?? e; } }
  }));
  if (failed) throw failed;
}

// ---------------------------------------------------------------- printing curl for review
const q = (s) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const redact = (a) => a.map((x) => x.replace(/^(Authorization: Bearer ).+$/, '$1<dummy-from-VERCEL_DUMMY_AUTH>'));
const show = (args) => `curl ${redact(args).map(q).join(' ')}`;

function printRequests(o, files) {
  const L = console.log;
  L('# Requests this run would make (nothing is sent). Contents are referenced by path, not printed.');
  L(`# Authorization header: ${process.env.VERCEL_DUMMY_AUTH ? 'dummy from VERCEL_DUMMY_AUTH' : 'NONE (the proxy adds it for api.vercel.com)'}`);
  L('# 1. optional probe: create the deployment first; a 400 {"error":{"code":"missing_files","missing":[sha,...]}} lists what to upload');
  L(`#    (skipped with --upload-all, in which case all ${files.length} uploads below run first)`);
  L('#');
  L('# 2. one upload per file (bounded parallelism, retries on network error/429/5xx). Showing all:');
  for (const f of files) L(show(uploadArgs(o, f)));
  L('#');
  L('# 3. create the deployment; JSON body is sent on stdin:');
  const body = deployBody(o, files);
  const eliding = { ...body, files: body.files.slice(0, 2).concat(body.files.length > 2 ? [`... ${body.files.length - 2} more {file,sha,size} entries`] : []) };
  L(`printf '%s' '${JSON.stringify(eliding)}' | ${show(deployArgs(o))}`);
  L('#');
  L('# 4. poll every 3 s until readyState is READY (production: also aliasAssigned), ERROR or CANCELED:');
  L(show(pollArgs(o, 'dpl_<id from step 3>')));
}

// ---------------------------------------------------------------- main
async function main() {
  const o = parseArgs(process.argv.slice(2));
  loopback = o.api.startsWith('http://');
  const root = resolve(o.dir);
  let st; try { st = statSync(root); } catch (e) { console.error(`error: cannot read ${root}: ${e.code}`); process.exit(2); }
  if (!st.isDirectory()) { console.error(`error: ${root} is not a directory`); process.exit(2); }

  const { files, problems, skipped } = walk(root, makeIgnorer(o.ignore));
  if (!files.length) { console.error(`error: no files found under ${root}`); process.exit(1); }
  console.error(`hashing ${files.length} files ...`);
  await pool(files, 4, async (f) => { f.sha = await sha1File(f.abs); });
  const warns = analyse(files, problems, o);
  printPlan(root, o, files, skipped, warns);

  if (o.dryRun) { console.log('\nDry run: no network calls were made.'); return; }
  if (o.printRequests) { console.log(); printRequests(o, files); return; }
  if (warns.some((w) => w.startsWith('over per-file') || w.startsWith('broken-symlink'))) {
    console.error('\nerror: refusing to deploy with the problems marked above (fix them, or raise --max-file-mb if you have verified the limit).'); process.exit(1);
  }

  const byName = new Map(files.map((f) => [f.rel, f]));
  const bySha = new Map(); for (const f of files) (bySha.get(f.sha) ?? bySha.set(f.sha, []).get(f.sha)).push(f);
  const body = JSON.stringify(deployBody(o, files));
  let uploaded = 0;
  const upload = async (list) => {
    console.log(`uploading ${list.length} file(s), ${o.concurrency} at a time ...`);
    await pool(list, o.concurrency, async (f) => {
      const r = await request(`upload ${f.rel}`, uploadArgs(o, f));
      const dup = r.status === 409 || /already[ _-]?(exists|uploaded)/i.test(r.body);
      if (!(r.status >= 200 && r.status < 300) && !dup) throw new Error(describeFailure(`upload of ${f.rel} (${fmt(f.size)}, sha1 ${f.sha})`, r));
      uploaded++; console.log(`  [${uploaded}/${list.length}] ${f.rel}  ${fmt(f.size)}${dup ? '  (already on Vercel)' : ''}`);
    });
  };

  if (o.uploadAll) { const seen = new Set(); await upload(files.filter((f) => !seen.has(f.sha) && seen.add(f.sha))); uploaded = 0; }

  let dep;
  for (let round = 0; round < 4; round++) {
    const r = await request('create deployment', deployArgs(o), body);
    if (r.status >= 200 && r.status < 300) { dep = json(r.body); if (!dep?.id) throw new Error(`create deployment: 2xx but no id in body: ${r.body.slice(0, 1000)}`); break; }
    const j = json(r.body);
    if (r.status === 400 && j?.error?.code === 'missing_files') {
      const miss = Array.isArray(j.error.missing) ? j.error.missing : null;
      const list = miss ? miss.flatMap((s) => (bySha.get(s)?.slice(0, 1) ?? [])) : [...new Map(files.map((f) => [f.sha, f])).values()];
      if (!list.length) throw new Error(describeFailure('create deployment (missing_files but nothing matches our hashes)', r));
      console.log(`API reports ${miss ? miss.length : 'unknown number of'} missing file(s).`);
      uploaded = 0; await upload(list); continue;
    }
    throw new Error(describeFailure('create deployment', r));
  }
  if (!dep) throw new Error('create deployment: still reporting missing files after 4 rounds');

  const show1 = (d) => {
    console.log(`  id      ${d.id}`);
    console.log(`  url     https://${d.url}`);
    for (const a of d.alias ?? []) console.log(`  alias   https://${a}`);
    console.log(`  state   ${d.readyState ?? d.status}${d.aliasAssigned === false ? ' (alias not yet assigned)' : ''}`);
    if (d.inspectorUrl) console.log(`  inspect ${d.inspectorUrl}`);
  };
  console.log('\ndeployment created:'); show1(dep);
  if (!o.wait) return;

  const deadline = Date.now() + o.waitSeconds * 1000;
  let cur = dep, lastState = '';
  while (Date.now() < deadline) {
    const state = cur.readyState ?? cur.status;
    if (state !== lastState) { console.log(`  ... ${state}`); lastState = state; }
    if (state === 'ERROR' || state === 'CANCELED') { console.error('\ndeployment did not succeed:'); show1(cur); if (cur.errorMessage) console.error(`  message ${cur.errorMessage}`); process.exit(1); }
    if (state === 'READY' && (!o.prod || cur.aliasAssigned !== false)) { console.log('\nfinal:'); show1(cur); return; }
    await sleep(3000);
    const r = await request('poll deployment', pollArgs(o, dep.id));
    if (r.status >= 200 && r.status < 300) { const j = json(r.body); if (j) cur = j; }
    else if (r.status === 404 || r.status === 401 || r.status === 403) throw new Error(describeFailure('poll deployment', r));
  }
  console.error(`\ntimed out after ${o.waitSeconds}s; last state ${cur.readyState ?? cur.status}. The deployment may still finish: check ${cur.inspectorUrl ?? 'the Vercel dashboard'}`);
  show1(cur); process.exit(1);
}

main().catch((e) => { console.error(`\nerror: ${e.message ?? e}`); process.exit(1); });
