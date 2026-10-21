// Real browser evidence for the Blender flame, not a source-string audit.
// BASE_URL=... [FLAME_BASELINE=1] [FLAME_PROFILES=desktop,phone320,tablet1024]
// [FLAME_CASES=normal,blocked,reduced] [BROWSER=webkit] node scripts/verify-rexonance-flame.mjs
// [FLAME_COVERAGE_MIN=0.05] overrides the default registered eleven-region peak gate.
// [OUT_DIR=output/playwright/rexonance-flame] [FLAME_NATURAL=1] controls evidence/real-clock capture.
// [FLAME_ENTRY_DETAIL=1] adds four diagnostic prelude/handoff shots; leave off for WebKit's bounded entry wall clock.
// The disposable profile never posts gallery images or changes public data.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import sharp from "sharp";
import { connectedFireEvidence } from "./rexonance-fire-evidence.mjs";
import { assertSpreadSequence, flameSpreadEvidence } from "./rexonance-spread-evidence.mjs";
import { entryCanonicalTime, NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";

const materialEntry = NANITE_FIRE_PHASES.materialStart * 2400;
const materialScroll = 0.015 + 0.285 * NANITE_FIRE_PHASES.materialStart;

const base = process.env.BASE_URL || "http://127.0.0.1:8197";
const out = process.env.OUT_DIR || "output/playwright/rexonance-flame";
const baseline = process.env.FLAME_BASELINE === "1";
const naturalClock = process.env.FLAME_NATURAL === "1";
// Extra ignition/firebrand shots are diagnostic, not another four waits
// inside WebKit's non-pausable route-coordinator wall-clock deadline.
const detailedEntry = process.env.FLAME_ENTRY_DETAIL === "1";
const entrySamples = detailedEntry
  ? [60, 180, 280, 420, 900, 1250, 1360, 1400, 1420, 1460, 1520, 1560, 1590, 1600, 1620, 1850, 3600]
  : [60, 180, 280, 420, 900, 1250, 1420, 1460, 1560, 1590, 1600, 1620, 1850, 3600];
const entryPeak = (shot) => [1250, 1420, 1460].includes(shot.target);
const coverageMinimum = process.env.FLAME_COVERAGE_MIN
  ? Number(process.env.FLAME_COVERAGE_MIN)
  : null;
assert.ok(
  coverageMinimum === null ||
    (Number.isFinite(coverageMinimum) && coverageMinimum > 0 && coverageMinimum <= 1),
  "FLAME_COVERAGE_MIN must be a ratio greater than zero and at most one",
);
// Inner patches of the authored 571x1040 body, not its green halo. Chest
// and abdomen are separate so a bright reactor alone cannot pass a torso.
const bodyRegions = {
  head: [259, 104, 48, 60],
  chest: [250, 245, 70, 64],
  abdomen: [253, 348, 62, 56],
  armLeft: [111, 420, 31, 70],
  armRight: [429, 420, 31, 70],
  thighLeft: [185, 540, 40, 85],
  thighRight: [343, 540, 40, 85],
  shinLeft: [146, 760, 31, 90],
  shinRight: [393, 760, 31, 90],
  footLeft: [122, 955, 45, 45],
  footRight: [404, 955, 45, 45],
};
const asset = "/rexonance-flame-natural-20261019/flame.webp";
const evidenceWidth = 171;
const evidenceHeight = 312;
const bodyMask = await sharp(
  await readFile(new URL("../public/rexonance-suit-20261016/undersuit-20261021.webp", import.meta.url)),
)
  .ensureAlpha()
  .resize(evidenceWidth, evidenceHeight)
  .extractChannel(3)
  .raw()
  .toBuffer();
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone320: {
    viewport: { width: 320, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    ...(engine === chromium ? { isMobile: true } : {}),
  },
  tablet1024: {
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    hasTouch: true,
    ...(engine === chromium ? { isMobile: true } : {}),
  },
};
const selected = (process.env.FLAME_PROFILES || Object.keys(profiles).join(",")).split(",");
const cases = (process.env.FLAME_CASES || "normal,blocked,reduced").split(",");
for (const name of selected) assert.ok(profiles[name], `Unknown profile ${name}`);
for (const mode of cases) assert.ok(["normal", "blocked", "reduced"].includes(mode), mode);
await mkdir(out, { recursive: true });
const results = [];

async function installProbe(context) {
  await context.addInitScript((path) => {
    const state = {
      draws: { entry: 0, scroll: 0, other: 0 },
      atlas: { entry: 0, scroll: 0, other: 0 },
      fallback: { entry: 0, scroll: 0, other: 0 },
      nativeNanites: { entry: 0, scroll: 0, other: 0 },
      nativeFrames: { entry: null, scroll: null, other: null },
      atlasFrames: [],
      samples: [],
      lastDraw: 0,
      frameMs: [],
      entryFrameMs: [],
      measureEntry: false,
      drawMs: [],
    };
    window.__flameQA = state;
    // Track the actual native images (including prepared ImageBitmaps and
    // their cached canvas descendants), not a source-string assertion.
    // This observes the real kit bitmap pass. Typed-metal geometry is
    // separately proved empty in the in-memory drawing-pass tests.
    const naniteSources = new WeakSet();
    const flameSources = new WeakSet();
    const nativeFrames = new WeakMap();
    const lastPaintFrames = new WeakMap();
    let frameSerial = 0;
    const canvasKind = (canvas) =>
      canvas?.matches?.(".rx-suit-nanites canvas")
        ? "entry"
        : canvas?.matches?.("canvas.rzn-canvas")
          ? "scroll"
          : "other";
    const beginNativeFrame = (canvas, reason) => {
      naniteSources.delete(canvas);
      flameSources.delete(canvas);
      const kind = canvasKind(canvas),
        geometry = state.scrollGeometry;
      const frame = {
        id: ++frameSerial,
        reason,
        width: canvas.width,
        height: canvas.height,
        images: 0,
        nanites: 0,
        flames: 0,
        startedAt: performance.now(),
        actual:
          kind === "scroll" && geometry
            ? (scrollY - (geometry.top - geometry.pin)) / (geometry.height - geometry.frameHeight)
            : null,
      };
      nativeFrames.set(canvas, frame);
    };
    const naniteURL = /\/rexonance-nanites-20261018\/(?:cells|comets|guide|fx)\.webp/;
    const isNanite = (source) =>
      Boolean(
        source &&
        (naniteSources.has(source) ||
          (typeof source.src === "string" && naniteURL.test(source.src))),
      );
    // The real kit intentionally decodes fetch(Response.blob()), not Image.
    // Preserve that native path and carry the response URL's provenance to
    // the Blob and its bitmap; otherwise a zero count would be vacuous.
    const blob = Response.prototype.blob;
    Response.prototype.blob = async function (...args) {
      const result = await blob.apply(this, args);
      if (naniteURL.test(this.url)) naniteSources.add(result);
      return result;
    };
    if (typeof window.createImageBitmap === "function") {
      const create = window.createImageBitmap;
      window.createImageBitmap = async function (source, ...args) {
        const result = await create.call(this, source, ...args);
        if (isNanite(source)) naniteSources.add(result);
        return result;
      };
    }
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      const matrix = this.getTransform();
      if (
        matrix.a === 1 &&
        matrix.d === 1 &&
        !matrix.b &&
        !matrix.c &&
        !matrix.e &&
        !matrix.f &&
        x <= 0 &&
        y <= 0 &&
        x + width >= this.canvas.width &&
        y + height >= this.canvas.height
      )
        beginNativeFrame(this.canvas, "full-clear");
      return clear.call(this, x, y, width, height);
    };
    if (typeof CanvasRenderingContext2D.prototype.reset === "function") {
      const reset = CanvasRenderingContext2D.prototype.reset;
      CanvasRenderingContext2D.prototype.reset = function (...args) {
        beginNativeFrame(this.canvas, "context-reset");
        return reset.apply(this, args);
      };
    }
    for (const dimension of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, dimension);
      if (descriptor?.set && descriptor.configurable)
        Object.defineProperty(HTMLCanvasElement.prototype, dimension, {
          ...descriptor,
          set(value) {
            beginNativeFrame(this, `resize-${dimension}`);
            descriptor.set.call(this, value);
          },
        });
    }
    window.__flameQAInspect = (canvas) => ({
      tagged: naniteSources.has(canvas),
      frame: { ...nativeFrames.get(canvas) },
      lastPaint: { ...lastPaintFrames.get(canvas) },
    });
    window.__rexonanceDrawMs = (ms, progress, calm) => {
      if (progress > 0.02 && progress < 0.3 && !calm && state.drawMs.length < 2000)
        state.drawMs.push(ms);
    };
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const kind = canvasKind(this.canvas);
      const source = args[0];
      const frame = nativeFrames.get(this.canvas);
      if (frame) {
        frame.images++;
        lastPaintFrames.set(this.canvas, frame);
        state.nativeFrames[kind] = frame;
      }
      if (isNanite(source)) {
        naniteSources.add(this.canvas);
        if (this.globalAlpha > 0) {
          state.nativeNanites[kind]++;
          if (frame) frame.nanites++;
        }
      }
      const isAtlas = typeof source?.src === "string" && source.src.includes(path);
      const isFallback =
        source instanceof HTMLCanvasElement && source.width === 96 && source.height === 192;
      if ((isAtlas || isFallback || flameSources.has(source)) && this.globalAlpha > 0) {
        flameSources.add(this.canvas);
        if (frame) frame.flames++;
        if (
          kind !== "other" &&
          source instanceof HTMLCanvasElement &&
          source.width === 384 &&
          source.height === 624
        )
          state.latestField = source;
      }
      if (isFallback) state.fallback[kind]++;
      state.draws[kind] += 1;
      if (kind !== "other") state.lastDraw = performance.now();
      if (isAtlas) {
        state.atlas[kind] += 1;
        const key = `${args[1]},${args[2]}`;
        if (!state.atlasFrames.includes(key)) state.atlasFrames.push(key);
        if (state.samples.length < 16)
          state.samples.push({
            kind,
            arguments: args.slice(1),
            composite: this.globalCompositeOperation,
          });
      }
      return original.apply(this, args);
    };
    let last = 0;
    const frame = (time) => {
      if (
        last &&
        state.measureEntry &&
        document.querySelector('.rx-call-sequence[data-mode="entry"]') &&
        state.entryFrameMs.length < 1000
      )
        state.entryFrameMs.push(time - last);
      if (last && document.querySelector('.rzn-suitup[data-rzn-state="live"]')) {
        const rect = document.querySelector(".rzn-suitup").getBoundingClientRect();
        if (rect.top <= innerHeight && rect.bottom >= 0 && state.frameMs.length < 2000)
          state.frameMs.push(time - last);
      }
      last = time;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, asset);
}

