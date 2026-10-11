// rx17 real-time preload audit. No clock seeking, forced suit state or engine
// attributes: navigation uses the ordinary menu/return controls, and a build
// passes only if the actual nanite canvas engine was observed.
//
// BASE_URL=http://127.0.0.1:8082 RX17_OUTPUT=/private/tmp/rx17-preload.json \
//   node scripts/verify-rexonance-rx17-preload.mjs
// Optional: RX17_PROFILES=desktop,pixel RX17_SCENARIOS=world-1000,roundtrip
// Additional probes: after-menu-1000,after-menu-1500,abort-intent-resume,
// failure-pending-retry (one failed low atlas, early high intent).
// These are sequential local UI probes, not a production load test.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { REXONANCE_SUIT_ATLAS, REXONANCE_SUIT_GOLD_ATLAS } from "../src/lib/rexonance-suit.ts";

const base = new URL(process.env.BASE_URL ?? "http://127.0.0.1:8082");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "use a local preview, not production",
);
const output = resolve(process.env.RX17_OUTPUT ?? "/private/tmp/rx17-preload.json");
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 } },
  pixel: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  },
};
const scenarios = [
  "world-1000",
  "world-1500",
  "world-2500",
  "world-3500",
  "roundtrip",
  "abort-resume",
  "save-data",
  "failure-retry",
];
const select = (value, choices) => {
  const names = value ? value.split(",").map((name) => name.trim()) : choices;
  names.forEach((name) => assert.ok(choices.includes(name), `unknown selection: ${name}`));
  return names;
};
const selectedProfiles = select(process.env.RX17_PROFILES, Object.keys(profiles));
const selectedScenarios = process.env.RX17_SCENARIOS
  ? select(process.env.RX17_SCENARIOS, [
      ...scenarios,
      "after-menu-1000",
      "after-menu-1500",
      "abort-intent-resume",
      "failure-pending-retry",
    ])
  : scenarios;
const drawn = [REXONANCE_SUIT_ATLAS.src, REXONANCE_SUIT_GOLD_ATLAS.src];
const isSuitUrl = (url) => /\/rexonance-suit-[^/]+\//.test(url);
const isRelevantUrl = (url) =>
  isSuitUrl(url) || /rexonance-(?:call-sequence|suit-(?:nanites|plan))/.test(url);
const report = {
  generatedAt: new Date().toISOString(),
  base: base.origin,
  source: "real-time Chromium / ordinary UI controls / unmodified suit state",
  settings: {
    coldContextPerCase: true,
    explicitCdpCacheDisabled: false,
    faultRoutingCacheNote: "Playwright interception disables HTTP cache in fault/abort probes",
    delayAnchor: "settled, hydrated World confirmation (SSR first visibility also recorded)",
    afterMenuProbeAnchor: "menu prepared, not World display",
    stopOnFirstFailure: true,
    pixelCpuRate: 4,
    pixelNetwork: { latencyMs: 60, downMbps: 9, upMbps: 1.5 },
  },
  cases: [],
};

