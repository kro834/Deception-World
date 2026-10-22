// BASE_URL=http://127.0.0.1:8263 BROWSER=chrome|webkit node scripts/verify-dream-karakuri.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const base = (process.env.BASE_URL || "http://127.0.0.1:8263").replace(/\/$/, "");
const browserName = process.env.BROWSER || "chrome";
assert.ok(["chrome", "webkit"].includes(browserName), `Unsupported BROWSER=${browserName}`);
const browserType = browserName === "webkit" ? webkit : chromium;
const linkTab = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
const browser = await browserType.launch(
  browserName === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const output = resolve("output/playwright/dream-karakuri", browserName);
const viewports = [
  { width: 320, height: 640, label: "320x640" },
  { width: 390, height: 844, label: "390x844" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1440, height: 900, label: "1440x900" },
];
const requestedViewports = process.env.PW_VIEWPORTS?.split(",").map((entry) => entry.trim());
if (requestedViewports) {
  const unknown = requestedViewports.filter(
    (label) => !viewports.some((view) => view.label === label),
  );
  assert.deepEqual(unknown, [], `Unknown PW_VIEWPORTS label(s): ${unknown.join(", ")}`);
}
const selectedViewports = requestedViewports
  ? viewports.filter((viewport) => requestedViewports.includes(viewport.label))
  : viewports;
assert.ok(selectedViewports.length > 0, "PW_VIEWPORTS must select at least one viewport");
const offlineExternals = process.env.PW_OFFLINE_EXTERNALS === "1";
const offlineFonts = offlineExternals || process.env.PW_OFFLINE_FONTS === "1";
const pageErrors = [];
const consoleErrors = [];
const READY_TIMEOUT_MS = 14_000;

function progress(label, state) {
  console.log(`[${browserName}] ${new Date().toISOString()} ${state} ${label}`);
}

await mkdir(output, { recursive: true });

async function configureContext(context, label) {
  if (offlineFonts) {
    await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
      route.abort(),
    );
    progress(`${label}: Google Fonts blocked; exercising fallback fonts`, "FALLBACK-FONTS");
  }
  if (offlineExternals) {
    await context.route(
      /^https:\/\/grok\.com\/grok-app-builder\/extensions\.js(?:\?.*)?$/,
      (route) => route.abort(),
    );
    progress(`${label}: exact Grok editor extension blocked`, "EXTERNAL-ISOLATION");
  }
}

