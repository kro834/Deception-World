import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
try {
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: engine === "chromium",
      hasTouch: true,
      deviceScaleFactor: width < 768 ? 3 : 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8082"}/rexonance-saga`);
    await page.locator('main[data-motion-ready="true"]').waitFor();
    assert.equal(await page.locator(".rxs-resonance-field i").count(), 3);
    await page.waitForTimeout(1800);
    const delivery = await page.locator(".rxs-hero-visual img").evaluate((img) => ({
      source: img.currentSrc,
      originalRequests: performance
        .getEntriesByType("resource")
        .filter((r) => new URL(r.name).pathname === "/rider-rexonance-saga-pickup.jpeg").length,
    }));
    assert.match(delivery.source, /-delivery-\d+\.webp$/);
    assert.equal(
      delivery.originalRequests,
      0,
      "Responsive preload must not also fetch the original",
    );
    console.log("Image delivery", width, delivery);
    assert.equal(
      await page.evaluate(
        () =>
          performance
            .getEntriesByType("resource")
            .filter((r) => /rider-rexonance-(max|ultra)/.test(r.name)).length,
      ),
      0,
      "Alternate images must not compete with the hero at startup",
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `/tmp/rexonance-hero-${engine}-${width}.png` });
    if (engine === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: width / 2, y: height * 0.7 }],
      });
      for (let n = 1; n <= 10; n++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: width / 2, y: height * 0.7 - n * 15 }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      // Desktop WebKit wheel coverage is not a claim of physical iOS touch testing.
      await page.mouse.move(width / 2, height * 0.7);
      await page.mouse.wheel(0, 150);
    }
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => scrollY > 20), "Hero scroll");
    for (const stage of ["max", "ultra", "standard"]) {
      const index = ["standard", "max", "ultra"].indexOf(stage);
      await page.locator(".rxs-stage-tabs button").nth(index).click();
      await page.waitForTimeout(150);
      assert.equal(await page.locator(".rxs-stage-tabs").getAttribute("data-stage"), stage);
      await page.locator(".rxs-stage-panel figure").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const img = document.querySelector(".rxs-stage-panel img");
        return img.complete && img.naturalWidth > 0;
      });
      assert.equal(
        await page.locator(".rxs-stage-scan").evaluate((e) => getComputedStyle(e).animationName),
        "rxsScanPass",
      );
    }
    await page.screenshot({ path: `/tmp/rexonance-stage-${engine}-${width}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('main[data-motion-ready="false"]').waitFor();
    assert.equal(
      await page.locator(".rxs-stage-scan").evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator('main[data-motion-ready="true"]').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${engine} ${width}x${height}: hero, scroll, all stages, live reduced motion, no overflow/errors`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
