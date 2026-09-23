import assert from "node:assert/strict";
import { chromium } from "playwright";

// The topbar draws exactly one reading-progress line: the Motion edition's
// prism (::before, `scale`) wherever Motion runs, otherwise the hairline
// (::after, `transform`; native on Android and iOS 27).
const readProgressLines = () => {
  const topbar = document.querySelector(".topbar");
  return ["::before", "::after"]
    .map((pseudo) => {
      const style = getComputedStyle(topbar, pseudo);
      if (style.content === "none" || style.display === "none") return null;
      const scale =
        style.scale && style.scale !== "none"
          ? Number.parseFloat(style.scale)
          : new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform).a;
      return { pseudo, scale };
    })
    .filter(Boolean);
};

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const mode of ["android", "android-economy", "unsupported", "iphone", "iphone27"]) {
    const native = mode === "android" || mode === "android-economy" || mode === "iphone27";
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
    // A weak Android (4 cores) gets economy: no Motion prism, native hairline.
    if (mode === "android-economy")
      await page.addInitScript(() =>
        Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 4 }),
      );
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
      window.rootProgressWrites = 0;
      const original = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function (name, ...args) {
        if (name === "--page-progress") {
          // The value lives on the header that draws it, never on <html>.
          if (this === document.documentElement.style) window.rootProgressWrites++;
          else if (this === document.querySelector(".topbar")?.style) window.progressWrites++;
        }
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
      rootWrites: window.rootProgressWrites,
      rootProgress: document.documentElement.style.getPropertyValue("--page-progress"),
      ratio: scrollY / (document.documentElement.scrollHeight - innerHeight),
      progress: Number(document.querySelector(".topbar").style.getPropertyValue("--page-progress")),
      economy: document.documentElement.dataset.worldEffects === "economy",
    }));
    assert.ok(result.ratio > 0.1, "Scroll must move the page");
    assert.equal(result.rootWrites, 0, "<html> must not carry the per-frame progress value");
    assert.equal(result.rootProgress, "");
    const lines = await page.evaluate(readProgressLines);
    assert.equal(lines.length, 1, `${mode}: one progress line ${JSON.stringify(lines)}`);
    assert.ok(Math.abs(lines[0].scale - result.ratio) < 0.025, JSON.stringify({ lines, result }));
    assert.equal(result.economy, mode === "android-economy");
    assert.equal(lines[0].pseudo, result.economy ? "::after" : "::before", mode);
    assert.equal(result.native, native);
    if (native) {
      assert.equal(result.writes, 0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => !document.documentElement.dataset.nativeScrollProgress);
      assert.equal((await page.evaluate(readProgressLines)).length, 1, `${mode}: reduced motion`);
      assert.ok(
        await page.evaluate(
          () =>
            Number(document.querySelector(".topbar").style.getPropertyValue("--page-progress")) > 0,
        ),
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForFunction(
        () => document.documentElement.dataset.nativeScrollProgress === "true",
      );
    } else if (mode === "iphone") {
      // iOS 26 on an engine with scroll timelines: the prism is the line and
      // the hairline is hidden (content: none), so the topbar needs no
      // per-frame value; with reduced motion the hairline path (and its
      // value) is back. ("unsupported" hides timelines from JS only, so it
      // keeps writing.)
      assert.equal(result.writes, 0, `${mode}: writes for a hidden hairline`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(300);
      const reduced = await page.evaluate(() => ({
        pseudo: getComputedStyle(document.querySelector(".topbar"), "::after").content,
        value: Number(document.querySelector(".topbar").style.getPropertyValue("--page-progress")),
        ratio: scrollY / (document.documentElement.scrollHeight - innerHeight),
      }));
      assert.notEqual(reduced.pseudo, "none", `${mode}: reduced motion hairline`);
      assert.ok(Math.abs(reduced.value - reduced.ratio) < 0.025, JSON.stringify(reduced));
      await page.emulateMedia({ reducedMotion: "no-preference" });
    } else {
      assert.ok(result.writes > 0);
      assert.ok(Math.abs(result.progress - result.ratio) < 0.025, JSON.stringify(result));
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, ...result, line: lines[0], errors }));
    await page.close();
  }
} finally {
  await browser.close();
}
