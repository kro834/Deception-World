import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const origin = process.env.BASE_URL || "http://127.0.0.1:8082";
const phone = (version) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${version >= 26 ? "18_7" : "18_7_7"} like Mac OS X) AppleWebKit/605.1.15 Version/${version}.0 Mobile/15E148 Safari/604.1`;
try {
  for (const mode of ["iphone27", "ipad27", "iphone18", "iphone26", "unsupported", "saveData"]) {
    const page = await browser.newPage({
      viewport: { width: mode === "ipad27" ? 1280 : 390, height: 844 },
      hasTouch: !["ipad27", "unsupported"].includes(mode),
      deviceScaleFactor: 2,
      userAgent:
        mode === "ipad27"
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15"
          : phone(mode === "iphone18" ? 18 : mode === "iphone26" ? 26 : 27),
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (mode === "ipad27")
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "maxTouchPoints", { value: 5 }),
      );
    if (mode === "unsupported")
      await page.addInitScript(() => {
        const original = CSS.supports.bind(CSS);
        CSS.supports = (...args) => (args[0] === "animation-timeline" ? false : original(...args));
      });
    if (mode === "saveData")
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "connection", { value: { saveData: true } }),
      );
    await page.goto(`${origin}/rexonance-saga`);
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.mode === "world" &&
        !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => ({
      enhanced: document.documentElement.dataset.ios27Enhanced === "true",
      capable:
        CSS.supports("animation-timeline", "view()") &&
        CSS.supports("animation-range", "entry 0% entry 100%"),
      native: document.documentElement.dataset.nativeScrollProgress === "true",
      ios18: document.documentElement.dataset.ios18Renderer === "true",
      animation: getComputedStyle(document.querySelector(".rxs-hero-visual")).animationName,
    }));
    const expected = ["iphone27", "ipad27"].includes(mode) && state.capable;
    assert.equal(state.enhanced, expected);
    assert.equal(state.ios18, mode === "iphone18");
    if (expected) {
      assert.equal(state.native, true);
      assert.equal(state.animation, "rxs-ios27-hero-depth");
      await page.evaluate(() => {
        window.progressWrites = 0;
        const original = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (name, ...args) {
          if (["--page-progress", "--rxs-hero-progress"].includes(name)) window.progressWrites++;
          return original.call(this, name, ...args);
        };
      });
      await page.mouse.move(380, 500);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(500);
      const scroll = await page.evaluate(() => ({
        y: scrollY,
        writes: window.progressWrites,
        transform: getComputedStyle(document.querySelector(".rxs-hero-visual")).transform,
      }));
      assert.ok(scroll.y > 20);
      assert.equal(scroll.writes, 0, "CSS timeline must not retain JS progress updates");
      assert.notEqual(scroll.transform, "none");
      const heading = page.locator(".rxs-section-heading").first();
      await heading.scrollIntoViewIfNeeded();
      assert.equal(
        await heading.evaluate((e) => getComputedStyle(e).animationName),
        "rxs-ios27-heading-entry",
      );
      assert.ok(await heading.evaluate((e) => Number(getComputedStyle(e).opacity) >= 0.81));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => !document.documentElement.dataset.ios27Enhanced);
      assert.equal(
        await page.locator(".rxs-hero-visual").evaluate((e) => getComputedStyle(e).animationName),
        "none",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction(() => document.documentElement.dataset.ios27Enhanced === "true");
      const p14 = page.locator(".rxs-p14-overview img");
      await p14.scrollIntoViewIfNeeded();
      for (let n = 0; n < 12; n++) {
        if (await p14.evaluate((e) => e.complete && e.naturalWidth > 0)) break;
        const box = await p14.boundingBox();
        await page.mouse.move(380, 400);
        await page.mouse.wheel(0, (box?.y || 0) - 300);
        await page.waitForTimeout(300);
      }
      assert.ok(await p14.evaluate((e) => e.complete && e.naturalWidth > 0));
      assert.match(await p14.getAttribute("sizes"), /^auto, /);
      const requested = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes("rexonance-p14-core"))
          .map((r) => new URL(r.name).pathname),
      );
      assert.equal(requested.length, 1, JSON.stringify(requested));
      assert.match(requested[0], /delivery-\d+\.webp$/);
      await page.screenshot({ path: `/tmp/ios27-${engine}-${mode}.png` });
    } else {
      assert.notEqual(state.animation, "rxs-ios27-hero-depth");
      if (mode === "unsupported") {
        await page.mouse.move(380, 500);
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(400);
        assert.ok(
          await page
            .locator(".rxs-page")
            .evaluate((e) => Number(e.style.getPropertyValue("--rxs-hero-progress")) > 0),
          "Fine-pointer unsupported browser retains JS parallax",
        );
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, mode, ...state, errors }));
    await page.close();
  }
} finally {
  await browser.close();
}
