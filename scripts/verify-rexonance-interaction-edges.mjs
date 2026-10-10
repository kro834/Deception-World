import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "zoom-200", viewport: { width: 720, height: 450 } },
  { name: "phone-short", viewport: { width: 390, height: 568 }, isMobile: true, hasTouch: true },
  { name: "phone-narrow-short", viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
  { name: "landscape-short", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
];

async function ready(page) {
  await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
}

async function waitForScrollSettled(page) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const before = scrollY;
        setTimeout(() => resolve(Math.abs(scrollY - before) < 1), 200);
      }),
    null,
    { timeout: 5000 },
  );
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height),
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      scrollY,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      stageTabs: rect(".rxs-stage-tabs"),
      performanceSelect: rect(".rxs-comparison-selector select"),
      p14Select: rect(".rxs-p14-native-select select"),
      sideTrigger: rect(".side-panel-trigger"),
      menu: rect("#site-side-panel"),
    };
  });
}

async function verifyKeyboardMenu(page) {
  const trigger = page.locator(".side-panel-trigger").first();
  const panel = page.locator("#site-side-panel");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "true");
  await page.waitForFunction(() => document.querySelector("#site-side-panel")?.contains(document.activeElement));
  const traversal = [];
  for (let index = 0; index < 100; index += 1) {
    await page.keyboard.press("Tab");
    traversal.push(await page.evaluate(() => ({
      inside: Boolean(document.querySelector("#site-side-panel")?.contains(document.activeElement)),
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 40),
      visible: (() => {
        const panel = document.querySelector("#site-side-panel");
        const target = document.activeElement;
        if (!panel || !(target instanceof HTMLElement) || target === panel) return true;
        const panelBox = panel.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        return targetBox.height > 0 && targetBox.top >= panelBox.top - 1 && targetBox.bottom <= panelBox.bottom + 1;
      })(),
    })));
  }
  assert.ok(traversal.every((entry) => entry.inside), "Tab must remain inside the open site menu");
  assert.ok(traversal.every((entry) => entry.visible), "Tab must keep the focused menu item visible");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "false");
  assert.equal(await trigger.evaluate((button) => document.activeElement === button), true, "Escape restores keyboard focus to menu trigger");
  assert.equal(await panel.getAttribute("aria-hidden"), "true");
  const release = await page.evaluate(() => ({
    inertMain: document.querySelector("main")?.inert,
    scrollLocked: document.documentElement.dataset.sideMenuOpen === "true",
    overflow: getComputedStyle(document.body).overflow,
  }));
  assert.equal(release.inertMain, false, "closing the menu releases inert background content");
  assert.equal(release.scrollLocked, false, "closing the menu releases the scroll lock");

  await trigger.click();
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "true");
  await page.waitForFunction(() => {
    const panel = document.querySelector("#site-side-panel");
    const box = panel?.getBoundingClientRect();
    return box && box.left < innerWidth - box.width / 2;
  });
  const pageScrollBefore = await page.evaluate(() => scrollY);
  // rx10: the menu is a full-screen launcher (styles-stage-shell.css), so the
  // scrim is only tested where it still shows beside the panel at rest.
  await panel.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  );
  const panelBounds = await panel.boundingBox();
  const scrimShows = panelBounds.x > 60;
  if (scrimShows) {
    await page.mouse.move(40, Math.round(page.viewportSize().height / 2));
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(100);
  }
  const pageScrollAfter = await page.evaluate(() => scrollY);
  await panel.evaluate((element) => {
    element.scrollTop = 0;
  });
  const panelScrollBefore = await panel.evaluate((element) => element.scrollTop);
  const panelScrolls = await panel.evaluate(
    (element) => element.scrollHeight > element.clientHeight + 1,
  );
  await page.mouse.move(
    Math.round(panelBounds.x + panelBounds.width / 2),
    Math.round(panelBounds.y + panelBounds.height * 0.8),
  );
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(100);
  const panelScrollAfter = await panel.evaluate((element) => element.scrollTop);
  assert.equal(pageScrollAfter, pageScrollBefore, "wheel over the scrim must not scroll the page behind the menu");
  assert.equal(
    await page.evaluate(() => scrollY),
    pageScrollBefore,
    "wheel inside the menu must not scroll the page behind it",
  );
  if (panelScrolls) {
    assert.ok(panelScrollAfter > panelScrollBefore, "wheel inside the menu should scroll its list");
  }
  if (scrimShows) await page.mouse.click(40, Math.round(page.viewportSize().height / 2));
  else await page.locator("#site-side-panel .side-panel-close").click();
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "false");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.sideMenuOpen), undefined);
  return {
    focusStops: new Set(traversal.map((entry) => `${entry.tag}:${entry.label}`)).size,
    release,
    wheel: { pageScrollBefore, pageScrollAfter, panelScrollBefore, panelScrollAfter },
  };
}

