import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [320, 375, 393, 430, 768, 1376]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 840 ? 1008 : 900 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        width === 393 || width === 430
          ? "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36"
          : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    try {
      await page.goto(base + "/world");
      await page.waitForTimeout(2400);
      await page.locator(".world-column-slide-open").focus();
      await page.keyboard.press("Enter");
      await page.locator(".world-column-dialog[open]").waitFor();
      await page.waitForTimeout(1200);
      const rail = page.locator(".world-column-dialog-tabs");
      const tabs = rail.locator('button[role="tab"]');
      for (let i = 0; i < 4; i++) {
        await tabs.nth(i).tap();
        await page.waitForTimeout(450);
        const state = await rail.evaluate((e) => {
          const frame = e.getBoundingClientRect();
          const active = e.querySelector('[aria-selected="true"]');
          const tab = active.getBoundingClientRect();
          const lens = e.querySelector(".liquid-selection-lens").getBoundingClientRect();
          return {
            radius: getComputedStyle(e).borderRadius,
            selected: [...e.querySelectorAll("button")].indexOf(active),
            lensError: Math.max(
              ...["x", "y", "width", "height"].map((k) => Math.abs(tab[k] - lens[k])),
            ),
            inside: [...e.querySelectorAll("button")].every((n) => {
              const r = n.getBoundingClientRect();
              return (
                r.left >= frame.left + 6 &&
                r.right <= frame.right - 6 &&
                r.top >= frame.top + 6 &&
                r.bottom <= frame.bottom - 6
              );
            }),
            textFits: [...e.querySelectorAll("button b,button small")].every(
              (n) => n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1,
            ),
          };
        });
        assert.equal(state.selected, i);
        assert.ok(state.lensError < 2, JSON.stringify(state));
        assert.equal(state.inside, true);
        assert.equal(state.textFits, true);
        if (width <= 840) assert.equal(state.radius, "24px");
      }
      const start = await tabs.nth(3).boundingBox(),
        end = await tabs.nth(2).boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const x = start.x + start.width / 2,
        y = start.y + start.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await page.waitForTimeout(150);
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + ((end.x + end.width / 2 - x) * i) / 10, y }],
        });
        await page.waitForTimeout(25);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(500);
      assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
      await cdp.detach();
      if (width === 375) await page.screenshot({ path: "/tmp/column-frame-after.png" });
      console.log(
        JSON.stringify({ width, tapAllFour: true, lensAligned: true, textFits: true, drag: true }),
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
