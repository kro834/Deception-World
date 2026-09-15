import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: true, isMobile: true });
    await page.goto('http://localhost:8080/world');
    await page.waitForTimeout(1800);
    const cdp = await page.context().newCDPSession(page);
    for (const selector of ['.hero h1', '.hero .primary-action']) {
      const target = page.locator(selector);
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const box = await target.boundingBox();
      const x = box.x + box.width / 2, y = Math.min(800, box.y + box.height / 2);
      const before = await page.evaluate(() => scrollY);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 12 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      assert.ok(await page.evaluate(() => scrollY) > before + 30, `${width}: ${selector} blocks scroll`);
    }
    assert.equal(await page.locator('.hero .primary-action').evaluate(e => getComputedStyle(e).color), 'rgb(245, 248, 255)');
    const tab = page.locator('.rider-tabs button').first();
    await tab.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const box = await tab.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), false);
    const held = await page.locator('.rider-tabs').evaluate(e => ({held:e.dataset.liquidHeld,scale:getComputedStyle(e.querySelector('.liquid-selection-lens')).scale}));
    assert.equal(held.held, 'true', JSON.stringify(held));
    assert.ok(parseFloat(held.scale) > 1, JSON.stringify(held));
    const heights = await page.locator('.rider-tabs button').evaluateAll(es => es.map(e=>e.getBoundingClientRect().height));
    assert.ok(Math.max(...heights)-Math.min(...heights)<1);
    await page.mouse.up();
    console.log(`${width}: hero touch scroll, readable CTA, held enlargement without page lock PASS`);
    await page.close();
  }
} finally { await browser.close(); }
