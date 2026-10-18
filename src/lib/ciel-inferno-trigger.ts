/** A deliberate, session-only secret. No timers, DOM or persisted counters. */
export const CIEL_INFERNO_TAPS = 10;
export const CIEL_INFERNO_GAP_MS = 550;
export const CIEL_INFERNO_WINDOW_MS = 4000;

export type CielInfernoTapResult = {
  count: number;
  primed: boolean;
  triggered: boolean;
};

export function createCielInfernoTrigger() {
  let count = 0;
  let first = 0;
  let last = -Infinity;
  let locked = false;
  const reset = () => {
    count = 0;
    first = 0;
    last = -Infinity;
    locked = false;
  };
  return {
    reset,
    tap(now: number): CielInfernoTapResult {
      if (!Number.isFinite(now) || now < 0) {
        if (!locked) reset();
        return { count, primed: false, triggered: false };
      }
      if (locked) return { count, primed: false, triggered: false };
      if (now < last || now - last > CIEL_INFERNO_GAP_MS || now - first > CIEL_INFERNO_WINDOW_MS)
        count = 0;
      if (count === 0) first = now;
      last = now;
      count += 1;
      const triggered = count === CIEL_INFERNO_TAPS;
      if (triggered) locked = true;
      return { count, primed: count >= 3, triggered };
    },
  };
}
