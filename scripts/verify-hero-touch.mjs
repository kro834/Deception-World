import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

// Chrome supplies native touch swipes through CDP. WebKit checks the same
// geometry and scroll surfaces with wheel input; it is not an iOS device test.
const engine = process.env.PW_ENGINE || "chromium";
const origin = process.env.BASE_URL || "http://localhost:8080";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const surfaces = [
  ".hero h1", ".hero-lead", ".hero .primary-action", ".hero .text-action",
  ".hero-metadata", ".poster-frame", ".film-visual-caption", ".poster-shuffle",
  ".poster-controls button:last-child", ".hero-copy", ".brand",
  ".side-panel-trigger", ".zeus-button",
];

async function swipe(page, cdp, x, y) {
  const before = await page.evaluate(() => scrollY);
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    const distance = Math.min(160, y - 8);
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x, y: y - distance * i / 10 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 180);
  }
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => scrollY) > before + 12, `scroll blocked at ${x}, ${y}`);
}

async function geometry(rail) {
  return rail.evaluate(e => {
    const box = node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    const lens = e.querySelector(".liquid-selection-lens");
    return {
      shell: box(e), lens: box(lens), visual: box(lens.querySelector('.liquid-selection-surface')),
      tabs: [...e.querySelectorAll("button[role=tab]")].map(box),
      held: e.dataset.liquidHeld,
      duration: getComputedStyle(lens).transitionDuration,
    };
  });
}

function inside(lens, shell) {
  return lens.x >= shell.x - 1 && lens.y >= shell.y - 1 &&
    lens.x + lens.width <= shell.x + shell.width + 1 &&
    lens.y + lens.height <= shell.y + shell.height + 1;
}

