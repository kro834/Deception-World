import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run against a fresh production preview (or the dev server with BASE_URL).
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const viewports = [
  { name: "phone-320", width: 320, height: 740 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "landscape-844", width: 844, height: 390 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

async function openWorld(context) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition");
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate(() => {
    const shell = document.querySelector(".site-shell");
    const animations = document
      .getAnimations()
      .filter((animation) => animation.animationName?.startsWith("mr-"));
    const scrolling = animations.filter((animation) => animation.timeline?.source !== undefined);
    return {
      boot: shell?.dataset.mirageBoot ?? null,
      overflow: document.documentElement.scrollWidth - innerWidth,
      mirage: animations.length,
      detached: scrolling
        .filter((animation) => animation.timeline.source !== document.scrollingElement)
        .map((animation) => `${animation.animationName} → ${animation.timeline.source?.tagName}`),
      infinite: document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
        .map((animation) => animation.animationName ?? "waapi"),
      hud: (() => {
        const hud = document.querySelector(".mr-hero-hud");
        return hud
          ? {
              hidden: hud.getAttribute("aria-hidden"),
              pointer: getComputedStyle(hud).pointerEvents,
              position: getComputedStyle(hud).position,
            }
          : null;
      })(),
      tickers: [...document.querySelectorAll(".mr-ticker")].map((ticker) => ({
        hidden: ticker.getAttribute("aria-hidden"),
        pointer: getComputedStyle(ticker).pointerEvents,
      })),
    };
  });

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.width < 1100,
    isMobile: viewport.width < 600,
  });
  const { page, errors } = await openWorld(context);
  await page.waitForFunction(
    () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 4_500 },
  );
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(250);
  const state = await readState(page);
  assert.equal(
    state.overflow <= 1,
    true,
    `${viewport.name}: horizontal overflow ${state.overflow}`,
  );
  assert.deepEqual(state.detached, [], `${viewport.name}: scroll animations bound to a panel`);
  assert.deepEqual(state.infinite, [], `${viewport.name}: perpetual animations`);
  assert.deepEqual(state.hud, { hidden: "true", pointer: "none", position: "absolute" });
  assert.deepEqual(state.tickers, [
    { hidden: "true", pointer: "none" },
    { hidden: "true", pointer: "none" },
  ]);

  // The wordmark rests whole at the top and splits only once the page moves.
  const split = await page.evaluate(() =>
    [...document.querySelectorAll(".mr-word")].map((word) => getComputedStyle(word).translate),
  );
  assert.ok(
    split.every((value) => ["none", "0px", "0px 0px"].includes(value)),
    `${viewport.name}: title split at rest ${split}`,
  );

  if (viewport.name === "landscape-844") {
    const hero = await page.evaluate(() => {
      const identity = document.querySelector(".film-hero-identity").getBoundingClientRect();
      const title = document.querySelector(".anime-work-title b");
      const lines =
        title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight);
      return { width: identity.width, lines };
    });
    assert.ok(hero.width >= viewport.width * 0.4, `landscape identity ${hero.width}px`);
    assert.ok(hero.lines <= 2.2, `landscape title ${hero.lines} lines`);
  }

  // The story headline must be fully revealed once it sits in view.
  await page.locator(".story-heading h2").scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    document
      .querySelector(".story-heading h2")
      .scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.waitForTimeout(300);
  const heading = await page.evaluate(() => {
    const h2 = document.querySelector(".story-heading h2");
    const box = h2.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + Math.min(40, box.width / 4),
      box.top + box.height / 2,
    );
    return { clip: getComputedStyle(h2).clipPath, inside: Boolean(hit && h2.contains(hit)) };
  });
  assert.equal(heading.inside, true, `${viewport.name}: story heading hit-test`);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`${viewport.name}: mirage boot, timelines and ornaments ok`);
  await context.close();
}

// Reduced motion: no boot, no Mirage animation at all.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const { page } = await openWorld(context);
  await page.waitForFunction(
    () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 2_000 },
  );
  await page.waitForTimeout(600);
  const state = await readState(page);
  assert.equal(state.mirage, 0, `reduced motion kept ${state.mirage} Mirage animations`);
  console.log("reduced motion: static");
  await context.close();
}

// Economy rendering (Android): the boot is skipped and nothing loops.
{
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    userAgent: ANDROID_UA,
    isMobile: true,
    hasTouch: true,
  });
  const { page } = await openWorld(context);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.worldEffects === "economy" &&
      document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 3_000 },
  );
  const state = await readState(page);
  assert.deepEqual(state.infinite, []);
  console.log("economy: boot skipped");
  await context.close();
}

// Arrival through the opening handoff runs the HUD-only boot.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  const enter = page.locator(".cine-btn").first();
  await enter.waitFor({ state: "visible", timeout: 10_000 });
  await enter.click();
  const arrival = await page.waitForFunction(
    () => {
      const shell = document.querySelector(".site-shell.mirage-edition");
      if (!shell) return null;
      const h1 = document.querySelector(".hero h1");
      return {
        boot: shell.dataset.mirageBoot ?? null,
        handoff: document.documentElement.hasAttribute("data-opening-handoff-active"),
        h1Clip: h1 ? getComputedStyle(h1).clipPath : null,
      };
    },
    undefined,
    { timeout: 10_000 },
  );
  const value = await arrival.jsonValue();
  assert.ok(["hud", "done"].includes(value.boot), `handoff boot mode ${value.boot}`);
  assert.equal(value.h1Clip, "none");
  await page.waitForFunction(
    () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 10_000 },
  );
  console.log(`handoff arrival: ${value.boot} boot, h1 untouched`);
  await context.close();
}

await browser.close();
console.log("verify-world-mirage: all checks passed");
