// Checks of the ?diag=1 panel at an iPhone-sized viewport: normal, forced material-shader failure,
// context loss + restore, WebGL2 unavailable, and the page without ?diag (no panel, no diag.js request).
//   node diagshot.cjs <base url> [scenario ...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, '../../shots/safari-03');
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const [base, ...wanted] = process.argv.slice(2);
const scenarios = wanted.length ? wanted : ['normal', 'shader', 'lost', 'nowebgl2', 'nodiag'];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const name of scenarios) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    if (name === 'normal') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
    const page = await context.newPage();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    if (name === 'shader') await page.addInitScript(() => {
      const P = WebGL2RenderingContext.prototype; const orig = P.shaderSource;
      P.shaderSource = function (shader, source) { if (source.includes('uSparkleCells') && !/gl_Position/.test(source)) source += '\n#error forced failure for the probe\n'; return orig.call(this, shader, source); };
    });
    if (name === 'nowebgl2') await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : orig.call(this, type, ...rest); };
    });
    await page.goto(base + (name === 'nodiag' ? '' : '?diag=1'));
    await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 240000 });
    await page.evaluate(() => window.__viewer?.whenSettled());
    const result = { name };
    if (name === 'normal') {
      // a touch drag so the drag-frame numbers fill in
      const box = await page.locator('#stage').boundingBox();
      const cdp = await context.newCDPSession(page);
      const x = box.x + box.width / 2, y = box.y + box.height * 0.6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 8, y }] }); await page.waitForTimeout(40); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.evaluate(() => window.__viewer.whenSettled());
      await page.waitForTimeout(1500);
      await page.click('#diag button');
      await page.waitForTimeout(300);
      result.clipboard = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').length + ' lines copied';
      result.copyNote = await page.evaluate(() => document.querySelector('#diag span').textContent);
    }
    if (name === 'lost') {
      await page.evaluate(() => { window.__lose = document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
      await page.waitForFunction(() => document.documentElement.dataset.viewer === 'lost');
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__lose.restoreContext());
      await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready');
      await page.evaluate(() => window.__viewer.whenSettled());
    }
    if (name !== 'normal') await page.waitForTimeout(1500);
    result.panel = await page.evaluate(() => document.querySelector('#diag pre')?.textContent ?? null);
    result.diagRequested = requests.some((u) => /\/diag\.js/.test(u));
    result.viewer = await page.evaluate(() => document.documentElement.dataset.viewer);
    await page.screenshot({ path: path.join(OUT, `diag-${name}.png`) });
    await context.close();
    console.log(`==== ${name}  viewer=${result.viewer} diag.js requested=${result.diagRequested} ${result.clipboard || ''} ${result.copyNote || ''}`);
    console.log(result.panel);
  }
  await browser.close();
})();
