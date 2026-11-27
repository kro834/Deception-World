// Safari-portability probes against http://localhost:8765/work/ (headless Chromium, SwiftShader).
// Read-only with respect to the site. One browser at a time.
//
//   NODE_PATH=/opt/node-tools/node_modules node pipeline/safari/probe.cjs <experiment> [...]
//
// Experiments:
//   load        iPhone-like context (390x844 css, dpr 3, touch, Safari 17 UA): request log to first
//               render, then the detail switch; writes load.json
//   fbo         checkFramebufferStatus always reports INCOMPLETE_ATTACHMENT
//   sh-final | sh-material | sh-backdrop | sh-brush | sh-star | sh-bloom
//               a real compile error injected into one shader (matched by a marker in its source)
//   noext       getExtension returns null for everything; MAX_DRAW_BUFFERS / MAX_COLOR_ATTACHMENTS = 1
//   lost        lose + restore the context; requests made after the restore
//   lostrace    loseContext() and a render in the same task, before the 'webglcontextlost' event
//   lostmid     lose the context while the standard model is still loading
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SP = path.resolve(__dirname, '../..');
const OUT = path.join(SP, process.env.OUT || 'shots/safari-01');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8765/work/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const MARKERS = {
  'sh-final': 'uStarColor',
  'sh-material': 'uSparkleCells',
  'sh-backdrop': 'uPoolRadius',
  'sh-brush': 'uPaintParams',
  'sh-star': 'uFalloff',
  'sh-bloom': 'uSpread',
};

function initPatch({ kind, marker }) {
  window.__probe = { states: [], events: [], t0: performance.now() };
  const mark = (what) => window.__probe.events.push([what, Math.round(performance.now())]);
  new MutationObserver(() => {
    const s = document.documentElement.dataset.viewer;
    if (s && window.__probe.states.at(-1) !== s) { window.__probe.states.push(s); mark('state:' + s); }
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-viewer'] });
  const P = WebGL2RenderingContext.prototype;
  if (kind === 'fbo') {
    const orig = P.checkFramebufferStatus;
    P.checkFramebufferStatus = function (target) { orig.call(this, target); return this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT; };
  }
  if (kind === 'shader') {
    const orig = P.shaderSource;
    P.shaderSource = function (shader, source) {
      if (source.includes(marker) && /void main/.test(source) && !/gl_Position/.test(source)) {
        window.__probe.injected = (window.__probe.injected || 0) + 1;
        source += '\n#error forced failure for the probe\n';
      }
      return orig.call(this, shader, source);
    };
  }
  if (kind === 'noext') {
    const origExt = P.getExtension;
    P.getExtension = function (name) { window.__probe.extAsked = [...new Set([...(window.__probe.extAsked || []), name])]; return null; };
    const origParam = P.getParameter;
    P.getParameter = function (p) {
      if (p === 0x8824 /* MAX_DRAW_BUFFERS */ || p === 0x8CDF /* MAX_COLOR_ATTACHMENTS */) { window.__probe.drawBuffersAsked = true; return 1; }
      return origParam.call(this, p);
    };
    void origExt;
  }
}

async function brightness(page) {
  const shot = (await page.locator('#stage').screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + data;
    await image.decode();
    const n = 64;
    const probe = document.createElement('canvas'); probe.width = n; probe.height = n;
    const ctx = probe.getContext('2d'); ctx.drawImage(image, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    let sum = 0, max = 0, centre = 0, cn = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4; const v = px[i] + px[i + 1] + px[i + 2]; sum += v; max = Math.max(max, v);
      if (x > n * 0.4 && x < n * 0.6 && y > n * 0.3 && y < n * 0.7) { centre += v; cn++; }
    }
    return { mean: Math.round(sum / (n * n * 3)), centreMean: Math.round(centre / (cn * 3)), max };
  }, shot);
}

async function open(browser, { mobile = false, kind = null, marker = null, url = BASE } = {}) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }
    : { viewport: { width: 700, height: 860 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const log = { console: [], requests: [] };
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) || /Look|THREE/.test(m.text())) log.console.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => log.console.push('pageerror: ' + e.message));
  const started = Date.now();
  page.on('requestfinished', async (request) => {
    let size = null; let status = null;
    try { size = (await request.sizes()).responseBodySize; } catch (e) { /* ignore */ }
    try { status = (await request.response())?.status(); } catch (e) { /* ignore */ }
    log.requests.push({ url: request.url().replace('http://localhost:8765', ''), type: request.resourceType(), status, bytes: size, startMs: Math.round(request.timing().startTime - started), endMs: Date.now() - started });
  });
  page.on('requestfailed', (request) => log.requests.push({ url: request.url().replace('http://localhost:8765', ''), failed: request.failure()?.errorText, endMs: Date.now() - started }));
  await page.addInitScript(initPatch, { kind, marker });
  await page.goto(url);
  return { context, page, log, started };
}

const waitState = (page, state, timeout = 240000) => page.waitForFunction((s) => document.documentElement.dataset.viewer === s, state, { timeout });
const settled = (page) => page.evaluate(() => Promise.race([window.__viewer?.whenSettled(), new Promise((r) => setTimeout(r, 60000))]));
const snapshot = (page) => page.evaluate(() => ({ state: window.__viewer?.state(), probe: window.__probe, poster: !document.querySelector('#poster').hidden, status: document.querySelector('#status').hidden ? '' : document.querySelector('#status').textContent }));

