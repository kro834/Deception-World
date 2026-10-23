import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8598";
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const browser = await engine.launch(engineName === "chromium" ? { channel: "chrome" } : {});
const output = new URL(`../output/playwright/dream-dossier-guide/${engineName}/`, import.meta.url);
await mkdir(output, { recursive: true });

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function openedGuide(page) {
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  await page.waitForFunction(() => {
    const select = document.querySelector("dialog[open] .dream-dossier-guide select");
    return select && !select.disabled && select.options.length > 1;
  });
  // Wait for native-dialog startup resets and late image dimensions to settle.
  await page.waitForTimeout(1250);
  return { dialog, guide: dialog.locator(".dream-dossier-guide") };
}

async function jump(page, guide, destination) {
  const hash = await page.evaluate(() => location.hash);
  const select = guide.getByRole("combobox", { name: "資料内の移動先" });
  await select.scrollIntoViewIfNeeded();
  await select.focus();
  const beforeChoice = await page.evaluate(() => ({
    dialogScroll: document.querySelector("dialog[open]").scrollTop,
    y: scrollY,
    x: scrollX,
    frozenTop: document.body.style.top,
  }));
  await select.selectOption(String(destination));
  assert.equal(
    await page.locator("dialog[open]").evaluate((node) => node.scrollTop),
    beforeChoice.dialogScroll,
    "choosing an option must wait for the explicit 移動 action",
  );
  assert.equal(await select.evaluate((node) => getComputedStyle(node).fontSize), "16px");
  await guide.getByRole("button", { name: "移動", exact: true }).click();
  const result = await page.evaluate(() => {
    const guide = document.querySelector("dialog[open] .dream-dossier-guide");
    const target = document.activeElement;
    const select = guide.querySelector("select");
    const guideBox = guide.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const dialog = target.closest("dialog");
    return {
      tag: target.tagName,
      heading: target.textContent.trim(),
      label: select.selectedOptions[0].textContent.replace(/^\d+ \/ /, "").trim(),
      guide: {
        top: guideBox.top,
        bottom: guideBox.bottom,
        left: guideBox.left,
        right: guideBox.right,
      },
      target: { top: targetBox.top, bottom: targetBox.bottom },
      height: innerHeight,
      width: innerWidth,
      overflow: dialog.scrollWidth > dialog.clientWidth + 1,
      y: scrollY,
      x: scrollX,
      frozenTop: document.body.style.top,
    };
  });
  assert.ok(["H2", "H3"].includes(result.tag), JSON.stringify(result));
  if (destination !== 0) assert.equal(result.heading, result.label);
  assert.ok(result.target.top >= result.guide.bottom + 6, JSON.stringify(result));
  assert.ok(result.target.bottom < result.height, JSON.stringify(result));
  assert.ok(
    result.guide.left >= 0 && result.guide.right <= result.width + 1,
    JSON.stringify(result),
  );
  assert.equal(result.overflow, false, JSON.stringify(result));
  assert.equal(result.y, beforeChoice.y, "local jumps must not scroll the background document");
  assert.equal(result.x, beforeChoice.x);
  assert.equal(result.frozenTop, beforeChoice.frozenTop, "local jumps retain the departure offset");
  assert.equal(
    await page.evaluate(() => location.hash),
    hash,
    "local navigation must retain the page fragment",
  );
  return result;
}

try {
  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (process.env.PW_OFFLINE_EXTERNALS === "1") {
      await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
      await page.route(
        /^https:\/\/grok\.com\/grok-app-builder\/extensions\.js(?:\?.*)?$/,
        (route) => route.abort(),
      );
    }
    await page.goto(`${base}/dream-chapter`);
    await ready(page);
    const trigger = page.locator("#dream-character-ciel");
    await trigger.evaluate((node) => node.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForTimeout(150);
    const departure = await page.evaluate(() => ({ y: scrollY, hash: location.hash }));
    await trigger.focus();
    await page.keyboard.press("Enter");
    let { dialog, guide } = await openedGuide(page);
    const sections = await dialog.locator(".dream-dossier-sections > section > header h3").count();
    assert.equal(
      await guide.locator("option").count(),
      sections + 1,
      "includes every supplement and related-record section",
    );
    const last = await jump(page, guide, sections);
    await page.screenshot({
      path: new URL(`${viewport.width}x${viewport.height}-last.png`, output).pathname,
    });
    await jump(page, guide, 0);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForTimeout(100);
    const returned = await page.evaluate(() => ({
      y: scrollY,
      hash: location.hash,
      focused: document.activeElement.id,
      locked: document.body.style.position,
    }));
    assert.ok(Math.abs(returned.y - departure.y) <= 2, JSON.stringify({ departure, returned }));
    assert.equal(returned.hash, departure.hash);
    assert.equal(returned.focused, "dream-character-ciel");
    assert.notEqual(returned.locked, "fixed");

    // A direct record fragment and an in-dialog switch exercise the two dossier families.
    await page.goto(`${base}/dream-chapter#dream-character-ciel`);
    ({ dialog, guide } = await openedGuide(page));
    await jump(page, guide, (await guide.locator("option").count()) - 1);
    await dialog.getByRole("button", { name: "CAST 02 東風谷 慶弥", exact: true }).click();
    ({ dialog, guide } = await openedGuide(page));
    assert.equal(
      await guide.locator("select").inputValue(),
      "0",
      "switching resets the previous file's destination",
    );
    await jump(page, guide, (await guide.locator("option").count()) - 1);
    await dialog.getByRole("button", { name: "AGENT 02 ロードケイオス", exact: true }).click();
    ({ dialog, guide } = await openedGuide(page));
    assert.equal(await guide.locator("select").inputValue(), "0");
    await jump(page, guide, (await guide.locator("option").count()) - 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.notEqual(await page.evaluate(() => document.body.style.position), "fixed");

    if (viewport.width === 1440) {
      for (const hash of [
        "dream-character-kaisaku",
        "dream-dolminence-lord-knight",
        "dream-dolminence-dread",
        "dream-dolminence-lupin",
      ]) {
        await page.goto(`${base}/dream-chapter#${hash}`);
        ({ dialog, guide } = await openedGuide(page));
        await jump(page, guide, (await guide.locator("option").count()) - 1);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine: engineName, viewport, last, status: "PASS" }));
    await page.close();
  }
} finally {
  await browser.close();
}
