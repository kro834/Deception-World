// Actual rendered sticky cuts, anchors and rotation; no injected CSS or clocks.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8199";
const out = process.env.OUTPUT_DIR || "/private/tmp/rexonance-stack-layout";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "tablet", viewport: { width: 1024, height: 1366 }, hasTouch: true, deviceScaleFactor: 2 },
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 },
  { name: "short", viewport: { width: 844, height: 390 }, hasTouch: true },
];
const rows = [];
await mkdir(out, { recursive: true });
const settle = (page) => page.waitForFunction(() =>
  !document.querySelector(".load-gate") &&
  !document.documentElement.hasAttribute("data-loading") &&
  !document.documentElement.hasAttribute("data-route-scroll-settling"),
);
const geometry = (page) => page.evaluate(() => {
  const stack = document.querySelector(".rxs-headline-metrics");
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top + scrollY, height: element.offsetHeight, width: element.offsetWidth };
  };
  return {
    anchors: Object.fromEntries(["performance", "p14", "stages", "system"].map(id => [id, rect(document.getElementById(id)).top])),
    stack: rect(stack),
    cuts: [...stack.children].map(node => ({ ...rect(node), cv: getComputedStyle(node).contentVisibility, minHeight: parseFloat(getComputedStyle(node).minHeight) })),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});

try {
  for (const profile of profiles) {
    if (process.env.STACK_PROFILE && process.env.STACK_PROFILE !== profile.name) continue;
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${base}/rexonance-saga#performance`, { waitUntil: "networkidle" });
      await settle(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      const initial = await geometry(page);
      assert.equal(initial.cuts.length, 2);
      assert.ok(initial.overflow <= 1);
      for (const cut of initial.cuts) {
        const expectCv = profile.viewport.height >= 700 && process.env.BASELINE_MODE !== "1";
        assert.equal(cut.cv, expectCv ? "auto" : "visible");
        if (profile.viewport.height >= 700) assert.ok(Math.abs(cut.height - cut.minHeight) <= 1, JSON.stringify(cut));
      }
      const samples = [];
      for (const progress of [0.15, 0.55, 0.95, 0.55, 0.15]) {
        await page.evaluate(y => scrollTo({ top: y, behavior: "instant" }), initial.stack.top + initial.stack.height * progress);
        await page.waitForTimeout(180);
        const state = await page.evaluate(() => {
          const stack = document.querySelector(".rxs-headline-metrics");
          return [...stack.children].map(node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            // Preserve the existing scroll-linked card transform; measure
            // sticky layout independently of its intentionally animated paint.
            let layoutTop = 0;
            for (let parent = node; parent; parent = parent.offsetParent) layoutTop += parent.offsetTop;
            return { top: box.top, bottom: box.bottom, layoutTop: layoutTop - scrollY, height: node.offsetHeight, paintedHeight: box.height, stickyTop: parseFloat(style.top), position: style.position };
          });
        });
        for (const [i, cut] of state.entries()) {
          assert.equal(cut.position, "sticky");
          assert.ok(Math.abs(cut.height - initial.cuts[i].height) <= 1, JSON.stringify(state));
        }
        if (profile.viewport.height >= 700 && progress === 0.15)
          assert.ok(Math.abs(state[0].layoutTop - state[0].stickyTop) <= 1, `${profile.name}: the first cut must actually pin ${JSON.stringify(state)}`);
        if (profile.viewport.height >= 700 && progress === 0.55)
          assert.ok(Math.abs(state[1].layoutTop - state[1].stickyTop) <= 1, `${profile.name}: the second cut must actually pin over the first ${JSON.stringify(state)}`);
        const forward = samples.find(sample => sample.progress === progress);
        if (forward) for (const [i, cut] of state.entries())
          assert.ok(Math.abs(cut.layoutTop - forward.state[i].layoutTop) <= 1, `${profile.name}: reverse scrolling must restore the same sticky position`);
        samples.push({ progress, state });
      }
      await page.screenshot({ path: join(out, `${profile.name}-stack.png`) });
      const after = await geometry(page);
      for (const id of Object.keys(initial.anchors)) assert.ok(Math.abs(initial.anchors[id] - after.anchors[id]) <= 1, `${profile.name} ${id}: materialization changed the hash target`);
      assert.ok(Math.abs(initial.stack.height - after.stack.height) <= 1);
      const localLink = page.locator('.rxs-local-nav a[href="#p14"]');
      if (await localLink.isVisible()) await localLink.click();
      else {
        await page.locator(".side-panel-trigger").first().click();
        await page.locator('#site-side-panel a[href="/rexonance-saga#p14"]').first().click();
      }
      await page.waitForURL("**#p14");
      await settle(page);
      await page.waitForTimeout(1400);
      const landing = await page.locator("#p14").evaluate(node => ({
        top: node.getBoundingClientRect().top,
        margin: parseFloat(getComputedStyle(node).scrollMarginTop),
        scroll: scrollY,
        transform: getComputedStyle(node).transform,
        translate: getComputedStyle(node).translate,
      }));
      console.log(`${profile.name} P14`, JSON.stringify(landing));
      // P14 intentionally reserves the measured, wrapping local command bar,
      // unlike the World page's fixed-size header. Preserve that actual margin.
      assert.ok(Math.abs(landing.top - landing.margin) <= 5, `${profile.name}: P14 arrival ${JSON.stringify(landing)}`);
      await page.goBack();
      await page.waitForURL("**#performance");
      await page.waitForTimeout(700);
      await page.setViewportSize({ width: profile.viewport.height, height: profile.viewport.width });
      await page.waitForTimeout(400);
      const rotated = await geometry(page);
      assert.ok(rotated.overflow <= 1);
      await page.setViewportSize(profile.viewport);
      await page.waitForTimeout(400);
      const restored = await geometry(page);
      for (const id of Object.keys(initial.anchors)) assert.ok(Math.abs(initial.anchors[id] - restored.anchors[id]) <= 1, `${profile.name} ${id}: rotation left a height estimate`);
      assert.deepEqual(errors, []);
      rows.push({ profile: profile.name, initial, samples, after, landing, restored });
      console.log(`PASS ${engine} ${profile.name}: sticky geometry, stable anchor positions, history and rotation`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(join(out, "report.json"), JSON.stringify(rows, null, 2));
}
