// RISING THE WORLD in a real browser: the gate after the footer, the
// sequence, its tiers, controls, performance and a frame-exact WCAG 2.3.1
// flash audit (60 fps, seeked through the ?rising-audit test hook, portal and
// title shake included). The audit enforces the one flash a second DESIGN.md
// promises (WCAG allows three), and a real-clock pass hammers the controls
// (held Enter, rapid clicks) with frames from a CDP screencast.
//
//   BASE_URL=http://127.0.0.1:8091 PW_BROWSER_CHANNEL=chrome node scripts/verify-rising-world.mjs
//
// RISING_PROFILES=pixel,galaxy,desktop  limit the viewports (default: all)
// RISING_SECTIONS=gate,sequence,tiers,perf,flash  limit the checks (default: all)
// RISING_TIERS=webgl,css,reduced  limit the flash-audit tiers (default: all)
// RISING_SHOTS_DIR=/abs/dir  also save keyframe PNGs from the flash audit
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { RISING_TIMING } from "../src/components/world/rising-timing.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const channel = process.env.PW_BROWSER_CHANNEL || "chrome";
const shotsDir = process.env.RISING_SHOTS_DIR || "";
const sections = new Set(
  (process.env.RISING_SECTIONS || "gate,sequence,tiers,perf,flash").split(","),
);

const PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const GALAXY_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";

const PROFILES = {
  pixel: {
    android: true,
    options: {
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: PIXEL_UA,
    },
  },
  galaxy: {
    android: true,
    options: {
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: GALAXY_UA,
    },
  },
  "phone-320": {
    options: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true },
  },
  "landscape-844": {
    options: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  },
  "tablet-1024": { options: { viewport: { width: 1024, height: 768 } } },
  desktop: { options: { viewport: { width: 1440, height: 900 } } },
};
const profileNames = (process.env.RISING_PROFILES || Object.keys(PROFILES).join(","))
  .split(",")
  .filter((name) => PROFILES[name]);

const RIDER_ART = "rider-rexonance-saga-pickup-20260923-delivery-640.webp";
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
const COUNT_WEBGL = () => {
  window.__webglContexts = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    // The sequence's canvas is detached (primed or not yet appended) when its
    // context is created, so it is recognised by its class, not its place.
    if (/webgl/i.test(String(type)) && this.classList.contains("rw-canvas")) {
      window.__webglContexts += 1;
    }
    return getContext.call(this, type, ...rest);
  };
};
// GL never ready in time: the parallel compile never completes, or the
// resized bitmaps never arrive. Both must fall back to the calm tier at 700 ms.
const STALL_COMPILE = () => {
  const getProgramParameter = WebGLRenderingContext.prototype.getProgramParameter;
  WebGLRenderingContext.prototype.getProgramParameter = function (program, pname) {
    if (pname === 0x91b1) return false; // COMPLETION_STATUS_KHR
    return getProgramParameter.call(this, program, pname);
  };
};
const HOLD_BITMAPS = () => {
  window.createImageBitmap = () => new Promise(() => {});
};

async function openWorld(
  browser,
  name,
  { query = "", init = [], reducedMotion = false, forcedColors = false } = {},
) {
  const context = await browser.newContext(PROFILES[name].options);
  // The dev server loads hundreds of modules: past the default 250 resource
  // timing entries, the rider art scrollToGate waits for is never recorded.
  await context.addInitScript(() => performance.setResourceTimingBufferSize(2000));
  for (const script of init) await context.addInitScript(script);
  const page = await context.newPage();
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  if (forcedColors) await page.emulateMedia({ forcedColors: "active" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(`/world${query}`, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition .rw-gate-button");
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout: 20_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  // Hydration settles after the first paint on the dev server.
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

/** Scrolls to the end and waits for the approach prewarm (engine + rider art). */
async function scrollToGate(page) {
  // The dev server's LoadGate can reset the scroll once after hydration: retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await page.waitForTimeout(400);
    const atEnd = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight - window.scrollY <= 2,
    );
    if (atEnd) break;
  }
  await page.waitForFunction(
    (rider) =>
      performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes(rider) && entry.responseEnd > 0),
    RIDER_ART,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(500);
}

async function press(page, name) {
  if (PROFILES[name].options.hasTouch) await page.tap(".rw-gate-button");
  else await page.click(".rw-gate-button");
}

const readViewport = (page) =>
  page.evaluate(() => {
    const viewport = document.querySelector(".rw-viewport");
    return { tier: viewport.dataset.tier ?? null, ready: viewport.dataset.ready === "true" };
  });

/** RGB of a screenshot at viewport fractions, decoded in a scratch page. */
async function samplePixels(browser, buffer, points) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([data, spots]) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return spots.map(([fx, fy]) => {
          // A 9x9 average around the point.
          const x = Math.round(bitmap.width * fx) - 4;
          const y = Math.round(bitmap.height * fy) - 4;
          const px = context.getImageData(x, y, 9, 9).data;
          const sum = [0, 0, 0];
          for (let index = 0; index < px.length; index += 4) {
            for (let channel = 0; channel < 3; channel += 1) sum[channel] += px[index + channel];
          }
          return sum.map((value) => Math.round(value / 81));
        });
      },
      [buffer.toString("base64"), points],
    );
  } finally {
    await page.close();
  }
}

/** Live (unclosed) ImageBitmaps in the page after a forced GC, as "WxH". */
async function liveBitmaps(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  const proto = await cdp.send("Runtime.evaluate", { expression: "ImageBitmap.prototype" });
  const query = await cdp.send("Runtime.queryObjects", {
    prototypeObjectId: proto.result.objectId,
  });
  const result = await cdp.send("Runtime.callFunctionOn", {
    objectId: query.objects.objectId,
    functionDeclaration:
      "function(){return this.filter((b)=>b.width>0).map((b)=>b.width+'x'+b.height).sort()}",
    returnByValue: true,
  });
  return result.result.value;
}

