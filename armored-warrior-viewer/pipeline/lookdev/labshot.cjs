const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const jobs = JSON.parse(process.argv[2]);
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.w || 700, height: j.h || 900 } });
    p.on('pageerror', e => console.log('pageerror', e.message));
    p.on('console', m => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
    await p.goto('http://localhost:8765/pipeline/lookdev/lab.html?' + j.q);
    await p.waitForFunction(() => document.title.startsWith('done'), null, { timeout: 120000 });
    if (j.title) console.log(await p.title());
    await p.screenshot({ path: j.out });
    await p.close();
  }
  await b.close();
})();
