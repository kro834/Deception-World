import { REXONANCE_SUIT_SIZE, REXONANCE_SUIT_UNDERSUIT } from "./rexonance-suit";
import { FAR_FROM_ENTRY_ASSETS } from "./far-from-entry-suit";
import { FAR_FROM_ENTRY_KIT_ASSETS } from "./far-from-entry-kits";
import { prepareBodyFlame, warmNaniteFlame } from "./rexonance-flame.js";
import { farFromEntryPlan } from "../components/far-from-saga/far-from-entry-plan";

/* FAR FROM SAGA's entry warm-up (owner, 2026-10-22): the entry's images
   (the plates' atlas, the finished figure, the crystals' light, the shared
   Rexonance undersuit) and the nanite kits' sheets, fetched and decoded
   once (ImageBitmaps where the browser has them, decoded <img> elements
   otherwise), never on Save-Data or 2G. The transition starts it the moment
   it decides to play and the sequence reads the decoded sources; after the
   entry they are released (releaseFarFromEntry). It never runs for a still
   tier (the transition does not call it there). Its own chunk: the page's
   chunk holds none of this. */

type Priority = "low" | "high";
type Connection = { saveData?: boolean; effectiveType?: string };

const sources = new Map<string, CanvasImageSource>();
let pending: Promise<boolean> | null = null;
let controller: AbortController | null = null;
let decoded = false;

/** Every file the entry paints, in fetch order. */
export const FAR_FROM_ENTRY_WARM_ASSETS: readonly string[] = [
  ...FAR_FROM_ENTRY_ASSETS,
  REXONANCE_SUIT_UNDERSUIT,
  ...FAR_FROM_ENTRY_KIT_ASSETS,
];

const saving = () => {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return (
    Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType || "")
  );
};

const close = (source: CanvasImageSource) => {
  const bitmap = source as ImageBitmap;
  if (typeof bitmap.close === "function") bitmap.close();
};

async function decode(source: string, priority: Priority, signal: AbortSignal) {
  if (sources.has(source)) return true;
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
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
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  if (signal.aborted) return false;
  sources.set(source, image);
  return true;
}

/** Fetches and decodes the entry's images and the kits' sheets once.
 * Resolves true once every one is decoded; false on Save-Data, 2G, or a
 * failed file (the transition then plays with the finished figure). */
export function warmFarFromEntry(priority: Priority = "high"): Promise<boolean> {
  if (decoded) return Promise.resolve(true);
  if (pending) return pending;
  if (typeof window === "undefined" || saving()) return Promise.resolve(false);
  const own = new AbortController();
  controller = own;
  // The fire's tables and the plan, off the entry's first frame (the
  // engine finds them made): the fire's noise and sprites, the tiles' plan,
  // and the body field from the undersuit the moment it is decoded.
  void warmNaniteFlame();
  const job = Promise.all(
    FAR_FROM_ENTRY_WARM_ASSETS.map((source) =>
      decode(source, priority, own.signal)
        .then((ok) => {
          if (ok && source === REXONANCE_SUIT_UNDERSUIT && !own.signal.aborted)
            prepareBodyFlame(sources.get(source)!, REXONANCE_SUIT_SIZE);
          return ok;
        })
        .catch(() => false),
    ),
  ).then((all) => {
    if (controller === own) controller = null;
    if (pending === job) pending = null;
    decoded = all.every(Boolean) && FAR_FROM_ENTRY_WARM_ASSETS.every((src) => sources.has(src));
    if (decoded && !own.signal.aborted) farFromEntryPlan();
    return decoded;
  });
  pending = job;
  return job;
}

/** A decoded source (null until the warm-up has it). */
export const farFromEntrySource = (source: string) => sources.get(source) ?? null;

/** Whether every file is decoded. */
export const isFarFromEntryDecoded = () => decoded;

/** After the entry: the decoded images are closed and dropped (never while
 * a decode is in flight: that is aborted first). */
export function releaseFarFromEntry() {
  if (controller) {
    const aborting = controller;
    controller = null;
    pending = null;
    aborting.abort();
  }
  for (const source of sources.values()) close(source);
  sources.clear();
  decoded = false;
}