async function verifyComparisons(page) {
  const comparison = page.getByLabel("レクソナンスの比較対象", { exact: true });
  await comparison.selectOption("extreme");
  await page.locator('.rxs-comparison-metrics[data-baseline="extreme"]').waitFor();
  const p14Select = page.locator('.rxs-p14-native-select select');
  if (await p14Select.count()) {
    await p14Select.selectOption("p2");
  } else {
    await page.locator('.rxs-p14-range-labels button[aria-pressed="false"]').last().click();
  }
  await page.locator('.rxs-p14-metrics[data-baseline="p2"]').waitFor();
  const state = await page.evaluate(() => ({
    comparison: document.querySelector(".rxs-comparison-selector select")?.value,
    comparisonData: document.querySelector(".rxs-comparison-metrics")?.getAttribute("data-baseline"),
    p14: document.querySelector(".rxs-p14-range-control")?.getAttribute("data-baseline"),
    p14Data: document.querySelector(".rxs-p14-metrics")?.getAttribute("data-baseline"),
  }));
  assert.deepEqual(state, { comparison: "extreme", comparisonData: "extreme", p14: "p2", p14Data: "p2" });
  return state;
}

async function verifySwipeMenu(page, context) {
  const trigger = page.locator(".side-panel-trigger").first();
  const panel = page.locator("#site-side-panel");
  const pageScrollBeforeMenu = await page.evaluate(() => scrollY);
  const triggerBox = await trigger.boundingBox();
  assert.ok(triggerBox, "menu trigger should be visible for touch");
  await page.touchscreen.tap(
    Math.round(triggerBox.x + triggerBox.width / 2),
    Math.round(triggerBox.y + triggerBox.height / 2),
  );
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "true");
  await page.waitForFunction(() => {
    const element = document.querySelector("#site-side-panel");
    const box = element?.getBoundingClientRect();
    return element && box && getComputedStyle(element).visibility === "visible" && box.left <= innerWidth - box.width + 5;
  });
  await waitForScrollSettled(page);
  const pageScrollAfterOpen = await page.evaluate(() => scrollY);
  const box = await panel.boundingBox();
  assert.ok(box, "menu should have a visible touch target");
  await panel.evaluate((element) => {
    window.__rexSwipeEvents = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "lostpointercapture"]) {
      element.addEventListener(type, (event) => window.__rexSwipeEvents.push({ type, x: event.clientX, y: event.clientY, pointerType: event.pointerType, target: event.target.className }), true);
    }
  });
  const startX = Math.max(16, Math.round(box.x + 24));
  const y = Math.round(Math.min(page.viewportSize().height - 30, box.y + box.height / 2));
  const endX = Math.min(page.viewportSize().width - 16, startX + Math.round(box.width * 0.85));
  const session = await context.newCDPSession(page);
  const cancelStartX = startX;
  const pageScrollBeforeCancel = await page.evaluate(() => scrollY);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cancelStartX, y }] });
  for (const x of [cancelStartX + 28, cancelStartX + 64]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(30);
  }
  const duringCancel = await panel.evaluate((element) => element.style.translate);
  await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await waitForScrollSettled(page);
  const afterCancel = {
    open: await trigger.getAttribute("aria-expanded"),
    pageY: await page.evaluate(() => scrollY),
    pageYBeforeMenu: pageScrollBeforeMenu,
    pageYAfterOpen: pageScrollAfterOpen,
    translate: await panel.evaluate((element) => element.style.translate),
    transition: await panel.evaluate((element) => element.style.transition),
    locked: await page.evaluate(() => document.documentElement.dataset.sideMenuOpen === "true"),
  };
  console.log("touch-menu-cancel-scroll", JSON.stringify({ pageScrollBeforeMenu, pageScrollAfterOpen, pageScrollBeforeCancel, afterCancel }));
  assert.ok(duringCancel, "horizontal pointer movement should temporarily translate the panel");
  assert.equal(afterCancel.open, "true", "pointercancel should not dismiss the menu");
  assert.equal(afterCancel.pageY, pageScrollBeforeCancel, "pointercancel must not scroll the page behind the menu");
  assert.equal(afterCancel.translate, "", "pointercancel clears the temporary panel translation");
  assert.equal(afterCancel.transition, "", "pointercancel restores the panel transition style");
  assert.equal(afterCancel.locked, true, "pointercancel keeps the open menu scroll lock active");
  const pageScrollBefore = await page.evaluate(() => scrollY);
  const menuScrollBefore = await panel.evaluate((element) => element.scrollTop);
  const verticalX = Math.round(box.x + box.width * 0.72);
  const verticalStartY = Math.round(box.height * 0.76);
  const verticalEndY = Math.round(box.height * 0.34);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: verticalX, y: verticalStartY }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: verticalX, y: verticalStartY + ((verticalEndY - verticalStartY) * step) / 8 }],
    });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
  const verticalScroll = {
    menuOpen: await trigger.getAttribute("aria-expanded"),
    pageY: await page.evaluate(() => scrollY),
    menuY: await panel.evaluate((element) => element.scrollTop),
    lockState: await page.evaluate(() => ({
      rootOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyTop: document.body.style.top,
      locked: document.documentElement.dataset.sideMenuOpen,
    })),
  };
  assert.equal(verticalScroll.menuOpen, "true", "vertical touch scrolling must not dismiss the menu");
  assert.equal(
    verticalScroll.pageY,
    pageScrollBefore,
    `vertical touch must not scroll the page behind the menu (${JSON.stringify({ pageScrollBefore, verticalScroll, box })})`,
  );
  assert.ok(verticalScroll.menuY > menuScrollBefore, "vertical touch should scroll the menu list");
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX + ((endX - startX) * step) / 8, y }],
    });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(350);
  return {
    expanded: await trigger.getAttribute("aria-expanded"),
    panelState: await panel.getAttribute("data-open"),
    panelTranslate: await panel.evaluate((element) => element.style.translate),
    box,
    startX,
    endX,
    y,
    pointerCancel: { duringCancel, afterCancel },
    verticalScroll,
    events: await page.evaluate(() => window.__rexSwipeEvents),
  };
}

