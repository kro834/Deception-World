// Browser QA for the auto transformation movie's reliability (owner,
// 2026-10-23: 「自動変身再生が必ず読み込まれ、正常に動作する様にして。」): on
// /rexonance-saga (.rzn-suitup) and /far-from-saga (#suitup), at a phone and a
// desktop size, every scenario below runs RUNS times, each run in its own
// browser (a crash or a hang costs that run only), and each run is recorded
// pass/fail with the reason.
//
//   direct       direct load → scroll to the runway → 再生 → reaches the end (1×)
//   nav-home     / → skip the opening → ENTER THE WORLD → the menu's link
//                (in-site, through the load gate) → 再生 → the end (2×)
//   nav-stage    /final-stage → the site's link (in-site) → 再生 → the end (2×)
//   reload       reload mid-play → the control comes back and plays
//   backforward  in-site back/forward, then a full-document leave and back
//                (bfcache) → the control still plays
//   throttled    slow-3G throughput (400 kbit/s, CDP) from the first byte →
//                再生 (queued until ready) → it plays
//   chunkfail    the controller's chunk and the engine's chunk aborted once →
//                the retries recover → it plays
//   early        再生 tapped the moment the control shows, before the scene's
//                assets are in → 読み込み中, then it starts by itself
//   speeds       0.5×, 1×, 1.5×, 2×: over each window the page moves as far as
//                the speed asks for the frames drawn (the playhead's own
//                clock), and the wall-clock rates are reported
//   seek         the scrubber to 50 % → the page follows; the movie continues
//                from there; 最初から restarts at 0; at the end 再生 replays
//   wheel        a wheel mid-play pauses (and a touch drag on phones); 再生
//                resumes; the movie never pauses by itself
//   resize       the window resized (a phone rotated) mid-play → still playing,
//                still pinned, reaches the end
//   hidden       another tab in front mid-play → held, resumed when back
//   switch       the other site's movie first, then this site's (in-site)
//   stilltier    the DevTools Slow 3G preset (2 s round trip: effectiveType
//                2g, the site's still tier) → no control on screen, none dead
//   depfail      a chunk the engine's chunk imports aborted once: it stays
//                failed for the document (no query on the importer's URL
//                reaches it), the retries run out → 再読み込み → a press
//                reloads the page, at the same place → it plays
//
// While the movie plays the harness samples the sticky frame (pinned within
// 2 px of its top) and the state (no pause the reader did not ask for). The
// progress is read from the page itself (the runway's scroll position),
// never from pictures: software WebGL draws a few frames a second here.
//
//   PREVIEW_ROOT=<snapshot> PREVIEW_PORT=8591 node scripts/preview-production.mjs
//   BASE_URL=http://127.0.0.1:8591 OUT_DIR=<dir> node scripts/capture-movie-reliability.mjs
//   RUNS=5 RUN_FROM=1 PAGES=rexonance-saga,far-from-saga SIZES=390x844,1440x900
//   SCENARIOS=direct,nav-home,... CONCURRENCY=2 CHROMIUM=/opt/pw-browsers/chromium
//   TASK_MS=300000 (one run's hard limit)  BUDGET_MS=0 (stop starting runs after)
//   RESUME=1 (skip runs already in OUT_DIR/runs.jsonl; the log is append-only)
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8591");
const out = process.env.OUT_DIR || "/tmp/movie-reliability";
const runs = Number(process.env.RUNS || 5);
const runFrom = Number(process.env.RUN_FROM || 1);
const concurrency = Number(process.env.CONCURRENCY || 2);
const taskMs = Number(process.env.TASK_MS || 420000);
const budgetMs = Number(process.env.BUDGET_MS || 0);
const resume = process.env.RESUME === "1";
const pages = (process.env.PAGES || "rexonance-saga,far-from-saga").split(",");
const sizes = (process.env.SIZES || "390x844,1440x900").split(",").map((s) => s.split("x").map(Number));
const ALL = [
  "direct",
  "nav-home",
  "nav-stage",
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
  "stilltier",
  "depfail",
];
const scenarios = (process.env.SCENARIOS || ALL.join(",")).split(",");
const MOVIE_MS = 24000;
// The movie's longest step a frame (assembly-movie.ts MOVIE_MAX_STEP_MS).
const MAX_STEP_MS = 1000;
// How long a 再生 may wait for the scene (queued while it loads).
const PLAY_WAIT = Number(process.env.PLAY_WAIT || 90000);
// Software WebGL (swiftshader) draws the scene at a few frames a second, so
// clicks wait for a busy main thread.
const CLICK = { force: true, timeout: 45000 };
/** How long a whole movie at `speed` may take here. */
const endWithin = (speed) => (MOVIE_MS / speed) * 8 + 60000;
await mkdir(out, { recursive: true });
const logFile = join(out, "runs.jsonl");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s`;

// A stray rejection (a page closed under a pending call) never ends the run.
process.on("unhandledRejection", (error) => {
  console.warn(`${stamp()} unhandled rejection: ${String(error?.message || error).slice(0, 200)}`);
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
  const pill = Boolean(mini && getComputedStyle(mini.parentElement).display !== "none");
  const button = pill ? mini : control.querySelector(".rzn-movie-play");
  return {
    state: control.dataset.state,
    load: control.dataset.load ?? null,
    tier: control.dataset.tier ?? null,
    shown: control.dataset.shown === "true",
    visible: style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0.5,
    display: style.display,
    runwayLoad: runway.dataset.rznLoad ?? null,
    scene: runway.dataset.rznState ?? null,
    q,
    travel,
    frameTop: frame.getBoundingClientRect().top,
    pin,
    pill,
    disabled: Boolean(button?.disabled),
    label: pill ? button?.getAttribute("aria-label") : button?.textContent,
    busy: control.getAttribute("aria-busy"),
    scrollY,
    url: location.pathname,
    // The movie's own clock (the pill's ring, set every frame it plays).
    p: (Number.parseFloat(control.style.getPropertyValue("--rzn-movie-p")) || 0) / 100,
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
    { timeout: 150000 },
  );
}

/** Scrolls to the runway's start (the frame pinned, the suit-up at `at`). */
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
    must(Date.now() - start < 60000, `could not scroll to the runway (${JSON.stringify(s)})`);
  }
}

/** The control is on screen (shown over the pinned frame). */
async function controlShown(page, timeout = 30000) {
  await waitFor(
    page,
    () => {
      const c = document.querySelector(".rzn-movie");
      const s = c && getComputedStyle(c);
      return c && c.dataset.shown === "true" && s.visibility === "visible" && s.display !== "none";
    },
    null,
    timeout,
    "the control never showed over the pinned frame",
  );
}

const playSelector = async (page) =>
  (await page.evaluate(() => {
    const mini = document.querySelector(".rzn-movie-mini");
    return Boolean(mini && getComputedStyle(mini.parentElement).display !== "none");
  }))
    ? ".rzn-movie-mini"
    : ".rzn-movie-play";

/** A real press (a tap on phones, a click elsewhere) on what a reader sees:
 * force, so a disabled or dead control is pressed too, and a press that does
 * nothing shows as a failure. */
async function press(page, selector) {
  const locator = page.locator(selector).first();
  // A control another layer covers is a dead one: the press must land on it.
  const covered = await locator
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return !top || top === element || element.contains(top) ? null : `${top.tagName}.${String(top.className).slice(0, 48)}`;
    })
    .catch(() => null);
  must(!covered, `${selector} is covered by ${covered}`);
  if (page.__touch) await locator.tap(CLICK);
  else await locator.click(CLICK);
}

async function pressPlay(page) {
  await press(page, await playSelector(page));
}

/* Software WebGL holds the main thread for whole seconds a frame here, so
   an input's effect is waited for (up to REACT_MS), never assumed after a
   fixed pause. */
const REACT_MS = 20000;

async function openSheet(page) {
  const s = await state(page);
  if (!s.pill) return;
  const isOpen = () =>
    page.evaluate(() => {
      const control = document.querySelector(".rzn-movie");
      const sheet = control.querySelector(".rzn-movie-sheet");
      return control.dataset.open === "true" && getComputedStyle(sheet).display !== "none";
    });
  if (await isOpen()) return;
  await press(page, ".rzn-movie-toggle");
  await waitFor(
    page,
    () => {
      const control = document.querySelector(".rzn-movie");
      return control.dataset.open === "true" && getComputedStyle(control.querySelector(".rzn-movie-sheet")).display !== "none";
    },
    null,
    REACT_MS,
    "the speed button did not open the sheet",
  );
}

async function chooseSpeed(page, speed) {
  await openSheet(page);
  await press(page, `.rzn-movie [role="radio"][data-speed="${speed}"]`);
  await waitFor(
    page,
    (v) => document.querySelector(`.rzn-movie [role="radio"][data-speed="${v}"]`)?.getAttribute("aria-checked") === "true",
    speed,
    REACT_MS,
    `the ${speed}× radio did not take`,
  );
}

/** 最初から: the movie plays again from the runway's start. */
async function restart(page) {
  await openSheet(page);
  await press(page, ".rzn-movie-restart");
  await waitFor(
    page,
    () => {
      const control = document.querySelector(".rzn-movie");
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      const pin = parseFloat(getComputedStyle(frame).top) || 0;
      const q = (pin - runway.getBoundingClientRect().top) / (runway.offsetHeight - frame.offsetHeight);
      return (control.dataset.state === "playing" || control.dataset.state === "loading") && q < 0.03;
    },
    null,
    REACT_MS,
    "最初から did not restart the movie",
  );
}

/** The state reads `want` (after an input the main thread may take a while). */
async function stateIs(page, want, message) {
  await waitFor(page, (w) => document.querySelector(".rzn-movie")?.dataset.state === w, want, REACT_MS, message);
}

/** Waits until the movie plays (a queued 再生 included). */
async function playing(page, timeout, message = "再生 never started the movie") {
  await waitFor(page, () => document.querySelector(".rzn-movie")?.dataset.state === "playing", null, timeout, message);
}

/** Samples the movie while it plays, until it ends (or `until` of its
 * progress). The movie's own clock (p) only moves forward and never stalls;
 * the state never leaves playing by itself; the page follows the clock (the
 * frame pinned, the runway's progress q at p). A layout change — a resize, a
 * section above settling — moves the runway under the page until the
 * movie's next frame puts the page back: one frame on a phone, seconds of
 * software WebGL here, so a sample between the two is a lag, and only a lag
 * that lasts is a failure. */
const LAG_MS = 12000;
const STALL_MS = 45000;
async function watch(page, { until = 1, timeout, label = "the movie" }) {
  const start = Date.now();
  let lastP = -1;
  let movedAt = Date.now();
  let lags = 0;
  let lagSince = 0;
  for (;;) {
    const s = await state(page);
    must(s, "the control or runway vanished");
    const pinned = Math.abs(s.frameTop - s.pin) <= 2;
    const follows = pinned && Math.abs(s.q - s.p) <= 0.02;
    const reached = s.state === "ended" || (until < 1 && s.p >= until - 0.002);
    if (reached && follows) {
      if (until >= 1) must(s.q >= 0.985, `${label} ended at ${s.q.toFixed(3)}, not the runway's end`);
      return { ms: Date.now() - start, lags };
    }
    must(
      s.state === "playing" || s.state === "ended",
      `${label} left playing by itself (${s.state}) at ${s.p.toFixed(3)}`,
    );
    must(s.p >= lastP - 0.0015, `${label} ran backwards ${lastP.toFixed(3)} → ${s.p.toFixed(3)}`);
    if (s.p > lastP + 0.0005) movedAt = Date.now();
    lastP = Math.max(lastP, s.p);
    must(Date.now() - movedAt < STALL_MS, `${label} stalled at ${s.p.toFixed(3)} for ${STALL_MS} ms`);
    if (!follows) {
      lags += 1;
      lagSince ||= Date.now();
      must(
        Date.now() - lagSince < LAG_MS,
        `${label}: the page stayed away from the movie (q ${s.q.toFixed(3)} vs p ${s.p.toFixed(3)}, frame top ${s.frameTop} vs ${s.pin})`,
      );
    } else lagSince = 0;
    must(Date.now() - start < timeout, `${label} did not reach ${until} within ${timeout} ms (at ${s.p.toFixed(3)})`);
    await sleep(200);
  }
}

