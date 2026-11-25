export const ROUTE_WARMUP_DEADLINE_MS = 12_000;

// A route preload has not changed the URL yet. If its chunk never answers,
// stop waiting before navigation starts, so the old document remains usable.
// A rejected preload is different: let the router show its error/retry page.
export function preloadRouteWithDeadline(
  load: () => Promise<unknown>,
  signal?: AbortSignal,
  { proceedOnError = true } = {},
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(cancel, ROUTE_WARMUP_DEADLINE_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    Promise.resolve()
      .then(() => (signal?.aborted ? undefined : load()))
      .then(
        () => finish(true),
        () => finish(proceedOnError),
      );
  });
}