// ---------------------------------------------------------------- gate
async function checkGate(browser, name, { reducedMotion = false } = {}) {
  const { context, page, errors } = await openWorld(browser, name, { reducedMotion });
  const infiniteAtTop = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations === Infinity).length,
  );
  assert.equal(infiniteAtTop, 0, `${name}: infinite animations at the top of /world`);
  const stage = await page.evaluate(
    () => document.querySelector(".rw-gate").getBoundingClientRect().height,
  );
  const sample = async (back) => {
    // The document grows as images load, so the end is measured at each step.
    for (let settle = 0; settle < 2; settle += 1) {
      await page.evaluate(
        (distance) =>
          window.scrollTo({
            top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight - distance),
            behavior: "instant",
          }),
        back,
      );
      await page.waitForTimeout(160);
    }
    return page.evaluate(() => {
      const button = document.querySelector(".rw-gate-button");
      const style = getComputedStyle(button);
      const animation = button.getAnimations().find((entry) => entry.animationName === "rw-rise");
      return {
        opacity: Number(style.opacity),
        translate: style.translate,
        root: animation ? animation.timeline?.source === document.scrollingElement : null,
      };
    });
  };
  const before = await sample(stage + 40);
  const rest = await sample(0);
  // Every profile is Chromium with view timelines: the rise must exist unless
  // reduced motion is on (a broken guard or a renamed keyframe fails here).
  const motion = before.root !== null;
  assert.equal(
    motion,
    !reducedMotion,
    `${name}${reducedMotion ? " (reduced)" : ""}: rw-rise present=${motion} ${JSON.stringify(before)}`,
  );
  if (reducedMotion) {
    assert.ok(before.opacity > 0.99, `${name}: reduced motion shows the button without the rise`);
  } else {
    assert.ok(before.opacity < 0.05, `${name}: button hidden before the gate ${before.opacity}`);
    assert.equal(before.root, true, `${name}: the rise must follow the document scroll`);
  }
  assert.ok(rest.opacity > 0.99, `${name}: button at rest ${JSON.stringify(rest)}`);
  assert.ok(["none", "0px", "0px 0px"].includes(rest.translate), rest.translate);
  const layout = await page.evaluate(() => {
    const button = document.querySelector(".rw-gate-button").getBoundingClientRect();
    const hit = document.elementFromPoint(
      button.left + button.width / 2,
      button.top + button.height / 2,
    );
    const zeus = document.querySelector(".zeus-button")?.getBoundingClientRect();
    const overlap = zeus
      ? Math.max(0, Math.min(button.right, zeus.right) - Math.max(button.left, zeus.left)) *
        Math.max(0, Math.min(button.bottom, zeus.bottom) - Math.max(button.top, zeus.top))
      : 0;
    return {
      button: [button.left, button.top, button.width, button.height].map(Math.round),
      zeus: zeus ? [zeus.left, zeus.top, zeus.width, zeus.height].map(Math.round) : null,
      hit: Boolean(hit?.closest(".rw-gate-button")),
      overlap,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      inside: button.left >= 0 && button.right <= window.innerWidth + 0.5,
      infinite: document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations === Infinity)
        .map((animation) => animation.effect?.target?.className ?? "?"),
    };
  });
  assert.ok(layout.hit, `${name}: the button must hit-test at rest`);
  assert.ok(layout.inside, `${name}: the button fits the width ${layout.button}`);
  assert.equal(layout.overlap, 0, `${name}: RISING overlaps Zeus ${JSON.stringify(layout)}`);
  assert.ok(layout.overflowX <= 1, `${name}: horizontal overflow ${layout.overflowX}`);
  assert.deepEqual(layout.infinite, [], `${name}: infinite animations at the bottom`);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      check: reducedMotion ? "gate-reduced" : "gate",
      name,
      motion,
      before,
      rest,
      ...layout,
    }),
  );
  await context.close();
}

