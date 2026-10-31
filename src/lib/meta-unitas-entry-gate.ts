import { refinedNaniteSource } from "./nanite-surface-assets.js";
import type { MetaUnitasEntrySequence } from "../components/meta-unitas-saga/meta-unitas-entry-sequence";
import { META_UNITAS_ENTRY_DURATION_MS } from "./meta-unitas-entry-playback";

/* META UNITAS SAGA's entry transformation, as the route transition screen
   sees it (2026-10-23). The shared gate (load-gate.tsx) plays it under its
   cover on an in-site navigation to /meta-unitas-saga, as it plays
   Rexonance's and Far From's; this light module is all the gate imports of
   it: the sequence's chunk (prepared with a deadline and cancellation), the
   warm-up of ミドル's pictures (behind a dynamic import, so the gate's chunk
   carries none of the scene), and the gate's two numbers. A direct load, a
   reload and Back/Forward show the page at once, with no call. */

/** Playback lasts this long after the first prepared frame (five calls,
 * ミドル complete); preparation is separate. Then reveal over `reveal`. */
export const META_UNITAS_ENTRY_TIMINGS = {
  cover: META_UNITAS_ENTRY_DURATION_MS,
  reveal: 520,
} as const;

export type MetaUnitasTransitionRenderer = typeof MetaUnitasEntrySequence;
type CallModule = { MetaUnitasEntrySequence: MetaUnitasTransitionRenderer };

let pending: Promise<CallModule | null> | null = null;
const fetchModule = () => {
  if (!pending)
    pending = import("../components/meta-unitas-saga/meta-unitas-entry-sequence").then(
      (module) => module,
      () => {
        pending = null;
        return null;
      },
    );
  return pending;
};

/** The sequence's renderer, or null after `deadlineMs` (or a cancel). */
export function prepareMetaUnitasTransition(deadlineMs = 1800) {
  let cancel = () => {};
  const promise = new Promise<MetaUnitasTransitionRenderer | null>((resolve) => {
    let settled = false;
    const finish = (renderer: MetaUnitasTransitionRenderer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(renderer);
    };
    const timer = setTimeout(() => finish(null), deadlineMs);
    cancel = () => finish(null);
    void fetchModule().then((module) => finish(module ? module.MetaUnitasEntrySequence : null));
  });
  return { promise, cancel };
}

/** Fetches and decodes the suit's pictures for the sequence (true once
 * they are in): the engine's own loads then come from the cache. */
let warm: Promise<boolean> | null = null;
export function warmMetaUnitasEntry(): Promise<boolean> {
  if (!warm)
    warm = Promise.all([import("./meta-unitas-rx-suit.ts"), import("./rexonance-nanites.ts")])
      .then(([suit, kit]) =>
        Promise.all(
          [
            ...suit.META_UNITAS_RX_ASSETS,
            suit.META_UNITAS_RX_DRIVER_STANDIN,
            ...kit.REXONANCE_NANITE_ASSETS.map(refinedNaniteSource),
          ].map((src) => {
            const image = new Image();
            image.src = src;
            return image.decode();
          }),
        ),
      )
      .then(
        () => true,
        () => {
          warm = null;
          return false;
        },
      );
  return warm;
}

/** On intent (a hover, a focus, a touch on a link to the page): the call's
 * chunk, the engine and the suit's pictures, so the entry is ready when the
 * press lands (owner, 2026-10-24: 「メタ・ウニタスの遷移が一瞬で変わるので修正して」 —
 * a cold call missed its deadline and fell back to the plain dive). */
function restrictedSpeculation() {
  if (typeof navigator === "undefined") return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return Boolean(
    connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? ""),
  );
}
export function prefetchMetaUnitasEntry() {
  if (restrictedSpeculation()) return;
  void fetchModule();
  void import("./meta-unitas-rx-engine.ts").catch(() => {});
  void warmMetaUnitasEntry();
}

/** After a page's load, in idle time: the code only (the chunk and the
 * engine, small), never the pictures. Returns the canceller. */
export function scheduleMetaUnitasEntryWarmup(): () => void {
  if (typeof window === "undefined" || restrictedSpeculation()) return () => {};
  let id = 0;
  let timer = 0;
  const run = () => {
    if (restrictedSpeculation()) return;
    id = 0;
    timer = 0;
    void fetchModule();
    void import("./meta-unitas-rx-engine.ts").catch(() => {});
    // The wearer and the driver warm site-wide at idle, as Rexonance's suit.
    void import("./meta-unitas-rx-suit.ts").then((suit) => {
      for (const src of [suit.META_UNITAS_RX_UNDERSUIT, suit.META_UNITAS_RX_DRIVER_STANDIN]) {
        const image = new Image();
        image.src = src;
      }
    });
  };
  const start = () => {
    if (typeof window.requestIdleCallback === "function")
      id = window.requestIdleCallback(run, { timeout: 1500 });
    else timer = window.setTimeout(run, 1500);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  return () => {
    window.removeEventListener("load", start);
    if (id) window.cancelIdleCallback?.(id);
    if (timer) window.clearTimeout(timer);
  };
}
