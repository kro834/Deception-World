#!/usr/bin/env node
// Screenshot harness for the 3D viewer (headless Chromium, software GL).
//
//   node tools/shot.cjs --url http://localhost:8765/work/ --out shots/r01
//     [--size 900x1100] [--dpr 1] [--mode standard|detail] [--clip stage|page]
//     [--views front,rear,side,face,chest,belt,belt-rear]   (use --views none to skip)
//     [--orbits q34:35:82,rear34:215:82]   name:azimuthDeg[:polarDeg]; azimuth 0 = front, 90 = side, 180 = rear
//     [--settle 1500] [--timeout 300000] [--mobile]         (--mobile = touch + mobile UA)
//
// Writes <out>/<name>.png for every view/orbit plus <out>/log.json (timings, console errors).
// Software rendering: frame timings here say nothing about real GPU performance.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i++; }
}
const url = args.url || 'http://localhost:8765/work/';
const out = path.resolve(args.out || 'shots/tmp');
const [width, height] = (args.size || '900x1100').split('x').map(Number);
const dpr = Number(args.dpr || 1);
const mode = args.mode || 'standard';
const clip = args.clip || 'stage';
const settle = Number(args.settle || 1500);
const timeout = Number(args.timeout || 300000);
const views = args.views === 'none' ? [] : (args.views || 'front,rear,side,face,chest,belt,belt-rear').split(',').filter(Boolean);
const orbits = (args.orbits === 'none' ? '' : (args.orbits || 'q34:35:82,rear34:215:82')).split(',').filter(Boolean).map((item) => {
  const [name, azimuth, polar] = item.split(':');
  return { name, azimuth: Number(azimuth), polar: polar === undefined ? null : Number(polar) };
});

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const log = { url, size: [width, height], dpr, mode, clip, shots: [], console: [], startedAt: new Date().toISOString() };
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: !!args.mobile,
    isMobile: !!args.mobile,
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    const type = message.type();
    const text = message.text();
    if ((type === 'error' || type === 'warning') && !/GPU stall due to ReadPixels/.test(text)) {
      log.console.push({ type, text: text.slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => log.console.push({ type: 'pageerror', text: String(error.message).slice(0, 500) }));
  page.on('requestfailed', (request) => log.console.push({ type: 'requestfailed', text: request.url() }));
  page.on('response', (response) => { if (response.status() >= 400) log.console.push({ type: 'http' + response.status(), text: response.url() }); });

  const isReady = () => page.waitForFunction(() => {
    const state = document.documentElement.dataset.viewer;
    if (state) return state === 'ready';
    const poster = document.querySelector('#poster');
    return !!poster && poster.hidden; // legacy contract: poster hidden once the model is shown
  }, null, { timeout });
  const settled = async () => {
    const hooked = await page.evaluate(async () => {
      if (window.__viewer && typeof window.__viewer.whenSettled === 'function') {
        await window.__viewer.whenSettled();
        return true;
      }
      return false;
    });
    await page.waitForTimeout(hooked ? 450 : settle); // also lets the buttons' .35s CSS fade finish (frames stall under software GL)
  };
  const capture = async (name, meta = {}) => {
    const file = path.join(out, `${name}.png`);
    const started = Date.now();
    await settled();
    if (clip === 'page') await page.screenshot({ path: file });
    else await page.locator('#stage').screenshot({ path: file });
    log.shots.push({ name, file, settleMs: Date.now() - started, ...meta });
  };

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await isReady();
  log.loadMs = Date.now() - t0;

  if (mode === 'detail') {
    const t1 = Date.now();
    await page.click('#quality');
    await page.waitForFunction(() => {
      const button = document.querySelector('#quality');
      return button && !button.disabled && button.getAttribute('aria-pressed') === 'true';
    }, null, { timeout });
    log.detailLoadMs = Date.now() - t1;
  }

  for (const view of views) {
    await page.click(`[data-view="${view}"]`);
    await capture(view, { view });
  }
  for (const orbit of orbits) {
    await page.click('[data-view="front"]');
    await settled();
    const hooked = await page.evaluate(({ azimuth, polar }) => {
      if (window.__viewer && typeof window.__viewer.setOrbit === 'function') {
        window.__viewer.setOrbit(azimuth, polar === null ? undefined : polar);
        return true;
      }
      return false;
    }, orbit);
    if (!hooked) {
      // Legacy fallback: OrbitControls turns 360 degrees per clientHeight of horizontal drag.
      const box = await page.locator('#stage').boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const dx = -(orbit.azimuth / 360) * box.height;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let step = 1; step <= 24; step++) await page.mouse.move(cx + (dx * step) / 24, cy);
      await page.mouse.up();
    }
    await capture(orbit.name, { azimuth: orbit.azimuth, polar: orbit.polar, hooked });
  }

  log.state = await page.evaluate(() => ({
    viewer: document.documentElement.dataset.viewer || null,
    mode: document.documentElement.dataset.mode || null,
    status: document.querySelector('#status')?.textContent || '',
    hooks: !!window.__viewer,
    extra: window.__viewer && typeof window.__viewer.state === 'function' ? window.__viewer.state() : null,
  }));
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 2));
  await browser.close();
  const problems = log.console.filter((entry) => entry.type !== 'warning');
  console.log(`shots: ${log.shots.length} -> ${out}  load ${log.loadMs}ms  problems: ${problems.length}`);
  for (const entry of problems.slice(0, 12)) console.log(`  [${entry.type}] ${entry.text}`);
})().catch((error) => {
  console.error('shot.cjs failed:', error.message);
  process.exit(1);
});
