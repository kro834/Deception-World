#!/usr/bin/env node
// UI state screenshots for ui-work/ without the 3D (viewer.js is stubbed so the DOM stays put).
//   node pipeline/ui/states.cjs --out shots/ui-states-01 [--sizes 390x844m,428x926m,844x390m,1440x900]
// Size suffix "m" = mobile (touch, isMobile). Each state sets the viewer hooks by hand.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
const url = args.url || 'http://localhost:8765/ui-work/';
const out = path.resolve(args.out || 'shots/ui-states');
const sizes = (args.sizes || '390x844m,428x926m,844x390m,1440x900').split(',');
const only = args.states ? args.states.split(',') : null;
const reduced = !!args.reduced;

const states = {
  // Untouched markup, no viewer hooks (what the old viewer / no-JS shows first).
  initial: async () => {},
  loading: async (page) => page.evaluate(() => {
    document.documentElement.dataset.viewer = 'loading';
    document.querySelector('#stage').style.setProperty('--load-progress', '0.42');
    const pr = document.querySelector('#progress'); if (pr) pr.textContent = '42%';
  }),
  detail: async (page) => page.evaluate(() => {
    const d = document.documentElement; d.dataset.viewer = 'ready'; d.dataset.mode = 'detail';
    const q = document.querySelector('#quality'); q.disabled = false; q.textContent = '標準に切替'; q.setAttribute('aria-pressed', 'true');
    document.querySelector('#reset').disabled = false;
    document.querySelector('#status').hidden = true;
    for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === 'chest'));
    const p = document.querySelector('#poster'); p.src = './previews-v14/chest.webp';
  }),
  'loading-detail': async (page) => page.evaluate(() => {
    const d = document.documentElement; d.dataset.viewer = 'loading'; d.dataset.mode = 'standard';
    document.querySelector('#stage').style.setProperty('--load-progress', '0.78');
    const pr = document.querySelector('#progress'); if (pr) pr.textContent = '78%';
    const q = document.querySelector('#quality'); q.disabled = true; q.textContent = '高精細に切替';
    document.querySelector('#reset').disabled = false;
    document.querySelector('#status').textContent = '高精細モデルを読み込み中';
  }),
  error: async (page) => page.evaluate(() => {
    document.documentElement.dataset.viewer = 'error';
    const q = document.querySelector('#quality'); q.disabled = false; q.textContent = '3D表示を再試行'; q.setAttribute('aria-pressed', 'false');
    document.querySelector('#status').textContent = '3Dを読み込めませんでした。画像で確認するか、再試行できます。';
  }),
  lost: async (page) => page.evaluate(() => {
    document.documentElement.dataset.viewer = 'lost';
    const q = document.querySelector('#quality'); q.disabled = true; q.textContent = '高精細に切替';
    document.querySelector('#status').textContent = '3D表示を復旧中。各方向の画像を確認できます。';
  }),
  active: async (page) => {
    await page.evaluate(() => { document.documentElement.dataset.viewer = 'ready'; document.querySelector('#reset').disabled = false; document.querySelector('#status').hidden = true; });
    const box = await page.locator('[data-view="side"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  },
  focus: async (page) => {
    await page.evaluate(() => {
      document.documentElement.dataset.viewer = 'ready';
      const q = document.querySelector('#quality'); q.disabled = false;
      document.querySelector('#reset').disabled = false;
      document.querySelector('#status').hidden = true;
    });
    await page.keyboard.press('Tab'); // quality
    await page.keyboard.press('Tab'); // front (pressed)
    await page.keyboard.press('Tab'); // rear
  },
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = [];
  for (const spec of sizes) {
    const mobile = spec.endsWith('m');
    const [w, h] = spec.replace(/m$/, '').split('x').map(Number);
    for (const [name, apply] of Object.entries(states)) {
      if (only && !only.includes(name)) continue;
      const context = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile,
        reducedMotion: reduced ? 'reduce' : 'no-preference',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/viewer.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
      // --css <file>: serve this stylesheet in place of the page's viewer.css (test ui-work CSS on work/).
      if (args.css) await page.route('**/viewer.css*', (route) => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(args.css, 'utf8') }));
      if (args.ratio) await page.addInitScript((r) => document.addEventListener('DOMContentLoaded', () => document.querySelector('#poster')?.style.setProperty('--poster-ratio', r)), String(args.ratio));
      await page.goto(url, { waitUntil: 'load' });
      await apply(page);
      await page.waitForTimeout(700);
      const file = path.join(out, `${spec}-${name}.png`);
      await page.screenshot({ path: file });
      // Layout facts: overflow, tap target sizes, stage share.
      const facts = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('button')].filter((b) => b.offsetParent);
        const small = buttons.filter((b) => r(b).width < 44 || r(b).height < 44).map((b) => `${b.id || b.dataset.view}:${Math.round(r(b).width)}x${Math.round(r(b).height)}`);
        const clipped = buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id || b.dataset.view);
        const stage = r(document.querySelector('#stage'));
        const offscreen = buttons.filter((b) => { const x = r(b); return x.bottom > innerHeight + 0.5 || x.right > innerWidth + 0.5 || x.top < 0; }).map((b) => b.id || b.dataset.view);
        return {
          hScroll: document.documentElement.scrollWidth > innerWidth,
          vScroll: document.documentElement.scrollHeight > innerHeight,
          stage: `${Math.round(stage.width)}x${Math.round(stage.height)} (${Math.round(100 * stage.width * stage.height / (innerWidth * innerHeight))}% of viewport)`,
          small, clipped, offscreen,
          heights: [...new Set(buttons.map((b) => Math.round(r(b).height)))].join('/'),
          focused: document.activeElement && (document.activeElement.id || document.activeElement.dataset.view || document.activeElement.tagName),
        };
      });
      if (name === 'focus') {
        const order = [];
        await page.evaluate(() => document.activeElement.blur());
        for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.dataset.view || a.tagName; })); }
        facts.tabOrder = order.join(' > ');
        console.log(`${spec} tab order: ${facts.tabOrder}`);
      }
      report.push({ spec, name, file, errors, ...facts });
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  for (const r of report) console.log(`${r.spec} ${r.name}: stage ${r.stage} hScroll=${r.hScroll} vScroll=${r.vScroll} small=[${r.small}] clipped=[${r.clipped}] offscreen=[${r.offscreen}] h=${r.heights} focus=${r.focused} errors=${r.errors.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
