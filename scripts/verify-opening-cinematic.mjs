// The opening in a real browser: the alpha-keyed logos (no box), the burn
// (the ice logo consumed by fire, the prism logo emerging), the ENTER THE
// WORLD dive, their tiers, controls, performance, and a frame-exact WCAG 2.3.1
// flash audit at 60 fps (seeked through the ?opening-audit test hook) that
// fails above one flash a second (WCAG allows three).
//
//   BASE_URL=http://localhost:8095 PW_BROWSER_CHANNEL=chrome node scripts/verify-opening-cinematic.mjs
//
// OPENING_PROFILES=pixel,desktop            limit the viewports (default: both)
// OPENING_SECTIONS=behaviour,perf,flash     limit the checks (default: all; flash-burn
//                                           or flash-dive audit one of the two)
// OPENING_TIERS=webgl,css,reduced           limit the flash-audit tiers (default: all)
// OPENING_SHOTS_DIR=/abs/dir                also save keyframe PNGs and contact sheets
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8080";
const channel = process.env.PW_BROWSER_CHANNEL || "chrome";
const shotsDir = process.env.OPENING_SHOTS_DIR || "";
const sections = new Set((process.env.OPENING_SECTIONS || "behaviour,perf,flash").split(","));
const tiers = (process.env.OPENING_TIERS || "webgl,css,reduced").split(",");

const PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const PROFILES = {
  pixel: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: PIXEL_UA,
  },
  iphone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: { width: 1440, height: 900 } },
};
const profileNames = (process.env.OPENING_PROFILES || "pixel,desktop")
  .split(",")
  .filter((name) => PROFILES[name]);

// Mirrors src/components/cinematic/opening-timing.ts.
const SEQUENCE_SECONDS = 7.2;
const DIVE = { glEnd: 1.45 };
const FPS = 60;

const warnings = [];
const warn = (message) => {
  warnings.push(message);
  console.warn(`WARN ${message}`);
};

const SAVE_DATA = () => {
  Object.defineProperty(Navigator.prototype, "connection", {
    configurable: true,
    get: () => ({
      saveData: true,
      effectiveType: "4g",
      addEventListener() {},
      removeEventListener() {},
    }),
  });
};
const NO_WEBGL = () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/i.test(String(type))) return null;
    return getContext.call(this, type, ...rest);
  };
};
// Counts the opening's contexts (by canvas class) and keeps them for isContextLost().
const COUNT_WEBGL = () => {
  window.__glContexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (/webgl/i.test(String(type)) && context) {
      window.__glContexts.push({ kind: this.className, context });
    }
    return context;
  };
};
// GL never ready in time: the parallel compile never completes.
const STALL_COMPILE = () => {
  const getProgramParameter = WebGLRenderingContext.prototype.getProgramParameter;
  WebGLRenderingContext.prototype.getProgramParameter = function (program, pname) {
    if (pname === 0x91b1) return false; // COMPLETION_STATUS_KHR
    return getProgramParameter.call(this, program, pname);
  };
};
// A capable phone reports its cores; headless reports the host's.
const EIGHT_CORES = () => {
  Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
    configurable: true,
    get: () => 8,
  });
};

async function openTitle(browser, name, { audit = false, init = [], reducedMotion = false } = {}) {
  const context = await browser.newContext(PROFILES[name]);
  for (const script of init) await context.addInitScript(script);
  const page = await context.newPage();
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (audit) await page.clock.install();
  await page.goto(new URL(audit ? "/?opening-audit" : "/", base).href);
  await page.waitForSelector(".cine-stage");
  return { context, page, errors };
}

const contexts = (page) =>
  page.evaluate(() =>
    (window.__glContexts ?? []).map(({ kind, context }) => ({
      kind,
      lost: context.isContextLost(),
    })),
  );

const logoOpacity = (page) =>
  page.evaluate(() => ({
    first: Number(getComputedStyle(document.querySelector(".cine-logo-first")).opacity),
    core: Number(getComputedStyle(document.querySelector(".cine-logo-core")).opacity),
    burn: document.querySelector(".cine-title-lockup").dataset.burn ?? null,
    canvas: document.querySelectorAll(".cine-burn-canvas").length,
  }));

