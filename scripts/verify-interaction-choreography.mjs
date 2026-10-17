import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4226";
const engine = process.env.PW_ENGINE || "webkit";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const output = "output/playwright/choreography";
await mkdir(output, { recursive: true });
async function land(page, path) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
  await page.waitForTimeout(4000);
}
const animation = (locator, pseudo) =>
  locator.evaluate((node, p) => getComputedStyle(node, p).animationName, pseudo);
try {
  for (const width of [320, 390, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 1100,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await land(page, "/gallery");
    const card = page.locator(".gallery-work-open").nth(3);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    assert.match(
      await animation(card.locator(".gallery-work-frame"), "::after"),
      /choreography-reflection/,
    );
    await card.focus();
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.press("Enter");
    const dialog = page.locator(".gallery-viewer[open]");
    await dialog.waitFor();
    assert.match(await animation(dialog.locator(".gallery-viewer-stage")), /choreography-exhibit/);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/${engine}-${width}-viewer.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - before) < 4,
      "viewer restores reading position",
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    await page.locator(".side-panel-trigger").click();
    const label = page
      .locator('#site-side-panel[data-open="true"] .side-panel-links > a > span')
      .first();
    await label.waitFor();
    assert.match(await animation(label), /choreography-label/);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${output}/${engine}-${width}-menu.png` });
    await page.locator(".side-panel-close").click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator("html[data-side-menu-open]").count(), 0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await card.focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor();
    assert.equal(await animation(dialog.locator(".gallery-viewer-stage")), "none");
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      document.documentElement.dataset.worldEffects = "economy";
    });
    assert.equal(await animation(card.locator(".gallery-work-frame"), "::after"), "none");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        engine,
        width,
        gallery: "pass",
        menu: "pass",
        reducedMotion: "pass",
        economy: "pass",
        scrollReturn: "pass",
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
