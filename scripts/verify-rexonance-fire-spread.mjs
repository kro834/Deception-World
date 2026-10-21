// Compare the actual entry/scroll painters at identical ignition phases.
// BASE_URL=http://127.0.0.1:8594 [BROWSER=webkit] [FIRE_PROFILE=phone320]
// [FIRE_MODE=normal|blocked|reduced] [FIRE_RETURN=1] [FIRE_STRICT=1]
// [OUT_DIR=output/playwright/rexonance-fire-spread] node scripts/verify-rexonance-fire-spread.mjs
// Default gates prove genuine live paints, expected material ordering and
// extinction. Strict additionally gates the measured propagation/coverage.
// The flame-only PNG is the real cached field composited by each engine,
// never a substitute renderer. View screenshot PNGs for final composition.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import sharp from "sharp";
import { entryElapsedTime, NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";
import { flameSpreadEvidence } from "./rexonance-spread-evidence.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8594";
const out = process.env.OUT_DIR || "output/playwright/rexonance-fire-spread";
const profile = process.env.FIRE_PROFILE || "desktop";
const mode = process.env.FIRE_MODE || "normal";
const strict = process.env.FIRE_STRICT === "1";
const visits = process.env.FIRE_RETURN === "0" ? 1 : 2;
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone320: { viewport: { width: 320, height: 844 }, deviceScaleFactor: 2, hasTouch: true },
  tablet1024: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true },
};
assert.ok(profiles[profile], `unknown FIRE_PROFILE ${profile}`);
assert.ok(["normal", "blocked", "reduced"].includes(mode), `unknown FIRE_MODE ${mode}`);
const samples = [
  ["kindle", 0.025],
  ["trunk", 0.065],
  ["branches", 0.11],
  ["full", 0.16],
  ["peak", NANITE_FIRE_PHASES.burstStart],
  ["overlap", 0.205],
  ["dying", NANITE_FIRE_PHASES.burstEnd],
  ["clear", 0.251],
  ["metal", 0.34],
];
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const context = await browser.newContext({
  ...profiles[profile],
  ...(engine === chromium && profile !== "desktop" ? { isMobile: true } : {}),
  ...(mode === "reduced" ? { reducedMotion: "reduce" } : {}),
});
const dir = join(out, `${engine.name()}-${profile}-${mode}`);
await mkdir(dir, { recursive: true });
const report = {
  base,
  browser: engine.name(),
  profile,
  mode,
  strict,
  samples,
  visits: [],
  errors: [],
};
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
if (mode === "blocked")
  await context.route("**/rexonance-flame-natural-20261019/flame.webp", (route) => route.abort());

