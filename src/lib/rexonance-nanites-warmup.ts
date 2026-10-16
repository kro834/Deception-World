import { REXONANCE_NANITE_ASSETS } from "./rexonance-nanites.ts";
import { registerRexonanceNaniteWarm } from "./rexonance-suit-warmup.ts";

/* Owner (2026-10-16): 「blenderなどを用いてナノマシン一つ一つの挙動や装甲形成や
   金のガイドウェイなどを大きく改善して」「超大幅な改善で。」 — the nanite kit
   (Blender hex chips, comets, clamps, latches, scan planes, droplets, shock
   rings and the guideway conduit; scripts/build-rexonance-nanites.mjs) is
   fetched and decoded here, ImageBitmaps only, after the suit's own warm-up
   and its plan (rexonance-suit-warmup kicks this chunk once the plan is
   prepared, and intent promotes it). It never runs where the call rests on a
   still (reduced motion, economy), on Save-Data or 2G, on a hidden page, or
   where createImageBitmap is missing; the suit's own layers, fetches and
   readiness are untouched. Once decoded, the call's extras are prepared in
   idle slices (rexonance-suit-extras). A call that starts before all this is
   done plays the classic nanite engine. */

type Priority = "low" | "high";
type Connection = { saveData?: boolean; effectiveType?: string };

const sources = new Map<string, ImageBitmap>();
let pending: Promise<boolean> | null = null;
let controller: AbortController | null = null;
let pendingPriority: Priority = "low";
let decoded = false;

const blocked = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (typeof createImageBitmap !== "function" || typeof fetch !== "function") return true;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType || ""))
    return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  if (document.documentElement.dataset.worldEffects === "economy") return true;
  return Boolean(document.hidden);
};

// Prepares the call's extras (its own chunk, the call's) in idle slices. A
// warm while it is in flight resumes a preparation parked on /rexonance-saga
// (review 2026-10-16: the page a cold tap's call lands on waits).
function prepare(priority: Priority) {
  void import("../components/rexonance-saga/rexonance-suit-extras").then(
    (extras) => void extras.prepareRexonanceNanites(priority),
    () => undefined,
  );
}

async function decode(source: string, priority: Priority, signal: AbortSignal) {
  if (sources.has(source)) return true;
  const response = await fetch(source, { priority, signal } as RequestInit);
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  if (signal.aborted) return false;
  const bitmap = await createImageBitmap(blob);
  if (signal.aborted) {
    bitmap.close?.();
    return false;
  }
  sources.set(source, bitmap);
  return true;
}

/** Fetches and decodes the nanite kit once (ImageBitmaps), then prepares the
 * call's extras in idle time. Resolves true once every sheet is decoded. */
export function warmRexonanceNanites(priority: Priority = "low"): Promise<boolean> {
  if (decoded) {
    prepare(priority);
    return Promise.resolve(true);
  }
  if (pending) {
    // A request's priority cannot change in flight; a high intent shares it.
    if (priority === "high") pendingPriority = "high";
    return pending;
  }
  if (blocked()) return Promise.resolve(false);
  const ownController = new AbortController();
  controller = ownController;
  pendingPriority = priority;
  const signal = ownController.signal;
  const job = Promise.all(
    REXONANCE_NANITE_ASSETS.map((source) =>
      decode(source, priority, signal).catch(() => false),
    ),
  ).then((all) => {
    if (controller === ownController) controller = null;
    if (pending === job) pending = null;
    decoded = all.every(Boolean) && REXONANCE_NANITE_ASSETS.every((src) => sources.has(src));
    if (decoded) prepare(pendingPriority);
    return decoded;
  });
  pending = job;
  return job;
}

/** Gives an unrelated navigation the network: a low-priority kit download
 * in flight is aborted (decoded sheets are kept; a later warm resumes). */
export function pauseRexonanceNanites() {
  if (!controller || pendingPriority === "high") return;
  const aborting = controller;
  controller = null;
  pending = null;
  aborting.abort();
}

/** Round 3 (reviews 28/43): once the call that drew them is over, the kit's
 * decoded sheets are closed (about 8.7 MB of bitmaps, held for the session
 * before); the next route's warm decodes them again from the cache. Never
 * while a decode is in flight. */
export function releaseRexonanceNaniteSources() {
  if (pending) return;
  for (const bitmap of sources.values()) bitmap.close?.();
  sources.clear();
  decoded = false;
}

/** A decoded sheet of the kit (null until the warm-up has it). */
export const rexonanceNaniteSource = (source: string) => sources.get(source) ?? null;

/** Whether every sheet of the kit is decoded. */
export const isRexonanceNaniteDecoded = () => decoded;

registerRexonanceNaniteWarm({
  warm: (priority) => void warmRexonanceNanites(priority),
  pause: pauseRexonanceNanites,
});
