import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8189";
const browser = await webkit.launch();
try {
  for (const width of [320, 390, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/world");
    // SSR has no loading flag either; wait for the mounted World route before testing selection.
    await page.waitForFunction(() =>
      document.documentElement.dataset.worldPageVisible === "true" &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const select = page.getByRole("button", { name: "EP.05 来訪を選択", exact: true });
    await select.click();
    const card = page.locator(".episode-card").nth(4);
    await page.waitForFunction(() => document.querySelectorAll(".episode-card")[4]?.classList.contains("is-active"));
    assert.equal(await card.locator("h4").innerText(), "来訪");
    const image = card.locator(".episode-thumbnail img");
    // 2026-11-28: owner supplied EP5's thumbnail (replaces the ERROR placeholder).
    assert.equal(await image.getAttribute("src"), "/episode-05-arrival.webp");
    await image.evaluate(async image => { await image.decode(); });
    const decoded = await image.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, source: image.currentSrc }));
    assert.ok(decoded.width > 0 && decoded.height > 0 && /episode-05-arrival(-\d+)?\.webp$/.test(decoded.source), JSON.stringify(decoded));
    assert.equal(await select.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".episode-card").count(), 6);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await mkdir("output/playwright", { recursive: true });
    await card.screenshot({ path: `output/playwright/ep5-arrival-${width}.png` });
    console.log(`PASS EP5 来訪 / owner thumbnail ${width}px: title, loaded thumbnail, selection, overflow, errors`);
    await page.close();
  }
} finally {
  await browser.close();
}
