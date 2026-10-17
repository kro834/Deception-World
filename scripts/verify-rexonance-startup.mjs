// NO_IDLE=1 exercises Safari's timer/MessageChannel fallback with real artwork.
import assert from 'node:assert/strict';
import { webkit } from 'playwright';
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ noIdle }) => {
    if (noIdle) window.requestIdleCallback = undefined;
    window.__phases = [];
    window.__rexonancePreparationPhase = phase => window.__phases.push({ phase, t: performance.now() });
  }, { noIdle: process.env.NO_IDLE === '1' });
  await page.goto(`${process.env.BASE_URL || 'https://deception-world.vercel.app'}/rexonance-saga`);
  await page.waitForSelector('.rzn-suitup');
  await page.waitForFunction(() => document.querySelector('main[data-motion-ready]') &&
    !document.documentElement.hasAttribute('data-loading'), null, { timeout: 60000 });
  // Route arrival restores scroll after hydration. Do not race that restore
  // and accidentally test the hero instead of the assembly runway.
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const r = document.querySelector('.rzn-suitup'), f = r.querySelector('.rzn-frame');
    scrollTo({ top: r.getBoundingClientRect().top + scrollY + (r.offsetHeight - f.offsetHeight) * .45, behavior: 'instant' });
  });
  await page.waitForFunction(() => scrollY > innerHeight);
  let live = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({ state: document.querySelector('.rzn-suitup')?.dataset.rznState,
      percent: document.querySelector('.rzn-percent')?.textContent, phase: window.__phases.at(-1), phases: window.__phases.length,
      idle: typeof requestIdleCallback, y: scrollY }));
    console.log(JSON.stringify({ second: i + 1, ...state, errors }));
    if (state.state === 'live' && Number(state.percent) > 0) { live = true; break; }
  }
  assert.deepEqual(errors, [], 'no startup exceptions');
  assert.ok(live, 'real-artwork preparation becomes live and advances beyond 0%');
  await page.evaluate(() => {
    const r = document.querySelector('.rzn-suitup'), f = r.querySelector('.rzn-frame');
    scrollTo({ top: r.getBoundingClientRect().top + scrollY + (r.offsetHeight - f.offsetHeight) * .85, behavior: 'instant' });
  });
  await page.waitForFunction(() => Number(document.querySelector('.rzn-percent')?.textContent) > 70);
  console.log('PASS startup and subsequent scroll progress');
} finally { await browser.close(); }
