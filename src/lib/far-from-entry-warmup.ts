import { REXONANCE_SUIT_SIZE, REXONANCE_SUIT_UNDERSUIT } from "./rexonance-suit";
import { FAR_FROM_ENTRY_ASSETS } from "./far-from-entry-suit";
import { FAR_FROM_ENTRY_KIT_ASSETS } from "./far-from-entry-kits";
import { prepareBodyFlame, warmNaniteFlame } from "./rexonance-flame.js";
import { farFromEntryPlan } from "../components/far-from-saga/far-from-entry-plan";

/* FAR FROM SAGA's entry warm-up (owner, 2026-10-22): the entry's images
   (the plates' atlas, the finished figure, the crystals' light, the shared
   Rexonance undersuit) and the nanite kits' sheets, fetched and decoded
   once (ImageBitmaps where the browser has them, decoded off the main
   thread; decoded <img> elements otherwise), never on Save-Data or 2G. The
   transition starts it the moment it decides to play (or on intent) and
   the sequence reads the decoded sources.

   2026-10-24 (owner: 「遷移アニメーションの読み込みを高速化したりして安定化
   して」): every try of a file has its own deadline and a failed or stalled
   one is retried, so a stalled file can never hold the warm-up (and with
   it every later entry of the session) forever; a file already decoded is
   never fetched again; and the decoded images are kept for the session
   (a repeated entry, Back and Forward start from the first frame with no
   fetch and no decode), except on a low-memory device, which lets them go
   after the entry (releaseFarFromEntry). It never runs for a still tier
   (the transition does not call it there). Its own chunk: the page's chunk
   holds none of this. */

type Priority = "low" | "high";
type Connection = { saveData?: boolean; effectiveType?: string };

const sources = new Map<string, CanvasImageSource>();
const urls = new Map<string, string>();
let pending: Promise<boolean> | null = null;
let controller: AbortController | null = null;
let decoded = false;

/** Every file the entry paints, in fetch order. */
export const FAR_FROM_ENTRY_WARM_ASSETS: readonly string[] = [
  ...FAR_FROM_ENTRY_ASSETS,
  REXONANCE_SUIT_UNDERSUIT,
  ...FAR_FROM_ENTRY_KIT_ASSETS,
];

/** One try of a file may take this long (ms) before it is aborted and
 * tried again. */
export const FAR_FROM_ENTRY_FETCH_TIMEOUT_MS = 6000;
/** The backoff before each retry of a failed or stalled file (ms). */
export const FAR_FROM_ENTRY_FETCH_RETRIES: readonly number[] = [300, 1200];

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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

async function decodeOnce(source: string, priority: Priority, signal: AbortSignal) {
  // Each try has its own deadline, tied to the warm-up's own abort.
  const attempt = new AbortController();
  const abort = () => attempt.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, FAR_FROM_ENTRY_FETCH_TIMEOUT_MS);
  let rejectOnAbort: (() => void) | undefined;
  try {
    const work = async () => {
      if (typeof createImageBitmap === "function" && typeof fetch === "function") {
        const response = await fetch(source, { priority, signal: attempt.signal } as RequestInit);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (attempt.signal.aborted) throw new Error("aborted");
        const bitmap = await createImageBitmap(blob);
        if (attempt.signal.aborted) {
          bitmap.close?.();
          return false;
        }
        sources.set(source, bitmap);
        // The call's DOM layers (the finished figure, the undersuit) paint
        // from the same bytes, never a second download of the file.
        if (typeof URL.createObjectURL === "function" && !urls.has(source))
          urls.set(source, URL.createObjectURL(blob));
        return true;
      }
      const image = new Image();
      image.decoding = "async";
      image.src = source;
      await image.decode();
      if (attempt.signal.aborted) return false;
      sources.set(source, image);
      return true;
    };
    const aborted = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(new Error("aborted"));
      if (attempt.signal.aborted) rejectOnAbort();
      else attempt.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    return await Promise.race([work(), aborted]);
  } finally {
    clearTimeout(timer);
    if (rejectOnAbort) attempt.signal.removeEventListener("abort", rejectOnAbort);
    signal.removeEventListener("abort", abort);
  }
}

/** A file, decoded once per session; a failed or stalled try is retried
 * after FAR_FROM_ENTRY_FETCH_RETRIES, and the last failure rejects. */
async function decode(source: string, priority: Priority, signal: AbortSignal) {
  if (sources.has(source)) return true;
  for (let index = 0; ; index++) {
    if (signal.aborted) return false;
    try {
      return await decodeOnce(source, priority, signal);
    } catch (error) {
      if (signal.aborted || index >= FAR_FROM_ENTRY_FETCH_RETRIES.length) throw error;
      await sleep(FAR_FROM_ENTRY_FETCH_RETRIES[index], signal);
    }
  }
}

/** Fetches and decodes the entry's images and the kits' sheets once.
 * Resolves true once every one is decoded; false on Save-Data, 2G, or a
 * file that failed every try (the transition then plays with the finished
 * figure, and the next entry fetches only what is missing). */
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
    FAR_FROM_ENTRY_WARM_ASSETS.map((source) => {
      const had = sources.has(source);
      return decode(source, priority, own.signal)
        .then((ok) => {
          if (ok && !had && source === REXONANCE_SUIT_UNDERSUIT && !own.signal.aborted)
            prepareBodyFlame(sources.get(source)!, REXONANCE_SUIT_SIZE);
          return ok;
        })
        .catch(() => false);
    }),
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

/** A file's URL for a DOM layer: the warm-up's own bytes (an object URL)
 * once fetched, else the file's path. */
export const farFromEntryUrl = (source: string) => urls.get(source) ?? source;

/** Whether every file is decoded. */
export const isFarFromEntryDecoded = () => decoded;

/** Whether the decoded images stay for the session: everywhere but a
 * low-memory device (navigator.deviceMemory of 2 GB or less). */
export function keepsFarFromEntry() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !(typeof memory === "number" && memory <= 2);
}

/** After the entry. Where the images stay for the session, nothing is let
 * go (a decode still in flight finishes, within its bounded tries, for the
 * next entry). On a low-memory device, or when forced, a decode in flight
 * is aborted and the decoded images are closed and dropped. */
export function releaseFarFromEntry(force = false) {
  if (!force && keepsFarFromEntry()) return;
  if (controller) {
    const aborting = controller;
    controller = null;
    pending = null;
    aborting.abort();
  }
  for (const source of sources.values()) close(source);
  sources.clear();
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  decoded = false;
}
