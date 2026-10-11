// Local, sequential, settled-material scroll audit. Ordinary CDP mouse/touch
// input is used for measured scrolling. Rect stack + CPU sampling is a separate
// diagnostic pass and must never be compared as the primary performance result.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8082");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "local preview only");
const out = resolve(process.env.SCROLL_OUTPUT || "/private/tmp/scroll-review/baseline");
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
const routes = {
  world: { path: "/world", locations: ["#story", "#riders", "#manager-archive", "#top"] },
  dream: { path: "/dream-chapter", locations: ["#posters", "#characters"] },
  extreme: { path: "/extreme-saga", locations: ["#p14", "#stages"] },
  rexonance: { path: "/rexonance-saga", locations: ["#p14", "#stages"] },
  gallery: {
    path: "/gallery",
    locations: ["#gallery-collection", ".gallery-grid > :nth-child(25)", "#gallery-title"],
  },
  character: { path: "/characters/terra", locations: ["#dossier-index", "#form-records"] },
};
function selected(value, choices) {
  const names = value ? value.split(",").map((s) => s.trim()) : choices;
  for (const name of names) assert.ok(choices.includes(name), `unknown selection ${name}`);
  return names;
}
const selectedProfiles = selected(process.env.SCROLL_PROFILES, Object.keys(profiles));
// Ultra is now a historical-baseline probe only; final runs default to normal.
const selectedModes = selected(process.env.SCROLL_MODES || "normal", ["normal", "ultra"]);
const selectedRoutes = selected(process.env.SCROLL_ROUTES, Object.keys(routes));
const locationIndices = process.env.SCROLL_LOCATIONS?.split(",").map(Number);
const captureOnly = process.env.SCROLL_CAPTURE_ONLY === "1";
const diagnostic = process.env.SCROLL_DIAGNOSTIC !== "0" && !captureOnly;
const materialCheck = process.env.SCROLL_MATERIAL_CHECK || "intersection-observer";
assert.ok(["intersection-observer", "rect-history"].includes(materialCheck));
const quality = process.env.SCROLL_ULTRA_QUALITY || "high";
assert.ok(["high", "cinema"].includes(quality));
const distance = Number(process.env.SCROLL_DISTANCE || 900);
const speed = 400;
const idleMs = 2500;
const references = process.env.SCROLL_REFERENCE
  ? (
      await Promise.all(
        process.env.SCROLL_REFERENCE.split(",").map(async (path) =>
          JSON.parse(await readFile(path, "utf8")),
        ),
      )
    ).flatMap((item) => item.cases)
  : [];
let stopRequested = false;
process.once("SIGTERM", () => {
  stopRequested = true;
});
process.once("SIGINT", () => {
  stopRequested = true;
});
const report = {
  generatedAt: new Date().toISOString(),
  base: base.origin,
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  buildLabel:
    process.env.SCROLL_BUILD_ID || "workspace preview (see delivered module fingerprints)",
  settings: {
    profiles,
    pixelCpuRate: 4,
    input: "CDP Input.synthesizeScrollGesture, mouse or touch, preventFling=true",
    distance,
    speed,
    idleMs,
    captureOnly,
    ultraQuality: quality,
    materialSettling:
      "load + fonts + networkquiet + visible images decode bounded 2500ms + 1800ms at each fixed location; lazy images do not block",
    visibleImageCheck: materialCheck,
    primary: captureOnly
      ? "visual capture only: no timing phases or CPU profiler"
      : "Performance.getMetrics + minimal rAF/longtask observer, no rect wrapping or CPU profiler",
    diagnostic: diagnostic
      ? "separate repeated gesture with rect stack wrapping and CPU profiler; overhead excluded from primary"
      : "disabled",
    coldPagePerRoute: false,
    networkThrottling: false,
    positionReferences: process.env.SCROLL_REFERENCE || null,
    deviceCaveat: "Chromium emulation, not physical Safari/iPad/iPhone",
  },
  cases: [],
};