async function verifyStageSwipe(page, context) {
  const rail = page.locator(".rxs-stage-tabs");
  await rail.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await rail.boundingBox();
  assert.ok(box && box.width > 0, "stage rail should be available for touch input");
  const beforeScrollY = await page.evaluate(() => scrollY);
  const startX = Math.round(box.x + box.width * 0.18);
  const endX = Math.round(box.x + box.width * 0.85);
  const y = Math.round(box.y + box.height / 2);
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 10; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX + ((endX - startX) * step) / 10, y }],
    });
    await page.waitForTimeout(25);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await page.waitForFunction(() => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "ultra");
  const result = await page.evaluate(() => ({
    stage: document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage"),
    selected: document.querySelector('.rxs-stage-tabs [role="tab"][aria-selected="true"]')?.id,
    imageAlt: document.querySelector(".rxs-stage-panel img")?.getAttribute("alt"),
    overlayCount: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
    scrollY,
  }));
  assert.equal(result.stage, "ultra");
  assert.equal(result.selected, "rxs-stage-tab-ultra");
  assert.match(result.imageAlt, /ウルトラ/);
  assert.ok(result.overlayCount <= 1);
  assert.ok(Math.abs(result.scrollY - beforeScrollY) <= 2, "horizontal stage swipe must not scroll the document vertically");
  return result;
}

