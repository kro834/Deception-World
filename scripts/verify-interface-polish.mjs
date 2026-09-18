import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";

async function ready(page, route) {
  await page.goto(base + route);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function verifyDream(page, width) {
  await ready(page, "/dream-chapter");
  const actions = await page.locator(".dream-hero-actions a").evaluateAll((links) =>
    links.map((link) => {
      const bounds = link.getBoundingClientRect();
      const label = link.querySelector("span");
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const english = link.querySelector("b");
      return {
        label: label.textContent,
        lineCount: new Set(lines.map((rect) => Math.round(rect.top))).size,
        inside: lines.every((rect) => rect.left >= bounds.left && rect.right <= bounds.right),
        touchHeight: bounds.height,
        englishVisible: english.getBoundingClientRect().height > 0,
        englishClipped: english.scrollWidth > english.clientWidth + 1,
      };
    }),
  );
  assert.equal(actions.length, 2);
  for (const action of actions) {
    assert.equal(action.lineCount, 1, JSON.stringify(action));
    assert.ok(action.inside && action.touchHeight >= 44, JSON.stringify(action));
    if (width >= 981) assert.ok(action.englishVisible && !action.englishClipped);
    if (width <= 640) assert.equal(action.englishVisible, false);
  }
  if (process.env.CAPTURE_DIR) {
    await page.screenshot({ path: `${process.env.CAPTURE_DIR}/dream-${width}-after.png` });
  }
  for (const [selector, index] of [
    [".dream-character-grid button", 0],
    [".dream-dolminence-grid button", -1],
  ]) {
    const candidates = page.locator(selector);
    const trigger = index < 0 ? candidates.last() : candidates.nth(index);
    await trigger.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await trigger.tap();
    const dialog = page.locator(".dream-dossier-dialog[open]");
    await dialog.waitFor();
    const labels = await dialog
      .locator(".dream-dossier-title > p, .dream-dossier-sections > section > header span")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: node.textContent,
          font: parseFloat(getComputedStyle(node).fontSize),
          clipped: node.scrollWidth > node.clientWidth + 1,
        })),
      );
    assert.ok(labels.length >= 2);
    assert.ok(
      labels.every((label) => label.font >= 12 && !label.clipped),
      JSON.stringify(labels),
    );
    assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".dream-dossier-dialog[open]"));
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
      "hidden",
    );
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  console.log(`PASS ${width}px Dream: whole CTA labels, dossier metadata, open/close unlock`);
}

async function verifyEpisodeKeys(page, width) {
  await ready(page, "/world");
  const grid = page.locator(".episode-grid");
  await grid.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  const selectedLabel = () =>
    page.locator('.episode-card-select[aria-pressed="true"]').getAttribute("aria-label");
  const first = await selectedLabel();
  for (const selector of [".episode-card-select", ".episode-pickup-plus"]) {
    const button = grid.locator(selector).first();
    await button.focus();
    for (const key of ["ArrowRight", "ArrowLeft"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      assert.equal(await selectedLabel(), first, `${selector} must not navigate its ancestor`);
    }
  }
  const pickup = grid.locator(".episode-pickup-plus").first();
  await pickup.press("Enter");
  await page.locator(".episode-pickup-dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".episode-pickup-dialog[open]"));
  assert.equal(await pickup.evaluate((node) => document.activeElement === node), true);
  await grid.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    (label) =>
      document
        .querySelector('.episode-card-select[aria-pressed="true"]')
        ?.getAttribute("aria-label") !== label,
    first,
  );
  await page.waitForTimeout(600);
  assert.notEqual(await selectedLabel(), first, "region selection survives scroll settling");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(
    (label) =>
      document
        .querySelector('.episode-card-select[aria-pressed="true"]')
        ?.getAttribute("aria-label") === label,
    first,
  );
  await page.waitForTimeout(600);
  assert.equal(await selectedLabel(), first, "reverse selection survives scroll settling");
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
    "hidden",
  );
  console.log(
    `PASS ${width}px episode: child keys isolated, pickup keyboard focus, region arrows retained`,
  );
}

async function verifySpecs(page, route, width) {
  await ready(page, route);
  const specs = page.locator(".rxs-specs");
  await specs.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(500);
  const labels = await specs.locator("small, strong span, p").evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.closest(".rxs-specs").getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent,
        font: parseFloat(getComputedStyle(node).fontSize),
        inside: rect.left >= bounds.left && rect.right <= bounds.right + 1,
        clipped: node.scrollWidth > node.clientWidth + 1,
      };
    }),
  );
  assert.equal(labels.length, 6);
  assert.ok(
    labels.every((label) => label.font >= 12 && label.inside && !label.clipped),
    JSON.stringify(labels),
  );
  if (process.env.CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.CAPTURE_DIR}/${route.slice(1)}-specs-${width}-after.png`,
    });
  }
  console.log(`PASS ${width}px ${route}: readable processor names, units, and core counts`);
}

try {
  for (const width of [320, 390, 1024, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 700 ? 768 : 844 },
      hasTouch: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await verifyDream(page, width);
    await verifyEpisodeKeys(page, width);
    for (const route of ["/rexonance-saga", "/extreme-saga"]) await verifySpecs(page, route, width);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
