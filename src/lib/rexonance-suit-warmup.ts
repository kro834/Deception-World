import {
  REXONANCE_SUIT_ASSETS,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
} from "./rexonance-suit.ts";
import { prepareRexonanceTransition } from "./rexonance-transition-loader.ts";
import { REXONANCE_SITE_ARTWORK } from "./rexonance-site-artwork.ts";

type Connection = { saveData?: boolean; effectiveType?: string };
type Priority = "low" | "high";

let pending: Promise<boolean> | null = null;
let ready = false;
type WarmBatch = {
  controller: AbortController;
  priority: Priority;
  jobs: Map<string, Promise<boolean>>;
  failed: Set<string>;
  retried: Set<string>;
};
let activeBatch: WarmBatch | null = null;
let backgroundPauses = 0;
let planWaiting = false;
let planIdlePending = false;
// Round 3 (review 45): the plan was prepared while the page was hidden or a
// go() held the network, so the kit's import waits for the resume.
let kitWaiting = false;
const completed = new Set<string>();
const schedules = new Set<{ suspend: () => void; resume: () => void }>();
// The decoded images stay referenced, so the CSS layers stay warm for the call.
const held: HTMLImageElement[] = [];
// CSS can decode successfully while its canvas bitmap fails. Keep one
// successful image per source so a missing-bitmap retry does not download
// and hold another copy of the already-warm fallback layer.
const decodedPictures = new Map<string, HTMLImageElement>();
// rx17: what the nanite engine draws, decoded once and shared with it.
const sources = new Map<string, CanvasImageSource>();
const DRAWN: readonly string[] = [REXONANCE_SUIT_ATLAS.src, REXONANCE_SUIT_GOLD_ATLAS.src];
// Owner (2026-10-16, 超大幅な改善): the nanite kit's own warm-up (its own
// chunk, rexonance-nanites-warmup: ImageBitmaps only) is imported once the
// plan is prepared and registers here, so intent can promote it and an
// unrelated go() can pause it. The suit's own layers and fetches are its
// own business, untouched by it.
type NaniteWarm = { warm: (priority: Priority) => void; pause: () => void };
let naniteWarm: NaniteWarm | null = null;
export function registerRexonanceNaniteWarm(hooks: NaniteWarm) {
  naniteWarm = hooks;
}

const saving = () => {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  // rx17 (owner, 2026-10-11): preload on 3G too; only Save-Data and 2G wait.
  return (
    Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType || "")
  );
};
// Reduced motion and economy rest the call on the finished figure, still.
const still = () =>
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
  document.documentElement.dataset.worldEffects === "economy";

const idle = (run: () => void, timeout: number) => {
  if (window.requestIdleCallback) window.requestIdleCallback(() => run(), { timeout });
  else window.setTimeout(run, 0);
};

function warmPlanWhenIdle() {
  if (!planWaiting || planIdlePending || document.hidden || backgroundPauses) return;
  planIdlePending = true;
  idle(() => {
    planIdlePending = false;
    if (document.hidden || backgroundPauses) return;
    planWaiting = false;
    void import("../components/rexonance-saga/rexonance-suit-plan").then(
      (plan) => {
        // Importing cannot be aborted. A page may hide or go() may acquire
        // the network while its chunk resolves; retain the deferred work.
        if (document.hidden || backgroundPauses) {
          planWaiting = true;
          return;
        }
        return plan.prepareRexonanceSuit();
      },
      () => undefined,
    ).then((prepared) => {
      // Then the nanite kit, after the plan (2026-10-16).
      if (prepared !== true || saving() || still()) return;
      kitWaiting = true;
      resumeKit();
    });
  }, 2000);
}

// The kit's chunk once the plan is prepared, unless the page is hidden or a
// go() holds the network: then on the resume (round 3, review 45: it used
// to be skipped, and nothing kicked the kit again until a classic call).
function resumeKit() {
  if (!kitWaiting || !ready || document.hidden || backgroundPauses || saving() || still()) return;
  kitWaiting = false;
  void import("./rexonance-nanites-warmup.ts").then(
    (kit) => kit.warmRexonanceNanites(),
    () => undefined,
  );
}

