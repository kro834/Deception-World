// Real browser evidence for the Blender flame, not a source-string audit.
// BASE_URL=... [FLAME_BASELINE=1] [FLAME_PROFILES=desktop,phone320,tablet1024]
// [FLAME_CASES=normal,blocked,reduced] [BROWSER=webkit] node scripts/verify-rexonance-flame.mjs
// [FLAME_COVERAGE_MIN=0.05] opts into a measured per-region peak coverage gate.
// The disposable profile never posts gallery images or changes public data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import sharp from "sharp";

const base = process.env.BASE_URL || "http://127.0.0.1:8197";
const out = process.env.OUT_DIR || "output/playwright/rexonance-flame";
const baseline = process.env.FLAME_BASELINE === "1";
const naturalClock = process.env.FLAME_NATURAL === "1";
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
const asset = "/rexonance-flame-20261019/flame.webp";
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
      atlasFrames: [],
      samples: [],
      lastDraw: 0,
      frameMs: [],
      entryFrameMs: [],
      measureEntry: false,
      drawMs: [],
    };
    window.__flameQA = state;
    window.__rexonanceDrawMs = (ms, progress, calm) => {
      if (progress > 0.02 && progress < 0.3 && !calm && state.drawMs.length < 2000)
        state.drawMs.push(ms);
    };
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const kind = this.canvas?.matches?.(".rx-suit-nanites canvas")
        ? "entry"
        : this.canvas?.matches?.("canvas.rzn-canvas")
          ? "scroll"
          : "other";
      const source = args[0];
      const isAtlas = typeof source?.src === "string" && source.src.includes(path);
      if (source instanceof HTMLCanvasElement && source.width === 96 && source.height === 192)
        state.fallback[kind]++;
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
    return {
      top: runway?.getBoundingClientRect().top + scrollY,
      height: runway?.offsetHeight,
      frameHeight: frame?.offsetHeight,
      pin: Number.parseFloat(frame ? getComputedStyle(frame).top : "0") || 0,
      state: runway?.dataset.rznState || null,
      scrollY,
    };
  });
}

async function scrollToProgress(page, progress) {
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
    if (Math.abs(actual - progress) < 0.002) return { ...next, actual };
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
  return Object.fromEntries(
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
}

function coverageSummary(shots, isPeak) {
  const peaks = shots.filter(isPeak);
  return {
    frames: peaks.map((shot) => ({
      at: shot.target ?? shot.progress,
      minimum: Math.min(
        ...Object.values(shot.screenCoverage ?? {}).map((region) => region.greenRatio),
      ),
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

function assertPeakCoverage(summary, label) {
  assert.ok(summary.frames.length >= 2, `${label}: multiple near-peak frames were sampled`);
  for (const frame of summary.frames)
    assert.ok(
      Object.keys(frame.regions ?? {}).length === Object.keys(bodyRegions).length &&
        Object.values(frame.regions).every((region) => region.inBounds && region.pixels > 0),
      `${label}/${frame.at}: visible screen samples cover all eleven body regions`,
    );
  if (coverageMinimum !== null)
    assert.ok(
      summary.frames.some((frame) => frame.minimum >= coverageMinimum),
      `${label}: one peak frame must cover every body region by at least ${coverageMinimum}`,
    );
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
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (request.url().includes(asset)) requests.push(request.url());
      });
      const record = {
        profile: name,
        mode,
        baseline,
        naturalClock,
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
        const entryStarted = Date.now();
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
        for (const target of mode === "reduced" ? [] : [600, 850, 1000, 1150, 1600, 2200, 2600]) {
          if (!(await page.locator(".rx-call-sequence").count())) break;
          // Seek the actual CSS meter read by the real canvas engine. Only
          // its clock is controlled; no replacement painter or synthetic draw.
          if (naturalClock)
            await page.waitForTimeout(Math.max(0, target - (Date.now() - entryStarted)));
          else {
            await page.evaluate((time) => {
              const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
              if (meter) {
                meter.pause();
                meter.currentTime = time;
              }
            }, target);
            await page.waitForTimeout(80);
          }
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
          const capture = await page.screenshot({ path: file, scale: "css" });
          record.entry.push({
            target,
            ...state,
            pixels,
            screenCoverage: await screenCoverage(capture, pixels?.viewportFigure),
            file,
          });
          if (target === 2600) {
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
        if (mode === "normal" && !baseline) {
          assert.equal(
            record.initialEntry.nanites,
            "canvas",
            `${name}: the naturally started initial call selected the real painter before any seek`,
          );
          assert.ok(
            record.entry
              .filter((shot) => shot.target <= 1600)
              .every((shot) => shot.atlasDraws > 0 && shot.pixels?.green > 0),
            `${name}: initial flame frames must be drawn, not only a later return call`,
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
          for (const progress of [0.04, 0.1, 0.14, 0.22, 0.3, 0.34, 0.92, 0.99, 0.14]) {
            const state = await scrollToProgress(page, progress);
            await page.waitForFunction(
              () => document.querySelector('.rzn-suitup[data-rzn-state="live"] canvas')?.width > 0,
              null,
              { timeout: 30000 },
            );
            const pixels = await canvasPixels(page, "canvas.rzn-canvas");
            assert.ok(pixels?.visible > 20, `${name}/${progress}: painted scroll canvas`);
            const file = join(dir, `scroll-${progress}-${record.scroll.length}.png`);
            const capture = await page.screenshot({ path: file, scale: "css" });
            record.scroll.push({
              progress,
              ...state,
              pixels,
              screenCoverage: await screenCoverage(capture, pixels?.viewportFigure),
              file,
            });
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
          record.bodyCoverage = {
            entry: coverageSummary(
              record.entry,
              (shot) => shot.target >= 850 && shot.target <= 1150,
            ),
            scroll: coverageSummary(
              record.scroll,
              (shot) => shot.progress === 0.1 || shot.progress === 0.14,
            ),
            note: "Inner body patches are measured from the actual visible screenshot, including the DOM undersuit, both canvas layers and their opacity. Source-canvas coverage is retained per shot for diagnostics. Regional maxima cannot satisfy the optional gate: all regions must pass together in one peak frame. Extinguished and final armour frames are retained separately.",
          };
          if (mode === "normal" && !baseline) {
            assertPeakCoverage(record.bodyCoverage.entry, `${name}/entry`);
            assertPeakCoverage(record.bodyCoverage.scroll, `${name}/scroll`);
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
        assert.equal(
          record.repeatRequests,
          0,
          `${name}/${mode}: returning through world reuses the shared atlas/failure state`,
        );
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
