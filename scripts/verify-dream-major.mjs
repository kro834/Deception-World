// BASE_URL=http://127.0.0.1:8574 BROWSER=chrome|webkit node scripts/verify-dream-major.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import { filterDreamRecords } from "../src/lib/dream-record-index.ts";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8574");
const kind = process.env.BROWSER || "chrome";
assert.ok(["chrome", "chromium", "webkit"].includes(kind), `Unsupported BROWSER=${kind}`);
const engine = kind === "webkit" ? webkit : chromium;
const name = kind === "webkit" ? "webkit" : "chrome";
const output = resolve("output/playwright/dream-major", name);
const storageKey = "deception-world:dream-reader:v1";
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
const requested = process.env.PW_VIEWPORTS?.split(",");
const requestedFeatures = process.env.PW_FEATURES?.split(",");
const report = { base, browser: name, browserVersion: "", checks: [] };
await mkdir(output, { recursive: true });
const browser = await engine.launch(kind === "webkit" ? {} : { channel: "chrome" });
report.browserVersion = browser.version();
let currentPage;

async function settled(page) {
  await page.waitForFunction(
    () => {
      const key = [scrollY, innerHeight, document.documentElement.scrollHeight].join(":");
      const previous = window.__dreamMajorGeometry;
      window.__dreamMajorGeometry = {
        key,
        count: previous?.key === key ? previous.count + 1 : 0,
      };
      return window.__dreamMajorGeometry.count >= 3;
    },
    undefined,
    { polling: 100 },
  );
}

async function ready(page, hash = "") {
  await page.goto(new URL(`/dream-chapter${hash}`, base).href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const button = document.querySelector(".dream-reading-entry button");
    return (
      button &&
      !button.disabled &&
      !document.documentElement.hasAttribute("data-loading") &&
      Object.keys(button).some((key) => key.startsWith("__reactProps"))
    );
  });
  await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
  await settled(page);
}

async function geometry(page, label, room = false) {
  const value = await page.evaluate((inRoom) => {
    const modal = document.querySelector(".dream-reading-room[open]");
    const scroll = document.querySelector(".dream-reading-scroll");
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      roomOverflow: modal ? modal.scrollWidth - modal.clientWidth : 0,
      readerOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
      roomHeight: inRoom ? modal?.getBoundingClientRect().height : 0,
      viewportHeight: innerHeight,
    };
  }, room);
  assert.ok(value.overflow <= 1, `${label}: document overflow ${value.overflow}px`);
  if (room) {
    assert.ok(value.roomOverflow <= 1, `${label}: dialog overflow ${value.roomOverflow}px`);
    assert.ok(value.readerOverflow <= 1, `${label}: prose overflow ${value.readerOverflow}px`);
    assert.ok(
      Math.abs(value.roomHeight - value.viewportHeight) <= 2,
      `${label}: viewport coverage`,
    );
  }
  return value;
}

async function nativeArrival(page, locator, hash, keyboard = false) {
  await locator.scrollIntoViewIfNeeded();
  if (keyboard) await locator.press("Enter");
  else await locator.click();
  await page.waitForFunction((target) => location.hash === target, hash);
  await page.waitForFunction((target) => {
    const node = document.getElementById(target.slice(1));
    if (!node) return false;
    const fold = node.closest("details");
    const rect = node.getBoundingClientRect();
    const top = document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom || 0;
    return (!fold || fold.open) && rect.top >= top - 2 && rect.top < innerHeight - 20;
  }, hash);
  await settled(page);
}

async function countResults(page, expected) {
  await page.waitForFunction((count) => {
    const text = document.querySelector(".dream-record-count")?.textContent || "";
    return Number(/^(\d+)件の記録/.exec(text)?.[1]) === count;
  }, expected);
}

