// Fix check: lose the context and never restore it; the page should stop saying "recovering".
// Then restore late (after the timeout) to check it still recovers.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 860 } })).newPage();
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  const t0 = Date.now();
  await page.evaluate(() => { window.__lose = document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  const snap = () => page.evaluate(() => ({ viewer: document.documentElement.dataset.viewer, status: document.querySelector('#status').textContent, poster: !document.querySelector('#poster').hidden }));
  await page.waitForTimeout(5000); const at5 = await snap();
  await page.waitForTimeout(7000); const at12 = await snap();
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForTimeout(4000); const late = await snap();
  console.log(JSON.stringify({ url: process.argv[2], at5, at12, lateRestore: late, ms: Date.now() - t0 }));
  await browser.close();
})();
