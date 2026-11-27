#!/usr/bin/env node
// PLACEHOLDER portrait stills for ui2-a: renders each preset view with the real viewer at one phone
// size, hides the page chrome, and crops the 5:8 rectangle that the page's poster occupies (contain
// fit, centred in #fit). With these files in <sandbox>/previews-v15p/ the poster and the live canvas
// show the same pixels at that size, which proves the page side of the no-jump rule.
// The lead replaces them with real captures (see docs/UI2-BRIEF.md).
//
//   NODE_PATH=/opt/node-tools/node_modules node pipeline/ui2-a/placeholder-stills.cjs \
//     --url http://localhost:8765/ui2-a/ --out pipeline/ui2-a/stills-png [--size 390x844] [--dpr 2]
// then: venv/bin/python -I pipeline/ui2-a/png2webp.py pipeline/ui2-a/stills-png ui2-a/previews-v15p
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, ''); const n = process.argv[i + 1];
  if (n === undefined || n.startsWith('--')) args[k] = true; else { args[k] = n; i++; }
}
const url = args.url || 'http://localhost:8765/ui2-a/';
const out = path.resolve(args.out || 'pipeline/ui2-a/stills-png');
const [w, h] = (args.size || '390x844').split('x').map(Number);
const dpr = Number(args.dpr || 2);
const views = (args.views || 'front,rear,side,face,chest,belt,belt-rear').split(',');
const RATIO = 0.625;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  // Square stills only while capturing, so a stale portrait set cannot leak into the capture.
  await page.route('**/previews-v15p/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 300000 });
  await page.addStyleTag({ content: '.topbar,.dock,.load-line{visibility:hidden!important}#stage::before,#stage::after{display:none!important}' });
  for (const view of views) {
    await page.evaluate((v) => document.querySelector(`[data-view="${v}"]`).click(), view);
    await page.evaluate(() => window.__viewer.whenSettled());
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => { const r = document.querySelector('#fit').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    // The poster box: contain-fit of a 5:8 image in the fit rectangle, centred.
    const bw = Math.min(fit.width, fit.height * RATIO);
    const bh = Math.min(fit.height, fit.width / RATIO);
    const clip = { x: fit.x + (fit.width - bw) / 2, y: fit.y + (fit.height - bh) / 2, width: bw, height: bh };
    const file = path.join(out, `${view}.png`);
    await page.screenshot({ path: file, clip });
    console.log(view, JSON.stringify(fit), '->', JSON.stringify(clip));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
