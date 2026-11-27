// Debug: belt close-up on the #fit test page with parts of the page hidden, to find the overlay.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto('http://localhost:8765/pipeline/safari/fittest/?tier=forward');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.setOrbit(0, 90, 3, 0.57));
  await page.evaluate(() => window.__viewer.whenSettled());
  for (const [name, css] of [['none', ''], ['nodock', '.dock{display:none!important}'], ['nohead', '.masthead{display:none!important}'], ['noframe', '.stage-frame,.stage-hud,.stage-progress,.poster-slot{display:none!important}']]) {
    await page.evaluate((c) => { let s = document.querySelector('#dbg'); if (!s) { s = document.createElement('style'); s.id = 'dbg'; document.head.append(s); } s.textContent = c; }, css);
    await page.evaluate(() => window.__viewer.setOrbit(0, 90, 3, 0.57));
    await page.evaluate(() => window.__viewer.whenSettled());
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(__dirname, `../../shots/safari-04/layer-${name}.png`) });
  }
  await browser.close();
})();
