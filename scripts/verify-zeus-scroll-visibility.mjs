import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8189");
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? undefined : { channel: "chrome" },
);
try {
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1024, 768]]) {
    const context = await browser.newContext({
      viewport: { width, height }, hasTouch: true, isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(new URL("/world", base).href);
    await page.waitForFunction(() =>
      document.querySelector(".zeus-button") &&
      document.querySelector(".site-shell")?.dataset.mirageBoot === "done" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    await page.waitForTimeout(500);
    const result = await page.evaluate(async () => {
      const button = document.querySelector(".zeus-button");
      button.blur();
      const saved = localStorage.getItem("deception-world:zeus-button-position");
      const read = () => ({
        flag: button.dataset.scrolling ?? null,
        visibility: getComputedStyle(button).visibility,
        pointer: getComputedStyle(button).pointerEvents,
      });
      for (let i = 0; i < 6; i++) {
        window.scrollBy({ top: 32, behavior: "instant" });
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      const scrolling = read();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { scrolling, idle: read(), saved, after: localStorage.getItem("deception-world:zeus-button-position") };
    });
    if (width <= 760 || height <= 500) {
      assert.deepEqual(result.scrolling, { flag: "true", visibility: "hidden", pointer: "none" });
    } else {
      assert.equal(result.scrolling.flag, null);
      assert.equal(result.scrolling.visibility, "visible");
    }
    assert.equal(result.idle.flag, null);
    assert.equal(result.idle.visibility, "visible");
    assert.notEqual(result.idle.pointer, "none");
    assert.equal(result.after, result.saved);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollBy({ top: 100, behavior: "instant" }));
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".zeus-button").evaluate((node) => getComputedStyle(node).visibility), "visible");
    await page.keyboard.press("Tab");
    const focused = await page.locator(".zeus-button").evaluate(async (node) => {
      node.focus({ preventScroll: true });
      window.scrollBy({ top: 80, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { keyboard: node.matches(":focus-visible"), visibility: getComputedStyle(node).visibility };
    });
    assert.equal(focused.keyboard, true);
    assert.equal(focused.visibility, "visible", "keyboard focus remains available during scrolling");
    console.log(`PASS ${engine} ${width}x${height}: scroll suppression, idle return, saved position, reduced motion`);
    await context.close();
  }
} finally {
  await browser.close();
}