async function nativeNaniteWindow(page, kind) {
  return page.evaluate(
    (kind) =>
      new Promise((resolve) => {
        const before = window.__flameQA.nativeNanites[kind];
        const atlasBefore = window.__flameQA.atlas[kind];
        const fallbackBefore = window.__flameQA.fallback[kind];
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({
              nanites: window.__flameQA.nativeNanites[kind] - before,
              atlas: window.__flameQA.atlas[kind] - atlasBefore,
              fallback: window.__flameQA.fallback[kind] - fallbackBefore,
            }),
          ),
        );
      }),
    kind,
  );
}

const settled = (page) =>
  page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 60000 },
  );

async function openEntry(page, animated = true) {
  const trigger = page.locator(".side-panel-trigger").first();
  await trigger.click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.scrollIntoViewIfNeeded();
  await link.click();
  if (animated)
    await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 15000 });
  else await page.waitForURL("**/rexonance-saga#top", { timeout: 15000 });
}

async function readRunway(page) {
  return page.evaluate(() => {
    const runway = document.querySelector(".rzn-suitup");
    const frame = runway?.querySelector(".rzn-frame");
    const geometry = {
      top: runway?.getBoundingClientRect().top + scrollY,
      height: runway?.offsetHeight,
      frameHeight: frame?.offsetHeight,
      pin: Number.parseFloat(frame ? getComputedStyle(frame).top : "0") || 0,
      state: runway?.dataset.rznState || null,
      scrollY,
    };
    window.__flameQA.scrollGeometry = geometry;
    return geometry;
  });
}