/** RGB of a screenshot at points (viewport px), 5x5 averages, decoded in a scratch page. */
async function samplePixels(browser, buffer, points, scale) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([data, spots, ratio]) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return spots.map(([x, y]) => {
          const px = context.getImageData(
            Math.round(x * ratio) - 2,
            Math.round(y * ratio) - 2,
            5,
            5,
          ).data;
          const sum = [0, 0, 0];
          for (let index = 0; index < px.length; index += 4) {
            for (let channel = 0; channel < 3; channel += 1) sum[channel] += px[index + channel];
          }
          return sum.map((value) => Math.round(value / 25));
        });
      },
      [buffer.toString("base64"), points, scale],
    );
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- behaviour
async function checkLogoSitsInScene(browser, name) {
  const { context, page, errors } = await openTitle(browser, name, { reducedMotion: true });
  await page.locator(".cine-stage.is-complete").waitFor();
  await page.evaluate(() => document.querySelector(".cine-logo-core").decode());
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const logo = document.querySelector(".cine-logo-core");
    const box = logo.getBoundingClientRect();
    return {
      src: new URL(logo.currentSrc).pathname,
      box: [box.left, box.top, box.width, box.height],
      boxed: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  assert.match(state.src, /^\/logo-title-prism-20260924-delivery-\d+\.webp$/, state.src);
  // The corners of the logo's box, with and without the logo: an alpha-keyed
  // logo leaves the scene there untouched (the old matte was a black box).
  const [x, y, w, h] = state.box;
  const corners = [
    [x + w * 0.03, y + h * 0.04],
    [x + w * 0.97, y + h * 0.04],
    [x + w * 0.03, y + h * 0.96],
    [x + w * 0.97, y + h * 0.96],
    [x + w * 0.5, y + h * 0.03],
  ].map(([px, py]) => [
    Math.min(PROFILES[name].viewport.width - 3, Math.max(3, px)),
    Math.min(PROFILES[name].viewport.height - 3, Math.max(3, py)),
  ]);
  const scale = PROFILES[name].deviceScaleFactor ?? 1;
  const withLogo = await samplePixels(browser, await page.screenshot(), corners, scale);
  await page.addStyleTag({ content: ".cine-logo-wrap { visibility: hidden !important; }" });
  await page.waitForTimeout(100);
  const withoutLogo = await samplePixels(browser, await page.screenshot(), corners, scale);
  const diff = Math.max(
    ...withLogo.flatMap((rgb, index) =>
      rgb.map((value, c) => Math.abs(value - withoutLogo[index][c])),
    ),
  );
  assert.ok(
    diff <= 6,
    `${name}: the logo box shows at its corners (${diff}) ${JSON.stringify({ withLogo, withoutLogo })}`,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "logo-in-scene", name, src: state.src, cornerDiff: diff }));
  await context.close();
}

async function checkBurnWebgl(browser, name) {
  const { context, page, errors } = await openTitle(browser, name, { init: [COUNT_WEBGL] });
  await page.waitForSelector(".cine-title-lockup[data-burn]", { timeout: 8000 });
  const during = await logoOpacity(page);
  assert.equal(during.burn, "webgl", `${name}: capable devices (Android included) burn in WebGL`);
  assert.equal(during.canvas, 1);
  assert.equal(during.first, 0, `${name}: the canvas replaced the DOM ice logo`);
  await page.waitForSelector('.cine-title-lockup[data-burn-phase="done"]', { timeout: 6000 });
  const done = await logoOpacity(page);
  const stats = await page.evaluate(() => window.__openingBurnStats);
  assert.equal(done.canvas, 0, `${name}: the burn canvas is removed after the hand-off`);
  assert.equal(done.core, 1, `${name}: the DOM prism logo takes over`);
  assert.equal(stats.released, true);
  const burnContexts = (await contexts(page)).filter((entry) => entry.kind === "cine-burn-canvas");
  assert.equal(burnContexts.length, 1, `${name}: one burn context ${JSON.stringify(burnContexts)}`);
  assert.ok(
    burnContexts.every((entry) => entry.lost),
    `${name}: the burn context is released`,
  );
  await page.locator(".cine-stage.is-complete").waitFor({ timeout: 6000 });
  const complete = await logoOpacity(page);
  assert.deepEqual(
    { first: complete.first, core: complete.core, burn: complete.burn, canvas: complete.canvas },
    { first: 0, core: 1, burn: null, canvas: 0 },
  );
  // もう一度 burns again, from the ice logo.
  // もう一度 ignores a pointer press for 600 ms after the title settles
  // (REPLAY_GUARD_MS): that press is the second half of a double tap on スキップ.
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: "もう一度" }).click();
  await page.locator(".cine-stage.is-playing").waitFor();
  assert.equal((await logoOpacity(page)).first, 1, `${name}: replay starts on the ice logo`);
  await page.waitForSelector('.cine-title-lockup[data-burn="webgl"]', { timeout: 8000 });
  // Skip mid-burn lands on the prism logo in one change.
  await page.keyboard.press("Escape");
  await page.locator(".cine-stage.is-complete").waitFor();
  const skipped = await logoOpacity(page);
  assert.deepEqual(
    { first: skipped.first, core: skipped.core, burn: skipped.burn, canvas: skipped.canvas },
    { first: 0, core: 1, burn: null, canvas: 0 },
    `${name}: skip lands on the prism logo`,
  );
  const all = await contexts(page);
  assert.ok(all.filter((entry) => entry.kind === "cine-burn-canvas").every((entry) => entry.lost));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      check: "burn-webgl",
      name,
      size: stats.size,
      draws: stats.draws,
      rung: stats.rungChanges,
    }),
  );
  await context.close();
}

