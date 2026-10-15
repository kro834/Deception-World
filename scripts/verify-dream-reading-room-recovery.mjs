// BASE_URL=http://127.0.0.1:8586 BROWSER=chrome|webkit node scripts/verify-dream-reading-room-recovery.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8586");
const kind = process.env.BROWSER || "chrome";
assert.ok(["chrome", "chromium", "webkit"].includes(kind), `Unsupported BROWSER=${kind}`);
const engine = kind === "webkit" ? webkit : chromium;
const name = kind === "webkit" ? "webkit" : "chrome";
const output = resolve("output/playwright/dream-major-recovery", name);
const storageKey = "deception-world:dream-reader:v1";
const report = { base, browser: name, browserVersion: "", checks: [] };
await mkdir(output, { recursive: true });
const browser = await engine.launch(
  kind === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
report.browserVersion = browser.version();

async function ready(page) {
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const trigger = document.querySelector(".dream-reading-entry button");
    return (
      trigger &&
      !trigger.disabled &&
      Object.keys(trigger).some((key) => key.startsWith("__reactProps"))
    );
  });
  await page.locator(".dream-reading-entry button").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts?.ready);
  await settled(page);
}

async function settled(page) {
  await page.waitForFunction(
    () => {
      const key = [scrollY, document.documentElement.scrollHeight].join(":");
      const previous = window.__dreamRoomRecoveryGeometry;
      window.__dreamRoomRecoveryGeometry = {
        key,
        count: previous?.key === key ? previous.count + 1 : 0,
      };
      return window.__dreamRoomRecoveryGeometry.count >= 3;
    },
    undefined,
    { polling: 100 },
  );
}

async function openRoom(page) {
  await page.locator(".dream-reading-entry button").click();
  await page.locator(".dream-reading-room[open]").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "読書室を閉じる",
  );
}

async function state(page) {
  return page.evaluate(() => ({
    url: location.pathname,
    scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    dialog: Boolean(document.querySelector(".dream-reading-room[open]")),
    dialogFlag: document.documentElement.dataset.dreamDialogOpen,
    rootOverflow: document.documentElement.style.overflow,
    bodyPosition: document.body.style.position,
    launcher: (() => {
      const node = document.querySelector(".dream-reading-entry button");
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, height: rect.height, disabled: node.disabled };
    })(),
  }));
}

