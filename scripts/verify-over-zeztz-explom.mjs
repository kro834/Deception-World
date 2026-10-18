import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { webkit } from "playwright";
const browser = await webkit.launch();
try {
  for (const width of [320, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:4226"}/riders/over-zeztz`);
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
    await page.waitForTimeout(4000);
    const cards = page.locator(".form-pickup-card");
    assert.equal(await cards.count(), 2);
    await cards.nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    assert.match(await cards.nth(1).textContent(), /エクスプロム/);
    const control = cards.nth(1).locator(".form-pickup-plus");
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await control.press("Enter");
    const dialog = page.locator(".form-pickup-dialog[open]");
    await dialog.waitFor();
    await page.waitForTimeout(1200);
    for (const text of ["205.9cm（est.）", "110.0kg（est.）", "77.7〜t（est.）", "エクスプロムオーバースマッシュ"])
      assert.ok((await dialog.innerText()).includes(text), text);
    const image = dialog.locator('img[src="/rider-over-zeztz-explom-20261019.png"]').first();
    await image.evaluate(i => i.decode());
    assert.ok(await image.evaluate(i => i.naturalWidth > 1000 && i.currentSrc.includes("explom")));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mkdir("output/playwright", { recursive: true });
    await page.screenshot({ path: `output/playwright/explom-${width}.png` });
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(`PASS Explom ${width}px: image, specs, dialog, close, overflow`);
    await page.close();
  }
} finally { await browser.close(); }