async function checkBurnTiers(browser, name) {
  for (const [label, options, expected] of [
    ["save-data", { init: [SAVE_DATA] }, "css"],
    ["no-webgl", { init: [NO_WEBGL] }, "css"],
    ["gl-not-ready", { init: [STALL_COMPILE] }, "css"],
  ]) {
    const { context, page, errors } = await openTitle(browser, name, options);
    await page.waitForSelector(".cine-title-lockup[data-burn]", { timeout: 8000 });
    const state = await logoOpacity(page);
    assert.equal(state.burn, expected, `${name} ${label}: tier`);
    assert.equal(state.canvas, 0);
    await page.locator(".cine-stage.is-complete").waitFor({ timeout: 8000 });
    const complete = await logoOpacity(page);
    assert.equal(complete.core, 1);
    assert.deepEqual(errors, []);
    const stats = await page.evaluate(() => window.__openingBurnStats ?? null);
    console.log(
      JSON.stringify({
        check: "burn-tier",
        name,
        label,
        tier: state.burn,
        fallback: stats?.fallback ?? null,
      }),
    );
    await context.close();
  }
  // Reduced motion: the prism logo directly, no burn, no GL.
  const { context, page, errors } = await openTitle(browser, name, {
    reducedMotion: true,
    init: [COUNT_WEBGL],
  });
  await page.locator(".cine-stage.is-complete").waitFor();
  await page.waitForTimeout(3500);
  const state = await logoOpacity(page);
  assert.deepEqual(
    { core: state.core, burn: state.burn, canvas: state.canvas },
    { core: 1, burn: null, canvas: 0 },
  );
  assert.equal(
    (await contexts(page)).filter((entry) => entry.kind === "cine-burn-canvas").length,
    0,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "burn-tier", name, label: "reduced", tier: "reduced" }));
  await context.close();
}

async function pressEnter(page, name) {
  const button = page.getByRole("button", { name: "ENTER THE WORLD", exact: true });
  if (PROFILES[name].hasTouch) await button.tap();
  else await button.click();
}

