// What a browser without import maps (Safari / iOS < 16.4) gets: index.html is served with the
// <script type="importmap"> block removed (via request interception; nothing under work/ changes).
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '../../shots/safari-01');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('http://localhost:8765/work/', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
    await route.fulfill({ response, body });
  });
  await page.goto('http://localhost:8765/work/');
  await page.waitForTimeout(15000);
  const info = await page.evaluate(() => ({ viewer: document.documentElement.dataset.viewer, status: document.querySelector('#status').textContent, statusHidden: document.querySelector('#status').hidden, poster: !document.querySelector('#poster').hidden, quality: document.querySelector('#quality').disabled, hasViewer: !!window.__viewer }));
  await page.screenshot({ path: path.join(OUT, 'no-importmap.png') });
  console.log(JSON.stringify({ info, errors }, null, 1));
  await browser.close();
})();
