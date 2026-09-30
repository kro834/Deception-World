export const ROUTE_WARMUP_DEADLINE_MS = 12_000;

// A route preload has not changed the URL yet. If its chunk never answers,
// stop waiting before navigation starts, so the old document remains usable.
// A rejected preload is different: let the router show its error/retry page.
export function preloadRouteWithDeadline(load: () => Promise<unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), ROUTE_WARMUP_DEADLINE_MS);
    Promise.resolve()
      .then(load)
      .then(
        () => finish(true),
        () => finish(true),
      );
  });
}