async function checkDive(browser, name) {
  for (const [label, options, expected] of [
    ["capable", { init: [COUNT_WEBGL] }, "webgl"],
    ["no-webgl", { init: [NO_WEBGL] }, "css"],
    ["save-data", { init: [SAVE_DATA, COUNT_WEBGL] }, "css"],
    ["reduced", { reducedMotion: true, init: [COUNT_WEBGL] }, "reduced"],
  ]) {
    const { context, page, errors } = await openTitle(browser, name, options);
    if (!options.reducedMotion) {
      await page.locator(".cine-stage.is-playing").waitFor();
      await page.keyboard.press("Escape");
    }
    await page.locator(".cine-stage.is-complete").waitFor();
    await page.waitForTimeout(1500); // the dive's images are prepared in idle time
    const pressedAt = Date.now();
    await pressEnter(page, name);
    await page.waitForFunction(
      () => {
        const tier = document.querySelector("[data-opening-handoff-root]")?.dataset
          .openingHandoffTier;
        return tier && tier !== "pending";
      },
      null,
      { timeout: 3000 },
    );
    const tier = await page.evaluate(
      () => document.querySelector("[data-opening-handoff-root]").dataset.openingHandoffTier,
    );
    const readyAfter = Date.now() - pressedAt;
    assert.equal(tier, expected, `${name} ${label}: dive tier`);
    if (tier === "webgl") {
      assert.equal(await page.locator(".opening-dive-canvas").count(), 1);
      assert.ok(readyAfter <= 800, `${name}: GL ready ${readyAfter} ms after the press`);
    }
    await page.waitForURL(/\/world$/, { timeout: 8000 });
    await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached", timeout: 8000 });
    const after = await page.evaluate(() => ({
      canvases: document.querySelectorAll(".opening-dive-canvas").length,
      loading: document.documentElement.hasAttribute("data-loading"),
      stats: window.__openingDiveStats ?? null,
    }));
    assert.equal(after.canvases, 0);
    assert.equal(after.loading, false);
    const dive = (await contexts(page)).filter((entry) => entry.kind === "opening-dive-canvas");
    if (tier === "webgl") {
      assert.equal(dive.length, 1, `${name}: one dive context ${JSON.stringify(dive)}`);
      // Primed at pointerdown (touch: 60 ms into the contact or at pointerup).
      assert.equal(after.stats.primed, true, `${name}: the dive adopted the primed context`);
      if (readyAfter > 450) warn(`${name}: GL ready ${readyAfter} ms after the press`);
    }
    assert.ok(
      dive.every((entry) => entry.lost),
      `${name} ${label}: dive contexts released`,
    );
    if (expected !== "webgl") assert.equal(dive.length, 0, `${name} ${label}: no dive context`);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        check: "dive",
        name,
        label,
        tier,
        readyAfter,
        primed: after.stats?.primed ?? null,
        fallback: after.stats?.fallback ?? null,
        size: after.stats?.size ?? null,
      }),
    );
    await context.close();
  }
  // A press that never becomes a click primes one context, released after its TTL.
  if (!PROFILES[name].hasTouch) {
    const { context, page, errors } = await openTitle(browser, name, { init: [COUNT_WEBGL] });
    await page.locator(".cine-stage.is-playing").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    const box = await page
      .getByRole("button", { name: "ENTER THE WORLD", exact: true })
      .boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 200);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const primedNow = (await contexts(page)).filter(
      (entry) => entry.kind === "opening-dive-canvas",
    );
    await page.waitForTimeout(1600);
    const later = (await contexts(page)).filter((entry) => entry.kind === "opening-dive-canvas");
    assert.equal(primedNow.length, 1, `${name}: pointerdown primes the dive`);
    assert.ok(
      later.every((entry) => entry.lost),
      `${name}: an unclaimed prime is released`,
    );
    assert.equal(new URL(page.url()).pathname, "/");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ check: "dive-prime-ttl", name, primed: primedNow.length, released: true }),
    );
    await context.close();
  }
}

