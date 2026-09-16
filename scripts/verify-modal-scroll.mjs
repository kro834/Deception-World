import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8080";
const engine = process.env.PW_ENGINE || "chromium";
const isWebKit = engine === "webkit";
const browser = await (isWebKit ? webkit : chromium).launch(
  isWebKit ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const results = [];
const viewports = [
  { name: "iphone390x844", width: 390, height: 844 },
  { name: "ipad1280x800", width: 1280, height: 800 },
];

function record(viewport, check, details = {}) {
  results.push({ engine, viewport: viewport.name, check, ...details });
}

async function scrollElement(page, locator, direction = 1) {
  const box = await locator.boundingBox();
  assert.ok(box, "scroll target is visible");
  const x = box.x + Math.min(100, Math.max(16, box.width / 2));
  // Start over visible body content rather than a sticky header/control row.
  const y = box.y + Math.max(36, box.height - 96);
  const before = await locator.evaluate((element) => element.scrollTop);

  if (!isWebKit) {
    const cdp = await page.context().newCDPSession(page);
    const touchPoint = (touchY) => ({
      x,
      y: touchY,
      id: 1,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(y)],
    });
    for (let step = 1; step <= 20; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touchPoint(y - (direction * 220 * step) / 20)],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    // WebKit is an optional wheel-only diagnostic; it does not emulate iOS touch.
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, direction * 260);
    await page.waitForTimeout(80);
    if ((await locator.evaluate((element) => element.scrollTop)) <= before + 8) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, direction * 520);
    }
  }
  await page.waitForTimeout(180);
  const after = await locator.evaluate((element) => element.scrollTop);
  assert.ok(after > before + 8, `scrollTop did not advance (${before} -> ${after})`);
  return { before, after };
}

async function waitRoute(page, path) {
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-route-scroll-settling"));
  await page.waitForTimeout(260);
}

async function checkSidePanel(page, viewport) {
  await waitRoute(page, "/world");
  await page.locator(".side-panel-trigger").click();
  const panel = page.locator(".side-panel[data-open='true']");
  await panel.waitFor({ state: "visible" });
  const panelMetrics = await panel.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  if (panelMetrics.scrollHeight > panelMetrics.clientHeight) {
    const panelScroll = await scrollElement(page, panel);
    record(viewport, "side panel scroll", panelScroll);
  } else {
    record(viewport, "side panel scroll (content fits)", panelMetrics);
  }

  await panel.locator(".side-panel-announcement-trigger").click();
  const announcement = page.locator("#site-announcement-dialog[open]");
  await announcement.waitFor({ state: "visible" });
  const stage = announcement.locator(".site-announcement-stage");
  const stageMetrics = await stage.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  if (stageMetrics.scrollHeight > stageMetrics.clientHeight) {
    const stageScroll = await scrollElement(page, stage);
    record(viewport, "announcement scroll", stageScroll);
  } else {
    // The index can fit on iPad even though a selected notice's detail is long.
    const notice = announcement.locator(".site-announcement-list-item").first();
    if (await notice.count()) {
      await notice.click();
      await page.waitForTimeout(120);
      const detailMetrics = await stage.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      if (detailMetrics.scrollHeight > detailMetrics.clientHeight) {
        const detailScroll = await scrollElement(page, stage);
        record(viewport, "announcement detail scroll", { ...detailScroll, index: stageMetrics });
      } else {
        record(viewport, "announcement index/detail content fits", { index: stageMetrics, detail: detailMetrics });
      }
    } else {
      record(viewport, "announcement content fits", stageMetrics);
    }
  }

  await announcement.locator(".site-announcement-close").click();
  await announcement.waitFor({ state: "hidden" });
  const lockedWhileMenuOpen = await page.evaluate(() => ({
    rootOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    menuOpen: document.querySelector(".side-panel")?.dataset.open,
  }));
  assert.equal(lockedWhileMenuOpen.menuOpen, "true", "closing announcement also closed side panel");
  assert.equal(lockedWhileMenuOpen.rootOverflow, "hidden", "background unlocked while menu remained open");
  assert.equal(lockedWhileMenuOpen.bodyOverflow, "hidden", "body unlocked while menu remained open");
  record(viewport, "announcement close keeps menu background locked", lockedWhileMenuOpen);

  await panel.locator(".side-panel-close").click();
  await panel.waitFor({ state: "hidden" });
  const unlocked = await page.evaluate(() => ({
    rootOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    menuOpen: document.querySelector(".side-panel")?.dataset.open,
  }));
  assert.notEqual(unlocked.rootOverflow, "hidden", "root remains locked after closing menu");
  assert.notEqual(unlocked.bodyOverflow, "hidden", "body remains locked after closing menu");
  assert.equal(unlocked.menuOpen, "false", "side panel did not close");
  record(viewport, "menu close restores page scroll", unlocked);
}