async function verifyBackClosesMenu(context) {
  const page = await context.newPage();
  await page.goto(`${base}/form-archive`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
  const trigger = page.locator(".side-panel-trigger").first();
  await trigger.click();
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "true");
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await link.click();
  await page.waitForURL("**/rexonance-saga**", { timeout: 20000 });
  await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('.rx-call-sequence[data-mode="entry"]'), null, { timeout: 7000 });
  await trigger.click();
  await page.waitForFunction(() => document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded") === "true");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/form-archive", { timeout: 10000 });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate") &&
      !document.querySelector(".rx-call-sequence") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout: 5000 },
  );
  const cleanup = await page.evaluate(() => ({
    menuOpen: document.querySelector(".side-panel-trigger")?.getAttribute("aria-expanded"),
    panelHidden: document.querySelector("#site-side-panel")?.getAttribute("aria-hidden"),
    scrollLock: document.documentElement.dataset.sideMenuOpen,
    bodyInert: document.querySelector("main")?.inert,
    routeCover: document.documentElement.dataset.routeCover,
    sequenceCount: document.querySelectorAll(".rx-call-sequence").length,
  }));
  assert.deepEqual(cleanup, {
    menuOpen: "false",
    panelHidden: "true",
    scrollLock: undefined,
    bodyInert: false,
    routeCover: undefined,
    sequenceCount: 0,
  });
  await page.close();
  return cleanup;
}

async function readyWorldArtworkPage(page) {
  await page.goto(`${base}/world#manager-archive-other`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
  await page.locator(".other-artwork-card").first().waitFor();
}

async function verifyArtworkDialogs() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await readyWorldArtworkPage(page);
  const card = page.locator('.other-artwork-card[aria-label="ハイクの画像を拡大"]');
  const dialog = page.locator(".other-artwork-dialog");
  await card.scrollIntoViewIfNeeded();
  const keyboardScroll = await page.evaluate(() => scrollY);
  await card.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector(".other-artwork-dialog")?.matches(":modal"));
  await page.waitForFunction(() => {
    const image = document.querySelector(".other-artwork-dialog img");
    return image?.complete && image.naturalWidth > 0;
  });
  const keyboardOpen = await page.evaluate(() => ({
    activeIsDialog: document.activeElement === document.querySelector(".other-artwork-dialog"),
    title: document.querySelector(".other-artwork-dialog h2")?.textContent,
    imageWidth: document.querySelector(".other-artwork-dialog img")?.naturalWidth,
    scrollY,
  }));
  assert.equal(keyboardOpen.activeIsDialog, true, "keyboard image zoom starts focus on its dialog");
  assert.match(keyboardOpen.title, /ハイク/);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  const keyboardClose = await page.evaluate(() => ({
    triggerFocused: document.activeElement === document.querySelector('.other-artwork-card[aria-label="ハイクの画像を拡大"]'),
    focusVisible: document.querySelector('.other-artwork-card[aria-label="ハイクの画像を拡大"]')?.matches(":focus-visible"),
    scrollY,
  }));
  assert.equal(keyboardClose.triggerFocused, true, "Escape restores focus to the image card");
  assert.equal(keyboardClose.focusVisible, true, "keyboard close preserves a visible focus indicator");
  assert.equal(keyboardClose.scrollY, keyboardScroll, "closing the keyboard dialog preserves the page scroll position");

  await card.click();
  await dialog.waitFor({ state: "visible" });
  const pointerScroll = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "ハイクの画像を閉じる" }).click();
  await dialog.waitFor({ state: "detached" });
  const pointerClose = await page.evaluate(() => ({
    triggerFocused: document.activeElement === document.querySelector('.other-artwork-card[aria-label="ハイクの画像を拡大"]'),
    focusVisible: document.querySelector('.other-artwork-card[aria-label="ハイクの画像を拡大"]')?.matches(":focus-visible"),
    scrollY,
  }));
  assert.equal(pointerClose.triggerFocused, false, "pointer close does not retain a latched card focus");
  assert.equal(pointerClose.focusVisible, false, "pointer close clears the keyboard highlight");
  assert.equal(pointerClose.scrollY, pointerScroll, "closing the pointer dialog preserves page scroll");

  await context.close();
  const delayedImage = await verifyDelayedArtworkImage();
  const failedImage = await verifyFailedArtworkImage();
  const zeusReturn = await verifyZeusReturnAfterStageCall();
  console.log("zeus-return", JSON.stringify(zeusReturn));
  const slowStage = await verifySlowStageSelection();
  return { keyboardOpen, keyboardClose, pointerClose, delayedImage, failedImage, zeusReturn, slowStage, errors };
}

