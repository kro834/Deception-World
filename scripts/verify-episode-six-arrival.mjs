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
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
    const select = page.getByRole("button", { name: "EP.06 来訪を選択", exact: true });
    await select.click();
    const card = page.locator(".episode-card").nth(5);
    await page.waitForFunction(() => document.querySelectorAll(".episode-card")[5]?.classList.contains("is-active"));
    assert.equal(await card.locator("h4").innerText(), "来訪");
    const image = card.locator(".episode-thumbnail img");
    assert.equal(await image.getAttribute("src"), "/episode-06-arrival-error.svg");
    await image.evaluate(async image => { await image.decode(); });
    // A viewBox-only SVG has browser-defined intrinsic pixels; decoding and the selected source are the contract.
    const decoded = await image.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, source: image.currentSrc }));
    assert.ok(decoded.width > 0 && decoded.height > 0 && decoded.source.endsWith("episode-06-arrival-error.svg"), JSON.stringify(decoded));
    assert.equal(await select.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".episode-card").count(), 6);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await mkdir("output/playwright", { recursive: true });
    await card.screenshot({ path: `output/playwright/ep6-arrival-${width}.png` });
    console.log(`PASS EP6 来訪 / ERROR ${width}px: title, loaded thumbnail, selection, overflow, errors`);
    await page.close();
  }
} finally {
  await browser.close();
}
