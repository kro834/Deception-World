// #fit checks at 390x844 (dpr 3, touch): the throwaway page pipeline/safari/fittest/ (full-bleed stage,
// #fit = top 91 px, bottom 184 px, outlined) -> front, a close-up, an orbit and a zoom, with state().fit.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '../../shots/safari-04');
require('fs').mkdirSync(OUT, { recursive: true });
const url = process.argv[2] || 'http://localhost:8765/pipeline/safari/fittest/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  const settle = () => page.evaluate(() => window.__viewer.whenSettled()).then(() => page.waitForTimeout(300));
  await settle();
  const shots = [['front', null], ['face', () => document.querySelector('[data-view="face"]').click()], ['belt', () => document.querySelector('[data-view="belt"]').click()],
    ['orbit35', () => window.__viewer.setOrbit(35, 82)], ['orbit200-high', () => window.__viewer.setOrbit(200, 60)], ['zoom2', () => window.__viewer.setOrbit(0, 82, 2, 0.8)]];
  for (const [name, action] of shots) {
    if (action) { await page.evaluate(action); await settle(); }
    await page.screenshot({ path: path.join(OUT, `fit-${name}.png`) });
    const state = await page.evaluate(() => window.__viewer.state());
    console.log(name, JSON.stringify(state.fit), state.view, state.tier);
  }
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
