import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    for (const route of ["/world", "/riders/saga", "/rexonance-saga", "/dream-chapter"]) {
      await page.goto(`${process.env.BASE_URL || "http://localhost:8082"}${route}`);
      await page.locator(".side-panel-trigger").first().click();
      await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "true");
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
      await page.locator(".side-panel-close").click();
      await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "false");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.sideMenuOpen), undefined);
      console.log(`PASS ${width}px ${route}: targets, labels, close and unlock`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
