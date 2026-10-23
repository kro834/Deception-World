import type { MetaUnitasEntrySequence } from "../components/meta-unitas-saga/meta-unitas-entry-sequence";

/* META UNITAS SAGA's entry transformation, as the route transition screen
   sees it (2026-10-23). The shared gate (load-gate.tsx) plays it under its
   cover on an in-site navigation to /meta-unitas-saga, as it plays
   Rexonance's and Far From's; this light module is all the gate imports of
   it: the sequence's chunk (prepared with a deadline and cancellation), the
   warm-up of ミドル's pictures (behind a dynamic import, so the gate's chunk
   carries none of the scene), and the gate's two numbers. A direct load, a
   reload and Back/Forward show the page at once, with no call. */

/** The gate covers the page this long (the five calls, ミドル complete),
 * then reveals it over `reveal`. */
export const META_UNITAS_ENTRY_TIMINGS = { cover: 3000, reveal: 520 } as const;

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

/** Decodes ミドル's pictures for the sequence (true once they are in). */
export function warmMetaUnitasEntry(): Promise<boolean> {
  return import("./meta-unitas-entry-pictures.ts").then(
    (module) => module.warmMetaUnitasPictures(),
    () => false,
  );
}
