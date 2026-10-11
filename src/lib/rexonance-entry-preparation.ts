type RexonanceEntryPreparation = {
  decoded: Promise<boolean>;
  prepare: () => Promise<boolean>;
  deadlineMs: number;
};

/**
 * Warm the real suit before its cinematic clock starts. This is an intent's
 * finite wait, not ownership of the shared decoder or plan: cancelling one
 * navigation cannot destroy work another navigation may already be using.
 */
export function prepareRexonanceEntry({ decoded, prepare, deadlineMs }: RexonanceEntryPreparation) {
  let settled = false;
  let timer = 0;
  let resolve: (ready: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    timer = 0;
    resolve(ready);
  };
  const cancel = () => finish(false);

  // Invalid or exhausted budgets must not turn into an unbounded wait.
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    finish(false);
  } else {
    timer = window.setTimeout(cancel, deadlineMs);
  }

  // Keep rejection handlers even after cancellation; a shared decode/plan
  // can fail later, without leaking an unhandled rejection or reviving us.
  void Promise.resolve(decoded)
    .then((ready) => {
      if (settled) return false;
      if (!ready) {
        finish(false);
        return false;
      }
      return prepare();
    })
    .then(
      (ready) => finish(Boolean(ready)),
      () => finish(false),
    );

  return { promise, cancel };
}