/** The movie plays on, pinned, after a layout change. */
async function pinnedAgain(page, label) {
  await waitFor(
    page,
    () => {
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      const pin = parseFloat(getComputedStyle(frame).top) || 0;
      return Math.abs(frame.getBoundingClientRect().top - pin) <= 2;
    },
    null,
    REACT_MS,
    `${label}: the frame did not pin again`,
  );
}

/** The movie plays on and the page moves with it: the suit-up's progress
 * gains `by` while the state stays playing (the first live frames of a
 * scene just made ready are slow under software WebGL, so this waits for
 * the progress rather than timing a window). */
async function advances(page, label, by = 0.06, timeout = 60000) {
  const from = (await state(page)).p;
  const start = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.p >= Math.min(from + by, 0.999) || s.state === "ended") break;
    must(s.state === "playing", `${label}: the movie left playing by itself (${s.state}) at ${s.p.toFixed(3)}`);
    must(
      Date.now() - start < timeout,
      `${label}: the movie does not advance (${from.toFixed(3)} → ${s.p.toFixed(3)} in ${timeout} ms)`,
    );
    await sleep(250);
  }
  // …and the page goes with it.
  await waitFor(
    page,
    () => {
      const control = document.querySelector(".rzn-movie");
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      const pin = parseFloat(getComputedStyle(frame).top) || 0;
      const q = (pin - runway.getBoundingClientRect().top) / (runway.offsetHeight - frame.offsetHeight);
      const p = (Number.parseFloat(control.style.getPropertyValue("--rzn-movie-p")) || 0) / 100;
      return Math.abs(frame.getBoundingClientRect().top - pin) <= 2 && Math.abs(q - p) <= 0.02;
    },
    null,
    LAG_MS,
    `${label}: the page does not follow the movie`,
  );
}

