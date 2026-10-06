import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});

try {
  for (const width of [320, 390, 1440]) {
    for (const archive of ["saga", "realm"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      const root = page.locator('[id$="saga-forms-performance-v5"]').last();
      const forms = await root.locator(".form-chip").evaluateAll((chips) =>
        chips.map((chip) => ({
          id: chip.dataset.formId,
          articleId: chip.getAttribute("aria-controls"),
          name: chip.querySelector(".chip-name").textContent.trim(),
        })),
      );
      assert.equal(forms.length, archive === "saga" ? 17 : 9);
      for (const form of forms) {
        await root.locator(".hero-action").first().focus();
        await page.keyboard.press("/");
        await root.locator('input[type="search"]').fill(form.name);
        const chip = root.locator(`.form-chip[data-form-id="${form.id}"]`);
        await chip.focus();
        await chip.press("Enter");
        const article = page.locator(`#${form.articleId}`);
        await article.waitFor({ state: "visible" });
        await page.waitForFunction(
          (id) => !document.getElementById(id)?.classList.contains("is-selector-sheet-open"),
          await root.getAttribute("id"),
        );
        const reading = await article.evaluate(async (node) => {
          await document.fonts.ready;
          const bounds = node.getBoundingClientRect();
          return {
            overflow: node.scrollWidth - node.clientWidth,
            clipped: [...node.querySelectorAll("p,h3,h4,li")].filter((item) => {
              if (!item.getClientRects().length || item.closest('[aria-hidden="true"]')) return false;
              const range = document.createRange();
              range.selectNodeContents(item);
              return [...range.getClientRects()].some(
                (rect) => rect.width > 0 && (rect.left < bounds.left - 2 || rect.right > bounds.right + 2),
              );
            }).map((item) => item.textContent.trim()),
          };
        });
        assert.ok(reading.overflow <= 2, `${archive} ${width}px ${form.id}: detail overflow`);
        assert.deepEqual(reading.clipped, [], `${archive} ${width}px ${form.id}: clipped prose`);

        const trigger = article.locator(".art-trigger");
        await trigger.focus();
        await trigger.press("Enter");
        const dialog = root.locator(".image-lightbox[open]");
        await dialog.waitFor();
        const expanded = await dialog.evaluate(async (node) => {
          await node.querySelector(".lightbox-image").decode();
          const bounds = node.getBoundingClientRect();
          const close = node.querySelector(".lightbox-close").getBoundingClientRect();
          const title = node.querySelector(".lightbox-bar strong");
          return {
            overflow: node.scrollWidth - node.clientWidth,
            titleOverflow: title.scrollWidth - title.clientWidth,
            closeInside: close.left >= bounds.left && close.right <= bounds.right && close.top >= 0 && close.bottom <= innerHeight,
            closeSize: Math.min(close.width, close.height),
          };
        });
        assert.ok(expanded.overflow <= 2 && expanded.titleOverflow <= 2, JSON.stringify({ width, form, expanded }));
        assert.ok(expanded.closeInside && expanded.closeSize >= 44, JSON.stringify({ width, form, expanded }));
        await dialog.locator(".lightbox-close").click();
        await dialog.waitFor({ state: "hidden" });
        assert.ok(await trigger.evaluate((node) => document.activeElement === node));
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), "hidden");
        console.log(`PASS ${archive} ${width}px ${form.id}: prose, complete title, visible close and focus return`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
