/** Decorative time is optional; destination readiness is always owned by the router. */
export function createTransitionDecorationClock(
  timers: Pick<Window, "setTimeout" | "clearTimeout">,
) {
  const pending = new Map<number, () => void>();
  let skipped = false;
  let release!: () => void;
  const interrupted = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    get skipped() {
      return skipped;
    },
    skip() {
      if (!skipped) {
        skipped = true;
        pending.forEach((finish, timer) => {
          timers.clearTimeout(timer);
          finish();
        });
        pending.clear();
        release();
      }
    },
    delay(duration: number): Promise<void> {
      if (skipped) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = timers.setTimeout(() => {
          pending.delete(timer);
          resolve();
        }, duration);
        pending.set(timer, resolve);
      });
    },
    async wait<T>(decoration: Promise<T>): Promise<T | void> {
      if (skipped) return;
      return Promise.race([decoration, interrupted]);
    },
  };
}
