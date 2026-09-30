import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];

async function openMenu(page) {
  await page.locator(".side-panel-trigger").click();
  await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "true");
  await page.waitForFunction(() =>
    document.querySelector(".side-panel")?.contains(document.activeElement),
  );
}

try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "iphone", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.name === "iphone" });
    const page = await context.newPage();
    await page.goto(new URL("/characters/dante", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await openMenu(page);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.matches(".side-panel-trigger"));
    assert.equal(await page.locator(".side-panel").getAttribute("data-open"), "false");
    results.push({
      viewport: viewport.name,
      check: "pointer menu then Escape restores its trigger",
    });

    await page.locator(".manager-back").click();
    await page.waitForURL("**/world*");
    await page.waitForTimeout(1800);
    await openMenu(page);
    await page.locator('.side-panel-links a[href="/riders/saga"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.loading === "true");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL("**/characters/dante");
    await page.waitForTimeout(2000);
    assert.equal(
      new URL(page.url()).pathname,
      "/characters/dante",
      "an old cover must not navigate after Back",
    );
    assert.equal(await page.locator(".load-gate").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.loading), undefined);
    results.push({
      viewport: viewport.name,
      check: "Back during a cover stays on restored history",
    });

    await openMenu(page);
    await page.locator('.side-panel-links a[href="/riders/saga"]').click();
    await page.waitForURL("**/riders/saga");
    await page.waitForFunction(
      () => !document.documentElement.dataset.loading && !document.querySelector(".load-gate"),
    );
    results.push({
      viewport: viewport.name,
      check: "the next route still works after cancellation",
    });

    await page.goto(new URL("/rexonance-saga", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await openMenu(page);
    await page.locator('.side-panel-links a[href="/rexonance-saga#performance"]').click();
    assert.equal(
      await page.locator(".load-gate").count(),
      0,
      "a same-page menu link must not replay the route cover",
    );
    await page.waitForURL("**/rexonance-saga#performance");
    await page.waitForTimeout(1400);
    const landing = await page
      .locator("#performance")
      .evaluate((element) => element.getBoundingClientRect().top);
    assert.ok(
      landing >= -4 && landing < 160,
      `performance section must land under the header (${landing})`,
    );
    results.push({
      viewport: viewport.name,
      check: "same-page menu aligns the section without a cover",
      top: landing,
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
