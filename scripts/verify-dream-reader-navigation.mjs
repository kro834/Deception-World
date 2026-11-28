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

async function checkCaseFiveNoteReturn(page) {
  const note = "#dream-case-note-5";
  const chronicle = "#dream-chronicle-case-5";
  const opener = `${note} a[href="${chronicle}"]`;
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("about:blank");
  await page.goto(`${base}/dream-chapter${note}`, { waitUntil: "domcontentloaded" });
  await page
    .locator('.dream-reader-index a[href="#dream-case-5"][aria-current]')
    .waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
  const link = page.locator(opener);
  const departureTop = await link.evaluate((element) => {
    element.scrollIntoView({ block: "center", behavior: "instant" });
    element.focus({ preventScroll: true });
    return element.getBoundingClientRect().top;
  });
  await page.keyboard.press("Enter");
  const summary = `${chronicle} > summary`;
  await page.waitForFunction((selector) => document.activeElement?.matches(selector), summary);
  await page.locator(`${chronicle} .dream-chronicle-item:last-child h3`).scrollIntoViewIfNeeded();
  await page.goBack();
  await page.waitForURL(`**${note}`);
  await page.waitForFunction((selector) => document.activeElement?.matches(selector), opener);
  const restoredTop = await link.evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(Math.abs(restoredTop - departureTop) < 44, "Back preserves the note link's position");
  await page.keyboard.press(linkTab);
  assert.equal(await page.locator(".dream-chronicle-latest:focus").count(), 1);
  await page.goForward();
  await page.waitForURL(`**${chronicle}`);
  await page.waitForFunction((selector) => document.activeElement?.matches(selector), summary);
  await landed(page, chronicle.slice(1));
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
    await page.waitForFunction(() =>
      document.activeElement?.matches('#dream-case-note-3 a[href="#dream-chronicle-case-3"]'),
    );
    await current(page, "3");
    await page.goForward();
    await page.waitForURL("**#dream-chronicle-case-3");
    await page.waitForFunction(() =>
      document.activeElement?.matches("#dream-chronicle-case-3 > summary"),
    );
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
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-reader.png` });
    const latest = page.locator(".dream-chronicle-latest");
    const eventHash = await latest.getAttribute("href");
    assert.match(eventHash, /^#dream-chronicle-event-\d+$/);
    const eventItem = page.locator(eventHash);
    const caseHash = await eventItem.locator(".dream-chronicle-case-link").getAttribute("href");
    const closed = page.locator(caseHash);
    assert.equal(await closed.getAttribute("open"), null);
    await latest.press("Enter");
    const checkEvent = async () => {
      await page.waitForFunction(
        (hash) =>
          location.hash === hash &&
          document.activeElement?.id === hash.slice(1) &&
          document.activeElement.closest("details")?.open,
        eventHash,
      );
      await landed(page, eventHash.slice(1));
    };
    await checkEvent();
    await eventItem.locator(".dream-chronicle-case-link").press("Enter");
    await landed(page, caseHash.slice(1));
    const summary = closed.locator(":scope > summary");
    await page.waitForFunction(
      (hash) => document.activeElement === document.querySelector(hash + " > summary"),
      caseHash,
    );
    await summary.press("Space");
    assert.equal(await closed.getAttribute("open"), null);
    await page.goBack();
    await checkEvent();
    await page.goForward();
    await landed(page, caseHash.slice(1));
    await page.waitForFunction(
      (hash) => document.activeElement === document.querySelector(hash + " > summary"),
      caseHash,
    );
    // A fresh document starts with the last case closed before resolving this fragment.
    await page.goto("about:blank");
    await page.goto(`${base}/dream-chapter${eventHash}`, { waitUntil: "domcontentloaded" });
    await checkEvent();
    await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-chronicle.png` });
    await page.locator(".dream-chronicle-search-link").press("Enter");
    await page.waitForURL("**#dream-record-explorer");
    const query = await eventItem.locator("h3").innerText();
    const search = page.locator("#dream-record-query");
    await search.fill(query);
    const caseFilter = page.locator(".dream-record-filters select").first();
    const caseNo = caseHash.split("-").at(-1);
    await caseFilter.selectOption(caseNo);
    const result = page.locator(`.dream-record-title-link[href="${eventHash}"]`);
    await result.press("Enter");
    await checkEvent();
    await page.goBack();
    await page.waitForURL("**#dream-record-explorer");
    await page.waitForFunction(
      (hash) => document.activeElement?.matches(`.dream-record-title-link[href="${hash}"]`),
      eventHash,
    );
    assert.equal(await search.inputValue(), query);
    assert.equal(await caseFilter.inputValue(), caseNo);
    if (viewport.width === 320) await checkCaseFiveNoteReturn(page);
    assert.deepEqual(errors, []);
    console.log(
      `${viewport.width}×${viewport.height}: chapter links, keyboard, related records and history passed`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
