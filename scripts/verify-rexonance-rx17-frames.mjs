// Owner's rx17 art audit: exact call-clock 600..2400ms, every 40ms.
// Only the test clock is controlled; the real warm-up and canvas engine run.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8082";
const output = process.env.RX17_OUTPUT ?? "/private/tmp/rx17-review/baseline";
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  },
};
// This is also isolated by the unit audit without importing/launching Chrome.
// It validates actual recorded CSS state, not idealized source timing values.
export function assertRexonanceFaceHold({ shots, supplements }, name) {
  const faceAt = (time) => {
    const shot = [...shots, ...supplements].find((candidate) => candidate.clock === time);
    assert.ok(shot, `${name}: actual face evidence is missing at ${time}ms`);
    assert.equal(shot.faceGroups.length, 6, `${name}: six face groups at ${time}ms`);
    return shot.faceGroups;
  };
  assert.ok(faceAt(1990).every((group) => Number(group.opacity) === 0));
  assert.ok(Number(faceAt(2000)[0].opacity) > 0 && Number(faceAt(2000)[0].opacity) < 1);
  assert.ok(faceAt(2120).every((group) => Number(group.opacity) === 1));
  assert.deepEqual(faceAt(2640), faceAt(2120), `${name}: filled squares hold on the face`);
  assert.deepEqual(faceAt(2670), faceAt(2640), `${name}: scatter does not start early`);
  assert.notDeepEqual(faceAt(2710), faceAt(2670), `${name}: squares scatter after the hold`);
  assert.ok(faceAt(2800).every((group) => Number(group.opacity) < 0.09));
}

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
const reports = [];
const partRegions = Object.fromEntries(
  ["helm", "tail", "ribbon"].map((group) => {
    const pieces = REXONANCE_SUIT_PIECES.filter((piece) => piece.group === group);
    const left = Math.max(0, Math.min(...pieces.map((piece) => piece.x)) - 12);
    const top = Math.max(0, Math.min(...pieces.map((piece) => piece.y)) - 12);
    const right = Math.min(
      REXONANCE_SUIT_SIZE.width,
      Math.max(...pieces.map((piece) => piece.x + piece.w)) + 12,
    );
    const bottom = Math.min(
      REXONANCE_SUIT_SIZE.height,
      Math.max(...pieces.map((piece) => piece.y + piece.h)) + 12,
    );
    return [group, { left, top, width: right - left, height: bottom - top }];
  }),
);

async function contactSheet(shots, path, { cellW = 220, cellH = 370, columns = 8 } = {}) {
  const composites = [];
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const tile = await sharp(shot.file)
      .resize(cellW, cellH - 24, { fit: "contain", background: "#080a10" })
      .png()
      .toBuffer();
    composites.push({
      input: tile,
      left: (i % columns) * cellW,
      top: Math.floor(i / columns) * cellH + 24,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellW}" height="24"><text x="10" y="18" fill="white" font-size="16">${shot.clock} ms</text></svg>`,
      ),
      left: (i % columns) * cellW,
      top: Math.floor(i / columns) * cellH,
    });
  }
  await sharp({
    create: {
      width: cellW * columns,
      height: cellH * Math.ceil(shots.length / columns),
      channels: 3,
      background: "#080a10",
    },
  })
    .composite(composites)
    .png()
    .toFile(path);
}