async function programmeAndCompanion(page, label, keyboard) {
  await ready(page);
  assert.equal(await page.locator(".dream-programme-ticket").count(), 3);
  assert.equal(await page.locator(".dream-reader-index > ol > li").count(), DREAM_CASES.length);
  for (const episode of DREAM_CASES) {
    const guide = page.locator(`.dream-reader-index a[href="#dream-case-${episode.no}"]`);
    assert.match(await guide.innerText(), new RegExp(`${episode.paragraphs.length}段落`));
  }
  for (const hash of ["#posters", "#dream-chapter-index", "#dream-record-explorer"]) {
    const ticket = page.locator(`.dream-programme-ticket[href="${hash}"]`);
    assert.equal(await ticket.getAttribute("href"), hash);
    await nativeArrival(page, ticket, hash, keyboard);
    await geometry(page, `${label} ${hash}`);
  }
  await nativeArrival(
    page,
    page.locator('.dream-reader-index a[href="#dream-case-5"]'),
    "#dream-case-5",
    keyboard,
  );
  const companion = page.locator("#dream-case-5 .dream-chapter-companion");
  const events = DREAM_CHRONICLE.filter((event) => event.case === "5");
  assert.equal(await companion.locator("ol > li").count(), events.length);
  await companion.locator("summary").click();
  const eventHash = `#dream-chronicle-event-${events.at(-1).no}`;
  await nativeArrival(page, companion.locator(`a[href="${eventHash}"]`), eventHash, keyboard);
  if (keyboard)
    assert.equal(await page.evaluate(() => document.activeElement?.id), eventHash.slice(1));
  assert.equal(await page.locator("#dream-chronicle-case-5").getAttribute("open"), "");
  await page.screenshot({ path: `${output}/${label}-companion-arrival.png` });
  report.checks.push({
    viewport: label,
    feature: "programme, six chapter guide, companion native arrival",
    ok: true,
  });
}

async function explorer(page, label) {
  await ready(page, "#dream-record-explorer");
  await countResults(page, DREAM_CHRONICLE.length);
  assert.equal(await page.locator(".dream-record-card").count(), 8);
  await page.locator(".dream-record-more").click();
  assert.equal(await page.locator(".dream-record-card").count(), 16);
  const search = page.locator("#dream-record-query");
  const filters = page.locator(".dream-record-filters select");
  const query = "しえる";
  await search.fill(query);
  await countResults(page, filterDreamRecords(DREAM_CHRONICLE, { query }).length);
  assert.ok(
    await page.locator(".dream-record-card mark").count(),
    "normalized kana matches are highlighted",
  );
  assert.ok((await page.locator(".dream-record-card").count()) <= 8, "query resets pagination");
  assert.equal(
    await page.evaluate(() => location.hash),
    "#dream-record-explorer",
    "query does not take over hash",
  );
  const match = filterDreamRecords(DREAM_CHRONICLE, { query })[0];
  await filters.nth(0).selectOption(match.case);
  await filters.nth(1).selectOption(match.cast[0]);
  await filters.nth(2).selectOption(match.place);
  const combined = { query, case: match.case, person: match.cast[0], place: match.place };
  await countResults(page, filterDreamRecords(DREAM_CHRONICLE, combined).length);
  assert.equal(await page.locator(".dream-record-active-filters li").count(), 4);
  await page.locator(".dream-record-active-filters button").filter({ hasText: "人物" }).click();
  assert.equal(await filters.nth(1).inputValue(), "");
  await countResults(page, filterDreamRecords(DREAM_CHRONICLE, { ...combined, person: "" }).length);
  await search.fill("存在しない記録の確認語");
  await countResults(page, 0);
  await page.locator(".dream-record-empty").waitFor({ state: "visible" });
  await page
    .locator(".dream-record-empty")
    .getByRole("button", { name: "キーワードを外す", exact: true })
    .click();
  assert.equal(await search.inputValue(), "");
  assert.equal(await filters.nth(0).inputValue(), match.case);
  await countResults(
    page,
    filterDreamRecords(DREAM_CHRONICLE, { case: match.case, place: match.place }).length,
  );
  await search.fill("存在しない記録の確認語");
  await countResults(page, 0);
  await page
    .locator(".dream-record-empty")
    .getByRole("button", { name: "章・人物・舞台を外す", exact: true })
    .click();
  assert.equal(await search.inputValue(), "存在しない記録の確認語");
  for (let index = 0; index < 3; index += 1)
    assert.equal(await filters.nth(index).inputValue(), "");
  await page
    .locator(".dream-record-empty")
    .getByRole("button", { name: "条件をクリア", exact: true })
    .click();
  await countResults(page, DREAM_CHRONICLE.length);
  assert.equal(await search.inputValue(), "");
  await search.fill("ｼｴﾙ");
  await countResults(page, filterDreamRecords(DREAM_CHRONICLE, { query }).length);
  await page.locator("#dream-record-explorer").evaluate((element) => {
    const navBottom =
      document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom || 0;
    scrollTo({
      top: scrollY + element.getBoundingClientRect().top - navBottom - 16,
      behavior: "instant",
    });
  });
  await settled(page);
  await geometry(page, `${label} explorer`);
  await page.screenshot({ path: `${output}/${label}-explorer.png` });
  report.checks.push({
    viewport: label,
    feature: "keyword normalization, facets, highlight, pagination, chips, empty recovery",
    ok: true,
  });
}

