import http from 'node:http'; import { createHash } from 'node:crypto';
const have = new Set(); let polls = 0; let want = null;
http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const b = Buffer.concat(chunks); const u = req.url;
    console.log(req.method, u.split('?')[0], 'auth=' + (req.headers.authorization ?? 'none'), 'len=' + req.headers['content-length'], 'ct=' + req.headers['content-type']);
    if (u.startsWith('/v2/files')) { const d = req.headers['x-vercel-digest']; const ok = createHash('sha1').update(b).digest('hex') === d && b.length == req.headers['content-length']; if (ok) have.add(d); res.writeHead(ok ? 200 : 400); return res.end(ok ? '{}' : '{"error":{"code":"bad_digest"}}'); }
    if (u.startsWith('/v13/deployments') && req.method === 'POST') { const j = JSON.parse(b); const miss = [...new Set(j.files.map(f => f.sha))].filter(s => !have.has(s)); console.log(' body keys', Object.keys(j).join(','), 'target=' + j.target, 'ps=' + JSON.stringify(j.projectSettings));
      if (miss.length) { res.writeHead(400); return res.end(JSON.stringify({ error: { code: 'missing_files', message: 'Missing files', missing: miss } })); }
      res.writeHead(200); return res.end(JSON.stringify({ id: 'dpl_mock', url: 'mock-abc.vercel.app', readyState: 'QUEUED' })); }
    if (u.startsWith('/v13/deployments/dpl_mock')) { polls++; res.writeHead(200); return res.end(JSON.stringify({ id: 'dpl_mock', url: 'mock-abc.vercel.app', readyState: polls < 2 ? 'BUILDING' : 'READY', alias: ['mock.vercel.app'], aliasAssigned: true })); }
    res.writeHead(404); res.end('{"error":{"code":"nf"}}');
  });
}).listen(18765, '127.0.0.1');
