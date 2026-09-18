import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    for (const route of ["/world", "/riders/saga", "/rexonance-saga", "/dream-chapter"]) {
      await page.goto(`${process.env.BASE_URL || "http://localhost:8082"}${route}`);
      const trigger = page.locator(".side-panel-trigger").first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => document.querySelector(".side-panel")?.dataset.open === "true",
      );
      const defects = await page.locator(".side-panel").evaluate((panel) => {
        const problems = [];
        const close = panel.querySelector(".side-panel-close").getBoundingClientRect();
        if (close.width < 48 || close.height < 48) problems.push("close target");
        for (const link of panel.querySelectorAll(".side-panel-links a, .side-panel-link-button")) {
          const box = link.getBoundingClientRect();
          if (box.height < 48) problems.push("link target");
          for (const child of link.querySelectorAll(":scope > span, :scope > i")) {
            const rect = child.getBoundingClientRect();
            if (rect.left < box.left || rect.right > box.right + 1) problems.push("label overflow");
          }
        }
        return problems;
      });
      assert.deepEqual(defects, [], `${route} at ${width}px`);

      const panel = page.locator(".side-panel");
      const close = page.locator(".side-panel-close");
      await page.waitForFunction(() => {
        const openPanel = document.querySelector('.side-panel[data-open="true"]');
        return openPanel?.contains(document.activeElement);
      });
      await page.locator("body").evaluate((body) => {
        const probe = document.createElement("button");
        probe.id = "navigation-focus-probe";
        body.append(probe);
        probe.focus();
      });
      assert.equal(
        await panel.evaluate((node) => node.contains(document.activeElement)),
        true,
        `${route} at ${width}px contains stray focus`,
      );

      await close.focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await panel
          .locator("a[href], button:not([disabled])")
          .last()
          .evaluate((node) => node === document.activeElement),
        true,
        `${route} at ${width}px wraps backward from close`,
      );

      const notice = page.locator(".side-panel-announcement-trigger");
      await notice.focus();
      await page.keyboard.press("Enter");
      const announcement = page.locator("#site-announcement-dialog");
      await announcement.waitFor({ state: "visible" });
      assert.equal(
        await announcement.evaluate((node) => node.contains(document.activeElement)),
        true,
        `${route} at ${width}px allows nested notice focus`,
      );
      await page.keyboard.press("Escape");
      await announcement.waitFor({ state: "hidden" });
      assert.equal(
        await notice.evaluate((node) => node === document.activeElement),
        true,
        `${route} at ${width}px restores notice focus`,
      );

      await panel.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      assert.equal(
        await close.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= window.innerHeight;
        }),
        true,
        `${route} at ${width}px keeps close visible at panel bottom`,
      );

      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.querySelector(".side-panel")?.dataset.open === "false",
      );
      assert.equal(
        await trigger.evaluate((node) => node === document.activeElement),
        true,
        `${route} at ${width}px restores trigger focus on Escape`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.sideMenuOpen),
        undefined,
      );
      await page.locator("#navigation-focus-probe").evaluate((node) => node.remove());
      console.log(`PASS ${width}px ${route}: targets, labels, close and unlock`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
