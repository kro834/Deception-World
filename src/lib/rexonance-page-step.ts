type StepEnvironment = Pick<Window, "setTimeout" | "clearTimeout"> &
  Partial<Pick<Window, "requestIdleCallback" | "cancelIdleCallback">> & {
    document: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
  };

/** Idle is an optimization, not a prerequisite for mounting visible chapters. */
export function scheduleRexonancePageStep(
  callback: () => void,
  delayMs = 32,
  env: StepEnvironment = window,
) {
  let finished = false;
  let idle = 0;
  let timer = 0;
  const clear = () => {
    if (idle) env.cancelIdleCallback?.(idle);
    if (timer) env.clearTimeout(timer);
    idle = timer = 0;
  };
  const dispose = () => {
    finished = true;
    clear();
    env.document.removeEventListener("visibilitychange", visibility);
  };
  const run = () => {
    clear();
    if (finished || env.document.hidden) return;
    dispose();
    callback();
  };
  const queue = () => {
    if (finished || env.document.hidden) return;
    // This timer is independent of rIC's advisory timeout: some WebKit and
    // busy-page schedulers retain the idle request without invoking it.
    timer = env.setTimeout(run, env.requestIdleCallback ? 260 : delayMs);
    if (env.requestIdleCallback) {
      try {
        idle = env.requestIdleCallback(run, { timeout: 220 });
      } catch {
        // The already-queued timer remains the bounded fallback.
      }
    }
  };
  function visibility() {
    clear();
    if (!env.document.hidden) queue();
  }
  env.document.addEventListener("visibilitychange", visibility);
  queue();
  return dispose;
}