// ---------------------------------------------------------------- performance
async function checkPerformance(browser) {
  const name = "pixel";
  const observe = () => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
      }
    }).observe({ type: "longtask", buffered: true });
  };
  // The burn, from the first frame of the title, with a 4x slower CPU.
  {
    const { context, page, errors } = await openTitle(browser, name, {
      init: [EIGHT_CORES, observe],
    });
    const cdp = await context.newCDPSession(page);
    await page.locator(".cine-stage.is-playing").waitFor();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.waitForSelector(".cine-title-lockup[data-burn]", { timeout: 10_000 });
    const startedAt = await page.evaluate(() => performance.now());
    await page.waitForSelector('.cine-title-lockup[data-burn-phase="done"]', { timeout: 10_000 });
    const endedAt = await page.evaluate(() => performance.now());
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const perf = await page.evaluate(
      ([from, to]) => {
        const stats = window.__openingBurnStats;
        const sorted = [...stats.renderMs].sort((a, b) => a - b);
        const pick = (q) => Number((sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2));
        return {
          tier: stats.tier,
          draws: stats.draws,
          seconds: Number(((to - from) / 1000).toFixed(2)),
          drawsPerSecond: Number((stats.draws / ((to - from) / 1000)).toFixed(1)),
          cadenceMs: stats.cadenceMs,
          framesPerDraw: stats.framesPerDraw,
          jsPerDrawP50: pick(0.5),
          jsPerDrawP95: pick(0.95),
          size: stats.size,
          rungChanges: stats.rungChanges,
          longTasksDuringBurn: window.__longTasks.filter(
            ([start]) => start >= from - 5 && start <= to,
          ),
          longTasksBefore: window.__longTasks.filter(([start]) => start < from - 5),
        };
      },
      [startedAt, endedAt],
    );
    assert.equal(perf.tier, "webgl");
    const longest = Math.max(0, ...perf.longTasksDuringBurn.map(([, duration]) => duration));
    assert.ok(perf.drawsPerSecond >= 55, `burn: ${perf.drawsPerSecond} draws/s at 4x CPU`);
    if (perf.jsPerDrawP95 >= 2) warn(`burn: JS per draw p95 ${perf.jsPerDrawP95} ms`);
    if (perf.longTasksBefore.some(([, duration]) => duration > 50)) {
      warn(`burn: long tasks before the burn ${JSON.stringify(perf.longTasksBefore)}`);
    }
    assert.ok(longest <= 50, `burn: long task ${longest} ms during the burn`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "performance-burn-cpu4x", name, ...perf }));
    await context.close();
  }
  // The dive, from the press to the landing frame, with a 4x slower CPU.
  {
    const { context, page, errors } = await openTitle(browser, name, {
      init: [EIGHT_CORES, observe],
    });
    const cdp = await context.newCDPSession(page);
    await page.locator(".cine-stage.is-playing").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".cine-stage.is-complete").waitFor();
    await page.waitForTimeout(1500);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const pressedAt = await page.evaluate(() => performance.now());
    await pressEnter(page, name);
    await page.waitForFunction(() => window.__openingDiveStats?.drawSpanMs != null, null, {
      timeout: 10_000,
    });
    const landedAt = await page.evaluate(() => performance.now());
    await page
      .locator("[data-opening-handoff-root]")
      .waitFor({ state: "detached", timeout: 15_000 });
    const arrivedAt = await page.evaluate(() => performance.now());
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const perf = await page.evaluate(
      ([pressed, landed, arrived]) => {
        const stats = window.__openingDiveStats;
        const sorted = [...stats.renderMs].sort((a, b) => a - b);
        const pick = (q) => Number((sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2));
        return {
          tier: stats.tier,
          primed: stats.primed,
          readyMs: stats.readyMs,
          draws: stats.draws,
          drawSpanMs: stats.drawSpanMs,
          drawsPerSecond: Number((stats.draws / (stats.drawSpanMs / 1000)).toFixed(1)),
          cadenceMs: stats.cadenceMs,
          framesPerDraw: stats.framesPerDraw,
          jsPerDrawP95: pick(0.95),
          size: stats.size,
          rungChanges: stats.rungChanges,
          pressToLandedMs: Math.round(landed - pressed),
          pressToArrivedMs: Math.round(arrived - pressed),
          allLongTasks: window.__longTasks.map(([start, duration]) => [
            Math.round(start - pressed),
            duration,
          ]),
          longTasksDuringDive: window.__longTasks.filter(
            ([start]) =>
              start >= pressed - 5 && start <= pressed + (stats.readyMs ?? 0) + stats.drawSpanMs,
          ),
          // The route renders under the still landing frame (compositor-only).
          longTasksUnderLandingFrame: window.__longTasks.filter(
            ([start]) =>
              start > pressed + (stats.readyMs ?? 0) + stats.drawSpanMs && start <= arrived,
          ),
        };
      },
      [pressedAt, landedAt, arrivedAt],
    );
    console.log(JSON.stringify({ check: "performance-dive-cpu4x", name, ...perf }));
    assert.equal(perf.tier, "webgl");
    const longest = Math.max(0, ...perf.longTasksDuringDive.map(([, duration]) => duration));
    assert.ok(perf.drawsPerSecond >= 55, `dive: ${perf.drawsPerSecond} draws/s at 4x CPU`);
    assert.ok(longest <= 50, `dive: long task ${longest} ms while the shader draws`);
    assert.deepEqual(errors, []);
    await context.close();
  }
}

