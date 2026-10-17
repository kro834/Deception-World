// Real SPA returns: no forced engine, navigation interception or animation seek.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8591";
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: phone,
      isMobile: phone,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/rexonance-nanites-")) requests.push(r.url());
    });
    const settled = () =>
      page.waitForFunction(
        () =>
          !document.documentElement.hasAttribute("data-loading") &&
          !document.querySelector(".load-gate"),
        null,
        { timeout: 45000 },
      );
    await page.goto(`${base}/world`, { waitUntil: "networkidle" });
    await settled();
    await page.waitForTimeout(9000);
    const samples = [];
    for (let play = 0; play < 3; play++) {
      const start = Date.now();
      const before = requests.length;
      await page.locator(".side-panel-trigger").first().click();
      const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
      await link.waitFor({ state: "visible" });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      const elapsed = Date.now() - start;
      if (play) assert.ok(elapsed < 3000, `return invocation was too late: ${elapsed}ms`);
      await page.waitForFunction(
        () => document.querySelector(".rx-suit")?.dataset.swarm === "canvas",
        null,
        { timeout: 2000 },
      );
      await page.waitForURL("**/rexonance-saga#top", { timeout: 45000 });
      await settled();
      if (play) assert.equal(requests.length, before, "retained kit must not fetch again");
      samples.push({ play, invocationMs: elapsed, kitRequests: requests.length - before });
      if (play < 2) {
        await page.locator(".rxs-brand").click();
        await page.waitForURL((url) => url.pathname === "/world", { timeout: 45000 });
        await settled();
      }
    }
    assert.deepEqual(errors, []);
    results.push({ profile: phone ? "phone" : "desktop", samples });
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