// ---------------------------------------------------------------- sequence
async function checkSequence(browser, name) {
  const { context, page, errors } = await openWorld(browser, name, { init: [COUNT_WEBGL] });
  await scrollToGate(page);
  if (PROFILES[name].options.hasTouch) {
    // A flick that starts on the button scrolls, and creates no GL context: the
    // browser takes the pan (pointercancel) before the touch prime fires. A
    // finger that rests on the button first may prime one, by design.
    const box = await page.locator(".rw-gate-button").boundingBox();
    const x = box.x + box.width / 2;
    let y = box.y + box.height / 2;
    const from = await page.evaluate(() => window.scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 0; step < 8; step += 1) {
      y += 20;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    const flick = await page.evaluate(
      (start) => ({
        contexts: window.__webglContexts,
        open: document.querySelector(".rw-dialog").open,
        scrolled: start - window.scrollY,
      }),
      from,
    );
    assert.equal(flick.contexts, 0, `${name}: a flick from the button primed GL`);
    assert.equal(flick.open, false, `${name}: a flick from the button opened the dialog`);
    assert.ok(flick.scrolled > 100, `${name}: the flick scrolled ${flick.scrolled}px`);
    console.log(JSON.stringify({ check: "touch-flick-no-prime", name, ...flick }));
    await cdp.detach();
    await scrollToGate(page);
  }
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const pressedAt = Date.now();
  await press(page, name);
  const opened = await page.evaluate(() => {
    const dialog = document.querySelector(".rw-dialog");
    const rect = dialog.getBoundingClientRect();
    const portal = document.querySelector(".rw-portal");
    const animated = [dialog, ...dialog.querySelectorAll("*")].flatMap((element) =>
      element.getAnimations().map((animation) => ({
        target: element.className,
        properties: animation.effect
          .getKeyframes()
          .flatMap((frame) =>
            Object.keys(frame).filter(
              (key) => !["offset", "computedOffset", "easing", "composite"].includes(key),
            ),
          ),
      })),
    );
    return {
      open: dialog.open,
      focus: document.activeElement === dialog,
      locked: document.documentElement.style.overflow === "hidden",
      size: [rect.width, rect.height],
      window: [window.innerWidth, window.innerHeight],
      label: dialog.getAttribute("aria-label"),
      portalShown: getComputedStyle(portal).display !== "none",
      portalRadius: getComputedStyle(portal).borderTopLeftRadius,
      animated,
    };
  });
  assert.equal(opened.open, true);
  assert.equal(opened.focus, true, `${name}: pointer open focuses the dialog surface`);
  assert.equal(opened.locked, true, `${name}: the page scroll is locked`);
  assert.equal(opened.label, "RISING THE WORLD");
  assert.equal(opened.portalShown, true, `${name}: the portal plays at the press`);
  const portalProps = opened.animated
    .filter((entry) => entry.target === "rw-portal")
    .flatMap((entry) => entry.properties);
  assert.ok(portalProps.length > 0, `${name}: the portal animates ${JSON.stringify(opened)}`);
  assert.deepEqual(
    [...new Set(opened.animated.flatMap((entry) => entry.properties))].filter(
      (property) => !["transform", "opacity", "scale", "translate"].includes(property),
    ),
    [],
    `${name}: the opening animates compositor properties only`,
  );
  assert.ok(
    Math.abs(opened.size[0] - opened.window[0]) <= 1 &&
      Math.abs(opened.size[1] - opened.window[1]) <= 1,
    `${name}: the dialog fills the visible viewport ${JSON.stringify(opened)}`,
  );
  await page.waitForFunction(
    () => {
      const viewport = document.querySelector(".rw-viewport");
      return viewport.dataset.ready === "true" || viewport.dataset.tier === "css";
    },
    null,
    { timeout: 1500 },
  );
  const readyAfter = Date.now() - pressedAt;
  const state = await readViewport(page);
  assert.equal(state.tier, "webgl", `${name}: capable devices (Android included) get WebGL`);
  assert.equal(state.ready, true);
  assert.ok(readyAfter <= 1000, `${name}: WebGL ready ${readyAfter} ms after the press`);
  await page.waitForTimeout(250);
  const zeusHidden = await page.evaluate(() => {
    const zeus = document.querySelector(".rw-dialog .zeus-button");
    return !zeus || getComputedStyle(zeus).display === "none";
  });
  assert.ok(zeusHidden, `${name}: the Zeus button is hidden over the sequence`);
  // Mid-burn cut.
  await page.waitForFunction(
    () => document.querySelector(".rw-live").textContent === "EP7 REXONANCE",
    null,
    { timeout: 8000 },
  );
  const cutAfter = Date.now() - pressedAt;
  const cut = await page.evaluate(() => ({
    title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    visibleText: document.querySelector(".rw-title").textContent,
    hidden: document.querySelector(".rw-title-wrap").getAttribute("aria-hidden"),
  }));
  assert.ok(cut.title > 0.99, `${name}: the title is cut in ${JSON.stringify(cut)}`);
  assert.equal(cut.visibleText, "EP7 REXONANCE");
  assert.equal(cut.hidden, "true");
  // End still by ~10 s of sequence time (RISING_TIMING.webgl.end: 9.6 s).
  await page.waitForSelector(".rw-replay", { timeout: 9000 });
  const endAfter = Date.now() - pressedAt;
  const end = await page.evaluate(async () => {
    const draws = window.__risingStats?.draws ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      canvases: document.querySelectorAll(".rw-gl canvas").length,
      contexts: window.__webglContexts,
      drawsBefore: draws,
      drawsAfter: window.__risingStats?.draws ?? 0,
      running: window.__risingStats?.running,
      size: window.__risingStats?.size,
      rungChanges: window.__risingStats?.rungChanges,
      cadence: window.__risingStats?.cadenceMs,
      framesPerDraw: window.__risingStats?.framesPerDraw,
      primed: window.__risingStats?.primed,
      readyMs: window.__risingStats?.readyMs,
      clockStartMs: window.__risingStats?.clockStartMs,
      title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    };
  });
  assert.equal(end.canvases, 0, `${name}: the canvas and its context are released`);
  // A positive control for the context counter the reduced-motion tier relies on.
  assert.equal(end.contexts, 1, `${name}: one WebGL context per run`);
  assert.equal(end.drawsBefore, end.drawsAfter, `${name}: nothing draws after the end`);
  assert.equal(end.running, false);
  assert.ok(end.title > 0.99);
  if (!end.primed) warn(`${name}: the GL context was not primed at pointerdown`);
  // Esc closes; focus returns to the trigger; the scroll position is restored.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".rw-dialog").open);
  await page.waitForTimeout(100);
  const closed = await page.evaluate(() => ({
    focus: document.activeElement?.classList.contains("rw-gate-button"),
    scrollY: window.scrollY,
    locked: document.documentElement.style.overflow === "hidden",
  }));
  assert.equal(closed.focus, true, `${name}: focus returns to RISING THE WORLD`);
  assert.equal(closed.locked, false);
  assert.ok(
    Math.abs(closed.scrollY - scrollBefore) <= 1,
    `${name}: scroll ${scrollBefore} -> ${JSON.stringify(closed)}`,
  );
  // Keyboard open focuses CLOSE; SKIP goes straight to the end still; もう一度 restarts.
  await page.focus(".rw-gate-button");
  await page.keyboard.press("Enter");
  const keyboardFocus = await page.evaluate(() => document.activeElement?.className);
  assert.equal(keyboardFocus, "rw-close", `${name}: keyboard open focuses CLOSE`);
  await page.waitForFunction(() => document.querySelector(".rw-viewport").dataset.ready === "true");
  await page.waitForTimeout(600);
  await page.focus(".rw-skip");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".rw-replay");
  const skipped = await page.evaluate(() => ({
    focus: document.activeElement?.className,
    canvases: document.querySelectorAll(".rw-gl canvas").length,
    title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    live: document.querySelector(".rw-live").textContent,
  }));
  assert.deepEqual(skipped, {
    focus: "rw-replay",
    canvases: 0,
    title: 1,
    live: "EP7 REXONANCE",
  });
  if (name === "desktop" || name === "landscape-844") {
    // The landscape end still: the rider's sides are feathered into the ember,
    // with no lit column around the art (the side matches the centre).
    await page.waitForTimeout(300);
    const [side, centre] = await samplePixels(
      browser,
      await page.screenshot({ type: "png", scale: "css" }),
      [
        [0.05, 0.08],
        [0.5, 0.08],
      ],
    );
    const gap = Math.max(...side.map((value, index) => Math.abs(value - centre[index])));
    assert.ok(gap <= 8, `${name}: lit column in the end still ${side} vs ${centre}`);
    console.log(JSON.stringify({ check: "end-still-band", name, side, centre }));
  }
  // もう一度 right after the swap is a double press (SWAP_GUARD_MS): wait it out.
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".rw-viewport").dataset.ready === "true");
  const replayed = await page.evaluate(() => ({
    focus: document.activeElement?.className,
    title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    canvases: document.querySelectorAll(".rw-gl canvas").length,
  }));
  assert.deepEqual(replayed, { focus: "rw-skip", title: 0, canvases: 1 });
  // CLOSE and a reopen in one task: the old session's queued close event must
  // not tear down the new one (a dark modal with no run and no lock).
  await page.evaluate(() => {
    document.querySelector(".rw-close").click();
    document.querySelector(".rw-gate-button").click();
  });
  await page.waitForFunction(() => document.querySelector(".rw-viewport").dataset.ready === "true");
  await page.waitForTimeout(300);
  const reopened = await page.evaluate(() => ({
    open: document.querySelector(".rw-dialog").open,
    locked: document.documentElement.style.overflow === "hidden",
    art: Boolean(document.querySelector(".rw-calm-world").getAttribute("src")),
    canvases: document.querySelectorAll(".rw-gl canvas").length,
    running: window.__risingStats?.running,
  }));
  assert.deepEqual(
    reopened,
    { open: true, locked: true, art: true, canvases: 1, running: true },
    `${name}: close + reopen in one task`,
  );
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".rw-dialog").open);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.overflow),
    "",
    `${name}: the lock is released after the race`,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      check: "sequence",
      name,
      readyAfter,
      cutAfter,
      endAfter,
      ...end,
      closed,
    }),
  );
  await context.close();
}