// ---------------------------------------------------------------- flashes
async function createAnalyser(browser, cell, viewport) {
  const page = await browser.newPage();
  await page.evaluate(
    ({ cell, viewport }) => {
      const S = 4; // analyse at 1/4 CSS resolution
      const W = Math.round(viewport.width / S);
      const H = Math.round(viewport.height / S);
      const cw = Math.round(cell.w / S);
      const ch = Math.round(cell.h / S);
      const canvas = new OffscreenCanvas(W, H);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const lut = Array.from({ length: 256 }, (_, index) => {
        const v = index / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      const series = [];
      const bitmapOf = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        return createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      };
      const analyse = (t) => {
        const px = context.getImageData(0, 0, W, H).data;
        const cells = [];
        for (let cy = 0; cy + ch <= H; cy += Math.max(1, Math.floor(ch / 2))) {
          for (let cx = 0; cx + cw <= W; cx += Math.max(1, Math.floor(cw / 2))) {
            let r = 0;
            let g = 0;
            let b = 0;
            let n = 0;
            for (let y = cy; y < cy + ch; y += 1) {
              for (let x = cx; x < cx + cw; x += 1) {
                const i = (y * W + x) * 4;
                r += lut[px[i]];
                g += lut[px[i + 1]];
                b += lut[px[i + 2]];
                n += 1;
              }
            }
            r /= n;
            g /= n;
            b /= n;
            cells.push({
              L: 0.2126 * r + 0.7152 * g + 0.0722 * b,
              red: Math.max(0, (r - g - b) * 320),
              sat: r / Math.max(1e-6, r + g + b),
            });
          }
        }
        series.push({ t, cells });
      };
      window.addFrame = async (t, base64) => {
        context.globalAlpha = 1;
        context.drawImage(await bitmapOf(base64), 0, 0, W, H);
        analyse(t);
      };
      // An opacity cross-fade from frame A to frame B (the compositor blends in sRGB).
      const held = {};
      window.holdFrame = async (key, base64) => {
        held[key] = await bitmapOf(base64);
      };
      window.addBlend = (t, from, to, alpha) => {
        context.globalAlpha = 1;
        context.drawImage(held[from], 0, 0, W, H);
        context.globalAlpha = alpha;
        context.drawImage(held[to], 0, 0, W, H);
        context.globalAlpha = 1;
        analyse(t);
      };
      // Opposing transitions per cell with extremum tracking; flashes = pairs in any 1 s.
      window.countFlashes = () => {
        const cells = series[0].cells.length;
        const count = (get, threshold, qualifies) => {
          let worst = { perSecond: 0, cell: -1, at: null };
          for (let c = 0; c < cells; c += 1) {
            const transitions = [];
            let ref = get(series[0].cells[c]);
            let refCell = series[0].cells[c];
            let direction = 0;
            for (const frame of series) {
              const current = frame.cells[c];
              const value = get(current);
              const delta = value - ref;
              if (Math.abs(delta) >= threshold && qualifies(refCell, current)) {
                const next = Math.sign(delta);
                if (next !== direction) {
                  transitions.push(frame.t);
                  direction = next;
                }
                ref = value;
                refCell = current;
              } else if (
                Math.sign(delta) === direction &&
                ((direction > 0 && value > ref) || (direction < 0 && value < ref))
              ) {
                ref = value;
                refCell = current;
              }
            }
            for (let i = 0; i < transitions.length; i += 1) {
              const inWindow = transitions.filter(
                (t) => t >= transitions[i] && t < transitions[i] + 1,
              ).length;
              const flashes = Math.floor(inWindow / 2);
              if (flashes > worst.perSecond) {
                worst = {
                  perSecond: flashes,
                  cell: c,
                  at: Number(transitions[i].toFixed(2)),
                  transitions: transitions.map((t) => Number(t.toFixed(2))),
                };
              }
            }
          }
          if (worst.cell >= 0) {
            worst.trace = series
              .filter((frame) => frame.t >= worst.at - 0.2 && frame.t <= worst.at + 1.1)
              .map((frame) => `${frame.t.toFixed(2)}:${get(frame.cells[worst.cell]).toFixed(3)}`)
              .join(" ");
          }
          return worst;
        };
        const general = count(
          (cell) => cell.L,
          0.1,
          (a, b) => Math.min(a.L, b.L) < 0.8,
        );
        const red = count(
          (cell) => cell.red,
          20,
          (a, b) => a.sat >= 0.8 || b.sat >= 0.8,
        );
        const peak = series.reduce(
          (best, frame) => {
            const mean = frame.cells.reduce((sum, cell) => sum + cell.L, 0) / frame.cells.length;
            const max = Math.max(...frame.cells.map((cell) => cell.L));
            return {
              mean: Math.max(best.mean, mean),
              cell: Math.max(best.cell, max),
            };
          },
          { mean: 0, cell: 0 },
        );
        return {
          frames: series.length,
          cells,
          general,
          red,
          peakMeanL: Number(peak.mean.toFixed(3)),
          peakCellL: Number(peak.cell.toFixed(3)),
        };
      };
    },
    { cell, viewport },
  );
  return page;
}

function report(check, name, tier, result, extra = {}) {
  const worst = Math.max(result.general.perSecond, result.red.perSecond);
  console.log(
    JSON.stringify({
      check,
      name,
      tier,
      frames: result.frames,
      cells: result.cells,
      general: {
        perSecond: result.general.perSecond,
        at: result.general.at,
        transitions: result.general.transitions,
      },
      red: {
        perSecond: result.red.perSecond,
        at: result.red.at,
        transitions: result.red.transitions,
      },
      ...(process.env.OPENING_TRACE
        ? { generalTrace: result.general.trace, redTrace: result.red.trace }
        : {}),
      peakMeanL: result.peakMeanL,
      peakCellL: result.peakCellL,
      ...extra,
    }),
  );
  // No white-outs: no analysis cell (160 or 341x256 CSS px) ever goes near white.
  assert.ok(result.peakCellL < 0.8, `${name} ${tier}: a cell reached L ${result.peakCellL}`);
  assert.ok(
    worst <= 1,
    `${name} ${tier} ${check}: ${worst} flashes/s (target 1; WCAG 2.3.1 limit is 3)`,
  );
}

const cellFor = (viewport) => (viewport.width >= 1024 ? { w: 341, h: 256 } : { w: 160, h: 160 });
const shot = (page) => page.screenshot({ type: "jpeg", quality: 80, scale: "css" });

async function saveKeyframe(page, file) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, file) });
}

