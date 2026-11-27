#!/usr/bin/env node
// Logs every request the page makes: first render (standard), every view button, then the detail switch.
//   NODE_PATH=/opt/node-tools/node_modules node crawl.cjs --url http://localhost:8765/release/ --profile desktop|mobile --out log.json
// Software GL (SwiftShader): byte counts and URLs are meaningful, timings are not and are not recorded.
const { chromium } = require('playwright');
const fs = require('fs');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const standardOnly = args.standardOnly === '1';
const url = args.url, profile = args.profile || 'desktop', out = args.out, timeout = Number(args.timeout || 300000);
const views = ['front', 'rear', 'side', 'face', 'chest', 'belt', 'belt-rear'];
const profiles = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext(profiles[profile]);
  const page = await context.newPage();
  page.setDefaultTimeout(timeout); // software GL on a shared machine can stall the main thread for a minute
  const requests = [];
  const problems = [];
  let phase = 'load';
  page.on('response', (r) => {
    if (!/^https?:/.test(r.url())) return; // blob:/data: are decoded in-page, not network traffic
    const h = r.headers();
    requests.push({ url: r.url(), status: r.status(), bytes: Number(h['content-length'] || 0), type: r.request().resourceType(), phase });
  });
  page.on('requestfailed', (r) => problems.push({ type: 'requestfailed', text: r.url() }));
  page.on('pageerror', (e) => problems.push({ type: 'pageerror', text: String(e.message).slice(0, 400) }));
  page.on('console', (m) => { if (m.type() === 'error') problems.push({ type: 'console.error', text: m.text().slice(0, 400) }); });
  const settled = () => page.evaluate(async () => { await window.__viewer.whenSettled(); });
  const ready = () => page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout });

  const marks = {};
  await page.goto(url, { waitUntil: 'load' });
  await ready(); await settled();
  phase = 'standard-views';
  marks.firstRender = requests.reduce((s, r) => s + r.bytes, 0);
  marks.firstRenderRequests = requests.length;
  for (const v of views) { await page.click(`[data-view="${v}"]`); await settled(); }
  await page.click('[data-view="front"]'); await settled();
  marks.afterViews = requests.reduce((s, r) => s + r.bytes, 0);
  if (standardOnly) {
    const st = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, viewer: document.documentElement.dataset.viewer, extra: window.__viewer.state() }));
    await browser.close();
    if (out) fs.writeFileSync(out, JSON.stringify({ url, profile, marks, state: st, problems, requests }, null, 1));
    const bad0 = requests.filter((r) => r.status >= 400);
    console.log(`${profile} (standard only): ${requests.length} requests, first render ${(marks.firstRender / 1e6).toFixed(2)} MB, errors ${bad0.length}, problems ${problems.length}`);
    return;
  }
  phase = 'detail';
  await page.click('#quality');
  await page.waitForFunction(() => { const b = document.querySelector('#quality'); return b && !b.disabled && b.getAttribute('aria-pressed') === 'true'; }, null, { timeout });
  await settled();
  marks.afterDetail = requests.reduce((s, r) => s + r.bytes, 0);
  marks.detailRequests = requests.filter((r) => r.phase === 'detail').length;
  const state = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, viewer: document.documentElement.dataset.viewer, extra: window.__viewer.state() }));
  await browser.close();
  const result = { url, profile, marks, state, problems, requests };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
  const bad = requests.filter((r) => r.status >= 400);
  console.log(`${profile}: ${requests.length} requests, first render ${(marks.firstRender / 1e6).toFixed(2)} MB (${marks.firstRenderRequests} req), detail switch +${((marks.afterDetail - marks.afterViews) / 1e6).toFixed(2)} MB, errors ${bad.length}, problems ${problems.length}`);
})().catch((e) => { console.error('crawl failed:', e.message); process.exit(1); });