function installRecorder({ saveData }) {
  // Only the network preference is simulated. Neither readiness, rendering
  // tier, DOM suit state nor renderer capabilities are forced.
  const connection = {
    saveData,
    effectiveType: "4g",
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => connection });
  const log = (window.__rx17 = {
    calls: [],
    worldDisplays: [],
    worldInteractiveDisplays: [],
    taps: [],
    fetches: [],
    images: [],
    imageDecodes: [],
    bitmapDecodes: [],
    resources: [],
    longTasks: [],
  });
  const suitUrl = (value) => {
    try {
      const url = new URL(String(value), location.href).href;
      return /\/rexonance-suit-[^/]+\//.test(url) ? url : null;
    } catch {
      return null;
    }
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        log.longTasks.push({ at: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* older Chrome does not expose this observer */
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const url = suitUrl(entry.name);
        if (url)
          log.resources.push({
            url,
            initiatorType: entry.initiatorType,
            at: entry.startTime,
            responseStart: entry.responseStart,
            responseEnd: entry.responseEnd,
            duration: entry.duration,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
          });
      }
    }).observe({ type: "resource", buffered: true });
  } catch {
    /* ResourceTiming is supplemental, never a replacement for an engine assertion. */
  }
  const assignedImages = new WeakMap();
  const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (nativeSrc?.set)
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...nativeSrc,
      set(value) {
        const url = suitUrl(value);
        if (url) {
          const record = { url, at: performance.now(), priority: this.fetchPriority };
          assignedImages.set(this, record);
          log.images.push(record);
        }
        nativeSrc.set.call(this, value);
      },
    });
  const nativeDecode = HTMLImageElement.prototype.decode;
  if (typeof nativeDecode === "function")
    HTMLImageElement.prototype.decode = function (...args) {
      const url = suitUrl(this.src);
      if (!url) return nativeDecode.apply(this, args);
      const record = {
        url,
        assignedAt: assignedImages.get(this)?.at ?? null,
        at: performance.now(),
        doneAt: null,
        error: null,
      };
      log.imageDecodes.push(record);
      return nativeDecode.apply(this, args).then(
        (value) => {
          record.doneAt = performance.now();
          return value;
        },
        (error) => {
          record.doneAt = performance.now();
          record.error = String(error);
          throw error;
        },
      );
    };
  const blobSources = new WeakMap();
  const nativeBitmap = window.createImageBitmap;
  if (typeof nativeBitmap === "function")
    window.createImageBitmap = function (input, ...args) {
      const url = blobSources.get(input);
      if (!url) return nativeBitmap.call(this, input, ...args);
      const record = {
        url,
        at: performance.now(),
        doneAt: null,
        error: null,
        blobBytes: input.size,
      };
      log.bitmapDecodes.push(record);
      return nativeBitmap.call(this, input, ...args).then(
        (value) => {
          record.doneAt = performance.now();
          return value;
        },
        (error) => {
          record.doneAt = performance.now();
          record.error = String(error);
          throw error;
        },
      );
    };
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href).href;
    if (!/\/rexonance-suit-[^/]+\//.test(url)) return nativeFetch.call(this, input, init);
    const fetch = {
      url,
      at: performance.now(),
      pathname: location.pathname,
      priority: init?.priority ?? "auto",
      abortedAt: null,
      doneAt: null,
      bodyDoneAt: null,
      bodyError: null,
      error: null,
    };
    log.fetches.push(fetch);
    const onAbort = () => {
      fetch.abortedAt = performance.now();
    };
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    if (signal?.aborted) onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    return nativeFetch.call(this, input, init).then(
      (response) => {
        fetch.doneAt = performance.now();
        const nativeBlob = response.blob.bind(response);
        response.blob = () =>
          nativeBlob().then(
            (blob) => {
              fetch.bodyDoneAt = performance.now();
              blobSources.set(blob, url);
              return blob;
            },
            (error) => {
              fetch.bodyError = String(error);
              throw error;
            },
          );
        return response;
      },
      (error) => {
        fetch.error = String(error);
        throw error;
      },
    );
  };
  for (const type of ["pointerdown", "touchstart", "click"]) {
    document.addEventListener(
      type,
      (event) => {
        const link = event.target?.closest?.("a[href]");
        if (link)
          log.taps.push({
            type,
            href: link.getAttribute("href"),
            at: performance.now(),
            pathname: location.pathname,
          });
      },
      { capture: true, passive: true },
    );
  }
  let worldVisible = false;
  let interactiveWorldVisible = false;
  let activeCall = null;
  let callRecord = null;
  const sample = () => {
    const world =
      location.pathname === "/world" &&
      Boolean(document.querySelector("main .hero#top")) &&
      !document.querySelector(".load-gate") &&
      !document.documentElement.hasAttribute("data-loading");
    if (world && !worldVisible) log.worldDisplays.push({ at: performance.now() });
    worldVisible = world;
    const interactiveWorld =
      world &&
      document.readyState === "complete" &&
      document.documentElement.hasAttribute("data-press-ready") &&
      Boolean(document.querySelector(".side-panel-trigger")?.getClientRects().length);
    if (interactiveWorld && !interactiveWorldVisible)
      log.worldInteractiveDisplays.push({ at: performance.now() });
    interactiveWorldVisible = interactiveWorld;
    const call = document.querySelector('.rx-call-sequence[data-mode="entry"]');
    if (call && call !== activeCall) {
      activeCall = call;
      callRecord = { at: performance.now(), goneAt: null, suit: [], nanites: [], canvases: [] };
      log.calls.push(callRecord);
    }
    if (call && callRecord) {
      const suit = call.querySelector(".rx-suit");
      const meter = call.querySelector(".rx-call-meter > i")?.getAnimations()[0];
      const state = { at: performance.now(), clock: meter ? Number(meter.currentTime) : null };
      if (suit && callRecord.suit.at(-1)?.value !== suit.dataset.suit)
        callRecord.suit.push({ value: suit.dataset.suit, ...state });
      if (suit && callRecord.nanites.at(-1)?.value !== suit.dataset.nanites) {
        callRecord.nanites.push({ value: suit.dataset.nanites, ...state });
        if (suit.dataset.nanites === "canvas")
          callRecord.canvases = [...suit.querySelectorAll("canvas")].map((canvas) => ({
            width: canvas.width,
            height: canvas.height,
          }));
      }
    } else if (callRecord && callRecord.goneAt === null) {
      callRecord.goneAt = performance.now();
      activeCall = null;
      callRecord = null;
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function runCase(browser, profileName, scenario) {
  const profile = profiles[profileName];
  const saveData = scenario === "save-data";
  const context = await browser.newContext({
    ...profile,
    reducedMotion: "no-preference",
    ...(saveData ? { extraHTTPHeaders: { "Save-Data": "on" } } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  if (profileName === "pixel") {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 60,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
      connectionType: "cellular4g",
    });
  }
  await context.addInitScript(installRecorder, { saveData });
  const result = {
    profile: profileName,
    scenario,
    passed: false,
    engineVerified: false,
    profileOptions: profile,
    httpCacheDisabledByFaultRouting:
      scenario.startsWith("failure-") || scenario.startsWith("abort-"),
    taps: [],
    consoleErrors: [],
    pageErrors: [],
    injectedFaults: [],
    requests: [],
  };
  const requests = new Map();
  let navigationAt = null;
  cdp.on("Network.requestWillBeSent", (event) => {
    if (event.type === "Document" && navigationAt === null) navigationAt = event.timestamp;
    if (isRelevantUrl(event.request.url))
      requests.set(event.requestId, {
        url: event.request.url,
        priority: event.request.initialPriority,
        at: event.timestamp,
        doneAt: null,
        failedAt: null,
        failure: null,
        cached: false,
      });
  });
  cdp.on("Network.loadingFinished", (event) => {
    const request = requests.get(event.requestId);
    if (request) request.doneAt = event.timestamp;
  });
  cdp.on("Network.loadingFailed", (event) => {
    const request = requests.get(event.requestId);
    if (request) {
      request.failedAt = event.timestamp;
      request.failure = event.errorText;
      request.cancelled = Boolean(event.canceled);
    }
  });
  cdp.on("Network.requestServedFromCache", ({ requestId }) => {
    const request = requests.get(requestId);
    if (request) request.cached = true;
  });
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      result.consoleErrors.push({ text: message.text(), location: message.location() });
  });
  const now = () => page.evaluate(() => performance.now());
  const tap = async (selector, label) => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: "visible" });
    // Playwright's real tap/click scrolls the target itself; repeating a
    // separate scroll before every action makes the one-second probe later.
    const requestedAt = await now();
    if (profile.hasTouch) await target.tap();
    else await target.click();
    result.taps.push({ label, requestedAt, completedAt: await now() });
  };
  const waitSettled = async (path) => {
    await page.waitForURL((url) => url.pathname === path, { timeout: 30000 });
    await page.waitForFunction(
      () =>
        !document.querySelector(".load-gate") &&
        !document.documentElement.hasAttribute("data-loading"),
      null,
      { timeout: 30000 },
    );
  };
  const worldDisplayed = async () => {
    await waitSettled("/world");
    await page.waitForFunction(
      () =>
        window.__rx17.worldDisplays.length > 0 &&
        document.readyState === "complete" &&
        document.documentElement.hasAttribute("data-press-ready") &&
        document.querySelector("main .hero#top") &&
        Boolean(document.querySelector(".side-panel-trigger")?.getClientRects().length),
    );
    return page.evaluate(() => ({
      firstVisibleAt: window.__rx17.worldDisplays.at(-1).at,
      firstInteractiveObservedAt: window.__rx17.worldInteractiveDisplays.at(-1)?.at ?? null,
      interactiveConfirmedAt: performance.now(),
    }));
  };
  const prepareMenu = async (href) => {
    const startAt = await now();
    if ((await page.locator("#site-side-panel").getAttribute("data-open")) !== "true")
      await tap(".side-panel-trigger", "menu-open");
    const selector = `#site-side-panel a[href="${href}"]`;
    await page.locator(selector).first().waitFor({ state: "visible" });
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    return { selector, startedAt: startAt, preparedAt: await now() };
  };
  const enterRexonance = async (world, delayMs) => {
    const menu = await prepareMenu("/rexonance-saga#top");
    const afterMenu = scenario.startsWith("after-menu-");
    const anchorAt = afterMenu ? menu.preparedAt : world.interactiveConfirmedAt;
    const targetAt = anchorAt + delayMs;
    await page.waitForTimeout(Math.max(0, targetAt - (await now())));
    const before = await page.evaluate(() => ({
      at: performance.now(),
      tapCount: window.__rx17.taps.length,
      fetches: window.__rx17.fetches.map((fetch) => ({ ...fetch })),
    }));
    await tap(menu.selector, "enter-rexonance");
    const actual = await page.evaluate(
      (count) =>
        window.__rx17.taps
          .slice(count)
          .find((tap) => tap.type === "pointerdown" || tap.type === "touchstart") ??
        window.__rx17.taps.slice(count).find((tap) => tap.type === "click"),
      before.tapCount,
    );
    assert.ok(actual, "a real UI pointer/touch event must have started entry");
    result.entryTiming = {
      worldDisplayedAt: world.firstVisibleAt,
      firstInteractiveObservedAt: world.firstInteractiveObservedAt,
      worldInteractiveConfirmedAt: world.interactiveConfirmedAt,
      loadEventAt: result.loadEventAt,
      delayAnchor: afterMenu ? "prepared-menu (not World display)" : "settled-hydrated-world",
      anchorAt,
      requestedDelayMs: delayMs,
      targetAt,
      menuStartedAt: menu.startedAt,
      menuPreparedAt: menu.preparedAt,
      menuPreparationMs: menu.preparedAt - menu.startedAt,
      menuOverrunMs: Math.max(0, menu.preparedAt - targetAt),
      tapActionRequestedAt: before.at,
      actualTapAt: actual.at,
      actualDelayMs: actual.at - anchorAt,
      actualDelayFromFirstVisibleMs: actual.at - world.firstVisibleAt,
      actualDelayFromWorldInteractiveMs: actual.at - world.interactiveConfirmedAt,
      latenessMs: actual.at - targetAt,
    };
    result.beforeEntryFetches = before.fetches;
    await waitSettled("/rexonance-saga");
    await page.waitForFunction(() => window.__rx17.calls.at(-1)?.goneAt !== null, null, {
      timeout: 30000,
    });
    const call = await page.evaluate(() => window.__rx17.calls.at(-1));
    assert.ok(call, "the entry call must actually mount");
    result.call = call;
    if (saveData) {
      assert.ok(
        call.suit.every(({ value }) => value === "whole"),
        "Save-Data preserves the finished still",
      );
      assert.ok(
        !call.nanites.some(({ value }) => value === "canvas"),
        "Save-Data must not start the heavy engine",
      );
      assert.equal(before.fetches.length, 0, "Save-Data does no speculative atlas fetch");
      result.verdict = "EXPECTED_SAVE_DATA_STILL (not an engine pass)";
    } else {
      assert.ok(
        call.suit.some(({ value }) => value === "build"),
        "the real suit must enter build mode",
      );
      assert.ok(
        call.nanites.some(({ value }) => value === "canvas"),
        "DOM plate fallback is not a passing engine result",
      );
      assert.ok(
        call.canvases.length >= 2 &&
          call.canvases.every(({ width, height }) => width > 0 && height > 0),
        "real nanite canvases must have nonzero drawing surfaces",
      );
      result.engineVerified = true;
      result.verdict = "BUILD_CANVAS_ENGINE";
    }
  };
  let releaseHeldRequests = () => {};
  try {
    if (scenario === "failure-retry" || scenario === "failure-pending-retry") {
      if (scenario === "failure-pending-retry") {
        // Hold only the valid gold request until ordinary high intent
        // retries the failed plate. This reproduces a known failure while
        // another source is still pending, without changing application state.
        let released = false;
        const held = new Promise((resolveHeld) => {
          releaseHeldRequests = () => {
            released = true;
            resolveHeld();
          };
        });
        await page.route(`**${REXONANCE_SUIT_GOLD_ATLAS.src}`, async (route) => {
          const fault = {
            kind: "hold-valid-gold-until-atlas-retry",
            url: route.request().url(),
            at: await now(),
            releasedAt: null,
          };
          result.injectedFaults.push(fault);
          if (!released) await held;
          fault.releasedAt = await now();
          await route.continue();
        });
      }
      let attempts = 0;
      await page.route(`**${REXONANCE_SUIT_ATLAS.src}`, async (route) => {
        attempts += 1;
        if (attempts === 1) {
          result.injectedFaults.push({
            kind: "one-atlas-failure",
            url: route.request().url(),
            at: await now(),
          });
          await route.abort("failed");
        } else {
          if (scenario === "failure-pending-retry") releaseHeldRequests();
          await route.continue();
        }
      });
    }
    if (scenario === "abort-resume" || scenario === "abort-intent-resume") {
      let released = false;
      const held = new Promise((resolveHeld) => {
        releaseHeldRequests = () => {
          released = true;
          resolveHeld();
        };
      });
      for (const source of drawn)
        await page.route(`**${source}`, async (route) => {
          if (!released) await held;
          // Cancellation can remove an intercepted request before it is resumed.
          await route.continue().catch(() => undefined);
        });
    }
    await page.goto(new URL(scenario === "roundtrip" ? "/rexonance-saga" : "/world", base).href, {
      waitUntil: "load",
    });
    result.loadEventAt = await page.evaluate(
      () => performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? null,
    );
    if (scenario === "roundtrip") {
      await waitSettled("/rexonance-saga");
      assert.equal(
        [...requests.values()].filter(({ url }) =>
          drawn.some((source) => new URL(url).pathname === source),
        ).length,
        0,
        "direct Rexonance entry keeps speculative suit work off",
      );
      await tap(".rxs-brand", "rexonance-return-world");
    }
    let world = await worldDisplayed();
    result.worldTiming = world;
    if (scenario === "abort-resume" || scenario === "abort-intent-resume") {
      await page.waitForFunction(
        () =>
          window.__rx17.fetches.some(
            (fetch) => fetch.priority === "low" && fetch.pathname === "/world",
          ),
        null,
        { timeout: 20000 },
      );
      if (scenario === "abort-intent-resume") {
        const intentMenu = await prepareMenu("/rexonance-saga#top");
        // Use the ordinary focus/hover handlers; no readiness or priority
        // state is set by this verifier. Then choose Dream in the same menu.
        if (profile.hasTouch) await page.locator(intentMenu.selector).first().focus();
        else await page.locator(intentMenu.selector).first().hover();
        result.highIntentAt = await now();
      }
      const menu = await prepareMenu("/dream-chapter");
      await tap(menu.selector, "world-enter-dream");
      await waitSettled("/dream-chapter");
      const aborts = await page.evaluate(() =>
        window.__rx17.fetches.filter(
          (fetch) => fetch.priority === "low" && fetch.abortedAt !== null,
        ),
      );
      assert.ok(aborts.length > 0, "Dream go must abort the in-flight speculative fetch signal");
      result.backgroundAborts = aborts;
      await tap(".dream-back-link", "dream-return-world");
      world = await worldDisplayed();
      result.returnedWorldTiming = world;
      result.returnedWorldAt = world.firstVisibleAt;
      releaseHeldRequests();
      await page.waitForFunction(
        (at) =>
          window.__rx17.fetches.some(
            (fetch) =>
              fetch.pathname === "/world" &&
              fetch.at >= at &&
              fetch.priority === "low" &&
              fetch.abortedAt === null,
          ),
        world.firstVisibleAt,
        { timeout: 20000 },
      );
      result.resumedBackground = await page.evaluate(
        (at) =>
          window.__rx17.fetches.filter((fetch) => fetch.pathname === "/world" && fetch.at >= at),
        world.firstVisibleAt,
      );
    }
    const delayMs = scenario.startsWith("world-")
      ? Number(scenario.slice(6))
      : scenario.startsWith("after-menu-")
        ? Number(scenario.slice(11))
        : scenario === "failure-pending-retry"
          ? 1000
          : 3500;
    await enterRexonance(world, delayMs);
    if (scenario === "failure-retry" || scenario === "failure-pending-retry") {
      assert.equal(
        result.injectedFaults.filter((fault) => fault.kind === "one-atlas-failure").length,
        1,
      );
      const fetches = await page.evaluate(
        (source) => window.__rx17.fetches.filter((fetch) => new URL(fetch.url).pathname === source),
        REXONANCE_SUIT_ATLAS.src,
      );
      assert.ok(
        fetches.length >= 2,
        "a failed low atlas can be retried through ordinary Rexonance entry",
      );
      assert.ok(fetches.some((fetch) => fetch.priority === "high" && fetch.error === null));
      result.retryFetches = fetches;
      if (scenario === "failure-pending-retry") {
        const gold = await page.evaluate(
          (source) =>
            window.__rx17.fetches.filter((fetch) => new URL(fetch.url).pathname === source),
          REXONANCE_SUIT_GOLD_ATLAS.src,
        );
        const retry = fetches.find((fetch) => fetch.priority === "high" && fetch.error === null);
        assert.equal(gold.length, 1, "the valid gold request is not duplicated");
        assert.equal(gold[0].abortedAt, null, "the valid pending request is retained");
        assert.ok(
          gold[0].at < retry.at && gold[0].bodyDoneAt > retry.at,
          "the missing-only high retry starts while the original gold body is still pending",
        );
        result.pendingOverlapVerified = true;
      }
    }
    assert.deepEqual(result.pageErrors, [], "no uncaught browser exception");
    const unexpectedConsole = result.consoleErrors.filter(
      (error) =>
        !result.injectedFaults.some((fault) => fault.url === error.location.url) &&
        !(scenario.startsWith("abort-") && isSuitUrl(error.location.url)) &&
        !/favicon\.ico/.test(error.location.url),
    );
    assert.deepEqual(unexpectedConsole, [], "no unexpected console error");
    result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    result.verdict ??= "FAIL (DOM/still/no-call never promoted to an engine pass)";
  } finally {
    releaseHeldRequests();
    result.observed = await page.evaluate(() => window.__rx17).catch(() => null);
    result.requests = [...requests.values()].map((request) => ({
      ...request,
      url: request.url.replace(base.origin, ""),
      at: (request.at - navigationAt) * 1000,
      doneAt: request.doneAt === null ? null : (request.doneAt - navigationAt) * 1000,
      failedAt: request.failedAt === null ? null : (request.failedAt - navigationAt) * 1000,
    }));
    if (result.entryTiming && result.observed)
      result.postTapLongTasks = result.observed.longTasks.filter(
        ({ at }) => at >= result.entryTiming.actualTapAt,
      );
    await context.close();
  }
  return result;
}

await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
try {
  verification: for (const profile of selectedProfiles)
    for (const scenario of selectedScenarios) {
      const result = await runCase(browser, profile, scenario);
      report.cases.push(result);
      await writeFile(output, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          profile,
          scenario,
          passed: result.passed,
          verdict: result.verdict,
          actualDelayMs: result.entryTiming?.actualDelayMs,
          latenessMs: result.entryTiming?.latenessMs,
          failure: result.failure?.message,
        }),
      );
      if (!result.passed) {
        report.stoppedAfter = { profile, scenario, reason: result.failure?.message };
        break verification;
      }
    }
} finally {
  await browser.close();
}
report.passed = report.cases.every(({ passed }) => passed);
report.engineVerifiedCases = report.cases.filter(({ engineVerified }) => engineVerified).length;
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    output,
    passed: report.passed,
    cases: report.cases.length,
    engineVerifiedCases: report.engineVerifiedCases,
  }),
);
if (!report.passed) process.exitCode = 1;