async function checkDreamDialog(page, viewport) {
  await waitRoute(page, "/dream-chapter");
  const trigger = page.locator(".dream-character-grid button").first();
  await trigger.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(120);
  const before = await page.evaluate(() => window.scrollY);
  await trigger.click();
  const dialog = page.locator(".dream-dossier-dialog[open]").first();
  await dialog.waitFor({ state: "visible" });
  const metrics = await dialog.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  assert.ok(metrics.scrollHeight > metrics.clientHeight, "dream dossier is not scrollable");
  const scroll = await scrollElement(page, dialog);
  record(viewport, "dream dossier scroll", { ...scroll, documentBefore: before });
  await dialog.locator(".dream-dossier-close").click();
  await dialog.waitFor({ state: "hidden" });
  const after = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(after - before) < 8, `dream close did not restore document position (${before} -> ${after})`);
  record(viewport, "dream close restores document position", { before, after });
}

async function checkArchiveFromMenu(page, viewport) {
  await waitRoute(page, "/world");
  await page.locator(".side-panel-trigger").click();
  const panel = page.locator(".side-panel[data-open='true']");
  await panel.waitFor({ state: "visible" });
  await panel.locator("a[href='/form-archive']").first().click();
  await page.waitForURL(/\/form-archive/);
  const frame = page.locator("#form-archive-frame");
  await frame.waitFor({ state: "attached" });
  const frameHandle = await frame.elementHandle();
  assert.ok(frameHandle, "archive iframe missing");
  const frameBox = await frame.boundingBox();
  assert.ok(frameBox, "archive iframe is not visible");
  const framePage = await frameHandle.contentFrame();
  assert.ok(framePage, "archive iframe content unavailable");
  await framePage.locator("html").waitFor({ state: "attached", timeout: 30_000 });
  const rootState = await framePage.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    overflow: getComputedStyle(document.documentElement).overflowY,
  }));
  assert.ok(rootState.scrollHeight > rootState.clientHeight, "archive root is not scrollable");
  const before = await framePage.evaluate(() => document.documentElement.scrollTop || document.body.scrollTop);
  if (!isWebKit) {
    const cdp = await page.context().newCDPSession(page);
    const x = frameBox.x + frameBox.width / 2;
    const y = frameBox.y + frameBox.height / 2;
    const touchPoint = (touchY) => ({ x, y: touchY, id: 1, radiusX: 1, radiusY: 1, force: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint(y)] });
    for (let step = 1; step <= 20; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touchPoint(y - (220 * step) / 20)],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
    await page.mouse.wheel(0, 280);
  }
  await page.waitForTimeout(220);
  const after = await framePage.evaluate(() => document.documentElement.scrollTop || document.body.scrollTop);
  assert.ok(after > before + 8, `archive iframe did not scroll (${before} -> ${after})`);
  const staleLock = await page.evaluate(() => ({
    rootOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    railLock: document.documentElement.dataset.railLock || null,
  }));
  assert.notEqual(staleLock.rootOverflow, "hidden", "archive route has stale root scroll lock");
  assert.notEqual(staleLock.bodyOverflow, "hidden", "archive route has stale body scroll lock");
  assert.equal(staleLock.railLock, null, "archive route has stale rail lock");
  record(viewport, "form archive iframe scroll and root lock", { before, after, rootState, staleLock });
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: !isWebKit,
      isMobile: !isWebKit,
    });
    const page = await context.newPage();
    try {
      await checkSidePanel(page, viewport);
      await checkDreamDialog(page, viewport);
      await checkArchiveFromMenu(page, viewport);
      console.log(`${engine} ${viewport.name} modal scroll checks passed`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ engine, webkitMode: isWebKit ? "wheel-only diagnostic" : "Chrome CDP touch", results }, null, 2));
