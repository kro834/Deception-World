// Behaviour checks for work/viewer.js: state hooks, progress, quality switch, context loss, tiers, load failure.
const { chromium } = require('playwright');
const out = process.argv[2] || 'shots/lookdev-robust';
const fs = require('fs');
fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:8765/work/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: String(info).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (url, { reducedMotion, phone } = {}) => {
    const context = await browser.newContext({
      ...(phone ? { viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 700, height: 860 } }),
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    // The drawn-lines sidecar is optional and may not be delivered yet: its 404 is not a failure.
    page.on('console', (m) => { if (m.type() === 'error' && !/model-v15\/lines\.json|previews-v15p\//.test((m.location() || {}).url || '')) errors.push('console ' + m.text()); });
    await page.addInitScript(() => {
      window.__log = { states: [], progress: [], percent: [] };
      const record = () => {
        const state = document.documentElement.dataset.viewer;
        if (state && window.__log.states.at(-1) !== state) window.__log.states.push(state);
        const stage = document.querySelector('#stage');
        const value = stage && stage.style.getPropertyValue('--load-progress');
        if (value) window.__log.progress.push(Number(value));
      };
      new MutationObserver(record).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-viewer', 'style'] });
    });
    await page.goto(url);
    return { page, errors, context };
  };
  const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  const settled = (page) => page.evaluate(() => window.__viewer.whenSettled());
  // Brightness of what is actually on screen (the WebGL back buffer is gone after compositing).
  const brightness = async (page) => {
    await settled(page);
    const shot = (await page.locator('#stage').screenshot()).toString('base64');
    return page.evaluate(async (data) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
      const ctx = probe.getContext('2d'); ctx.drawImage(image, 0, 0, 64, 64);
      const pixels = ctx.getImageData(0, 0, 64, 64).data; let sum = 0, max = 0;
      for (let i = 0; i < pixels.length; i += 4) { const v = pixels[i] + pixels[i + 1] + pixels[i + 2]; sum += v; max = Math.max(max, v); }
      return { mean: Math.round(sum / (64 * 64 * 3)), max };
    }, shot);
  };

  // 1. load, hooks, progress
  let { page, errors } = await open(base);
  await ready(page);
  await settled(page);
  let log = await page.evaluate(() => window.__log);
  check('state goes loading -> ready', log.states.join('>') === 'loading>ready', log.states.join('>'));
  const mono = log.progress.every((v, i) => i === 0 || v >= log.progress[i - 1] - 1e-6);
  check('--load-progress rises 0 -> 1', log.progress.length > 3 && mono && Math.max(...log.progress) === 1, `${log.progress.length} values, first ${log.progress[0]}, max ${Math.max(...log.progress)}`);
  check('--load-progress rests at 1 after load', await page.evaluate(() => Number(document.querySelector('#stage').style.getPropertyValue('--load-progress')) === 1));
  check('data-mode standard', await page.evaluate(() => document.documentElement.dataset.mode) === 'standard');
  check('poster hidden, canvas visible, reset enabled', await page.evaluate(() => document.querySelector('#poster').hidden && getComputedStyle(document.querySelector('#stage canvas')).visibility === 'visible' && !document.querySelector('#reset').disabled));
  check('canvas keeps a11y attributes', await page.evaluate(() => { const c = document.querySelector('#stage canvas'); return c.tabIndex === 0 && c.getAttribute('aria-label') === '装甲戦士の3Dモデル' && c.getAttribute('aria-describedby') === 'hint'; }));
  let state = await page.evaluate(() => window.__viewer.state());
  check('full tier with the maps manifest', state.tier === 'full' && state.manifest, JSON.stringify(state));
  check('cast shadows in use, flattening pass off', state.cast === true && state.brush === false && state.notes.length === 0, JSON.stringify({ cast: state.cast, brush: state.brush, notes: state.notes }));
  let b = await brightness(page);
  check('frame is not blank', b.max > 300 && b.mean > 8, JSON.stringify(b));

  // 2. views + reset
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('[data-view][aria-pressed="true"]')].map((b) => b.dataset.view).join(','));
  check('front is pressed after load', (await pressed()) === 'front' && !(await page.evaluate(() => window.__viewer.state().free)));
  await page.click('[data-view="rear"]');
  check('view button sets aria-pressed + poster', await page.evaluate(() => document.querySelector('[data-view="rear"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-view="front"]').getAttribute('aria-pressed') === 'false' && document.querySelector('#poster').src.endsWith('/rear.webp') && document.querySelector('#poster').alt === '装甲戦士の背面プレビュー'));
  await page.click('#reset');
  check('reset returns to front', await page.evaluate(() => document.querySelector('[data-view="front"]').getAttribute('aria-pressed') === 'true'));

  // 3. drag = cheap frame, then settles with the brush pass
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
  await page.mouse.up();
  const t0 = Date.now();
  await settled(page);
  check('settles after a drag', true, `${Date.now() - t0} ms (software GL)`);
  await page.locator('#stage').screenshot({ path: `${out}/after-drag.png` });
  check('a drag leaves the preset: no view button pressed', (await pressed()) === '' && await page.evaluate(() => window.__viewer.state().free), await pressed());
  await page.click('#reset');
  await settled(page);
  check('reset presses front again', (await pressed()) === 'front');
  await page.click('[data-view="chest"]');
  await settled(page);
  check('a preset button presses only itself', (await pressed()) === 'chest');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);
  await settled(page);
  check('zooming leaves the preset', (await pressed()) === '', await pressed());
  await page.click('[data-view="front"]');
  await settled(page);
  await page.evaluate(() => window.__viewer.setOrbit(35, 82));
  await settled(page);
  check('setOrbit leaves the preset', (await pressed()) === '', await pressed());
  await page.click('[data-view="front"]');
  await settled(page);
  // keyboard orbit still wired
  await page.locator('#stage canvas').focus();
  const before = await page.locator('#stage').screenshot();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await settled(page);
  const after = await page.locator('#stage').screenshot();
  check('keyboard moves the camera', !before.equals(after));
  check('keyboard leaves the preset', (await pressed()) === '', await pressed());
  await page.click('#reset');
  await settled(page);

  // 4. quality switch both ways
  await page.evaluate(() => { window.__log.states.length = 0; window.__log.progress.length = 0; });
  await page.click('#quality');
  check('status text while switching', await page.evaluate(() => document.querySelector('#status').textContent) === '高精細モデルを読み込み中');
  await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 240000 });
  await settled(page);
  log = await page.evaluate(() => window.__log);
  check('detail switch: loading -> ready', log.states.join('>') === 'loading>ready', log.states.join('>'));
  check('detail: progress values', log.progress.length > 3 && Math.max(...log.progress) === 1, `${log.progress.length} values`);
  check('detail: mode + button text', await page.evaluate(() => document.documentElement.dataset.mode === 'detail' && document.querySelector('#quality').textContent === '標準に切替' && document.querySelector('#status').hidden));
  b = await brightness(page);
  check('detail frame is not blank', b.max > 300 && b.mean > 8, JSON.stringify(b));
  await page.locator('#stage').screenshot({ path: `${out}/detail.png` });
  await page.click('#quality');
  await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'false'; }, null, { timeout: 240000 });
  await settled(page);
  check('back to standard', await page.evaluate(() => document.documentElement.dataset.mode === 'standard' && document.querySelector('#quality').textContent === '高精細に切替'));
  b = await brightness(page);
  check('standard frame after round trip is not blank', b.max > 300 && b.mean > 8, JSON.stringify(b));

  // 5. context loss and restore
  await page.evaluate(() => { window.__log.states.length = 0; const gl = document.querySelector('#stage canvas').getContext('webgl2'); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'lost', null, { timeout: 20000 });
  check('lost: poster back, status text, quality disabled', await page.evaluate(() => !document.querySelector('#poster').hidden && document.querySelector('#status').textContent === '3D表示を復旧中。各方向の画像を確認できます。' && document.querySelector('#quality').disabled && document.querySelector('#reset').disabled));
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 60000 });
  await settled(page);
  b = await brightness(page);
  check('restored frame is not blank', b.max > 300 && b.mean > 8, JSON.stringify(b));
  state = await page.evaluate(() => window.__viewer.state());
  check('restored: still the full tier with cast shadows', state.tier === 'full' && state.cast === true && state.notes.length === 0, JSON.stringify({ tier: state.tier, cast: state.cast, notes: state.notes }));
  check('restored: status cleared, controls enabled', await page.evaluate(() => document.querySelector('#status').hidden && !document.querySelector('#quality').disabled && document.querySelector('#poster').hidden));
  await page.locator('#stage').screenshot({ path: `${out}/after-restore.png` });
  check('no page errors in the main session', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();

  // 6. tiers
  for (const tier of ['lite', 'forward']) {
    ({ page, errors } = await open(`${base}?tier=${tier}`));
    await ready(page); await settled(page);
    state = await page.evaluate(() => window.__viewer.state());
    b = await brightness(page);
    check(`tier ${tier} renders`, state.tier === tier && b.max > 300 && b.mean > 8 && errors.length === 0, JSON.stringify(b) + ' ' + errors.slice(0, 2).join(' | '));
    await page.locator('#stage').screenshot({ path: `${out}/tier-${tier}.png` });
    await page.context().close();
  }

  // 7. reduced motion: settle without the cross-fade
  ({ page, errors } = await open(base, { reducedMotion: true }));
  await ready(page); await settled(page);
  b = await brightness(page);
  check('reduced motion renders', b.max > 300 && errors.length === 0, JSON.stringify(b));
  await page.context().close();

  // 7b. phone: touch device, dpr 2 -> same layers, flattening pass at half size, cast shadows on
  ({ page, errors } = await open(base, { phone: true }));
  await ready(page); await settled(page);
  state = await page.evaluate(() => window.__viewer.state());
  b = await brightness(page);
  check('phone: full tier, cast shadows, flattening pass off', state.coarse === true && state.tier === 'full' && state.cast === true && state.brush === false && state.notes.length === 0 && b.max > 300 && errors.length === 0,
    JSON.stringify({ coarse: state.coarse, tier: state.tier, cast: state.cast, brush: state.brush, notes: state.notes, pixelRatio: state.pixelRatio, size: state.size }) + ' ' + errors.slice(0, 2).join(' | '));
  await page.locator('#stage').screenshot({ path: `${out}/phone.png` });
  // a touch drag orbits and leaves the preset; the frame at rest is drawn again
  const stageBox = await page.locator('#stage').boundingBox();
  const client = await page.context().newCDPSession(page);
  const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const cx = stageBox.x + stageBox.width / 2, cy = stageBox.y + stageBox.height / 2;
  const beforeTouch = await page.locator('#stage').screenshot();
  await touch('touchStart', cx, cy);
  for (let i = 1; i <= 6; i++) await touch('touchMove', cx + i * 12, cy);
  await touch('touchEnd', cx + 72, cy);
  await settled(page);
  const afterTouch = await page.locator('#stage').screenshot();
  check('phone: a touch drag turns the figure and leaves the preset', !beforeTouch.equals(afterTouch) && (await page.evaluate(() => window.__viewer.state().free)) === true);
  await page.locator('#stage').screenshot({ path: `${out}/phone-after-drag.png` });
  await page.context().close();

  // 7c. the shadow layer off: no shadow map is drawn
  ({ page, errors } = await open(`${base}?set=shadow.amount:0`));
  await ready(page); await settled(page);
  state = await page.evaluate(() => window.__viewer.state());
  check('shadow layer off: no cast pass', state.cast === false && errors.length === 0, JSON.stringify({ cast: state.cast }) + ' ' + errors.slice(0, 2).join(' | '));
  await page.context().close();

  // 8. load failure, then retry
  ({ page, errors } = await open('about:blank'));
  let block = true;
  await page.route('**/model-v10/standard-v14.glb', (route) => (block ? route.abort() : route.continue()));
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'error', null, { timeout: 60000 });
  check('failure: progress property removed', await page.evaluate(() => document.querySelector('#stage').style.getPropertyValue('--load-progress') === ''));
  check('failure: error state, status, retry button', await page.evaluate(() => document.querySelector('#status').textContent === '3Dを読み込めませんでした。画像で確認するか、再試行できます。' && document.querySelector('#quality').textContent === '3D表示を再試行' && !document.querySelector('#quality').disabled && !document.querySelector('#poster').hidden));
  block = false;
  await page.click('#quality');
  await ready(page); await settled(page);
  b = await brightness(page);
  check('retry loads the model', b.max > 300 && await page.evaluate(() => document.querySelector('#quality').textContent === '高精細に切替' && document.querySelector('#status').hidden), JSON.stringify(b));
  await page.context().close();

  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error('robust.cjs crashed:', error); process.exit(2); });