async function verifyZeusReturnAfterStageCall() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
  const tabs = page.locator(".rxs-stage-tabs [role=tab]");
  await tabs.nth(1).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const rail = document.querySelector(".rxs-stage-tabs");
    const click = (index) => rail.querySelectorAll("[role=tab]")[index].click();
    click(1);
    click(2);
    click(1);
    rail.dispatchEvent(new CustomEvent("railselect", { detail: { index: 2 } }));
  });
  const overlay = page.locator('.rx-call-sequence[data-mode="stage"]');
  await overlay.waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  await tabs.nth(2).evaluate((button) => button.click());
  const during = await page.evaluate(() => ({
    attrs: Array.from(document.documentElement.attributes, ({ name, value }) => [name, value]),
    hasMatches: document.querySelectorAll("html body:has(.rx-call-sequence[data-mode='stage'])").length,
    zeus: Array.from(document.querySelectorAll(".zeus-button"), (button) => ({
      inlineVisibility: button.style.visibility,
      inlineOpacity: button.style.opacity,
      visibility: getComputedStyle(button).visibility,
      opacity: getComputedStyle(button).opacity,
    })),
  }));
  await overlay.waitFor({ state: "detached", timeout: 1500 });
  const samples = await page.evaluate(async () => {
    const read = (at) => ({
      at,
      htmlAttrs: Array.from(document.documentElement.attributes, ({ name, value }) => [name, value]),
      bodyAttrs: Array.from(document.body.attributes, ({ name, value }) => [name, value]),
      overlayCount: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
      htmlHas: document.documentElement.matches("html:has(.rx-call-sequence[data-mode='stage'])"),
      bodyHas: document.body.matches("body:has(.rx-call-sequence[data-mode='stage'])"),
      hasMatches: document.querySelectorAll("html body:has(.rx-call-sequence[data-mode='stage'])").length,
      zeus: Array.from(document.querySelectorAll(".zeus-button"), (button) => ({
        inlineVisibility: button.style.visibility,
        inlineOpacity: button.style.opacity,
        visibility: getComputedStyle(button).visibility,
        opacity: getComputedStyle(button).opacity,
        display: getComputedStyle(button).display,
      })),
    });
    const snapshots = [read("immediate")];
    await new Promise(requestAnimationFrame);
    snapshots.push(read("raf"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    snapshots.push(read("20ms"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    snapshots.push(read("100ms"));
    return snapshots;
  });
  await context.close();
  return { during, afterDetach: samples };
}

async function verifyDelayedArtworkImage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await readyWorldArtworkPage(page);
  let requestedResolve;
  let handlerFinishedResolve;
  const requested = new Promise((resolve) => { requestedResolve = resolve; });
  const handlerFinished = new Promise((resolve) => { handlerFinishedResolve = resolve; });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/character-fable-20260923.webp")) {
      requestedResolve();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      try { await route.continue(); } catch { /* closing the dialog may cancel the image request */ }
      finally { handlerFinishedResolve(); }
    } else {
      await route.continue();
    }
  });
  const card = page.locator('.other-artwork-card[aria-label="フェイブルの画像を拡大"]');
  await card.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.touchscreen.tap(...Object.values(await (async () => {
    const box = await card.boundingBox();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  })()));
  const dialog = page.locator(".other-artwork-dialog");
  await dialog.waitFor({ state: "visible" });
  await Promise.race([requested, page.waitForTimeout(3000).then(() => { throw new Error("delayed image request did not start"); })]);
  const pendingImage = await page
    .locator('.other-artwork-dialog img[alt="フェイブルのキャラクタービジュアル全体"]')
    .evaluate((image) => ({ complete: image.complete, width: image.naturalWidth }));
  assert.equal(pendingImage.complete, false, "delayed image should still be pending while the dialog is open");
  await page.getByRole("button", { name: "フェイブルの画像を閉じる" }).click();
  await dialog.waitFor({ state: "detached" });
  const scrollAfter = await page.evaluate(() => scrollY);
  assert.equal(scrollAfter, scrollBefore, "closing while an image is delayed preserves page scroll");
  await handlerFinished;
  await context.close();
  return { pendingImage, scrollBefore, scrollAfter };
}