function watch(page, label) {
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${label}: ${message.text()}`);
  });
}

async function ready(page, label) {
  page.setDefaultTimeout(READY_TIMEOUT_MS);
  try {
    await page.goto(`${base}/dream-chapter`, { waitUntil: "commit", timeout: READY_TIMEOUT_MS });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.dreamChapter === "true" &&
        !document.documentElement.hasAttribute("data-loading") &&
        document.querySelector('[data-dream-karakuri] [role="tab"]') &&
        document.querySelector(".dream-stage-lantern") &&
        document.querySelector(".dream-programme-reel"),
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
    // `document.fonts.ready` can wait on remote font delivery. Let local fonts
    // settle briefly, then continue with the fallback stack and report geometry.
    await page.evaluate(async () => {
      if (!document.fonts) return;
      let timer;
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => {
          timer = window.setTimeout(resolve, 2500);
        }),
      ]);
      if (timer) window.clearTimeout(timer);
    });
    await page.waitForFunction(
      () => {
        const cabinet = document.querySelector("[data-dream-karakuri]");
        const desk = document.querySelector(".dream-programme-reel");
        return (
          cabinet?.getBoundingClientRect().height > 0 && desk?.getBoundingClientRect().height > 0
        );
      },
      undefined,
      { timeout: 6000 },
    );
    for (const selector of [
      "[data-dream-karakuri]",
      ".dream-stage-lantern",
      ".dream-programme-reel",
    ]) {
      assert.equal(
        await page.locator(selector).isVisible(),
        true,
        `${label}: ${selector} renders visibly`,
      );
    }
  } catch (error) {
    const diagnostics = await page
      .evaluate(() => {
        const inspect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            count: document.querySelectorAll(selector).length,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            dreamVisible: element.getAttribute("data-dream-visible"),
          };
        };
        return {
          url: location.href,
          readyState: document.readyState,
          title: document.title,
          html: {
            dreamChapter: document.documentElement.dataset.dreamChapter,
            loading: document.documentElement.hasAttribute("data-loading"),
            revealReady: document.documentElement.dataset.dreamRevealReady,
            worldEffects: document.documentElement.dataset.worldEffects,
          },
          bodyText: document.body?.innerText?.slice(0, 1600) ?? "",
          cabinet: inspect("[data-dream-karakuri]"),
          tab: inspect('[data-dream-karakuri] [role="tab"]'),
          lantern: inspect(".dream-stage-lantern"),
          reel: inspect(".dream-programme-reel"),
          fonts: document.fonts
            ? {
                status: document.fonts.status,
                check: document.fonts.check('16px "Shippori Mincho"'),
              }
            : null,
        };
      })
      .catch((diagnosticError) => ({ diagnosticError: diagnosticError.message }));
    const stem = `${label.replace(/[^a-z0-9-]/gi, "-")}-ready-timeout`;
    await page.screenshot({ path: `${output}/${stem}.png`, fullPage: false }).catch(() => {});
    await writeFile(`${output}/${stem}.json`, `${JSON.stringify(diagnostics, null, 2)}\n`);
    throw new Error(
      `Ready gate timed out at ${label}; diagnostic saved to ${stem}.json: ${error.message}`,
    );
  }
}

async function finishFiniteAnimations(page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const iterations = animation.effect?.getTiming().iterations;
      return iterations !== Infinity;
    });
    let timer;
    await Promise.race([
      Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, 1800);
      }),
    ]);
    if (timer) window.clearTimeout(timer);
  });
}

async function runFeature(label, feature, operation) {
  const started = Date.now();
  progress(`${label} ${feature}`, "START");
  try {
    await operation();
    progress(`${label} ${feature} (${Date.now() - started}ms)`, "PASS");
  } catch (error) {
    progress(`${label} ${feature} (${Date.now() - started}ms): ${error.message}`, "FAIL");
    throw error;
  }
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
}

async function selectedPanel(page, no) {
  const tab = page.locator(`[data-dream-karakuri] [data-karakuri-tab="${no}"]`);
  const panel = page.locator(`[data-dream-karakuri] [data-karakuri-panel="${no}"]`);
  assert.equal(await tab.getAttribute("aria-selected"), "true", `CASE ${no}: selected tab`);
  assert.equal(await tab.getAttribute("aria-controls"), await panel.getAttribute("id"));
  assert.equal(await panel.getAttribute("data-selected"), "true");
  assert.equal(await panel.getAttribute("aria-hidden"), "false");
  assert.equal(await panel.evaluate((element) => element.inert), false);
  const inactive = page.locator(
    `[data-dream-karakuri] [data-karakuri-panel]:not([data-karakuri-panel="${no}"])`,
  );
  const states = await inactive.evaluateAll((panels) =>
    panels.map((panel) => ({ hidden: panel.getAttribute("aria-hidden"), inert: panel.inert })),
  );
  assert.equal(states.length, 5, "all other chapter panes remain mounted");
  assert.ok(states.every((state) => state.hidden === "true" && state.inert));
  const inactiveLink = inactive.first().locator("a").first();
  if (await inactiveLink.count()) {
    const acceptedFocus = await inactiveLink.evaluate((link) => {
      link.focus();
      return document.activeElement === link;
    });
    assert.equal(acceptedFocus, false, "inactive pane links cannot receive keyboard focus");
  }
}

async function assertFocusOutline(locator, expectedColor, label) {
  const result = await locator.evaluate((element) => ({
    focused: element === document.activeElement,
    focusVisible: element.matches(":focus-visible"),
    color: getComputedStyle(element).outlineColor,
    style: getComputedStyle(element).outlineStyle,
    width: getComputedStyle(element).outlineWidth,
  }));
  assert.equal(result.focused, true, `${label}: control receives focus`);
  assert.equal(result.focusVisible, true, `${label}: keyboard focus indicator is active`);
  assert.equal(result.color, expectedColor, `${label}: dark paper focus color`);
  assert.equal(result.style, "solid", `${label}: focus outline is visible`);
  assert.ok(Number.parseFloat(result.width) >= 2, `${label}: focus outline has visible width`);
}

async function tabToLinkFrom(page, source, link, expectedColor, label) {
  // Safari can acknowledge the React state update before WebKit has committed
  // the selected paper's visibility and tab order. Let style/layout settle
  // before testing native keyboard traversal; keep the focus assertions strict.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const panelState = await source.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      active: element === document.activeElement,
      selected: element.getAttribute("data-selected"),
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
      tabIndex: element.tabIndex,
      visibility: style.visibility,
      display: style.display,
      width: rect.width,
      height: rect.height,
    };
  });
  if (panelState.selected !== null) {
    assert.equal(panelState.selected, "true", `${label}: source paper is selected`);
    assert.equal(panelState.ariaHidden, "false", `${label}: source paper is exposed`);
    assert.equal(panelState.inert, false, `${label}: source paper is not inert`);
    assert.equal(panelState.visibility, "visible", `${label}: source paper is visible`);
    assert.ok(panelState.width > 0 && panelState.height > 0, `${label}: source paper has layout`);
  }
  await source.focus();
  const focusState = await source.evaluate((element) => ({
    active: element === document.activeElement,
    activeElement:
      document.activeElement?.id ||
      document.activeElement?.getAttribute("href") ||
      document.activeElement?.className ||
      document.activeElement?.tagName,
  }));
  assert.equal(
    focusState.active,
    true,
    `${label}: source accepts focus (active element: ${focusState.activeElement})`,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press(linkTab);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await assertFocusOutline(link, expectedColor, label);
}

async function landAtCase(page, no, label) {
  await page.waitForFunction((caseNo) => location.hash === `#dream-case-${caseNo}`, no);
  await page.waitForFunction((caseNo) => {
    const target = document.getElementById(`dream-case-${caseNo}`);
    const nav = document.querySelector(".dream-chapter-nav");
    if (!target || !nav || !target.open) return false;
    const targetRect = target.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    return targetRect.top >= navRect.bottom - 2 && targetRect.top < innerHeight - 20;
  }, no);
  assert.equal(
    await page.locator(`#dream-case-${no}`).isVisible(),
    true,
    `${label}: case is visible`,
  );
  await assertNoOverflow(page, label);
}