/* The playhead's own clock: the movie scrolls the page once a frame, from
   its animation frame. The page's requestAnimationFrame and scrollTo are
   wrapped to record each of those scrolls with its frame's time, so a
   speed's rate is checked against the frames actually drawn (the movie
   advances min(dt, 1 s) × speed a frame), never against a software
   renderer's frame rate; the wall-clock rate is reported beside it. */
async function hookFrames(page) {
  await page.evaluate(() => {
    if (window.__movieScrolls) return;
    const scrolls = [];
    window.__movieScrolls = scrolls;
    let frameTime = null;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback) {
      return raf.call(window, (t) => {
        frameTime = t;
        try {
          callback(t);
        } finally {
          frameTime = null;
        }
      });
    };
    const scrollTo = window.scrollTo;
    window.scrollTo = function (...args) {
      if (frameTime !== null) {
        const top = args.length === 1 && typeof args[0] === "object" ? args[0]?.top : args[1];
        const runway = document.querySelector(".rzn-suitup");
        const frame = runway?.querySelector(".rzn-frame");
        scrolls.push([frameTime, top, runway ? runway.offsetHeight - frame.offsetHeight : 0]);
        if (scrolls.length > 20000) scrolls.splice(0, 10000);
      }
      return scrollTo.apply(this, args);
    };
  });
}
const pageNow = (page) => page.evaluate(() => performance.now());
const scrollsSince = (page, since) => page.evaluate((from) => (window.__movieScrolls || []).filter(([t]) => t >= from), since);

