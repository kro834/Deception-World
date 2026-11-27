// Fix check (10a): how many frames are drawn after the last pointer move of a drag, until settled.
// Frames = bursts of draw calls (gaps < 30 ms within a frame). Also screenshots the settled frame.
//   node settlecount.cjs <url> <out.png>
const { chromium } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 860 } })).newPage();
  await page.addInitScript(() => {
    window.__drawTimes = []; window.__lastMove = 0; const P = WebGL2RenderingContext.prototype;
    for (const name of ['drawArrays', 'drawElements']) { const f = P[name]; P[name] = function (...a) { window.__drawTimes.push(performance.now()); return f.apply(this, a); }; }
    addEventListener('pointermove', () => { window.__lastMove = performance.now(); }, true);
  });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => window.__viewer.whenSettled());
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const times = window.__drawTimes.filter((t) => t >= window.__lastMove);
    let frames = 0; let prev = -1e9; const sizes = [];
    for (const t of times) { if (t - prev > 30) { frames++; sizes.push(0); } sizes[sizes.length - 1]++; prev = t; }
    return { framesAfterLastMove: frames, drawsPerFrame: sizes, tier: window.__viewer.state().tier, paintable: window.__viewer.state().brush };
  });
  await page.locator('#stage').screenshot({ path: out });
  console.log(JSON.stringify({ url, ...r }));
  await browser.close();
})();
