import assert from "node:assert/strict";
import { chromium } from "playwright";

// Chrome device emulation, not physical iOS Safari. CDP delivers native touch
// input; dispatched DOM touch events alone do not exercise browser scrolling.
const base = process.env.BASE_URL || "http://localhost:8080";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const cases = [
  ["/world", ".hero h1"],
  ["/world", ".story-heading h2"],
  ["/rexonance-saga", "#rxs-title"],
  ["/extreme-saga", "#exs-title"],
  ["/dream-chapter", "#poster-title"],
  ["/riders/saga", "h1"],
];
const errors = [];

try {
  for (const [width, height] of [[375, 812], [430, 932], [1024, 768], [1376, 1008]]) {
    const context = await browser.newContext({
      viewport: { width, height }, hasTouch: true, isMobile: true,
      userAgent: width < 760
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${width}: ${error.message}`));
    const cdp = await context.newCDPSession(page);
    try {
      for (const [route, selector] of cases) {
        await page.goto(`${base}${route}`);
        await page.waitForTimeout(2400);
        if (route === "/world" && selector === ".hero h1")
          await page.screenshot({ path: `/tmp/future-world-${width}.png` });
        const heading = page.locator(selector).first();
        await heading.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
        // Let the compositor receive the new scroll offset, but begin the drag
        // before the 680 ms text scan has finished.
        await page.waitForTimeout(180);
        const point = await heading.evaluate(node => {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.textContent.trim() || text.parentElement.closest('[aria-hidden="true"]')) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const rect of range.getClientRects()) {
              const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
              if (x < 1 || x > innerWidth - 1 || y < 150 || y > innerHeight - 40) continue;
              const hit = document.elementFromPoint(x, y);
              // Extreme deliberately passes heading touches to its pan-y copy
              // container. Accept that documented parent, never a foreign overlay.
              if (node.contains(hit) || (getComputedStyle(node).pointerEvents === "none" && hit?.contains(node)))
                return { x, y, hit: hit.tagName };
            }
          }
          return null;
        });
        assert.ok(point, `${width} ${route} ${selector}: no visible text hit target`);
        const before = await page.evaluate(() => scrollY);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
        const distance = Math.min(200, point.y - 105);
        for (let step = 1; step <= 10; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove", touchPoints: [{ x: point.x, y: point.y - distance * step / 10 }],
          });
          await page.waitForTimeout(24);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(500);
        const state = await heading.evaluate(node => {
          const selection = new Event("selectstart", { bubbles: true, cancelable: true });
          node.dispatchEvent(selection);
          const copy = new Event("copy", { bubbles: true, cancelable: true });
          node.dispatchEvent(copy);
          return {
            y: scrollY, selectionCancelled: selection.defaultPrevented,
            copyBlocked: copy.defaultPrevented,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            nativePan: getComputedStyle(document.body).touchAction,
            scansIgnoreTouch: [...document.querySelectorAll(".film-text-scan, .film-text-scan > i")]
              .every(element => getComputedStyle(element).pointerEvents === "none"),
          };
        });
        assert.ok(state.y - before > 45, `${width} ${route} ${selector}: pan stalled ${JSON.stringify(state)}`);
        assert.equal(state.selectionCancelled, false);
        assert.equal(state.copyBlocked, true);
        assert.equal(state.overflow, false);
        assert.equal(state.scansIgnoreTouch, true);
        if (selector === ".story-heading h2") {
          await heading.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
          await page.waitForTimeout(700);
          await page.screenshot({ path: `/tmp/future-story-${width}.png` });
        }
        console.log(JSON.stringify({ width, height, route, selector, hit: point.hit, scrollDelta: Math.round(state.y - before) }));
      }
    } finally {
      await cdp.detach();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
