/** Cancelable visual waits: a suspended tab must not leave the launcher busy. */
export function waitForFloatingButtonPaint(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let frame = 0;
    let timer = 0;
    const finish = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve(!signal.aborted);
    };
    signal.addEventListener("abort", finish, { once: true });
    frame = window.requestAnimationFrame(finish);
    // One frame normally wins. The fallback also handles throttled rendering.
    timer = window.setTimeout(finish, 100);
  });
}

export function waitForFloatingButtonDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve(!signal.aborted);
    };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}
