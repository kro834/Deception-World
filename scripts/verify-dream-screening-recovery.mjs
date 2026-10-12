import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8574");
const output = "/private/tmp/dream-screening-recovery";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const report = [];

const stem = (index) => `dream-chapter-poster-${String(index + 1).padStart(2, "0")}-delivery.webp`;
const picture = (page) => page.locator(".dream-screening-picture img");
const shown = async (page) => picture(page).getAttribute("src");
const dialog = (page) => page.locator(".dream-screening-dialog[open]");

async function waitHydrated(page, requirePosterImage = true) {
  await page.waitForFunction(() => {
    const trigger = document.querySelector(".dream-screening-trigger");
    return document.documentElement.dataset.dreamChapter === "true" &&
      trigger && Object.keys(trigger).some((key) => key.startsWith("__reactProps"));
  });
  await page.locator(".dream-screening-trigger").evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  if (requirePosterImage) {
    await page.waitForFunction(() => {
      const img = document.querySelector(".dream-poster-current img");
      return img?.complete && img.naturalWidth > 0;
    });
  }
}

async function open(page) {
  await page.locator(".dream-screening-trigger").click();
  await dialog(page).waitFor({ state: "visible" });
  await picture(page).waitFor({ state: "visible" });
  assert.equal(await picture(page).evaluate((img) => img.complete && img.naturalWidth > 0), true);
}

async function freshPage(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await waitHydrated(page);
  return { page, context, errors, name };
}

async function closePage(test) {
  assert.deepEqual(test.errors, [], `${test.name}: page errors`);
  await test.context.close();
}

try {
  // The route may mention the chunk in a manifest, but it must not request it
  // before the user expressly opens the room.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const chunks = [];
    page.on("request", (request) => {
      if (/dream-screening-room-[^/]+\.js(?:\?|$)/.test(request.url())) chunks.push(request.url());
    });
    await page.goto(new URL("/", base).href, { waitUntil: "networkidle" });
    assert.deepEqual(chunks, [], "home page must not request the screening chunk");
    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    await waitHydrated(page);
    assert.deepEqual(chunks, [], "Dream page must not request the screening chunk before click");
    await open(page);
    assert.ok(chunks.length > 0, "explicit open must request the screening chunk");
    report.push({ scenario: "conditional-chunk", passed: true, requests: chunks.length });
    await page.screenshot({ path: `${output}/01-open.png` });
    await context.close();
  }

  // The initial picture must be decoded before display and recover after an
  // image request failure. Install the route before navigation to disable cache.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    let shouldFail = true;
    let failures = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`**/${stem(0)}`, async (route) => {
      if (shouldFail) {
        failures += 1;
        await route.abort();
      } else await route.continue();
    });
    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    await waitHydrated(page, false);
    await page.locator(".dream-screening-trigger").click();
    await dialog(page).waitFor({ state: "visible" });
    await page.locator(".dream-screening-retry").waitFor({ state: "visible", timeout: 12000 });
    assert.ok(failures > 0, "initial image request was actually aborted");
    assert.equal(await picture(page).count(), 0, "failed initial picture must show no broken image");
    await page.screenshot({ path: `${output}/02-initial-error.png` });
    shouldFail = false;
    await page.locator(".dream-screening-retry").click();
    await picture(page).waitFor({ state: "visible" });
    assert.equal(await picture(page).evaluate((img) => img.complete && img.naturalWidth > 0), true);
    assert.match(await shown(page), /dream-chapter-poster-01-delivery\.webp$/);
    report.push({ scenario: "initial-error-retry", passed: true });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // A failed next image must leave the decoded old picture on screen, and its
  // retry must then commit the new picture.
  {
    const test = await freshPage("next-error-retry");
    const { page } = test;
    await open(page);
    let failed = false;
    await page.route(`**/${stem(2)}`, async (route) => {
      if (!failed) {
        failed = true;
        await route.abort();
      } else await route.continue();
    });
    await page.locator('[data-poster-index="2"]').click();
    await page.locator(".dream-screening-retry").waitFor({ state: "visible", timeout: 12000 });
    assert.equal(failed, true);
    assert.match(await shown(page), /dream-chapter-poster-01-delivery\.webp$/);
    await page.screenshot({ path: `${output}/03-next-error.png` });
    await page.locator(".dream-screening-retry").click();
    await page.waitForFunction(() =>
      document.querySelector(".dream-screening-picture img")?.getAttribute("src")?.endsWith("dream-chapter-poster-03-delivery.webp"),
    );
    assert.equal(await picture(page).evaluate((img) => img.complete && img.naturalWidth > 0), true);
    report.push({ scenario: "next-error-retry", passed: true });
    await closePage(test);
  }

  // Hold poster 03 while reselecting the displayed poster 01. Resolving the
  // stale request must never commit poster 03.
  {
    const test = await freshPage("latest-choice-wins");
    const { page } = test;
    await open(page);
    let release;
    let intercepted;
    const caught = new Promise((resolve) => { intercepted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(`**/${stem(2)}`, async (route) => {
      intercepted();
      await gate;
      await route.continue().catch(() => undefined);
    });
    await page.locator('[data-poster-index="2"]').click();
    await caught;
    await page.locator('[data-poster-index="0"]').click();
    await page.waitForFunction(() => !document.querySelector(".dream-screening-status")?.textContent?.includes("読み込み中"));
    release();
    await page.waitForTimeout(500);
    assert.match(await shown(page), /dream-chapter-poster-01-delivery\.webp$/);
    assert.equal(await page.locator(".dream-screening-count").innerText(), "01 / 15");
    await page.screenshot({ path: `${output}/04-latest-wins.png` });
    report.push({ scenario: "latest-choice-wins", passed: true });
    await closePage(test);
  }

  // A late decode after closing must not reopen the dialog or retain the body
  // lock. The pending request is released after the close and unmount.
  {
    const test = await freshPage("close-during-pending");
    const { page } = test;
    await open(page);
    let release;
    let intercepted;
    const caught = new Promise((resolve) => { intercepted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(`**/${stem(2)}`, async (route) => {
      intercepted();
      await gate;
      await route.continue().catch(() => undefined);
    });
    await page.locator('[data-poster-index="2"]').click();
    await caught;
    await page.locator(".dream-screening-close").click();
    await page.waitForFunction(() => !document.querySelector(".dream-screening-dialog"));
    release();
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      dialog: Boolean(document.querySelector(".dream-screening-dialog")),
      flag: document.documentElement.dataset.dreamDialogOpen,
      bodyPosition: document.body.style.position,
      rootOverflow: document.documentElement.style.overflow,
    }));
    assert.equal(state.dialog, false);
    assert.equal(state.flag, undefined);
    assert.notEqual(state.bodyPosition, "fixed");
    assert.notEqual(state.rootOverflow, "hidden");
    await page.screenshot({ path: `${output}/05-after-close.png` });
    report.push({ scenario: "close-during-pending", passed: true });
    await closePage(test);
  }

  await writeFile(`${output}/report.json`, JSON.stringify({ base, report }, null, 2));
  console.log(JSON.stringify({ base, report }, null, 2));
} finally {
  await browser.close();
}