async function scrollToProgress(page, progress) {
  const nativeBefore = await page.evaluate(() => window.__flameQA.nativeNanites.scroll);
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readRunway(page);
    await page.evaluate(
      ({ state, progress }) =>
        scrollTo({
          top: Math.ceil(state.top - state.pin + progress * (state.height - state.frameHeight)),
          behavior: "instant",
        }),
      { state, progress },
    );
    await page.waitForTimeout(420);
    const next = await readRunway(page);
    const actual = (next.scrollY - (next.top - next.pin)) / (next.height - next.frameHeight);
    if (Math.abs(actual - progress) < 0.002)
      return {
        ...next,
        actual,
        nativeBeforeReady: await page.evaluate(() => {
          const canvas = document.querySelector(".rzn-suitup canvas.rzn-canvas");
          return {
            backing: canvas ? [canvas.width, canvas.height] : null,
            load: canvas?.closest(".rzn-suitup")?.dataset.rznLoad,
            inspected: canvas ? window.__flameQAInspect(canvas) : null,
          };
        }),
        nativeTransitionDraws: await page.evaluate(
          (before) => window.__flameQA.nativeNanites.scroll - before,
          nativeBefore,
        ),
      };
  }
  throw new Error(`Scroll target ${progress} was not reached with current geometry`);
}

async function canvasPixels(page, selector) {
  return page.evaluate(
    ({ query, regions }) => {
      const source = document.querySelector(query);
      if (!source?.width || !source.height) return null;
      const sample = document.createElement("canvas");
      sample.width = 48;
      sample.height = 80;
      const c = sample.getContext("2d", { willReadFrequently: true });
      c.drawImage(source, 0, 0, sample.width, sample.height);
      const data = c.getImageData(0, 0, sample.width, sample.height).data;
      let [visible, green, hash] = [0, 0, 2166136261];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 8) {
          visible++;
          if (data[i + 1] > data[i] * 1.2 && data[i + 1] > data[i + 2] * 1.15) green++;
        }
        for (let k = 0; k < 4; k++) hash = Math.imul(hash ^ data[i + k], 16777619);
      }
      const result = {
        width: source.width,
        height: source.height,
        visible,
        green,
        hash: (hash >>> 0).toString(16),
        fieldPNG:
          window.__flameQA.nativeFrames[source.matches(".rzn-canvas") ? "scroll" : "entry"]
            ?.flames > 0
            ? window.__flameQA.latestField?.toDataURL("image/png")
            : null,
      };
      const rect = source.getBoundingClientRect();
      const host = source.closest(".rx-suit-nanites");
      let figure;
      if (host) {
        const box = host.getBoundingClientRect();
        // The entry painter uses uniform figure scaling from its own width;
        // the child canvas may bleed beyond that box on a fine pointer.
        const scale = (box.width * source.width) / rect.width / 571;
        figure = {
          x: ((box.left - rect.left) * source.width) / rect.width,
          y: ((box.top - rect.top) * source.height) / rect.height,
          width: scale * 571,
          height: scale * 1040,
        };
      } else if (source.matches(".rzn-canvas")) {
        // Read the public responsive figure geometry. DOM fallback images are
        // display:none once live, so their empty client rect is not evidence.
        const style = getComputedStyle(source);
        const value = (key, fallback) => Number.parseFloat(style.getPropertyValue(key)) || fallback;
        const height = Math.min(
          source.clientHeight * value("--rzn-fig-h", 0.84),
          (source.clientWidth * value("--rzn-fig-w", 0.9) * 1040) / 571,
        );
        const width = (height * 571) / 1040;
        const ratioX = source.width / source.clientWidth;
        const ratioY = source.height / source.clientHeight;
        figure = {
          x: (source.clientWidth * value("--rzn-fig-x", 0.5) - width / 2) * ratioX,
          y: (source.clientHeight * (1 - value("--rzn-fig-b", 0.05)) - height) * ratioY,
          width: width * ratioX,
          height: height * ratioY,
        };
      }
      if (!figure || !Object.values(figure).every(Number.isFinite) || figure.width <= 0)
        return result;
      // One figure-relative read preserves the actual composited painter,
      // including armour occluding back flames. No substitute renderer runs.
      const body = document.createElement("canvas");
      body.width = 171;
      body.height = 312;
      const bc = body.getContext("2d", { willReadFrequently: true });
      bc.drawImage(
        source,
        figure.x,
        figure.y,
        figure.width,
        figure.height,
        0,
        0,
        body.width,
        body.height,
      );
      const pixels = bc.getImageData(0, 0, body.width, body.height).data;
      const coverage = {};
      for (const [name, [x, y, width, height]] of Object.entries(regions)) {
        const x0 = Math.floor((x / 571) * body.width);
        const y0 = Math.floor((y / 1040) * body.height);
        const x1 = Math.ceil(((x + width) / 571) * body.width);
        const y1 = Math.ceil(((y + height) / 1040) * body.height);
        let green = 0;
        let visible = 0;
        let greenExcess = 0;
        for (let row = y0; row < y1; row++) {
          for (let column = x0; column < x1; column++) {
            const i = (row * body.width + column) * 4;
            if (pixels[i + 3] <= 24) continue;
            visible++;
            const excess = pixels[i + 1] - Math.max(pixels[i] * 1.2, pixels[i + 2] * 1.15);
            if (pixels[i + 1] > 28 && excess > 0) {
              green++;
              greenExcess += (excess / 255) * (pixels[i + 3] / 255);
            }
          }
        }
        const count = (x1 - x0) * (y1 - y0);
        coverage[name] = {
          pixels: count,
          visible,
          green,
          greenRatio: green / count,
          meanGreenExcess: greenExcess / count,
        };
      }
      return {
        ...result,
        figure,
        viewportFigure: {
          x: rect.left + (figure.x / source.width) * rect.width,
          y: rect.top + (figure.y / source.height) * rect.height,
          width: (figure.width / source.width) * rect.width,
          height: (figure.height / source.height) * rect.height,
        },
        coverage,
      };
    },
    { query: selector, regions: bodyRegions },
  );
}