async function openRoom(page) {
  const trigger = page.locator(".dream-reading-entry button");
  await trigger.scrollIntoViewIfNeeded();
  await settled(page);
  const previous = await page.evaluate(() => ({ url: location.href, scrollY }));
  await trigger.click();
  await page.locator(".dream-reading-room[open]").waitFor({ state: "visible" });
  assert.equal(page.url(), previous.url, "opening room creates no history entry");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "読書室を閉じる",
  );
  return previous;
}

async function selectRoomChapter(page, no, small) {
  if (small) await page.locator(".dream-reading-chapter-select select").selectOption(no);
  else await page.locator(".dream-reading-chapters button").nth(Number(no)).click();
  await page.waitForFunction(
    (chapter) => document.querySelector(".dream-reading-chapter-select select")?.value === chapter,
    no,
  );
  await page.waitForFunction(
    (title) => document.querySelector(".dream-reading-paper h3")?.textContent === title,
    DREAM_CASES[Number(no)].title,
  );
}

async function room(page, label, small) {
  await ready(page, "#dream-chapter-index");
  const original = await openRoom(page);
  assert.equal(await page.locator(".dream-reading-chapters button").count(), DREAM_CASES.length);
  assert.equal(
    await page.locator(".dream-reading-chapter-select option").count(),
    DREAM_CASES.length,
  );
  for (const episode of DREAM_CASES) {
    await selectRoomChapter(page, episode.no, small);
    const paragraphs = await page.locator("[data-room-paragraph]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const clone = node.cloneNode(true);
        clone.querySelector(".dream-reading-paragraph-number")?.remove();
        return clone.textContent;
      }),
    );
    assert.deepEqual(
      paragraphs,
      [...episode.paragraphs],
      `CASE ${episode.no} retains canonical text`,
    );
  }
  assert.equal(
    await page
      .locator(".dream-reading-paper footer")
      .getByRole("button", { name: "次の章 →", exact: true })
      .isDisabled(),
    true,
  );
  await page.locator(".dream-reading-paper footer").scrollIntoViewIfNeeded();
  assert.match(
    await page.locator(".dream-reading-paper footer").innerText(),
    /公開されているあらすじはここまで/,
  );
  await page.locator(".dream-reading-options summary").click();
  await page.getByRole("button", { name: "夜色", exact: true }).click();
  await page.getByRole("button", { name: "文字を大きく", exact: true }).click();
  await page.getByRole("button", { name: "行間を広く", exact: true }).click();
  const modal = page.locator(".dream-reading-room");
  assert.equal(await modal.getAttribute("data-paper"), "true");
  assert.equal(await modal.getAttribute("data-size"), "large");
  assert.equal(await modal.getAttribute("data-spacing"), "comfortable");
  await geometry(page, `${label} reading room paper`, true);
  await page.screenshot({ path: `${output}/${label}-reading-paper.png` });
  await page.getByRole("button", { name: "紙色", exact: true }).click();
  await page.locator(".dream-reading-options summary").click();
  await page.locator(".dream-reading-scroll").evaluate((scroll) => {
    const target = scroll.querySelector('[data-room-paragraph="4"]');
    scroll.scrollTop +=
      target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
  });
  await page.waitForFunction(
    () => document.querySelector(".dream-reading-bottom progress")?.value === 4,
  );
  await page.getByRole("button", { name: "しおりを保存", exact: true }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.deepEqual(saved.bookmark, { caseNo: "5", paragraph: 4 });
  assert.equal(saved.size, "large");
  assert.equal(saved.spacing, "comfortable");
  await page
    .locator('.dream-reader-bookmark a[href="#dream-case-5-paragraph-4"]')
    .waitFor({ state: "attached" });
  await geometry(page, `${label} reading room night`, true);
  await page.screenshot({ path: `${output}/${label}-reading-night.png` });
  await page.keyboard.press("Escape");
  await page.locator(".dream-reading-room").waitFor({ state: "detached" });
  await settled(page);
  const closed = await page.evaluate(() => ({
    scrollY,
    locked: document.documentElement.hasAttribute("data-dream-dialog-open"),
    focus: document.activeElement?.closest(".dream-reading-entry") != null,
  }));
  assert.ok(
    Math.abs(closed.scrollY - original.scrollY) <= 3,
    `${label}: Escape restores page scroll (${closed.scrollY}/${original.scrollY})`,
  );
  assert.equal(closed.locked, false);
  assert.equal(closed.focus, true);
  await nativeArrival(
    page,
    page.locator('.dream-reader-bookmark a[href="#dream-case-5-paragraph-4"]'),
    "#dream-case-5-paragraph-4",
    true,
  );
  await openRoom(page);
  await page.waitForFunction(
    () => document.querySelector(".dream-reading-bottom progress")?.value === 4,
  );
  assert.equal(await page.locator(".dream-reading-chapter-select select").inputValue(), "5");
  assert.equal(await modal.getAttribute("data-size"), "large");
  assert.equal(await modal.getAttribute("data-spacing"), "comfortable");
  await page.keyboard.press("Escape");
  await page.locator(".dream-reading-room").waitFor({ state: "detached" });

  // A native chapter link supplies a real prior history entry. Back dismisses
  // the modal and then restores that previous page position.
  await ready(page, "#dream-chapter-index");
  const chapterLink = page.locator('.dream-reader-index a[href="#dream-case-1"]');
  await chapterLink.scrollIntoViewIfNeeded();
  await settled(page);
  const beforeCaseY = await page.evaluate(() => scrollY);
  await nativeArrival(page, chapterLink, "#dream-case-1", true);
  await openRoom(page);
  await page.goBack();
  await page.waitForFunction(() => location.hash === "#dream-chapter-index");
  await page.locator(".dream-reading-room").waitFor({ state: "detached" });
  await settled(page);
  const afterBack = await page.evaluate(() => ({
    scrollY,
    locked: document.documentElement.hasAttribute("data-dream-dialog-open"),
    bodyPosition: getComputedStyle(document.body).position,
  }));
  assert.equal(afterBack.locked, false);
  assert.notEqual(afterBack.bodyPosition, "fixed");
  assert.ok(
    Math.abs(afterBack.scrollY - beforeCaseY) <= 8,
    `${label}: Back restores prior page scroll (${afterBack.scrollY}/${beforeCaseY})`,
  );
  await geometry(page, `${label} after reading room`);
  report.checks.push({
    viewport: label,
    feature:
      "reading room canonical chapters, themes, comfort, shared bookmark, resume, Escape, Back scroll",
    ok: true,
  });
}

