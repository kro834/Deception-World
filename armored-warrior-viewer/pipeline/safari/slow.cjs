// Standard-mode load over a throttled link (CDP network emulation): does the 45 s abort in
// viewer.js fire while bytes are still arriving? Usage: node slow.cjs <Mbit/s>
const { chromium } = require('playwright');
const path = require('path');
const mbit = Number(process.argv[2] || 4);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: mbit * 1e6 / 8, uploadThroughput: 1e6 / 8 });
  const t0 = Date.now(); const states = [];
  page.on('console', (m) => { if (m.type() === 'error') states.push([Date.now() - t0, 'console: ' + m.text().slice(0, 120)]); });
  await page.exposeFunction('__note', (s, p) => states.push([Date.now() - t0, s, p]));
  await page.addInitScript(() => new MutationObserver(() => window.__note(document.documentElement.dataset.viewer, document.querySelector('#progress')?.textContent)).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-viewer'] }));
  await page.goto('http://localhost:8765/work/');
  await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 200000 });
  const end = await page.evaluate(() => ({ viewer: document.documentElement.dataset.viewer, status: document.querySelector('#status').textContent, quality: document.querySelector('#quality').textContent }));
  await page.screenshot({ path: path.resolve(__dirname, `../../shots/safari-01/slow-${mbit}mbit.png`) });
  console.log(JSON.stringify({ mbit, elapsedMs: Date.now() - t0, end, states }, null, 1));
  await browser.close();
})();
