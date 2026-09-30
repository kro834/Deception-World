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
      } else {
        await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      }
      const compare = archiveDocument.locator('[id$="saga-form-compare-ios"]').last();
      const selects = compare.locator(".compare-native-select");
      const ranges = compare.locator(".compare-range");
      const values = await selects
        .first()
        .locator("option")
        .evaluateAll((nodes) => nodes.map((node) => node.value));
      const first = values[0];
      const last = values.at(-1);
      const beforeLast = values.at(-2);
      const assertPair = async (a, b) => {
        await archiveDocument.waitForFunction(
          ({ selector, values }) => {
            const root = document.querySelector(selector);
            return [...root.querySelectorAll(".compare-side")].every(
              (side, index) =>
                side.querySelector(".compare-native-select")?.value === values[index] &&
                side.querySelector(".compare-radio:checked")?.value === values[index],
            );
          },
          {
            selector:
              archive === "saga" ? "#saga-form-compare-ios" : "#realm--saga-form-compare-ios",
            values: [a, b],
          },
        );
        await archiveDocument.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(await selects.nth(0).inputValue(), a);
        assert.equal(await selects.nth(1).inputValue(), b);
        assert.equal(await ranges.nth(0).inputValue(), String(values.indexOf(a) + 1));
        assert.equal(await ranges.nth(1).inputValue(), String(values.indexOf(b) + 1));
        const alignment = await compare.evaluate((node) => {
          const sides = [...node.querySelectorAll(".compare-side")];
          const cards = sides.map((side) =>
            [...side.querySelectorAll(".compare-form-card")].find(
              (card) => getComputedStyle(card).display !== "none",
            ),
          );
          const rows = cards.map((card) =>
            [...card.querySelectorAll("[data-compare-row]")].sort(
              (a, b) => Number(a.dataset.compareRow) - Number(b.dataset.compareRow),
            ),
          );
          return {
            counts: rows.map((entries) => entries.length),
            maxDelta: Math.max(
              0,
              ...rows[0].map((row, index) =>
                Math.abs(
                  row.getBoundingClientRect().top - rows[1][index].getBoundingClientRect().top,
                ),
              ),
            ),
          };
        });
        assert.equal(alignment.counts[0], alignment.counts[1]);
        assert.ok(alignment.maxDelta <= 1, `comparison row delta is ${alignment.maxDelta}px`);
      };
      await selects.nth(0).selectOption(last);
      await selects.nth(1).selectOption(first);
      await assertPair(last, first);
      await compare.locator('[id$="saga-compare-swap-button"]').click();
      await assertPair(first, last);
      await ranges.nth(0).focus();
      await ranges.nth(0).press("End");
      await assertPair(last, last);
      assert.equal(await compare.locator('[id$="saga-compare-same-note"]').isVisible(), true);
      await ranges.nth(0).press("ArrowLeft");
      await assertPair(beforeLast, last);
      assert.equal(await compare.locator('[id$="saga-compare-same-note"]').isVisible(), false);
      assert.equal(
        await compare.evaluate((node) => node.classList.contains("is-range-scrubbing")),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${width}px${iframeMode ? " iframe" : ""}: native select, swap, keyboard range, same-form note, aligned rows`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
