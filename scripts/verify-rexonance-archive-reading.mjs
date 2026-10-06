// Browser fixture: run separately from the browser-free unit test suite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";

const stylesheet = readFileSync(
  new URL("../public/rexonance-archive-update.css", import.meta.url),
  "utf8",
);
const readingRules = [
  ...stylesheet.matchAll(
    /#saga-forms-performance-v5 \.form-detail \.rexonance-finisher-grid[^{}]*\{[^{}]*\}/g,
  ),
].map(([rule]) => rule);
const baseline = readingRules.reduce((css, rule) => css.replace(rule, ""), stylesheet);
const finisher =
  "踏み切りと同時にREXONANCE DRIVEが始動し、腰部の回転、軸足の反力、上体の捻転、脚部の遠心力を統合しながらLOW→MEDIUM→HIGH→XHIGH→MAX→ULTRAと出力を連続上昇させる。";

async function metrics(page, selector) {
  return page.locator(selector).evaluate((article) => {
    const paragraph = article.querySelector("p");
    const card = article.closest(".detail-card");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const bounds = card.getBoundingClientRect();
    const font = getComputedStyle(paragraph);
    return {
      paragraphWidth: paragraph.getBoundingClientRect().width,
      cardOverflow: card.scrollWidth - card.clientWidth,
      textOutsideCard: [...range.getClientRects()].some(
        (rect) => rect.right > bounds.right + 1 || rect.left < bounds.left - 1,
      ),
      fontSize: font.fontSize,
      lineHeight: font.lineHeight,
      text: paragraph.textContent,
    };
  });
}

test("long Rexonance finisher text fits the main reading card without altering comparison or type", async () => {
  assert.ok(readingRules.length, "main dossier reading rules must be present");
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const width of [320, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<!doctype html><html><head><style>
        body { margin: 0; font-family: Arial, sans-serif; }
        #saga-forms-performance-v5 { width: ${width}px; }
        .detail-card { width: ${width - 46}px; margin-left: 23px; overflow: clip; }
        .form-detail, .compare-form-card { display: grid; }
        p { overflow-wrap: break-word; }
        ${baseline}
      </style></head><body><main id="saga-forms-performance-v5">
        <div class="detail-card"><article class="form-detail">
          <section class="rexonance-setting-block"><div class="rexonance-finisher-grid">
            <article><h5>デウスシフト・レクソナンスパーク</h5><p>${finisher}</p></article>
          </div></section>
        </article></div>
        <div class="detail-card"><article class="compare-form-card">
          <section class="rexonance-setting-block"><div class="rexonance-finisher-grid">
            <article><h5>デウスシフト・レクソナンスパーク</h5><p>${finisher}</p></article>
          </div></section>
        </article></div>
      </main></body></html>`);
      const mainSelector = ".form-detail .rexonance-finisher-grid article";
      const compareSelector = ".compare-form-card .rexonance-finisher-grid article";
      const before = await metrics(page, mainSelector);
      const compareBefore = await metrics(page, compareSelector);
      if (width === 320) {
        assert.ok(before.cardOverflow > 1 && before.textOutsideCard, "fixture reproduces narrow-card clipping");
      }
      await page.addStyleTag({ content: readingRules.join("\n") });
      const after = await metrics(page, mainSelector);
      assert.ok(after.cardOverflow <= 1, `${width}px: main card should not overflow`);
      assert.equal(after.textOutsideCard, false, `${width}px: every line stays inside the card`);
      assert.equal(after.fontSize, before.fontSize);
      assert.equal(after.lineHeight, before.lineHeight);
      assert.equal(after.text, before.text);
      assert.deepEqual(await metrics(page, compareSelector), compareBefore);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