async function auditBurnFlashes(browser, name, tier) {
  const init = tier === "css" ? [SAVE_DATA] : [];
  const { context, page, errors } = await openTitle(browser, name, {
    audit: true,
    init,
    reducedMotion: tier === "reduced",
  });
  const viewport = PROFILES[name].viewport;
  const analyser = await createAnalyser(browser, cellFor(viewport), viewport);
  const add = async (t) => {
    const buffer = await shot(page);
    await analyser.evaluate(
      ([time, data]) => window.addFrame(time, data),
      [t, buffer.toString("base64")],
    );
  };
  let actualTier = "reduced";
  if (tier === "reduced") {
    // Reduced motion: the prism logo directly; the title is still throughout.
    await page.locator(".cine-stage.is-complete").waitFor();
    await page.waitForTimeout(800);
    for (let frame = 0; frame <= 60; frame += 1) {
      await add(frame / FPS);
      await page.waitForTimeout(16);
    }
    await saveKeyframe(page, `burn-${tier}-${name}-complete.png`);
  } else {
    await page.waitForFunction(() => window.__openingTest?.title?.phase === "playing", null, {
      timeout: 20_000,
    });
    const ready = await page.evaluate(() => window.__openingTest.title.ready());
    await page.evaluate(() => document.fonts.ready);
    const keyframes = new Set(
      [0.5, 1.5, 2.5, 2.7, 3.2, 3.6, 4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.5, 7.1].map((t) =>
        Math.round(t * FPS),
      ),
    );
    for (let frame = 0; frame <= SEQUENCE_SECONDS * FPS; frame += 1) {
      const t = frame / FPS;
      await page.evaluate((time) => window.__openingTest.title.seek(time), t);
      await add(t);
      if (keyframes.has(frame)) {
        await saveKeyframe(page, `burn-${tier}-${name}-${t.toFixed(2).replace(".", "_")}.png`);
      }
    }
    actualTier = await page.evaluate(() => window.__openingTest.title.burn?.tier ?? "css");
    assert.equal(actualTier, tier, `${name}: burn audit tier (prime: ${ready})`);
    // The end of the sequence: the complete title (the prism logo stays).
    await page.evaluate(() => window.__openingTest.title.finish());
    await page.clock.runFor(900);
    await add(SEQUENCE_SECONDS + 1 / FPS);
    await saveKeyframe(page, `burn-${tier}-${name}-complete.png`);
  }
  const result = await analyser.evaluate(() => window.countFlashes());
  await analyser.close();
  assert.deepEqual(errors, []);
  report("flashes-burn", name, tier, result);
  await context.close();
}