try {
  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`;
    if (requested && !requested.includes(label)) continue;
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 760,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(20000);
    const errors = [];
    report.browserErrors = errors;
    page.on("pageerror", (error) => errors.push(error.message));
    if (!requestedFeatures || requestedFeatures.includes("programme"))
      await programmeAndCompanion(page, label, viewport.width === 1440);
    if (!requestedFeatures || requestedFeatures.includes("explorer")) await explorer(page, label);
    if (!requestedFeatures || requestedFeatures.includes("room"))
      await room(page, label, viewport.width < 760);
    assert.deepEqual(errors, [], `${label}: no uncaught browser errors`);
    await context.close();
    currentPage = null;
    console.log(`${name} ${label}: passed`);
  }
} catch (error) {
  report.error = error.stack || String(error);
  if (currentPage) {
    await currentPage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    report.failureState = await currentPage
      .evaluate(() => ({
        url: location.href,
        scrollY,
        targetRect: (() => {
          const node = document.getElementById(location.hash.slice(1));
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            margin: getComputedStyle(node).scrollMarginTop,
          };
        })(),
        navBottom: document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom,
        roomFooter: (() => {
          const node = document.querySelector(".dream-reading-paper footer > p");
          if (!node) return null;
          const style = getComputedStyle(node);
          return {
            html: node.outerHTML,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            rect: node.getBoundingClientRect().toJSON(),
          };
        })(),
        activeElement: document.activeElement?.outerHTML.slice(0, 700),
        dialog: document.querySelector(".dream-reading-room")?.outerHTML.slice(0, 500),
      }))
      .catch(() => null);
  }
  throw error;
} finally {
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
