// Debug: compare the diag panel's frame time with the wall time of a full render around setOrbit.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  await page.goto(process.argv[2] + '?diag=1');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(async (a) => {
      const t0 = performance.now(); window.__viewer.setOrbit(a, 82); const t1 = performance.now();
      await new Promise((r) => setTimeout(r, 1500));
      return { wallMs: Math.round(t1 - t0), panel: document.querySelector('#diag pre').textContent.split('\n').find((l) => l.startsWith('frame')), last: window.__viewer.state().lastFullMs };
    }, 20 + i * 20);
    console.log(JSON.stringify(r));
  }
  await browser.close();
})();
