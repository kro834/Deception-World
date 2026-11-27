// Is ?plain=1 really the unlit base colour? Compare the canvas with an independent reference: the same
// model drawn with three.js MeshBasicMaterial (map + colour factor, no lights, no tone mapping) from the
// same camera. Reports the difference on figure pixels.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 700, height: 860 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:8765/work/?plain=1');
  await p.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 120000 });
  await p.evaluate(() => window.__viewer.whenSettled());
  const ours = await p.locator('#stage canvas').screenshot();
  const size = await p.evaluate(() => { const c = document.querySelector('#stage canvas'); return [c.clientWidth, c.clientHeight, c.width, c.height]; });
  await p.close();
  // reference page
  const r = await b.newPage({ viewport: { width: 700, height: 860 } });
  r.on('pageerror', (e) => console.log('ref pageerror', e.message));
  await r.goto(`http://localhost:8765/pipeline/lookdev/reference.html?w=${size[0]}&h=${size[1]}&bw=${size[2]}`);
  await r.waitForFunction(() => document.title === 'done', null, { timeout: 120000 });
  const ref = await r.locator('canvas').screenshot();
  const result = await r.evaluate(async ([a, c]) => {
    const load = async (data) => { const i = new Image(); i.src = 'data:image/png;base64,' + data; await i.decode(); const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const x = cv.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
    const A = await load(a), R = await load(c);
    if (A.width !== R.width || A.height !== R.height) return { error: 'size mismatch ' + [A.width, A.height, R.width, R.height] };
    let n = 0, sum = 0, max = 0, over2 = 0, edge = 0; const hist = new Array(8).fill(0);
    const isBg = (i) => R.data[i] > 250 && R.data[i + 1] < 5 && R.data[i + 2] > 250;
    for (let y = 1; y < A.height - 1; y++) for (let x = 1; x < A.width - 1; x++) {
      const i = (y * A.width + x) * 4;
      if (isBg(i)) continue;
      // skip silhouette pixels (antialiasing / scaling differences): any background neighbour
      if (isBg(i - 4) || isBg(i + 4) || isBg(i - A.width * 4) || isBg(i + A.width * 4)) { edge++; continue; }
      const dd = Math.max(Math.abs(A.data[i] - R.data[i]), Math.abs(A.data[i + 1] - R.data[i + 1]), Math.abs(A.data[i + 2] - R.data[i + 2]));
      n++; sum += dd; max = Math.max(max, dd); if (dd > 2) over2++; hist[Math.min(7, dd)]++;
    }
    return { size: [A.width, A.height], figurePixels: n, silhouetteSkipped: edge, meanAbsDiff: +(sum / n).toFixed(3), maxDiff: max, shareOver2: +(over2 / n).toFixed(4), histogram0to7plus: hist };
  }, [ours.toString('base64'), ref.toString('base64')]);
  console.log(JSON.stringify(result));
  require('fs').writeFileSync(process.argv[2] + '/plain-ours.png', ours); require('fs').writeFileSync(process.argv[2] + '/plain-reference.png', ref);
  await b.close();
})().catch((e) => { console.error('plaincheck failed:', e.message); process.exit(1); });
