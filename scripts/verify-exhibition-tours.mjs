import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8145";
const engine = process.env.PW_BROWSER || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "PW_BROWSER must be chromium or webkit");
const output = `output/playwright/exhibition-tours-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "chromium" ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : {},
);
const results = { engine, base, checks: [], errors: [] };
const key = "deception-world.gallery-tour-progress.v1";
const record = (name, detail = true) => results.checks.push({ name, detail });
const ready = (page) => page.locator('.gallery-tour-full-image[data-ready="true"]').waitFor();
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, ...options });
  // The verifier never sends application writes, even if a future page adds telemetry.
  await context.route("**/*", (route) =>
    ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.setDefaultTimeout(30000);
  return page;
}
try {
  const page = await newPage();
  await page.goto(`${base}/gallery-tours?tour=starlight&work=g05`);
  await ready(page);
  for (const route of ["/gallery-tours?tour=starlight&work=g05", "/gallery-tours", "/exhibition"]) {
    await page.goto(`${base}${route}`);
    await page.locator("main h1").waitFor();
    await page.waitForLoadState("networkidle");
    if (route.includes("work=")) await ready(page);
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.document <= dimensions.viewport,
        `${route} at ${width}: ${JSON.stringify(dimensions)}`,
      );
      await page.screenshot({
        path: `${output}/${route.includes("work=") ? "theatre" : route === "/exhibition" ? "exhibition" : "entrance"}-${width}.png`,
        fullPage: true,
      });
      record(`overflow ${route} ${width}`, dimensions);
    }
  }
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(`${base}/gallery-tours?tour=starlight&work=g05`);
  await ready(page);
  await page.locator('.gallery-tour-filmstrip button[aria-current="step"]').focus();
  for (const [press, work] of [
    ["Home", "g05"],
    ["ArrowRight", "g07"],
    ["End", "g113"],
    ["ArrowLeft", "g90"],
  ]) {
    await page.keyboard.press(press);
    await page.waitForURL((url) => url.searchParams.get("work") === work);
    await page.waitForFunction(() => {
      const active = document.querySelector('.gallery-tour-filmstrip button[aria-current="step"]');
      const strip = document.querySelector(".gallery-tour-filmstrip");
      if (!active || !strip) return false;
      const box = active.getBoundingClientRect();
      const bounds = strip.getBoundingClientRect();
      return (
        active === document.activeElement &&
        box.left >= bounds.left - 1 &&
        box.right <= bounds.right + 1
      );
    });
    assert.equal(await page.locator('.gallery-tour-filmstrip button[tabindex="0"]').count(), 1);
    record(`filmstrip ${press}`, work);
  }
  await ready(page);
  await page.getByRole("combobox", { name: "一枚を眺める時間" }).selectOption("8");
  await page.locator(".gallery-tour-play-button").click();
  assert.equal(
    await page.locator(".gallery-tour-play-button").getAttribute("aria-pressed"),
    "true",
  );
  const stoppedUrl = page.url();
  await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".gallery-tour-play-button")?.getAttribute("aria-pressed") === "false",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
  await page.waitForTimeout(8500);
  assert.equal(page.url(), stoppedUrl);
  assert.equal(
    await page.locator(".gallery-tour-play-button").getAttribute("aria-pressed"),
    "false",
  );
  record("menu stops autoplay through close and interval");
  await page.locator('.gallery-tour-filmstrip button[aria-current="step"]').focus();
  await page.keyboard.press("End");
  await ready(page);
  await page.waitForFunction(
    (storageKey) =>
      JSON.parse(localStorage.getItem(storageKey) || "{}").starlight?.workId === "g113",
    key,
  );
  await page.getByRole("button", { name: "← 巡回一覧に戻る", exact: true }).click();
  await page
    .getByRole("button", { name: "最後の作品をもう一度：星光をたどる", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("work") === "g113");
  await page.reload();
  await ready(page);
  assert.equal(new URL(page.url()).searchParams.get("work"), "g113");
  record("last artwork resumes after reload");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("QA clipboard denied")) },
    }),
  );
  await page.getByRole("button", { name: "この場面のリンクをコピー", exact: true }).click();
  const fallback = page.getByRole("textbox", { name: "この場面のツアーリンク" });
  await fallback.waitFor();
  assert.equal(await fallback.getAttribute("readonly"), null);
  assert.equal(await fallback.inputValue(), page.url());
  assert.equal(
    await fallback.evaluate(
      (node) =>
        document.activeElement === node &&
        node.selectionStart === 0 &&
        node.selectionEnd === node.value.length,
    ),
    true,
  );
  const clipboardEvents = await fallback.evaluate((node) => {
    const events = [
      new Event("copy", { bubbles: true, cancelable: true }),
      new Event("contextmenu", { bubbles: true, cancelable: true }),
      new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }),
      new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }),
    ];
    return events.map((event) => {
      node.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  assert.deepEqual(clipboardEvents, [false, false, false, false]);
  await fallback.fill("https://example.invalid/edited");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }),
  );
  await page.getByRole("button", { name: "この場面のリンクをコピー", exact: true }).click();
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="この場面のツアーリンク"]');
    return (
      input?.value === location.href &&
      input === document.activeElement &&
      input.selectionStart === 0 &&
      input.selectionEnd === input.value.length
    );
  });
  const protectedCopy = await page.locator("main h1").evaluate((node) => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(protectedCopy, true, "Existing artwork/text protection must remain active");
  record("clipboard denial exposes native copy and restores canonical URL on synchronous retry");

  const denied = await newPage();
  await denied.addInitScript((storageKey) => {
    const original = Storage.prototype.getItem;
    window.__restoreTourStorage = () => {
      Storage.prototype.getItem = original;
    };
    Storage.prototype.getItem = function (item) {
      if (item === storageKey) throw new DOMException("QA storage denied", "SecurityError");
      return original.call(this, item);
    };
  }, key);
  await denied.goto(`${base}/gallery-tours`);
  await denied.waitForLoadState("networkidle");
  const warning = denied.getByText(
    "このブラウザーでは再開位置を保存できません。ツアーはそのまま鑑賞できます。",
    { exact: true },
  );
  await warning.waitFor();
  await denied.getByRole("button", { name: "このコースを巡る：星光をたどる", exact: true }).click();
  await ready(denied);
  await denied.evaluate((storageKey) => {
    window.__restoreTourStorage();
    window.dispatchEvent(
      new StorageEvent("storage", { key: storageKey, storageArea: localStorage }),
    );
  }, key);
  await warning.waitFor({ state: "hidden" });
  record("tour storage failure remains usable and recovers");

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${base}/exhibition`);
  const stage = page.locator(".exhibition-studio-stage");
  await stage.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-studio-ready="true"]') ||
      document.querySelector(".exhibition-studio-notice button"),
  );
  const supported = (await stage.getAttribute("data-studio-ready")) === "true";
  if (supported) {
    await page.getByRole("button", { name: "斜めから", exact: true }).click();
    await page.getByRole("button", { name: "原画表示", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "展示空間に戻す", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const canvas = await page.locator(".exhibition-studio-canvas").elementHandle();
    await canvas.evaluate((node) =>
      node.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
    await page.getByRole("button", { name: "3D表示を再試行", exact: true }).click();
    await page.waitForFunction(
      (old) => document.querySelector(".exhibition-studio-canvas") !== old,
      canvas,
    );
    await page.locator('[data-studio-ready="true"]').waitFor();
    assert.equal(await canvas.evaluate((node) => node.isConnected), false);
    await canvas.dispose();
    assert.equal(
      await page
        .getByRole("button", { name: "斜めから", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    record("WebGL context loss retries with new canvas and preserved view");
  } else {
    assert.equal(
      await page.getByRole("button", { name: "3D表示を再試行", exact: true }).isVisible(),
      true,
    );
    assert.equal(await page.locator(".exhibition-studio-original img").isVisible(), true);
    record("WebGL unsupported", {
      originalVisible: true,
      retryAvailable: true,
      contextLossTest: "not exercised",
    });
  }
  await page.screenshot({ path: `${output}/exhibition-recovery.png`, fullPage: true });
  const reduced = await newPage({ reducedMotion: "reduce" });
  await reduced.goto(`${base}/exhibition`);
  await reduced.locator(".exhibition-room-source").waitFor();
  await reduced.waitForLoadState("networkidle");
  // Prove client hydration completed, rather than counting the SSR fallback.
  await reduced.getByRole("combobox", { name: "展示する原画" }).selectOption("g19");
  await reduced.waitForURL((url) => url.searchParams.get("work") === "g19");
  await reduced.waitForFunction(() => {
    const image = document.querySelector(".exhibition-room-source");
    return image?.complete && image.naturalWidth > 0;
  });
  assert.equal(await reduced.locator(".exhibition-studio-canvas").count(), 0);
  record("reduced motion renders original without studio canvas");
  assert.deepEqual(results.errors, [], "Unexpected page errors");
} catch (error) {
  results.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      engine,
      checks: results.checks.length,
      output,
      failure: results.failure || null,
    }),
  );
}
