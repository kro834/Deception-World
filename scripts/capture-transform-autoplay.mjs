// Disposable browser QA for the scroll suit-up's playhead and its auto
// transformation movie (owner, 2026-10-23: 「スクロールに伴ってより滑らかに変身
// されるようにし、自動変身ムービーも速度調整機能付きでつけて。レクソナンスにも
// この機能は実装。」), on /far-from-saga and /rexonance-saga at 390 and 1440.
//
//   BASE_URL=http://127.0.0.1:8566 OUT_DIR=<dir> node scripts/capture-transform-autoplay.mjs
//   PAGES=far-from-saga,rexonance-saga PROFILES=desktop1440,phone390 MODES=wheel,movie,pause,reduced
//
// "wheel": the frames drawn (the engine's __rexonanceDrawMs hook) while the
// wheel steps the page notch by notch (Chromium's own wheel smoothing off,
// the worst case), with the frame-to-frame progress deltas.
// "movie": the movie played at each speed; "pause": a wheel step during the
// movie; "reduced": prefers-reduced-motion.
//
// Chromium runs from CHROMIUM (a headless build) with software WebGL, as the
// review asks: --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8566");
const out = process.env.OUT_DIR || "/tmp/transform-autoplay";
const pages = (process.env.PAGES || "far-from-saga,rexonance-saga").split(",");
const modes = (process.env.MODES || "wheel,movie,pause,reduced").split(",");
const label = process.env.LABEL || "run";
const profiles = {
  desktop1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone390: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const chosen = (process.env.PROFILES || "desktop1440,phone390").split(",");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-smooth-scrolling",
    "--no-sandbox",
  ],
});
const report = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Activates a control as a tap would (on phones the idle control stands in
 * the page above the runway, outside the pinned frame). */
const press = (page, selector) =>
  page.evaluate((at) => document.querySelector(at)?.click(), selector);