async function checkNativeNavigation(viewport, context) {
  // Establish the existing chapter index as a baseline before attributing any
  // failed #dream-case-N arrival to the new cabinet's direct native link.
  const baseline = await context.newPage();
  watch(baseline, `${viewport.label} baseline`);
  await ready(baseline, `${viewport.label}-baseline`);
  await baseline.locator('.dream-reader-index a[href="#dream-case-2"]').click();
  try {
    await landAtCase(baseline, "2", `${viewport.label} baseline index`);
  } catch (error) {
    throw new Error(
      `Existing chapter-index navigation baseline failed at ${viewport.label}: ${error.message}`,
    );
  }
  await baseline.close();

  const page = await context.newPage();
  watch(page, `${viewport.label} cabinet link`);
  await ready(page, `${viewport.label}-cabinet-link`);
  const cabinet = page.locator("[data-dream-karakuri]");
  await cabinet.scrollIntoViewIfNeeded();
  assert.equal(
    await cabinet.isVisible(),
    true,
    `${viewport.label}: cabinet is visible after scroll`,
  );
  await page.locator('[data-karakuri-tab="2"]').click();
  await selectedPanel(page, "2");
  const cabinetLink = page.locator('[data-karakuri-panel="2"] a[href="#dream-case-2"]');
  assert.equal(await cabinetLink.count(), 1, "selected paper retains a native story link");
  await cabinetLink.click();
  await landAtCase(page, "2", `${viewport.label} cabinet native link`);
  await finishFiniteAnimations(page);
  await page.screenshot({ path: `${output}/${viewport.label}-native-arrival.png` });
  await page.close();
}