/** Over a window of the movie's frames at `speed`: how far the page moved
 * against how far the speed asks for those frames, and the wall-clock rate
 * (1 = real time at 1×). */
function measureWindow(scrolls, speed) {
  if (scrolls.length < 3) return { frames: scrolls.length };
  let moved = 0;
  let expected = 0;
  for (let k = 1; k < scrolls.length; k += 1) {
    const [t, y, travel] = scrolls[k];
    const [t0, y0] = scrolls[k - 1];
    if (!(travel > 0) || t <= t0) continue;
    moved += (y - y0) / travel;
    expected += (Math.min(MAX_STEP_MS, t - t0) * speed) / MOVIE_MS;
  }
  const span = scrolls[scrolls.length - 1][0] - scrolls[0][0];
  return {
    frames: scrolls.length,
    moved: Number(moved.toFixed(4)),
    expected: Number(expected.toFixed(4)),
    ratio: expected > 0 ? Number((moved / expected).toFixed(3)) : null,
    wall: span > 0 ? Number(((moved * MOVIE_MS) / span).toFixed(3)) : null,
  };
}

/** Paused by the reader: the movie scrolls the page no more (the reader's
 * own scroll — a smooth wheel, a fling — may still be finishing). */
async function heldStill(page, label) {
  const from = await pageNow(page);
  await sleep(2500);
  const s = await state(page);
  must(s.state === "paused", `${label} the state turned ${s.state}`);
  const scrolls = await scrollsSince(page, from);
  must(scrolls.length === 0, `${label} the movie kept scrolling the page (${scrolls.length} frames)`);
}

async function arriveDirect(page, path, waitUntil = "load") {
  await page.goto(`${base}/${path}`, { waitUntil, timeout: 180000 });
  await settled(page);
}

async function followLink(page, path) {
  // A reader's press on the link (the router's in-site navigation, through
  // the load gate).
  const link = page.locator(`a[href^="/${path}"]`).first();
  const visible = await link.isVisible().catch(() => false);
  if (visible) await link.click({ force: true, timeout: 45000 });
  else await page.evaluate((p) => document.querySelector(`a[href^="/${p}"]`).click(), path);
  await page.waitForURL(`**/${path}**`, { timeout: 120000, waitUntil: "commit" });
  await settled(page);
}