async function auditDiveFlashes(browser, name, tier) {
  const init = tier === "css" ? [NO_WEBGL] : [];
  const { context, page, errors } = await openTitle(browser, name, {
    audit: true,
    init,
    reducedMotion: tier === "reduced",
  });
  const viewport = PROFILES[name].viewport;
  const analyser = await createAnalyser(browser, cellFor(viewport), viewport);
  const add = async (t) => {
    const buffer = await shot(page);
    await analyser.evaluate(
      ([time, data]) => window.addFrame(time, data),
      [t, buffer.toString("base64")],
    );
  };
  const hold = async (key) => {
    const buffer = await shot(page);
    await analyser.evaluate(
      ([k, data]) => window.holdFrame(k, data),
      [key, buffer.toString("base64")],
    );
  };
  const blend = async (from, to, start, ms, easing) => {
    for (let frame = 0; frame <= Math.round((ms / 1000) * FPS); frame += 1) {
      const progress = Math.min(1, frame / ((ms / 1000) * FPS));
      await analyser.evaluate(
        ([t, a, b, alpha]) => window.addBlend(t, a, b, alpha),
        [start + frame / FPS, from, to, easing(progress)],
      );
    }
  };
  if (tier !== "reduced") {
    await page.waitForFunction(() => window.__openingTest?.title?.phase === "playing", null, {
      timeout: 20_000,
    });
    await page.evaluate(() => window.__openingTest.title.finish());
  }
  await page.locator(".cine-stage.is-complete").waitFor();
  await page.waitForTimeout(1600);
  for (let frame = -12; frame < 0; frame += 1) await add(frame / FPS);
  await pressEnter(page, name);
  let landedAt = 0;
  if (tier === "reduced") {
    // A 250 ms cross-fade to the cover, then a 250 ms cross-fade to the page.
    await hold("title");
    await page.waitForTimeout(600);
    await hold("cover");
    await blend("title", "cover", 0, 250, (p) => p);
    landedAt = 0.25;
  } else {
    await page.waitForFunction(() => window.__openingTest?.dive, null, { timeout: 5000 });
    const actual = await page.evaluate(() => window.__openingTest.dive.ready());
    assert.equal(actual, tier, `${name}: dive audit tier`);
    // Timers are held while the frames are sought, so LoadGate's covered
    // fail-safe cannot change the route in the middle of the audit.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5));
    const keyframes = new Set(
      [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1.05, 1.2, 1.44].map((t) => Math.round(t * FPS)),
    );
    for (let frame = 0; frame < DIVE.glEnd * FPS; frame += 1) {
      const t = frame / FPS;
      await page.evaluate((time) => window.__openingTest.dive.seek(time), t);
      await add(t);
      if (keyframes.has(frame)) {
        await saveKeyframe(page, `dive-${tier}-${name}-${t.toFixed(2).replace(".", "_")}.png`);
      }
    }
    await page.evaluate(() => window.__openingTest.dive.land());
    await page.clock.resume();
    landedAt = DIVE.glEnd;
    await add(landedAt);
    await hold("cover");
  }
  // The arrival: the landing still fades into the World page (both captured,
  // the fade composed at 60 fps with the layer's easing).
  await page.waitForURL(/\/world$/, { timeout: 10_000 });
  await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached", timeout: 10_000 });
  await hold("world");
  await saveKeyframe(page, `dive-${tier}-${name}-world.png`);
  const bezier = (p) => {
    // cubic-bezier(0.4, 0, 0.2, 1)
    let lo = 0;
    let hi = 1;
    const x = (u) => 3 * (1 - u) ** 2 * u * 0.4 + 3 * (1 - u) * u * u * 0.2 + u ** 3;
    for (let step = 0; step < 30; step += 1) {
      const mid = (lo + hi) / 2;
      if (x(mid) < p) lo = mid;
      else hi = mid;
    }
    const u = (lo + hi) / 2;
    return 3 * (1 - u) * u * u + u ** 3;
  };
  await blend(
    "cover",
    "world",
    landedAt + 1 / FPS,
    tier === "reduced" ? 250 : 520,
    tier === "reduced" ? (p) => p : bezier,
  );
  const result = await analyser.evaluate(() => window.countFlashes());
  await analyser.close();
  assert.deepEqual(errors, []);
  report("flashes-dive", name, tier, result);
  await context.close();
}

const browser = await chromium.launch({ channel });
try {
  if (sections.has("behaviour")) {
    for (const name of profileNames) {
      await checkLogoSitsInScene(browser, name);
      await checkBurnWebgl(browser, name);
      await checkBurnTiers(browser, name);
      await checkDive(browser, name);
    }
  }
  if (sections.has("perf") && profileNames.includes("pixel")) await checkPerformance(browser);
  for (const name of profileNames) {
    if (sections.has("flash") || sections.has("flash-burn")) {
      for (const tier of tiers) await auditBurnFlashes(browser, name, tier);
    }
    if (sections.has("flash") || sections.has("flash-dive")) {
      for (const tier of tiers) await auditDiveFlashes(browser, name, tier);
    }
  }
  console.log(JSON.stringify({ ok: true, warnings }));
} finally {
  await browser.close();
}
