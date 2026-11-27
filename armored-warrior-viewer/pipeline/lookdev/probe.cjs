// Print values from the page (look-dev aid): node probe.cjs "<url>" "<js expression returning JSON-able>"
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 700, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') console.log(m.type(), m.text().slice(0, 400)); });
  await p.goto(process.argv[2]);
  await p.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await p.evaluate(() => window.__viewer.whenSettled());
  console.log(JSON.stringify(await p.evaluate(process.argv[3] || '(() => window.__viewer.state())()')));
  if (process.argv[4]) await p.locator('#stage').screenshot({ path: process.argv[4] });
  await b.close();
})();
