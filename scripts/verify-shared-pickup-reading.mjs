import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";
try {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1366, height: 1024 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/managers/shuza",
      "/riders/realm",
      "/riders/leddic",
      "/characters/dante",
    ]) {
      await page.goto(base + route);
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.scrollMotionReady === "true" &&
          !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );
      const thumb = page.locator(".form-pickup-plus .ios-slide-open-thumb").first();
      await thumb.scrollIntoViewIfNeeded();
      await thumb.tap();
      const dialog = page.locator(".form-pickup-dialog[open]");
      await dialog.waitFor();
      const panel = dialog.locator(".form-pickup-panel");
      await page.waitForTimeout(400);
      const metrics = await dialog.evaluate((node) => {
        const panel = node.querySelector(".form-pickup-panel");
        const heading = node.querySelector(".form-pickup-heading");
        const close = node.querySelector(".form-pickup-close");
        const prefix = heading.querySelector("h2 > span");
        const title = heading.querySelector("h2 > b");
        return {
          padding: parseFloat(getComputedStyle(heading).paddingRight),
          closeBottom: close.getBoundingClientRect().bottom,
          headingTop: heading.getBoundingClientRect().top,
          contentFits: panel.scrollWidth <= panel.clientWidth + 1,
          prefixSize: parseFloat(getComputedStyle(prefix).fontSize),
          titleSize: parseFloat(getComputedStyle(title).fontSize),
          metadataSize: parseFloat(getComputedStyle(heading.querySelector("small")).fontSize),
          captionsFit: [...node.querySelectorAll("figcaption > *")].every(
            (label) => label.scrollWidth <= label.clientWidth + 1,
          ),
        };
      });
      assert.equal(metrics.padding, 0);
      assert.ok(metrics.headingTop > metrics.closeBottom, JSON.stringify(metrics));
      assert.ok(metrics.contentFits && metrics.captionsFit, JSON.stringify(metrics));
      assert.ok(metrics.metadataSize >= 12);
      if (viewport.width <= 760) assert.ok(metrics.prefixSize < metrics.titleSize);
      if (process.env.CAPTURE_DIR)
        await page.screenshot({
          path: `${process.env.CAPTURE_DIR}/pickup-${engine === webkit ? "webkit" : "chrome"}-${viewport.width}-${route.split("/").at(-1)}.png`,
        });
      // Real input over the title must move the inner scroller, not the page.
      const bounds = await dialog.locator(".form-pickup-heading").boundingBox();
      const x = bounds.x + Math.min(90, bounds.width / 2);
      const y = Math.min(bounds.y + bounds.height - 20, viewport.height - 100);
      if (engine === chromium) {
        const cdp = await page.context().newCDPSession(page);
        const point = (y) => ({ x, y, id: 1 });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(y)] });
        for (let step = 1; step <= 12; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [point(y - step * 12)],
          });
          await page.waitForTimeout(20);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, 260);
      }
      await page.waitForFunction(
        () =>
          document.querySelector(".form-pickup-dialog[open] .form-pickup-panel")?.scrollTop > 20,
      );
      await dialog.getByRole("button", { name: "閉じる", exact: true }).tap();
      await dialog.waitFor({ state: "hidden" });
      await thumb.scrollIntoViewIfNeeded();
      await thumb.tap();
      await dialog.waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector(".form-pickup-dialog[open] .form-pickup-panel")?.scrollTop === 0,
      );
      assert.equal(await panel.evaluate((node) => node.scrollTop), 0);
      await page.keyboard.press("Escape");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log(
        `${engine === webkit ? "webkit" : "chrome"} ${viewport.width} ${route}: headings, captions, title scroll, close/reopen passed`,
      );
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
