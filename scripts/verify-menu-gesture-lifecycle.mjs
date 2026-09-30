import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
const pause = (page, ms = 1400) => page.waitForTimeout(ms);

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
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const nested of [false, true]) {
      await page.goto(new URL("/world#story", base).href, { waitUntil: "domcontentloaded" });
      await pause(page);
      await openMenu(page);
      await page.locator('.side-panel-links a[href="/world#riders"]').click();
      await page.waitForURL("**/world#riders");
      await pause(page);
      await openMenu(page);
      if (nested) {
        await page.locator(".side-panel-announcement-trigger").click();
        await page.waitForFunction(() => document.querySelector("#site-announcement-dialog")?.open);
      }
      await page.goBack();
      await page.waitForURL("**/world#story");
      await pause(page);
      assert.equal(await page.locator(".side-panel").getAttribute("data-open"), "false");
      assert.equal(await page.locator("dialog[open]").count(), 0);
      const lock = await page.evaluate(() => ({
        root: document.documentElement.style.overflow,
        body: document.body.style.overflow,
        flag: document.documentElement.dataset.sideMenuOpen,
      }));
      assert.deepEqual(lock, { root: "", body: "", flag: undefined });
      results.push({
        viewport: viewport.name,
        check: nested
          ? "hash Back dismisses nested notice and menu"
          : "hash Back releases menu and scroll",
      });
    }

    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    // Reload: removing only a hash is a same-document goto and can retain
    // the previous history entry's delayed scroll restoration in this test.
    await page.reload({ waitUntil: "domcontentloaded" });
    await pause(page, 2000);
    const rail = page.locator(".manager-archive-tabs"),
      tabs = rail.locator('button[role="tab"]');
    await rail.scrollIntoViewIfNeeded();
    await tabs.nth(0).click({ trial: true });
    await pause(page, 400);
    const first = await tabs.nth(0).boundingBox(),
      second = await tabs.nth(1).boundingBox();
    assert.ok(first && second);
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('.manager-archive-tabs > button[role="tab"]')[1]
          ?.getAttribute("aria-selected") === "true",
    );
    await tabs.nth(2).focus();
    await page.keyboard.press("Space");
    await pause(page, 200);
    assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
    results.push({
      viewport: viewport.name,
      check: "drag followed by the first Space selects the next tab",
    });

    const slider = page.locator(".world-column-slide-open");
    await slider.scrollIntoViewIfNeeded();
    await slider.click({ trial: true });
    await pause(page, 400);
    const thumb = await slider.locator(".ios-slide-open-thumb").boundingBox();
    assert.ok(thumb);
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2 + 120, thumb.y + thumb.height / 2, {
      steps: 4,
    });
    assert.equal(await slider.getAttribute("data-dragging"), "true");
    await page.setViewportSize(
      viewport.name === "desktop" ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    );
    await pause(page, 200);
    assert.equal(await slider.getAttribute("data-dragging"), "false");
    assert.equal(
      await slider.evaluate((element) => element.style.getPropertyValue("--slide-offset")),
      "0px",
    );
    await page.mouse.up();
    await pause(page, 500);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    results.push({
      viewport: viewport.name,
      check: "viewport width change cancels the slider and its stale release",
    });

    await page.setViewportSize(viewport);
    await page.goto(new URL("/riders/saga#dossier-profile", base).href, {
      waitUntil: "domcontentloaded",
    });
    await pause(page);
    await page.locator('a[href="#form-records"]').first().click();
    await page.waitForURL("**/riders/saga#form-records");
    await pause(page);
    await page.locator(".is-rexonance-pickup .ios-slide-open").click();
    await page.locator(".rexonance-gate").waitFor();
    await page.goBack();
    await page.waitForURL("**/riders/saga#dossier-profile");
    await pause(page, 2000);
    assert.equal(await page.locator(".rexonance-gate, dialog[open]").count(), 0);
    assert.equal(await page.locator(".is-rexonance-pickup").getAttribute("aria-busy"), "false");
    results.push({
      viewport: viewport.name,
      check: "hash Back cancels the form cover without opening its old dialog",
    });

    await page.goto(new URL("/characters/dante", base).href, { waitUntil: "domcontentloaded" });
    await pause(page);
    await page.locator(".manager-back").focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/world*");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-route-focus") === "true",
    );
    for (let index = 0; index < 12; index++) await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({
      className: document.activeElement?.className,
      top: document.activeElement?.getBoundingClientRect().top,
      bottom: document.activeElement?.getBoundingClientRect().bottom,
    }));
    assert.ok(
      focused.top >= 0 && focused.bottom <= viewport.height,
      `focus must first be visible: ${JSON.stringify(focused)}`,
    );
    await pause(page, 1200);
    const settledFocus = await page.evaluate(() => ({
      className: document.activeElement?.className,
      top: document.activeElement?.getBoundingClientRect().top,
      bottom: document.activeElement?.getBoundingClientRect().bottom,
    }));
    assert.equal(settledFocus.className, focused.className);
    assert.ok(
      settledFocus.top >= 0 && settledFocus.bottom <= viewport.height,
      `late route alignment hid focus: ${JSON.stringify(settledFocus)}`,
    );
    results.push({
      viewport: viewport.name,
      check: "Tab after a route return keeps the focused control visible",
      top: settledFocus.top,
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
