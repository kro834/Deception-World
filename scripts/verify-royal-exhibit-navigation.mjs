import assert from "node:assert/strict";
import { webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8394");
const browser = await webkit.launch();
try {
  for (const delayCss of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    let delayedRequests = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    if (delayCss) {
      await page.route(/royal-exhibit.*\.css/, async (route) => {
        delayedRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      });
    }
    await page.goto(`${base}/final-stage#realm-royal`);
    await page.waitForFunction(() => {
      const trigger = document.querySelector("#realm-royal button.form-pickup-plus");
      return trigger && Object.keys(trigger).some((key) => key.startsWith("__reactProps"));
    });
    await page.waitForTimeout(1500);
    const trigger = page.locator("#realm-royal button.form-pickup-plus");
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const before = await trigger.evaluate((node) => node.getBoundingClientRect().top);
    await page.evaluate(() => {
      window.__royalVisibilitySamples = [];
      let count = 0;
      const timer = window.setInterval(() => {
        const main = document.querySelector("main.fst-page");
        window.__royalVisibilitySamples.push(getComputedStyle(main).display);
        if (++count >= 120) window.clearInterval(timer);
      }, 30);
    });
    await trigger.click();
    const dialog = page.locator("dialog#realm-royal-pickup[open]");
    await dialog.waitFor();
    await dialog.locator(".rr-exhibit").waitFor();
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(400);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).first().click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(800);
    const after = await trigger.evaluate((node) => node.getBoundingClientRect().top);
    const state = await page.evaluate(() => {
      const nav = document.querySelector(".rxs-local-nav");
      const main = nav.closest(".fst-page");
      return {
        hidden: window.__royalVisibilitySamples.includes("none"),
        navHeight: nav.getBoundingClientRect().height,
        reserve: parseFloat(main.style.getPropertyValue("--rxs-local-nav-reserve")),
      };
    });
    if (delayCss) assert.ok(delayedRequests > 0, "exhibit CSS delay must be exercised");
    assert.equal(state.hidden, false, "main must remain visible while exhibit CSS loads");
    assert.ok(Math.abs(after - before) <= 2, `return position ${before} -> ${after}`);
    assert.ok(Math.abs(state.navHeight - state.reserve) <= 1, JSON.stringify(state));
    assert.deepEqual(errors, []);
    console.log(`PASS WebKit 1024: CSS ${delayCss ? "delayed 2s" : "normal"}, rotation and return (${before} -> ${after})`);
    await page.close();
  }
} finally {
  await browser.close();
}