async function open(profile, path, reducedMotion = "no-preference") {
  const context = await browser.newContext({ ...profile, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${base}/${path}`, { waitUntil: "load" });
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && document.querySelector(".rzn-suitup"),
    null,
    { timeout: 90000 },
  );
  await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
  await sleep(1200);
  return { context, page, errors };
}

/** Scrolls to the runway's progress q (instantly). */
const runwayTop = () =>
  (() => {
    const runway = document.querySelector(".rzn-suitup");
    const frame = runway.querySelector(".rzn-frame");
    const pin = parseFloat(getComputedStyle(frame).top) || 0;
    return {
      top: runway.getBoundingClientRect().top + scrollY - pin,
      travel: runway.offsetHeight - frame.offsetHeight,
    };
  })();

async function goLive(page) {
  const geometry = await page.evaluate(runwayTop);
  await page.evaluate((y) => scrollTo(0, y), geometry.top);
  const live = await page
    .waitForFunction(() => document.querySelector(".rzn-suitup")?.dataset.rznState === "live", null, {
      timeout: 120000,
    })
    .then(() => true)
    .catch(() => false);
  // The first live frame, and the preparation's idle work, settle first.
  await sleep(1500);
  return { ...geometry, live };
}

/** Records every drawn frame: the engine's progress hook plus its stamp. */
async function armRecorder(page) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__rexonanceDrawMs = (ms, progress, calm) => {
      window.__frames.push({ t: performance.now(), q: progress, calm, ms });
    };
  });
}
const takeFrames = (page) =>
  page.evaluate(() => {
    const frames = window.__frames;
    window.__frames = [];
    return frames;
  });

function summarize(frames) {
  const moving = frames.filter((f) => !f.calm);
  const deltas = [];
  for (let k = 1; k < moving.length; k += 1) deltas.push(Math.abs(moving[k].q - moving[k - 1].q));
  const sorted = [...deltas].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  // A "jump": a frame-to-frame step over a quarter of a wheel notch's worth.
  const jumps = deltas.filter((d) => d > 0.012).length;
  return {
    frames: moving.length,
    maxDelta: sorted.at(-1) ?? 0,
    p50: pct(0.5),
    p90: pct(0.9),
    jumps,
    distinct: new Set(moving.map((f) => f.q.toFixed(4))).size,
    sequence: moving.map((f) => Number(f.q.toFixed(4))),
  };
}

for (const name of chosen) {
  const profile = profiles[name];
  for (const path of pages) {
    const entry = { profile: name, page: path, label, modes: {} };
    report.push(entry);
    if (modes.some((m) => m !== "reduced")) {
      const { context, page, errors } = await open(profile, path);
      const geometry = await goLive(page);
      entry.live = geometry.live;
      entry.travel = geometry.travel;
      entry.state = await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        return { load: runway.dataset.rznLoad, state: runway.dataset.rznState };
      });
      if (modes.includes("wheel")) {
        // Twelve notches of 100 px, 90 ms apart (a hand on a wheel), from
        // the fire's start; then the frames settle.
        await page.evaluate((y) => scrollTo(0, y), geometry.top + geometry.travel * 0.1);
        await sleep(700);
        await armRecorder(page);
        await page.mouse.move(profile.viewport.width / 2, profile.viewport.height / 2);
        for (let k = 0; k < 12; k += 1) {
          await page.mouse.wheel(0, 100);
          await sleep(90);
        }
        await sleep(600);
        const frames = await takeFrames(page);
        entry.modes.wheel = summarize(frames);
        entry.modes.wheel.notch = 100 / geometry.travel;
        await page.screenshot({ path: join(out, `${label}-${name}-${path}-wheel.png`) });
        // A fling: eight notches of 400 px, 16 ms apart.
        await armRecorder(page);
        for (let k = 0; k < 8; k += 1) {
          await page.mouse.wheel(0, 400);
          await sleep(16);
        }
        await sleep(900);
        entry.modes.fling = summarize(await takeFrames(page));
        entry.modes.fling.catchUpFrames = entry.modes.fling.frames;
      }
      const movie = await page.$(".rzn-movie");
      entry.movie = Boolean(movie);
      if (movie && modes.includes("movie")) {
        entry.modes.movie = {};
        for (const speed of ["2", "1.5", "1", "0.5"]) {
          await page.evaluate((y) => scrollTo(0, y), geometry.top);
          await sleep(400);
          await press(page, `.rzn-movie [role="radio"][data-speed="${speed}"]`);
          await armRecorder(page);
          const started = Date.now();
          await press(page, ".rzn-movie-play");
          const state0 = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state);
          // Let it run two seconds, snapshot, then let it finish (fast speeds) or stop.
          await sleep(2000);
          await page.screenshot({ path: join(out, `${label}-${name}-${path}-movie-${speed}x.png`) });
          const progressAt2s = await page.evaluate(() => Number(document.querySelector(".rzn-movie-seek input").value));
          // 2× runs to its end (a software-rendered frame is slow, so up to a
          // minute); the other speeds are paused after their two seconds.
          let ended = false;
          if (Number(speed) === 2) {
            ended = await page
              .waitForFunction(() => document.querySelector(".rzn-movie").dataset.state === "ended", null, {
                timeout: 60000,
              })
              .then(() => true)
              .catch(() => false);
          }
          const elapsed = Date.now() - started;
          // Whatever is still playing is paused before the next speed.
          if (await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state === "playing"))
            await press(page, ".rzn-movie-play");
          const frames = await takeFrames(page);
          const summary = summarize(frames);
          const final = await page.evaluate(() => {
            const runway = document.querySelector(".rzn-suitup");
            const frame = runway.querySelector(".rzn-frame");
            const pin = parseFloat(getComputedStyle(frame).top) || 0;
            const travel = runway.offsetHeight - frame.offsetHeight;
            return {
              progress: (pin - runway.getBoundingClientRect().top) / travel,
              phase: runway.dataset.rznPhase,
              formComplete: runway.dataset.rznFormComplete,
              movie: document.querySelector(".rzn-movie").dataset.state,
              label: document.querySelector(".rzn-movie-play").textContent,
            };
          });
          if (ended) await page.screenshot({ path: join(out, `${label}-${name}-${path}-movie-${speed}x-end.png`) });
          entry.modes.movie[speed] = { state0, progressAt2s, ended, elapsedMs: elapsed, ...summary, final };
          delete entry.modes.movie[speed].sequence;
        }
      }
      if (movie && modes.includes("pause")) {
        await page.evaluate((y) => scrollTo(0, y), geometry.top);
        await sleep(400);
        await press(page, '.rzn-movie [role="radio"][data-speed="1"]');
        await press(page, ".rzn-movie-play");
        await sleep(1500);
        const before = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state);
        await page.mouse.move(profile.viewport.width / 2, profile.viewport.height / 2);
        await page.mouse.wheel(0, 100);
        await sleep(300);
        const after = await page.evaluate(() => ({
          state: document.querySelector(".rzn-movie").dataset.state,
          label: document.querySelector(".rzn-movie-play").textContent,
        }));
        const y1 = await page.evaluate(() => scrollY);
        await sleep(600);
        const y2 = await page.evaluate(() => scrollY);
        entry.modes.pause = { before, ...after, stillAfterPause: y1 === y2 };
        await page.screenshot({ path: join(out, `${label}-${name}-${path}-paused.png`) });
        // Keyboard: Tab to the play button, Space plays; ArrowDown pauses.
        await page.focus(".rzn-movie-play");
        await page.keyboard.press("Space");
        await sleep(600);
        const keyPlaying = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state);
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("ArrowRight");
        await sleep(200);
        const speedAfterArrow = await page.evaluate(
          () => document.querySelector('.rzn-movie [role="radio"][aria-checked="true"]')?.dataset.speed,
        );
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("ArrowDown");
        await sleep(300);
        const keyPaused = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state);
        entry.modes.keyboard = { keyPlaying, speedAfterArrow, keyPaused };
        const focusShot = await page.$(".rzn-movie");
        await page.focus(".rzn-movie-play");
        await page.keyboard.press("Tab");
        await focusShot?.screenshot({ path: join(out, `${label}-${name}-${path}-focus.png`) });
      }
      entry.errors = errors;
      await context.close();
    }
    if (modes.includes("reduced")) {
      const { context, page, errors } = await open(profile, path, "reduce");
      const geometry = await page.evaluate(runwayTop);
      await page.evaluate((y) => scrollTo(0, y), geometry.top);
      await sleep(1200);
      entry.reduced = await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        const movie = document.querySelector(".rzn-movie");
        return {
          load: runway.dataset.rznLoad,
          state: runway.dataset.rznState ?? null,
          movie: movie ? getComputedStyle(movie).display : "absent",
          movieVisibility: movie ? getComputedStyle(movie).visibility : "absent",
        };
      });
      entry.reducedErrors = errors;
      await page.screenshot({ path: join(out, `${label}-${name}-${path}-reduced.png`) });
      await context.close();
    }
    await writeFile(join(out, `${label}-report.json`), JSON.stringify(report, null, 2));
  }
}
await browser.close();
await writeFile(join(out, `${label}-report.json`), JSON.stringify(report, null, 2));
for (const entry of report) {
  const w = entry.modes.wheel;
  const f = entry.modes.fling;
  console.log(
    `${entry.profile} ${entry.page} live=${entry.live} movie=${entry.movie}` +
      (w
        ? ` wheel: frames=${w.frames} max=${w.maxDelta.toFixed(4)} p50=${w.p50.toFixed(4)} p90=${w.p90.toFixed(4)} jumps=${w.jumps} notch=${w.notch.toFixed(4)}`
        : "") +
      (f ? ` fling: frames=${f.frames} max=${f.maxDelta.toFixed(4)} jumps=${f.jumps}` : "") +
      (entry.modes.pause ? ` pause: ${JSON.stringify(entry.modes.pause)}` : "") +
      (entry.modes.keyboard ? ` keys: ${JSON.stringify(entry.modes.keyboard)}` : "") +
      (entry.reduced ? ` reduced: ${JSON.stringify(entry.reduced)}` : "") +
      (entry.errors?.length ? ` errors: ${entry.errors.join(" | ")}` : ""),
  );
  if (entry.modes.movie) console.log("  movie:", JSON.stringify(entry.modes.movie));
}
