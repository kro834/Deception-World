import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const iframeMode = process.env.IFRAME === "true";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1280]) {
    for (const archive of ["saga", "realm"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const prefix = archive === "saga" ? "" : "realm--";
      const detail = `${prefix}saga-detail-title-v5`;
      const comparison = `${prefix}saga-ratio-title-v5`;
      let archiveDocument = page;
      if (iframeMode) {
        await page.goto(`${base}/form-archive`);
        await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        if (archive === "realm") {
          await page.locator('button[data-archive="realm"]').click();
          await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        }
        const handle = await page.locator(`iframe[data-archive-kind="${archive}"]`).elementHandle();
        archiveDocument = await handle.contentFrame();
        assert.ok(archiveDocument);
      }
      await archiveDocument.goto(`${base}/${archive}-form-archive-embedded.html#${detail}`);
      const root = archiveDocument.locator('[id$="saga-forms-performance-v5"]').last();
      const location = async (id) => {
        await archiveDocument.waitForFunction(
          ({ selector, id }) => document.querySelector(selector)?.dataset.archiveLocation === id,
          {
            selector:
              archive === "saga"
                ? "#saga-forms-performance-v5"
                : "#realm--saga-forms-performance-v5",
            id,
          },
          { timeout: 2500 },
        );
        await page.waitForTimeout(1700);
        assert.equal(
          await root.getAttribute("data-archive-location"),
          id,
          "location stays correct after the intent hold expires",
        );
        assert.equal(
          await root.locator('.archive-nav a[aria-current="true"]').getAttribute("href"),
          `#${id}`,
        );
      };
      await location(detail);
      await root.locator(`.archive-nav a[href="#${comparison}"]`).click();
      await location(comparison);
      if (iframeMode) await archiveDocument.evaluate(() => history.back());
      else await page.goBack();
      await location(detail);
      if (iframeMode) await archiveDocument.evaluate(() => history.forward());
      else await page.goForward();
      await location(comparison);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${width}px${iframeMode ? " iframe" : ""}: detail deep link, comparison navigation, history back/forward (settled)`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
