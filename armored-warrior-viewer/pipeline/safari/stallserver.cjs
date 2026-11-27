// Test helper on port 8799 (not the site's server): serves the first N bytes of a file from SP and
// then holds the connection open without sending more, i.e. a stalled transfer.
//   GET /stall?file=work/model-v10/standard-v14.glb&bytes=2000000
const http = require('http');
const fs = require('fs');
const path = require('path');
const SP = path.resolve(__dirname, '../..');
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(SP, u.searchParams.get('file'));
  const bytes = Number(u.searchParams.get('bytes') || 0);
  const data = fs.readFileSync(file);
  const type = file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Length': data.length, 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.write(data.subarray(0, Math.min(bytes, data.length)));
  // never ends
}).listen(8799, () => console.log('stall server on 8799'));
