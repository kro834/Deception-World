// BASE_URL=http://127.0.0.1:8598 BROWSER=chrome|webkit node scripts/verify-dream-experience.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8598");
const kind = process.env.BROWSER || "chrome";
assert.ok(["chrome", "webkit"].includes(kind));
const forcedColors = process.env.FORCED_COLORS === "1";
const browser = await (kind === "webkit" ? webkit : chromium).launch(
  kind === "webkit" ? {} : { channel: "chrome" },
);
const output = resolve("output/playwright/dream-experience", forcedColors ? `${kind}-forced` : kind);
const collectionKey = "deception-world:dream-record-collection:v1";
const readerKey = "deception-world:dream-reader:v1";
const requested = process.env.PW_VIEWPORTS?.split(",").map(Number);
const features = process.env.PW_FEATURES?.split(",") || ["cabinet", "collection", "storage"];
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1194, height: 834 },
  { width: 1440, height: 900 },
].filter((view) => !requested || requested.includes(view.width));
assert.ok(viewports.length > 0, "PW_VIEWPORTS must select at least one width");
const report = { base, browser: kind, forcedColors, version: browser.version(), checks: [] };
const pageErrors = [];
let currentPage;
await mkdir(output, { recursive: true });

async function ready(page) {
  currentPage = page;
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "commit" });
  await page.waitForFunction(() => {
    const save = document.querySelector(".dream-record-save");
    return save && !save.disabled && !document.documentElement.hasAttribute("data-loading");
  });
  await page.addStyleTag({ content: "html,body { scroll-behavior:auto !important }" });
  await page.evaluate(async () => {
    let timer;
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => { timer = setTimeout(resolve, 2500); }),
    ]);
    clearTimeout(timer);
  });
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${label}: overflow ${overflow}px`);
}

async function countSaved(page, count) {
  await page.waitForFunction((n) =>
    document.querySelector(".dream-record-collection-heading > span")?.textContent === `${n}件`, count);
}

async function visibleFocus(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    const rect = node?.getBoundingClientRect();
    const nav = document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom || 0;
    return Boolean(rect && rect.bottom > nav && rect.top < innerHeight && rect.left >= 0 && rect.right <= innerWidth);
  });
}

try {
  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 1200,
      forcedColors: forcedColors ? "active" : "none",
    });
    await context.addInitScript(({ key }) => {
      if (!sessionStorage.getItem("dream-experience-seeded")) {
        localStorage.setItem(key, JSON.stringify({ version: 1, bookmark: { caseNo: "5", paragraph: 2 } }));
        sessionStorage.setItem("dream-experience-seeded", "1");
      }
    }, { key: readerKey });
    const page = await context.newPage();
    await ready(page);
    if (features.includes("cabinet")) {
      const cabinet = page.locator(".dream-karakuri-cabinet");
      const resume = cabinet.locator(".dream-karakuri-resume-link");
      await cabinet.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector(".dream-karakuri-resume")?.dataset.hasBookmark === "true");
      assert.equal(await resume.getAttribute("href"), "#dream-case-5-paragraph-2");
      assert.equal(await cabinet.locator('[role="tab"][aria-selected="true"]').getAttribute("data-karakuri-tab"), "0");
      const before = await page.evaluate((key) => localStorage.getItem(key), readerKey);
      await cabinet.locator('[data-karakuri-tab="0"]').focus();
      await page.keyboard.press("End");
      assert.equal(await cabinet.locator('[role="tab"][aria-selected="true"]').getAttribute("data-karakuri-tab"), "5");
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), readerKey), before, "chapter preview must not write the bookmark");
      await noOverflow(page, label);
      await page.waitForFunction(() => [...document.querySelectorAll(".dream-karakuri-shoji")].every((node) =>
        node.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running")));
      await cabinet.screenshot({ path: `${output}/${label}-cabinet.png` });
      await resume.click();
      await page.waitForFunction(() => {
        const node = document.getElementById("dream-case-5-paragraph-2");
        const rect = node?.getBoundingClientRect();
        const nav = document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom || 0;
        return location.hash === "#dream-case-5-paragraph-2" && node.closest("details").open && rect.top >= nav - 2 && rect.top < innerHeight;
      });
      // Emulate an existing reader's same-tab save, not a cabinet write.
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, bookmark: { caseNo: "3", paragraph: 2 } }));
        window.dispatchEvent(new Event("dream-reader-state-change"));
      }, readerKey);
      await cabinet.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector(".dream-karakuri-resume-link")?.getAttribute("href") === "#dream-case-3-paragraph-2");
      report.checks.push(`${label}: independent chapter selection, read-only resume and native paragraph arrival`);
    }
    if (features.includes("collection")) {
      const explorer = page.locator(".dream-record-explorer");
      const views = explorer.locator(".dream-record-collection-views button");
      await explorer.locator(".dream-record-save").nth(0).click();
      await explorer.locator(".dream-record-save").nth(1).click();
      await countSaved(page, 2);
      await views.nth(1).click();
      assert.equal(await explorer.locator(".dream-record-card").count(), 2);
      await page.reload({ waitUntil: "commit" });
      await page.waitForFunction(() => !document.querySelector(".dream-record-save")?.disabled);
      await countSaved(page, 2);
      await views.nth(1).click();
      await explorer.locator(".dream-record-save").first().click();
      await countSaved(page, 1);
      assert.equal(await page.evaluate(() => document.activeElement?.className), "dream-record-save");
      await explorer.locator(".dream-record-save").click();
      await countSaved(page, 0);
      assert.ok(await visibleFocus(page), "last removal keeps keyboard focus in the viewport");
      assert.match(await explorer.locator(".dream-record-empty").innerText(), /手控えにはまだ記録がありません/);
      await explorer.getByRole("button", { name: "すべての記録へ戻る", exact: true }).click();
      const first = DREAM_CHRONICLE[0];
      await explorer.locator(".dream-record-clues summary").first().click();
      await explorer.locator(".dream-record-clues").first().getByRole("button", { name: `人物：${first.cast[0]}`, exact: true }).click();
      const expected = DREAM_CHRONICLE.filter((record) => record.cast.includes(first.cast[0])).length;
      await page.waitForFunction((n) => document.querySelector(".dream-record-count")?.textContent.startsWith(`${n}件の記録`), expected);
      assert.equal(await page.evaluate(() => document.activeElement?.className), "dream-record-count");
      assert.ok(await visibleFocus(page));
      assert.ok(await explorer.locator(".dream-record-card").count() <= 8);
      await noOverflow(page, label);
      await explorer.locator(".dream-record-card").first().screenshot({ path: `${output}/${label}-record.png` });
      await explorer.locator(".dream-record-collection").screenshot({ path: `${output}/${label}-collection.png` });
      report.checks.push(`${label}: multiple saves, reload, removal focus, empty state, related-person search and bounded cards`);
    }
    await context.close();
    console.log(`PASS ${kind} ${label}`);
  }
  if (features.includes("storage")) {
    for (const mode of ["corrupt", "denied"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await context.addInitScript(({ mode, collectionKey, readerKey }) => {
        if (mode === "corrupt") {
          localStorage.setItem(collectionKey, "{bad");
          localStorage.setItem(readerKey, "{bad");
        } else {
          const read = Storage.prototype.getItem;
          const write = Storage.prototype.setItem;
          Storage.prototype.getItem = function (key) {
            if ([collectionKey, readerKey].includes(key)) throw new DOMException("Denied", "SecurityError");
            return read.call(this, key);
          };
          Storage.prototype.setItem = function (key, value) {
            if ([collectionKey, readerKey].includes(key)) throw new DOMException("Denied", "SecurityError");
            return write.call(this, key, value);
          };
        }
      }, { mode, collectionKey, readerKey });
      const page = await context.newPage();
      await ready(page);
      assert.equal(await page.locator(".dream-karakuri-resume-link").getAttribute("href"), "#dream-case-0");
      await page.locator(".dream-record-save").first().click();
      await countSaved(page, 1);
      if (mode === "denied") assert.ok(await page.locator(".dream-record-collection-warning").isVisible());
      await context.close();
      report.checks.push(`390px: ${mode} storage retains usable chapter entry and collection`);
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await context.newPage();
    const b = await context.newPage();
    await ready(a);
    await ready(b);
    await a.locator(".dream-record-save").nth(0).click();
    await b.locator(".dream-record-save").nth(1).click();
    await countSaved(a, 2);
    await countSaved(b, 2);
    const ids = await b.evaluate((key) => JSON.parse(localStorage.getItem(key)).ids, collectionKey);
    assert.deepEqual([...ids].sort((a, b) => a - b), DREAM_CHRONICLE.slice(0, 2).map((record) => record.no).sort((a, b) => a - b));
    await context.close();
    report.checks.push("two tabs preserve both saves and synchronize their visible state");
  }
  assert.deepEqual(pageErrors, [], "no runtime errors");
  console.log(`PASS ${kind}: ${report.checks.length} Dream experience flows`);
} catch (error) {
  report.error = error.stack;
  await currentPage?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
