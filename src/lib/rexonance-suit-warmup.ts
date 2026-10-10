import { REXONANCE_SUIT_ASSETS } from "./rexonance-suit.ts";

type Connection = { saveData?: boolean; effectiveType?: string };

let pending: Promise<boolean> | null = null;
let ready = false;
// The decoded images stay referenced, so their bitmaps stay warm for the call.
const held: HTMLImageElement[] = [];

/** rx12: fetch and decode every layer the Rexonance suit-up paints, once,
 * off the main thread — on intent (a link to /rexonance-saga is pointed
 * at, focused or touched) at low priority, and when the call starts at high
 * priority. Never on Save-Data or 2G/3G, nor where the call rests on a still
 * (reduced motion, economy rendering): those show the finished figure only.
 * Resolves true once every layer has decoded; a failure lets a later intent
 * try again. It never gates navigation: the call reads
 * isRexonanceSuitReady() when it starts and otherwise stands the finished
 * figure whole. */
export function warmRexonanceSuit(priority: "low" | "high" = "low"): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  if (pending) return pending;
  if (typeof Image === "undefined" || typeof window === "undefined") return Promise.resolve(false);
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (
    connection?.saveData ||
    ["slow-2g", "2g", "3g"].includes(connection?.effectiveType || "") ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.worldEffects === "economy"
  )
    return Promise.resolve(false);
  const decode = (source: string) =>
    new Promise<boolean>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = priority;
      held.push(image);
      image.onload = () => {
        if (typeof image.decode === "function")
          void image.decode().then(
            () => resolve(true),
            () => resolve(false),
          );
        else resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = source;
    });
  pending = Promise.all(REXONANCE_SUIT_ASSETS.map(decode)).then((results) => {
    ready = results.every(Boolean);
    if (!ready) {
      pending = null;
      held.length = 0;
    }
    return ready;
  });
  return pending;
}

/** Whether every suit-up layer is decoded (the call can build the suit). */
export const isRexonanceSuitReady = () => ready;

/** rx13 (owner): the suit-up's layers are warmed in advance, not only on
 * intent: once the page has loaded and gone idle (after its own critical
 * images), the warm-up runs at low priority, so the call almost always
 * builds the suit. The same skips apply (Save-Data, 2G/3G, reduced motion,
 * economy); /rexonance-saga itself, where the call does not play, waits for
 * intent. Returns its cancel. */
export function scheduleRexonanceSuitWarm(delayMs = 2500) {
  if (typeof window === "undefined" || ready || pending) return () => {};
  if (window.location.pathname.startsWith("/rexonance-saga")) return () => {};
  let timer = 0;
  let idle = 0;
  let cancelled = false;
  const run = () => {
    timer = 0;
    if (cancelled) return;
    if (window.requestIdleCallback)
      idle = window.requestIdleCallback(() => void warmRexonanceSuit(), { timeout: 4000 });
    else void warmRexonanceSuit();
  };
  const afterLoad = () => {
    if (!cancelled) timer = window.setTimeout(run, delayMs);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", afterLoad);
    if (timer) window.clearTimeout(timer);
    if (idle) window.cancelIdleCallback?.(idle);
  };
}
