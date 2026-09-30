import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const browser = await chromium.launch({ channel: "chrome" });
let passed = 0;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    for (const delta of [-60, 60]) {
      const page = await browser.newPage({ viewport, hasTouch: true });
      try {
        await page.goto(new URL("/world", base).href);
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.scrollMotionReady === "true" &&
            !document.documentElement.hasAttribute("data-route-scroll-settling"),
        );
        const button = page.locator(".zeus-button");
        await button.waitFor({ state: "visible" });
        await page.waitForTimeout(1200);
        const rect = await button.boundingBox();
        assert.ok(rect);
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        assert.equal(await button.getAttribute("data-dragging"), "true");
        // Keep clear of ENTER THE WORLD: landing on a real control must
        // still trigger legitimate avoidance, independently of viewport drift.
        const point = { x: viewport.width / 2, y: viewport.height / 4 };
        await page.mouse.move(point.x, point.y, { steps: 8 });
        await page.waitForTimeout(80);
        const resized = { width: viewport.width, height: viewport.height + delta };
        await page.setViewportSize(resized);
        await page.waitForTimeout(160);
        assert.equal(
          await button.getAttribute("data-dragging"),
          "true",
          "a toolbar-sized resize must preserve the held gesture",
        );
        await page.mouse.up();
        assert.equal(await button.getAttribute("data-dragging"), "false");
        const saved = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("deception-world:zeus-button-position")),
        );
        assert.ok(saved);
        assert.ok(Math.abs(saved.x - point.x / resized.width) < 0.002);
        assert.ok(
          Math.abs(saved.y - point.y / resized.height) < 0.002,
          "the saved location must use the live viewport, not the drag-start height",
        );
        await page.waitForTimeout(300);
        const released = await button.boundingBox();
        assert.ok(Math.abs(released.x + released.width / 2 - point.x) < 2);
        assert.ok(
          Math.abs(released.y + released.height / 2 - point.y) < 2,
          `release must stay under the final pointer after a partial viewport resize: ${JSON.stringify({ point, saved, released })}`,
        );
        passed++;
        console.log(
          `PASS ${viewport.width}px / height ${delta > 0 ? "+" : ""}${delta}: held resize, finger position and persistence`,
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`${passed}/4 Zeus partial viewport drag cases passed`);