try {
  for (const [name, profile] of Object.entries(profiles)) {
    const dir = join(output, name);
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/world`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".load-gate"));
    await page.waitForTimeout(3500);
    const trigger = page.locator(".side-panel-trigger").first();
    await (profile.hasTouch ? trigger.tap() : trigger.click());
    const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
    await link.waitFor({ state: "visible" });
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const time = Date.now() + 5000;
    await page.clock.install({ time: time - 1000 });
    await page.clock.pauseAt(time);
    await page.evaluate(() => {
      window.rx17Animations = new Map();
      window.rx17Freeze = (target) => {
        const now = performance.now();
        const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
        if (meter && window.rx17Origin === undefined) window.rx17Origin = now;
        for (const animation of document.getAnimations()) {
          if (!window.rx17Animations.has(animation)) window.rx17Animations.set(animation, now);
          try {
            animation.pause();
            animation.currentTime =
              target === undefined
                ? now - window.rx17Animations.get(animation)
                : target - (window.rx17Animations.get(animation) - window.rx17Origin);
          } catch {
            /* finished animations */
          }
        }
        return meter ? Number(meter.currentTime) : null;
      };
    });
    await (profile.hasTouch ? link.tap() : link.click());
    let clock = null;
    for (let frame = 0; frame < 40 && (clock === null || clock < 420); frame += 1) {
      await page.clock.runFor(1000 / 60);
      clock = await page.evaluate(() => window.rx17Freeze());
    }
    await page.locator('.rx-suit[data-nanites="canvas"]').waitFor({ state: "attached" });
    const box = await page.locator(".rx-suit-figure").boundingBox();
    assert.ok(box);
    const vp = profile.viewport;
    const x = Math.max(0, box.x - 12),
      y = Math.max(0, box.y - 12);
    const clip = {
      x,
      y,
      width: Math.min(vp.width - x, box.width + 24),
      height: Math.min(vp.height - y, box.height + 24),
    };
    const capture = async (ms, supplement = false) => {
      await page.evaluate((target) => window.rx17Freeze(target), ms);
      // Two rAFs paint the real engine from this exact, paused meter time.
      await page.clock.runFor(34);
      const state = await page.evaluate(() => {
        const suit = document.querySelector(".rx-suit");
        const meter = document.querySelector(".rx-call-meter > i")?.getAnimations()[0];
        return {
          clock: Number(meter?.currentTime),
          suit: suit?.dataset.suit,
          nanites: suit?.dataset.nanites,
          tier: suit?.closest(".rx-call-sequence")?.dataset.tier,
          canvases: [...(suit?.querySelectorAll(".rx-suit-nanites > canvas") ?? [])].map(
            (canvas) => ({ width: canvas.width, height: canvas.height }),
          ),
          faceGroups: [...(suit?.querySelectorAll(".rx-suit-pixels") ?? [])].map((group) => ({
            opacity: getComputedStyle(group).opacity,
            transform: getComputedStyle(group).transform,
          })),
        };
      });
      assert.equal(state.clock, ms);
      assert.equal(state.nanites, "canvas", `${name} ${ms}: DOM fallback is not proof`);
      assert.equal(state.suit, "build");
      assert.equal(state.tier, "full");
      assert.equal(state.canvases.length, 2);
      assert.ok(state.canvases.every((canvas) => canvas.width > 0 && canvas.height > 0));
      assert.equal(state.faceGroups.length, 6);
      const prefix = supplement ? "supplement-" : "";
      const file = join(dir, `${prefix}${String(ms).padStart(4, "0")}.png`);
      await page.screenshot({ path: file, clip });
      const meta = await sharp(file).metadata();
      const densityX = meta.width / clip.width;
      const densityY = meta.height / clip.height;
      const parts = {};
      for (const [part, region] of Object.entries(partRegions)) {
        const left = Math.max(
          0,
          Math.floor(
            (box.x - clip.x + (region.left * box.width) / REXONANCE_SUIT_SIZE.width) * densityX,
          ),
        );
        const top = Math.max(
          0,
          Math.floor(
            (box.y - clip.y + (region.top * box.height) / REXONANCE_SUIT_SIZE.height) * densityY,
          ),
        );
        const width = Math.min(
          meta.width - left,
          Math.ceil(((region.width * box.width) / REXONANCE_SUIT_SIZE.width) * densityX),
        );
        const height = Math.min(
          meta.height - top,
          Math.ceil(((region.height * box.height) / REXONANCE_SUIT_SIZE.height) * densityY),
        );
        assert.ok(width > 0 && height > 0, `${name} ${part}: actual screenshot region`);
        const partFile = join(dir, `${prefix}${String(ms).padStart(4, "0")}-${part}.png`);
        await sharp(file).extract({ left, top, width, height }).png().toFile(partFile);
        parts[part] = { file: partFile, left, top, width, height };
      }
      return { file, ...state, parts };
    };
    // Separate evidence around the final gold lock, face fill, 0.6s hold,
    // and scatter. These do not alter the owner's 46-frame audit contract.
    // Capture monotonically: the real engine releases its rAF after the
    // last glint, so rewinding it after 2400ms would fabricate gold evidence.
    const regularTimes = Array.from({ length: 46 }, (_, index) => 600 + index * 40);
    const supplementTimes = [1986, 1990, 2000, 2060, 2640, 2670, 2710, 2800];
    const moments = [...new Set([...regularTimes, ...supplementTimes])].sort((a, b) => a - b);
    const shots = [];
    const supplements = [];
    for (const ms of moments) {
      if (regularTimes.includes(ms)) shots.push(await capture(ms));
      if (supplementTimes.includes(ms)) {
        if (regularTimes.includes(ms)) {
          // At shared moments use the exact same painted frame, without
          // advancing the page clock for another screenshot.
          supplements.push(shots.at(-1));
        } else supplements.push(await capture(ms, true));
      }
    }
    assert.equal(shots.length, 46);
    assert.equal(supplements.length, 8);
    assertRexonanceFaceHold({ shots, supplements }, name);
    assert.deepEqual(errors, []);
    await contactSheet(shots, join(output, `${name}-timeline.png`));
    for (const part of Object.keys(partRegions)) {
      const relevant = shots.filter(
        (shot) => shot.clock >= (part === "helm" ? 1600 : 1400) && shot.clock <= 2040,
      );
      await contactSheet(
        relevant.map((shot) => ({ file: shot.parts[part].file, clock: shot.clock })),
        join(output, `${name}-${part}.png`),
        { cellW: 220, cellH: 240, columns: 6 },
      );
    }
    await contactSheet(
      supplements.map((shot) => ({ file: shot.parts.helm.file, clock: shot.clock })),
      join(output, `${name}-face-supplements.png`),
      { cellW: 220, cellH: 240, columns: 4 },
    );
    reports.push({
      profile: name,
      ...profile,
      engine: "canvas",
      box,
      clip,
      shots,
      supplements,
      errors,
    });
    await context.close();
  }
  writeFileSync(join(output, "frames.json"), JSON.stringify({ base, reports }, null, 2));
  console.log(
    JSON.stringify({
      output,
      profiles: reports.map((r) => ({
        profile: r.profile,
        engine: r.engine,
        frames: r.shots.length,
      })),
    }),
  );
} finally {
  await browser.close();
}
