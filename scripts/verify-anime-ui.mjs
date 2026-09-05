import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Run against an already running development or preview server.
// BASE_URL=http://localhost:8080 PW_BROWSER_CHANNEL=chrome npm run verify:ui
const requireFromProject = createRequire(resolve(process.cwd(), "package.json"));
const { chromium } = requireFromProject("playwright");
const baseUrl = process.env.BASE_URL || process.argv[2] || "http://localhost:8080";
const channel = process.env.PW_BROWSER_CHANNEL || process.argv[3] || "chrome";
const viewports = [
  { name: "iPhone", width: 375, height: 667 },
  { name: "iPad landscape", width: 1376, height: 1008 },
];
const results = [];

async function waitForOpen(page, selector, open) {
  await page.waitForFunction(
    ({ selector, open }) => document.querySelector(selector)?.open === open,
    { selector, open },
    { timeout: 5000 },
  );
}

async function assertMenuFocus(page, label) {
  await page.waitForFunction(
    () => document.querySelector(".side-panel")?.contains(document.activeElement),
    null,
    { timeout: 3000 },
  );
  const active = await page.evaluate(() => ({
    className: document.activeElement?.className,
    inside: document.querySelector(".side-panel")?.contains(document.activeElement),
  }));
  assert.equal(active.inside, true, `${label}: focus escaped to ${active.className}`);
  return active.className;
}

async function checkMenu(page) {
  const trigger = page.locator(".side-panel-trigger");
  await trigger.tap();
  await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "true");
  const focus = [await assertMenuFocus(page, "pointer opening")];
  for (const key of ["Shift+Tab", "Tab", "Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    focus.push(await assertMenuFocus(page, key));
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "false");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sideMenuOpen), undefined);

  // Keyboard opening must also restore focus when Escape closes the menu.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await assertMenuFocus(page, "keyboard opening");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.matches(".side-panel-trigger"));
  return { focus, escapeRestoredKeyboardFocus: true };
}

async function checkStationaryTaps(page) {
  const button = page.locator(".world-column-slide-open");
  await button.scrollIntoViewIfNeeded();
  // A trial click waits for the reveal animation and layout to become stable.
  await button.click({ trial: true });
  const cdp = await page.context().newCDPSession(page);
  const durations = [];
  try {
    for (const holdMs of [18, 140, 300]) {
      await button.click({ trial: true });
      const thumb = await button.locator(".ios-slide-open-thumb").boundingBox();
      assert.ok(thumb, "The pickup thumb must be visible");
      const point = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
      assert.equal(
        await page.evaluate(
          ({ x, y }) =>
            Boolean(document.elementFromPoint(x, y)?.closest(".world-column-slide-open")),
          point,
        ),
        true,
        "Another element covers the pickup thumb",
      );
      await button.evaluate((element) => {
        element.dataset.testPointerDown = "";
        element.dataset.testPointerUp = "";
        element.addEventListener(
          "pointerdown",
          (event) => {
            element.dataset.testPointerDown = String(event.timeStamp);
          },
          { once: true },
        );
        element.addEventListener(
          "pointerup",
          (event) => {
            element.dataset.testPointerUp = String(event.timeStamp);
          },
          { once: true },
        );
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await page.waitForTimeout(holdMs);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await waitForOpen(page, ".world-column-dialog", true);
      const actualMs = await button.evaluate(
        (element) =>
          Number(element.dataset.testPointerUp) - Number(element.dataset.testPointerDown),
      );
      assert.ok(actualMs >= holdMs - 2, `Touch duration was too short: ${actualMs} ms`);
      durations.push({ requestedMs: holdMs, actualMs: Math.round(actualMs), opened: true });
      await page.keyboard.press("Escape");
      await waitForOpen(page, ".world-column-dialog", false);
    }
  } finally {
    await cdp.detach();
  }
  return durations;
}

async function checkPartialSlide(page, ratio, shouldOpen) {
  const button = page.locator(".world-column-slide-open");
  await button.click({ trial: true });
  const track = await button.boundingBox();
  const thumb = await button.locator(".ios-slide-open-thumb").boundingBox();
  assert.ok(track && thumb);
  const inset = Math.max(0, (track.height - thumb.height) / 2);
  const travel = track.width - thumb.width - inset * 2;
  const start = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await page.waitForTimeout(120);
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + (travel * ratio * step) / 8, y: start.y }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // Wait through the completion animation so cancellation is not a false pass.
    await page.waitForTimeout(700);
    assert.equal(
      await page.locator(".world-column-dialog").evaluate((element) => element.open),
      shouldOpen,
    );
    return {
      holdMs: 120,
      travel: Math.round(travel),
      movedPercent: ratio * 100,
      opened: shouldOpen,
    };
  } finally {
    await cdp.detach();
  }
}

