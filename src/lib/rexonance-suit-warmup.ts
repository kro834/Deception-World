import {
  REXONANCE_SUIT_ASSETS,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
} from "./rexonance-suit.ts";
import { prepareRexonanceTransition } from "./rexonance-transition-loader.ts";

type Connection = { saveData?: boolean; effectiveType?: string };
type Priority = "low" | "high";

let pending: Promise<boolean> | null = null;
let ready = false;
// Starts whatever is still queued, at the given priority (an intent or the
// call itself overtaking the idle warm-up).
let hurry: ((priority: Priority) => void) | null = null;
// The decoded images stay referenced, so the CSS layers stay warm for the call.
const held: HTMLImageElement[] = [];
// rx17: what the nanite engine draws, decoded once and shared with it.
const sources = new Map<string, CanvasImageSource>();
const DRAWN: readonly string[] = [REXONANCE_SUIT_ATLAS.src, REXONANCE_SUIT_GOLD_ATLAS.src];

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

// One layer: fetched, decoded off the main thread, and (for the engine's
// canvases) turned into an ImageBitmap where supported, else the decoded
// image itself (older Safari).
function decode(source: string, priority: Priority, fetched: () => void) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    held.push(image);
    const done = () => {
      if (!DRAWN.includes(source)) return resolve(true);
      if (typeof createImageBitmap !== "function") {
        sources.set(source, image);
        return resolve(true);
      }
      void createImageBitmap(image).then(
        (bitmap) => {
          sources.set(source, bitmap);
          resolve(true);
        },
        () => {
          sources.set(source, image);
          resolve(true);
        },
      );
    };
    image.onload = () => {
      fetched();
      if (typeof image.decode === "function") void image.decode().then(done, () => resolve(false));
      else done();
    };
    image.onerror = () => {
      fetched();
      resolve(false);
    };
    image.src = source;
  });
}

function start(priority: Priority, oneByOne: boolean) {
  const queue = [...REXONANCE_SUIT_ASSETS];
  const loads: Promise<boolean>[] = [];
  let level = priority;
  let finish: (all: boolean) => void = () => {};
  const done = new Promise<boolean>((resolve) => (finish = resolve));
  const next = () => {
    const source = queue.shift();
    if (!source) return;
    // One request at a time: the next starts (in an idle slot) once this
    // one has arrived, while it decodes.
    const load = decode(source, level, () => {
      if (queue.length && oneByOne) idle(next, 200);
    });
    loads.push(load);
    void load.then(() => {
      if (!queue.length && loads.length === REXONANCE_SUIT_ASSETS.length)
        void Promise.all(loads).then((results) => finish(results.every(Boolean)));
    });
  };
  hurry = (urgent) => {
    level = urgent;
    oneByOne = false;
    while (queue.length) next();
  };
  if (oneByOne) next();
  else hurry(priority);
  return done;
}

/** rx12: fetch and decode every layer the Rexonance suit-up paints, once,
 * off the main thread — on intent (a link to /rexonance-saga is pointed
 * at, focused or touched) at low priority, and when the call starts at high
 * priority (either overtakes the idle warm-up: whatever it has not started
 * yet starts at once). Never on Save-Data or 2G, nor where the call rests on
 * a still (reduced motion, economy rendering): those show the finished
 * figure only. Resolves true once every layer has decoded; a failure lets a
 * later intent try again. It never gates navigation: the call reads
 * isRexonanceSuitReady() when it starts and otherwise stands the finished
 * figure whole. */
export function warmRexonanceSuit(priority: Priority = "low"): Promise<boolean> {
  return warm(priority, false);
}

function warm(priority: Priority, oneByOne: boolean): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  if (pending) {
    if (!oneByOne) hurry?.(priority);
    return pending;
  }
  if (typeof Image === "undefined" || typeof window === "undefined") return Promise.resolve(false);
  if (saving() || still()) return Promise.resolve(false);
  pending = start(priority, oneByOne).then((decoded) => {
    ready = decoded;
    hurry = null;
    if (!ready) {
      pending = null;
      held.length = 0;
      sources.clear();
    } else {
      // Then the engine's plan and canvases, in idle time (rx17).
      idle(() => {
        void prepareRexonanceTransition
          .prefetch()
          .then((module) => module?.prepareRexonanceSuit?.());
      }, 2000);
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

/** rx13 (owner): the suit-up's layers are warmed in advance, not only on
 * intent. rx17 (owner, 2026-10-11): "preload it" — on every page the
 * visitor reaches (it re-runs on each route), soon after the page's own
 * load and in idle time: the call's own chunk first, then each layer one
 * at a time at low priority, then the engine's plan and canvases, sliced
 * into idle time. The same skips apply (Save-Data, 2G, reduced motion,
 * economy); /rexonance-saga itself, where the call does not play, waits
 * until the visitor leaves it (or for intent). Returns its cancel. */
export function scheduleRexonanceSuitWarm(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
  delayMs = 300,
) {
  if (typeof window === "undefined" || ready || pending) return () => {};
  if (pathname.startsWith("/rexonance-saga")) return () => {};
  let timer = 0;
  let idleId = 0;
  let cancelled = false;
  const run = () => {
    idleId = 0;
    if (cancelled) return;
    if (saving() || still()) return;
    // The call's own chunk (its retry on failure is the loader's), and the
    // layers one at a time.
    void prepareRexonanceTransition.prefetch();
    void warm("low", true);
  };
  const afterLoad = () => {
    if (cancelled) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (cancelled) return;
      if (window.requestIdleCallback) idleId = window.requestIdleCallback(run, { timeout: 1200 });
      else run();
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