async function runFailure(browser, name, opts) {
  const { context, page, log } = await open(browser, opts);
  let outcome = 'ready';
  try { await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 240000 }); await settled(page); }
  catch (e) { outcome = 'timeout: ' + e.message.slice(0, 80); }
  const snap = await snapshot(page);
  const b = await brightness(page);
  await page.locator('#stage').screenshot({ path: path.join(OUT, `${name}.png`) });
  // A drag after the failure: does the tier stay where it fell?
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  await settled(page);
  const after = await snapshot(page);
  const result = { name, outcome, brightness: b, state: snap.state, probe: { injected: snap.probe?.injected, extAsked: snap.probe?.extAsked, drawBuffersAsked: snap.probe?.drawBuffersAsked, states: snap.probe?.states }, posterVisible: snap.poster, status: snap.status, tierAfterDrag: after.state?.tier, notesAfterDrag: after.state?.notes, console: log.console.slice(0, 12) };
  await context.close();
  return result;
}

async function runLoad(browser) {
  const { context, page, log, started } = await open(browser, { mobile: true });
  await waitState(page, 'ready');
  const readyMs = Date.now() - started;
  await settled(page);
  const settledMs = Date.now() - started;
  await page.waitForTimeout(1500);
  const firstState = await page.evaluate(() => window.__viewer.state());
  const b = await brightness(page);
  await page.locator('#stage').screenshot({ path: path.join(OUT, 'load-mobile-standard.png') });
  const standardRequests = log.requests.slice();
  // Detail switch.
  const mark = log.requests.length;
  const t1 = Date.now();
  await page.click('#quality');
  await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 400000 });
  await settled(page);
  const detailMs = Date.now() - t1;
  await page.waitForTimeout(1000);
  const detailState = await page.evaluate(() => window.__viewer.state());
  const bd = await brightness(page);
  await page.locator('#stage').screenshot({ path: path.join(OUT, 'load-mobile-detail.png') });
  const detailRequests = log.requests.slice(mark);
  await context.close();
  return { readyMs, settledMs, detailMs, firstState, detailState, brightness: b, detailBrightness: bd, standardRequests, detailRequests, console: log.console.slice(0, 20) };
}

async function runLost(browser, variant) {
  const { context, page, log } = await open(browser, {});
  if (variant === 'lostmid') {
    await page.waitForFunction(() => Number(document.querySelector('#stage').style.getPropertyValue('--load-progress')) > 0.3, null, { timeout: 120000 });
    await page.evaluate(() => { window.__lose = document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await page.waitForTimeout(4000);
    const during = await snapshot(page);
    await page.evaluate(() => window.__lose.restoreContext());
    await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.viewer), null, { timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await settled(page);
    const snap = await snapshot(page);
    const b = await brightness(page);
    await page.locator('#stage').screenshot({ path: path.join(OUT, `${variant}.png`) });
    await context.close();
    return { name: variant, during: { viewer: during.probe?.states, poster: during.poster, status: during.status }, after: snap, brightness: b, console: log.console.slice(0, 12) };
  }
  await waitState(page, 'ready');
  await settled(page);
  const mark = log.requests.length;
  let raceTier = null;
  if (variant === 'lostrace') {
    raceTier = await page.evaluate(() => {
      const gl = document.querySelector('#stage canvas').getContext('webgl2');
      window.__lose = gl.getExtension('WEBGL_lose_context');
      window.__lose.loseContext();
      const lostNow = gl.isContextLost();
      const viewerBefore = document.documentElement.dataset.viewer;
      window.__viewer.setOrbit(30, 82); // a render in the same task, before the lost event is dispatched
      return { lostNow, viewerBefore, tier: window.__viewer.state().tier, notes: window.__viewer.state().notes };
    });
  } else {
    await page.evaluate(() => { window.__lose = document.querySelector('#stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  }
  await waitState(page, 'lost', 20000).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__lose.restoreContext());
  await waitState(page, 'ready', 60000).catch(() => {});
  await settled(page);
  await page.waitForTimeout(1000);
  const snap = await snapshot(page);
  const b = await brightness(page);
  await page.locator('#stage').screenshot({ path: path.join(OUT, `${variant}.png`) });
  const after = log.requests.slice(mark);
  await context.close();
  return { name: variant, raceTier, after: { state: snap.state, states: snap.probe?.states, poster: snap.poster, status: snap.status }, brightness: b, requestsAfterLoss: after, console: log.console.slice(0, 12) };
}

(async () => {
  const names = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = {};
  for (const name of names) {
    const t = Date.now();
    try {
      if (name === 'load') results[name] = await runLoad(browser);
      else if (name === 'fbo') results[name] = await runFailure(browser, name, { kind: 'fbo' });
      else if (name === 'noext') results[name] = await runFailure(browser, name, { kind: 'noext' });
      else if (MARKERS[name]) results[name] = await runFailure(browser, name, { kind: 'shader', marker: MARKERS[name] });
      else if (name.startsWith('lost')) results[name] = await runLost(browser, name);
      else throw new Error('unknown experiment ' + name);
    } catch (e) { results[name] = { error: String(e.stack || e).slice(0, 600) }; }
    results[name].wallMs = Date.now() - t;
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(results[name], null, 1));
    console.log(name, 'done', results[name].wallMs, 'ms');
  }
  await browser.close();
})();
