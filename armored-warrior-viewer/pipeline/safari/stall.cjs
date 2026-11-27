// Stalled-transfer tests: one request is redirected to the stall server (first bytes, then silence).
//   node stall.cjs <base url> glb|bin|helper|slow4
const { chromium } = require('playwright');
const path = require('path');
const [url, which] = process.argv.slice(2);
const OUT = path.resolve(__dirname, '../../shots/safari-02');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 700, height: 860 } });
  const page = await context.newPage();
  const t0 = Date.now(); const log = [];
  const note = (...a) => log.push([Date.now() - t0, ...a]);
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ReadPixels/.test(m.text())) note(m.type(), m.text().slice(0, 140)); });
  page.on('pageerror', (e) => note('pageerror', e.message));
  await page.exposeFunction('__note', (s) => note('state', s));
  await page.addInitScript(() => new MutationObserver(() => window.__note(document.documentElement.dataset.viewer)).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-viewer'] }));
  const redirect = (pattern, file, bytes) => page.route(pattern, (route) => { note('stalling', route.request().url().split('/').pop()); route.continue({ url: `http://localhost:8799/stall?file=${encodeURIComponent(file)}&bytes=${bytes}` }); });
  if (which === 'slow4') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 4e6 / 8, uploadThroughput: 1e6 / 8 });
  }
  if (which === 'glb') await redirect('**/model-v10/standard-v14.glb', 'work/model-v10/standard-v14.glb', 3_000_000);
  if (which === 'helper') await redirect('**/model-v15/toonnormal_body_1024.webp', 'work/model-v15/toonnormal_body_1024.webp', 200_000);
  await page.goto(url);
  await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 400000 });
  if (which === 'bin') {
    await page.evaluate(() => window.__viewer.whenSettled());
    await redirect('**/model-v10/detail-v14.bin', 'work/model-v10/detail-v14.bin', 2_000_000);
    note('click detail');
    await page.click('#quality');
    await page.waitForFunction(() => !document.querySelector('#quality').disabled, null, { timeout: 200000 }).catch(() => note('quality never re-enabled within 200 s'));
  }
  if (which === 'helper') await page.waitForTimeout(500);
  const end = await page.evaluate(() => ({ viewer: document.documentElement.dataset.viewer, mode: document.documentElement.dataset.mode, status: document.querySelector('#status').hidden ? '' : document.querySelector('#status').textContent, quality: document.querySelector('#quality').textContent, state: window.__viewer && window.__viewer.state() }));
  if (end.state) { delete end.state.size; }
  await page.locator('#stage').screenshot({ path: path.join(OUT, `stall-${which}-${url.includes('work-safari') ? 'safari' : 'base'}.png`) });
  console.log(JSON.stringify({ which, url, elapsedMs: Date.now() - t0, end, log }, null, 1));
  await browser.close();
})();