async function screenCoverage(capture, figure) {
  if (!figure) return null;
  const { data, info } = await sharp(capture)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const regions = Object.fromEntries(
    Object.entries(bodyRegions).map(([name, [x, y, width, height]]) => {
      const x0 = Math.floor(figure.x + (x / 571) * figure.width);
      const y0 = Math.floor(figure.y + (y / 1040) * figure.height);
      const x1 = Math.ceil(figure.x + ((x + width) / 571) * figure.width);
      const y1 = Math.ceil(figure.y + ((y + height) / 1040) * figure.height);
      const inBounds = x0 >= 0 && y0 >= 0 && x1 <= info.width && y1 <= info.height;
      const count = (x1 - x0) * (y1 - y0);
      let green = 0;
      let greenExcess = 0;
      if (inBounds)
        for (let row = y0; row < y1; row++) {
          for (let column = x0; column < x1; column++) {
            const i = (row * info.width + column) * 4;
            const excess = data[i + 1] - Math.max(data[i] * 1.2, data[i + 2] * 1.15);
            if (data[i + 1] > 28 && excess > 0) {
              green++;
              greenExcess += excess / 255;
            }
          }
        }
      return [
        name,
        {
          pixels: count,
          inBounds,
          green,
          greenRatio: green / count,
          meanGreenExcess: greenExcess / count,
        },
      ];
    }),
  );
  const pixels = new Uint8Array(evidenceWidth * evidenceHeight * 4);
  for (let y = 0; y < evidenceHeight; y++) {
    const sy = Math.floor(figure.y + ((y + 0.5) / evidenceHeight) * figure.height);
    if (sy < 0 || sy >= info.height) continue;
    for (let x = 0; x < evidenceWidth; x++) {
      const sx = Math.floor(figure.x + ((x + 0.5) / evidenceWidth) * figure.width);
      if (sx < 0 || sx >= info.width) continue;
      const start = (sy * info.width + sx) * 4;
      pixels.set(data.subarray(start, start + 4), (y * evidenceWidth + x) * 4);
    }
  }
  return {
    regions,
    fire: connectedFireEvidence({
      pixels,
      width: evidenceWidth,
      height: evidenceHeight,
      bodyMask,
      regions: bodyRegions,
      referenceWidth: 571,
      referenceHeight: 1040,
    }),
  };
}

async function inspectSpread(shot) {
  const png = shot.pixels?.fieldPNG;
  if (shot.pixels) delete shot.pixels.fieldPNG;
  if (!png) return;
  const input = Buffer.from(png.split(",")[1], "base64");
  await writeFile(shot.file.replace(/\.png$/, "-field.png"), input);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  shot.spread = flameSpreadEvidence(data, info.width, info.height);
}

function assertCombustionPeak(shots, isPeak, label) {
  const peaks = shots.filter(isPeak);
  assert.ok(peaks.length >= 2, `${label}: multiple actual full-body combustion samples`);
  assertSpreadSequence(assert, shots, {
    peak: isPeak,
    kindle: (shot) => shot.target === 60 || shot.progress === 0.025,
    minimum: coverageMinimum ?? 0.05,
    label,
  });
  assert.ok(
    peaks.some(
      (shot) =>
        shot.fireEvidence?.exterior.greenPixels >= 100 &&
        shot.fireEvidence.exterior.relativeToBody >= 0.1,
    ),
    `${label}: meaningful flame extends outside the real body rather than merely colouring its silhouette`,
  );
}

function coverageSummary(shots, isPeak) {
  const peaks = shots.filter(isPeak);
  return {
    frames: peaks.map((shot) => ({
      at: shot.target ?? shot.progress,
      minimum: Math.min(
        ...Object.values(shot.screenCoverage ?? {}).map((region) => region.greenRatio),
      ),
      minimumRegion: Object.entries(shot.screenCoverage ?? {}).sort(
        ([, a], [, b]) => a.greenRatio - b.greenRatio,
      )[0]?.[0],
      regions: shot.screenCoverage ?? null,
    })),
    // A temporal maximum is diagnostic only; it cannot let eleven different
    // frames masquerade as the body burning together in one peak frame.
    regionalPeak: Object.fromEntries(
      Object.keys(bodyRegions).map((name) => [
        name,
        Math.max(0, ...peaks.map((shot) => shot.screenCoverage?.[name]?.greenRatio ?? 0)),
      ]),
    ),
  };
}