async function verifyFailedArtworkImage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await readyWorldArtworkPage(page);
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/character-fable-20260923.webp")) {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  const card = page.locator('.other-artwork-card[aria-label="フェイブルの画像を拡大"]');
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const dialog = page.locator(".other-artwork-dialog");
  await dialog.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector(".other-artwork-dialog img");
    return image?.complete && image.naturalWidth === 0;
  });
  assert.equal(await dialog.evaluate((element) => element.open), true, "failed artwork should not dismiss its dialog");
  await page.getByRole("button", { name: "フェイブルの画像を閉じる" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(errors, [], "failed image request should not cause a page error");
  await context.close();
  return { errors };
}

async function verifySlowStageSelection() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const delayedRequests = [];
  const completedRequests = [];
  let delayedResolve;
  const firstDelayedRequest = new Promise((resolve) => { delayedResolve = resolve; });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("rider-rexonance-max-20260923")) {
      delayedRequests.push(url.pathname);
      delayedResolve();
      await new Promise((resolve) => setTimeout(resolve, 8000));
      try {
        await route.continue();
        completedRequests.push(url.pathname);
      } catch {
        // The stage may stop referencing a responsive candidate after timeout.
      }
    } else {
      await route.continue();
    }
  });
  await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
  const tabs = page.locator(".rxs-stage-tabs [role=tab]");
  await tabs.nth(1).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const rail = document.querySelector(".rxs-stage-tabs");
    const box = rail?.getBoundingClientRect();
    return box && box.top < innerHeight + 400 && box.bottom > -400;
  });
  await page.waitForFunction(() => document.querySelector(".rxs-stage-tabs")?.dataset.stage === "standard");
  await Promise.race([
    firstDelayedRequest,
    page.waitForTimeout(5000).then(() => { throw new Error("Max image warmup request did not start"); }),
  ]);
  const pending = await page.evaluate(() => new Promise((resolve) => {
    const snapshot = () => {
      const image = document.querySelector(".rxs-stage-panel img");
      const overlay = document.querySelector('.rx-call-sequence[data-mode="stage"]');
      return {
        stage: document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage"),
        selected: document.querySelector('.rxs-stage-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim(),
        imageComplete: image?.complete,
        imageWidth: image?.naturalWidth,
        currentSrc: image?.currentSrc,
        overlay: overlay
          ? { stage: overlay.getAttribute("data-stage"), ariaHidden: overlay.getAttribute("aria-hidden") }
          : null,
        scrollY,
        hidden: document.hidden,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        worldEffects: document.documentElement.dataset.worldEffects,
        connection: navigator.connection?.effectiveType,
      };
    };
    const finishWhenCommitted = () => {
      const state = snapshot();
      if (state.stage === "max" && state.overlay?.stage === "max") {
        observer.disconnect();
        resolve(state);
      }
    };
    const observer = new MutationObserver(finishWhenCommitted);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    document.querySelectorAll(".rxs-stage-tabs [role=tab]")[1].click();
    finishWhenCommitted();
    window.setTimeout(() => {
      observer.disconnect();
      resolve(snapshot());
    }, 3000);
  }));
  console.log("slow-stage-pre-assert", JSON.stringify({ pending, delayedRequests }));
  assert.equal(pending.stage, "max", "the Max stage selection responds immediately while its image is delayed");
  assert.equal(pending.imageComplete, false, "the active Max artwork remains pending during the delay");
  assert.equal(pending.overlay?.stage, "max", "the short stage call corresponds to the selected stage");
  assert.equal(pending.overlay?.ariaHidden, "true", "the stage call remains decorative to assistive technology");
  await page.locator('.rx-call-sequence[data-mode="stage"]').waitFor({ state: "detached", timeout: 1600 });
  const afterCall = await page.evaluate(() => ({
    stage: document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage"),
    imageComplete: document.querySelector(".rxs-stage-panel img")?.complete,
    imageWidth: document.querySelector(".rxs-stage-panel img")?.naturalWidth,
    overlayCount: document.querySelectorAll('.rx-call-sequence[data-mode="stage"]').length,
    scrollY,
  }));
  assert.equal(afterCall.stage, "max", "the selected stage remains active after the call ends");
  assert.equal(afterCall.imageComplete, false, "the call ends without gating on the delayed artwork");
  assert.equal(afterCall.overlayCount, 0, "no stage overlay is stranded after the burst");
  await page.waitForFunction(() => {
    const image = document.querySelector(".rxs-stage-panel img");
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 12000 });
  assert.ok(delayedRequests.length > 0, "the test intercepted at least one Max image request");
  assert.deepEqual(pageErrors, [], "slow stage image loading should not cause a page error");
  const result = { delayedRequests, completedRequests, pending, afterCall, pageErrors };
  await context.close();
  return result;
}

