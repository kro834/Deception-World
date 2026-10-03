import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const calls = [
  "FAR UP！",
  "RIDER！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
];

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  {
    name: "phone-320",
    viewport: { width: 320, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  },
  {
    name: "phone-390",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  {
    name: "phone-landscape",
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  // rx2: portrait tablets take the portrait chant size and the centre-first
  // line reveal (the width where a top-down reveal flashed).
  {
    name: "tablet-portrait",
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
];

async function installCallRecorder(page) {
  await page.evaluate(() => {
    window.__rexonanceEntryCalls = [];
    window.__rexonanceCallMaxRoots = 0;
    window.__rexonanceEntryStartedAt = null;
    window.__rexonanceEntryFinishedAt = null;
    window.__rexonanceEntryPhases = [];
    let lastPhase = null;
    const sample = () => {
      const roots = [...document.querySelectorAll('.rx-call-sequence[data-mode="entry"]')];
      window.__rexonanceCallMaxRoots = Math.max(window.__rexonanceCallMaxRoots, roots.length);
      const root = roots[0];
      if (root && window.__rexonanceEntryStartedAt === null) {
        window.__rexonanceEntryStartedAt = performance.now();
      }
      if (root && root.dataset.phase !== lastPhase) {
        lastPhase = root.dataset.phase;
        window.__rexonanceEntryPhases.push({ phase: lastPhase, at: performance.now() });
      }
      if (
        !root &&
        window.__rexonanceEntryStartedAt !== null &&
        window.__rexonanceEntryFinishedAt === null
      ) {
        window.__rexonanceEntryFinishedAt = performance.now();
      }
      if (root?.dataset.tier === "full" && root.dataset.phase === "covering") {
        for (const beat of root.querySelectorAll(".rx-call-beat[data-call]")) {
          const style = getComputedStyle(beat);
          if (style.display === "none" || Number(style.opacity) < 0.3) continue;
          const call = beat.dataset.call;
          const seen = window.__rexonanceEntryCalls;
          if (seen.at(-1) !== call) seen.push(call);
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function waitForVisibleCall(page, selector, expectedLines) {
  await page.waitForFunction((target) => {
    const beat = document.querySelector(target);
    return beat && Number(getComputedStyle(beat).opacity) > 0.3;
  }, selector);
  const boxes = await page.locator(selector).evaluate((beat) =>
    [...beat.querySelectorAll("span")].map((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      const box = range.getBoundingClientRect();
      const row = span.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        rowTop: row.top,
        rowBottom: row.bottom,
      };
    }),
  );
  assert.equal(
    boxes.length,
    expectedLines,
    `${selector}: expected ${expectedLines} visible lines, got ${boxes.length}`,
  );
  for (let index = 1; index < boxes.length; index += 1) {
    assert.ok(
      boxes[index].rowTop >= boxes[index - 1].rowBottom - 1,
      `${selector}: each phrase line must occupy its own row`,
    );
  }
  for (const box of boxes) {
    assert.ok(box.width > 0, `${selector}: phrase glyphs should have a visible box`);
    assert.ok(
      box.left >= -1,
      `${selector}: phrase glyphs must not be clipped on the left (${box.left}px)`,
    );
    assert.ok(
      box.right <= page.viewportSize().width + 1,
      `${selector}: phrase glyphs must not be clipped on the right (${box.right}px)`,
    );
  }
  const maxGlyphOverlap = boxes.reduce((max, box, index) => {
    if (index === 0) return max;
    return Math.max(max, boxes[index - 1].bottom - box.top);
  }, 0);
  console.log(
    `${page.viewportSize().width}px ${selector}: ${boxes.length} line(s), glyph vertical overlap ${Math.max(0, maxGlyphOverlap).toFixed(1)}px`,
  );
}

// rx2 rest guard: at any tapping cadence one card at most is up, card starts
// stay at least a card plus its rest apart (950 ms, minus timer jitter), the
// label follows the latest selection, and nothing is left behind.
async function verifyStageCadence(page, profileName) {
  for (const gap of [400, 700, 1000]) {
    await page.waitForTimeout(1200);
    const result = await page.evaluate(async (gap) => {
      const buttons = document.querySelectorAll(".rxs-stage-tabs button");
      const stages = ["standard", "max", "ultra"];
      const starts = [];
      let maxOverlays = 0;
      let labels = [];
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement && node.matches('.rx-call-sequence[data-mode="stage"]')) {
              starts.push(performance.now());
            }
          }
        }
        maxOverlays = Math.max(
          maxOverlays,
          document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
        );
      });
      observer.observe(document.querySelector("main"), { childList: true });
      const order = [2, 0, 1, 2, 0];
      for (const index of order) {
        buttons[index].click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        const overlay = document.querySelector('.rx-call-sequence[data-mode="stage"]');
        labels.push([stages[index], overlay?.dataset.stage ?? null]);
        await new Promise((resolve) => setTimeout(resolve, gap - 30));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      observer.disconnect();
      return {
        starts: starts.map((time, index) => (index ? Math.round(time - starts[index - 1]) : 0)),
        maxOverlays,
        labels,
        remaining: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
      };
    }, gap);
    console.log(`${profileName} stage-cadence ${gap}ms`, JSON.stringify(result));
    assert.ok(result.starts.length >= 1, `${profileName} ${gap}ms: a card still plays`);
    assert.ok(result.maxOverlays <= 1, `${profileName} ${gap}ms: one card at most`);
    for (const spacing of result.starts.slice(1)) {
      assert.ok(spacing >= 900, `${profileName} ${gap}ms: card starts ${result.starts.join(", ")}`);
    }
    for (const [selected, shown] of result.labels) {
      if (shown) assert.equal(shown, selected, `${profileName} ${gap}ms: the card names the latest form`);
    }
    assert.equal(result.remaining, 0, `${profileName} ${gap}ms: no card left behind`);
  }
  await page.waitForTimeout(500);
}

async function verifyProfile(profile) {
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE_URL}/world`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
  await installCallRecorder(page);
  const touch = Boolean(profile.hasTouch);
  const menu = page.locator(".side-panel-trigger").first();
  if (touch) await menu.tap();
  else await menu.click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
  if (touch) await link.tap();
  else await link.click();
  await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
  const entryCall = (call, index) => {
    const finalClass = index === 4 ? ".rx-call-final" : "";
    return `.rx-call-sequence[data-mode="entry"] .rx-call-beat[data-call="${call}"]${finalClass}`;
  };
  await waitForVisibleCall(page, entryCall("FAR UP！", 0), 1);
  if (["desktop", "phone-390"].includes(profile.name)) {
    await page.screenshot({ path: `/tmp/rexonance-entry-${profile.name}-first.png` });
  }
  await waitForVisibleCall(
    page,
    '.rx-call-sequence[data-mode="entry"] .rx-call-chant[data-call="SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！"]',
    4,
  );
  if (["desktop", "phone-390"].includes(profile.name)) {
    await page.screenshot({ path: `/tmp/rexonance-entry-${profile.name}-chant.png` });
  }
  await waitForVisibleCall(
    page,
    '.rx-call-sequence[data-mode="entry"] .rx-call-repetition[data-call="REXONANCE！REXONANCE！REXONANCE！REXONANCE！"]',
    4,
  );
  await waitForVisibleCall(page, entryCall("REXONANCE DEUS！", 4), 2);
  if (["desktop", "phone-390"].includes(profile.name)) {
    await page.screenshot({ path: `/tmp/rexonance-entry-${profile.name}-final.png` });
  }
  await page.waitForURL("**/rexonance-saga**", { timeout: 20000 });
  await page.waitForFunction(
    () => !document.querySelector('.rx-call-sequence[data-mode="entry"]'),
    null,
    { timeout: 6000 },
  );
  await page.waitForFunction(() => window.__rexonanceEntryFinishedAt !== null);
  assert.deepEqual(
    await page.evaluate(() => window.__rexonanceEntryCalls),
    calls,
    `${profile.name}: five canonical calls must appear once and in order`,
  );
  assert.equal(
    await page.evaluate(() => window.__rexonanceCallMaxRoots),
    1,
    `${profile.name}: entry must use one overlay`,
  );
  const entryDuration = await page.evaluate(
    () => window.__rexonanceEntryFinishedAt - window.__rexonanceEntryStartedAt,
  );
  console.log(
    `${profile.name} entry-timeline`,
    JSON.stringify(await page.evaluate(() => ({
      phases: window.__rexonanceEntryPhases,
      start: window.__rexonanceEntryStartedAt,
      finished: window.__rexonanceEntryFinishedAt,
      routeCover: document.documentElement.getAttribute("data-route-cover"),
    }))),
  );
  assert.ok(
    entryDuration < 3200,
    `${profile.name}: route entry and call sequence must hand off promptly (${entryDuration.toFixed(0)} ms)`,
  );
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${profile.name}: no horizontal overflow during entry`,
  );

  const tabs = page.locator(".rxs-stage-tabs button");
  await tabs.first().waitFor();
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-cover"),
    null,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => {
      const button = document.querySelector(".zeus-button");
      return button && getComputedStyle(button).visibility === "visible";
    },
    null,
    { timeout: 3000 },
  );
  await page.evaluate(() => {
    const rail = document.querySelector(".rxs-stage-tabs");
    const click = (index) => rail.querySelectorAll("button")[index].click();
    click(1);
    click(2);
    click(1);
    rail.dispatchEvent(new CustomEvent("railselect", { detail: { index: 2 } }));
  });
  await page.waitForFunction(
    () => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "ultra",
  );
  await page.waitForFunction(
    () => document.querySelector('.rx-call-sequence[data-mode="stage"]')?.dataset.stage === "ultra",
    null,
    { timeout: 1000 },
  );
  const stageOverlay = page.locator('.rx-call-sequence[data-mode="stage"]');
  assert.equal(await stageOverlay.getAttribute("aria-hidden"), "true");
  assert.equal(await stageOverlay.getAttribute("data-stage"), "ultra");
  assert.equal(await page.locator('.rx-call-sequence[data-mode="stage"]').count(), 1);
  assert.match(await stageOverlay.textContent(), /REXONANCE[\s\S]*DEUS！[\s\S]*ULTRA/);
  assert.equal(await stageOverlay.evaluate((root) => getComputedStyle(root).pointerEvents), "none");
  assert.equal(
    await page
      .locator(".zeus-button")
      .first()
      .evaluate((button) => getComputedStyle(button).visibility),
    "hidden",
    "the floating button must not paint above the stage call",
  );
  await page.evaluate(() => {
    window.__rexonanceStageRoot = document.querySelector('.rx-call-sequence[data-mode="stage"]');
  });
  await page.waitForTimeout(250);
  await tabs.nth(2).evaluate((button) => button.click());
  await page.waitForFunction(
    () => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "ultra",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('.rx-call-sequence[data-mode="stage"]') ===
        window.__rexonanceStageRoot,
    ),
    true,
    "same-stage taps must not replace or restart the burst",
  );
  await stageOverlay.waitFor({ state: "detached", timeout: 1000 });
  const detachDiagnostic = await page.evaluate(() => ({
    routeCover: document.documentElement.getAttribute("data-route-cover"),
    overlayCount: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
    stageHasMatches: document.querySelectorAll("html body:has(.rx-call-sequence[data-mode='stage'])").length,
    zeusVisibility: getComputedStyle(document.querySelector(".zeus-button")).visibility,
    rootAttributes: Array.from(document.documentElement.attributes, ({ name, value }) => [name, value]),
  }));
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector(".zeus-button")).visibility === "visible",
    null,
    { timeout: 250 },
  );
  const zeusRelease = await page.evaluate(() => ({
    routeCover: document.documentElement.getAttribute("data-route-cover"),
    overlayCount: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
    stageHasMatches: document.querySelectorAll("html body:has(.rx-call-sequence[data-mode='stage'])").length,
    visibility: getComputedStyle(document.querySelector(".zeus-button")).visibility,
  }));
  console.log(`${profile.name} stage-zeus-release`, JSON.stringify({ detachDiagnostic, zeusRelease }));
  assert.equal(
    zeusRelease.visibility,
    "visible",
    "the floating button returns after its existing visibility transition resolves",
  );
  assert.equal(zeusRelease.routeCover, null, "stage cleanup does not leave a route cover behind");
  assert.equal(zeusRelease.stageHasMatches, 0, "no stage-call :has selector remains after unmount");
  await page.locator(".rxs-stage-panel").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const panel = document.querySelector(".rxs-stage-switcher");
    const image = panel?.querySelector(".rxs-stage-panel img");
    return (
      panel?.classList.contains("is-visible") &&
      Number(getComputedStyle(panel).opacity) > 0.98 &&
      image?.complete &&
      image.naturalWidth > 0
    );
  });
  await page.screenshot({ path: `/tmp/rexonance-stage-polish-${profile.name}.png` });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await tabs.nth(1).evaluate((button) => button.click());
  await page.waitForFunction(
    () => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "max",
  );
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('.rx-call-sequence[data-mode="stage"]');
      return !overlay || overlay.dataset.tier === "reduced";
    },
    null,
    { timeout: 500 },
  );
  await page
    .locator('.rx-call-sequence[data-mode="stage"]')
    .waitFor({ state: "detached", timeout: 500 });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.evaluate(() => {
    document.documentElement.dataset.worldEffects = "economy";
    document.querySelectorAll(".rxs-stage-tabs button")[2].click();
  });
  await page.waitForFunction(
    () => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "ultra",
  );
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('.rx-call-sequence[data-mode="stage"]');
      return !overlay || overlay.dataset.tier === "calm";
    },
    null,
    { timeout: 500 },
  );
  await page
    .locator('.rx-call-sequence[data-mode="stage"]')
    .waitFor({ state: "detached", timeout: 500 });
  await page.evaluate(() => delete document.documentElement.dataset.worldEffects);

  await tabs.nth(1).evaluate((button) => button.click());
  await page.locator('.rx-call-sequence[data-mode="stage"]').waitFor({ timeout: 1000 });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page
    .locator('.rx-call-sequence[data-mode="stage"]')
    .waitFor({ state: "detached", timeout: 500 });
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await verifyStageCadence(page, profile.name);

  await tabs.nth(2).evaluate((button) => button.click());
  await page.locator('.rx-call-sequence[data-mode="stage"]').waitFor({ timeout: 1000 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/world", { timeout: 10000 });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".rx-call-sequence") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout: 3000 },
  );

  if (profile.name === "desktop") {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const backEntryPage = await context.newPage();
    await backEntryPage.goto(`${BASE_URL}/form-archive`, { waitUntil: "networkidle" });
    await backEntryPage.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".load-gate"),
      null,
      { timeout: 20000 },
    );
    await backEntryPage.locator(".side-panel-trigger").first().click();
    const worldLink = backEntryPage.locator('#site-side-panel a[href="/world#top"]').first();
    await worldLink.waitFor({ state: "visible" });
    await worldLink.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await worldLink.click();
    await backEntryPage.waitForURL("**/world**", { timeout: 20000 });
    await backEntryPage.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".load-gate"),
      null,
      { timeout: 20000 },
    );
    await backEntryPage.locator(".side-panel-trigger").first().click();
    const cancelLink = backEntryPage
      .locator('#site-side-panel a[href="/rexonance-saga#top"]')
      .first();
    await cancelLink.waitFor({ state: "visible" });
    await cancelLink.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await cancelLink.click();
    await backEntryPage.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
    await waitForVisibleCall(
      backEntryPage,
      '.rx-call-sequence[data-mode="entry"] .rx-call-beat[data-call="FAR UP！"]',
      1,
    );
    await backEntryPage.goBack({ waitUntil: "domcontentloaded" });
    await backEntryPage.waitForURL("**/form-archive", { timeout: 10000 });
    await backEntryPage.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".rx-call-sequence") &&
        !document.documentElement.hasAttribute("data-route-scroll-settling"),
      null,
      { timeout: 3000 },
    );
    await backEntryPage.close();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".side-panel-trigger").first().click();
    const reducedLink = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
    await reducedLink.waitFor({ state: "visible" });
    await reducedLink.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const reducedEntryStartedAt = Date.now();
    await reducedLink.click();
    await page.waitForURL("**/rexonance-saga**", { timeout: 10000 });
    await page.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".load-gate"),
      null,
      { timeout: 2000 },
    );
    assert.ok(
      Date.now() - reducedEntryStartedAt < 1600,
      "reduced-motion route entry should skip the dramatic entry delay",
    );
    assert.equal(
      await page.locator('.rx-call-sequence[data-mode="entry"][data-tier="full"]').count(),
      0,
      "reduced-motion entry must not play the full call sequence",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const archivePage = await context.newPage();
    const archiveErrors = [];
    archivePage.on("pageerror", (error) => archiveErrors.push(error.message));
    await archivePage.goto(`${BASE_URL}/form-archive`, { waitUntil: "networkidle" });
    await archivePage.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".load-gate"),
      null,
      { timeout: 20000 },
    );
    await installCallRecorder(archivePage);
    await archivePage.locator(".side-panel-trigger").first().click();
    const archiveLink = archivePage
      .locator('#site-side-panel a[href="/rexonance-saga#top"]')
      .first();
    await archiveLink.waitFor({ state: "visible" });
    await archiveLink.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await archiveLink.click();
    await archivePage.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
    await archivePage.waitForURL("**/rexonance-saga**", { timeout: 20000 });
    await archivePage.waitForFunction(
      () => !document.querySelector('.rx-call-sequence[data-mode="entry"]'),
      null,
      { timeout: 6000 },
    );
    assert.deepEqual(await archivePage.evaluate(() => window.__rexonanceEntryCalls), calls);
    assert.deepEqual(
      archiveErrors,
      [],
      "archive-to-Rexonance route entry should have no page errors",
    );
    await archivePage.close();
  }
  assert.deepEqual(errors, [], `${profile.name}: no page errors`);
  console.log(
    `PASS ${profile.name}: entry sequence, latest stage wins, reduced/calm/hidden cancellation, back cleanup`,
  );
  await context.close();
}

try {
  const selectedProfiles = process.env.QA_PROFILE
    ? profiles.filter((profile) => profile.name === process.env.QA_PROFILE)
    : profiles;
  assert.ok(selectedProfiles.length > 0, `unknown QA_PROFILE: ${process.env.QA_PROFILE}`);
  for (const profile of selectedProfiles) await verifyProfile(profile);
} finally {
  await browser.close();
}
