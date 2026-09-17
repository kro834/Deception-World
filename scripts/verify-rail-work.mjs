import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 960 },
      hasTouch: true,
      isMobile: true,
    });
    await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8082"}/world`);
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const rail = page.locator(".rider-tabs");
    await rail.locator("button").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => document.querySelector(".rider-tabs")?.dataset.liquidInitialized === "true",
    );
    await page.waitForTimeout(500);
    const from = await rail.locator("button").nth(0).boundingBox();
    const to = await rail.locator("button").nth(1).boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x = from.x + from.width / 2,
      y = from.y + from.height / 2;
    const hit = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".rider-tabs")),
      { x, y },
    );
    assert.ok(hit, `Slider covered at ${x}, ${y}`);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(180);
    assert.equal(
      await page.evaluate(() => document.documentElement.hasAttribute("data-rail-lock")),
      true,
      "Initial contact missed slider",
    );
    await rail.evaluate((root) => {
      window.railRectReads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (root === this || root.contains(this)) window.railRectReads++;
        return original.call(this);
      };
    });
    for (let step = 1; step <= 20; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: x + ((to.x + to.width / 2 - x) * step) / 20,
            y: y + ((to.y + to.height / 2 - y) * step) / 20,
          },
        ],
      });
      await page.waitForTimeout(17);
    }
    const reads = await page.evaluate(() => window.railRectReads);
    assert.ok(reads <= 2, `Repeated geometry work during drag: ${reads}`);
    assert.equal(
      await page.evaluate(() => document.documentElement.hasAttribute("data-rail-lock")),
      true,
    );
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(
      await page.evaluate(() => document.documentElement.hasAttribute("data-rail-lock")),
      false,
    );
    console.log(
      JSON.stringify({ width, dragMoves: 20, geometryReadsDuringDrag: reads, released: true }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
