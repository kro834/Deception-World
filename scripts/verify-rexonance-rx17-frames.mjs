// Owner's rx17 art audit: exact call-clock 600..2400ms, every 40ms.
// Only the test clock is controlled; the real warm-up and canvas engine run.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

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
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
const reports = [];
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
    const shots = [];
    for (let ms = 600; ms <= 2400; ms += 40) {
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
        };
      });
      assert.equal(state.clock, ms);
      assert.equal(state.nanites, "canvas", `${name} ${ms}: DOM fallback is not proof`);
      const file = join(dir, `${String(ms).padStart(4, "0")}.png`);
      await page.screenshot({ path: file, clip });
      shots.push({ file, ...state });
    }
    assert.equal(shots.length, 46);
    assert.deepEqual(errors, []);
    const cellW = 220,
      cellH = 370,
      columns = 8;
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
      .toFile(join(output, `${name}-timeline.png`));
    reports.push({ profile: name, ...profile, engine: "canvas", shots, errors });
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
