/** Cancellable assembly playback: preparation never spends the visual clock.
 * A renderer starts it only when its first frame is ready, and explicitly
 * completes after its final painted frame. Both deadlines release on failure. */
export const ENTRY_PREPARE_MS = 20_000;
export type EntryResult = "complete" | "skipped" | "unavailable" | "cancelled";

export function createEntryPlayback(
  clock = {
    setTimeout: (run: () => void, ms: number) => globalThis.setTimeout(run, ms),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
  },
) {
  let resolve!: (result: EntryResult) => void;
  const promise = new Promise<EntryResult>((done) => {
    resolve = done;
  });
  let state: "preparing" | "playing" | EntryResult = "preparing";
  let started: number | null = null;
  const settle = (result: EntryResult) => {
    if (state !== "preparing" && state !== "playing") return;
    state = result;
    clock.clearTimeout(timer);
    resolve(result);
  };
  let timer = clock.setTimeout(() => settle("unavailable"), ENTRY_PREPARE_MS);
  return {
    promise,
    get state() {
      return state;
    },
    frame(now: number): number | null {
      if (state === "preparing") {
        state = "playing";
        started = now;
        clock.clearTimeout(timer);
        // A stalled scene (an engine that never goes live) must not leave
        // navigation locked indefinitely.
        timer = clock.setTimeout(() => settle("unavailable"), ENTRY_PREPARE_MS);
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

export type EntryPlayback = ReturnType<typeof createEntryPlayback>;