// ---------------------------------------------------------------- tiers
async function checkTiers(browser, name) {
  // Reduced motion: no canvas, a cross-fade to the still.
  {
    const { context, page, errors } = await openWorld(browser, name, {
      reducedMotion: true,
      init: [COUNT_WEBGL],
    });
    await scrollToGate(page);
    const pressedAt = Date.now();
    await press(page, name);
    await page.waitForSelector(".rw-replay", { timeout: 4000 });
    const reduced = await page.evaluate(() => ({
      tier: document.querySelector(".rw-viewport").dataset.tier,
      contexts: window.__webglContexts,
      title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    }));
    const doneAfter = Date.now() - pressedAt;
    assert.deepEqual(reduced, { tier: "reduced", contexts: 0, title: 1 });
    assert.ok(doneAfter < 3600, `${name}: reduced motion ends by ~2.6 s (${doneAfter} ms)`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "tier-reduced", name, doneAfter, ...reduced }));
    await context.close();
  }
  // Pressed before the engine chunk arrives (a slow network): the dialog stays
  // dark until the run starts; the end still never shows first.
  {
    const { context, page, errors } = await openWorld(browser, name);
    await page.route(/rising-(?:sequence|fire|timing)|rising\.frag/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await page.waitForTimeout(200);
    await press(page, name);
    await page.waitForTimeout(400);
    const pending = await page.evaluate(() => ({
      tier: document.querySelector(".rw-viewport").dataset.tier ?? null,
      end: getComputedStyle(document.querySelector(".rw-end")).visibility,
    }));
    assert.deepEqual(pending, { tier: null, end: "hidden" }, `${name}: pending engine`);
    // SKIP while the chunk loads is kept: the run starts at the end still
    // instead of playing the whole sequence (9.6 s) once the chunk arrives.
    await page.focus(".rw-skip");
    await page.keyboard.press("Enter");
    // The delayed chunks arrive in turn (the module graph loads in steps); the
    // end still follows the run's start at once, not ~9 s later.
    await page.waitForFunction(() => document.querySelector(".rw-viewport").dataset.tier, null, {
      timeout: 8000,
    });
    await page.waitForSelector(".rw-replay", { timeout: 1000 });
    const skippedEarly = await page.evaluate(() => ({
      tier: document.querySelector(".rw-viewport").dataset.tier ?? null,
      canvases: document.querySelectorAll(".rw-gl canvas").length,
      title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
      live: document.querySelector(".rw-live").textContent,
      focus: document.activeElement?.className,
    }));
    assert.deepEqual(
      skippedEarly,
      { tier: "css", canvases: 0, title: 1, live: "EP7 REXONANCE", focus: "rw-replay" },
      `${name}: SKIP while the engine loads`,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "engine-pending", name, ...pending, skippedEarly }));
    await context.close();
  }
  // The engine chunk fails (offline): the static end still, final for the
  // document (a failed import() is cached), so no もう一度 is offered, and a
  // focused SKIP hands focus to CLOSE.
  {
    const { context, page, errors } = await openWorld(browser, name);
    await page.route(/rising-sequence/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.abort();
    });
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await page.waitForTimeout(200);
    await page.focus(".rw-gate-button");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Shift+Tab");
    const pendingFocus = await page.evaluate(() => document.activeElement?.className);
    await page.waitForSelector('.rw-viewport[data-tier="static"]', { timeout: 5000 });
    await page.waitForTimeout(100);
    const read = () =>
      page.evaluate(() => ({
        tier: document.querySelector(".rw-viewport").dataset.tier ?? null,
        replay: document.querySelectorAll(".rw-replay").length,
        skip: document.querySelectorAll(".rw-skip").length,
        live: document.querySelector(".rw-live").textContent,
        focus: document.activeElement?.className,
      }));
    const failed = await read();
    assert.equal(pendingFocus, "rw-skip", `${name}: Shift+Tab from CLOSE reaches SKIP`);
    assert.deepEqual(
      failed,
      { tier: "static", replay: 0, skip: 0, live: "EP7 REXONANCE", focus: "rw-close" },
      `${name}: engine failure`,
    );
    await page.unroute(/rising-sequence/);
    await page.keyboard.press("Enter"); // CLOSE
    await page.waitForFunction(() => !document.querySelector(".rw-dialog").open);
    await page.focus(".rw-gate-button");
    await page.keyboard.press("Enter");
    await page.waitForSelector('.rw-viewport[data-tier="static"]', { timeout: 5000 });
    await page.waitForTimeout(100);
    const again = await read();
    assert.deepEqual(
      again,
      { tier: "static", replay: 0, skip: 0, live: "EP7 REXONANCE", focus: "rw-close" },
      `${name}: the failure is final for the document`,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "tier-static", name, failed, again }));
    await context.close();
  }
  // Save-Data and no WebGL: the calm CSS version.
  for (const [label, init] of [
    ["save-data", SAVE_DATA],
    ["no-webgl", NO_WEBGL],
  ]) {
    const { context, page, errors } = await openWorld(browser, name, { init: [init] });
    await scrollToGate(page);
    await press(page, name);
    await page.waitForFunction(
      () => document.querySelector(".rw-viewport").dataset.tier === "css",
      null,
      {
        timeout: 1500,
      },
    );
    await page.waitForSelector(".rw-replay", { timeout: 9000 });
    const calm = await page.evaluate(() => ({
      tier: document.querySelector(".rw-viewport").dataset.tier,
      canvases: document.querySelectorAll(".rw-gl canvas").length,
      live: document.querySelector(".rw-live").textContent,
      fallback: window.__risingStats?.fallback ?? null,
    }));
    assert.deepEqual(calm, {
      tier: "css",
      canvases: 0,
      live: "EP7 REXONANCE",
      // Software GL and no GL both surface as a null context (failIfMajorPerformanceCaveat).
      fallback: label === "no-webgl" ? "no-webgl" : null,
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: `tier-${label}`, name, ...calm }));
    await context.close();
  }
  // GL not ready in time (RISING_READY_TIMEOUT_MS): a compile that never
  // completes (primed at pointerdown) or bitmaps that never arrive (unprimed)
  // fall back to the calm tier at 700 ms, and the run still ends normally.
  for (const [label, init, primed] of [
    ["stall-compile", STALL_COMPILE, true],
    ["hold-bitmaps", HOLD_BITMAPS, false],
  ]) {
    const { context, page, errors } = await openWorld(browser, name, { init: [init] });
    const parallel = await page.evaluate(() =>
      Boolean(
        document
          .createElement("canvas")
          .getContext("webgl")
          ?.getExtension("KHR_parallel_shader_compile"),
      ),
    );
    if (label === "stall-compile" && !parallel) {
      warn(`${name}: no KHR_parallel_shader_compile, stall-compile skipped`);
      await context.close();
      continue;
    }
    if (label === "hold-bitmaps") {
      // The approach prewarm never resolves, so scrollToGate's art wait still holds.
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
      );
      await page.waitForTimeout(1500);
    } else {
      await scrollToGate(page);
    }
    await press(page, name);
    await page.waitForFunction(() => window.__risingStats?.readyMs != null, null, {
      timeout: 3000,
    });
    const slow = await page.evaluate(() => ({
      tier: document.querySelector(".rw-viewport").dataset.tier,
      fallback: window.__risingStats.fallback,
      canvases: document.querySelectorAll(".rw-gl canvas").length,
      primed: window.__risingStats.primed,
      readyMs: window.__risingStats.readyMs,
    }));
    assert.deepEqual(
      { tier: slow.tier, fallback: slow.fallback, canvases: slow.canvases, primed: slow.primed },
      { tier: "css", fallback: "not-ready", canvases: 0, primed },
      `${name} ${label}: ${JSON.stringify(slow)}`,
    );
    assert.ok(slow.readyMs >= 650 && slow.readyMs < 1000, `${name} ${label}: ${slow.readyMs} ms`);
    await page.waitForSelector(".rw-replay", { timeout: 9000 });
    assert.equal(await page.textContent(".rw-live"), "EP7 REXONANCE");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: `slow-gl-${label}`, name, ...slow }));
    await context.close();
  }
  // The prepared bitmaps (about 4.6 MB decoded) are closed when the gate
  // unmounts, and prepared again on the next approach.
  if (name === "pixel") {
    const { context, page, errors } = await openWorld(browser, name);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Runtime.enable");
    await cdp.send("HeapProfiler.enable");
    const waitBitmaps = async (count) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const live = await liveBitmaps(cdp);
        if (live.length === count) return live;
        await page.waitForTimeout(500);
      }
      return liveBitmaps(cdp);
    };
    await scrollToGate(page);
    const approached = await waitBitmaps(2);
    assert.deepEqual(approached, ["576x768", "683x1024"], `${name}: prepared on approach`);
    await page.evaluate(() => document.querySelector('a[href="/riders/saga"]').click());
    await page.waitForFunction(() => location.pathname === "/riders/saga");
    await page.waitForTimeout(1500);
    const away = await waitBitmaps(0);
    assert.deepEqual(away, [], `${name}: bitmaps outlive /world`);
    await page.evaluate(() => document.querySelector('a[href^="/world"]').click());
    await page.waitForFunction(() => location.pathname === "/world");
    await page.waitForSelector(".site-shell.mirage-edition .rw-gate-button");
    await page.waitForTimeout(1500);
    await scrollToGate(page);
    const back = await waitBitmaps(2);
    assert.deepEqual(back, ["576x768", "683x1024"], `${name}: prepared again on return`);
    await press(page, name);
    await page.waitForFunction(
      () => document.querySelector(".rw-viewport").dataset.ready === "true",
      null,
      { timeout: 3000 },
    );
    assert.equal((await readViewport(page)).tier, "webgl");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "bitmap-lifecycle", name, approached, away, back }));
    await context.close();
  }
  // Context loss mid-run: straight to the end still, no errors.
  {
    const { context, page, errors } = await openWorld(browser, name);
    await scrollToGate(page);
    await press(page, name);
    await page.waitForFunction(
      () => document.querySelector(".rw-viewport").dataset.ready === "true",
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() =>
      document
        .querySelector(".rw-gl canvas")
        .getContext("webgl")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await page.waitForSelector(".rw-replay", { timeout: 2000 });
    const lost = await page.evaluate(() => ({
      canvases: document.querySelectorAll(".rw-gl canvas").length,
      fallback: window.__risingStats?.fallback,
      title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
    }));
    assert.deepEqual(lost, { canvases: 0, fallback: "context-lost", title: 1 });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "context-lost", name, ...lost }));
    await context.close();
  }
  // Hidden tab: the clock stops, so the cut does not happen behind the user's back.
  {
    const { context, page, errors } = await openWorld(browser, name);
    await scrollToGate(page);
    await press(page, name);
    await page.waitForFunction(
      () => document.querySelector(".rw-viewport").dataset.ready === "true",
    );
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(800);
    const paused = await page.evaluate(() => ({
      title: Number(getComputedStyle(document.querySelector(".rw-title-wrap")).opacity),
      live: document.querySelector(".rw-live").textContent,
    }));
    assert.deepEqual(paused, { title: 0, live: "" }, `${name}: the clock paused while hidden`);
    await page.waitForFunction(
      () => document.querySelector(".rw-live").textContent === "EP7 REXONANCE",
      null,
      { timeout: 3000 },
    );
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ check: "visibility", name, ...paused }));
    await context.close();
  }
}

