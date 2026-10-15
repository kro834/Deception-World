// Built-preview lifecycle checks in real browser engines with emulated iPad
// settings. This does not establish physical iPad Safari coverage.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4198";
const engines = (process.env.OPENING_ENGINES || "chromium,webkit").split(",");
const scenarios = (process.env.OPENING_CASES || "arrival-loss,covering-resize-loss,entry-visibility").split(",");
const output = process.env.OPENING_SHOTS_DIR || "output/playwright/opening-lifecycle";
await mkdir(output, { recursive: true });
const previous = await readFile(`${output}/results.json`, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "[]";
  throw error;
});
const results = JSON.parse(previous);
assert.ok(Array.isArray(results), "previous lifecycle results must be an array");

function installAuditEnvironment() {
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 8 });
  Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const media = matchMedia(query);
    if (query === "(display-mode: standalone)") Object.defineProperty(media, "matches", { value: true });
    return media;
  };
  window.__lifecycleContexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = getContext.call(this, type, ...args);
    if (/webgl/i.test(String(type)) && gl && this.className === "opening-dive-canvas") {
      window.__lifecycleContexts.push({ canvas: this, gl });
    }
    return gl;
  };
}

async function retainedState(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-opening-handoff-root]");
    const style = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const css = getComputedStyle(node);
      return { opacity: Number(css.opacity), visibility: css.visibility, transform: css.transform, background: css.backgroundColor };
    };
    const canvas = document.querySelector(".opening-dive-canvas");
    return {
      path: location.pathname,
      phase: root?.dataset.openingHandoffPhase,
      tier: root?.dataset.openingHandoffTier,
      landing: root?.dataset.openingHandoffLanding,
      root: style("[data-opening-handoff-root]"),
      world: style("[data-opening-handoff-world]"),
      logo: style("[data-opening-handoff-logo]"),
      tunnel: style("[data-opening-handoff-tunnel]"),
      canvas: canvas && { width: canvas.width, height: canvas.height },
      loading: document.documentElement.dataset.loading,
      handoffActive: document.documentElement.dataset.openingHandoffActive,
      rainCity: document.querySelectorAll("[data-opening-city-fallback], .opening-rain-city").length,
    };
  });
}

async function loseDiveContext(page) {
  assert.equal(await page.evaluate(() => {
    const recorded = window.__lifecycleContexts.find(({ gl }) => !gl.isContextLost());
    const extension = recorded?.gl.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(extension);
  }), true, "a live dive GL context must support deterministic context loss");
  await page.locator('[data-opening-handoff-landing="static"]').waitFor({ timeout: 1500 });
}

function assertStatic(state, phase) {
  assert.equal(state.phase, phase);
  assert.equal(state.tier, "css");
  assert.equal(state.landing, "static");
  assert.ok(state.root.opacity > 0, "the replacement remains visible through the owner's arrival fade");
  if (phase === "covering") assert.equal(state.root.opacity, 1, "the waiting landing remains opaque");
  assert.equal(state.root.background, "rgb(4, 8, 15)");
  assert.equal(state.world.visibility, "visible");
  assert.equal(state.world.opacity, 1);
  assert.equal(state.world.transform, "none");
  assert.equal(state.logo.visibility, "hidden");
  assert.equal(state.tunnel.visibility, "hidden");
  assert.equal(state.canvas, null, "the lost canvas is released");
  assert.equal(state.rainCity, 0);
}

