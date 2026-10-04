import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const results = [];

async function ready(page, kind) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector("#archive-switcher")?.getAttribute("aria-busy") === "false" &&
      document
        .querySelector(`button[data-archive="${expected}"]`)
        ?.getAttribute("aria-selected") === "true" &&
      document.querySelector("iframe")?.dataset.archiveKind === expected,
    kind,
  );
}

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/form-archive#archive-switcher", base).href);
    await ready(page, "saga");
    const historyLength = await page.evaluate(() => history.length);
    await page.locator('button[data-archive="realm"]').focus();
    await page.keyboard.press("Enter");
    await ready(page, "realm");
    assert.equal(new URL(page.url()).searchParams.get("archive"), "realm");
    assert.equal(new URL(page.url()).hash, "#archive-switcher");
    assert.equal(await page.evaluate(() => history.length), historyLength);
    assert.equal(
      await page
        .locator('button[data-archive="realm"]')
        .evaluate((node) => document.activeElement === node),
      true,
      "the loaded tab retains keyboard focus",
    );

    await page.locator(".side-panel-trigger").click();
    await page.locator('.side-panel-links a[aria-current="page"]').click();
    await ready(page, "realm");
    assert.equal(new URL(page.url()).searchParams.get("archive"), "realm");

    // Leave through the real shared menu, then return through browser history.
    await page.locator(".side-panel-trigger").click();
    await page.locator('.side-panel-links a[href="/world#top"]').click();
    await page.waitForURL("**/world#top");
    await page.goBack();
    await ready(page, "realm");
    assert.equal(new URL(page.url()).searchParams.get("archive"), "realm");
    await page.reload();
    await ready(page, "realm");

    const returnHistoryLength = await page.evaluate(() => history.length);
    await page.locator('button[data-archive="saga"]').click();
    await ready(page, "saga");
    assert.equal(new URL(page.url()).searchParams.has("archive"), false);
    assert.equal(new URL(page.url()).hash, "#archive-switcher");
    assert.equal(await page.evaluate(() => history.length), returnHistoryLength);

    // A direct Realm link and an unsupported value are both safe entry points.
    await page.goto(new URL("/form-archive?archive=realm", base).href);
    await ready(page, "realm");
    await page.goto(new URL("/form-archive?archive=unknown", base).href);
    await ready(page, "saga");
    assert.deepEqual(errors, [], "archive switching/history produces no page errors");
    results.push({ engine, width, history: "passed", reload: "passed", directLinks: "passed" });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
