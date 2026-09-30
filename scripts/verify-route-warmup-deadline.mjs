import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
try {
  for (const width of process.env.QA_ONE_CASE ? [390] : [390, 1280]) {
    for (const destination of process.env.QA_ONE_CASE
      ? ["zeus"]
      : ["zeus", "form-archive", "saga"]) {
      const path =
        destination === "zeus"
          ? "/managers/zeus"
          : destination === "saga"
            ? "/riders/saga"
            : "/form-archive";
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
      });
      await page.goto(new URL("/world", base).href);
      await page.waitForTimeout(1200);
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let intercepted = false;
      const holdChunk = async (route) => {
        intercepted = true;
        await held;
        await route.continue().catch(() => undefined);
      };
      const chunk = destination === "saga" ? "_id" : destination;
      await page.route(`**/assets/${chunk}-*.js`, holdChunk);
      if (destination === "zeus") {
        await page.locator('a[href="/managers/zeus"]').first().click();
      } else if (destination === "saga") {
        await page.locator(".side-panel-trigger").click();
        await page.locator('.side-panel-links a[href="/riders/saga"]').click();
      } else {
        await page.locator(".side-panel-trigger").click();
        await page.locator('.side-panel-links a[href="/form-archive"]').click();
      }
      await page.waitForFunction(() => document.documentElement.dataset.loading === "true");
      await page.waitForTimeout(13500);
      assert.equal(intercepted, true, "the destination route chunk must actually be held");
      assert.equal(
        await page.locator(".load-gate").count(),
        0,
        "a stalled preload must release its cover",
      );
      assert.equal(await page.evaluate(() => document.documentElement.dataset.loading), undefined);
      assert.equal(
        new URL(page.url()).pathname,
        "/world",
        "timeout must not navigate to a pending route",
      );
      const warning = page.locator(".route-load-delay");
      assert.match(await warning.innerText(), /読み込みが遅れています/);
      assert.equal(
        await warning.getByRole("link", { name: "もう一度開く" }).getAttribute("href"),
        path,
      );
      assert.ok(
        (await warning
          .getByRole("button", { name: "閉じる" })
          .evaluate((node) => node.getBoundingClientRect().height)) >= 44,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      await warning.getByRole("button", { name: "閉じる" }).click();
      release();
      await page.unroute(`**/assets/${chunk}-*.js`, holdChunk);
      await page.waitForTimeout(1500);
      assert.equal(
        new URL(page.url()).pathname,
        "/world",
        "late preload completion must not navigate",
      );
      await page.evaluate(() => scrollTo({ top: 400, behavior: "instant" }));
      assert.ok(
        (await page.evaluate(() => scrollY)) > 100,
        "document scrolling must remain available",
      );
      await page.goto(new URL(path, base).href);
      await page
        .locator(destination === "form-archive" ? "#form-archive-frame" : "h1")
        .first()
        .waitFor();
      results.push({ width, destination, pass: true });
      await page.close();
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}