// ---------------------------------------------------------------- performance
async function checkPerformance(browser, name) {
  const { context, page, errors } = await openWorld(browser, name);
  await scrollToGate(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(Math.round(entry.duration));
    }).observe({ type: "longtask" });
  });
  await press(page, name);
  await page.waitForFunction(() => document.querySelector(".rw-viewport").dataset.ready === "true");
  await page.waitForSelector(".rw-replay", { timeout: 15_000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const perf = await page.evaluate((drawWindow) => {
    const stats = window.__risingStats;
    const sorted = [...stats.renderMs].sort((a, b) => a - b);
    const pick = (q) => Number((sorted[Math.floor((sorted.length - 1) * q)] ?? 0).toFixed(2));
    return {
      draws: stats.draws,
      // The canvas draws until its fade has finished (the sequence clock's draw window).
      drawsPerSecond: Number((stats.draws / drawWindow).toFixed(1)),
      jsPerDrawP50: pick(0.5),
      jsPerDrawP95: pick(0.95),
      readyMs: stats.readyMs,
      size: stats.size,
      rungChanges: stats.rungChanges,
      longTasks: window.__longTasks,
    };
  }, RISING_TIMING.webgl.fade[1]);
  const longest = Math.max(0, ...perf.longTasks);
  assert.ok(perf.drawsPerSecond >= 40, `${name}: draw rate ${perf.drawsPerSecond}`);
  assert.ok(perf.jsPerDrawP95 < 4, `${name}: JS per draw p95 ${perf.jsPerDrawP95} ms`);
  assert.ok(longest < 200, `${name}: long task ${longest} ms during the run`);
  if (perf.drawsPerSecond < 50) warn(`${name}: ${perf.drawsPerSecond} draws/s at 4x CPU`);
  if (perf.jsPerDrawP95 >= 2) warn(`${name}: JS per draw p95 ${perf.jsPerDrawP95} ms`);
  if (longest > 50) warn(`${name}: long task ${longest} ms after showModal`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "performance-cpu4x", name, ...perf }));
  await context.close();
}

