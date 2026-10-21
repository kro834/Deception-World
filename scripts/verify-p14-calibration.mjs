import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8594";
const out = process.env.AUDIT_OUT || "output/playwright/cinema-polish-p14-20261021";
await mkdir(out, { recursive: true });

async function ready(page) {
  await page.goto(`${base}/rexonance-saga#p14`, { waitUntil: "networkidle" });
  await page.locator(".rxs-p14-comparator").waitFor();
  await page.locator(".rxs-p14-range-control").scrollIntoViewIfNeeded();
  await page.waitForTimeout(650);
}

async function settleP14Metrics(page, label, { allowStatic = false } = {}) {
  const expectedP2 = ["650%", "500%", "12.0%", "11.1%", "14.3%", "約22.2%", "約13.3%", "122.7%", "121.5%"];
  await page.waitForFunction(() => document.querySelectorAll(".rxs-p14-values strong[data-rsn-count]").length === 9);
  const initialFigures = await page.locator(".rxs-p14-values strong[data-rsn-count]").evaluateAll((figures) =>
    figures.map((figure) => ({
      value: [...figure.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent.trim(),
      state: figure.dataset.rsnState ?? "idle",
      counterVisibility: getComputedStyle(figure.querySelector(".rsn-count")).visibility,
    })),
  );
  if (
    allowStatic &&
    initialFigures.every((figure, index) =>
      figure.value === expectedP2[index] && figure.state === "idle" && figure.counterVisibility === "hidden",
    )
  ) {
    await page.evaluate(() => {
      const rail = document.querySelector(".rxs-p14-range-control");
      window.scrollTo({
        top: window.scrollY + rail.getBoundingClientRect().top - innerHeight * 0.2,
        behavior: "instant",
      });
    });
    return initialFigures;
  }
  for (let index = 0; index < expectedP2.length; index += 1) {
    await page.evaluate((figureIndex) => {
      const figure = document.querySelectorAll(".rxs-p14-values strong[data-rsn-count]")[figureIndex];
      window.scrollTo({
        top: window.scrollY + figure.getBoundingClientRect().top - innerHeight * 0.4,
        behavior: "instant",
      });
    }, index);
    await page.waitForFunction(
      (figureIndex) => {
        const figure = document.querySelectorAll(".rxs-p14-values strong[data-rsn-count]")[figureIndex];
        return figure?.dataset.rsnState === "done";
      },
      index,
      { timeout: 6000 },
    ).catch(async (error) => {
      const state = await page.evaluate((figureIndex) => {
        const figure = document.querySelectorAll(".rxs-p14-values strong[data-rsn-count]")[figureIndex];
        return {
          state: figure?.dataset.rsnState ?? "idle",
          value: [...(figure?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent,
          hidden: document.hidden,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          viewport: figure?.getBoundingClientRect().toJSON(),
        };
      }, index);
      throw new Error(`${label}: ${error.message}; P14 counter state ${JSON.stringify(state)}`);
    });
  }
  await page.evaluate(() => {
    const rail = document.querySelector(".rxs-p14-range-control");
    window.scrollTo({
      top: window.scrollY + rail.getBoundingClientRect().top - innerHeight * 0.2,
      behavior: "instant",
    });
  });
  await page.waitForFunction(() => {
    const figures = [...document.querySelectorAll(".rxs-p14-values strong[data-rsn-count]")];
    return (
      figures.length === 9 &&
      figures.every(
        (figure) => figure.dataset.rsnState === "done" && !figure.parentElement.hasAttribute("data-rsn-hit"),
      )
    );
  });
  const settledValues = await page.locator(".rxs-p14-values strong[data-rsn-count]").evaluateAll((figures) =>
    figures.map((figure) => ({
      value: [...figure.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent.trim(),
      state: figure.dataset.rsnState,
      counterVisibility: getComputedStyle(figure.querySelector(".rsn-count")).visibility,
    })),
  );
  assert.deepEqual(settledValues.map((figure) => figure.value), expectedP2, `${label}: wait for final P2 values`);
  assert.ok(settledValues.every((figure) => figure.state === "done" && figure.counterVisibility === "hidden"));
  return settledValues;
}

async function inspectRange(page, suffix) {
  const slider = page.getByLabel("P14の比較対象", { exact: true });
  assert.equal(await slider.count(), 1, `${suffix}: custom range should be present`);
  await slider.focus();
  await page.keyboard.press("End");
  assert.equal(await slider.inputValue(), "2", `${suffix}: End should select P2`);
  assert.equal(await page.locator(".rxs-p14-metrics").getAttribute("data-baseline"), "p2");
  await page.keyboard.press("Home");
  assert.equal(await slider.inputValue(), "1", `${suffix}: Home should select P1`);
  await page.getByRole("button", { name: "P2比", exact: true }).click();
  assert.equal(await slider.inputValue(), "2", `${suffix}: P2 endpoint button should select P2`);
  await page.getByRole("button", { name: "P1比", exact: true }).click();
  assert.equal(await slider.inputValue(), "1", `${suffix}: P1 endpoint button should select P1`);
  const sliderBox = await page.locator(".rxs-p14-ios-slider").boundingBox();
  await slider.click({ position: { x: 2, y: sliderBox.height / 2 } });
  assert.equal(await slider.inputValue(), "1", `${suffix}: left endpoint click should select P1`);
  await slider.click({ position: { x: sliderBox.width - 2, y: sliderBox.height / 2 } });
  assert.equal(await slider.inputValue(), "2", `${suffix}: right endpoint click should select P2`);
  await page.waitForTimeout(280);

  const alignment = await page.locator(".rxs-p14-ios-slider").evaluate((rail) => {
    const box = (selector) => rail.querySelector(selector).getBoundingClientRect();
    const thumb = box(".rxs-p14-ios-thumb");
    const p2 = box(".rxs-p14-core-anchor-p2");
    const track = box(".rxs-p14-ios-track");
    return {
      thumbP2CenterDelta: Math.abs(thumb.left + thumb.width / 2 - (p2.left + p2.width / 2)),
      p2Inset: Math.abs(rail.getBoundingClientRect().right - 23 - (p2.left + p2.width / 2)),
      trackEndpointDelta: Math.abs(track.right - (p2.left + p2.width / 2)),
      value: rail.dataset.value,
      thumbCssLeft: getComputedStyle(rail.querySelector(".rxs-p14-ios-thumb")).left,
    };
  });
  assert.ok(alignment.thumbP2CenterDelta < 1.5, `${suffix}: thumb should seat on P2 (${JSON.stringify(alignment)})`);
  assert.ok(alignment.p2Inset < 1.5, `${suffix}: P2 socket should align to rail inset (${JSON.stringify(alignment)})`);
  assert.ok(alignment.trackEndpointDelta < 1.5, `${suffix}: neutral bridge should terminate at P2 socket (${JSON.stringify(alignment)})`);
  assert.equal(alignment.value, "p2");

  const cascade = await page.locator(".rxs-p14-ios-slider").evaluate((rail) => {
    const shell = getComputedStyle(rail);
    const thumb = getComputedStyle(rail.querySelector(".rxs-p14-ios-thumb"));
    return { shellBackground: shell.backgroundImage, shellShadow: shell.boxShadow, thumbBackground: thumb.backgroundImage, thumbShadow: thumb.boxShadow };
  });
  assert.match(cascade.shellBackground, /radial-gradient/);
  assert.match(cascade.shellBackground, /linear-gradient/);
  assert.match(cascade.thumbBackground, /radial-gradient/);
  assert.notEqual(cascade.shellShadow, "none");
  assert.notEqual(cascade.thumbShadow, "none");
  const settledValues = await settleP14Metrics(page, suffix);
  await page.screenshot({ path: `${out}/${suffix}.png` });
  const economyShadows = await page.locator(".rxs-p14-ios-slider").evaluate((rail) => {
    document.documentElement.dataset.worldEffects = "economy";
    return {
      shell: getComputedStyle(rail).boxShadow,
      thumb: getComputedStyle(rail.querySelector(".rxs-p14-ios-thumb")).boxShadow,
      anchors: [...rail.querySelectorAll(".rxs-p14-core-anchor")].map((anchor) => getComputedStyle(anchor).boxShadow),
    };
  });
  assert.equal(economyShadows.shell, "none");
  assert.equal(economyShadows.thumb, "none");
  assert.ok(economyShadows.anchors.every((shadow) => shadow === "none"));
  return { alignment, settledValues, economyShadows };
}

const desktopBrowser = await chromium.launch({ channel: "chrome" });
try {
  for (const profile of [
    { name: "desktop-1024-landscape", viewport: { width: 1024, height: 768 }, hasTouch: false },
    { name: "phone-320", viewport: { width: 320, height: 780 }, hasTouch: true, isMobile: true },
  ]) {
    const context = await desktopBrowser.newContext(profile);
    const page = await context.newPage();
    await ready(page);
    const result = await inspectRange(page, profile.name);
    if (profile.hasTouch) {
      await page.locator(".rxs-p14-ios-slider").scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => scrollY);
      const box = await page.locator(".rxs-p14-ios-slider").boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 8; step += 1) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - step * 18 }],
        });
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => scrollY);
      assert.ok(after > before + 30, `vertical gesture over slider should scroll page (${before} -> ${after})`);
      result.verticalScroll = { before, after };
      await page.screenshot({ path: `${out}/phone-320-scroll.png` });
    }
    console.log(`PASS chromium/${profile.name} ${JSON.stringify(result)}`);
    await context.close();
  }

  const forcedContext = await desktopBrowser.newContext({
    viewport: { width: 1024, height: 768 },
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  const forcedPage = await forcedContext.newPage();
  await ready(forcedPage);
  const forced = await forcedPage.locator(".rxs-p14-ios-slider").evaluate((rail) => {
    const shell = getComputedStyle(rail);
    const thumb = getComputedStyle(rail.querySelector(".rxs-p14-ios-thumb"));
    return {
      shellBackground: shell.backgroundImage,
      shellShadow: shell.boxShadow,
      thumbBackground: thumb.backgroundImage,
      thumbShadow: thumb.boxShadow,
      thumbTransition: thumb.transitionDuration,
    };
  });
  assert.doesNotMatch(forced.shellBackground, /gradient/i);
  assert.equal(forced.shellShadow, "none");
  assert.doesNotMatch(forced.thumbBackground, /gradient/i);
  assert.equal(forced.thumbShadow, "none");
  assert.equal(forced.thumbTransition, "0s");
  await forcedPage.screenshot({ path: `${out}/forced-colors-reduced-motion.png` });
  console.log(`PASS chromium/forced-colors+reduced-motion ${JSON.stringify(forced)}`);
  await forcedContext.close();
} finally {
  await desktopBrowser.close();
}

const ipadBrowser = await webkit.launch();
try {
  const context = await ipadBrowser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await ready(page);
  const select = page.getByLabel("P14の比較基準", { exact: true });
  assert.equal(await select.count(), 1, "WebKit iPad UA should render the native select");
  assert.equal(await page.locator(".rxs-p14-native-rail").getAttribute("data-value"), "p1");
  await select.focus();
  await page.keyboard.press("ArrowDown");
  const keyboardSelection = await select.inputValue();
  assert.equal(await select.evaluate((control) => document.activeElement === control), true);
  // Headless WebKit does not open the native iOS picker for a synthetic arrow;
  // selectOption still exercises the real native-select input/change handlers.
  if (keyboardSelection !== "p2") await select.selectOption("p2");
  await page.waitForFunction(() => document.querySelector(".rxs-p14-native-rail")?.dataset.value === "p2");
  assert.equal(await page.locator(".rxs-p14-metrics").getAttribute("data-baseline"), "p2");
  assert.equal(await page.locator(".rxs-p14-range-labels button[aria-pressed=true]").innerText(), "P2比");
  await page.getByRole("button", { name: "P1比", exact: true }).click();
  assert.equal(await page.locator(".rxs-p14-native-rail").getAttribute("data-value"), "p1");
  await select.selectOption("p2");
  assert.equal(await page.locator(".rxs-p14-native-rail").getAttribute("data-value"), "p2");
  const settledValues = await settleP14Metrics(page, "webkit-ipad-native", { allowStatic: true });
  const selectStyle = await select.evaluate((control) => {
    const style = getComputedStyle(control);
    return { background: style.backgroundImage, shadow: style.boxShadow, appearance: style.appearance };
  });
  assert.match(selectStyle.background, /linear-gradient/);
  await page.locator(".rxs-p14-range-control").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/webkit-ipad-native.png` });
  console.log(`PASS webkit/ipad-native ${JSON.stringify({ selected: await select.inputValue(), keyboardSelection, focusedByKeyboard: true, selectStyle, settledValues })}`);
  await context.close();
} finally {
  await ipadBrowser.close();
}
