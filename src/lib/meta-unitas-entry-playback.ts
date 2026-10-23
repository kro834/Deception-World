/** One navigation owns both the scene's clock and the cover's lifetime.
 * Preparation is not playback: slow downloads must never spend the call.
 * A failed/stalled scene returns to the source page with a retry link;
 * only completion or an explicit skip may advance to the destination. */
export const META_UNITAS_ENTRY_DURATION_MS = 3090;
export const META_UNITAS_ENTRY_PREPARE_MS = 20_000;
export type MetaUnitasEntryResult = "complete" | "skipped" | "unavailable" | "cancelled";

export function createMetaUnitasEntryPlayback(
  clock = {
    setTimeout: (run: () => void, ms: number) => globalThis.setTimeout(run, ms),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
  },
) {
  let resolve!: (result: MetaUnitasEntryResult) => void;
  const promise = new Promise<MetaUnitasEntryResult>((done) => {
    resolve = done;
  });
  let state: "preparing" | "playing" | MetaUnitasEntryResult = "preparing";
  let started: number | null = null;
  const settle = (result: MetaUnitasEntryResult) => {
    if (state !== "preparing" && state !== "playing") return;
    state = result;
    clock.clearTimeout(timer);
    resolve(result);
  };
  let timer = clock.setTimeout(() => settle("unavailable"), META_UNITAS_ENTRY_PREPARE_MS);
  return {
    promise,
    get state() {
      return state;
    },
    frame(now: number, ready: boolean): number | null {
      if (state === "preparing") {
        if (!ready) return null;
        state = "playing";
        started = now;
        clock.clearTimeout(timer);
        // A stopped renderer must not leave navigation locked indefinitely.
        timer = clock.setTimeout(() => settle("unavailable"), 10_000);
      }
      return state === "playing" && started !== null ? Math.max(0, now - started) : null;
    },
    complete: () => {
      if (state === "playing") settle("complete");
    },
    skip: () => settle("skipped"),
    fail: () => settle("unavailable"),
    cancel: () => settle("cancelled"),
  };
}

export type MetaUnitasEntryPlayback = ReturnType<typeof createMetaUnitasEntryPlayback>;
