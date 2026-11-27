const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 700, height: 860 } });
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 600)));
  p.on('console', m => { if (m.type() === 'error' || (m.type()==='warning' && !/ReadPixels/.test(m.text()))) console.log(m.type(), m.text().slice(0, 900)); });
  await p.goto(process.argv[2]);
  await p.waitForTimeout(Number(process.argv[3] || 25000));
  console.log(await p.evaluate(() => JSON.stringify({ viewer: document.documentElement.dataset.viewer, status: document.querySelector('#status').textContent, state: window.__viewer && window.__viewer.state() })));
  await b.close();
})();
