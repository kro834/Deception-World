import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const origin = process.env.BASE_URL || "http://localhost:8082";
try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    const page = await browser.newPage({ viewport });
    for (const [route, selector] of [
      ["/world", ".episode-card-copy p span, .episode-card-copy p b, .episode-thumbnail > span, .world-column-index > span"],
      ["/riders/saga", ".dossier-identity h1 small, .dossier-contents-copy small, .dossier-index-return > span"],
      ["/riders/over-zeztz", ".dossier-identity h1 small, .dossier-contents-copy small, .dossier-index-return > span"],
      ["/managers/rex-loi", ".dossier-identity h1 small, .dossier-contents-copy small, .dossier-index-return > span"],
    ]) {
      await page.goto(origin + route);
      const result = await page.evaluate((selector) => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        labels: [...document.querySelectorAll(selector)].map((element) => ({
          text: element.textContent.trim(),
          size: parseFloat(getComputedStyle(element).fontSize),
          clipped: element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX === "hidden",
        })),
      }), selector);
      assert.ok(result.labels.length > 0, `missing labels at ${route}`);
      assert.ok(result.overflow <= 1, `document overflow ${route}`);
      for (const label of result.labels) {
        assert.ok(label.size >= 11, `${route}: ${label.text} is ${label.size}px`);
        assert.equal(label.clipped, false, `${route}: ${label.text} clipped`);
      }
      console.log(`PASS ${viewport.width}px ${route}: ${result.labels.length} readable labels, no overflow`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
