import type { FarFromEntrySequence } from "../components/far-from-saga/far-from-entry-sequence";

/* FAR FROM SAGA's entry transformation, as the route transition screen
   sees it (owner, 2026-10-22: 「遷移画面にもレクソナンスと同じ様に変身アニメ
   ーションをつけ」). The shared gate (load-gate.tsx) plays the call under
   its cover on an in-site navigation to /far-from-saga, the way it plays
   Rexonance's (rexonance-transition-loader.ts, rexonance-suit-warmup.ts),
   and this light module is all the gate imports of it: the sequence's
   chunk, prepared with a deadline and cancellation; the warm-up of the
   suit's images and the nanite kits, behind a dynamic import so the
   gate's own chunk carries none of the fire, the plan or the atlas data;
   the still tiers; and the release after the reveal. */

export type FarFromTransitionRenderer = typeof FarFromEntrySequence;
type CallModule = { FarFromEntrySequence: FarFromTransitionRenderer };
type WarmModule = typeof import("./far-from-entry-warmup.ts");
type Priority = "low" | "high";

/** Caches a successful import and lets a failed one be retried; each
 * caller owns its deadline and cancellation, so an old transition can never
 * be revived by a late chunk. prefetch() starts (or shares) the import. */
export function createFarFromTransitionLoader(load: () => Promise<CallModule>) {
  let pending: Promise<CallModule | null> | null = null;
  const fetchModule = () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .then(
          (module) => module,
          () => {
            pending = null;
            return null;
          },
        );
    }
    return pending;
  };
  const prepare = (deadlineMs = 1800) => {
    const loading = fetchModule();
    let cancel = () => {};
    const promise = new Promise<FarFromTransitionRenderer | null>((resolve) => {
      let settled = false;
      const finish = (renderer: FarFromTransitionRenderer | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(renderer);
      };
      const timer = setTimeout(() => finish(null), deadlineMs);
      cancel = () => finish(null);
      void loading.then((module) => finish(module ? module.FarFromEntrySequence : null));
    });
    return { promise, cancel };
  };
  return Object.assign(prepare, { prefetch: fetchModule });
}

export const prepareFarFromTransition = createFarFromTransitionLoader(
  () => import("../components/far-from-saga/far-from-entry-sequence"),
);

type Connection = { saveData?: boolean; effectiveType?: string };
/** The still tiers: the call rests on the finished figure, and nothing
 * heavy is fetched (prefers-reduced-motion, forced colours, economy,
 * Save-Data and 2G). */
export function isFarFromEntryStill() {
  if (typeof window === "undefined") return true;
  const media = (query: string) => Boolean(window.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)") || media("(forced-colors: active)")) return true;
  if (document.documentElement.dataset.worldEffects === "economy") return true;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  return (
    Boolean(connection?.saveData) || ["slow-2g", "2g"].includes(connection?.effectiveType || "")
  );
}

let warmModule: Promise<WarmModule | null> | null = null;
const loadWarm = () => {
  if (!warmModule)
    warmModule = import("./far-from-entry-warmup.ts").then(
      (module) => module,
      () => {
        warmModule = null;
        return null;
      },
    );
  return warmModule;
};

/** The suit's images, the kits' sheets, the fire's tables and the plan,
 * decoded once (far-from-entry-warmup.ts, its own chunk). Resolves true
 * when every one is there; false on a still tier or a failed file (the
 * call then plays with the finished figure). */
export function warmFarFromEntry(priority: Priority = "high"): Promise<boolean> {
  if (isFarFromEntryStill()) return Promise.resolve(false);
  return loadWarm().then((module) => (module ? module.warmFarFromEntry(priority) : false));
}

/** Intent (a hover, a focus, a touch on a link to /far-from-saga): the
 * sequence's chunk and the images start now, so the tap finds them. */
export function prefetchFarFromEntry() {
  void prepareFarFromTransition.prefetch();
  void warmFarFromEntry("high");
}

/** After the reveal: the decoded images are let go (the next navigation
 * decodes them again, from the browser's cache). */
export function releaseFarFromEntry() {
  if (!warmModule) return;
  void warmModule.then((module) => module?.releaseFarFromEntry());
}
