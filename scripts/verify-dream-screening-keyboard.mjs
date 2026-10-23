import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:4264");
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const baseline = process.env.SCREENING_BASELINE === "1";
const output = process.env.AUDIT_OUT || `output/playwright/dream-screening-keyboard-${engineName}`;
const sizes = [
  [320, 640],
  [390, 844],
  [390, 320],
  [768, 1024],
  [1440, 900],
];
const selectedSizes = process.env.PW_VIEWPORTS
  ? sizes.filter(([width, height]) =>
      process.env.PW_VIEWPORTS.split(",").includes(`${width}x${height}`),
    )
  : sizes;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : undefined);
const report = [];
await mkdir(output, { recursive: true });

const sample = (page) =>
  page.locator(".dream-screening-picture").evaluate((node) => ({
    focus: document.activeElement?.className,
    tabindex: node.getAttribute("tabindex"),
    left: node.scrollLeft,
    top: node.scrollTop,
    maxLeft: node.scrollWidth - node.clientWidth,
    maxTop: node.scrollHeight - node.clientHeight,
    height: node.clientHeight,
    pageY: window.scrollY,
    bodyTop: document.body.style.top,
    zoomed: node.classList.contains("is-zoomed"),
  }));

async function verifyTabCycle(page, room, expectedCount, label) {
  await page.locator(".dream-screening-close").focus();
  const original = await sample(page);
  const visited = [];
  for (let index = 0; index < expectedCount; index += 1) {
    await page.keyboard.press("Tab");
    const active = await room.evaluate((node) => {
      const target = document.activeElement;
      const strip = node.querySelector(".dream-screening-filmstrip");
      const bounds = target.getBoundingClientRect();
      const stripBounds = strip.getBoundingClientRect();
      return {
        inside: node.contains(target),
        button: target.tagName === "BUTTON",
        disabled: target.disabled,
        key: target.getAttribute("aria-label") || target.className,
        thumbnailVisible:
          !strip.contains(target) ||
          (bounds.left >= stripBounds.left - 1 && bounds.right <= stripBounds.right + 1),
      };
    });
    assert.equal(active.inside, true, `${label}: Tab ${index + 1} stays in the room`);
    assert.equal(active.button, true, `${label}: Tab reaches a control`);
    assert.equal(active.disabled, false, `${label}: disabled controls are skipped`);
    assert.equal(active.thumbnailVisible, true, `${label}: focused thumbnail is visible`);
    visited.push(active.key);
  }
  assert.equal(
    new Set(visited).size,
    expectedCount,
    `${label}: every enabled control is reachable`,
  );
  assert.equal(
    await page
      .locator(".dream-screening-close")
      .evaluate((node) => document.activeElement === node),
    true,
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page
      .locator(".dream-screening-filmstrip [data-poster-index='14']")
      .evaluate((node) => document.activeElement === node),
    true,
    `${label}: Shift+Tab wraps to the last thumbnail`,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".dream-screening-close")
      .evaluate((node) => document.activeElement === node),
    true,
    `${label}: Tab wraps to close`,
  );
  const final = await sample(page);
  assert.equal(final.pageY, original.pageY, `${label}: Tab preserves the page offset`);
  assert.equal(final.bodyTop, original.bodyTop, `${label}: Tab preserves the locked body`);
  return visited;
}