async function arriveFromStage(page, path) {
  await page.goto(`${base}/final-stage`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"), null, { timeout: 150000 });
  await sleep(800);
  await page
    .locator(`a[href^="/${path}"]`)
    .first()
    .scrollIntoViewIfNeeded({ timeout: 10000 })
    .catch(() => {});
  await followLink(page, path);
}

/** / → the opening skipped → ENTER THE WORLD (/world) → the menu → the site. */
async function arriveFromHome(page, path) {
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"), null, { timeout: 150000 });
  const start = Date.now();
  // The opening: skipped (Escape, or its スキップ), then ENTER THE WORLD.
  while (!(await page.evaluate(() => location.pathname === "/world"))) {
    must(Date.now() - start < 90000, "could not enter the world from /");
    await page.keyboard.press("Escape").catch(() => {});
    const enter = page.locator(".cine-btn-primary").first();
    if (await enter.isVisible().catch(() => false)) await enter.click({ force: true, timeout: 10000 }).catch(() => {});
    else {
      const skip = page.locator(".cine-skip").first();
      if (await skip.isVisible().catch(() => false)) await skip.click({ force: true, timeout: 10000 }).catch(() => {});
    }
    await sleep(1500);
  }
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"), null, { timeout: 150000 });
  await sleep(800);
  // The menu open (a busy main thread may take its time), its link on screen.
  const trigger = page.locator(".side-panel-trigger").first();
  const link = page.locator(`.side-panel-links a[href^="/${path}"]`).first();
  for (let k = 0; k < 3 && !(await link.isVisible().catch(() => false)); k += 1) {
    await trigger.click({ force: true, timeout: 45000 }).catch(() => {});
    await link.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  }
  must(await link.isVisible().catch(() => false), "the menu did not open on /world");
  // (The panel slides in: wait until the link stands inside the window.)
  await link
    .evaluate(
      (element) =>
        new Promise((resolve) => {
          const started = performance.now();
          const check = () => {
            const box = element.getBoundingClientRect();
            const inside = box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
            if (inside || performance.now() - started > 20000) resolve(inside);
            else setTimeout(check, 100);
          };
          check();
        }),
    )
    .catch(() => false);
  await sleep(400);
  await link.click({ force: true, timeout: 45000 });
  await page.waitForURL(`**/${path}**`, { timeout: 120000, waitUntil: "commit" });
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
    await page.screenshot({ path: shot("playing"), timeout: 15000 }).catch(() => {});
    await watch(page, { timeout: endWithin(1) });
  },
  async "nav-home"(page, { path }) {
    await arriveFromHome(page, path);
    await toRunway(page);
    await controlShown(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await watch(page, { timeout: endWithin(2) });
  },
  async "nav-stage"(page, { path }) {
    await arriveFromStage(page, path);
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
    await advances(page, "before the reload", 0.04);
    await page.reload({ waitUntil: "load", timeout: 180000 });
    await settled(page);
    await sleep(600);
    const s = await state(page);
    if (!(s.q > 0 && s.q < 1 && Math.abs(s.frameTop - s.pin) < 2)) await toRunway(page, 0.2);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, "after the reload 再生 never played");
    await advances(page, "after the reload");
    return { restoredAt: Number(s.q.toFixed(3)) };
  },
  async backforward(page, { path }) {
    await arriveFromStage(page, path);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    await sleep(1500);
    // In-site back (to /final-stage) and forward (to the site again).
    await page.goBack({ timeout: 90000 });
    await page.waitForURL("**/final-stage**", { timeout: 90000 });
    await sleep(1500);
    await page.goForward({ timeout: 90000 });
    await page.waitForURL(`**/${path}**`, { timeout: 90000 });
    await settled(page);
    await toRunway(page, 0.1);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, "after in-site back/forward 再生 never played");
    await advances(page, `after in-site back/forward`);
    // A full-document leave and back (the back/forward cache).
    await page.goto(`${base}/library`, { waitUntil: "load", timeout: 180000 });
    await sleep(1200);
    await page.goBack({ timeout: 90000 });
    await page.waitForURL(`**/${path}**`, { timeout: 90000 });
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
    return { restored };
  },
  async throttled(page, { path, cdp }) {
    // Slow 3G's throughput (400 kbit/s down) with a 400 ms round trip: the
    // DevTools preset's 2000 ms reads as effectiveType 2g, which the site
    // treats as Save-Data (the still tier; see "stilltier").
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page, 60000);
    const before = await state(page);
    await pressPlay(page);
    await waitFor(
      page,
      () => ["playing", "loading"].includes(document.querySelector(".rzn-movie")?.dataset.state),
      null,
      REACT_MS,
      `a throttled 再生 did nothing (scene ${before.runwayLoad})`,
    );
    const s = await state(page);
    if (s.state === "loading") must(s.busy === "true" && /読み込み中/.test(s.label ?? ""), `loading but labelled ${s.label}`);
    await playing(page, 240000, "a throttled 再生 never started");
    await advances(page, `throttled:`);
    return { pressedAt: before.runwayLoad };
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
    else await once("**/assets/rexonance-assembly-nanites-*.js");
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page, 60000);
    await pressPlay(page);
    await playing(page, PLAY_WAIT + 30000, "after a failed chunk 再生 never played");
    must(failed.size === 2, `aborted ${[...failed].join(", ") || "nothing"} (pattern mismatch)`);
    await advances(page, `after a failed chunk`);
    return { aborted: failed.size };
  },
  async depfail(page, { path, context }) {
    // A dependency of the engine's chunk (FAR FROM: the engine itself, under
    // far-from-assembly-engine; Rexonance: the field, under the swarm's chunk).
    const pattern = path === "far-from-saga" ? "**/assets/rexonance-resonance-*.js" : "**/assets/rexonance-field-*.js";
    let aborted = 0;
    await context.route(pattern, (route) => {
      if (aborted) return route.continue();
      aborted += 1;
      return route.abort("failed");
    });
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page, 60000);
    await pressPlay(page);
    must(aborted === 1, `nothing was aborted (${pattern})`);
    await waitFor(
      page,
      () => {
        const control = document.querySelector(".rzn-movie");
        return control.dataset.state === "error" || control.dataset.state === "playing";
      },
      null,
      240000,
      "with a dependency failed for the document the movie neither played nor offered 再読み込み",
    );
    let s = await state(page);
    if (s.state === "playing") {
      // (Already loaded before the abort could matter: nothing to recover.)
      await advances(page, "depfail (nothing failed)");
      return { recovered: "in-page" };
    }
    must(/再読み込み/.test(s.label ?? ""), `the error state reads ${s.label}`);
    const before = s.q;
    await Promise.all([page.waitForNavigation({ timeout: 120000 }), pressPlay(page)]);
    await settled(page);
    await sleep(800);
    s = await state(page);
    const kept = Math.abs(s.q - before) < 0.05 && Math.abs(s.frameTop - s.pin) <= 2;
    if (!kept) await toRunway(page, Math.max(0.004, Math.min(0.9, before)));
    await controlShown(page, 60000);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, "after 再読み込み 再生 never played");
    await advances(page, "after 再読み込み");
    return { recovered: "reload", positionKept: kept };
  },
  async early(page, { path }) {
    await arriveDirect(page, path, "domcontentloaded");
    await toRunway(page);
    await controlShown(page);
    const before = await state(page);
    await pressPlay(page);
    await waitFor(
      page,
      () => ["playing", "loading"].includes(document.querySelector(".rzn-movie")?.dataset.state),
      null,
      REACT_MS,
      `an early 再生 was ignored (scene ${before.runwayLoad}, disabled ${before.disabled})`,
    );
    const after = await state(page);
    if (after.state === "loading")
      must(after.busy === "true" && /読み込み中/.test(after.label ?? ""), `loading but labelled ${after.label}`);
    await playing(page, PLAY_WAIT + 30000, "an early 再生 never started once ready");
    await advances(page, `early:`);
    return { pressedAt: before.runwayLoad, then: after.state };
  },
  async speeds(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await hookFrames(page);
    const windows = {};
    for (const speed of [1, 0.5, 1.5, 2]) {
      await chooseSpeed(page, speed);
      await restart(page);
      await playing(page, PLAY_WAIT);
      // (The first frames after 最初から redraw the start: not measured.)
      await sleep(800);
      const from = await pageNow(page);
      // At least 8 of the movie's frames (and 3.5 s of them).
      const start = Date.now();
      let scrolls = [];
      for (;;) {
        await sleep(500);
        scrolls = await scrollsSince(page, from);
        if (scrolls.length >= 8 && Date.now() - start >= 3500) break;
        must(Date.now() - start < 60000, `${speed}×: only ${scrolls.length} frames of the movie in 60 s`);
      }
      const w = measureWindow(scrolls, speed);
      windows[speed] = w;
      must(w.moved > 0.004, `${speed}×: the movie does not advance (${JSON.stringify(w)})`);
      must(Math.abs(w.ratio - 1) < 0.05, `${speed}×: moved ${w.ratio}× what the speed asks (${JSON.stringify(w)})`);
      const s = await state(page);
      must(s.state === "playing" || s.state === "ended", `${speed}×: the movie left playing by itself (${s.state})`);
    }
    // The wall-clock rates against 1×'s (the frame rate varies here; reported).
    for (const speed of [0.5, 1.5, 2])
      if (windows[speed].wall && windows[1].wall)
        windows[speed].ofOne = Number((windows[speed].wall / windows[1].wall).toFixed(2));
    // Pause and resume.
    await pressPlay(page);
    await stateIs(page, "paused", "一時停止 did not pause");
    let s = await state(page);
    const held = s.q;
    await sleep(800);
    s = await state(page);
    must(Math.abs(s.q - held) < 0.002, "a paused movie still moved");
    await pressPlay(page);
    await playing(page, REACT_MS);
    await advances(page, "resumed", 0.03);
    return { windows };
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
    // (Playing on from 50 %: at most a frame's step past it, 1 s at 1×.)
    await waitFor(
      page,
      () => {
        const r = document.querySelector(".rzn-suitup");
        const f = r.querySelector(".rzn-frame");
        const pin = parseFloat(getComputedStyle(f).top) || 0;
        return (pin - r.getBoundingClientRect().top) / (r.offsetHeight - f.offsetHeight) >= 0.49;
      },
      null,
      REACT_MS,
      "the seek did not move the page",
    );
    let s = await state(page);
    must(s.q >= 0.49 && s.q < 0.56, `seek to 50 % put the page at ${s.q.toFixed(3)}`);
    must(s.state === "playing" || s.state === "paused", `seek left the state ${s.state}`);
    if (s.state !== "playing") {
      await pressPlay(page);
      await playing(page, REACT_MS);
    }
    await waitFor(page, () => {
      const r = document.querySelector(".rzn-suitup");
      const f = r.querySelector(".rzn-frame");
      const pin = parseFloat(getComputedStyle(f).top) || 0;
      return (pin - r.getBoundingClientRect().top) / (r.offsetHeight - f.offsetHeight) > 0.505;
    }, null, 30000, "after the seek the movie does not continue");
    s = await state(page);
    must(s.q > 0.5 && s.q < 0.65 && s.state === "playing", `after the seek the movie stands at ${s.q.toFixed(3)} (${s.state})`);
    await restart(page);
    // The end: seek to the end, the control reads ended; 再生 replays from 0.
    await openSheet(page);
    await page.locator(".rzn-movie-seek input").fill("200");
    await stateIs(page, "ended", "a seek to the end did not end the movie");
    s = await state(page);
    must(s.q > 0.98, `seek to the end: ${s.q.toFixed(3)}`);
    await pressPlay(page);
    await playing(page, REACT_MS);
    s = await state(page);
    must(s.q < 0.2, `再生 at the end did not replay from the start (${s.q.toFixed(3)})`);
  },
  async wheel(page, { path }) {
    await arriveDirect(page, path);
    await toRunway(page);
    await controlShown(page);
    await hookFrames(page);
    await chooseSpeed(page, 2);
    await pressPlay(page);
    await playing(page, PLAY_WAIT);
    // No pause by itself (the watch fails on any state change).
    await watch(page, { until: 0.25, timeout: 60000, label: "before the wheel" });
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 240);
    await stateIs(page, "paused", "a wheel mid-play did not pause the movie");
    await heldStill(page, "after the wheel");
    let s = await state(page);
    await pressPlay(page);
    await playing(page, REACT_MS, "再生 after a wheel pause did not resume");
    if (page.__touch) {
      // A phone's own scroll: a touch drag outside the control pauses it too.
      await watch(page, { until: Math.min(0.6, s.q + 0.1), timeout: 60000, label: "before the drag" });
      const cdp = await page.context().newCDPSession(page);
      const at = (y) => [{ x: 200, y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(500) });
      for (const y of [480, 450, 420, 390]) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(y) });
        await sleep(30);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await stateIs(page, "paused", "a touch drag mid-play did not pause the movie");
      await heldStill(page, "after the drag");
      s = await state(page);
      await pressPlay(page);
      await playing(page, REACT_MS, "再生 after a drag pause did not resume");
    }
    await watch(page, { timeout: endWithin(2), label: "after the pause" });
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
    await pinnedAgain(page, "after the resize");
    const turned = await watch(page, { until: 0.45, timeout: 60000, label: "after the resize" });
    await page.setViewportSize({ width: w, height: h });
    await pinnedAgain(page, "after resizing back");
    const back = await watch(page, { timeout: endWithin(2), label: "after resizing back" });
    return { unpinnedSamples: [turned.unpinned, back.unpinned] };
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
    await arriveFromStage(page, from);
    await toRunway(page);
    await controlShown(page);
    await pressPlay(page);
    await playing(page, PLAY_WAIT, `on /${from} 再生 never played`);
    await sleep(1200);
    await page.evaluate((p) => document.querySelector(`a[href="/${p}#top"]`).click(), path);
    await page.waitForURL(`**/${path}**`, { timeout: 90000 });
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
  async stilltier(page, { path, cdp }) {
    // The DevTools Slow 3G preset: a 2 s round trip reads as effectiveType
    // 2g, the site's still tier (as Save-Data): the runway is one still and
    // the movie has nothing to play, so no control may be on screen — and
    // none may be dead.
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 2000,
      downloadThroughput: (400 * 1000) / 8,
      uploadThroughput: (400 * 1000) / 8,
    });
    await arriveDirect(page, path);
    const type = await page.evaluate(() => navigator.connection?.effectiveType ?? null);
    await page.evaluate(() => {
      const runway = document.querySelector(".rzn-suitup");
      runway.scrollIntoView({ block: "start", behavior: "instant" });
    });
    await sleep(25000);
    const s = await state(page);
    if (s.visible) {
      // On screen: then it has to work.
      await pressPlay(page);
      await sleep(400);
      const t = await state(page);
      must(t.state === "playing" || t.state === "loading", `a visible control in the still tier did nothing (${JSON.stringify(t)})`);
    }
    return { effectiveType: type, visible: s.visible, tier: s.tier, load: s.runwayLoad };
  },
};