// ---------------------------------------------------------------- flashes
const FPS = 60;
const AUDIT_END = { webgl: 10.0, css: 8.0, reduced: 3.0 };
const KEYFRAMES = [
  -0.3, -0.15, 0, 0.3, 1.0, 1.7, 2.05, 2.5, 3.4, 4.3, 4.5, 4.55, 4.8, 5.6, 6.6, 7.6, 8.8, 9.7,
];

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
      window.addFrame = async (t, base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
        context.drawImage(bitmap, 0, 0, W, H);
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
            // The worst cell around its worst second, for diagnosis.
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
        const mean = (t) => {
          const frame = series.reduce((best, entry) =>
            Math.abs(entry.t - t) < Math.abs(best.t - t) ? entry : best,
          );
          return Number(
            (frame.cells.reduce((sum, cell) => sum + cell.L, 0) / frame.cells.length).toFixed(3),
          );
        };
        return {
          frames: series.length,
          cells,
          general,
          red,
          meanL: [0, 1, 2.05, 3, 4.4, 4.6, 6, 8.8, 9.6].map((t) => `${t}:${mean(t)}`).join(" "),
        };
      };
    },
    { cell, viewport },
  );
  return page;
}

async function auditFlashes(browser, name, tier) {
  const init = tier === "css" ? [SAVE_DATA] : [];
  const { context, page, errors } = await openWorld(browser, name, {
    query: "?rising-audit",
    init,
    reducedMotion: tier === "reduced",
  });
  await scrollToGate(page);
  const viewport = PROFILES[name].options.viewport;
  const cell = viewport.width >= 1024 ? { w: 341, h: 256 } : { w: 160, h: 160 };
  const analyser = await createAnalyser(browser, cell, viewport);
  const shot = async (t) => {
    const buffer = await page.screenshot({ type: "jpeg", quality: 80, scale: "css" });
    await analyser.evaluate(
      ([time, data]) => window.addFrame(time, data),
      [t, buffer.toString("base64")],
    );
  };
  await shot(-1); // the gate at rest, before the press
  await press(page, name);
  await page.waitForFunction(() => window.__risingTest?.run, null, { timeout: 5000 });
  await page.evaluate(() => window.__risingTest.run.ready);
  const { actualTier, portalSeconds } = await page.evaluate(() => ({
    actualTier: window.__risingTest.run.tier,
    portalSeconds: window.__risingTest.run.portalSeconds,
  }));
  assert.equal(actualTier, tier, `${name}: audit tier`);
  if (tier !== "reduced") {
    // The portal is an iris: halfway through, the circle is scaled and the key
    // visual inside is counter-scaled, so the art stays the full-screen cover
    // fit the canvas (or the calm layer) takes over from.
    await page.evaluate((T) => window.__risingTest.seek(T), -portalSeconds / 2);
    const iris = await page.evaluate(() => {
      const scaleOf = (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
      const art = document.querySelector(".rw-portal-art");
      const rect = art.getBoundingClientRect();
      return {
        circle: scaleOf(document.querySelector(".rw-portal")),
        product: scaleOf(document.querySelector(".rw-portal")) * scaleOf(art),
        rect: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
        window: [window.innerWidth, window.innerHeight],
      };
    });
    assert.ok(iris.circle < 0.9, `${name} ${tier}: the portal is mid-way ${JSON.stringify(iris)}`);
    assert.ok(Math.abs(iris.product - 1) <= 0.02, `${name} ${tier}: iris ${JSON.stringify(iris)}`);
    assert.ok(
      Math.abs(iris.rect[0]) <= 2 &&
        Math.abs(iris.rect[1]) <= 2 &&
        Math.abs(iris.rect[2] - iris.window[0]) <= 2 &&
        Math.abs(iris.rect[3] - iris.window[1]) <= 2,
      `${name} ${tier}: the portal art covers the viewport ${JSON.stringify(iris)}`,
    );
    console.log(JSON.stringify({ check: "portal-iris", name, tier, ...iris }));
  }
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });
  const keyframes = new Set(KEYFRAMES.map((t) => Math.round(t * FPS)));
  // Negative times are the portal (the sequence clock starts after it).
  for (let frame = -Math.round(portalSeconds * FPS); frame <= AUDIT_END[tier] * FPS; frame += 1) {
    const t = frame / FPS;
    await page.evaluate((time) => window.__risingTest.seek(time), t);
    await shot(t);
    if (shotsDir && keyframes.has(frame)) {
      await page.screenshot({
        path: join(
          shotsDir,
          `${tier}-${name}-${t.toFixed(2).replace("-", "m").replace(".", "_")}.png`,
        ),
      });
    }
  }
  const result = await analyser.evaluate(() => window.countFlashes());
  await analyser.close();
  assert.deepEqual(errors, []);
  const worst = Math.max(result.general.perSecond, result.red.perSecond);
  console.log(
    JSON.stringify({
      check: "flashes",
      name,
      tier,
      frames: result.frames,
      cells: result.cells,
      general: {
        perSecond: result.general.perSecond,
        at: result.general.at,
        cell: result.general.cell,
        transitions: result.general.transitions,
      },
      red: {
        perSecond: result.red.perSecond,
        at: result.red.at,
        cell: result.red.cell,
        transitions: result.red.transitions,
      },
      ...(process.env.RISING_TRACE
        ? { generalTrace: result.general.trace, redTrace: result.red.trace }
        : {}),
      meanL: result.meanL,
    }),
  );
  assert.ok(
    worst <= 1,
    `${name} ${tier}: ${worst} flashes/s (DESIGN.md promises 1; WCAG 2.3.1 limit is 3)`,
  );
  await context.close();
}

