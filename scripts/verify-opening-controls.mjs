// Standalone opening-control browser regression. Run against a built preview or
// dev server with BASE_URL=http://localhost:8080 and PW_ENGINE=chrome|webkit.
// Screenshots go to output/playwright/opening-controls. These emulated browser
// sizes do not constitute physical iPad Safari verification.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8080";
const requestedEngine = (process.env.PW_ENGINE || "chrome").toLowerCase();
const engine = requestedEngine === "chromium" ? "chrome" : requestedEngine;
assert.ok(engine === "chrome" || engine === "webkit", `PW_ENGINE must be chrome or webkit, got ${engine}`);
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(engine === "chrome" ? { channel: "chrome" } : {});
const outputDir = resolve(dirnameOfScript(), "../output/playwright/opening-controls");
mkdirSync(outputDir, { recursive: true });

const profiles = [
  { name: "320x568", viewport: { width: 320, height: 568 } },
  { name: "320x844", viewport: { width: 320, height: 844 } },
  { name: "667x375", viewport: { width: 667, height: 375 } },
];

function dirnameOfScript() {
  return fileURLToPath(new URL(".", import.meta.url));
}

const home = new URL("/", base).href;
const enterName = "ディセプションワールドへ入る";

function collectErrors(page, errors, diagnostics) {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Viewport argument key ["']interactive-widget["'] not recognized and ignored\./.test(text)) {
      diagnostics.push(text);
    } else {
      errors.push(`console: ${text}`);
    }
  });
}

async function expectFocus(page, selector, label) {
  await page.waitForFunction(
    (target) => document.activeElement?.matches(target),
    selector,
    { timeout: 2000 },
  );
  assert.equal(
    await page.evaluate((target) => document.activeElement?.matches(target), selector),
    true,
    label,
  );
}

async function checkPlayingGeometry(page, profileName) {
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const { x, y, top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return { x, y, top, right, bottom, left, width, height };
    };
    return {
      skip: rect(".cine-skip"),
      entry: rect(".cine-btn-primary"),
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  const gap = geometry.entry.top - geometry.skip.bottom;
  assert.ok(
    geometry.skip.left >= 0 && geometry.skip.right <= geometry.viewport.width,
    `${profileName}: SKIP is inside viewport (${JSON.stringify(geometry.skip)})`,
  );
  assert.ok(
    geometry.skip.top >= 0 && geometry.skip.bottom <= geometry.viewport.height,
    `${profileName}: SKIP is vertically inside viewport (${JSON.stringify(geometry.skip)})`,
  );
  assert.ok(
    gap >= 11.5,
    `${profileName}: SKIP to planned ENTER gap is ${gap.toFixed(2)}px, expected 12px`,
  );
  assert.ok(
    geometry.scrollWidth <= geometry.viewport.width + 1,
    `${profileName}: page overflows horizontally (${geometry.scrollWidth}px > ${geometry.viewport.width}px)`,
  );
  return { gap, skip: geometry.skip, entry: geometry.entry };
}

async function waitForWorld(page) {
  await page.waitForURL((url) => url.pathname === "/world", { timeout: 15000 });
}

async function checkNormalControls(profile) {
  const context = await browser.newContext({ viewport: profile.viewport, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  const diagnostics = [];
  collectErrors(page, errors, diagnostics);
  try {
    await page.goto(home);
    await page.locator(".cine-stage.is-playing").waitFor({ timeout: 10000 });
    const geometry = await checkPlayingGeometry(page, profile.name);
    await page.locator(".cine-logo-core").evaluate((logo) => logo.decode());
    await page.waitForFunction(
      () => Number(getComputedStyle(document.querySelector(".cine-logo-wrap")).opacity) >= 0.98,
      null,
      { timeout: 3000 },
    );
    await page.screenshot({ path: join(outputDir, `${engine}-${profile.name}-playing.png`) });

    await page.keyboard.press("Escape");
    await page.locator(".cine-stage.is-complete").waitFor({ timeout: 3000 });
    await expectFocus(page, ".cine-btn-primary", `${profile.name}: Escape moves focus to ENTER`);

    await page.waitForTimeout(650);
    await page.keyboard.press("r");
    await page.locator(".cine-stage.is-playing").waitFor({ timeout: 3000 });
    await expectFocus(page, ".cine-skip", `${profile.name}: R replay moves focus to SKIP`);

    await page.keyboard.press("Escape");
    await page.locator(".cine-stage.is-complete").waitFor({ timeout: 3000 });
    await expectFocus(page, ".cine-btn-primary", `${profile.name}: second Escape restores ENTER focus`);
    await page.keyboard.press("Enter");
    await waitForWorld(page);

    assert.deepEqual(errors, [], `${profile.name}: browser console errors`);
    console.log(
      JSON.stringify({ engine, viewport: profile.name, gap: geometry.gap, keyboard: "passed", diagnostics }),
    );
  } finally {
    await context.close();
  }
}

async function checkReducedMotion(profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  const diagnostics = [];
  collectErrors(page, errors, diagnostics);
  try {
    await page.goto(home);
    await page.locator('.cine-stage[data-opening-entry="ready"]').waitFor({ timeout: 5000 });
    const enter = page.getByRole("button", { name: enterName, exact: true });
    await enter.waitFor({ state: "visible" });
    assert.equal(await enter.isEnabled(), true, `${profile.name}: reduced-motion entry is enabled`);
    assert.equal(
      await page.locator(".cine-stage").evaluate((stage) => stage.classList.contains("is-complete")),
      true,
      `${profile.name}: reduced motion settles the title directly`,
    );
    await page.screenshot({ path: join(outputDir, `${engine}-${profile.name}-reduced.png`) });

    await enter.focus();
    await page.keyboard.press("Enter");
    await waitForWorld(page);
    assert.deepEqual(errors, [], `${profile.name}: reduced-motion browser console errors`);
    console.log(JSON.stringify({ engine, viewport: profile.name, reducedMotion: "entry ready", diagnostics }));
  } finally {
    await context.close();
  }
}

try {
  for (const profile of profiles) {
    await checkNormalControls(profile);
    await checkReducedMotion(profile);
  }
} finally {
  await browser.close();
}
