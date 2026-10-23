// Browser QA for the auto transformation movie's reliability (owner,
// 2026-10-23: 「自動変身再生が必ず読み込まれ、正常に動作する様にして。」): on
// /rexonance-saga (.rzn-suitup) and /far-from-saga (#suitup), at a phone and a
// desktop size, every scenario below runs RUNS times in a fresh browser
// context, and each run is recorded pass/fail with the reason.
//
//   direct       direct load → scroll to the runway → 再生 → reaches the end (1×)
//   nav          /final-stage → the site's link (in-site, through the load
//                gate) → 再生 → the end (2×)
//   reload       reload mid-play → the control comes back and plays
//   backforward  in-site back/forward, then a full-document leave and back
//                (bfcache) → the control still plays
//   throttled    slow-3G throughput (CDP Network.emulateNetworkConditions)
//                from the first byte → 再生 queued until ready → it plays
//   chunkfail    the controller's (and FAR FROM's engine's) chunk aborted
//                once → the retry recovers → it plays
//   early        再生 tapped the moment the control shows, before the scene's
//                assets are in → 読み込み中, then it starts by itself
//   speeds       0.5×, 1×, 1.5×, 2×: the measured rate matches the speed
//   seek         the scrubber to 50 % → the page follows; 再生 continues
//                from there; 最初から restarts at 0
//   wheel        a wheel mid-play pauses; the movie never pauses by itself
//   resize       the window resized (and rotated) mid-play → still playing,
//                still pinned, reaches the end
//
// While the movie plays the harness samples the sticky frame (pinned within
// 2 px of its top) and the state (no pause the reader did not ask for).
//
//   PREVIEW_ROOT=<snapshot> PREVIEW_PORT=8591 node scripts/preview-production.mjs
//   BASE_URL=http://127.0.0.1:8591 OUT_DIR=<dir> node scripts/capture-movie-reliability.mjs
//   RUNS=5 PAGES=rexonance-saga,far-from-saga SIZES=390x844,1440x900
//   SCENARIOS=direct,nav,... CONCURRENCY=2 CHROMIUM=/opt/pw-browsers/chromium
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8591");
const out = process.env.OUT_DIR || "/tmp/movie-reliability";
const runs = Number(process.env.RUNS || 5);
const concurrency = Number(process.env.CONCURRENCY || 2);
const pages = (process.env.PAGES || "rexonance-saga,far-from-saga").split(",");
const sizes = (process.env.SIZES || "390x844,1440x900").split(",").map((s) => s.split("x").map(Number));
const ALL = [
  "direct",
  "nav",
  "reload",
  "backforward",
  "throttled",
  "chunkfail",
  "early",
  "speeds",
  "seek",
  "wheel",
  "resize",
  "hidden",
  "switch",
];
const scenarios = (process.env.SCENARIOS || ALL.join(",")).split(",");
const MOVIE_MS = 24000;
// How long a 再生 may wait for the scene (queued while it loads).
const PLAY_WAIT = Number(process.env.PLAY_WAIT || 90000);
// Software WebGL (swiftshader) draws the scene at a few frames a second, so
// clicks wait for a busy main thread, and "advancing" means any real rate.
const CLICK = { force: true, timeout: 20000 };
const ADVANCING = 0.1;
/** How long a whole movie at `speed` may take here. */
const endWithin = (speed) => (MOVIE_MS / speed) * 4 + 30000;
await mkdir(out, { recursive: true });
const logFile = join(out, "runs.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

/* ---------------- in the page ---------------- */
const snapshot = () => {
  const control = document.querySelector(".rzn-movie");
  const runway = document.querySelector(".rzn-suitup");
  if (!control || !runway) return null;
  const frame = runway.querySelector(".rzn-frame");
  const pin = parseFloat(getComputedStyle(frame).top) || 0;
  const travel = runway.offsetHeight - frame.offsetHeight;
  const q = travel > 0 ? (pin - runway.getBoundingClientRect().top) / travel : NaN;
  const style = getComputedStyle(control);
  const mini = control.querySelector(".rzn-movie-mini");
  const pill = mini && getComputedStyle(mini.parentElement).display !== "none";
  const button = pill ? mini : control.querySelector(".rzn-movie-play");
  return {
    state: control.dataset.state,
    load: control.dataset.load ?? null,
    shown: control.dataset.shown === "true",
    visible: style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0.5,
    runwayLoad: runway.dataset.rznLoad ?? null,
    scene: runway.dataset.rznState ?? null,
    q,
    travel,
    frameTop: frame.getBoundingClientRect().top,
    pin,
    pill,
    disabled: Boolean(button?.disabled),
    label: pill ? button.getAttribute("aria-label") : button?.textContent,
    busy: control.getAttribute("aria-busy"),
    scrollY,
  };
};

/* ---------------- steps ---------------- */
class Fail extends Error {}
const must = (ok, message) => {
  if (!ok) throw new Fail(message);
};

async function waitFor(page, predicate, arg, timeout, message) {
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 100 });
  } catch {
    const s = await page.evaluate(snapshot).catch(() => null);
    throw new Fail(`${message} (after ${timeout} ms: ${JSON.stringify(s)})`);
  }
}