try {
  for (const [width, height] of baseline ? [[1440, 900]] : selectedSizes) {
    const label = `${width}x${height}`;
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: process.env.PW_MOTION === "full" ? "no-preference" : "reduce",
    });
    if (process.env.PW_ECONOMY === "1") {
      await context.addInitScript(() =>
        Object.defineProperty(navigator, "connection", {
          value: { saveData: true },
          configurable: true,
        }),
      );
    }
    const page = await context.newPage();
    let releaseInitialImage;
    if (!baseline && width === 320) {
      const gate = new Promise((resolve) => {
        releaseInitialImage = resolve;
      });
      await page.route("**/dream-chapter-poster-01-delivery.webp", async (route) => {
        await gate;
        await route.continue();
      });
    }
    const errors = [];
    const imageRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("dream-chapter-poster-"))
        imageRequests.push({ url: response.url(), status: response.status() });
    });
    page.on("requestfailed", (request) => {
      if (request.url().includes("dream-chapter-poster-"))
        imageRequests.push({ url: request.url(), error: request.failure()?.errorText });
    });
    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const trigger = document.querySelector(".dream-screening-trigger");
      return (
        document.documentElement.dataset.dreamChapter === "true" &&
        trigger &&
        Object.keys(trigger).some((key) => key.startsWith("__reactProps"))
      );
    });
    const trigger = page.locator(".dream-screening-trigger");
    await trigger.scrollIntoViewIfNeeded();
    // Match the established screening audit's geometry boundary: deferred
    // programme CSS and Japanese fonts above the trigger must have settled.
    await page.waitForFunction(() => {
      const programmeCss = document.querySelector('link[href*="styles-dream-programme"]');
      return (
        Boolean(programmeCss?.sheet) &&
        document.fonts.status === "loaded" &&
        !document.documentElement.hasAttribute("data-loading") &&
        !document.querySelector(".load-gate")
      );
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      const trigger = document.querySelector(".dream-screening-trigger");
      let previous;
      let stable = 0;
      for (let frame = 0; frame < 120; frame += 1) {
        await new Promise(requestAnimationFrame);
        const bounds = trigger.getBoundingClientRect();
        const current = [bounds.top + scrollY, scrollY, bounds.width, bounds.height];
        stable =
          previous && current.every((value, index) => Math.abs(value - previous[index]) < 0.5)
            ? stable + 1
            : 0;
        if (stable >= 6) return;
        previous = current;
      }
      throw new Error("screening trigger layout did not settle");
    });
    await trigger.click();
    const room = page.locator(".dream-screening-dialog[open]");
    try {
      await room.waitFor({ state: "visible" });
    } catch (error) {
      await page.screenshot({ path: `${output}/${label}-open-failure.png` });
      await writeFile(
        `${output}/${label}-open-failure.json`,
        JSON.stringify(
          {
            trigger: await trigger.evaluate((node) => node.outerHTML),
            loadError: await page.locator(".dream-screening-load-error").allTextContents(),
            imageRequests,
            errors,
            state: await page.evaluate(() => ({
              root: { ...document.documentElement.dataset },
              active: document.activeElement?.className,
              scrollY: window.scrollY,
              bodyTop: document.body.style.top,
            })),
          },
          null,
          2,
        ),
      );
      throw error;
    }
    const zoom = page.locator(".dream-screening-zoom");
    let loadingFocus;
    if (releaseInitialImage) {
      assert.equal(await zoom.isEnabled(), false, `${label}: zoom waits for the decoded image`);
      loadingFocus = await verifyTabCycle(page, room, 19, `${label} loading`);
      releaseInitialImage();
    }
    await page.locator(".dream-screening-picture img").waitFor({ state: "visible" });
    let fullFocus;
    if (!baseline) {
      fullFocus = await verifyTabCycle(page, room, 20, label);
      await page.locator(".dream-screening-close").focus();
      await page.keyboard.press("z");
      await page.keyboard.press("z");
      assert.equal(
        await page
          .locator(".dream-screening-close")
          .evaluate((node) => document.activeElement === node),
        true,
        `${label}: a Z round trip restores the close control`,
      );
      if (process.env.PW_ECONOMY === "1") {
        assert.equal(await page.locator("html").getAttribute("data-world-effects"), "economy");
      }
    }
    const full = await sample(page);
    await zoom.focus();
    await page.keyboard.press("z");
    await page.waitForFunction(() => document.querySelector(".dream-screening-picture.is-zoomed"));
    const before = await sample(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    // Native scroll may animate on the old implementation; wait for its frames.
    if (baseline) await page.waitForTimeout(250);
    const after = await sample(page);
    if (baseline) {
      report.push({ label, before, after });
      await page.screenshot({ path: `${output}/${label}-baseline.png` });
      await context.close();
      continue;
    }
    const result = { label, before, after, fullFocus, loadingFocus, passed: false };
    report.push(result);
    assert.match(before.focus, /dream-screening-picture/, `${label}: zoom takes focus`);
    assert.equal(before.tabindex, "0", `${label}: zoom is keyboard reachable`);
    assert.ok(
      Math.abs(before.left - before.maxLeft / 2) <= 1,
      `${label}: zoom starts at the horizontal image centre`,
    );
    assert.ok(
      Math.abs(before.top - before.maxTop / 2) <= 1,
      `${label}: zoom starts at the vertical image centre`,
    );
    assert.ok(before.maxTop > 0, `${label}: test image overflows vertically`);
    assert.equal(
      before.height,
      full.height,
      `${label}: zoom guidance preserves the image viewport height`,
    );
    if (before.maxLeft > 0)
      assert.ok(after.left > before.left, `${label}: arrows pan horizontally`);
    assert.ok(after.top > before.top, `${label}: arrows pan vertically`);
    assert.equal(after.pageY, before.pageY, `${label}: panning preserves the page offset`);
    assert.equal(after.bodyTop, before.bodyTop, `${label}: panning preserves the locked body`);
    assert.equal(
      await page
        .locator(".dream-screening-filmstrip [aria-current=true]")
        .getAttribute("data-poster-index"),
      "0",
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    const reversed = await sample(page);
    assert.equal(reversed.left, before.left, `${label}: left reverses the horizontal pan`);
    assert.equal(reversed.top, before.top, `${label}: up reverses the vertical pan`);
    if (width === 320) {
      for (let step = 0; step < 20; step += 1) {
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowUp");
      }
      const edge = await sample(page);
      assert.equal(edge.left, 0, `${label}: left clamps at the image edge`);
      assert.equal(edge.top, 0, `${label}: up clamps at the image edge`);
      assert.equal(edge.pageY, before.pageY, `${label}: edge panning preserves the page offset`);
      assert.equal(
        edge.bodyTop,
        before.bodyTop,
        `${label}: edge panning preserves the locked body`,
      );
    }
    await page.keyboard.press("Tab");
    result.afterTab = await sample(page);
    assert.equal(
      await room.evaluate((node) => node.contains(document.activeElement)),
      true,
      `${label}: Tab stays inside the viewing room`,
    );
    assert.doesNotMatch(
      (await sample(page)).focus,
      /dream-screening-picture/,
      `${label}: Tab reaches the next control`,
    );
    await page.keyboard.press("Shift+Tab");
    assert.match(
      (await sample(page)).focus,
      /dream-screening-picture/,
      `${label}: Shift+Tab returns to the image`,
    );
    // Repeated Z keydown must not oscillate between full and zoomed views.
    await page.keyboard.down("z");
    await page.keyboard.down("z");
    await page.keyboard.up("z");
    assert.equal((await sample(page)).zoomed, false, `${label}: held Z toggles once`);
    assert.equal(
      await zoom.evaluate((node) => document.activeElement === node),
      true,
      `${label}: Z restores its invoking control`,
    );
    await page.keyboard.press("z");
    const reopened = await sample(page);
    assert.ok(
      Math.abs(reopened.left - reopened.maxLeft / 2) <= 1,
      `${label}: reopening zoom centres horizontally`,
    );
    assert.ok(
      Math.abs(reopened.top - reopened.maxTop / 2) <= 1,
      `${label}: reopening zoom centres vertically`,
    );
    await page.screenshot({ path: `${output}/${label}-zoom.png` });
    // A poster selection exits zoom with a useful focus destination.
    await page.locator(".dream-screening-filmstrip [data-poster-index='1']").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".dream-screening-filmstrip [data-poster-index='1']")
          ?.getAttribute("aria-current") === "true",
    );
    assert.equal((await sample(page)).zoomed, false);
    const switched = await sample(page);
    assert.doesNotMatch(
      switched.focus,
      /dream-screening-picture/,
      `${label}: selection leaves focus on an available control`,
    );
    assert.equal(switched.left, 0);
    assert.equal(switched.top, 0);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".dream-screening-filmstrip [data-poster-index='2']")
          ?.getAttribute("aria-current") === "true",
    );
    await page.keyboard.press("Escape");
    await room.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.matches(".dream-screening-trigger"));
    assert.deepEqual(errors, [], `${label}: browser errors`);
    result.passed = true;
    await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ engine: engineName, baseline, report }, null, 2));
