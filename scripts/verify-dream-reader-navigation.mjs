import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8084";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
// macOS WebKit's native link traversal uses Option+Tab when plain Tab skips links.
const linkTab = engine === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
const output = process.env.AUDIT_OUT || `/tmp/dream-reader-navigation-${engine}`;
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const isolateExternals = process.env.PW_OFFLINE_EXTERNALS === "1";
await mkdir(output, { recursive: true });

async function isolateExternalRequests(context) {
  if (!isolateExternals) return;
  await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
  await context.route(/^https:\/\/grok\.com\/grok-app-builder\/extensions\.js(?:\?.*)?$/, (route) =>
    route.abort(),
  );
  console.log(
    "PW_OFFLINE_EXTERNALS=1: Google Fonts and the exact Grok editor extension are blocked",
  );
}

async function landed(page, id) {
  await page.waitForFunction((targetId) => {
    const target = document.getElementById(targetId);
    const nav = document.querySelector(".dream-chapter-nav");
    if (!target || !nav) return false;
    const rect = target.getBoundingClientRect();
    return rect.top >= nav.getBoundingClientRect().bottom && rect.top < innerHeight - 44;
  }, id);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
}

async function current(page, no) {
  const selected = page.locator(".dream-reader-index a[aria-current]");
  assert.equal(await selected.count(), 1);
  assert.equal(await selected.getAttribute("href"), `#dream-case-${no}`);
}

try {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
    { width: 667, height: 375 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: true });
    await isolateExternalRequests(context);
    const page = await context.newPage();
    if (process.env.NAV_CPU_RATE && engine === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.NAV_CPU_RATE) });
    }
    if (process.env.DEBUG_NAV) {
      await page.addInitScript(() => {
        window.__navTrace = [];
        for (const type of [
          "keydown",
          "keyup",
          "click",
          "focusin",
          "hashchange",
          "popstate",
          "toggle",
        ]) {
          window.addEventListener(
            type,
            (event) =>
              window.__navTrace.push({
                type,
                key: event.key,
                target:
                  event.target?.id || event.target?.getAttribute?.("href") || event.target?.tagName,
                focus:
                  document.activeElement?.id ||
                  document.activeElement?.getAttribute?.("href") ||
                  document.activeElement?.tagName,
                hash: location.hash,
                open: document.getElementById("dream-chronicle-case-3")?.open,
              }),
            true,
          );
        }
      });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/dream-chapter#dream-case-2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("dream-case-2")?.open);
    await current(page, "2");
    await landed(page, "dream-case-2");
    assert.equal(await page.locator(".dream-reader-index > ol > li > a").count(), 6);

    await page
      .locator('#dream-case-2 .dream-reader-pagination a[href="#dream-case-3"]')
      .press("Enter");
    await page.waitForFunction(
      () => document.activeElement?.closest("details")?.id === "dream-case-3",
    );
    await landed(page, "dream-case-3");
    await current(page, "3");
    assert.equal(await page.locator("#dream-case-2").getAttribute("open"), "");
    assert.equal(await page.locator("#dream-case-3").getAttribute("open"), "");
    await page.keyboard.press(linkTab);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.matches("#dream-case-3 .dream-chapter-companion > summary"),
      ),
      true,
      "the new folded chapter companion is the first keyboard stop",
    );
    await page.keyboard.press(linkTab);
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("href")),
      "#dream-case-note-3",
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "dream-case-note-3");
    await landed(page, "dream-case-note-3");
    await current(page, "3");

    await page.locator('#dream-case-note-3 a[href="#dream-chronicle-case-3"]').press("Enter");
    try {
      await page.waitForFunction(() => document.getElementById("dream-chronicle-case-3")?.open);
    } catch (error) {
      if (process.env.DEBUG_NAV)
        console.log(JSON.stringify(await page.evaluate(() => window.__navTrace)));
      throw error;
    }
    await landed(page, "dream-chronicle-case-3");
    await current(page, "3");
    await page.goBack();
    await page.waitForURL("**#dream-case-note-3");
    await current(page, "3");
    await page.goForward();
    await page.waitForURL("**#dream-chronicle-case-3");
    await current(page, "3");

    await page.locator('#dream-chronicle-case-3 a[href="#dream-case-3"]').press("Enter");
    await page.waitForFunction(
      () => document.activeElement?.closest("details")?.id === "dream-case-3",
    );
    await landed(page, "dream-case-3");
    await page.keyboard.press("Space");
    await page.waitForFunction(() => !document.getElementById("dream-case-3")?.open);
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明） — the index shows a
    // closed fold by its unlit numeral (data-open), not by the word あらすじ.
    await page.waitForFunction(
      () =>
        document.querySelector('.dream-reader-index a[href="#dream-case-3"]')?.dataset.open ===
        "false",
    );
    await current(page, "3");
    assert.equal(
      await page.locator('.dream-reader-index a[href="#dream-case-3"]').getAttribute("data-open"),
      "false",
    );
    assert.equal(await page.locator("#dream-case-2").getAttribute("open"), "");

    await page.locator('.dream-reader-index a[href="#dream-case-3"]').press("Enter");
    await page.waitForFunction(() => document.getElementById("dream-case-3")?.open);
    await landed(page, "dream-case-3");
    // The keyboard link completes its scheduled focus before the next link is pressed.
    await page.waitForFunction(
      () => document.activeElement === document.querySelector("#dream-case-3 > summary"),
    );
    assert.equal(await page.locator("#dream-case-3 .dream-reader-preview").isVisible(), false);
    await page.locator("#dream-case-3 .dream-reader-return").press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "dream-chapter-index");
    await landed(page, "dream-chapter-index");
    assert.equal(await page.locator(".dream-reader-index a[aria-current]").count(), 0);
    await page.keyboard.press(linkTab);
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("href")),
      "#dream-case-0",
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-reader.png` });
    console.log(
      `${viewport.width}×${viewport.height}: chapter links, keyboard, related records and history passed`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
