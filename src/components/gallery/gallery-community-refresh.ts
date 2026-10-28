type Reason = "event" | "poll" | "reload";

/** One collection reader per authentication scope. Event bursts may reuse a
 * recent success; polling and explicit reloads retain their freshness rules. */
export function createGalleryCommunityRefresh<T>({
  read,
  onSuccess,
  onError,
  now = Date.now,
  eventCoalesceMs = 1000,
}: {
  read: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  now?: () => number;
  eventCoalesceMs?: number;
}) {
  let disposed = false;
  let revision = 0;
  let lastSuccess = -Infinity;
  let flight: Promise<boolean> | null = null;
  let queuedReload: Promise<boolean> | null = null;

  const run = () => {
    const current = revision;
    const pending = Promise.resolve()
      .then(() => {
        if (disposed || current !== revision) throw new Error("Superseded gallery refresh");
        return read();
      })
      .then((collection) => {
        if (disposed || current !== revision) return false;
        onSuccess(collection);
        lastSuccess = now();
        return true;
      })
      .catch((error: unknown) => {
        if (!disposed && current === revision) {
          lastSuccess = -Infinity;
          onError(error);
        }
        return false;
      })
      .finally(() => {
        if (flight === pending) flight = null;
      });
    flight = pending;
    return pending;
  };

  const refresh = (reason: Reason = "reload"): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (queuedReload) return queuedReload;
    if (flight) {
      if (reason !== "reload") return queuedReload ?? flight;
      if (!queuedReload) {
        // A write or explicit reload must observe a request started after it,
        // rather than reuse a snapshot already travelling back from the server.
        revision++;
        queuedReload = flight.then(() => {
          queuedReload = null;
          return disposed ? false : run();
        });
      }
      return queuedReload;
    }
    const age = now() - lastSuccess;
    if (reason === "event" && age >= 0 && age < eventCoalesceMs) return Promise.resolve(true);
    return run();
  };

  return {
    refresh,
    dispose() {
      disposed = true;
      revision++;
    },
  };
}
