// Debug: belt close-up with different #fit insets; does the cut line follow the insets?
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto('http://localhost:8765/pipeline/safari/fittest/?tier=forward');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => document.querySelector('[data-view="belt"]').click());
  for (const [top, bottom] of [[91, 184], [91, 300], [200, 184], [0, 0]]) {
    await page.evaluate(([t, b]) => { const f = document.querySelector('#fit'); f.style.top = t + 'px'; f.style.bottom = b + 'px'; }, [top, bottom]);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__viewer.whenSettled());
    await page.screenshot({ path: path.resolve(__dirname, `../../shots/safari-04/fitmove-${top}-${bottom}.png`) });
    console.log(top, bottom, JSON.stringify(await page.evaluate(() => window.__viewer.state().fit)));
  }
  await browser.close();
})();
