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

// A layer as an image, fetched and decoded off the main thread (it stays
// referenced, so the CSS layers paint it at once). Null if it failed.
function picture(source: string, priority: Priority, fetched: () => void) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    held.push(image);
    image.onload = () => {
      fetched();
      if (typeof image.decode === "function")
        void image.decode().then(
          () => resolve(image),
          () => resolve(null),
        );
      else resolve(image);
    };
    image.onerror = () => {
      fetched();
      resolve(null);
    };
    image.src = source;
  });
}

// One layer. What the nanite engine draws (rx17) becomes an ImageBitmap
// decoded off the main thread from the fetched file (a bitmap made from
// an <img> would decode again on the main thread); the atlas is also a CSS
// layer (the DOM plates, when the engine cannot run), so its image is
// warmed after. Without createImageBitmap (older Safari) the engine draws
// the decoded image itself.
async function decode(source: string, priority: Priority, fetched: () => void) {
  if (
    DRAWN.includes(source) &&
    typeof createImageBitmap === "function" &&
    typeof fetch === "function"
  ) {
    try {
      const response = await fetch(source, { priority });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      fetched();
      sources.set(source, await createImageBitmap(blob));
    } catch {
      fetched();
      return false;
    }
    if (source === REXONANCE_SUIT_GOLD_ATLAS.src) return true;
    return Boolean(await picture(source, priority, () => undefined));
  }
  const image = await picture(source, priority, fetched);
  if (image && DRAWN.includes(source)) sources.set(source, image);
  return Boolean(image);
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
      // Then the engine's plan and working atlas, in idle time (rx17); the
      // plan is its own small chunk, shared with the call's.
      idle(() => {
        void import("../components/rexonance-saga/rexonance-suit-plan").then(
          (plan) => plan.prepareRexonanceSuit(),
          () => undefined,
        );
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
 * economy). On /rexonance-saga itself, where the call does not play until
 * the visitor leaves and comes back, it waits a little longer, so the
 * page's own artwork goes first. Returns its cancel. */
export function scheduleRexonanceSuitWarm(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
) {
  if (typeof window === "undefined" || ready || pending) return () => {};
  const delayMs = pathname.startsWith("/rexonance-saga") ? 900 : 300;
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