async function checkCabinet(viewport, context) {
  const page = await context.newPage();
  watch(page, `${viewport.label} cabinet`);
  await ready(page, `${viewport.label}-cabinet`);
  await assertNoOverflow(page, `${viewport.label} initial`);
  const cabinet = page.locator("[data-dream-karakuri]");
  await cabinet.scrollIntoViewIfNeeded();
  assert.equal(
    await cabinet.isVisible(),
    true,
    `${viewport.label}: cabinet is visible after scroll`,
  );
  const tabs = page.locator('[data-dream-karakuri] [role="tab"]');
  assert.equal(await tabs.count(), 6);
  await selectedPanel(page, "0");
  await page.screenshot({ path: `${output}/${viewport.label}-cabinet-initial.png` });

  const heightBefore = await cabinet.evaluate((element) => element.getBoundingClientRect().height);
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-karakuri-tab")),
    "1",
  );
  await selectedPanel(page, "1");
  await page.keyboard.press("End");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-karakuri-tab")),
    "5",
  );
  await selectedPanel(page, "5");
  await page.keyboard.press("Home");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-karakuri-tab")),
    "0",
  );
  await selectedPanel(page, "0");
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-karakuri-tab")),
    "5",
  );
  await selectedPanel(page, "5");
  if (viewport.width >= 390) {
    const paper = page.locator('[data-karakuri-panel="5"]');
    const link = paper.locator(".dream-karakuri-actions a").first();
    await finishFiniteAnimations(page);
    await tabToLinkFrom(
      page,
      paper,
      link,
      "rgb(135, 65, 44)",
      `${viewport.label} cabinet link`,
    );
  }
  await finishFiniteAnimations(page);
  const heightAfter = await cabinet.evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(
    Math.abs(heightAfter - heightBefore) <= 2,
    `${viewport.label}: cabinet height changed ${heightBefore}px → ${heightAfter}px across chapter selections`,
  );
  await assertNoOverflow(page, `${viewport.label} selected`);
  await page.screenshot({ path: `${output}/${viewport.label}-cabinet-selected.png` });
  await page.close();
}

async function checkLantern(viewport, context) {
  const page = await context.newPage();
  watch(page, `${viewport.label} lantern`);
  await ready(page, `${viewport.label}-lantern`);
  const lantern = page.locator(".dream-stage-lantern");
  const hero = page.locator(".dream-hero");
  const synopsis = page.locator("#cases");
  const start = await synopsis.evaluate((element) => element.textContent);
  assert.equal(await lantern.getAttribute("aria-pressed"), "true");
  assert.equal(await hero.getAttribute("data-dream-lantern"), "lit");
  await lantern.click();
  await page.waitForFunction(() => {
    const button = document.querySelector(".dream-stage-lantern");
    const stage = document.querySelector(".dream-hero");
    return (
      button?.getAttribute("aria-pressed") === "false" &&
      stage?.getAttribute("data-dream-lantern") === "dim"
    );
  });
  await finishFiniteAnimations(page);
  assert.equal(
    await synopsis.evaluate((element) => element.textContent),
    start,
    "changing the lantern never hides or mutates the story",
  );
  assert.equal(await synopsis.getAttribute("aria-hidden"), null);
  assert.notEqual(await synopsis.evaluate((element) => getComputedStyle(element).display), "none");
  assert.equal(await page.locator("#cases .dream-story-case").count(), 6);
  await assertNoOverflow(page, `${viewport.label} lantern dim`);
  await page.screenshot({ path: `${output}/${viewport.label}-lantern-dim.png` });
  await synopsis.scrollIntoViewIfNeeded();
  assert.equal(
    await page.locator("#case-title").isVisible(),
    true,
    `${viewport.label}: story remains visibly readable after the lantern change`,
  );
  await page.close();
}

