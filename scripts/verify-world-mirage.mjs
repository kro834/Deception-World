import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run against a fresh production preview (or the dev server with BASE_URL).
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const GALAXY_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const SAMSUNG_INTERNET_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";

// Headless Chrome reports the host's cores, and Android with 4 or fewer is
// economy (rendering-profile.js): capable-Android checks pin a capable device
// so they do not depend on the machine. configurable, so a later override in
// the same page does not throw.
const CAPABLE = () => {
  for (const [key, value] of [
    ["hardwareConcurrency", 8],
    ["deviceMemory", 8],
  ]) {
    Object.defineProperty(Navigator.prototype, key, { get: () => value, configurable: true });
  }
};

// A rail press takes the page lock (viewport-scroll-lock.js, html[data-rail-lock]).
// The choreography must hold still under it: the same scroll-driven
// animations keep running (none cancelled and restarted) and nothing beside
// the rail moves. The rail's own press transitions are not counted, nor
// RISING's rw-* entrances until its sheet drops the same rail-lock gate
// (styles-world-rising.css is being rewritten separately).
async function heldPress(page, name) {
  const watched = [".hero-backdrop", ".signal > img", ".story-copy .tr-c"];
  const snapshot = () =>
    page.evaluate((selectors) => {
      const running = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === "running" &&
            !animation.animationName?.startsWith("rw-") &&
            (animation.timeline instanceof ViewTimeline ||
              animation.timeline instanceof ScrollTimeline),
        );
      window.__heldPressAnimations ??= running;
      const kept = window.__heldPressAnimations;
      return {
        lock: document.documentElement.hasAttribute("data-rail-lock"),
        top: Math.round(window.scrollY),
        running: running.length,
        replaced: kept
          .filter((animation) => !running.includes(animation))
          .map((animation) => `${animation.animationName} ${animation.playState}`),
        styles: selectors.map((selector) => {
          const node = document.querySelector(selector);
          if (!node) return `${selector}: missing`;
          const style = getComputedStyle(node);
          return [style.transform, style.translate, style.scale, style.opacity, style.color].join();
        }),
      };
    }, watched);
  await page.evaluate(() => {
    const rail = document.querySelector(".manager-archive-tabs");
    const box = rail.getBoundingClientRect();
    window.scrollBy({ top: box.top + box.height / 2 - innerHeight / 2, behavior: "instant" });
  });
  await page.waitForTimeout(400);
  const point = await page.evaluate(() => {
    const tab = document.querySelector('.manager-archive-tabs [aria-selected="true"]');
    const box = tab.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  const cdp = await page.context().newCDPSession(page);
  const before = await snapshot();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(260); // past the 105 ms hold
  const held = await snapshot();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  const after = await snapshot();
  await page.evaluate(() => delete window.__heldPressAnimations);
  await cdp.detach();
  assert.equal(before.lock, false, `${name}: rail lock before the press`);
  assert.equal(held.lock, true, `${name}: no rail lock while held`);
  assert.equal(after.lock, false, `${name}: rail lock left after release`);
  assert.ok(before.running > 0, `${name}: nothing running`);
  for (const [phase, state] of [
    ["held", held],
    ["released", after],
  ]) {
    assert.equal(state.top, before.top, `${name}: page moved ${phase}`);
    assert.deepEqual(state.replaced, [], `${name}: animations restarted ${phase}`);
    assert.equal(state.running, before.running, `${name}: running animations ${phase}`);
    assert.deepEqual(state.styles, before.styles, `${name}: choreography moved ${phase}`);
  }
  return before.running;
}

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

// Economy rendering (weak Android, chosen by a resource hint: 2 GB, or 4
// cores): the boot is skipped and nothing loops.
for (const [property, value] of [
  ["deviceMemory", 2],
  ["hardwareConcurrency", 4],
]) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    userAgent: ANDROID_UA,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    ([name, hint]) => Object.defineProperty(Navigator.prototype, name, { get: () => hint }),
    [property, value],
  );
  const { page } = await openWorld(context);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.worldEffects === "economy" &&
      document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 3_000 },
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.hasAttribute("data-mirage-quiet")),
    true,
  );
  const state = await readState(page);
  assert.deepEqual(state.infinite, []);
  console.log(`economy (${property} ${value}): boot skipped`);
  await context.close();
}

// Capable Android (Pixel 9, Galaxy S24, Samsung Internet): full motion. The
// boot plays to its end, the scroll choreography runs on the document, the
// key art shows and nothing loops. Glass stays CSS-only.
for (const device of [
  { name: "Android full (Pixel 9)", ua: ANDROID_UA, width: 412, height: 915, scale: 2.625 },
  { name: "Android full (Galaxy S24)", ua: GALAXY_UA, width: 360, height: 780, scale: 3 },
  {
    name: "Android full (Samsung Internet)",
    ua: SAMSUNG_INTERNET_UA,
    width: 360,
    height: 780,
    scale: 3,
  },
]) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    userAgent: device.ua,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(CAPABLE);
  const { page, errors } = await openWorld(context);
  assert.equal(
    await page.evaluate(() => document.documentElement.hasAttribute("data-mirage-quiet")),
    false,
    `${device.name}: boot gated off`,
  );
  await page.waitForFunction(
    () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
    undefined,
    { timeout: 8_000 },
  );
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  const profile = await page.evaluate(() => ({
    effects: document.documentElement.dataset.worldEffects ?? null,
    android: document.documentElement.dataset.androidRenderer ?? null,
    nativeProgress: document.documentElement.dataset.nativeScrollProgress ?? null,
    // finish() stores the key only when the boot ran to its end.
    played: sessionStorage.getItem("deception-world:mirage-boot:v1") === "1",
    keyArt: (() => {
      const layer = document.querySelector(".hero-backdrop-layer");
      const box = layer?.getBoundingClientRect();
      return Boolean(layer && getComputedStyle(layer).display !== "none" && box.width > 0);
    })(),
    canvases: document.querySelectorAll(".liquid-refraction-canvas").length,
  }));
  assert.deepEqual(
    profile,
    {
      effects: null,
      android: "true",
      nativeProgress: "true",
      played: true,
      keyArt: true,
      canvases: 0,
    },
    device.name,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(250);
  const state = await readState(page);
  assert.ok(state.overflow <= 1, `${device.name}: horizontal overflow ${state.overflow}`);
  assert.deepEqual(state.detached, [], `${device.name}: scroll animations bound to a panel`);
  assert.deepEqual(state.infinite, [], `${device.name}: perpetual animations`);
  assert.ok(state.mirage > 0, `${device.name}: no Mirage choreography`);
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
    return Boolean(hit && h2.contains(hit));
  });
  assert.equal(heading, true, `${device.name}: story heading hit-test`);
  const running = await heldPress(page, device.name);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `${device.name}: boot played, choreography on, key art shown, ${running} animations held still under a rail press`,
  );
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
