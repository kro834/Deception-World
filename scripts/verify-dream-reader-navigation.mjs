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
await mkdir(output, { recursive: true });

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
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/dream-chapter#dream-case-2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("dream-case-2")?.open);
    await current(page, "2");
    await landed(page, "dream-case-2");
    assert.equal(await page.locator(".dream-reader-index a").count(), 6);

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
      await page.evaluate(() => document.activeElement?.getAttribute("href")),
      "#dream-case-note-3",
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "dream-case-note-3");
    await landed(page, "dream-case-note-3");
    await current(page, "3");

    await page.locator('#dream-case-note-3 a[href="#dream-chronicle-case-3"]').press("Enter");
    await page.waitForFunction(() => document.getElementById("dream-chronicle-case-3")?.open);
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
    await page.waitForFunction(
      () =>
        document.querySelector('.dream-reader-index a[href="#dream-case-3"] small')?.textContent ===
        "あらすじ",
    );
    await current(page, "3");
    assert.equal(
      await page.locator('.dream-reader-index a[href="#dream-case-3"] small').innerText(),
      "あらすじ",
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