/* ---------------- the runner ---------------- */
const tasks = [];
for (let run = runFrom; run < runFrom + runs; run += 1)
  for (const scenario of scenarios)
    for (const path of pages) for (const size of sizes) tasks.push({ run, scenario, path, size });
const keyOf = (t) => `${t.scenario}|${t.page ?? t.path}|${Array.isArray(t.size) ? t.size.join("x") : t.size}|${t.run}`;
const done = new Set();
if (resume) {
  const text = await readFile(logFile, "utf8").catch(() => "");
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      done.add(keyOf(JSON.parse(line)));
    } catch {
      /* a torn last line */
    }
  }
} else await writeFile(logFile, "");

const launch = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
    timeout: 60000,
  });

async function runScenario(browser, { run, scenario, path, size }, errors, tag) {
  const [width, height] = size;
  const touch = width < 700;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: touch,
    hasTouch: touch,
  });
  // Chromium estimates the connection from the traffic it sees, and a local
  // server answering slowly on a busy machine can read as 2g — the site's
  // still tier, rightly without a movie. Outside the network scenarios the
  // connection is pinned to what it is (local, fast), so each run measures
  // the movie, not the estimate.
  if (!NETWORK_SCENARIOS.has(scenario))
    await context.addInitScript(() => {
      const connection = navigator.connection;
      if (!connection) return;
      for (const [key, value] of Object.entries({ effectiveType: "4g", rtt: 50, downlink: 10, saveData: false }))
        Object.defineProperty(connection, key, { configurable: true, get: () => value });
    });
  const page = await context.newPage();
  page.__touch = touch;
  const cdp = await context.newCDPSession(page);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 300)));
  page.on("crash", () => errors.push("the page crashed"));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      const text = m.text();
      if (/movie|suit-up|chunk|far-from/i.test(text)) errors.push(`${m.type()}: ${text}`.slice(0, 300));
    }
  });
  const shotOf = (name) => join(out, `${tag}-${name}.png`);
  const shot = run === 1 ? shotOf : () => join(out, "tmp-ignore.png");
  try {
    return await SCENARIOS[scenario](page, { path, size, cdp, context, shot });
  } catch (error) {
    await page.screenshot({ path: shotOf("FAIL"), timeout: 15000 }).catch(() => {});
    throw error;
  }
}

