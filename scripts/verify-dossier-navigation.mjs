import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function show(locator) {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
}

async function assertOther(page) {
  await page.waitForURL("**/world#manager-archive-other");
  await page
    .locator('.manager-archive-tabs[data-liquid-initialized="true"]')
    .waitFor({ state: "attached" });
  await ready(page);
  await page.waitForFunction(
    () => document.querySelector("#manager-tab-2")?.getAttribute("aria-selected") === "true",
  );
  assert.equal(await page.locator('#manager-panel-2 a[href="/characters/terra"]').count(), 1);
  assert.equal(await page.locator('#manager-panel-2 a[href="/characters/luna"]').count(), 1);
  // Direct native fragments can scroll after hydration without LoadGate's flag.
  await page.waitForFunction(() => {
    const target = document.getElementById("manager-archive-other")?.getBoundingClientRect();
    return target && target.top >= 0 && target.top < 240;
  });
  await page.waitForTimeout(500);
  const position = await page.locator("#manager-archive-other").boundingBox();
  assert.ok(position.y >= 0 && position.y < 240, `return anchor inset: ${position.y}`);
  const header = await page.locator(".topbar").boundingBox();
  const heading = await page.locator("#manager-archive .threat-copy > .system-label").boundingBox();
  assert.ok(heading.y >= header.y + header.height, "archive heading is behind the fixed header");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const name of ["terra", "luna"]) {
      for (const selector of [".manager-back", ".dossier-index-return"]) {
        await page.goto(`${base}/characters/${name}`);
        await ready(page);
        const link = page.locator(selector);
        await show(link);
        await link.click();
        await assertOther(page);
        await page.goBack();
        await page.waitForURL(`**/characters/${name}`);
        await ready(page);
        await page.goForward();
        await assertOther(page);
      }
    }
    await page.goto(`${base}/world#manager-archive-other`);
    await assertOther(page);
    // Selecting another tab stays possible after restoring the related records.
    const firstTab = page.locator("#manager-tab-0");
    await show(firstTab);
    await firstTab.click();
    await page.waitForFunction(
      () => document.querySelector("#manager-tab-0")?.getAttribute("aria-selected") === "true",
    );

    await page.goto(`${base}/managers/lejas`);
    await ready(page);
    await page.locator(".dossier-read-link").click();
    await page.waitForURL("**#dossier-index");
    const contents = page.locator(".dossier-contents a");
    assert.equal(await contents.count(), 3);
    assert.ok((await contents.first().textContent()).includes("世界は盤面になる"));
    for (const anchor of await page.locator(".dossier-reader-links a").all()) {
      assert.ok((await anchor.boundingBox()).height >= 48);
    }
    await contents.last().click();
    await page.waitForURL("**#character-section-03");
    await page.waitForTimeout(700);
    const reader = await page.locator(".dossier-reader").boundingBox();
    assert.ok(reader.y >= 0 && reader.y < 180, `sticky reader: ${reader.y}`);
    await page.locator('.dossier-reader a[href="#form-records"]').click();
    await page.waitForURL("**#form-records");
    await page.waitForTimeout(700);
    const form = await page.locator("#form-records").boundingBox();
    assert.ok(form.y >= 0 && form.y < viewport.height, `form anchor: ${form.y}`);
    await page.locator('.dossier-reader a[href="#dossier-profile"]').click();
    await page.waitForURL("**#dossier-profile");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${viewport.width}px: related top/footer return, history, direct URL, tab switching and Lejas reading navigation`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