const state = (page) => page.evaluate(snapshot);

async function settled(page) {
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading") && document.querySelector(".rzn-suitup .rzn-frame"),
    null,
    { timeout: 120000 },
  );
}

/** Scrolls to the runway's start (the frame pinned, the suit-up at ~0). */
async function toRunway(page, at = 0.004) {
  // The sections above settle their heights as the page scrolls
  // (content-visibility), and a late hash or scroll restoration may move the
  // page: scroll until the frame stays pinned at `at` twice in a row.
  let steady = 0;
  const start = Date.now();
  while (steady < 2) {
    await page.evaluate((q) => {
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      const pin = parseFloat(getComputedStyle(frame).top) || 0;
      const travel = runway.offsetHeight - frame.offsetHeight;
      scrollTo({ top: runway.getBoundingClientRect().top + scrollY - pin + Math.max(0, travel) * q, behavior: "instant" });
    }, at);
    await sleep(400);
    const s = await state(page);
    steady = s && Math.abs(s.frameTop - s.pin) < 2 && Math.abs(s.q - at) < 0.03 ? steady + 1 : 0;
    must(Date.now() - start < 45000, `could not scroll to the runway (${JSON.stringify(s)})`);
  }
}

/** The control is on screen (shown over the pinned frame). */
async function controlShown(page, timeout = 20000) {
  await waitFor(page, () => {
    const c = document.querySelector(".rzn-movie");
    const s = c && getComputedStyle(c);
    return c && c.dataset.shown === "true" && s.visibility === "visible";
  }, null, timeout, "the control never showed over the pinned frame");
}

const playSelector = async (page) =>
  (await page.evaluate(() => {
    const mini = document.querySelector(".rzn-movie-mini");
    return mini && getComputedStyle(mini.parentElement).display !== "none";
  }))
    ? ".rzn-movie-mini"
    : ".rzn-movie-play";

/** A real click on the visible 再生 (force: a disabled or dead button is
 * clicked too, so a tap that does nothing shows as a failure). */
async function pressPlay(page) {
  await page.locator(await playSelector(page)).click(CLICK);
}

async function openSheet(page) {
  const s = await state(page);
  if (!s.pill) return;
  const open = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.open === "true");
  if (!open) await page.locator(".rzn-movie-toggle").click(CLICK);
  await sleep(250);
}

async function chooseSpeed(page, speed) {
  await openSheet(page);
  await page.locator(`.rzn-movie [role="radio"][data-speed="${speed}"]`).click(CLICK);
  await sleep(150);
}

async function restart(page) {
  await openSheet(page);
  await page.locator(".rzn-movie-restart").click(CLICK);
}

/** Waits until the movie plays (a queued 再生 included). */
async function playing(page, timeout, message = "再生 never started the movie") {
  await waitFor(page, () => document.querySelector(".rzn-movie")?.dataset.state === "playing", null, timeout, message);
}

/** Samples the movie while it plays, until it ends (or `until` of progress):
 * the frame stays pinned, the state never leaves playing by itself, the
 * progress only moves forward. */
async function watch(page, { until = 1, timeout, label = "the movie" }) {
  const start = Date.now();
  let last = -1;
  let unpinned = 0;
  for (;;) {
    const s = await state(page);
    must(s, "the control or runway vanished");
    if (s.state === "ended" || s.q >= until - 0.002) {
      if (until >= 1) {
        must(s.state === "ended", `${label}: progress ${s.q.toFixed(3)} but state ${s.state}`);
        must(s.q >= 0.985, `${label} ended at ${s.q.toFixed(3)}, not the runway's end`);
      }
      return { ms: Date.now() - start, unpinned };
    }
    must(s.state === "playing", `${label} left playing by itself (${s.state}) at ${s.q.toFixed(3)}`);
    if (Math.abs(s.frameTop - s.pin) > 2) unpinned += 1;
    must(unpinned < 3, `${label}: the sticky frame came unpinned (top ${s.frameTop} vs ${s.pin})`);
    must(s.q >= last - 0.01, `${label} ran backwards ${last.toFixed(3)} → ${s.q.toFixed(3)}`);
    last = s.q;
    must(Date.now() - start < timeout, `${label} did not reach ${until} within ${timeout} ms (at ${s.q.toFixed(3)})`);
    await sleep(200);
  }
}