// The scenarios whose subject is the network (throttled through CDP).
const NETWORK_SCENARIOS = new Set(["throttled", "stilltier"]);
// Runs that wait through a whole backoff, or a slow network, get longer.
const LONG_SCENARIOS = new Set(["depfail", "throttled"]);

async function runTask(task) {
  const { run, scenario, path, size } = task;
  const [width, height] = size;
  const tag = `${scenario}-${path}-${width}x${height}-r${run}`;
  const errors = [];
  const started = Date.now();
  let browser = null;
  let timer = 0;
  let result;
  try {
    browser = await launch();
    const limit = new Promise((_, reject) => {
      const limit = taskMs * (LONG_SCENARIOS.has(scenario) ? 1.6 : 1);
      timer = setTimeout(() => reject(new Fail(`the run took longer than ${limit} ms`)), limit);
    });
    const detail = await Promise.race([runScenario(browser, task, errors, tag), limit]);
    result = { pass: true, detail };
  } catch (error) {
    result = { pass: false, reason: error instanceof Fail ? error.message : String(error?.stack || error).slice(0, 1500) };
  } finally {
    clearTimeout(timer);
    // A browser that will not close is left to its own process group's end.
    if (browser) await Promise.race([browser.close().catch(() => {}), sleep(20000)]);
  }
  const record = {
    run,
    scenario,
    page: path,
    size: `${width}x${height}`,
    ms: Date.now() - started,
    ...result,
    errors: errors.slice(0, 8),
    at: new Date().toISOString(),
  };
  await appendFile(logFile, `${JSON.stringify(record)}\n`);
  console.log(`${stamp()} ${record.pass ? "PASS" : "FAIL"} ${tag} ${record.ms}ms ${record.reason ?? ""}`);
}

