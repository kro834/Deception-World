// Debug for the #fit page: element rectangles, and the face close-up at tier full / lite / forward.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const tier of ['full', 'lite', 'forward']) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR || 1), isMobile: true, hasTouch: true })).newPage();
    await page.goto(`http://localhost:8765/pipeline/safari/fittest/?tier=${tier}`);
    await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
    await page.evaluate((view) => document.querySelector(`[data-view="${view}"]`).click(), process.env.VIEW || 'face');
    await page.evaluate(() => window.__viewer.whenSettled());
    const rects = await page.evaluate(() => Object.fromEntries(['#stage', '#stage canvas', '#fit', '.masthead', '.dock'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.top, r.width, r.height].map(Math.round).join(',')]; })));
    console.log(tier, JSON.stringify(rects), JSON.stringify(await page.evaluate(() => window.__viewer.state().size)));
    await page.screenshot({ path: path.resolve(__dirname, `../../shots/safari-04/debug-${process.env.VIEW || 'face'}-${tier}-dpr${process.env.DPR || 1}.png`) });
    await page.context().close();
  }
  await browser.close();
})();
