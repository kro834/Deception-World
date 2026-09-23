import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://localhost:8080";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
// Android widths: Galaxy (Samsung Internet) at 360, Pixel at 393, 412 and 430.
// Without the ≤440px label fit (styles-world-addon.css), the page rail
// overflows at 320-393 and the dialog rail at 412.
const GALAXY_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
const PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = new Map([
  [360, GALAXY_UA],
  [393, PIXEL_UA],
  [412, PIXEL_UA],
  [430, PIXEL_UA],
]);
try {
  for (const width of [320, 360, 375, 393, 412, 430, 768, 1376]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 840 ? 1008 : 900 },
      isMobile: true,
      hasTouch: true,
      userAgent: ANDROID.get(width) ?? IPHONE_UA,
    });
    try {
      await page.goto(base + "/world");
      await page.waitForTimeout(2400);
      // Android now plays the full Mirage boot; measure the settled page.
      await page.waitForFunction(
        () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
        undefined,
        { timeout: 10_000 },
      );
      // The page rail's labels fit too (not only the dialog's).
      const pageRailFits = await page
        .locator(".world-column-tabs:not(.world-column-dialog-tabs)")
        .evaluate((e) =>
          [...e.querySelectorAll("button b,button small")].every(
            (n) => n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1,
          ),
        );
      assert.equal(pageRailFits, true, `page rail labels overflow at ${width}`);
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
        assert.equal(state.textFits, true, `dialog rail labels overflow at ${width}`);
        // Frosted capsule rails at every width since cba387a
        // (styles-frosted-controls.css, !important).
        assert.equal(state.radius, "999px");
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