await context.addInitScript(() => {
  const flame = new WeakSet(),
    nanites = new WeakSet(),
    frames = new WeakMap(),
    paths = new WeakMap();
  const qa = { entry: null, scroll: null, field: null, requests: 0 };
  window.__spreadQA = qa;
  const kind = (canvas) =>
    canvas?.matches?.(".rx-suit-nanites canvas")
      ? "entry"
      : canvas?.matches?.("canvas.rzn-canvas")
        ? "scroll"
        : null;
  const kit = /\/rexonance-nanites-20261018\/(?:cells|comets|guide|fx)\.webp/;
  const isKit = (source) => source && (nanites.has(source) || kit.test(source.src || ""));
  const isFlame = (source) =>
    source &&
    (flame.has(source) ||
      /\/rexonance-flame-natural-20261019\/flame\.webp/.test(source.src || "") ||
      (source instanceof HTMLCanvasElement && source.width === 96 && source.height === 192));
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function (...args) {
    const result = await blob.apply(this, args);
    if (kit.test(this.url)) nanites.add(result);
    return result;
  };
  if (window.createImageBitmap) {
    const bitmap = window.createImageBitmap;
    window.createImageBitmap = async function (source, ...args) {
      const result = await bitmap.call(this, source, ...args);
      if (isKit(source)) nanites.add(result);
      return result;
    };
  }
  const fresh = (canvas) => {
    flame.delete(canvas);
    nanites.delete(canvas);
    const target = kind(canvas);
    if (!target) return;
    const runway = document.querySelector(".rzn-suitup"),
      frame = runway?.querySelector(".rzn-frame");
    const actual =
      target === "entry"
        ? Number(document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime)
        : runway && frame
          ? (scrollY -
              (runway.getBoundingClientRect().top +
                scrollY -
                (parseFloat(getComputedStyle(frame).top) || 0))) /
            (runway.offsetHeight - frame.offsetHeight)
          : null;
    frames.set(canvas, { images: 0, flames: 0, nanites: 0, naniteHexes: 0, actual });
  };
  // Touch paints the real swarm as batched six-sided chips. Observe both
  // its actual path topology and native fill colour; an empty image tracer
  // cannot prove absence of material, and a later bitmap cannot prove an
  // earlier touch overlap. Keep this separate from image provenance.
  const begin = CanvasRenderingContext2D.prototype.beginPath;
  CanvasRenderingContext2D.prototype.beginPath = function (...args) {
    if (kind(this.canvas)) paths.set(this, { vertices: 0, hexes: 0 });
    return begin.apply(this, args);
  };
  const move = CanvasRenderingContext2D.prototype.moveTo;
  CanvasRenderingContext2D.prototype.moveTo = function (...args) {
    const path = paths.get(this);
    if (path) path.vertices = 1;
    return move.apply(this, args);
  };
  const line = CanvasRenderingContext2D.prototype.lineTo;
  CanvasRenderingContext2D.prototype.lineTo = function (...args) {
    const path = paths.get(this);
    if (path) path.vertices++;
    return line.apply(this, args);
  };
  const close = CanvasRenderingContext2D.prototype.closePath;
  CanvasRenderingContext2D.prototype.closePath = function (...args) {
    const path = paths.get(this);
    if (path?.vertices === 6) path.hexes++;
    return close.apply(this, args);
  };
  const fill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function (...args) {
    const path = paths.get(this),
      record = frames.get(this.canvas);
    if (
      record &&
      path?.hexes &&
      this.globalAlpha > 0 &&
      /^(?:#b0eeff|#ffc0e8|#f4fbff|rgb\(176,? 238,? 255\)|rgb\(255,? 192,? 232\)|rgb\(244,? 251,? 255\))$/i.test(
        this.fillStyle,
      )
    )
      record.naniteHexes += path.hexes;
    return fill.apply(this, args);
  };
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
    if (x <= 0 && y <= 0 && x + width >= this.canvas.width && y + height >= this.canvas.height)
      fresh(this.canvas);
    return clear.call(this, x, y, width, height);
  };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    const target = kind(this.canvas);
    if (target && !frames.has(this.canvas)) fresh(this.canvas);
    const record = frames.get(this.canvas);
    if (isFlame(source) && this.globalAlpha > 0) {
      flame.add(this.canvas);
      if (record) record.flames++;
      if (
        target &&
        source instanceof HTMLCanvasElement &&
        source.width === 384 &&
        source.height === 624
      )
        qa.field = source;
    }
    if (isKit(source) && this.globalAlpha > 0) {
      nanites.add(this.canvas);
      if (record) record.nanites++;
    }
    if (target && record) {
      record.images++;
      qa[target] = record;
    }
    return draw.call(this, source, ...args);
  };
});

const settle = () =>
  page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 60000 },
  );
const frames = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
async function openEntry() {
  await page.locator(".side-panel-trigger").first().click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.scrollIntoViewIfNeeded();
  await link.click();
  if (mode !== "reduced") {
    await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () =>
        document.querySelector(".rx-suit")?.dataset.nanites === "canvas" ||
        Number(document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime) >=
          440,
      null,
      { timeout: 5000 },
    );
  }
}

async function capture(visit, kind, name, phase) {
  const record = await page.evaluate((kind) => {
    const qa = window.__spreadQA;
    const frame = { ...qa[kind] };
    const source = document.querySelector(
      kind === "entry" ? ".rx-suit-nanites > canvas:nth-child(2)" : "canvas.rzn-canvas",
    );
    return {
      frame,
      backing: source ? [source.width, source.height] : null,
      tier: document.querySelector(".rx-call-sequence")?.dataset.tier,
      painter: document.querySelector(".rx-suit")?.dataset.nanites,
      field: frame.flames > 0 && qa.field ? qa.field.toDataURL("image/png") : null,
      clock: Number(document.querySelector(".rx-call-meter > i")?.getAnimations()[0]?.currentTime),
      live: document.querySelector(".rzn-suitup")?.dataset.rznState,
    };
  }, kind);
  const prefix = join(dir, `visit${visit}-${kind}-${name}`);
  await page.screenshot({ path: `${prefix}-screen.png`, scale: "css" });
  if (record.field)
    await writeFile(`${prefix}-field.png`, Buffer.from(record.field.split(",")[1], "base64"));
  delete record.field;
  return { name, phase, kind, ...record, prefix };
}

