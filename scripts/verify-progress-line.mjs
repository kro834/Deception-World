import assert from "node:assert/strict";
import { chromium } from "playwright";

// Reading progress (--page-progress, use-world-mode.ts) is written per scroll
// frame only on headers that draw it from the value. On /world the Motion
// prism (.topbar::before, compositor-driven) replaces the topbar's hairline
// where scroll timelines run, so that host gets no per-frame write there;
// the dossier and dream headers keep their line; Android reads it natively.
// A small height-only resize with no scroll still updates the value.
//
//   BASE_URL=http://127.0.0.1:8098 PW_BROWSER_CHANNEL=chrome node scripts/verify-progress-line.mjs
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const IOS26_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
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
const COUNT_WRITES = () => {
  window.__progressWrites = 0;
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, ...rest) {
    if (name === "--page-progress") window.__progressWrites += 1;
    return setProperty.call(this, name, ...rest);
  };
};

async function open(path, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(CAPABLE);
  await context.addInitScript(COUNT_WRITES);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.mode === "world" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(2_500);
  return { context, page, errors };
}

async function scrollAndRead(page, host, width) {
  const before = await page.evaluate(() => window.__progressWrites);
  await page.mouse.move(width / 2, 400);
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  return page.evaluate(
    ([selector, start]) => {
      const element = document.querySelector(selector);
      const after = getComputedStyle(element, "::after");
      const before = getComputedStyle(element, "::before");
      return {
        writes: window.__progressWrites - start,
        scrollY: Math.round(window.scrollY),
        economy: document.documentElement.dataset.worldEffects ?? null,
        native: document.documentElement.dataset.nativeScrollProgress ?? null,
        hairline: after.content,
        hairlineScale: after.transform === "none" ? null : new DOMMatrixReadOnly(after.transform).a,
        prism: before.content === "none" ? null : before.scale,
        value: element.style.getPropertyValue("--page-progress"),
      };
    },
    [host, before],
  );
}

const cases = [
  { name: "world desktop", path: "/world", host: ".topbar", width: 1440, prism: true },
  {
    name: "world iOS 26",
    path: "/world",
    host: ".topbar",
    width: 390,
    options: { userAgent: IOS26_UA, isMobile: true, hasTouch: true },
    prism: true,
  },
  { name: "rider desktop", path: "/riders/saga", host: ".manager-topbar", width: 1440 },
  { name: "manager desktop", path: "/managers/zeus", host: ".manager-topbar", width: 1440 },
  { name: "dream desktop", path: "/dream-chapter", host: ".dream-site-header", width: 1440 },
  ...[
    ["/world", ".topbar"],
    ["/riders/saga", ".manager-topbar"],
    ["/managers/zeus", ".manager-topbar"],
    ["/dream-chapter", ".dream-site-header"],
  ].map(([path, host]) => ({
    name: `android ${path}`,
    path,
    host,
    width: 412,
    options: { userAgent: ANDROID_UA, isMobile: true, hasTouch: true },
    android: true,
  })),
];

for (const entry of cases) {
  const { context, page, errors } = await open(entry.path, {
    viewport: { width: entry.width, height: entry.width < 600 ? 915 : 900 },
    ...entry.options,
  });
  const state = await scrollAndRead(page, entry.host, entry.width);
  assert.ok(state.scrollY > 500, `${entry.name}: the page did not scroll ${state.scrollY}`);
  assert.equal(state.economy, null, `${entry.name}: economy rendering`);
  if (entry.android) {
    // Compositor-driven (scroll(root block)): no per-frame write anywhere.
    assert.equal(state.native, "true", `${entry.name}: native progress`);
    assert.equal(state.writes, 0, `${entry.name}: ${state.writes} --page-progress writes`);
  } else if (entry.prism) {
    assert.equal(state.writes, 0, `${entry.name}: ${state.writes} writes for a hidden hairline`);
    assert.equal(state.hairline, "none", `${entry.name}: the hairline is drawn`);
    assert.ok(state.prism && state.prism !== "none", `${entry.name}: no prism line`);
    // Reduced motion brings back the hairline path, fed by the value again
    // (its scale is pinned to 0 there by styles-world/11.css).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollBy({ top: 240, behavior: "instant" }));
    await page.waitForTimeout(400);
    const reduced = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return {
        hairline: getComputedStyle(element, "::after").content,
        value: Number(element.style.getPropertyValue("--page-progress")),
      };
    }, entry.host);
    assert.notEqual(reduced.hairline, "none", `${entry.name}: reduced motion hairline`);
    assert.ok(reduced.value > 0, `${entry.name}: reduced motion value ${reduced.value}`);
    state.reduced = reduced;
  } else {
    assert.ok(state.writes > 0, `${entry.name}: the line is never written`);
    assert.notEqual(state.hairline, "none", `${entry.name}: no hairline`);
    assert.ok(state.hairlineScale > 0, `${entry.name}: the line stays at 0`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "progress-line", name: entry.name, ...state }));
  await context.close();
}

// A height-only resize under the toolbar tolerance with no scroll (a window
// edge, split screen, DeX): the value follows once the resize settles.
{
  const { context, page, errors } = await open("/managers/zeus", {
    viewport: { width: 1280, height: 900 },
  });
  await page.evaluate(() =>
    window.scrollTo({
      top: (document.documentElement.scrollHeight - innerHeight) * 0.6,
      behavior: "instant",
    }),
  );
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.waitForTimeout(400);
  const resized = await page.evaluate(() => ({
    value: document.querySelector(".manager-topbar").style.getPropertyValue("--page-progress"),
    expected: (window.scrollY / (document.documentElement.scrollHeight - innerHeight)).toFixed(4),
  }));
  assert.equal(resized.value, resized.expected, "a resize without a scroll left a stale value");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "resize-without-scroll", ...resized }));
  await context.close();
}

await browser.close();
console.log("progress line ok");
