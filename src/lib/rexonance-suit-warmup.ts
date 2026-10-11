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
function picture(source: string, priority: Priority) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    held.push(image);
    image.onload = () => {
      if (typeof image.decode === "function")
        void image.decode().then(
          () => resolve(image),
          () => resolve(null),
        );
      else resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

// One layer. What the nanite engine draws (rx17) becomes an ImageBitmap
// decoded off the main thread from the fetched file (a bitmap made from
// an <img> would decode again on the main thread); the atlas is also a CSS
// layer (the DOM plates, when the engine cannot run), so its image is
// warmed after. Without createImageBitmap (older Safari) the engine draws
// the decoded image itself.
async function decode(source: string, priority: Priority) {
  if (
    DRAWN.includes(source) &&
    typeof createImageBitmap === "function" &&
    typeof fetch === "function"
  ) {
    try {
      const response = await fetch(source, { priority });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      sources.set(source, await createImageBitmap(blob));
    } catch {
      return false;
    }
    if (source === REXONANCE_SUIT_GOLD_ATLAS.src) return true;
    return Boolean(await picture(source, priority));
  }
  const image = await picture(source, priority);
  if (image && DRAWN.includes(source)) sources.set(source, image);
  return Boolean(image);
}

// Every layer at once, at the given priority (the browser orders them).
function start(priority: Priority) {
  return Promise.all(REXONANCE_SUIT_ASSETS.map((source) => decode(source, priority))).then(
    (results) => results.every(Boolean),
  );
}

/** rx12: fetch and decode every layer the Rexonance suit-up paints, once,
 * off the main thread — on intent (a link to /rexonance-saga is pointed
 * at, focused or touched) and soon after each page's load at low priority,
 * and when the call starts at high priority. Never on Save-Data or 2G, nor where the call rests on
 * a still (reduced motion, economy rendering): those show the finished
 * figure only. Resolves true once every layer has decoded; a failure lets a
 * later intent try again. It never gates navigation: the call reads
 * isRexonanceSuitReady() when it starts and otherwise stands the finished
 * figure whole. */
export function warmRexonanceSuit(priority: Priority = "low"): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  if (pending) return pending;
  if (typeof Image === "undefined" || typeof window === "undefined") return Promise.resolve(false);
  if (saving() || still()) return Promise.resolve(false);
  pending = start(priority).then((decoded) => {
    ready = decoded;
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
 * intent. rx17 (owner, 2026-10-11): "preload it" — soon after each public
 * page's own load (it re-runs on every route), in idle time: the call's own
 * chunk, then every layer at low priority, then the engine's plan and
 * canvases, sliced into idle time. The same skips apply (Save-Data, 2G,
 * reduced motion, economy); the opening preserves its network budget, a
 * hidden (suspended) page does no work, and /rexonance-saga itself, where
 * the call does not play, waits for intent — leaving it schedules the warm
 * on the next route. It keeps the owner's 2.5 s after load, so it never
 * competes with the visitor's first navigation on a phone's bandwidth (the
 * call's own warm on intent and at its start covers earlier taps). Returns
 * its cancel. */
export function scheduleRexonanceSuitWarm(delayMs = 2500) {
  if (typeof window === "undefined" || ready || pending) return () => {};
  if (window.location.pathname === "/" || window.location.pathname.startsWith("/rexonance-saga"))
    return () => {};
  let timer = 0;
  let idleId = 0;
  let cancelled = false;
  const run = () => {
    idleId = 0;
    if (cancelled) return;
    // A suspended Home Screen app must not decode a second scene offscreen.
    if (document.hidden || saving() || still()) return;
    // The call's own chunk (its retry on failure is the loader's), and the
    // layers, at low priority.
    void prepareRexonanceTransition.prefetch();
    void warmRexonanceSuit();
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
