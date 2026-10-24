// Comparison tables on the special sites must scroll sideways with a finger
// on a phone (Android: real CDP touch drag) while the page still scrolls.
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8082";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ ...devices["Pixel 7"] });
const cases = [
  ["/illusionculum-saga", ".ics-table-scroll"],
  ["/meta-unitas-saga", ".mus-table-wrap"],
];
for (const [path, selector] of cases) {
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  const scrollers = page.locator(selector);
  const count = await scrollers.count();
  assert.ok(count > 0, `${path}: no ${selector}`);
  for (let i = 0; i < count; i += 1) {
    const scroller = scrollers.nth(i);
    assert.equal(await scroller.getAttribute("tabindex"), "0", `${path} ${i}: not focusable`);
    await scroller.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await scroller.boundingBox();
    assert.ok(box.width <= page.viewportSize().width, `${path} ${i}: scroller wider than the phone`);
    const cdp = await context.newCDPSession(page);
    const y = box.y + Math.min(box.height / 2, 60);
    const x = box.x + box.width * 0.8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let k = 1; k <= 10; k += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - k * 20, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    const left = await scroller.evaluate((node) => node.scrollLeft);
    assert.ok(left > 40, `${path} ${i}: scrollLeft ${left} after a horizontal drag`);
    console.log(`ok ${path} #${i} scrollLeft=${left}`);
  }
  await page.close();
}
await browser.close();