async function verify(browser, engine, scenario) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: "no-preference",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(installAuditEnvironment);
  const page = await context.newPage();
  const errors = [];
  const browserDiagnostics = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // WebKit reports this unsupported viewport hint as a console error even
    // though the page and its lifecycle continue normally. Preserve the exact
    // diagnostic separately; every other console error still fails the check.
    if (message.text() === 'Viewport argument key "interactive-widget" not recognized and ignored.') {
      browserDiagnostics.push(message.text());
    } else errors.push(`console: ${message.text()}`);
  });
  let releaseWorld;
  let deferredRequests = 0;
  const blockedWorld = new Promise((resolve) => { releaseWorld = resolve; });
  if (scenario === "covering-resize-loss") {
    await context.route(/\/assets\/world-[A-Za-z0-9_-]{8}\.js(?:\?.*)?$/, async (route) => {
      deferredRequests++;
      await blockedWorld;
      await route.continue();
    });
  }
  const result = { engine, scenario, emulation: "iPad 27.2 standalone, 8 cores; not a physical device" };
  try {
    await page.goto(new URL("/?opening-audit", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__openingTest?.title);
    await page.evaluate(() => window.__openingTest.title.finish());
    const enter = page.getByRole("button", { name: "ディセプションワールドへ入る", exact: true });
    await enter.waitFor({ state: "visible" });
    assert.equal(await enter.isEnabled(), true, "visible title entry is enabled");
    await enter.focus();
    await page.waitForTimeout(1500);
    if (scenario === "entry-visibility") {
      result.lifecycle = "Synthetic visibilitychange and persisted pageshow in the same evaluate task after button.click(); no real tab hiding";
      result.immediate = await page.evaluate(() => {
        const button = document.querySelector(".cine-btn-primary");
        const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
        const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
        button.click();
        const beforeEvents = window.__openingTest.title.phase;
        try {
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
          Object.defineProperty(document, "hidden", { configurable: true, value: false });
          Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
          return { beforeEvents, afterEvents: window.__openingTest.title.phase, path: location.pathname };
        } finally {
          if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
          else delete document.hidden;
          if (visibilityDescriptor) Object.defineProperty(document, "visibilityState", visibilityDescriptor);
          else delete document.visibilityState;
        }
      });
      assert.equal(result.immediate.beforeEvents, "diving");
      assert.equal(result.immediate.afterEvents, "diving", "same-task lifecycle events must not abandon the owned entry");
      assert.equal(result.immediate.path, "/", "events were delivered before the asynchronous navigation");
      await page.waitForFunction(() => location.pathname === "/world" || window.__openingTest?.dive);
      // This audit flight has no realtime completion clock. A visibility
      // handler may already have landed it; land() is deliberately idempotent.
      await page.evaluate(() => window.__openingTest?.dive?.land());
    } else {
      await enter.tap();
      await page.waitForFunction(() => window.__openingTest?.dive);
      const tier = await page.evaluate(() => window.__openingTest.dive.ready());
      assert.equal(tier, "webgl", "this scenario must actually exercise the retained GL frame");
      await page.evaluate(() => {
        window.__openingTest.dive.seek(1.3);
        window.__openingTest.dive.land();
      });
    }

    if (scenario === "covering-resize-loss") {
      assert.ok(deferredRequests > 0, "a real World route chunk is deferred");
      const before = await retainedState(page);
      assert.equal(before.phase, "covering");
      assert.equal(before.path, "/");
      await page.setViewportSize({ width: 1180, height: 820 });
      await page.waitForFunction(() => {
        const root = document.querySelector("[data-opening-handoff-root]");
        return root && Math.abs(root.getBoundingClientRect().height - visualViewport.height) < 1;
      });
      const resized = await retainedState(page);
      assert.ok(resized.canvas.width !== before.canvas.width || resized.canvas.height !== before.canvas.height);
      assert.equal(resized.path, "/");
      assert.equal(resized.phase, "covering");
      await page.screenshot({ path: `${output}/${engine}-${scenario}-resized.png` });
      await loseDiveContext(page);
      result.retained = await retainedState(page);
      assertStatic(result.retained, "covering");
      await page.screenshot({ path: `${output}/${engine}-${scenario}-fallback.png` });
      releaseWorld();
    } else if (scenario === "arrival-loss") {
      await page.locator('[data-opening-handoff-phase="arriving"]').waitFor({ timeout: 10000 });
      // Navigation removes ?opening-audit, so arrival uses the normal fade.
      // Sample that fade and ensure the fallback never resets its opacity.
      const beforeLoss = await retainedState(page);
      await loseDiveContext(page);
      result.retained = await retainedState(page);
      assertStatic(result.retained, "arriving");
      assert.ok(result.retained.root.opacity <= beforeLoss.root.opacity + 0.02, "fallback must not restart the root fade");
      await page.screenshot({ path: `${output}/${engine}-${scenario}-fallback.png` });
    }

    await page.waitForURL((url) => url.pathname === "/world", { timeout: 15000 });
    await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached", timeout: 10000 });
    const finished = await retainedState(page);
    assert.notEqual(finished.loading, "true");
    assert.notEqual(finished.handoffActive, "true");
    assert.deepEqual(errors, []);
    if (scenario === "entry-visibility") await page.screenshot({ path: `${output}/${engine}-${scenario}-world.png` });
    result.finished = { path: finished.path, loading: finished.loading ?? null, handoffActive: finished.handoffActive ?? null };
    result.deferredRequests = deferredRequests;
    result.browserDiagnostics = browserDiagnostics;
    result.pass = true;
  } catch (error) {
    result.pass = false;
    result.error = error.message;
    result.errors = errors;
    result.state = await retainedState(page).catch(() => null);
    await page.screenshot({ path: `${output}/${engine}-${scenario}-failure.png` }).catch(() => undefined);
  } finally {
    releaseWorld();
    await context.close();
  }
  const previousIndex = results.findIndex((entry) => entry.engine === engine && entry.scenario === scenario);
  if (previousIndex === -1) results.push(result);
  else results[previousIndex] = result;
  console.log(JSON.stringify(result));
}

for (const engine of engines) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(engine === "chromium" ? { channel: "chrome" } : {});
  try {
    for (const scenario of scenarios) await verify(browser, engine, scenario);
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
