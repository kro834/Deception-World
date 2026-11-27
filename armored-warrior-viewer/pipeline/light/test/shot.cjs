// node pipeline/light/test/shot.cjs <outdir> <query1> [<query2> ...]   (each query: name=view&...)
// e.g. node shot.cjs ../out/shots/i01 "front:view=front" "rear:view=rear" "chest:view=chest"
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [out, ...jobs] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  for (const job of jobs) {
    const i = job.indexOf(':');
    const name = job.slice(0, i), q = job.slice(i + 1);
    await page.goto(`http://localhost:8765/pipeline/light/test/index.html?${q}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 300000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('shot', name);
  }
  await browser.close();
})();