try {
  for (const name of selected) {
    for (const mode of cases) {
      const dir = join(out, `${engine.name()}-${name}-${mode}`);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({
        ...profiles[name],
        ...(mode === "reduced" ? { reducedMotion: "reduce" } : {}),
      });
      await installProbe(context);
      if (mode === "blocked") await context.route(`**${asset}`, (route) => route.abort());
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      const requestTimeline = [];
      const trackedRequests = new Map();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.url().includes(asset)) {
          requests.push(request.url());
          const entry = { url: request.url(), startedAt: performance.now(), failedAt: null };
          requestTimeline.push(entry);
          trackedRequests.set(request, entry);
        }
      });
      page.on("requestfailed", (request) => {
        const entry = trackedRequests.get(request);
        if (entry) entry.failedAt = performance.now();
      });
      const record = {
        profile: name,
        mode,
        baseline,
        naturalClock,
        detailedEntry,
        coverageMinimum,
        entry: [],
        scroll: [],
      };
      try {
        await page.goto(`${base}/world`, { waitUntil: "networkidle" });
        await settled(page);
        // Real warm-up and idle preparation; no forced engine or network prefetch.
        await page.waitForTimeout(9000);
        await openEntry(page, mode !== "reduced");
        if (mode !== "reduced")
          await page.locator('.rx-suit[data-suit="build"]').waitFor({ state: "attached" });
        if (mode !== "reduced") {
          // React effects begin the real painter on a subsequent rAF. Never
          // jump the clock beyond START_BY=420ms before that decision: doing
          // so would manufacture a DOM fallback in WebKit, not test the app.
          await page.waitForFunction(
            () => {
              const suit = document.querySelector(".rx-suit");
              const time = Number(
                document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime,
              );
              return suit?.dataset.nanites === "canvas" || time >= 440;
            },
            null,
            { timeout: 4000 },
          );
          record.initialEntry = await page.evaluate(() => ({
            nanites: document.querySelector(".rx-suit")?.dataset.nanites,
            swarm: document.querySelector(".rx-suit")?.dataset.swarm,
            clock: Number(
              document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime,
            ),
            atlasDraws: window.__flameQA.atlas.entry,
            naniteSheets: performance
              .getEntriesByType("resource")
              .filter((entry) => entry.name.includes("/rexonance-nanites-"))
              .map((entry) => new URL(entry.name).pathname),
          }));
        }
        for (const target of mode === "reduced" ? [] : entrySamples) {
          if (!(await page.locator(".rx-call-sequence").count())) break;
          // Seek the actual CSS meter read by the real canvas engine. Only
          // its clock is controlled; no replacement painter or synthetic draw.
          if (naturalClock)
            await page.waitForFunction(
              (time) => {
                const sequence = document.querySelector(".rx-call-sequence");
                const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
                return !sequence || (meter && Number(meter.currentTime) >= time);
              },
              target,
              { timeout: 10000 },
            );
          else {
            await page.evaluate((time) => {
              const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
              if (meter) {
                meter.pause();
                meter.currentTime = time;
              }
            }, target);
          }
          if (naturalClock && !(await page.locator(".rx-call-sequence").count())) break;
          const nativeWindow = await nativeNaniteWindow(page, "entry");
          const state = await page.evaluate(() => {
            const suit = document.querySelector(".rx-suit");
            const sequence = document.querySelector(".rx-call-sequence");
            return {
              clock: Number(
                document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime,
              ),
              tier: sequence?.dataset.tier,
              nanites: suit?.dataset.nanites,
              swarm: suit?.dataset.swarm,
              atlasDraws: window.__flameQA.atlas.entry,
            };
          });
          const pixels = await canvasPixels(page, ".rx-suit-nanites > canvas:nth-child(2)");
          const file = join(dir, `entry-${target}.png`);
          // Keep this critical path short. The CSS painter clock can be
          // paused, but the real route handover still has a wall-clock cap;
          // running CPU-heavy connected-component analysis between shots
          // could accidentally capture the next route as the late entry.
          await page.screenshot({ path: file, scale: "css" });
          record.entry.push({
            target,
            ...state,
            canonicalClock: entryCanonicalTime(state.clock),
            pixels,
            nativeNaniteDraws: nativeWindow.nanites,
            nativeAtlasDraws: nativeWindow.atlas,
            nativeFallbackDraws: nativeWindow.fallback,
            file,
          });
          if (target === 3600) {
            const before = await page.evaluate(
              () => window.__flameQA.atlas.entry + window.__flameQA.fallback.entry,
            );
            await page.waitForTimeout(100);
            const after = await page.evaluate(
              () => window.__flameQA.atlas.entry + window.__flameQA.fallback.entry,
            );
            record.entryExtinguished = { target, flameDrawsAfter: after - before };
            assert.equal(after, before, `${name}: entry flame stops after its slow extinction`);
          }
        }
        for (const shot of record.entry) {
          await inspectSpread(shot);
          const coverage = await screenCoverage(
            await readFile(shot.file),
            shot.pixels?.viewportFigure,
          );
          shot.screenCoverage = coverage?.regions;
          shot.fireEvidence = coverage?.fire;
        }
        if (mode !== "reduced" && !naturalClock) {
          assert.deepEqual(
            record.entry.map((shot) => shot.target),
            entrySamples,
            "all mandatory entry phases must be captured before the wall-clock handover; a partial sequence cannot pass",
          );
          assert.ok(
            record.entry.every(
              (shot) => Number.isFinite(shot.clock) && Math.abs(shot.clock - shot.target) < 1,
            ),
            "each seeked entry sample belongs to the actual call clock, never to the destination route",
          );
          assert.equal(
            record.entryExtinguished?.target,
            3600,
            "the entry extinction sample cannot be silently skipped",
          );
          if (!baseline) {
            assert.ok(
              record.entry
                .filter((shot) => shot.canonicalClock < materialEntry)
                .every((shot) => shot.nativeNaniteDraws === 0),
              "the real kit bitmap pass waits for the trailing explosion",
            );
            // A blocked atlas must never draw. Demand its real procedural
            // fallback in the very same native frame window as the kit,
            // instead of the contradictory positive-atlas condition. The
            // normal case still requires real atlas draws: fallback alone
            // cannot satisfy its overlap gate.
            assert.ok(
              record.entry.some(
                (shot) =>
                  shot.canonicalClock >= materialEntry &&
                  shot.canonicalClock < NANITE_FIRE_PHASES.flameEnd * 2400 &&
                  shot.nativeNaniteDraws > 0 &&
                  (mode === "blocked"
                    ? shot.nativeAtlasDraws === 0 && shot.nativeFallbackDraws > 0
                    : shot.nativeAtlasDraws > 0),
              ),
              "actual nanites and flame coexist briefly before the fire finishes",
            );
            assert.ok(
              record.entry
                .filter((shot) => shot.canonicalClock >= 620 && shot.canonicalClock <= 1600)
                .some((shot) => shot.nativeNaniteDraws > 0),
              "kit bitmap material actually appears after, not merely disabled forever",
            );
          }
        }
        if (mode === "normal" && !baseline) {
          assert.equal(
            record.initialEntry.nanites,
            "canvas",
            `${name}: the naturally started initial call selected the real painter before any seek`,
          );
          assert.ok(
            record.entry
              .filter(entryPeak)
              .every((shot) => shot.atlasDraws > 0 && shot.pixels?.green > 0),
            `${name}: initial flame frames must be drawn, not only a later return call`,
          );
          const sustained = record.entry.filter((shot) => [900, 1250].includes(shot.target));
          assert.equal(sustained.length, 2, "both added-duration flame samples must be captured");
          assert.ok(
            sustained.every((shot) => shot.nativeAtlasDraws > 0 && shot.pixels?.green > 0),
            `${name}: the added second retains an actively painted visible flame at both sustained samples`,
          );
        }
        await page.evaluate(() =>
          document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.play(),
        );
        await page.waitForURL("**/rexonance-saga#top", { timeout: 45000 });
        await settled(page);
        await page.locator(".rx-call-sequence").waitFor({ state: "detached", timeout: 15000 });
        await page.addStyleTag({ content: "html,body,*{scroll-behavior:auto!important}" });
        await page.locator(".rzn-suitup").waitFor({ state: "attached" });
        const geometry = await readRunway(page);
        if (mode === "reduced") {
          assert.equal(
            geometry.state,
            null,
            "reduced motion uses its finished still, never a live flame",
          );
          assert.ok(
            geometry.height <= geometry.frameHeight + 2,
            "reduced motion has no tall scroll trap",
          );
          await page.locator(".rzn-suitup").scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(dir, "scroll-still.png"), scale: "css" });
        } else {
          assert.ok(geometry.height > geometry.frameHeight + 100, "live scroll runway exists");
          await page.evaluate(
            (top) => scrollTo({ top, behavior: "instant" }),
            Math.max(0, geometry.top - profiles[name].viewport.height * 4.4),
          );
          await page.waitForTimeout(1800);
          // Branching fire rises from the feet before fading into the first
          // machines. Preserve final armour and reverse traversal as well.
          const forwardSamples = [
            0.025, 0.04, 0.0625, 0.065, 0.069625, 0.0815, 0.084, 0.0855, 0.08625, 0.09, 0.14, 0.22,
            0.3, 0.34, 0.92, 0.99,
          ];
          const progressSamples = [
            ...forwardSamples,
            0.14,
            0.09,
            0.0855,
            0.0815,
            0.069625,
            0.065,
            0.025,
          ];
          for (const [index, progress] of progressSamples.entries()) {
            const state = await scrollToProgress(page, progress);
            await page.waitForFunction(
              () => document.querySelector('.rzn-suitup[data-rzn-state="live"] canvas')?.width > 0,
              null,
              { timeout: 30000 },
            );
            // Preparing is a valid asynchronous state: read the native frame
            // only after the live renderer has a real backing canvas and has
            // completed its first paint, not from the earlier geometry read.
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            Object.assign(
              state,
              await page.evaluate(() => {
                const canvas = document.querySelector(
                  '.rzn-suitup[data-rzn-state="live"] canvas.rzn-canvas',
                );
                const inspected = canvas ? window.__flameQAInspect(canvas) : null;
                return {
                  nativeFrame: inspected?.lastPaint,
                  nativePendingFrame: inspected?.frame,
                  nativeNaniteDraws: inspected?.lastPaint?.nanites ?? null,
                };
              }),
            );
            const pixels = await canvasPixels(page, "canvas.rzn-canvas");
            const nativeNaniteDraws = state.nativeNaniteDraws;
            if (!baseline) {
              assert.ok(
                state.nativeFrame?.images > 0,
                `a stopped/no-draw window cannot masquerade as a zero-material frame: ${JSON.stringify({ lastPaint: state.nativeFrame, pending: state.nativePendingFrame })}`,
              );
              assert.ok(
                Math.abs(state.nativeFrame.actual - state.actual) < 0.002,
                "the inspected last actual drawing frame belongs to the settled target, not the prior scroll position",
              );
            }
            if (!baseline && state.actual < materialScroll) {
              assert.ok(
                state.nativeFrame.actual < materialScroll,
                "the actual drawing frame is also before the material floor",
              );
              assert.equal(
                nativeNaniteDraws,
                0,
                `${name}/${progress}: no real kit images before material, in either direction`,
              );
            }
            assert.ok(pixels?.visible > 20, `${name}/${progress}: painted scroll canvas`);
            const file = join(dir, `scroll-${progress}-${record.scroll.length}.png`);
            const capture = await page.screenshot({ path: file, scale: "css" });
            const coverage = await screenCoverage(capture, pixels?.viewportFigure);
            record.scroll.push({
              progress,
              direction: index < forwardSamples.length ? "forward" : "reverse",
              ...state,
              pixels,
              nativeNaniteDraws,
              screenCoverage: coverage?.regions,
              fireEvidence: coverage?.fire,
              file,
            });
            await inspectSpread(record.scroll.at(-1));
            if (progress === 0.34 || progress === 0.92 || progress === 0.99) {
              const before = await page.evaluate(
                () => window.__flameQA.atlas.scroll + window.__flameQA.fallback.scroll,
              );
              await page.waitForTimeout(100);
              const after = await page.evaluate(
                () => window.__flameQA.atlas.scroll + window.__flameQA.fallback.scroll,
              );
              record.scrollExtinguished ??= [];
              record.scrollExtinguished.push({ progress, flameDrawsAfter: after - before });
              assert.equal(
                after,
                before,
                `${name}/${progress}: extinguished flame cannot obscure the completed armour`,
              );
            }
          }
          if (!baseline) {
            // Touch uses batched metal geometry before its first bitmap.
            // The real drawing-pass tests prove overlap for both tiers;
            // this tracer only asserts native image provenance, not fills.
            assert.ok(
              record.scroll.some((shot) => shot.actual >= 0.08625 && shot.nativeNaniteDraws > 0),
              "the scroll native kit tracer observes later real material, making the pre-material zero check non-vacuous",
            );
          }
          record.bodyCoverage = {
            entry: coverageSummary(record.entry, entryPeak),
            scroll: coverageSummary(
              record.scroll,
              (shot) =>
                shot.direction === "forward" &&
                (shot.progress === 0.065 || shot.progress === 0.069625),
            ),
            reverse: coverageSummary(
              record.scroll,
              (shot) =>
                shot.direction === "reverse" &&
                (shot.progress === 0.065 || shot.progress === 0.069625),
            ),
            note: "Actual cached combustion must begin at the feet, propagate upward and cover all eleven body patches together in one full/peak frame. Both arm branches must burn. Final screenshot coverage, connected components, exterior flame, centre clearing and completed armour are retained separately; circular wrapping is no longer the requested topology.",
          };
          const temporalCoverage = (shots) =>
            shots.map((shot) => {
              const regions = Object.values(shot.screenCoverage ?? {});
              return {
                at: shot.target ?? shot.progress,
                direction: shot.direction ?? "forward",
                clock: shot.clock ?? null,
                canvasGreen: shot.pixels?.green ?? 0,
                meanGreenExcess:
                  regions.reduce((sum, region) => sum + region.meanGreenExcess, 0) /
                  Math.max(1, regions.length),
                regionRatios: Object.fromEntries(
                  Object.entries(shot.screenCoverage ?? {}).map(([name, region]) => [
                    name,
                    region.greenRatio,
                  ]),
                ),
              };
            });
          record.naturalness = {
            entry: temporalCoverage(record.entry),
            scroll: temporalCoverage(record.scroll),
            note: "Early ignition, upward branching combustion, extinction and later metal are captured from the real engines. Eleven registered body patches must pass together in one frame, alongside the foot-to-crown front and both lateral arms. Native kit bitmap draws are checked before the material floor; typed-metal emptiness and exact reverse poses are verified by the actual drawing-pass unit harness. Browser atlas phase is intentionally free-running.",
          };
          if (mode === "normal" && !baseline) {
            assertCombustionPeak(record.entry, entryPeak, `${name}/entry`);
            assertCombustionPeak(
              record.scroll,
              (shot) => shot.direction === "forward" && [0.065, 0.069625].includes(shot.progress),
              `${name}/scroll`,
            );
            assertCombustionPeak(
              record.scroll,
              (shot) => shot.direction === "reverse" && [0.065, 0.069625].includes(shot.progress),
              `${name}/reverse`,
            );
            if (!naturalClock) {
              const quiet = record.entry.filter((shot) => shot.target <= 280);
              const flare = record.entry.filter(entryPeak);
              const energy = (shot) => shot.fireEvidence?.meanGreenExcess ?? 0;
              record.ignitionEnergy = {
                quiet: quiet.map((shot) => [shot.target, energy(shot)]),
                flare: flare.map((shot) => [shot.target, energy(shot)]),
              };
              assert.ok(
                Math.max(...flare.map(energy)) > Math.max(...quiet.map(energy)) * 2,
                "the real field grows from quiet ignition into a rapid flare, not a constant bright overlay",
              );
              const clearing = record.entry.filter(
                (shot) => shot.target === 1560 || shot.target === 1590,
              );
              assert.equal(clearing.length, 2, "both explosion end and clear gap are captured");
              assert.ok(
                clearing.some((shot) => shot.fireEvidence.center.ratio <= 0.05),
                "the declining explosion releases the centre as nanites begin forming",
              );
              record.burstClear = {
                entry: clearing.map((shot) => ({
                  at: shot.target,
                  center: shot.fireEvidence.center,
                })),
                scroll: record.scroll
                  .filter((shot) => shot.progress === 0.0815 || shot.progress === 0.084)
                  .map((shot) => ({
                    q: shot.progress,
                    direction: shot.direction,
                    center: shot.fireEvidence.center,
                  })),
              };
              assert.ok(
                record.burstClear.scroll.some((shot) => shot.center.ratio <= 0.05),
                "scroll explosion releases its centre during the brief material overlap",
              );
            }
            assert.ok(
              record.scroll
                .filter(
                  (shot) =>
                    shot.direction === "reverse" &&
                    (shot.progress === 0.065 || shot.progress === 0.069625),
                )
                .every((shot) => shot.pixels?.green > 0),
              "reverse scroll re-ignites the actual flame at both peak samples",
            );
          }
          // A real-time forward/reverse sweep, without screenshots in the measured interval.
          await page.evaluate(async () => {
            const r = document.querySelector(".rzn-suitup"),
              f = r.querySelector(".rzn-frame");
            const top =
              r.getBoundingClientRect().top +
              scrollY -
              (Number.parseFloat(getComputedStyle(f).top) || 0);
            const span = r.offsetHeight - f.offsetHeight;
            window.__flameQA.frameMs = [];
            window.__flameQA.drawMs = [];
            for (let i = 0; i <= 80; i++) {
              const progress = i <= 40 ? 0.04 + (0.2 * i) / 40 : 0.24 - (0.2 * (i - 40)) / 40;
              scrollTo({ top: top + progress * span, behavior: "instant" });
              await new Promise(requestAnimationFrame);
            }
          });
          // Synthetic visibility event exercises the existing engine's lifecycle;
          // this is not evidence of a physical iOS background/foreground cycle.
          await page.evaluate(() => {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            document.dispatchEvent(new Event("visibilitychange"));
          });
          await page.waitForTimeout(400);
          const hiddenBefore = await page.evaluate(() => window.__flameQA.draws.scroll);
          await scrollToProgress(page, 0.11);
          const hiddenAfter = await page.evaluate(() => window.__flameQA.draws.scroll);
          assert.equal(hiddenAfter, hiddenBefore, "hidden scroll scene cannot keep drawing");
          await page.evaluate(() => {
            delete document.hidden;
            document.dispatchEvent(new Event("visibilitychange"));
          });
          await scrollToProgress(page, 0.14);
          await page.waitForFunction(
            (before) => window.__flameQA.draws.scroll > before,
            hiddenAfter,
            { timeout: 15000 },
          );
          record.syntheticVisibility = { hiddenDraws: hiddenAfter - hiddenBefore, resumed: true };
        }
        const beforeRepeat = requests.length;
        const repeatStart = performance.now();
        await page.locator(".rxs-brand").click();
        await page.waitForURL((url) => url.pathname === "/world", { timeout: 45000 });
        await settled(page);
        const beforeDraws = await page.evaluate(() => ({
          draws: { ...window.__flameQA.draws },
          atlas: { ...window.__flameQA.atlas },
        }));
        await page.evaluate(() => {
          window.__flameQA.measureEntry = true;
          window.__flameQA.entryFrameMs = [];
        });
        await openEntry(page, mode !== "reduced");
        await page.waitForURL("**/rexonance-saga#top", { timeout: 45000 });
        await settled(page);
        await page.evaluate(() => {
          window.__flameQA.measureEntry = false;
        });
        record.repeatRequests = requests.length - beforeRepeat;
        record.requests = requests.length;
        record.requestTimeline = requestTimeline;
        record.repeatWindow = {
          start: repeatStart,
          end: performance.now(),
          requestsBefore: beforeRepeat,
        };
        if (mode === "normal" && !baseline) {
          record.nativeTracerSelfTest = await page.evaluate(async () => {
            const bitmap = await createImageBitmap(
              await (await fetch("/rexonance-nanites-20261018/cells.webp")).blob(),
            );
            const canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 32;
            const c = canvas.getContext("2d"),
              neutral = document.createElement("canvas");
            neutral.width = 32;
            neutral.height = 32;
            neutral.getContext("2d").fillRect(0, 0, 32, 32);
            c.clearRect(0, 0, 32, 32);
            c.drawImage(bitmap, 0, 0, 32, 32);
            const positive = window.__flameQAInspect(canvas);
            c.clearRect(0, 0, 32, 32);
            c.drawImage(neutral, 0, 0);
            const cleared = window.__flameQAInspect(canvas);
            const sink = document.createElement("canvas");
            sink.width = 32;
            sink.height = 32;
            sink.getContext("2d").drawImage(canvas, 0, 0);
            const derived = window.__flameQAInspect(sink);
            c.drawImage(bitmap, 0, 0, 32, 32);
            canvas.width = 32;
            const resized = window.__flameQAInspect(canvas);
            if (typeof c.reset === "function") {
              c.drawImage(bitmap, 0, 0, 32, 32);
              c.reset();
            }
            const reset = window.__flameQAInspect(canvas);
            bitmap.close();
            return { positive, cleared, derived, resized, reset };
          });
          const check = record.nativeTracerSelfTest;
          assert.equal(check.positive.tagged, true);
          assert.equal(check.positive.frame.nanites, 1);
          assert.ok(check.positive.frame.images > 0);
          for (const key of ["cleared", "derived", "resized", "reset"]) {
            assert.equal(
              check[key].tagged,
              false,
              `${key}: cleared pixels cannot retain old kit provenance`,
            );
            assert.equal(check[key].frame.nanites, 0);
          }
          assert.ok(
            check.cleared.frame.id > check.positive.frame.id && check.cleared.frame.images > 0,
            "a new actually drawn non-kit frame supplies the negative control",
          );
        }
        record.probe = await page.evaluate(() => window.__flameQA);
        const summarize = (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          const at = (q) =>
            sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? null;
          return { count: sorted.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
        };
        record.measurement = {
          entry: summarize(record.probe.entryFrameMs),
          entryDrawImageCalls: record.probe.draws.entry - beforeDraws.draws.entry,
          entryAtlasDrawImageCalls: record.probe.atlas.entry - beforeDraws.atlas.entry,
          scroll: summarize(record.probe.frameMs),
          scrollDraw: summarize(record.probe.drawMs),
          decodedAtlasBytes: !baseline && mode === "normal" ? 1024 * 1024 * 4 : 0,
          resources: await page.evaluate(
            (path) =>
              performance
                .getEntriesByType("resource")
                .filter((entry) => entry.name.includes(path))
                .map((entry) => ({
                  transferSize: entry.transferSize,
                  encodedBodySize: entry.encodedBodySize,
                  decodedBodySize: entry.decodedBodySize,
                  duration: entry.duration,
                })),
            asset,
          ),
          note: "Instrumented browser timing, not a physical-device speed claim; entry is the second natural-clock invocation without screenshots, scroll is an 81-rAF forward/reverse sweep.",
        };
        record.errors = errors;
        assert.deepEqual(errors, [], `${name}/${mode}: no JavaScript errors`);
        if (mode === "blocked") {
          assert.ok(
            record.repeatRequests <= 1,
            `${name}: returning cannot start parallel or storming retries`,
          );
          for (let i = 1; i < requestTimeline.length; i++) {
            const previous = requestTimeline[i - 1],
              next = requestTimeline[i];
            assert.ok(
              Number.isFinite(previous.failedAt),
              "a retry follows a recorded image/network failure",
            );
            assert.ok(
              next.startedAt - previous.failedAt >= 30000,
              `${name}: failed flame retry must respect the 30s cooldown (${(next.startedAt - previous.failedAt).toFixed(1)}ms)`,
            );
          }
          const failedAt = requestTimeline[beforeRepeat - 1]?.failedAt;
          assert.ok(Number.isFinite(failedAt), "the initial failed attempt was observed");
          record.failureCooldown = {
            retryAfterMs: 30000,
            ageAtRepeatStart: repeatStart - failedAt,
            ageAtRepeatEnd: record.repeatWindow.end - failedAt,
            retryAge: requestTimeline[beforeRepeat]?.startedAt - failedAt || null,
          };
          if (record.repeatWindow.end - failedAt < 30000)
            assert.equal(
              record.repeatRequests,
              0,
              "a return wholly before the cooldown cannot retry",
            );
        } else {
          assert.equal(
            record.repeatRequests,
            0,
            `${name}/${mode}: returning through world reuses the retained atlas without a request`,
          );
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "no horizontal overflow",
        );
        if (mode === "normal" && !baseline) {
          assert.equal(requests.length, 1, `${name}: atlas requested exactly once`);
          assert.ok(
            record.probe.atlas.entry > 0,
            `${name}: actual entry canvas used the Blender atlas`,
          );
          assert.ok(
            record.probe.atlas.scroll > 0,
            `${name}: actual scroll canvas used the Blender atlas`,
          );
          assert.ok(
            record.probe.atlasFrames.length > 8,
            `${name}: temporal atlas frames, not a static sprite`,
          );
        } else if (mode === "blocked") {
          assert.equal(
            record.probe.atlas.entry + record.probe.atlas.scroll,
            0,
            "failed atlas is never painted",
          );
          assert.ok(
            record.probe.draws.entry > 0 && record.probe.draws.scroll > 0,
            "both real engines survive a missing flame atlas",
          );
          assert.ok(
            record.probe.fallback.entry > 0 && record.probe.fallback.scroll > 0,
            "both real engines actually paint the tapered procedural fallback",
          );
        } else if (mode === "reduced") {
          assert.equal(requests.length, 0, "reduced motion downloads no flame atlas");
          assert.equal(
            record.probe.atlas.entry + record.probe.atlas.scroll,
            0,
            "no dynamic flame in reduced motion",
          );
        }
        results.push(record);
        console.log(
          `PASS ${engine.name()} ${name}/${mode}: entry, scroll, repeat, ${record.requests} atlas request(s)`,
        );
      } catch (error) {
        record.failure = { name: error.name, message: error.message };
        throw error;
      } finally {
        await writeFile(join(dir, "result.json"), JSON.stringify(record, null, 2) + "\n");
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(
    join(out, "report.json"),
    JSON.stringify({ base, baseline, engine: engine.name(), results }, null, 2) + "\n",
  );
}