async function checkReel(viewport, context) {
  const page = await context.newPage();
  watch(page, `${viewport.label} reel`);
  await ready(page, `${viewport.label}-reel`);
  const reel = page.locator(".dream-programme-reel");
  await reel.scrollIntoViewIfNeeded();
  assert.equal(await reel.isVisible(), true, `${viewport.label}: reel is visible after scroll`);
  const status = reel.locator('.dream-programme-reel-position[role="status"]');
  const next = reel.locator('button[aria-label^="次の"]');
  const previous = reel.locator('button[aria-label^="前の"]');
  const modes = reel.locator(".dream-programme-spotlight-modes button");
  assert.equal(await status.count(), 1, "the reel exposes one polite status region");
  assert.equal(await modes.nth(0).getAttribute("aria-pressed"), "true");
  const quoteStart = (await status.innerText()).trim();
  await next.click();
  const quoteNext = (await status.innerText()).trim();
  assert.notEqual(quoteNext, quoteStart, "next quote updates the live position and speaker");
  assert.equal(
    await reel.locator(".dream-programme-reel-sheet").getAttribute("data-reel-operated"),
    "true",
  );
  await previous.click();
  assert.equal(
    (await status.innerText()).trim(),
    quoteStart,
    "previous quote returns to the prior leaf",
  );
  await finishFiniteAnimations(page);
  await modes.nth(1).click();
  assert.equal(await modes.nth(1).getAttribute("aria-pressed"), "true");
  assert.equal(await modes.nth(0).getAttribute("aria-pressed"), "false");
  if (viewport.width >= 390) {
    const link = reel.locator(".dream-programme-reel-sheet a").first();
    await tabToLinkFrom(
      page,
      modes.nth(1),
      link,
      "rgb(130, 59, 53)",
      `${viewport.label} reel link`,
    );
  }
  const noteStart = (await status.innerText()).trim();
  assert.match(noteStart, /^章の言葉\s+\d+\s*\/\s*\d+/);
  await next.click();
  const noteNext = (await status.innerText()).trim();
  assert.notEqual(noteNext, noteStart, "next chapter note updates the live position and chapter");
  await previous.click();
  assert.equal(
    (await status.innerText()).trim(),
    noteStart,
    "previous chapter note returns to the prior leaf",
  );
  await finishFiniteAnimations(page);
  await assertNoOverflow(page, `${viewport.label} reel`);
  await page.screenshot({ path: `${output}/${viewport.label}-reel-note.png` });
  await page.close();
}

async function checkNoMotion(viewport, mode) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    hasTouch: viewport.width < 800,
  });
  await configureContext(context, `${viewport.label}-${mode}`);
  if (mode === "economy") {
    await context.addInitScript(() => {
      const applyEconomy = () => {
        if (!document.documentElement) return false;
        document.documentElement.dataset.worldEffects = "economy";
        return true;
      };
      if (!applyEconomy()) {
        document.addEventListener("DOMContentLoaded", applyEconomy, { once: true });
      }
    });
  }
  const page = await context.newPage();
  watch(page, `${viewport.label} ${mode}`);
  await ready(page, `${viewport.label}-${mode}`);
  await page.locator("[data-dream-karakuri]").scrollIntoViewIfNeeded();
  await page.locator('[data-karakuri-tab="1"]').click();
  await finishFiniteAnimations(page);
  const animation = await page
    .locator(".dream-karakuri-shoji-leaf")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const running = element
        .getAnimations()
        .filter((animation) => ["running", "pending"].includes(animation.playState)).length;
      return { name: style.animationName, running };
    });
  assert.equal(animation.name, "none", `${mode}: shoji has no animation after selecting a chapter`);
  assert.equal(animation.running, 0, `${mode}: no shoji animation is running`);
  const reel = page.locator(".dream-programme-reel");
  await reel.scrollIntoViewIfNeeded();
  await reel.locator('button[aria-label^="次の"]').click();
  await finishFiniteAnimations(page);
  const reelAnimation = await reel.locator(".dream-programme-reel-sheet").evaluate((element) => {
    const style = getComputedStyle(element);
    const running = element
      .getAnimations()
      .filter((animation) => ["running", "pending"].includes(animation.playState)).length;
    return { name: style.animationName, running };
  });
  assert.equal(
    reelAnimation.name,
    "none",
    `${mode}: paper reel has no animation after changing leaf`,
  );
  assert.equal(reelAnimation.running, 0, `${mode}: no paper reel animation is running`);
  await page.locator(".dream-stage-lantern").click();
  await page.waitForFunction(
    () => document.querySelector(".dream-stage-lantern")?.getAttribute("aria-pressed") === "false",
  );
  await finishFiniteAnimations(page);
  const lightAnimations = await page
    .locator(".dream-hero-lamplight")
    .evaluate(
      (element) =>
        element
          .getAnimations()
          .filter((animation) => ["running", "pending"].includes(animation.playState)).length,
    );
  assert.equal(lightAnimations, 0, `${mode}: no lantern light animation is running`);
  if (mode === "economy")
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.worldEffects),
      "economy",
    );
  await page.screenshot({ path: `${output}/${viewport.label}-${mode}-motion.png` });
  await page.close();
  await context.close();
}

