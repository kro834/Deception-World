#!/usr/bin/env node
// UI states against the REAL viewer.js (no stubbing), written to the DOM contract in docs/CONTRACT.md.
//
//   node pipeline/ui/states-real.cjs --url http://localhost:8765/work/ --out shots/ui-real-01
//     [--sizes 428x926m,1440x900] [--scenarios loading,error,lost,detail,closeup]
//     [--throttle 1500000] [--css ui-work/viewer.css] [--view belt-rear] (bytes/s while capturing "loading") [--timeout 300000]
//
// Size suffix "m" = mobile (touch, isMobile, dpr 2). Software GL (SwiftShader): pictures are right,
// timings mean nothing. Writes <out>/<size>-<scenario>.png and <out>/log.json with the hook values
// seen at capture time (data-viewer, data-mode, --load-progress, #progress, #status, #quality).
//
// Scenarios
//   loading  network throttled with CDP so the model streams; captured once a real percentage is on
//            screen (#progress text or --load-progress between 0.15 and 0.85). Falls back to a timed
//            capture and says so in the log if the viewer never reports progress.
//   error    every model request (model-v*/ .glb .gltf .bin) is aborted -> data-viewer="error",
//            #quality reads 「3D表示を再試行」.
//   lost     after ready, WEBGL_lose_context.loseContext() on the viewer's canvas -> data-viewer="lost".
//   detail   after ready, click #quality and wait for aria-pressed="true" and data-mode="detail".
//   closeup  after ready, click [data-view="chest"] and wait for the settled frame.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
const base = args.url || 'http://localhost:8765/work/';
const out = path.resolve(args.out || 'shots/ui-real');
const sizes = (args.sizes || '428x926m,1440x900').split(',');
const scenarios = (args.scenarios || 'loading,error,lost,detail,closeup').split(',');
const throttle = Number(args.throttle || 1_500_000);
const timeout = Number(args.timeout || 300_000);
const MODEL = /\/model-v\d+\/.*\.(glb|gltf|bin)(\?|$)/;

const snapshot = (page) => page.evaluate(() => {
  const q = document.querySelector('#quality');
  const st = document.querySelector('#status');
  return {
    viewer: document.documentElement.dataset.viewer || null,
    mode: document.documentElement.dataset.mode || null,
    loadProgress: getComputedStyle(document.querySelector('#stage')).getPropertyValue('--load-progress').trim() || null,
    progress: document.querySelector('#progress')?.textContent ?? '(no #progress element)',
    status: st && !st.hidden ? st.textContent : '(hidden)',
    quality: q ? { text: q.textContent, disabled: q.disabled, pressed: q.getAttribute('aria-pressed') } : null,
    reset: document.querySelector('#reset')?.disabled,
    poster: !document.querySelector('#poster')?.hidden,
  };
});

// Ready: contract hook if present, else the legacy signal (poster hidden).
const whenReady = (page) => page.waitForFunction(() => {
  const s = document.documentElement.dataset.viewer;
  if (s) return s === 'ready';
  const p = document.querySelector('#poster');
  return !!p && p.hidden;
}, null, { timeout });

const settle = async (page) => {
  const hooked = await page.evaluate(async () => {
    if (window.__viewer?.whenSettled) { await window.__viewer.whenSettled(); return true; }
    return false;
  });
  await page.waitForTimeout(hooked ? 200 : 1500);
};