try {
  for (const [width, height] of [[390, 844], [1024, 768], [1280, 960]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: engine === "chromium" });
    await page.goto(new URL("/world", origin).href);
    await page.locator('.rider-tabs[data-liquid-initialized="true"]').waitFor({ state: "attached" });
    // Programmatic test positioning is not user input. Wait for the router's
    // initial restoration before scrollIntoView; native input cancellation is
    // covered separately by verify-anime-ui's destination-reveal test.
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-route-scroll-settling'));
    const cdp = engine === "chromium" ? await page.context().newCDPSession(page) : null;
    for (const selector of surfaces) {
      const target = page.locator(selector).first();
      await target.evaluate(e => e.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(160);
      const point = await target.evaluate(e => {
        const r = e.getBoundingClientRect();
        const y = Math.min(innerHeight - 20, Math.max(20, r.y + r.height / 2));
        for (const fraction of [0.5, 0.25, 0.75]) {
          const x = Math.max(2, Math.min(innerWidth - 2, r.x + r.width * fraction));
          const hit = document.elementFromPoint(x, y);
          if (e.contains(hit) || (getComputedStyle(e).pointerEvents === "none" && hit?.contains(e))) return { x, y };
        }
        return null;
      });
      assert.ok(point, `${width} ${selector}: target is covered ${await target.evaluate(e => {const r=e.getBoundingClientRect();return JSON.stringify({rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,220),pointerEvents:getComputedStyle(e).pointerEvents});})}`);
      try { await swipe(page, cdp, point.x, point.y); }
      catch (error) { throw new Error(`${width} ${selector}: ${error.message}`); }
      assert.notEqual(await page.locator('.side-panel').getAttribute('data-open'), 'true');
    }
    // Empty left/right gutters are scroll surfaces too, not just named nodes.
    for (const x of [3, width - 3]) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(150);
      await swipe(page, cdp, x, height * 0.7);
    }
    const rail = page.locator(".rider-tabs");
    await rail.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    if (cdp) {
      const first = await rail.locator('button').first().boundingBox();
      const x = first.x + first.width / 2, y = first.y + first.height / 2;
      const before = await page.evaluate(() => scrollY);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), true);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y+35}]});
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(() => scrollY), before, 'immediate slider touch scrolled the page');
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), false);
      await page.waitForTimeout(120);
    }
    const baseline = await geometry(rail);
    let heldGrowth;
    for (let i = 0; i < 8; i++) {
      const tab = rail.locator("button").nth(i);
      await tab.tap();
      const tabId = await tab.getAttribute("id");
      await page.waitForFunction(id => document.querySelector('#rider-active-panel').getAttribute('aria-labelledby') === id, tabId);
      await page.waitForTimeout(140);
      const state = await geometry(rail);
      assert.ok(Math.abs(state.shell.height - baseline.shell.height) < 1, `shell resized for rider ${i}`);
      assert.ok(Math.abs(state.shell.width - baseline.shell.width) < 1, `shell width changed for rider ${i}`);
      assert.ok(Math.abs(state.lens.height - 74) < 1, `lens resized for rider ${i}`);
      assert.ok(state.tabs.every(t => Math.abs(t.height - 74) < 1));
      assert.ok(parseFloat(state.duration) <= 0.08, `slow lens ${state.duration}`);
      const portrait = await page.locator('.rider-visual img.is-on').evaluate(e => ({
        animation: parseFloat(getComputedStyle(e).animationDuration),
        opacity: Number(getComputedStyle(e).opacity), loading: e.loading,
      }));
      assert.ok(portrait.animation <= 0.1, `slow portrait: ${JSON.stringify(portrait)}`);
      assert.equal(portrait.loading, "eager");
      assert.equal(portrait.opacity, 1);
      // Check hold size/bounds on every item, including OVER ZEZTZ and edges.
      await tab.scrollIntoViewIfNeeded();
      const rect = await tab.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), true);
      await page.waitForTimeout(280);
      const held = await geometry(rail);
      assert.equal(held.held, "true");
      assert.ok(parseFloat(held.duration) <= 0.08, `held state restored old slow transition ${held.duration}`);
      assert.ok(held.visual.height >= 88, `hold too small ${JSON.stringify(held)}`);
      assert.ok(held.visual.width >= state.lens.width + 17, `hold width too small`);
      assert.ok(inside(held.visual, held.shell), `held lens crosses shell ${JSON.stringify(held)}`);
      assert.ok(Math.abs(held.lens.height - 74) < 1, 'holding must not resize the positioning layer');
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), true);
      const heldScroll = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => scrollY), heldScroll, 'page moved while slider was held');
      heldGrowth = { width: Math.round(held.visual.width - state.lens.width), height: Math.round(held.visual.height - 74) };
      await page.mouse.up();
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rail-lock')), false);
      await page.waitForTimeout(150);
    }
    // Exercise the originally reported path: drag into OVER ZEZTZ, not only tap.
    const tabs = rail.locator('button');
    await tabs.nth(6).evaluate(e => e.scrollIntoView({block:'center',behavior:'instant'}));
    const positions = (await geometry(rail)).tabs;
    const fromIndex = positions.slice(0,6).findLastIndex(t => Math.abs(t.x-positions[6].x)<1);
    assert.ok(fromIndex >= 0);
    await tabs.nth(fromIndex).tap();
    await page.waitForTimeout(150);
    const from = await tabs.nth(fromIndex).boundingBox();
    const to = await tabs.nth(6).boundingBox();
    const x = from.x + from.width/2, y = from.y + from.height/2;
    const tx = to.x + to.width/2, ty = to.y + to.height/2;
    if (cdp) await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    else { await page.mouse.move(x,y); await page.mouse.down(); }
    await page.waitForTimeout(260);
    for(let step=1;step<=12;step++) {
      const point={x:x+(tx-x)*step/12,y:y+(ty-y)*step/12};
      if(cdp) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
      else await page.mouse.move(point.x,point.y);
      await page.waitForTimeout(20);
    }
    const dragged = await geometry(rail);
    assert.ok(Math.abs(dragged.visual.height-90)<1, 'OVER ZEZTZ changes held height');
    if(cdp) await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.mouse.up();
    await page.waitForTimeout(160);
    assert.equal(await tabs.nth(6).getAttribute('aria-selected'),'true','drag did not select OVER ZEZTZ');
    assert.ok(Math.abs((await geometry(rail)).lens.height-74)<1);
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-rail-lock')),false);
    await swipe(page, cdp, 3, height * 0.7);
    console.log(JSON.stringify({ engine, viewport: `${width}x${height}`, scrollSurfaces: surfaces.length + 2, allEightRiders: "stable", heldGrowth, lensMs: 80, portraitMs: 100 }));
    if (process.env.SAVE_SCREENSHOTS) {
      await rail.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/rider-final-${engine}-${width}.png` });
    }
    await page.close();
  }
} finally { await browser.close(); }
