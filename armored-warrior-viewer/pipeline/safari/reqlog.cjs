// Request log up to the settled first frame (and optionally the detail switch) for one URL.
//   node reqlog.cjs <url> [--detail] [--mobile] [--out file.json]
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const url = args.find((a) => /^http/.test(a));
const detail = args.includes('--detail');
const mobile = args.includes('--mobile');
const outIndex = args.indexOf('--out');
const shotIndex = args.indexOf('--shot');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA } : { viewport: { width: 700, height: 860 } });
  const page = await context.newPage();
  const t0 = Date.now();
  const list = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('request', (r) => { if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) list.push({ url: r.url().replace(/^http:\/\/localhost:8765/, ''), start: Date.now() - t0, phase: 'standard', r }); });
  await page.goto(url);
  await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 300000 });
  const readyMs = Date.now() - t0;
  await page.evaluate(() => window.__viewer && window.__viewer.whenSettled());
  await page.waitForTimeout(800);
  const state1 = await page.evaluate(() => window.__viewer && window.__viewer.state());
  if (detail) {
    const mark = list.length;
    await page.click('#quality');
    await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 400000 });
    await page.evaluate(() => window.__viewer.whenSettled());
    await page.waitForTimeout(800);
    for (const item of list.slice(mark)) item.phase = 'detail';
  }
  if (shotIndex > 0) await page.locator('#stage').screenshot({ path: args[shotIndex + 1] });
  const rows = [];
  for (const item of list) {
    const response = await item.r.response().catch(() => null);
    let bytes = 0;
    try { bytes = Number(response && (await response.headerValue('content-length'))) || 0; } catch (e) { /* */ }
    rows.push({ phase: item.phase, start: item.start, status: response ? response.status() : 'failed', bytes, url: item.url });
  }
  await browser.close();
  const sum = (phase) => rows.filter((r) => r.phase === phase && r.status === 200).reduce((a, r) => a + r.bytes, 0);
  const result = { url, mobile, readyMs, tier: state1 && state1.tier, maps: state1 && state1.maps, totals: { standard: sum('standard'), detail: sum('detail') }, counts: { standard: rows.filter((r) => r.phase === 'standard').length, detail: rows.filter((r) => r.phase === 'detail').length }, errors, rows };
  if (outIndex > 0) fs.writeFileSync(args[outIndex + 1], JSON.stringify(result, null, 1));
  for (const r of rows) console.log(r.phase.padEnd(8), String(r.start).padStart(6), String(r.status).padStart(6), String(r.bytes).padStart(9), r.url);
  console.log(JSON.stringify({ readyMs, tier: result.tier, totals: result.totals, counts: result.counts, errors }));
})();