try {
  // Denied reader storage must not prevent opening or using the room. The save
  // path should report that persistence is unavailable instead of throwing.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await context.addInitScript((key) => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.getItem = function (name) {
        if (name === key) throw new DOMException("Storage access denied", "SecurityError");
        return originalGet.call(this, name);
      };
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException("Storage access denied", "SecurityError");
        return originalSet.call(this, name, value);
      };
    }, storageKey);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await openRoom(page);
    await page.getByRole("button", { name: "しおりを保存", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "このブラウザーでは保存できません" })
      .waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".dream-reading-room[open]").count(),
      1,
      "room stays open after denied save",
    );
    assert.deepEqual(errors, [], "denied storage causes no uncaught page error");
    await page.screenshot({ path: `${output}/01-storage-denied.png` });
    report.checks.push({ scenario: "denied-storage-room-remains-usable", passed: true });
    await context.close();
  }

  // A first dynamic stylesheet failure should be surfaced with a retry path;
  // the second request must load the same lazy room successfully.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    let styleRequests = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*.css", async (route) => {
      if (!/dream-reading-room/i.test(route.request().url())) return route.continue();
      styleRequests += 1;
      if (styleRequests === 1) return route.abort();
      return route.continue();
    });
    await ready(page);
    await page.locator(".dream-reading-entry button").click();
    await page
      .getByRole("button", { name: "読書室を再読み込み", exact: true })
      .waitFor({ state: "visible", timeout: 15000 });
    assert.equal(
      await page.locator(".dream-reading-room[open]").count(),
      0,
      "failed lazy load does not open an unstyled room",
    );
    assert.equal(styleRequests, 1, "first dynamic room stylesheet request was intercepted");
    await page.screenshot({ path: `${output}/02-style-load-failed.png` });
    await page.getByRole("button", { name: "読書室を再読み込み", exact: true }).click();
    await page.locator(".dream-reading-room[open]").waitFor({ state: "visible", timeout: 15000 });
    assert.ok(styleRequests >= 2, "retry requested the stylesheet again");
    assert.deepEqual(errors, [], "stylesheet retry causes no uncaught page error");
    await page.screenshot({ path: `${output}/03-style-retry-open.png` });
    report.checks.push({ scenario: "room-stylesheet-failure-retry", passed: true, styleRequests });
    await context.close();
  }

  // Keep the stylesheet request pending while the user leaves the route. The
  // page should remain unlocked and geometrically stable, and resolving the
  // stale import must not mount a dialog after the launcher is gone.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let releaseStyle;
    let interceptStyle;
    const intercepted = new Promise((resolveRequest) => {
      interceptStyle = resolveRequest;
    });
    const styleGate = new Promise((resolveRequest) => {
      releaseStyle = resolveRequest;
    });
    await page.route("**/*.css", async (route) => {
      if (!/dream-reading-room/i.test(route.request().url())) return route.continue();
      interceptStyle();
      await styleGate;
      await route.continue().catch(() => undefined);
    });
    await ready(page);
    const before = await state(page);
    await page.locator(".dream-reading-entry button").click();
    await intercepted;
    await page
      .getByRole("button", { name: "読書室を準備中", exact: false })
      .waitFor({ state: "visible" });
    await settled(page);
    const pending = await state(page);
    assert.equal(pending.dialog, false, "dialog waits for its stylesheet");
    assert.equal(pending.dialogFlag, undefined, "pending load does not acquire modal flag");
    assert.notEqual(pending.rootOverflow, "hidden", "pending load does not lock page scrolling");
    assert.notEqual(pending.bodyPosition, "fixed", "pending load does not freeze body");
    assert.ok(
      Math.abs(pending.scrollY - before.scrollY) <= 8,
      "pending load preserves page scroll position",
    );
    assert.equal(pending.scrollHeight, before.scrollHeight, "pending load preserves page height");
    assert.equal(
      pending.launcher.height,
      before.launcher.height,
      "pending load preserves launcher height",
    );
    assert.ok(
      Math.abs(pending.launcher.top + pending.scrollY - (before.launcher.top + before.scrollY)) <=
        1,
      "pending load preserves launcher document position",
    );
    assert.equal(
      pending.launcher.disabled,
      true,
      "launcher announces pending state and blocks duplicate imports",
    );
    await page.screenshot({ path: `${output}/04-style-pending.png` });

    const worldLink = page.locator(".dream-site-header a.dream-back-link");
    await worldLink.click();
    await page.waitForURL((url) => url.pathname === "/world", { timeout: 15000 });
    releaseStyle();
    await page.waitForTimeout(500);
    const abandoned = await state(page);
    assert.equal(abandoned.dialog, false, "resolving abandoned import does not open stale room");
    assert.equal(await page.locator(".dream-reading-room").count(), 0);
    assert.notEqual(abandoned.dialogFlag, "true", "abandoned route releases modal flag");
    assert.deepEqual(errors, [], "route abandonment causes no uncaught page error");
    await page.screenshot({ path: `${output}/05-after-route-abandonment.png` });
    report.checks.push({
      scenario: "pending-stylesheet-layout-and-route-abandonment",
      passed: true,
    });
    await context.close();
  }

  // Native showModal must keep keyboard focus within the room when tabbing in
  // either direction, including after the focus reaches the last control.
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await openRoom(page);
    const dialog = page.locator(".dream-reading-room[open]");
    const closeButton = dialog.getByRole("button", { name: "読書室を閉じる", exact: true });
    const saveButton = dialog.getByRole("button", { name: "しおりを保存", exact: true });
    assert.equal(
      await closeButton.evaluate((node) => node === document.activeElement),
      true,
      "open focuses the first control",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await saveButton.evaluate((node) => node === document.activeElement),
      true,
      "Shift+Tab wraps from first to last control",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await closeButton.evaluate((node) => node === document.activeElement),
      true,
      "Tab wraps from last to first control",
    );
    const focusSequence = [];
    for (let i = 0; i < 16; i += 1) {
      await page.keyboard.press("Tab");
      const focusState = await dialog.evaluate((node) => ({
        open: node.open,
        contained: node.contains(document.activeElement),
        active: document.activeElement
          ? `${document.activeElement.nodeName.toLowerCase()}${document.activeElement.id ? `#${document.activeElement.id}` : ""}${document.activeElement.className ? `.${String(document.activeElement.className).trim().replace(/\s+/g, ".")}` : ""}`
          : "none",
      }));
      focusSequence.push(focusState.active);
      if (!focusState.contained)
        await page.screenshot({ path: `${output}/06-keyboard-focus-escaped.png` });
      assert.equal(
        focusState.contained,
        true,
        `Tab ${i + 1} remains in modal: ${JSON.stringify({ ...focusState, focusSequence })}`,
      );
    }
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
        true,
        `Shift+Tab ${i + 1} remains in modal`,
      );
    }
    assert.deepEqual(errors, [], "keyboard focus cycling causes no uncaught page error");
    await page.screenshot({ path: `${output}/06-keyboard-focus-contained.png` });
    report.checks.push({
      scenario: "keyboard-focus-contained-by-native-modal",
      passed: true,
      wrapsBothDirections: true,
    });
    await context.close();
  }

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error.stack || String(error);
  report.ok = false;
  throw error;
} finally {
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
