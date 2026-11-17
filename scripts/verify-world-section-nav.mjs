import assert from "node:assert/strict";
import { chromium } from "playwright";

// The World topbar's section marker (aria-current="location" on STORY /
// RIDERS / RECORDS, world-home.tsx WorldSectionNav). An anchor jump lands a
// section at its scroll-margin-top, which follows the measured header height,
// and the marker must name that section on every viewport, landscape phones
// included (their toolbar-less height is 340-430px). A small height-only
// resize with no scroll (a window edge, split screen, DeX) re-syncs it.
//
//   BASE_URL=http://127.0.0.1:8098 PW_BROWSER_CHANNEL=chrome node scripts/verify-world-section-nav.mjs
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
// Headless Chrome reports the host's cores; pin a capable device.
const CAPABLE = () => {
  for (const [key, value] of [
    ["hardwareConcurrency", 8],
    ["deviceMemory", 8],
  ]) {
    Object.defineProperty(Navigator.prototype, key, { get: () => value, configurable: true });
  }
};

async function openWorld(options) {
  const context = await browser.newContext(options);
  await context.addInitScript(CAPABLE);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition .topbar nav a[href='#riders']");
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    undefined,
    { timeout: 20_000 },
  );
  // Hydration and the dev LoadGate settle after the first paint.
  await page.waitForTimeout(2_000);
  return { context, page, errors };
}

const current = (page) =>
  page.evaluate(
    () =>
      document.querySelector('.topbar nav a[aria-current="location"]')?.getAttribute("href") ??
      null,
  );

function scrollPosition(section) {
  const y = Math.round(window.scrollY);
  if (!section) return { y };
  const element = document.getElementById(section);
  return {
    y,
    top: Math.round(element.getBoundingClientRect().top),
    margin: Math.round(parseFloat(getComputedStyle(element).scrollMarginTop)),
  };
}

const landingTolerance = 2;

async function rest(page, section = null) {
  let last = -1;
  for (let tick = 0; tick < 40; tick += 1) {
    await page.waitForTimeout(100);
    const { y, top, margin } = await page.evaluate(scrollPosition, section);
    // A long smooth jump can stall for more than one sample before moving
    // again. Only count stationary samples at the expected landing.
    if (y === last && (!section || Math.abs(top - margin) <= landingTolerance)) break;
    last = y;
  }
  await page.waitForTimeout(250);
}

// Anchor landings: the landscape phones fail without the scroll-margin-aware
// marker (a fixed 92px line never reaches a section landed at 96px).
for (const viewport of [
  { name: "landscape-844", width: 844, height: 390, android: true },
  { name: "landscape-915", width: 915, height: 412, android: true },
  { name: "landscape-740", width: 740, height: 360, android: true },
  { name: "landscape-667", width: 667, height: 375, android: true },
  { name: "phone-390", width: 390, height: 844, android: true },
  { name: "tablet-1024", width: 1024, height: 768 },
]) {
  const { context, page, errors } = await openWorld({
    viewport: { width: viewport.width, height: viewport.height },
    ...(viewport.android ? { userAgent: ANDROID_UA, isMobile: true, hasTouch: true } : {}),
  });
  const landings = [];
  for (const id of ["story", "riders", "records"]) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await rest(page);
    const link = page.locator(`.topbar nav a[href="#${id}"]`);
    if (await link.isVisible()) await link.click();
    else await link.evaluate((anchor) => anchor.click());
    await rest(page, id);
    const { top, margin } = await page.evaluate(scrollPosition, id);
    const marked = await current(page);
    assert.ok(
      Math.abs(top - margin) <= landingTolerance,
      `${viewport.name} #${id}: landed at ${top}, scroll-margin ${margin}`,
    );
    assert.equal(marked, `#${id}`, `${viewport.name} #${id}: aria-current ${marked}`);
    landings.push({ id, top, margin, marked });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "anchor-landing", name: viewport.name, landings }));
  await context.close();
}

// A height-only resize under the toolbar tolerance with no scroll: the
// marker follows once it settles (the hero is svh-sized, so the sections move).
{
  const { context, page, errors } = await openWorld({ viewport: { width: 1280, height: 900 } });
  await page.evaluate(() => {
    const riders = document.getElementById("riders");
    window.scrollTo({
      top: riders.getBoundingClientRect().top + window.scrollY - 238,
      behavior: "instant",
    });
  });
  await rest(page);
  const before = { marked: await current(page), scrollY: await page.evaluate(() => scrollY) };
  assert.equal(before.marked, "#story", `before the resize ${JSON.stringify(before)}`);
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    scrollY: window.scrollY,
    top: Math.round(document.getElementById("riders").getBoundingClientRect().top),
    marker: Math.min(200, window.innerHeight * 0.22),
  }));
  const marked = await current(page);
  assert.equal(after.scrollY, before.scrollY, "the resize scrolled the page");
  assert.ok(after.top <= after.marker, `#riders did not pass the marker ${JSON.stringify(after)}`);
  assert.equal(marked, "#riders", `a resize without a scroll left aria-current on ${marked}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "resize-without-scroll", before, after, marked }));
  await context.close();
}

await browser.close();
console.log("world section nav ok");
