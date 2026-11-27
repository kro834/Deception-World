// Close studies: node study.cjs <url> <outDir> name:azimuth:polar:zoom:height[,...] [WxH] [dpr] [detail]
// Uses window.__viewer.setOrbit(azimuth, polar, zoom, height) and captures #stage.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out, spec, size = '900x1100', dpr = '1', mode = 'standard'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: Number(dpr) });
  const problems = [];
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message.slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') problems.push('console ' + m.text().slice(0, 300)); });
  await p.goto(url);
  await p.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 180000 });
  if (mode === 'detail') {
    await p.click('#quality');
    await p.waitForFunction(() => { const q = document.querySelector('#quality'); return q && !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 240000 });
  }
  for (const item of spec.split(',')) {
    const [name, az, polar, zoom, h] = item.split(':');
    await p.evaluate(async ([a, pl, z, hh]) => { window.__viewer.setOrbit(a, pl, z, hh); await window.__viewer.whenSettled(); }, [Number(az), Number(polar || 82), Number(zoom || 1), h === undefined || h === '' ? null : Number(h)]);
    await p.waitForTimeout(100);
    await p.locator('#stage').screenshot({ path: `${out}/${name}.png` });
  }
  const state = await p.evaluate(() => window.__viewer.state());
  console.log(`study: ${spec.split(',').length} -> ${out}  maps ${JSON.stringify(state.maps)} brush ${state.brush} notes ${JSON.stringify(state.notes)} problems ${problems.length}`);
  for (const line of problems.slice(0, 5)) console.log('  ' + line);
  await b.close();
})().catch((e) => { console.error('study.cjs failed:', e.message); process.exit(1); });