try {
  const selectedProfiles = process.env.QA_PROFILE
    ? profiles.filter((profile) => profile.name === process.env.QA_PROFILE)
    : profiles;
  for (const profile of selectedProfiles) {
    const context = await browser.newContext({ ...profile, deviceScaleFactor: profile.isMobile ? 3 : 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);

    const initial = await layoutSnapshot(page);
    assert.equal(initial.overflowX, false, `${profile.name}: no horizontal page overflow`);
    const keyboardMenu = profile.name === "desktop" ? await verifyKeyboardMenu(page) : null;
    const comparisons = await verifyComparisons(page);
    // Keyboard-select focus can initiate a smooth scroll; allow it to settle
    // before testing whether the open touch menu contains a later gesture.
    await waitForScrollSettled(page);
    const swipeMenu = profile.hasTouch ? await verifySwipeMenu(page, context) : null;
    if (swipeMenu) {
      console.log(`${profile.name} swipe-menu`, JSON.stringify(swipeMenu));
      assert.equal(swipeMenu.expanded, "false", `${profile.name}: right-swipe closes the menu`);
    }

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const atBottom = await page.evaluate(() => ({
      y: scrollY,
      bottom: Math.round(innerHeight + scrollY),
      documentBottom: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(atBottom.overflowX, false, `${profile.name}: no horizontal overflow at page bottom`);

    const stageSwipe = profile.hasTouch ? await verifyStageSwipe(page, context) : null;
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.evaluate(() => { document.documentElement.dataset.worldEffects = "economy"; });
    const tabs = page.locator(".rxs-stage-tabs button");
    await tabs.nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === "max");
    await page.waitForTimeout(100);
    const accessibility = await page.evaluate(() => {
      const active = document.activeElement;
      const style = active ? getComputedStyle(active) : null;
      const stage = document.querySelector(".rxs-stage-tabs");
      return {
        activeLabel: active?.textContent?.trim(),
        focusVisible: active?.matches(":focus-visible"),
        outlineStyle: style?.outlineStyle,
        outlineWidth: style?.outlineWidth,
        stage: stage?.getAttribute("data-stage"),
        overlay: Boolean(document.querySelector(".rx-call-sequence[data-mode=stage]")),
        overflowX: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(accessibility.stage, "max", `${profile.name}: keyboard stage activation works in reduced/forced colors/economy`);
    assert.equal(accessibility.overflowX, false, `${profile.name}: no horizontal overflow in accessibility modes`);
    await page.screenshot({ path: `/tmp/rexonance-edge-${profile.name}-forced-colors.png`, fullPage: false });

    if (profile.name === "zoom-200") {
      await page.screenshot({ path: "/tmp/rexonance-edge-desktop-zoom-200.png", fullPage: false });
    }

    const backCleanup = profile.name === "desktop" ? await verifyBackClosesMenu(context) : null;

    assert.deepEqual(errors, [], `${profile.name}: no uncaught page errors`);
    console.log(`${profile.name} initial`, JSON.stringify(initial));
    console.log(`${profile.name} keyboard-menu`, JSON.stringify(keyboardMenu));
    console.log(`${profile.name} comparisons`, JSON.stringify(comparisons));
    console.log(`${profile.name} swipe-menu`, JSON.stringify(swipeMenu));
    console.log(`${profile.name} swipe-stage`, JSON.stringify(stageSwipe));
    console.log(`${profile.name} bottom`, JSON.stringify(atBottom));
    console.log(`${profile.name} a11y`, JSON.stringify(accessibility));
    console.log(`${profile.name} back-cleanup`, JSON.stringify(backCleanup));
    console.log(`PASS ${profile.name}`);
    await context.close();
  }
  if (!process.env.QA_PROFILE || process.env.QA_PROFILE === "desktop") {
    console.log("artwork-dialogs", JSON.stringify(await verifyArtworkDialogs()));
  }
} finally {
  await browser.close();
}
