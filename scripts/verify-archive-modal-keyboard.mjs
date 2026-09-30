import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1280]) {
    for (const archive of ["saga", "realm"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      const trigger = page.locator(".art-trigger").first();
      const lightbox = page.locator(".image-lightbox[open]");
      await trigger.click();
      await lightbox.waitFor();
      await page.keyboard.press("/");
      await page.waitForTimeout(200);
      assert.equal(await page.locator(".is-selector-sheet-open").count(), 0);
      assert.equal(await lightbox.count(), 1);
      assert.equal(
        await page.locator(".lightbox-close").evaluate((node) => node === document.activeElement),
        true,
        "search must not steal focus from the image modal",
      );
      await page.keyboard.press("Escape");
      await lightbox.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((node) => node === document.activeElement),
        true,
        "image close returns focus to its trigger",
      );
      await page.keyboard.press("/");
      await page.waitForTimeout(200);
      assert.equal(
        await page
          .locator('input[type="search"]')
          .evaluate((node) => node === document.activeElement),
        true,
        "search remains usable after the image closes",
      );
      if (width === 390) {
        assert.equal(await page.locator(".is-selector-sheet-open").count(), 1);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".is-selector-sheet-open").count(), 0);
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${width}px: modal search guard, Escape, focus return, search reuse`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
