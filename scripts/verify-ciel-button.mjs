import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8197";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const out = process.env.AUDIT_OUT || `output/playwright/ciel-${engine}`;
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const report = [];
let activePage;
const ready = async (page) => {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return (
      root.dataset.worldPageVisible === "true" &&
      !["data-loading", "data-route-cover", "data-route-scroll-settling"].some((name) =>
        root.hasAttribute(name),
      )
    );
  });
  await page.waitForFunction(() => {
    const image = document.querySelector(".ciel-button .is-default");
    return image?.complete && image.naturalWidth > 0;
  });
};
const openMenu = async (page) => {
  const trigger = page.locator(".side-panel-trigger").first();
  const rect = await trigger.boundingBox();
  assert.ok(rect);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.locator('.side-panel[data-open="true"]').waitFor();
};

try {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
    [1024, 768],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    context.setDefaultTimeout(25_000);
    const page = await context.newPage();
    activePage = page;
    const errors = [],
      oldImageRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/\/zeus-button(?:-|\.)/.test(new URL(request.url()).pathname))
        oldImageRequests.push(request.url());
    });
    await page.goto(new URL("/library?kind=person", base).href);
    await ready(page);
    const button = page.locator(".ciel-button");
    assert.match(await button.getAttribute("aria-label"), /^シエルボタン。/);
    const image = await button
      .locator(".is-default")
      .evaluate((node) => ({ src: node.currentSrc, width: node.naturalWidth }));
    assert.match(image.src, /\/ciel-button-20261018-(144|216|360)\.webp$/);
    assert.equal(
      await button.locator(".is-returning").getAttribute("src"),
      "/ciel-button-20261018-360.webp",
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${out}/${width}-library.png` });
    await button.screenshot({ path: `${out}/${width}-button.png` });

    // Exercise the real cancellation handler before its first paint, without
    // pretending a synthetic pagehide is a physical background/PWA test.
    await page.evaluate(() => {
      document.querySelector(".ciel-button").click();
      window.dispatchEvent(new Event("pagehide"));
    });
    await page.waitForTimeout(150);
    assert.equal(new URL(page.url()).pathname, "/library");
    assert.equal(await button.getAttribute("aria-busy"), "false");
    assert.equal(await button.getAttribute("data-return-loading"), "false");

    await openMenu(page);
    const toggle = page.locator(".side-panel-zeus-toggle");
    assert.match(await toggle.innerText(), /シエルボタン/);
    assert.doesNotMatch(await toggle.innerText(), /ゼウスボタン/);
    await toggle.click();
    await page.locator(".ciel-button").waitFor({ state: "detached" });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible === "true");
    assert.equal(await page.locator(".ciel-button").count(), 0, "saved OFF survives reload");
    await openMenu(page);
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await toggle.click();
    await page.locator(".side-panel-close").click();
    await ready(page);
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
    await page.waitForTimeout(300);

    // A normal tap after cancellation and disable/re-enable must still return
    // to the real World route and release both compact loading states.
    await button.tap();
    await page.waitForURL("**/world#top");
    await ready(page);
    await page.waitForFunction(() => {
      const button = document.querySelector(".ciel-button");
      return (
        button?.getAttribute("aria-busy") === "false" && button.dataset.returnLoading === "false"
      );
    });
    assert.equal(await page.locator(".ciel-button").count(), 1);
    await page.screenshot({ path: `${out}/${width}-returned.png` });
    assert.deepEqual(oldImageRequests, [], "no old Zeus artwork is requested");
    assert.deepEqual(errors, [], "no browser JavaScript errors in the Ciel journey");
    report.push({
      engine,
      width,
      height,
      image,
      suppliedArtwork: true,
      savedToggle: true,
      simulatedPagehideCancellation: true,
      subsequentTapReturn: true,
      errors,
    });
    await context.close();
    console.log(
      `PASS ${engine}/${width}: Ciel artwork/name, persisted toggle, cancellation, return`,
    );
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.error("Failure URL", activePage.url());
  }
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
