import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const iframeMode = process.env.IFRAME === "true";
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
      let archiveDocument = page;
      let frameBox = null;
      if (iframeMode) {
        await page.goto(`${base}/form-archive`);
        await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        if (archive === "realm") {
          await page.locator('button[data-archive="realm"]').click();
          await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        }
        const iframe = page.locator(`iframe[data-archive-kind="${archive}"]`);
        const handle = await iframe.elementHandle();
        archiveDocument = await handle.contentFrame();
        assert.ok(archiveDocument);
        frameBox = await iframe.boundingBox();
      } else {
        await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      }
      const trigger = archiveDocument.locator(".art-trigger").first();
      await trigger.click();
      const dialog = archiveDocument.locator(".image-lightbox[open]");
      await dialog.waitFor();
      await dialog.locator(".lightbox-image").evaluate((node) => node.decode());
      const image = await dialog.locator(".lightbox-image").boundingBox();
      const imageX = image.x + image.width / 2;
      const imageY = image.y + Math.min(image.height / 2, 100);
      const gutterX = (frameBox?.x || 0) + 4;
      const gutterY = (frameBox?.y || 0) + 100;
      await page.mouse.move(imageX, imageY);
      await page.mouse.down();
      await page.mouse.move(gutterX, imageY, { steps: 6 });
      await page.mouse.up();
      assert.equal(
        await dialog.count(),
        1,
        "dragging out of archive artwork keeps the lightbox open",
      );
      await page.mouse.move(gutterX, gutterY);
      await page.mouse.down();
      await page.mouse.move(gutterX, gutterY + 100, { steps: 6 });
      await page.mouse.move(gutterX, gutterY, { steps: 6 });
      await page.mouse.up();
      assert.equal(
        await dialog.count(),
        1,
        "a gutter drag returning to its start is not a backdrop tap",
      );
      await page.mouse.click(gutterX, gutterY);
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${width}px${iframeMode ? " iframe" : ""}: artwork drag, returning gutter drag, backdrop tap, focus return`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
