import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
try {
  for (const width of [320, 360, 390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    await page.goto(`${process.env.BASE_URL || "http://localhost:8082"}/world`);
    // The settling attribute is absent in SSR too; first wait for hydration.
    await page.locator('.rider-tabs[data-liquid-initialized="true"]').waitFor({ state: "attached" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    // WebKit's automation scrollIntoViewIfNeeded may leave content-visibility
    // regions offscreen. Use native DOM positioning, then exercise a real tap.
    await page
      .locator(".episode-archive")
      .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(160);
    await page
      .locator(".episode-pickup-plus")
      .first()
      .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(160);
    const targets = await page.locator(".episode-pickup-plus").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const card = button.closest(".episode-card").getBoundingClientRect();
        const title = button.closest(".episode-card").querySelector("h4").getBoundingClientRect();
        const overlaps =
          rect.left < title.right &&
          rect.right > title.left &&
          rect.top < title.bottom &&
          rect.bottom > title.top;
        return {
          width: rect.width,
          height: rect.height,
          inside:
            rect.left >= card.left &&
            rect.right <= card.right &&
            rect.top >= card.top &&
            rect.bottom <= card.bottom,
          overlaps,
        };
      }),
    );
    assert.ok(targets.length > 0);
    for (const target of targets) {
      assert.ok(
        target.width >= (width <= 360 ? 48 : 44) && target.height >= (width <= 360 ? 48 : 44),
        JSON.stringify(target),
      );
      assert.ok(target.inside && !target.overlaps, JSON.stringify(target));
    }
    await page.locator(".episode-pickup-plus").first().tap();
    await page.locator(".episode-pickup-dialog[open]").waitFor();
    await page.getByRole("button", { name: "エピソードのピックアップを閉じる" }).tap();
    await page.waitForFunction(() => !document.querySelector(".episode-pickup-dialog[open]"));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({
      path: `/tmp/round4-episodes-${process.env.PW_ENGINE || "chrome"}-${width}.png`,
    });
    console.log(`PASS ${width}px: pickup targets, title clearance, tap open/close and no overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}