// The controls on a real clock: a held Enter (33 ms key repeat) on SKIP, then
// clicks on the SKIP / もう一度 spot every 100 ms. The two swap the picture
// between the void and the end still, so each must stay at one flash a second:
// frames from a CDP screencast, plus swap timestamps that do not depend on the
// screencast's frame rate. A held Enter on the gate opens the dialog once.
async function auditControlFlashes(browser, name, tier) {
  const { context, page, errors } = await openWorld(browser, name, {
    init: tier === "css" ? [SAVE_DATA] : [],
    reducedMotion: tier === "reduced",
  });
  await scrollToGate(page);
  const viewport = PROFILES[name].options.viewport;
  const cell = viewport.width >= 1024 ? { w: 341, h: 256 } : { w: 160, h: 160 };
  const cdp = await context.newCDPSession(page);
  const key = (type, autoRepeat = false) =>
    cdp.send("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r", autoRepeat } : {}),
    });
  const holdEnter = async (ms) => {
    await key("keyDown");
    const started = Date.now();
    while (Date.now() - started < ms) {
      await page.waitForTimeout(33);
      await key("keyDown", true);
    }
    await key("keyUp");
  };
  await page.evaluate(() => {
    window.__controls = { swaps: [], clicks: 0, gateClicks: 0 };
    const controls = document.querySelector(".rw-controls");
    new MutationObserver(() =>
      window.__controls.swaps.push({
        t: performance.now(),
        control: controls.querySelector("button")?.className ?? null,
      }),
    ).observe(controls, { childList: true, subtree: true, attributes: true });
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.closest?.(".rw-controls")) window.__controls.clicks += 1;
        if (event.target.closest?.(".rw-gate-button")) window.__controls.gateClicks += 1;
      },
      true,
    );
  });
  // A held Enter on the gate: the first press opens the dialog and focuses
  // CLOSE; the repeats must neither close it nor reopen it.
  await page.focus(".rw-gate-button");
  await holdEnter(2000);
  await page.waitForTimeout(300);
  const gate = await page.evaluate(() => ({
    open: document.querySelector(".rw-dialog").open,
    gateClicks: window.__controls.gateClicks,
    focus: document.activeElement?.className,
  }));
  assert.deepEqual(gate, { open: true, gateClicks: 1, focus: "rw-close" }, `${name} ${tier}`);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.className), "rw-skip");
  await page.evaluate(() => {
    window.__controls.swaps = [];
    window.__controls.clicks = 0;
  });
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId });
    } catch {
      // The session closes with the context.
    }
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
    maxWidth: Math.round(viewport.width / 2),
    maxHeight: Math.round(viewport.height / 2),
    everyNthFrame: 1,
  });
  await page.waitForTimeout(300);
  await holdEnter(2000);
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => ({
    clicks: window.__controls.clicks,
    swaps: [...new Set(window.__controls.swaps.map((swap) => swap.control))],
    focus: document.activeElement?.className,
  }));
  assert.deepEqual(
    held,
    { clicks: 1, swaps: ["rw-replay"], focus: "rw-replay" },
    `${name} ${tier}: a held Enter on SKIP presses once`,
  );
  await page.evaluate(() => (window.__controls.swaps = []));
  const box = await page.locator(".rw-controls button").boundingBox();
  const started = Date.now();
  let presses = 0;
  while (Date.now() - started < 2000) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    presses += 1;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700);
  await cdp.send("Page.stopScreencast");
  const swapTimes = await page.evaluate(() => {
    // One swap unmounts one button and mounts the other: count distinct changes.
    const changes = [];
    let last = null;
    for (const swap of window.__controls.swaps) {
      if (swap.control !== last) changes.push(swap.t);
      last = swap.control;
    }
    return changes;
  });
  const swapsPerSecond = Math.max(
    0,
    ...swapTimes.map((t0) => swapTimes.filter((t) => t >= t0 && t < t0 + 1000).length),
  );
  assert.ok(
    swapsPerSecond <= 2,
    `${name} ${tier}: ${swapsPerSecond} swaps in 1 s (${presses} clicks)`,
  );
  const analyser = await createAnalyser(browser, cell, viewport);
  for (const frame of frames) {
    await analyser.evaluate(([t, data]) => window.addFrame(t, data), [frame.t, frame.data]);
  }
  const result = await analyser.evaluate(() => window.countFlashes());
  await analyser.close();
  const worst = Math.max(result.general.perSecond, result.red.perSecond);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      check: "control-flashes",
      name,
      tier,
      frames: result.frames,
      presses,
      swaps: swapTimes.length,
      swapsPerSecond,
      general: result.general.perSecond,
      red: result.red.perSecond,
    }),
  );
  assert.ok(result.frames >= 10, `${name} ${tier}: ${result.frames} screencast frames`);
  assert.ok(worst <= 1, `${name} ${tier}: controls flash ${worst} times a second`);
  await context.close();
}