const run = {
  async loading(page, note) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: throttle, uploadThroughput: -1 });
    await page.goto(base, { waitUntil: 'commit' });
    // Wait for a real mid-download value. A viewer without the progress hooks (the old one) never
    // reports one: after 4 s with no data-viewer attribute, capture the legacy loading screen instead.
    const t0 = Date.now();
    note.capture = 'FALLBACK: no progress reported within 60 s; timed capture';
    while (Date.now() - t0 < 60_000) {
      const s = await page.evaluate(() => {
        const text = document.querySelector('#progress')?.textContent || '';
        const stage = document.querySelector('#stage');
        return {
          hooked: !!document.documentElement.dataset.viewer,
          pct: parseFloat(text),
          p: stage ? parseFloat(getComputedStyle(stage).getPropertyValue('--load-progress')) : NaN,
        };
      }).catch(() => ({}));
      if ((s.pct >= 15 && s.pct <= 85) || (s.p >= 0.15 && s.p <= 0.85)) { note.capture = 'real progress on screen'; break; }
      if (!s.hooked && Date.now() - t0 > 4000) { note.capture = 'LEGACY: viewer sets no data-viewer/progress hooks; captured mid-download without a percentage'; break; }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(400); // let the bar transition and the plate animation finish
    return async () => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  },
  async error(page, note) {
    await page.route(MODEL, (route) => route.abort('failed'));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.viewer === 'error'
      || document.querySelector('#quality')?.textContent === '3D表示を再試行', null, { timeout });
    await page.waitForTimeout(500);
    note.capture = 'model requests aborted';
  },
  async lost(page, note) {
    await page.goto(base, { waitUntil: 'load' });
    await whenReady(page);
    await settle(page);
    const ok = await page.evaluate(() => {
      const canvas = document.querySelector('#stage canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      window.__loseContext = ext;
      ext.loseContext();
      return true;
    });
    note.capture = ok ? 'loseContext() called' : 'FAILED: no WEBGL_lose_context on the viewer canvas';
    await page.waitForFunction(() => document.documentElement.dataset.viewer === 'lost'
      || /復旧/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 30_000 }).catch(() => { note.capture += '; lost state not observed'; });
    await page.waitForTimeout(600);
  },
  async detail(page, note) {
    await page.goto(base, { waitUntil: 'load' });
    await whenReady(page);
    await page.click('#quality');
    await page.waitForFunction(() => {
      const q = document.querySelector('#quality');
      return q && !q.disabled && q.getAttribute('aria-pressed') === 'true'
        && (!document.documentElement.dataset.mode || document.documentElement.dataset.mode === 'detail');
    }, null, { timeout });
    await settle(page);
    note.capture = 'detail mode on';
  },
  async closeup(page, note) {
    await page.goto(base, { waitUntil: 'load' });
    await whenReady(page);
    await page.click(`[data-view="${run.closeupView || 'chest'}"]`);
    await settle(page);
    note.capture = `${run.closeupView || 'chest'} close-up`;
  },
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const log = { base, startedAt: new Date().toISOString(), shots: [] };
  for (const spec of sizes) {
    const mobile = spec.endsWith('m');
    const [width, height] = spec.replace(/m$/, '').split('x').map(Number);
    for (const name of scenarios) {
      if (!run[name]) { console.warn(`unknown scenario ${name}`); continue; }
      const context = await browser.newContext({
        viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile,
      });
      const page = await context.newPage();
      // --css <file>: serve this stylesheet in place of the page's viewer.css (try ui-work CSS on work/).
      if (args.css) await page.route('**/viewer.css*', (route) => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(args.css, 'utf8') }));
      if (args.view) run.closeupView = args.view;
      const note = { spec, name, console: [] };
      page.on('pageerror', (e) => note.console.push(`pageerror: ${e.message}`.slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') note.console.push(m.text().slice(0, 300)); });
      const started = Date.now();
      try {
        const cleanup = await run[name](page, note);
        note.file = path.join(out, `${spec}-${name}.png`);
        note.hooks = await snapshot(page);
        await page.screenshot({ path: note.file });
        if (cleanup) await cleanup();
      } catch (error) {
        note.failed = String(error.message).slice(0, 300);
        note.file = path.join(out, `${spec}-${name}-FAILED.png`);
        await page.screenshot({ path: note.file }).catch(() => {});
      }
      note.ms = Date.now() - started;
      log.shots.push(note);
      console.log(`${spec} ${name}: ${note.failed ? 'FAILED ' + note.failed : note.capture} | ${JSON.stringify(note.hooks || {})}`);
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
