// Read-only visual QA of the live scroll assembly, including its reversible
// reactor coil. BASE_URL=... OUT_DIR=/private/tmp/... node scripts/verify-rexonance-reactor.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import sharp from "sharp";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8594";
const out = process.env.OUT_DIR || "/private/tmp/rexonance-reactor-qa";
const points = [0.73, 0.75, 0.77, 0.79, 0.82, 0.9];
const milestones = [
  ...points.map((progress) => ({ direction: "forward", progress })),
  ...points
    .slice(0, -1)
    .reverse()
    .map((progress) => ({ direction: "reverse", progress })),
];
const profiles = [
  { name: "chrome-desktop", engine: chromium, options: { viewport: { width: 1440, height: 900 } } },
  {
    name: "chrome-phone",
    engine: chromium,
    options: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "webkit-phone",
    engine: webkit,
    options: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
];
const selected = process.env.RX_REACTOR_PROFILES
  ? profiles.filter((profile) => process.env.RX_REACTOR_PROFILES.split(",").includes(profile.name))
  : profiles;
assert.ok(selected.length, "RX_REACTOR_PROFILES did not select a known profile");
await mkdir(out, { recursive: true });

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);
const runwayProgress = (state) =>
  (state.scrollY - (state.top - state.pin)) / (state.height - state.frameHeight);
const reachedMilestone = (actual, progress, state) =>
  actual + 1e-6 >= progress && actual <= progress + 2 / (state.height - state.frameHeight);
const geometryChanged = (before, after) =>
  ["top", "height", "frameHeight", "pin"].some(
    (property) => Math.abs(before[property] - after[property]) > 0.5,
  );
const readRunway = (page) =>
  page.evaluate(() => {
    const runway = document.querySelector(".rzn-suitup");
    const frame = runway?.querySelector(".rzn-frame");
    const canvas = runway?.querySelector("canvas.rzn-canvas");
    return {
      load: runway?.dataset.rznLoad || null,
      state: runway?.dataset.rznState || null,
      phase: runway?.dataset.rznPhase || null,
      percent: Number(runway?.querySelector(".rzn-percent")?.textContent),
      top: runway?.getBoundingClientRect().top + scrollY,
      height: runway?.offsetHeight,
      frameHeight: frame?.offsetHeight,
      pin: frame ? Number.parseFloat(getComputedStyle(frame).top) || 0 : null,
      scrollY,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      canvasCssWidth: canvas?.clientWidth || 0,
      canvasCssHeight: canvas?.clientHeight || 0,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

async function installDrawProbe(context) {
  await context.addInitScript(() => {
    window.__reactorCanvasDraws = 0;
    window.__reactorLastDraw = 0;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas?.matches?.("canvas.rzn-canvas")) {
        window.__reactorCanvasDraws += 1;
        window.__reactorLastDraw = performance.now();
      }
      return original.apply(this, args);
    };
  });
}

async function awaitPaint(page, label, previousDraws) {
  const handle = await page.waitForFunction(
    (previous) => {
      const canvas = document.querySelector("canvas.rzn-canvas");
      if (!canvas?.width || !canvas.height || window.__reactorCanvasDraws <= previous) return false;
      const sample = document.createElement("canvas");
      sample.width = 32;
      sample.height = 48;
      const context = sample.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let alphaPixels = 0;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 8) alphaPixels += 1;
        for (let offset = 0; offset < 4; offset += 1) {
          hash ^= pixels[index + offset];
          hash = Math.imul(hash, 16777619);
        }
      }
      const key = (hash >>> 0).toString(16).padStart(8, "0");
      const lastSample = window.__reactorConvergence || { key: null, frames: 0 };
      const frames = lastSample.key === key ? lastSample.frames + 1 : 1;
      window.__reactorConvergence = { key, frames };
      const quietFor = performance.now() - window.__reactorLastDraw;
      return quietFor >= 320 && frames >= 3
        ? { key, frames, quietFor, alphaPixels, drawCalls: window.__reactorCanvasDraws }
        : false;
    },
    previousDraws,
    { timeout: 12000, polling: "raf" },
  );
  const result = await handle.jsonValue();
  await handle.dispose();
  assert.ok(result.alphaPixels > 20, `${label}: live assembly canvas is blank`);
  return result;
}

