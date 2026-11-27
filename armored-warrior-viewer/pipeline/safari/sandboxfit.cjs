// Smoke test: each ui2 sandbox at 390x844 with the patched viewer: state, fit rectangle, screenshot.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const name of ['ui2-a', 'ui2-b', 'ui2-c']) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:8765/${name}/`);
    const ok = await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 240000 }).then(() => true, () => false);
    if (ok) await page.evaluate(() => window.__viewer?.whenSettled());
    const state = await page.evaluate(() => ({ viewer: document.documentElement.dataset.viewer, fit: window.__viewer?.state().fit, fitBox: (() => { const f = document.querySelector('#fit'); if (!f) return null; const r = f.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); })() }));
    await page.screenshot({ path: path.resolve(__dirname, `../../shots/safari-04/sandbox-${name}.png`) });
    console.log(name, JSON.stringify(state), JSON.stringify(errors));
    await page.context().close();
  }
  await browser.close();
})();