/** The progress moves forward at about the rate a speed asks. */
/** The movie plays on and the page moves with it: the suit-up's progress
 * gains `by` while the state stays playing (the first live frames of a
 * scene just made ready are slow under software WebGL, so this waits for
 * the progress rather than timing a window). */
async function advances(page, label, by = 0.06, timeout = 60000) {
  const from = (await state(page)).q;
  const start = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.q >= Math.min(from + by, 0.999) || s.state === "ended") return;
    must(s.state === "playing", `${label}: the movie left playing by itself (${s.state}) at ${s.q.toFixed(3)}`);
    must(Date.now() - start < timeout, `${label}: the movie does not advance (${from.toFixed(3)} → ${s.q.toFixed(3)} in ${timeout} ms)`);
    await sleep(250);
  }
}

async function rate(page, ms = 2500) {
  const a = await state(page);
  const t0 = Date.now();
  await sleep(ms);
  const b = await state(page);
  return ((b.q - a.q) * MOVIE_MS) / (Date.now() - t0);
}

async function arriveDirect(page, path) {
  await page.goto(`${base}/${path}`, { waitUntil: "load", timeout: 180000 });
  await settled(page);
}

async function arriveInSite(page, path) {
  await page.goto(`${base}/final-stage`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"), null, { timeout: 120000 });
  await sleep(800);
  const link = page.locator(`a[href^="/${path}"]`).first();
  await link.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
  await page.evaluate((p) => document.querySelector(`a[href^="/${p}"]`).click(), path);
  await page.waitForURL(`**/${path}**`, { timeout: 60000 });
  await settled(page);
}

/* ---------------- the scenarios ---------------- */
const SCENARIOS = {
  async direct(page, { path, shot }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await page.screenshot({ path: shot("playing") });
    await watch(page, { timeout: endWithin(1) });
  },
  async nav(page, { path }) {
    await arriveInSite(page, path);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await watch(page, { timeout: endWithin(2) });
  },
  async reload(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await sleep(2500);
    await page.reload({ waitUntil: "load", timeout: 180000 });
    await settled(page);
    await sleep(600);
    const s = await state(page);
    if (!(s.q > 0 && s.q < 1)) await toRunway(page, 0.2);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await advances(page, `after the reload`);
  },
  async backforward(page, { path }) {
    await arriveInSite(page, path);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await sleep(1500);
    // In-site back (to /final-stage) and forward (to the site again).
    await page.goBack({ timeout: 60000 });
    await page.waitForURL("**/final-stage**", { timeout: 60000 });
    await sleep(1500);
    await page.goForward({ timeout: 60000 });
    await page.waitForURL(`**/${path}**`, { timeout: 60000 });
    await settled(page);
    await toRunway(page, 0.1);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, "after in-site back/forward 再生 never played");
    await advances(page, `after in-site back/forward`);
    // A full-document leave and back (the back/forward cache).
    await page.goto(`${base}/library`, { waitUntil: "load", timeout: 180000 });
    await sleep(1200);
    await page.goBack({ timeout: 60000 });
    await page.waitForURL(`**/${path}**`, { timeout: 60000 });
    await settled(page);
    await sleep(800);
    const restored = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.type);
    await toRunway(page, 0.3);
    await controlShown(page);
    const s = await state(page);
    if (s.state === "playing") await page.mouse.wheel(0, 1);
    await sleep(300);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, `after leaving and coming back (${restored}) 再生 never played`);
    await advances(page, `after leaving and coming back`);
  },
  async throttled(page, { path, cdp }) {
    // Slow 3G's throughput (400 kbit/s down) with a 400 ms round trip: the
    // DevTools preset's 2000 ms reads as effectiveType 2g, which the site
    // treats as Save-Data (the still tier; see "constrained" below).
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page, 30000);
    await pressPlay(page);
    const s = await state(page);
    must(s.state === "playing" || s.state === "loading", `a throttled 再生 did nothing (state ${s.state})`);
    await playing(page, 300000, "a throttled 再生 never started");
    await advances(page, `throttled:`);
  },
  async chunkfail(page, { path, context }) {
    const failed = new Set();
    const once = (pattern) =>
      context.route(pattern, (route) => {
        if (failed.has(pattern)) return route.continue();
        failed.add(pattern);
        return route.abort("failed");
      });
    await once("**/assets/assembly-movie-*.js");
    if (path === "far-from-saga") await once("**/assets/far-from-assembly-engine-*.js");
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page, 30000);
    await pressPlay(page);
    await playing(page, PLAY_WAIT + 30000, "after a failed chunk 再生 never played");
    must(failed.size >= 1, "no chunk was aborted (pattern mismatch)");
    await advances(page, `after a failed chunk`);
  },
  async early(page, { path }) {
    await page.goto(`${base}/${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await settled(page);
    await toRunway(page);
    await controlShown(page);
    const before = await state(page);
    await pressPlay(page);
    await sleep(200);
    const after = await state(page);
    must(
      after.state === "playing" || after.state === "loading",
      `an early 再生 was ignored (scene ${before.runwayLoad}, disabled ${before.disabled}, state ${after.state})`,
    );
    await playing(page, PLAY_WAIT + 30000, "an early 再生 never started once ready");
    await advances(page, `early:`);
    return { arrivedAt: before.runwayLoad };
  },
  async speeds(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    // Each speed's rate, against 1×'s measured the same way (the software
    // renderer's frame rate is the same for all four): 0.5×, 1.5× and 2×
    // within 25 % of their share of 1×.
    const rates = {};
    for (const speed of [1, 0.5, 1.5, 2]) {
      await chooseSpeed(page, speed);
      await restart(page);
      await playing(page, PLAY_WAIT);
      await sleep(400);
      const r = await rate(page, 3500);
      rates[speed] = Number(r.toFixed(3));
      must(r > ADVANCING, `${speed}×: the movie does not advance (${r.toFixed(2)})`);
      if (speed !== 1) {
        const ratio = r / rates[1];
        must(Math.abs(ratio - speed) / speed < 0.25, `${speed}×: measured ${ratio.toFixed(2)}× of 1×`);
      }
    }
    // Pause and resume.
    await pressPlay(page);
    await sleep(300);
    let s = await state(page);
    must(s.state === "paused", `一時停止 left the state ${s.state}`);
    const held = s.q;
    await sleep(800);
    s = await state(page);
    must(Math.abs(s.q - held) < 0.002, "a paused movie still moved");
    await pressPlay(page);
    await playing(page, 5000);
    await advances(page, "resumed");
    return { rates };
  },
  async seek(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await sleep(500);
    await openSheet(page);
    await page.locator(".rzn-movie-seek input").fill("100");
    await sleep(300);
    let s = await state(page);
    must(Math.abs(s.q - 0.5) < 0.02, `seek to 50 % put the page at ${s.q.toFixed(3)}`);
    must(s.state === "playing" || s.state === "paused", `seek left the state ${s.state}`);
    if (s.state !== "playing") {
      await pressPlay(page);
      await playing(page, 5000);
    }
    await sleep(1200);
    s = await state(page);
    must(s.q > 0.5 && s.q < 0.6, `after the seek the movie stands at ${s.q.toFixed(3)}`);
    await restart(page);
    await sleep(300);
    s = await state(page);
    must(s.state === "playing" && s.q < 0.03, `最初から: ${s.state} at ${s.q.toFixed(3)}`);
    // The end state: seek to the end, the control reads ended; 再生 replays from 0.
    await openSheet(page);
    await page.locator(".rzn-movie-seek input").fill("200");
    await sleep(500);
    s = await state(page);
    must(s.q > 0.98, `seek to the end: ${s.q.toFixed(3)}`);
    await chooseSpeed(page, 2);
    await page.mouse.wheel(0, 1).catch(() => {});
    await sleep(300);
    await pressPlay(page);
    await playing(page, 5000);
    await sleep(400);
    s = await state(page);
    must(s.q < 0.2, `再生 at the end did not replay from the start (${s.q.toFixed(3)})`);
  },
  async wheel(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    // No pause by itself for 4 s (the watch fails on any state change).
    await watch(page, { until: 0.3, timeout: 60000, label: "before the wheel" });
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 240);
    await sleep(400);
    const s = await state(page);
    must(s.state === "paused", `a wheel mid-play left the state ${s.state}`);
    const held = s.q;
    await sleep(800);
    const t = await state(page);
    must(Math.abs(t.q - held) < 0.02, "after the wheel the movie kept scrolling the page");
    await pressPlay(page);
    await playing(page, 5000, "再生 after a wheel pause did not resume");
    await watch(page, { timeout: endWithin(2), label: "after the wheel" });
  },
  async resize(page, { path, size }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await watch(page, { until: 0.2, timeout: 60000, label: "before the resize" });
    const [w, h] = size;
    // Phone: rotate; desktop: a smaller window.
    await page.setViewportSize(w < 700 ? { width: h, height: w } : { width: 1280, height: 760 });
    await sleep(900);
    await watch(page, { until: 0.45, timeout: 60000, label: "after the resize" });
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    await watch(page, { timeout: endWithin(2), label: "after resizing back" });
  },
  async hidden(page, { path, context }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await watch(page, { until: 0.15, timeout: 60000, label: "before the tab switch" });
    // Another tab in front: this one is hidden (its frames throttled).
    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    await sleep(1500);
    const away = await page.evaluate(() => ({
      hidden: document.hidden,
      state: document.querySelector(".rzn-movie").dataset.state,
    }));
    if (away.hidden) must(away.state === "paused", `a hidden tab left the movie ${away.state}`);
    await page.bringToFront();
    await other.close();
    await sleep(800);
    await playing(page, 10000, "the movie did not resume when the tab came back");
    await watch(page, { timeout: endWithin(2), label: "after the tab came back" });
    return { hiddenReported: away.hidden };
  },
  async switch(page, { path }) {
    // The other site first, its movie playing; then this site through the
    // other's own link (in-site, through the load gate).
    const from = path === "rexonance-saga" ? "far-from-saga" : "rexonance-saga";
    await arriveInSite(page, from);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, `on /${from} 再生 never played`);
    await sleep(1200);
    await page.evaluate((p) => document.querySelector(`a[href="/${p}#top"]`).click(), path);
    await page.waitForURL(`**/${path}**`, { timeout: 60000 });
    await settled(page);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, `after switching from /${from} 再生 never played`);
    await watch(page, { timeout: endWithin(2), label: `after switching from /${from}` });
    // One control on the page, one controller (a stale one would double the rate).
    const controls = await page.evaluate(() => document.querySelectorAll(".rzn-movie").length);
    must(controls === 1, `${controls} controls on the page`);
  },
};

/* ---------------- the runner ---------------- */
const tasks = [];
for (let run = 1; run <= runs; run += 1)
  for (const scenario of scenarios)
    for (const path of pages) for (const size of sizes) tasks.push({ run, scenario, path, size });

const results = [];
async function runTask({ run, scenario, path, size }) {
  const [width, height] = size;
  const touch = width < 700;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: touch,
    hasTouch: touch,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tag = `${scenario}-${path}-${width}x${height}-r${run}`;
  const local = { shot: (name) => join(out, `${tag}-${name}.png`) };
  const started = Date.now();
  let result;
  try {
    const shot = run === 1 ? local.shot : () => join(out, "tmp-ignore.png");
    const detail = await SCENARIOS[scenario](page, { path, size, cdp, context, shot });
    if (run === 1) await page.screenshot({ path: local.shot("end") }).catch(() => {});
    result = { pass: true, detail };
  } catch (error) {
    await page.screenshot({ path: local.shot("FAIL") }).catch(() => {});
    result = { pass: false, reason: error instanceof Fail ? error.message : String(error?.stack || error) };
  }
  const record = {
    run,
    scenario,
    page: path,
    size: `${width}x${height}`,
    ms: Date.now() - started,
    ...result,
    errors: errors.slice(0, 5),
  };
  results.push(record);
  await appendFile(logFile, `${JSON.stringify(record)}\n`);
  console.log(`${record.pass ? "PASS" : "FAIL"} ${tag} ${record.ms}ms ${record.reason ?? ""}`);
  await context.close().catch(() => {});
}

await writeFile(logFile, "");
const queue = [...tasks];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) await runTask(queue.shift());
  }),
);
await browser.close();

/* ---------------- the table ---------------- */
const rows = new Map();
for (const r of results) {
  const key = `${r.scenario} | ${r.page} | ${r.size}`;
  const row = rows.get(key) ?? { pass: 0, total: 0, reasons: new Set() };
  row.total += 1;
  if (r.pass) row.pass += 1;
  else row.reasons.add(r.reason.slice(0, 160));
  rows.set(key, row);
}
const lines = ["scenario | page | size | pass/total | first failure", "--- | --- | --- | --- | ---"];
for (const [key, row] of [...rows].sort()) lines.push(`${key} | ${row.pass}/${row.total} | ${[...row.reasons][0] ?? ""}`);
const passed = results.filter((r) => r.pass).length;
lines.push("", `TOTAL ${passed}/${results.length}`);
await writeFile(join(out, "summary.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
process.exitCode = passed === results.length ? 0 : 1;