try {
  for (const viewport of selectedViewports) {
    progress(
      `${viewport.label} (${viewports.indexOf(viewport) + 1}/${viewports.length})`,
      "VIEWPORT",
    );
    if (offlineFonts) progress(`${viewport.label}: exercising local fallback fonts`, "MODE");
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
      hasTouch: viewport.width < 800,
      isMobile: browserName === "chrome" && viewport.width <= 390,
    });
    await configureContext(context, viewport.label);
    try {
      await runFeature(viewport.label, "cabinet keyboard / inert / stable height", () =>
        checkCabinet(viewport, context),
      );
      await runFeature(viewport.label, "paper reel status / previous / next", () =>
        checkReel(viewport, context),
      );
      await runFeature(viewport.label, "lantern story preservation", () =>
        checkLantern(viewport, context),
      );
      await runFeature(viewport.label, "native case arrival / global-nav baseline", () =>
        checkNativeNavigation(viewport, context),
      );
    } finally {
      await context.close();
    }
  }
  const phone = { width: 390, height: 844, label: "390x844" };
  if (selectedViewports.some((viewport) => viewport.label === phone.label)) {
    const normal = { ...phone, label: "390x844-normal" };
    const context = await browser.newContext({
      viewport: { width: phone.width, height: phone.height },
      reducedMotion: "no-preference",
      hasTouch: true,
      isMobile: browserName === "chrome",
    });
    await configureContext(context, normal.label);
    try {
      progress(normal.label, "VIEWPORT");
      await runFeature(normal.label, "cabinet keyboard / inert / stable height", () =>
        checkCabinet(normal, context),
      );
      await runFeature(normal.label, "paper reel status / previous / next", () =>
        checkReel(normal, context),
      );
      await runFeature(normal.label, "lantern story preservation", () =>
        checkLantern(normal, context),
      );
      await runFeature(normal.label, "native case arrival / global-nav baseline", () =>
        checkNativeNavigation(normal, context),
      );
    } finally {
      await context.close();
    }
  }
  await runFeature("390x844-reduced", "cabinet motion disabled", () =>
    checkNoMotion({ ...phone, label: "390x844-reduced" }, "reduced"),
  );
  await runFeature("390x844-economy", "cabinet motion disabled", () =>
    checkNoMotion({ ...phone, label: "390x844-economy" }, "economy"),
  );
  assert.deepEqual(pageErrors, [], "no uncaught browser JavaScript errors");
  if (consoleErrors.length) console.log(JSON.stringify({ consoleErrors }));
  console.log(
    `${browserName}: Dream karakuri, stage lantern, and paper reel passed at ${selectedViewports.length} requested viewports plus normal-motion 390px`,
  );
} finally {
  await browser.close();
}
