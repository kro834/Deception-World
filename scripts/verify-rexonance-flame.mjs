// Real browser evidence for the Blender flame, not a source-string audit.
// BASE_URL=... [FLAME_BASELINE=1] [FLAME_PROFILES=desktop,phone320,tablet1024]
// [FLAME_CASES=normal,blocked,reduced] [BROWSER=webkit] node scripts/verify-rexonance-flame.mjs
// The disposable profile never posts gallery images or changes public data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8197";
const out = process.env.OUT_DIR || "output/playwright/rexonance-flame";
const baseline = process.env.FLAME_BASELINE === "1";
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

async function openEntry(page) {
  const trigger = page.locator(".side-panel-trigger").first();
  await trigger.click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 15000 });
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
  return page.evaluate((query) => {
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
    return {
      width: source.width,
      height: source.height,
      visible,
      green,
      hash: (hash >>> 0).toString(16),
    };
  }, selector);
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
      const record = { profile: name, mode, baseline, entry: [], scroll: [] };
      try {
        await page.goto(`${base}/world`, { waitUntil: "networkidle" });
        await settled(page);
        // Real warm-up and idle preparation; no forced engine or network prefetch.
        await page.waitForTimeout(9000);
        await openEntry(page);
        await page.locator('.rx-suit[data-suit="build"]').waitFor({ state: "attached" });
        for (const target of [600, 1000, 1600, 2200]) {
          if (!(await page.locator(".rx-call-sequence").count())) break;
          // Seek the actual CSS meter read by the real canvas engine. Only
          // its clock is controlled; no replacement painter or synthetic draw.
          await page.evaluate((time) => {
            const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
            if (meter) {
              meter.pause();
              meter.currentTime = time;
            }
          }, target);
          await page.waitForTimeout(80);
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
          await page.screenshot({ path: file, scale: "css" });
          record.entry.push({ target, ...state, pixels, file });
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
          for (const progress of [0.04, 0.1, 0.14, 0.22, 0.3, 0.14]) {
            const state = await scrollToProgress(page, progress);
            await page.waitForFunction(
              () => document.querySelector('.rzn-suitup[data-rzn-state="live"] canvas')?.width > 0,
              null,
              { timeout: 30000 },
            );
            const pixels = await canvasPixels(page, "canvas.rzn-canvas");
            assert.ok(pixels?.visible > 20, `${name}/${progress}: painted scroll canvas`);
            const file = join(dir, `scroll-${progress}-${record.scroll.length}.png`);
            await page.screenshot({ path: file, scale: "css" });
            record.scroll.push({ progress, ...state, pixels, file });
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
        await openEntry(page);
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
