import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    await page.goto(`${process.env.BASE_URL || "http://localhost:8082"}/world`);
    await page.waitForFunction(() => document.documentElement.dataset.scrollMotionReady === "true" && !document.documentElement.hasAttribute("data-route-scroll-settling"));
    const button = page.locator(".zeus-button");
    await button.waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    const original = await button.boundingBox();
    const x = original.x + original.width / 2;
    const y = original.y + original.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(500);
    assert.equal(await button.getAttribute("data-dragging"), "true");
    await page.mouse.move(viewport.width / 2, viewport.height / 2, { steps: 12 });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert.equal(await button.getAttribute("data-dragging"), "false");
    const restored = await button.boundingBox();
    assert.ok(Math.abs(restored.x + restored.width / 2 - x) < 2, "interrupted drag restores origin X");
    assert.ok(Math.abs(restored.y + restored.height / 2 - y) < 2, "interrupted drag restores origin Y");
    assert.equal(await page.evaluate(() => localStorage.getItem("deception-world:zeus-button-position")), null);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(viewport.width / 2, viewport.height / 2, { steps: 12 });
    await page.mouse.up();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("deception-world:zeus-button-position")));
    assert.ok(Math.abs(saved.x - 0.5) < 0.01 && Math.abs(saved.y - 0.5) < 0.01, "release saves final finger position");
    assert.equal(await button.getAttribute("data-dragging"), "false");
    await page.reload();
    await button.waitFor({ state: "visible" });
    await page.waitForTimeout(700);
    const reloaded = await button.boundingBox();
    assert.ok(Math.abs(reloaded.x + reloaded.width / 2 - viewport.width / 2) < 2);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const point = { x: viewport.width / 2, y: viewport.height / 2 };
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await touch("touchStart", [point]);
    await page.waitForTimeout(500);
    for (let step = 1; step <= 8; step++) {
      await touch("touchMove", [{ x: point.x + step * 5, y: point.y - step * 5 }]);
      await page.waitForTimeout(20);
    }
    await touch("touchEnd", []);
    assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, "held touch drag must not scroll the page");
    assert.equal(await button.getAttribute("data-dragging"), "false");
    const afterTouch = await button.boundingBox();
    assert.ok(Math.abs(afterTouch.x + afterTouch.width / 2 - point.x - 40) < 2);
    const swipeStart = { x: afterTouch.x + afterTouch.width / 2, y: afterTouch.y + afterTouch.height / 2 };
    await touch("touchStart", [swipeStart]);
    for (let step = 1; step <= 8; step++) {
      await touch("touchMove", [{ x: swipeStart.x, y: swipeStart.y - step * 15 }]);
      await page.waitForTimeout(20);
    }
    await touch("touchEnd", []);
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => window.scrollY) > scrollBefore, "ordinary swipe over Zeus must preserve scrolling");
    console.log(`PASS Zeus drag, interruption, persistence: ${viewport.width}x${viewport.height}`);
    await page.close();
  }
} finally {
  await browser.close();
}