const queue = tasks.filter((t) => !done.has(keyOf(t)));
console.log(`${stamp()} ${queue.length} runs to go (${tasks.length - queue.length} already recorded)`);
await Promise.all(
  Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      if (budgetMs && Date.now() - t0 > budgetMs) {
        console.log(`${stamp()} budget spent: ${queue.length} runs left for a RESUME=1 run`);
        queue.length = 0;
        return;
      }
      await runTask(queue.shift());
    }
  }),
);

/* ---------------- the table (every run in the log) ---------------- */
const records = (await readFile(logFile, "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const rows = new Map();
for (const r of records) {
  const key = `${r.scenario} | ${r.page} | ${r.size}`;
  const row = rows.get(key) ?? { pass: 0, total: 0, reasons: [] };
  row.total += 1;
  if (r.pass) row.pass += 1;
  else row.reasons.push(String(r.reason).split("\n")[0].slice(0, 160));
  rows.set(key, row);
}
const lines = ["scenario | page | size | pass/total | first failure", "--- | --- | --- | --- | ---"];
for (const [key, row] of [...rows].sort()) lines.push(`${key} | ${row.pass}/${row.total} | ${row.reasons[0] ?? ""}`);
const passed = records.filter((r) => r.pass).length;
lines.push("", `TOTAL ${passed}/${records.length}`);
await writeFile(join(out, "summary.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
process.exitCode = passed === records.length ? 0 : 1;
