import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const mode of ["android", "unsupported", "iphone", "iphone27"]) {
    const page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      userAgent: mode.startsWith("iphone")
        ? `Mozilla/5.0 (iPhone; CPU iPhone OS ${mode === "iphone27" ? 27 : 26}_0 like Mac OS X) AppleWebKit/605.1.15 Version/${mode === "iphone27" ? 27 : 26}.0 Mobile/15E148 Safari/604.1`
        : "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (mode === "unsupported")
      await page.addInitScript(() => {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = (...args) => (args[0] === "animation-timeline" ? false : supports(...args));
      });
    await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8082"}/world`);
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.mode === "world" &&
        !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.progressWrites = 0;
      const original = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function (name, ...args) {
        if (this === document.documentElement.style && name === "--page-progress")
          window.progressWrites++;
        return original.call(this, name, ...args);
      };
      window.scrollTo({
        top: (document.documentElement.scrollHeight - innerHeight) / 2,
        behavior: "instant",
      });
    });
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => ({
      native: document.documentElement.dataset.nativeScrollProgress === "true",
      writes: window.progressWrites,
      ratio: scrollY / (document.documentElement.scrollHeight - innerHeight),
      progress: Number(document.documentElement.style.getPropertyValue("--page-progress")),
      scale: new DOMMatrixReadOnly(
        getComputedStyle(document.querySelector(".topbar"), "::after").transform,
      ).a,
    }));
    assert.ok(result.ratio > 0.1, "Scroll must move the page");
    assert.equal(result.native, mode === "android" || mode === "iphone27");
    if (mode === "android" || mode === "iphone27") {
      assert.equal(result.writes, 0);
      assert.ok(Math.abs(result.scale - result.ratio) < 0.025, JSON.stringify(result));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => !document.documentElement.dataset.nativeScrollProgress);
      assert.ok(
        await page.evaluate(
          () => Number(document.documentElement.style.getPropertyValue("--page-progress")) > 0,
        ),
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction(
        () => document.documentElement.dataset.nativeScrollProgress === "true",
      );
    } else {
      assert.ok(result.writes > 0);
      assert.ok(Math.abs(result.progress - result.ratio) < 0.025);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, ...result, errors }));
    await page.close();
  }
} finally {
  await browser.close();
}