// Forced colours drop box-shadow: every control keeps a visible focus ring
// (WCAG 2.4.7), and CLOSE keeps its drawn cross.
async function checkForcedColors(browser, name) {
  const { context, page, errors } = await openWorld(browser, name, { forcedColors: true });
  await scrollToGate(page);
  const ring = () =>
    page.evaluate(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      return {
        control: element.className,
        visible: element.matches(":focus-visible"),
        outline: style.outlineStyle,
        width: style.outlineWidth,
      };
    });
  await page.keyboard.press("Tab");
  await page.focus(".rw-gate-button");
  const rings = [await ring()];
  await page.keyboard.press("Enter");
  rings.push(await ring());
  await page.keyboard.press("Shift+Tab");
  rings.push(await ring());
  for (const entry of rings) {
    assert.ok(
      entry.visible && entry.outline !== "none" && entry.width !== "0px",
      `${name}: no focus ring in forced colours ${JSON.stringify(entry)}`,
    );
  }
  assert.deepEqual(
    rings.map((entry) => entry.control),
    ["rw-gate-button", "rw-close", "rw-skip"],
  );
  const cross = await page.evaluate(() => {
    const rgb = (value) => value.match(/\d+/g).slice(0, 3).join(",");
    return {
      stroke: rgb(
        getComputedStyle(document.querySelector(".rw-close i"), "::before").backgroundColor,
      ),
      button: rgb(getComputedStyle(document.querySelector(".rw-close")).backgroundColor),
    };
  });
  assert.notEqual(cross.stroke, cross.button, `${name}: the × vanishes in forced colours`);
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: "forced-colors", name, rings, cross }));
  await context.close();
}

const browser = await chromium.launch({ channel });
try {
  for (const name of profileNames) {
    if (sections.has("gate")) await checkGate(browser, name);
    if (sections.has("sequence")) await checkSequence(browser, name);
  }
  if (sections.has("gate")) {
    for (const name of profileNames.filter((entry) => entry === "pixel" || entry === "desktop")) {
      await checkGate(browser, name, { reducedMotion: true });
    }
    if (profileNames.includes("desktop")) await checkForcedColors(browser, "desktop");
  }
  if (sections.has("tiers")) {
    for (const name of profileNames.filter((entry) => entry === "pixel" || entry === "desktop")) {
      await checkTiers(browser, name);
    }
  }
  if (sections.has("perf") && profileNames.includes("pixel"))
    await checkPerformance(browser, "pixel");
  if (sections.has("flash")) {
    for (const name of profileNames.filter((entry) =>
      ["pixel", "galaxy", "desktop"].includes(entry),
    )) {
      for (const tier of (process.env.RISING_TIERS || "webgl,css,reduced").split(",")) {
        await auditFlashes(browser, name, tier);
      }
    }
    // Portrait phones stay under the threshold by area; the desktop is the risk.
    if (profileNames.includes("desktop")) {
      for (const tier of (process.env.RISING_TIERS || "webgl,css,reduced").split(",")) {
        await auditControlFlashes(browser, "desktop", tier);
      }
    }
  }
  console.log(JSON.stringify({ ok: true, warnings }));
} finally {
  await browser.close();
}