async function checkDreamLayout(page) {
  await page.goto(new URL("/dream-chapter", baseUrl).href, { waitUntil: "domcontentloaded" });
  const stage = page.locator(".dream-poster-stage");
  await stage.scrollIntoViewIfNeeded();
  const layout = await stage.evaluate((element) => {
    const stageRect = element.getBoundingClientRect();
    const posterRect = element.querySelector(".dream-poster-current").getBoundingClientRect();
    return {
      width: innerWidth,
      stageWidth: stageRect.width,
      posterWidth: posterRect.width,
      columns: getComputedStyle(element).gridTemplateColumns,
    };
  });
  if (layout.width <= 1180) {
    assert.ok(
      Math.abs(layout.stageWidth - layout.posterWidth) < 2,
      `Empty poster column: ${JSON.stringify(layout)}`,
    );
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    const preference = await page.locator(".dream-site-header").evaluate((element) => ({
      matches: matchMedia("(prefers-reduced-transparency: reduce)").matches,
      blur: getComputedStyle(element).backdropFilter,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.equal(
      preference.matches,
      true,
      "Browser must support the emulated transparency preference",
    );
    assert.equal(preference.blur, "none");
    assert.equal(preference.background, "rgb(19, 12, 23)");
    return { ...layout, preference };
  } finally {
    await cdp.detach();
  }
}

async function checkEpisodeClose(page) {
  await page.locator(".episode-pickup-plus").nth(1).tap();
  await waitForOpen(page, ".episode-pickup-dialog", true);
  const panel = page.locator(".episode-pickup-panel");
  const close = page.locator(".episode-pickup-close");
  await close.click({ trial: true });
  // Resolve image dimensions before measuring the available scroll distance.
  await panel.evaluate(async (element) => {
    await Promise.all(
      [...element.querySelectorAll("img")].map((image) => image.decode().catch(() => {})),
    );
  });
  const before = await close.boundingBox();
  assert.ok(before);
  const availableScroll = await panel.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  await panel.hover();
  await page.mouse.wheel(0, 1500);
  if (availableScroll > 0) {
    await page.waitForFunction(
      () => document.querySelector(".episode-pickup-panel")?.scrollTop > 0,
    );
  }
  const state = await close.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollTop: document.querySelector(".episode-pickup-panel").scrollTop,
      covered: !element.contains(hit),
    };
  });
  assert.ok(
    state.x >= 0 &&
      state.y >= 0 &&
      state.right <= state.viewportWidth &&
      state.bottom <= state.viewportHeight,
    `Close button escaped the viewport: ${JSON.stringify(state)}`,
  );
  assert.ok(
    Math.abs(state.y - before.y) < 2,
    `Close button moved with the scroller: ${before.y} -> ${state.y}`,
  );
  assert.equal(state.covered, false, "Close button is covered or clipped");
  await close.tap();
  await waitForOpen(page, ".episode-pickup-dialog", false);
  return { availableScroll, ...state, closedByTap: true };
}

const browser = await chromium.launch({
  headless: true,
  ...(channel === "bundled" ? {} : { channel }),
});
try {
  for (const viewport of viewports) {
    for (const [name, check] of [
      ["menu focus and Escape", checkMenu],
      ["stationary 18/140/300 ms touch", checkStationaryTaps],
      ["55% hold and slide opens", (page) => checkPartialSlide(page, 0.55, true)],
      ["20% hold and slide cancels", (page) => checkPartialSlide(page, 0.2, false)],
      ["episode close after scroll", checkEpisodeClose],
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      try {
        await page.goto(new URL("/world", baseUrl).href, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.locator(".side-panel-trigger").waitFor({ state: "visible" });
        // Allow hydration and startup effects to bind the controls before input.
        await page.waitForTimeout(1200);
        const details = await check(page);
        results.push({
          viewport: viewport.name,
          size: `${viewport.width}x${viewport.height}`,
          test: name,
          status: "PASS",
          details,
        });
        console.log(JSON.stringify(results.at(-1)));
      } catch (error) {
        results.push({ viewport: viewport.name, test: name, status: "FAIL", error: error.message });
        console.error(JSON.stringify(results.at(-1)));
      } finally {
        await context.close();
      }
    }
  }
  for (const viewport of [
    ...viewports,
    { name: "iPad compact landscape", width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
    });
    try {
      const details = await checkDreamLayout(page);
      results.push({
        viewport: viewport.name,
        test: "Dream poster and reduced transparency",
        status: "PASS",
        details,
      });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      results.push({
        viewport: viewport.name,
        test: "Dream poster and reduced transparency",
        status: "FAIL",
        error: error.message,
      });
      console.error(JSON.stringify(results.at(-1)));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
const failures = results.filter((result) => result.status === "FAIL");
console.log(
  `${results.length - failures.length}/${results.length} interaction checks passed (${baseUrl}, ${channel})`,
);
if (failures.length) process.exitCode = 1;
