// Debug: read the WebGL drawing buffer itself (toDataURL in the task that rendered it) on the test page.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  const data = await page.evaluate(() => { window.__viewer.setOrbit(0, 90, 3, 0.57); return document.querySelector('#stage canvas').toDataURL('image/png'); });
  fs.writeFileSync(process.argv[3], Buffer.from(data.split(',')[1], 'base64'));
  console.log(JSON.stringify(await page.evaluate(() => { const c = document.querySelector('#stage canvas'); return { w: c.width, h: c.height, css: getComputedStyle(c).height, opacity: getComputedStyle(c).opacity }; })));
  await browser.close();
})();