// A layer as an image, fetched and decoded off the main thread (it stays
// referenced, so the CSS layers paint it at once). Null if it failed.
function picture(source: string, priority: Priority, batch: WarmBatch) {
  const decoded = decodedPictures.get(source);
  if (decoded) return Promise.resolve(decoded);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    held.push(image);
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      batch.controller.signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (value) decodedPictures.set(source, value);
      else {
        const index = held.indexOf(image);
        if (index !== -1) held.splice(index, 1);
      }
      resolve(value);
    };
    const abort = () => {
      // Image requests do not accept a signal. Release their source too on
      // older Safari; the fetch-backed atlas requests use this same signal.
      image.removeAttribute?.("src");
      finish(null);
    };
    batch.controller.signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      if (typeof image.decode === "function")
        void Promise.resolve()
          .then(() => image.decode())
          .then(
            () => finish(batch.controller.signal.aborted ? null : image),
            () => finish(null),
          );
      else finish(batch.controller.signal.aborted ? null : image);
    };
    image.onerror = () => finish(null);
    if (batch.controller.signal.aborted) {
      abort();
      return;
    }
    image.src = source;
  });
}

// One layer. What the nanite engine draws (rx17) becomes an ImageBitmap
// decoded off the main thread from the fetched file (a bitmap made from
// an <img> would decode again on the main thread); the atlas is also a CSS
// layer (the DOM plates, when the engine cannot run), so its image is
// warmed from the fetched file's cache alongside the bitmap decode, not
// after it. Without createImageBitmap (older Safari) the engine draws
// the decoded image itself.
async function decode(source: string, priority: Priority, batch: WarmBatch) {
  if (completed.has(source)) return true;
  const current = () => activeBatch === batch && !batch.controller.signal.aborted;
  if (
    DRAWN.includes(source) &&
    typeof createImageBitmap === "function" &&
    typeof fetch === "function"
  ) {
    try {
      const response = await fetch(source, { priority, signal: batch.controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      if (!current()) return false;
      // Both use the already-fetched file. Keep CSS readiness in the same
      // contract, without serializing its decode behind the canvas bitmap.
      const [bitmap, cssReady] = await Promise.all([
        // A bitmap rejection must not abandon an in-flight CSS image and
        // retry it in parallel. Let that valid work finish and stay cached;
        // no renderer source/readiness is published without both results.
        Promise.resolve()
          .then(() => createImageBitmap(blob))
          .catch(() => null),
        source === REXONANCE_SUIT_GOLD_ATLAS.src
          ? Promise.resolve(true)
          : picture(source, priority, batch).then(Boolean),
      ]);
      if (!bitmap) return false;
      // Decoding itself is not abortable. Close an abandoned decode rather
      // than letting it replace a later high-priority batch's source.
      if (!current()) {
        bitmap.close?.();
        return false;
      }
      if (!cssReady || !current()) {
        bitmap.close?.();
        return false;
      }
      sources.set(source, bitmap);
      completed.add(source);
    } catch {
      return false;
    }
    return true;
  }
  const image = await picture(source, priority, batch);
  if (!image || !current()) return false;
  if (DRAWN.includes(source)) sources.set(source, image);
  completed.add(source);
  return true;
}

const currentBatch = (batch: WarmBatch) =>
  activeBatch === batch && !batch.controller.signal.aborted;

function retryFailed(batch: WarmBatch) {
  if (!currentBatch(batch) || batch.priority !== "high" || document.hidden || saving() || still())
    return;
  for (const source of batch.failed) {
    if (batch.retried.has(source)) continue;
    // One immediate retry per missing source, never another download of a
    // successful or still-running source. A later intent may start a new
    // batch if this retry also fails; a failed file cannot create a loop.
    batch.retried.add(source);
    queue(source, "high", batch);
  }
}

function queue(source: string, priority: Priority, batch: WarmBatch) {
  batch.failed.delete(source);
  const job = decode(source, priority, batch).then((decoded) => {
    if (currentBatch(batch) && !decoded) {
      batch.failed.add(source);
      retryFailed(batch);
    }
    return decoded;
  });
  batch.jobs.set(source, job);
}

// Every initial layer starts together at the requested priority. Intent
// adopts live jobs, but replaces a known failure immediately rather than
// waiting for unrelated images to decode before it can retry the file.
async function start(priority: Priority, batch: WarmBatch) {
  REXONANCE_SUIT_ASSETS.forEach((source) => queue(source, priority, batch));
  while (currentBatch(batch)) {
    const jobs = [...batch.jobs.entries()];
    await Promise.all(jobs.map(([, job]) => job));
    if (!currentBatch(batch)) return false;
    if (jobs.every(([source, job]) => batch.jobs.get(source) === job))
      return REXONANCE_SUIT_ASSETS.every((source) => completed.has(source));
    // A failed source was retried while the other jobs were settling. Keep
    // the same public pending promise, now waiting for that replacement.
  }
  return false;
}

/** rx12: fetch and decode every layer the Rexonance suit-up paints, once,
 * off the main thread — on intent (a link to /rexonance-saga is pointed
 * at, focused or touched) and soon after each page's load at low priority,
 * and when the call starts at high priority. Never on Save-Data or 2G, nor where the call rests on
 * a still (reduced motion, economy rendering): those show the finished
 * figure only. Resolves true once every layer has decoded; a failure lets a
 * later intent try again. The entry owns a short cancellable preparation
 * deadline before its clock starts; a stalled decoder never holds navigation
 * indefinitely, and the finished figure remains the safe fallback. */
export function warmRexonanceSuit(priority: Priority = "low"): Promise<boolean> {
  if (ready) {
    warmPlanWhenIdle();
    resumeKit();
    if (priority === "high") naniteWarm?.warm("high");
    return Promise.resolve(true);
  }
  if (pending) {
    // Intent/the call adopts the existing low-priority requests; it does not
    // download them again. A later unrelated go may cancel even unused intent.
    if (priority === "high" && activeBatch) {
      activeBatch.priority = "high";
      retryFailed(activeBatch);
    }
    return pending;
  }
  if (typeof Image === "undefined" || typeof window === "undefined") return Promise.resolve(false);
  if (saving() || still()) return Promise.resolve(false);
  if (document.hidden || (priority === "low" && backgroundPauses)) return Promise.resolve(false);
  const batch: WarmBatch = {
    controller: new AbortController(),
    priority,
    jobs: new Map(),
    failed: new Set(),
    retried: new Set(),
  };
  activeBatch = batch;
  pending = start(priority, batch).then((decoded) => {
    if (activeBatch !== batch || batch.controller.signal.aborted) return false;
    ready = decoded;
    activeBatch = null;
    if (!ready) {
      pending = null;
      // Keep successful layers/bitmaps. Retry only missing work, never tear
      // down sources a completed renderer may already be using.
    } else {
      // Then the engine's plan and working atlas, in idle time (rx17); the
      // plan is its own small chunk, shared with the call's.
      planWaiting = true;
      warmPlanWhenIdle();
    }
    return ready;
  });
  return pending;
}

/** Whether every suit-up layer is decoded (the call can build the suit). */
export const isRexonanceSuitReady = () => ready;

/** rx17: a layer the nanite engine draws, decoded (an ImageBitmap where
 * supported, else the decoded image), once the warm-up has it. */
export const rexonanceSuitSource = (source: string) => sources.get(source) ?? null;
/** Reuse the decoded CSS undersuit as the connected fire's physical mask.
 * It needs no second bitmap, fetch or change to suit readiness. */
export const rexonanceSuitPicture = (source: string) => decodedPictures.get(source) ?? null;

function abortWarmup(preserveIntent = false) {
  if (!activeBatch || (preserveIntent && activeBatch.priority === "high")) return;
  const batch = activeBatch;
  activeBatch = null;
  pending = null;
  batch.controller.abort();
}

/** Give unrelated navigation the network, even after hover/touch intent.
 * Rexonance navigation may preserve its own high-priority intent; a new
 * call otherwise fetches missing layers at high priority. Each go owns
 * one idempotent release, including cancellation and unmount. */
export function pauseRexonanceSuitWarmup(preserveIntent = false) {
  backgroundPauses += 1;
  schedules.forEach((schedule) => schedule.suspend());
  abortWarmup(preserveIntent);
  if (!preserveIntent) naniteWarm?.pause();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    backgroundPauses = Math.max(0, backgroundPauses - 1);
    if (!backgroundPauses) {
      schedules.forEach((schedule) => schedule.resume());
      warmPlanWhenIdle();
      resumeKit();
      if (ready) naniteWarm?.warm("low");
    }
  };
}

/** rx13 (owner): the suit-up's layers are warmed in advance, not only on
 * intent. rx17 (owner, 2026-10-11): "preload it" — soon after each public
 * page's own load (it re-runs on every route), in idle time: the call's own
 * chunk, then every layer at low priority, then the engine's plan and
 * canvases, sliced into idle time. The same skips apply (Save-Data, 2G,
 * reduced motion, economy); the opening preserves its network budget, a
 * hidden (suspended) page does no work, and /rexonance-saga itself, where
 * the call does not play, waits for intent — leaving it schedules the warm
 * on the next route. It waits about 1 s after load; go() suspends speculative
 * requests so they do not compete with another route. The call's warm on
 * intent and bounded entry preparation cover earlier taps. Returns
 * its cancel. */
/** Phones on /illusionculum-saga skip the speculative Rexonance warm-up:
 * that page's own suit engine already holds the memory (2026-10-24, a
 * phone crash's margin). A tap on a Rexonance link still warms on intent. */
function heldBySuitPage() {
  return (
    window.location.pathname.startsWith("/illusionculum-saga") &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

export function scheduleRexonanceSuitWarm(delayMs = 1000) {
  if (typeof window === "undefined") return () => {};
  if (window.location.pathname === "/" || window.location.pathname.startsWith("/rexonance-saga"))
    return () => {};
  if (heldBySuitPage()) return () => {};
  // Review (2026-10-16, cold tap): the nanite kit's preparation waits on
  // /rexonance-saga (where a cold tap's call lands); the next route resumes
  // it, in idle time, under the same skips.
  if (ready) {
    let resumeId = 0;
    const resumeWarm = () => {
      resumeId = 0;
      if (backgroundPauses || document.hidden || saving() || still()) return;
      warmPlanWhenIdle();
      resumeKit();
      naniteWarm?.warm("low");
    };
    if (window.requestIdleCallback)
      resumeId = window.requestIdleCallback(resumeWarm, { timeout: 2000 });
    else resumeWarm();
    return () => {
      if (resumeId) window.cancelIdleCallback?.(resumeId);
    };
  }
  let timer = 0;
  let idleId = 0;
  let cancelled = false;
  let loaded = document.readyState === "complete";
  const pathname = window.location.pathname;
  const suspend = () => {
    if (timer) window.clearTimeout(timer);
    if (idleId) window.cancelIdleCallback?.(idleId);
    timer = idleId = 0;
  };
  const run = () => {
    idleId = 0;
    if (cancelled || backgroundPauses || pathname !== window.location.pathname) return;
    // A suspended Home Screen app must not decode a second scene offscreen.
    if (document.hidden || saving() || still()) return;
    // The call's own chunk (its retry on failure is the loader's), and the
    // layers, at low priority.
    void prepareRexonanceTransition.prefetch();
    void warmRexonanceSuit();
  };
  const afterLoad = () => {
    loaded = true;
    if (cancelled || backgroundPauses || document.hidden || pathname !== window.location.pathname)
      return;
    suspend();
    timer = window.setTimeout(() => {
      timer = 0;
      if (cancelled || backgroundPauses) return;
      if (window.requestIdleCallback) idleId = window.requestIdleCallback(run, { timeout: 1200 });
      else run();
    }, delayMs);
  };
  const resume = () => {
    if (loaded && !ready) afterLoad();
    if (ready) {
      warmPlanWhenIdle();
      resumeKit();
      naniteWarm?.warm("low");
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      suspend();
      abortWarmup();
      naniteWarm?.pause();
    } else resume();
  };
  const schedule = { suspend, resume };
  schedules.add(schedule);
  document.addEventListener?.("visibilitychange", onVisibility);
  if (loaded) afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    cancelled = true;
    schedules.delete(schedule);
    document.removeEventListener?.("visibilitychange", onVisibility);
    window.removeEventListener("load", afterLoad);
    suspend();
    // Route reservation cleanup is not a call cancellation. An explicit
    // Rexonance intent/call may still own its shared batch across this cleanup.
    abortWarmup(true);
  };
}

/** Owner (2026-10-11): the Rexonance call must not stutter, so the page it
 * lands on is preloaded too — not when the link is tapped (its chunk would
 * then be parsed and its art decoded in the middle of the call), but in
 * idle time after each public page has settled: the route's chunk (through
 * `preload`, the router's own preloadRoute), its stylesheets (rel=preload,
 * so its hand-over never waits on them) and its hero artwork. The same skips
 * as the suit's warm-up; straight after it, so the two never compete.
 * Returns its cancel. */
export function scheduleRexonancePagePreload(preload: () => Promise<unknown>, delayMs = 2500) {
  if (typeof window === "undefined" || pagePreloaded) return () => {};
  if (window.location.pathname === "/" || window.location.pathname.startsWith("/rexonance-saga"))
    return () => {};
  if (heldBySuitPage()) return () => {};
  let timer = 0;
  let idleId = 0;
  let cancelled = false;
  const run = () => {
    idleId = 0;
    if (cancelled || pagePreloaded || document.hidden || saving()) return;
    pagePreloaded = true;
    void preload()
      .then((matches) => {
        // The route's head links (its stylesheets and fonts), once each. Not on
        // /extreme-saga or /far-from-saga: Chrome logged ~20 "preloaded but
        // not used" warnings there for Rexonance-only sheets, so the route
        // chunk stays warm and its stylesheets/fonts are left to load on
        // arrival.
        if (/^\/(extreme-saga|far-from-saga|illusionculum-saga)/.test(window.location.pathname)) return;
        const list = Array.isArray(matches) ? matches : [];
        for (const match of list as {
          links?: {
            rel?: string;
            as?: string;
            type?: string;
            href?: string;
            crossOrigin?: string;
          }[];
        }[]) {
          for (const link of match.links ?? []) {
            if (!link.href) continue;
            if (document.head.querySelector(`link[href="${CSS.escape(link.href)}"]`)) continue;
            if (link.rel === "stylesheet") {
              const hint = Object.assign(document.createElement("link"), {
                rel: "preload",
                as: "style",
                href: link.href,
              });
              hint.setAttribute("fetchpriority", "low");
              document.head.append(hint);
            } else if (link.rel === "preload" && link.as === "font") {
              const hint = Object.assign(document.createElement("link"), {
                rel: "preload",
                as: "font",
                type: link.type ?? "font/woff2",
                href: link.href,
                crossOrigin: link.crossOrigin ?? "anonymous",
              });
              hint.setAttribute("fetchpriority", "low");
              document.head.append(hint);
            }
          }
        }
      })
      .catch(() => {
        pagePreloaded = false;
      });
    // Only the destination hero is needed for arrival. MAX / ULTRA warm
    // sequentially near their rail in rexonance-saga.tsx; fetching them on
    // every unrelated page wasted 939,704 bytes even without a visit.
    for (const source of [REXONANCE_SITE_ARTWORK.standard]) {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = source;
      held.push(image);
      void image.decode?.().catch(() => undefined);
    }
  };
  // Owner (2026-10-11, "load it in a bigger way"): no fixed wait of its own —
  // it follows the suit's warm-up straight on (it shares that warm-up, which
  // starts it if nothing has), in the next idle slot.
  const afterLoad = () => {
    if (cancelled) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (cancelled) return;
      void warmRexonanceSuit().then(() => {
        if (cancelled) return;
        if (window.requestIdleCallback) idleId = window.requestIdleCallback(run, { timeout: 800 });
        else run();
      });
    }, delayMs);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", afterLoad);
    if (timer) window.clearTimeout(timer);
    if (idleId) window.cancelIdleCallback?.(idleId);
  };
}
let pagePreloaded = false;