function recorder({ mode, quality, materialCheck }) {
  localStorage.setItem("dw-ultra-mode-v1", mode === "ultra" ? "true" : "false");
  localStorage.setItem("dw-ultra-quality-v1", quality);
  const audit = (window.__scrollLoad = { active: null, phases: [] });
  audit.visibleImages = async () => {
    const images = [...document.images];
    if (materialCheck === "rect-history")
      return images.filter((image) => {
        const r = image.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      });
    if (images.length === 0) return [];
    // A harness-only native observer must not force layout of every image in
    // offscreen content-visibility:auto sections before a performance run.
    return new Promise((resolve) => {
      const seen = new Set();
      const visible = new Set();
      let timeout;
      const finish = () => {
        observer.disconnect();
        clearTimeout(timeout);
        resolve([...visible]);
      };
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          seen.add(entry.target);
          if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        if (seen.size === images.length) finish();
      });
      timeout = setTimeout(finish, 500);
      for (const image of images) observer.observe(image);
    });
  };
  new PerformanceObserver((list) => {
    const p = audit.active;
    if (!p) return;
    for (const e of list.getEntries())
      if (e.startTime >= p.startAt) p.longtasks.push({ at: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: false });
  audit.start = (name) => {
    const p = {
      name,
      startAt: performance.now(),
      startY: scrollY,
      frames: [],
      longtasks: [],
      events: 0,
    };
    audit.active = p;
    audit.phases.push(p);
    let last;
    const frame = (now) => {
      if (audit.active !== p) return;
      if (last !== undefined) p.frames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return p.startAt;
  };
  audit.stop = () => {
    const p = audit.active;
    p.endAt = performance.now();
    p.endY = scrollY;
    audit.active = null;
    return p;
  };
  addEventListener(
    "scroll",
    () => {
      if (audit.active) audit.active.events++;
    },
    { passive: true },
  );
  audit.installRectDiagnostic = () => {
    const rect = Element.prototype.getBoundingClientRect;
    const style = window.getComputedStyle;
    const empty = () => ({
      rectCalls: 0,
      rectNativeMs: 0,
      styleCalls: 0,
      stacks: {},
      geometryReads: {},
      geometrySamples: {},
      geometryNativeMs: 0,
    });
    let counts = empty();
    const restoreGeometry = [];
    for (const [prototype, names] of [
      [
        HTMLElement.prototype,
        ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop", "offsetParent"],
      ],
      [
        Element.prototype,
        ["clientWidth", "clientHeight", "clientLeft", "clientTop", "scrollHeight"],
      ],
    ]) {
      for (const name of names) {
        const original = Object.getOwnPropertyDescriptor(prototype, name);
        if (!original?.get || !original.configurable) continue;
        Object.defineProperty(prototype, name, {
          ...original,
          get() {
            const count = (counts.geometryReads[name] = (counts.geometryReads[name] || 0) + 1);
            // Only 1/16 getter stacks are sampled; primary has no getter wrappers.
            if (count === 1 || count % 16 === 0) {
              const caller = `${name} ${this.tagName}#${this.id}.${String(this.className).slice(0, 90)}\n${new Error().stack?.split("\n").slice(2, 5).join("\n")}`;
              counts.geometrySamples[caller] = (counts.geometrySamples[caller] || 0) + 1;
            }
            const at = performance.now();
            const result = original.get.call(this);
            counts.geometryNativeMs += performance.now() - at;
            return result;
          },
        });
        restoreGeometry.push(() => Object.defineProperty(prototype, name, original));
      }
    }
    Element.prototype.getBoundingClientRect = function (...args) {
      counts.rectCalls++;
      const stack = new Error().stack?.split("\n").slice(2, 5).join("\n") || "unknown";
      const key = `${this.tagName}#${this.id}.${String(this.className).slice(0, 100)}\n${stack}`;
      counts.stacks[key] = (counts.stacks[key] || 0) + 1;
      const at = performance.now();
      const result = rect.apply(this, args);
      counts.rectNativeMs += performance.now() - at;
      return result;
    };
    window.getComputedStyle = function (...args) {
      counts.styleCalls++;
      return style.apply(this, args);
    };
    audit.readRectDiagnostic = () => counts;
    audit.resetRectDiagnostic = () => {
      counts = empty();
    };
    audit.removeRectDiagnostic = () => {
      Element.prototype.getBoundingClientRect = rect;
      window.getComputedStyle = style;
      for (const restore of restoreGeometry) restore();
      return counts;
    };
  };
}

function phaseSummary(raw, metrics) {
  const sorted = [...raw.frames].sort((a, b) => a - b);
  const p = (v) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * v))] || 0;
  return {
    name: raw.name,
    durationMs: raw.endAt - raw.startAt,
    startY: raw.startY,
    endY: raw.endY,
    scrollEvents: raw.events,
    metrics,
    frame: {
      count: sorted.length,
      p50: p(0.5),
      p95: p(0.95),
      max: sorted.at(-1) || 0,
      gapsOver34: sorted.filter((v) => v > 34).length,
      gapsOver50: sorted.filter((v) => v > 50).length,
    },
    longtasks: raw.longtasks,
    longtaskTotalMs: raw.longtasks.reduce((n, e) => n + e.duration, 0),
  };
}
const metricNames = new Set([
  "ScriptDuration",
  "TaskDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
  "LayoutCount",
  "RecalcStyleCount",
  "JSHeapUsedSize",
  "Nodes",
]);
async function metrics(cdp) {
  return Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics
      .filter((m) => metricNames.has(m.name))
      .map((m) => [m.name, m.value]),
  );
}
function metricDiff(before, after) {
  return Object.fromEntries(
    Object.keys(before).map((key) => [key, Number((after[key] - before[key]).toFixed(6))]),
  );
}
function profileSummary(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const values = new Map();
  for (let i = 0; i < (profile.samples?.length || 0); i++) {
    const id = profile.samples[i];
    values.set(id, (values.get(id) || 0) + (profile.timeDeltas[i] || 0));
  }
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 35)
    .map(([id, us]) => ({ ms: us / 1000, ...byId.get(id).callFrame }));
}
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(out, { recursive: true });
const save = () => writeFile(join(out, "scroll-load.json"), JSON.stringify(report, null, 2));
try {
  matrix: for (const profileName of selectedProfiles) {
    for (const mode of selectedModes) {
      const context = await browser.newContext({
        ...profiles[profileName],
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      await page.addInitScript(recorder, { mode, quality, materialCheck });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      if (profileName === "pixel") await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      for (const routeName of selectedRoutes) {
        if (stopRequested) break matrix;
        const route = routes[routeName];
        const errors = [],
          requestFailures = [];
        const onError = (error) => errors.push(String(error));
        const onConsole = (message) => {
          if (message.type() === "error") errors.push(message.text());
        };
        const onFailure = (request) =>
          requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
        page.on("pageerror", onError);
        page.on("console", onConsole);
        page.on("requestfailed", onFailure);
        const record = {
          profile: profileName,
          mode,
          route: routeName,
          path: route.path,
          errors,
          requestFailures,
          locations: [],
        };
        report.cases.push(record);
        await page.goto(new URL(route.path, base).href, { waitUntil: "load" });
        await page.waitForFunction(
          () =>
            document.querySelector("main") &&
            document.documentElement.hasAttribute("data-press-ready") &&
            !document.querySelector(".load-gate") &&
            !document.documentElement.hasAttribute("data-loading") &&
            !document.documentElement.hasAttribute("data-route-scroll-settling"),
          null,
          { timeout: 30000 },
        );
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1800);
        record.actualSettings = await page.evaluate(() => ({
          ultra: document.documentElement.dataset.ultraMode || "off",
          ultraMotion: document.documentElement.dataset.ultraMotion || "off",
          renderer: document.documentElement.dataset.ultraRenderer || null,
          worldEffects: document.documentElement.dataset.worldEffects || null,
          device: document.documentElement.dataset.androidRenderer || null,
          modeStored: localStorage.getItem("dw-ultra-mode-v1"),
          qualityStored: localStorage.getItem("dw-ultra-quality-v1"),
          domNodes: document.querySelectorAll("*").length,
        }));
        // The retired mode now removes legacy keys. Either the baseline's
        // stored false or the candidate's absent key denotes normal, never on.
        if (mode === "normal")
          assert.ok(
            record.actualSettings.modeStored === null ||
              record.actualSettings.modeStored === "false",
            "normal must not retain an enabled Ultra setting",
          );
        else assert.equal(record.actualSettings.modeStored, "true");
        assert.equal(record.actualSettings.ultra, mode === "ultra" ? "on" : "off");
        record.deliveredModules = await page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .filter((entry) => /\/assets\/[^/]+\.js(?:\?|$)/.test(entry.name))
            .map((entry) => new URL(entry.name).pathname),
        );
        for (let index = 0; index < route.locations.length; index++) {
          if (stopRequested) break matrix;
          if (locationIndices && !locationIndices.includes(index)) continue;
          const selector = route.locations[index];
          const location = { selector, index, diagnosticHasOverhead: diagnostic };
          record.locations.push(location);
          const reference = references
            .find(
              (item) =>
                item.profile === profileName && item.mode === mode && item.route === routeName,
            )
            ?.locations.find((item) => item.selector === selector);
          const position = await page
            .locator(selector)
            .first()
            .evaluate(
              (node, { referenceY, margin }) => {
                const max = document.documentElement.scrollHeight - innerHeight;
                const y = Math.max(
                  0,
                  Math.min(
                    max - margin,
                    referenceY ?? scrollY + node.getBoundingClientRect().top - 145,
                  ),
                );
                scrollTo({ top: y, behavior: "instant" });
                return {
                  requestedY: y,
                  targetId: node.id,
                  documentHeight: document.documentElement.scrollHeight,
                  maxScroll: max,
                };
              },
              { referenceY: reference?.position.requestedY ?? null, margin: distance + 150 },
            );
          location.position = position;
          const settle = async () => {
            await page.evaluate(async () => {
              const ready = Promise.all(
                (await window.__scrollLoad.visibleImages())
                  .filter((image) => image.complete || image.loading !== "lazy")
                  .map((image) => image.decode().catch(() => {})),
              );
              await Promise.race([ready, new Promise((done) => setTimeout(done, 2500))]);
            });
            await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(1800);
            return page.evaluate(async () => {
              const visible = await window.__scrollLoad.visibleImages();
              const missing = visible
                .filter((image) => !image.complete || image.naturalWidth === 0)
                .map((image) => image.currentSrc || image.src);
              return {
                actualY: scrollY,
                documentHeight: document.documentElement.scrollHeight,
                fontStatus: document.fonts.status,
                visibleImageCount: visible.length,
                missingVisibleImages: missing,
                comparisonEligible: missing.length === 0 && document.fonts.status === "loaded",
              };
            });
          };
          location.settled = await settle();
          location.beforeScreenshot = join(
            out,
            `${profileName}-${mode}-${routeName}-${index}-before.png`,
          );
          await page.screenshot({ path: location.beforeScreenshot, animations: "allow" });
          const gesture = async () => {
            await cdp.send("Input.synthesizeScrollGesture", {
              x: Math.round(profiles[profileName].viewport.width * 0.53),
              y: Math.round(profiles[profileName].viewport.height * 0.7),
              yDistance: -distance,
              speed,
              preventFling: true,
              gestureSourceType: profileName === "pixel" ? "touch" : "mouse",
            });
          };
          const measure = async (name, action) => {
            const before = await metrics(cdp);
            await page.evaluate((name) => window.__scrollLoad.start(name), name);
            await action();
            const raw = await page.evaluate(() => window.__scrollLoad.stop());
            const after = await metrics(cdp);
            return phaseSummary(raw, metricDiff(before, after));
          };
          if (captureOnly) {
            const startY = await page.evaluate(() => scrollY);
            await gesture();
            await page.waitForTimeout(idleMs);
            location.capture = { startY, endY: await page.evaluate(() => scrollY) };
          } else {
            location.idle = await measure("idle-primary", () => page.waitForTimeout(idleMs));
            location.scroll = await measure("scroll-primary", gesture);
            location.scrollSettle = await measure("scroll-stop-settle-primary", () =>
              page.waitForTimeout(idleMs),
            );
          }
          const movement = location.capture || location.scroll;
          assert.ok(
            movement.endY - movement.startY > distance * 0.75,
            `scroll blocked: ${profileName}/${mode}/${routeName}/${selector} ${JSON.stringify(movement)}`,
          );
          location.afterScreenshot = join(
            out,
            `${profileName}-${mode}-${routeName}-${index}-after.png`,
          );
          await page.screenshot({ path: location.afterScreenshot, animations: "allow" });
          location.fixedSurfaces = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                ".topbar,.manager-topbar,.dream-site-header,.rxs-header,.rxs-local-nav,.gallery-header,.ultra-effects,.world-atmosphere,.zeus-button",
              ),
            ]
              .slice(0, 20)
              .map((node) => {
                const style = getComputedStyle(node),
                  box = node.getBoundingClientRect();
                return {
                  tag: node.tagName,
                  className: node.className,
                  position: style.position,
                  filter: style.filter,
                  backdropFilter: style.backdropFilter,
                  contain: style.contain,
                  willChange: style.willChange,
                  transform: style.transform,
                  opacity: style.opacity,
                  rect: { x: box.x, y: box.y, width: box.width, height: box.height },
                };
              }),
          );
          if (diagnostic) {
            await page.evaluate(
              (y) => scrollTo({ top: y, behavior: "instant" }),
              position.requestedY,
            );
            await settle();
            await page.evaluate(() => window.__scrollLoad.installRectDiagnostic());
            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
            await cdp.send("Profiler.start");
            location.diagnostic = await measure("scroll-diagnostic-overhead", gesture);
            const scrollRect = await page.evaluate(() => window.__scrollLoad.readRectDiagnostic());
            await page.evaluate(() => window.__scrollLoad.resetRectDiagnostic());
            location.diagnosticSettle = await measure(
              "scroll-stop-settle-diagnostic-overhead",
              () => page.waitForTimeout(idleMs),
            );
            const { profile } = await cdp.send("Profiler.stop");
            const rect = await page.evaluate(() => window.__scrollLoad.removeRectDiagnostic());
            const rectSummary = (rect) => ({
              ...rect,
              geometrySamples: Object.entries(rect.geometrySamples)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30)
                .map(([caller, sampledCount]) => ({ caller, sampledCount })),
              stacks: Object.entries(rect.stacks)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 35)
                .map(([caller, count]) => ({ caller, count })),
            });
            location.diagnostic.rect = rectSummary(scrollRect);
            location.diagnosticSettle.rect = rectSummary(rect);
            location.diagnostic.cpuTop = profileSummary(profile);
            await writeFile(
              join(out, `${profileName}-${mode}-${routeName}-${index}.cpuprofile`),
              JSON.stringify(profile),
            );
          }
          await save();
          console.log(
            JSON.stringify(
              captureOnly
                ? {
                    profile: profileName,
                    mode,
                    route: routeName,
                    selector,
                    captureOnly: true,
                    requestedY: location.position.requestedY,
                    ...location.capture,
                    ...location.settled,
                  }
                : {
                    profile: profileName,
                    mode,
                    route: routeName,
                    selector,
                    scrollY: location.scroll.startY,
                    scriptMs: location.scroll.metrics.ScriptDuration * 1000,
                    styleMs: location.scroll.metrics.RecalcStyleDuration * 1000,
                    layoutMs: location.scroll.metrics.LayoutDuration * 1000,
                    longtaskMs: location.scroll.longtaskTotalMs,
                    frameP95: location.scroll.frame.p95,
                    rectCallsDiagnostic: location.diagnostic?.rect.rectCalls,
                    idleScriptMs: location.idle.metrics.ScriptDuration * 1000,
                    stopScriptMs: location.scrollSettle.metrics.ScriptDuration * 1000,
                    stopStyleMs: location.scrollSettle.metrics.RecalcStyleDuration * 1000,
                    stopLayoutMs: location.scrollSettle.metrics.LayoutDuration * 1000,
                    stopLongtaskMs: location.scrollSettle.longtaskTotalMs,
                    stopRectCallsDiagnostic: location.diagnosticSettle?.rect.rectCalls,
                  },
            ),
          );
        }
        page.off("pageerror", onError);
        page.off("console", onConsole);
        page.off("requestfailed", onFailure);
        await save();
      }
      await context.close();
    }
  }
} finally {
  await save();
  await browser.close();
}
console.log(
  JSON.stringify({
    output: join(out, "scroll-load.json"),
    cases: report.cases.length,
    locations: report.cases.reduce((n, c) => n + c.locations.length, 0),
    completed: !stopRequested,
  }),
);