async function scrollPhase(phase) {
  const progress = 0.015 + 0.285 * phase;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = await page.evaluate((progress) => {
      const runway = document.querySelector(".rzn-suitup"),
        frame = runway.querySelector(".rzn-frame");
      const top =
        runway.getBoundingClientRect().top +
        scrollY -
        (parseFloat(getComputedStyle(frame).top) || 0);
      const span = runway.offsetHeight - frame.offsetHeight;
      scrollTo({ top: Math.ceil(top + progress * span), behavior: "instant" });
      return (scrollY - top) / span;
    }, progress);
    await page.waitForTimeout(240);
    await frames();
    if (Math.abs(actual - progress) < 0.002) return actual;
  }
  throw new Error(`scroll phase ${phase} did not settle`);
}

async function fieldEvidence(shot) {
  if (!shot.frame.flames) return { burning: false };
  const { data, info } = await sharp(`${shot.prefix}-field.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return flameSpreadEvidence(data, info.width, info.height);
}

async function contactSheet(visit, shots) {
  const composites = [],
    tileW = 192,
    tileH = 336;
  for (const [column, [name]] of samples.entries())
    for (const [row, kind] of ["entry", "scroll"].entries()) {
      const shot = shots.find((item) => item.name === name && item.kind === kind);
      if (!shot?.frame.flames) continue;
      composites.push({
        input: await sharp(`${shot.prefix}-field.png`).resize(tileW, 312).png().toBuffer(),
        left: column * tileW,
        top: row * tileH + 24,
      });
    }
  const labels = samples
    .map(([name], i) => `<text x="${i * tileW + 8}" y="18">${name}</text>`)
    .join("");
  const svg = `<svg width="${tileW * samples.length}" height="${tileH * 2}" xmlns="http://www.w3.org/2000/svg"><g fill="#d9f8cf" font-family="sans-serif" font-size="14">${labels}<text x="8" y="${tileH + 18}">scroll</text></g></svg>`;
  composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  await sharp({
    create: {
      width: tileW * samples.length,
      height: tileH * 2,
      channels: 4,
      background: "#07100b",
    },
  })
    .composite(composites)
    .png()
    .toFile(join(dir, `visit${visit}-entry-scroll-field-comparison.png`));
}

try {
  await page.goto(`${base}/world`, { waitUntil: "networkidle" });
  await settle();
  await page.waitForTimeout(9000);
  for (let visit = 1; visit <= visits; visit++) {
    const run = { visit, entry: [], scroll: [], reverse: [], checks: [] };
    report.visits.push(run);
    await openEntry();
    if (mode !== "reduced") {
      for (const [name, phase] of samples) {
        const target = entryElapsedTime(phase * 2400);
        await page.evaluate((target) => {
          const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
          if (meter) {
            meter.pause();
            meter.currentTime = target;
          }
        }, target);
        await frames();
        const shot = await capture(visit, "entry", name, phase);
        run.entry.push({ ...shot, target });
        assert.ok(
          Math.abs(shot.clock - target) < 1,
          "entry capture belongs to the actual paused meter",
        );
        assert.ok(
          Math.abs(shot.frame.actual - target) < 1,
          "the actual entry drawing frame uses that same paused meter time",
        );
        assert.ok(shot.frame.images > 0, "entry sample contains a real painter frame");
      }
      await page.evaluate(() => {
        const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
        if (meter) {
          meter.currentTime = 9000;
          meter.play();
        }
      });
    }
    await page.waitForURL("**/rexonance-saga#top", { timeout: 45000 });
    await settle();
    await page.locator(".rx-call-sequence").waitFor({ state: "detached", timeout: 15000 });
    await page.locator(".rzn-suitup").waitFor({ state: "attached" });
    await page.addStyleTag({ content: "html,body,*{scroll-behavior:auto!important}" });
    if (mode === "reduced") {
      await page.locator(".rzn-suitup").scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(dir, `visit${visit}-reduced-still.png`), scale: "css" });
      assert.equal(
        await page.locator('.rzn-suitup[data-rzn-state="live"]').count(),
        0,
        "reduced motion uses the finished still",
      );
    } else {
      // Enter the real observer range and allow the shared assets to finish.
      await scrollPhase(0.025);
      await page.waitForFunction(
        () => document.querySelector('.rzn-suitup[data-rzn-state="live"] canvas')?.width > 0,
        null,
        { timeout: 30000 },
      );
      await page.waitForTimeout(800);
      for (const [name, phase] of samples) {
        const actual = await scrollPhase(phase);
        const shot = await capture(visit, "scroll", name, phase);
        run.scroll.push({ ...shot, actual });
        assert.ok(shot.frame.images > 0, "scroll sample contains a real painter frame");
        assert.ok(
          Math.abs(shot.frame.actual - actual) < 0.002,
          "the inspected actual drawing frame belongs to the settled scroll target",
        );
      }
      await scrollPhase(0.16);
      run.reverse.push(await capture(visit, "scroll", "reverse-full", 0.16));
      await scrollPhase(0.025);
      run.reverse.push(await capture(visit, "scroll", "reverse-kindle", 0.025));
      await contactSheet(visit, [...run.entry, ...run.scroll]);
      for (const shots of [run.entry, run.scroll]) {
        for (const shot of shots) shot.evidence = await fieldEvidence(shot);
        assert.ok(
          shots
            .filter((shot) => shot.phase < NANITE_FIRE_PHASES.materialStart)
            .every((shot) => shot.frame.nanites === 0 && shot.frame.naniteHexes === 0),
          "actual kit images and touch hexes wait for material onset",
        );
        // The vortex ends at the shared flame end; its afterburn (owner,
        // 2026-10-21) keeps burning under the forming armour after it.
        assert.ok(
          shots
            .filter((shot) => shot.phase >= NANITE_FIRE_PHASES.flameEnd)
            .every((shot) => shot.frame.flames > 0),
          "the afterburn keeps burning after the vortex has cleared",
        );
        assert.ok(
          shots.some(
            (shot) =>
              shot.phase > NANITE_FIRE_PHASES.flameEnd &&
              shot.frame.nanites + shot.frame.naniteHexes > 0,
          ),
          "actual native nanite images or touch hexes appear after the fire",
        );
        const kindle = shots.find((shot) => shot.name === "kindle").evidence;
        const full = shots.find((shot) => shot.name === "full").evidence;
        const peak = shots.find((shot) => shot.name === "peak").evidence;
        const check = {
          kind: shots[0].kind,
          footFirst: kindle.burning && kindle.bands.foot > 0 && kindle.bands.crown === 0,
          frontRises: full.burning && kindle.burning && full.top < kindle.top - 0.4,
          fullBody: [full, peak].some(
            (shot) =>
              shot.burning &&
              Object.values(shot.bands).every((count) => count > 5) &&
              Object.values(shot.regions).every((region) => region.ratio >= 0.05) &&
              shot.armsLeft > 5 &&
              shot.armsRight > 5,
          ),
          overlap: shots.some(
            (shot) =>
              shot.phase >= NANITE_FIRE_PHASES.materialStart &&
              shot.phase < NANITE_FIRE_PHASES.flameEnd &&
              shot.frame.flames > 0 &&
              shot.frame.nanites + shot.frame.naniteHexes > 0,
          ),
        };
        run.checks.push(check);
        if (strict)
          assert.ok(
            Object.values(check).every((value) => Boolean(value)),
            JSON.stringify(check),
          );
      }
    }
    if (visit < visits) {
      await page.locator(".rxs-brand").click();
      await page.waitForURL((url) => url.pathname === "/world", { timeout: 45000 });
      await settle();
    }
  }
  assert.deepEqual(report.errors, [], "no page exceptions");
  console.log(
    JSON.stringify(
      { out: dir, visits: report.visits.map(({ visit, checks }) => ({ visit, checks })) },
      null,
      2,
    ),
  );
} catch (error) {
  report.failure = String(error.stack || error);
  report.failureState = await page
    .evaluate(() => ({
      url: location.href,
      trigger: document.querySelector(".side-panel-trigger")?.outerHTML,
      panel: document.querySelector("#site-side-panel")?.outerHTML.slice(0, 1200),
      loading: document.documentElement.dataset.loading,
    }))
    .catch(() => null);
  await page.screenshot({ path: join(dir, "failure-screen.png"), scale: "css" }).catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