async function capture(page, dir, label, state, evidence) {
  const name = `${label}-${state.progress.toFixed(2).replace(".", "_")}`;
  const viewportPath = join(dir, `${name}-viewport.png`);
  const canvasPath = join(dir, `${name}-canvas.png`);
  const chestPath = join(dir, `${name}-chest.png`);
  await page.screenshot({ path: viewportPath, scale: "css" });
  const picture = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.rzn-canvas");
    const style = getComputedStyle(canvas);
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const figureHeight = Math.min(
      cssHeight * (Number.parseFloat(style.getPropertyValue("--rzn-fig-h")) || 0.84),
      (cssWidth * (Number.parseFloat(style.getPropertyValue("--rzn-fig-w")) || 0.9) * 1040) / 571,
    );
    const scale = figureHeight / 1040;
    const centreX = Number.parseFloat(style.getPropertyValue("--rzn-fig-x")) || 0.5;
    const bottom = Number.parseFloat(style.getPropertyValue("--rzn-fig-b")) || 0.05;
    return {
      data: canvas.toDataURL("image/png"),
      view: {
        x: cssWidth * centreX - (571 * scale) / 2,
        y: cssHeight * (1 - bottom) - figureHeight,
        scale,
        ratio: canvas.width / cssWidth,
      },
    };
  });
  const raw = Buffer.from(picture.data.split(",")[1], "base64");
  await writeFile(canvasPath, raw);
  const { x, y, scale, ratio } = picture.view;
  // Include the actual coiled armour and adjacent shoulder plates. The crop
  // is calculated from the same figure-space marks used by the live engine.
  const [coreX, coreY] = REXONANCE_SUIT_MARKS.core;
  const crop = {
    left: Math.max(0, Math.floor((x + (coreX - 145) * scale) * ratio)),
    top: Math.max(0, Math.floor((y + (coreY - 105) * scale) * ratio)),
    width: Math.max(1, Math.ceil(290 * scale * ratio)),
    height: Math.max(1, Math.ceil(210 * scale * ratio)),
  };
  const metadata = await sharp(raw).metadata();
  crop.width = Math.min(crop.width, metadata.width - crop.left);
  crop.height = Math.min(crop.height, metadata.height - crop.top);
  assert.ok(crop.width > 0 && crop.height > 0, `${label}: reactor crop outside canvas`);
  const chest = await sharp(raw)
    .extract(crop)
    .resize({ width: 580, height: 420, fit: "fill", kernel: "nearest" })
    .png()
    .toBuffer();
  await writeFile(chestPath, chest);
  return {
    viewport: viewportPath,
    canvas: canvasPath,
    chest: chestPath,
    chestHash: digest(chest),
    canvasHash: digest(raw),
    crop,
    evidence,
  };
}

const report = { base, suit: REXONANCE_SUIT_SIZE, profiles: [] };
for (const profile of selected) {
  const dir = join(out, profile.name);
  await mkdir(dir, { recursive: true });
  const browser = await profile.engine.launch(
    profile.engine === chromium ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : {},
  );
  const context = await browser.newContext(profile.options);
  await installDrawProbe(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/rexonance-saga`, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        document.querySelector("main[data-motion-ready]") &&
        !document.documentElement.hasAttribute("data-loading"),
      null,
      { timeout: 60000 },
    );
    await page.locator(".rzn-suitup").waitFor({ state: "attached", timeout: 60000 });
    await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
    const initial = await readRunway(page);
    assert.ok(initial.height > initial.frameHeight + 100, `${profile.name}: not a scroll runway`);
    await page.evaluate(
      (top) => scrollTo({ top, behavior: "instant" }),
      Math.max(0, initial.top - profile.options.viewport.height * 4.4),
    );
    await page.waitForTimeout(1600);
    const shots = [];
    for (const { direction, progress } of milestones) {
      const label = `${profile.name}-${direction}`;
      let evidence;
      let state;
      let actual;
      let corrections = 0;
      // WebKit can change font metrics and the sticky frame's top/height as
      // the first live canvas replaces its still. Aim each stop using current
      // geometry; re-aim only when that geometry itself changed mid-stop.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const before = await readRunway(page);
        const previousDraws = await page.evaluate(() => window.__reactorCanvasDraws);
        await page.evaluate(
          ({ start, progress }) =>
            scrollTo({
              top: Math.ceil(start.top - start.pin + progress * (start.height - start.frameHeight)),
              behavior: "instant",
            }),
          { start: before, progress },
        );
        await page.waitForFunction(
          () => {
            const runway = document.querySelector(".rzn-suitup");
            return (
              runway?.dataset.rznState === "live" &&
              runway.querySelector("canvas.rzn-canvas")?.width > 0
            );
          },
          null,
          { timeout: 30000 },
        );
        evidence = await awaitPaint(page, `${label}/${progress}`, previousDraws);
        state = { ...(await readRunway(page)), direction, progress };
        actual = runwayProgress(state);
        if (reachedMilestone(actual, progress, state)) break;
        assert.ok(
          geometryChanged(before, state),
          `${label}/${progress}: scroll missed target without a layout change; before=${JSON.stringify(before)}, current=${JSON.stringify(state)}`,
        );
        corrections += 1;
      }
      assert.ok(
        reachedMilestone(actual, progress, state),
        `${label}/${progress}: wrong current-layout scroll progress ${actual}; state=${JSON.stringify(state)}`,
      );
      assert.equal(
        state.percent,
        Math.round(Math.min(1, actual / 0.93) * 100),
        `${label}/${progress}: HUD progress; current=${JSON.stringify(state)}, actual=${actual}`,
      );
      assert.ok(
        state.canvasWidth > 0 && state.canvasHeight > 0,
        `${label}/${progress}: missing canvas`,
      );
      assert.ok(
        state.documentWidth <= state.viewportWidth,
        `${label}/${progress}: horizontal overflow`,
      );
      const files = await capture(page, dir, direction, state, evidence);
      shots.push({ ...state, actual, corrections, ...files });
      console.log(
        `${label} ${progress.toFixed(2)}: ${state.phase} / ${state.percent}% / ${evidence.alphaPixels} pixels`,
      );
    }
    assert.deepEqual(errors, [], `${profile.name}: page errors`);
    report.profiles.push({ name: profile.name, errors, shots });
  } finally {
    await context.close();
    await browser.close();
  }
}
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(
  `Reactor scroll QA: ${report.profiles.length} profiles, report ${join(out, "report.json")}`,
);
