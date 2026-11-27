// Fix check: a tier lowered by a transient failure goes back to the first tier after a context restore.
// checkFramebufferStatus reports INCOMPLETE until the test flips window.__fboOk; then lose + restore.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 860 } })).newPage();
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype; const orig = P.checkFramebufferStatus;
    P.checkFramebufferStatus = function (t) { const r = orig.call(this, t); return window.__fboOk ? r : this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT; };
  });
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  const before = await page.evaluate(() => window.__viewer.state().tier);
  await page.evaluate(() => { window.__fboOk = true; window.__lose = document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'lost');
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready');
  await page.evaluate(() => window.__viewer.whenSettled());
  const after = await page.evaluate(() => ({ tier: window.__viewer.state().tier, notes: window.__viewer.state().notes }));
  console.log(JSON.stringify({ url: process.argv[2], before, after }));
  await browser.close();
})();
