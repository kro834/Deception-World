import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
try {
  for (const width of [320, 390, 1280]) {
    for (const recovery of ["reload", "world"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
      });
      await page.goto(new URL("/world", base).href);
      await page.waitForTimeout(1200);
      const refuseChunk = (route) => route.abort("failed");
      await page.route("**/assets/rexonance-saga-*.js", refuseChunk);
      await page.locator(".side-panel-trigger").click();
      await page.locator('.side-panel-links a[href="/rexonance-saga#top"]').click();
      await page.locator(".app-load-error").waitFor({ timeout: 20000 });
      assert.match(
        await page.locator(".app-load-error").innerText(),
        /ページを読み込めませんでした/,
      );
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        heights: [...document.querySelectorAll(".app-load-error-actions > *")].map(
          (node) => node.getBoundingClientRect().height,
        ),
      }));
      assert.equal(layout.overflow, false);
      assert.ok(layout.heights.every((height) => height >= 48));
      if (process.env.QA_SCREENSHOT_DIR && recovery === "reload") {
        await page.screenshot({ path: `${process.env.QA_SCREENSHOT_DIR}/load-error-${width}.png` });
      }
      await page.unroute("**/assets/rexonance-saga-*.js", refuseChunk);
      if (recovery === "reload") {
        await page.getByRole("button", { name: "ページを再読み込み" }).click();
        await page.locator(".rxs-page").waitFor();
      } else {
        await page.getByRole("link", { name: "WORLD ARCHIVEへ戻る" }).click();
        await page.waitForURL("**/world");
        await page.locator(".hero#top").waitFor();
      }
      assert.equal(await page.locator(".app-load-error").count(), 0);
      results.push({ width, recovery, pass: true });
      await page.close();
    }
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}
