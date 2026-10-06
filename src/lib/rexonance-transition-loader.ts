import type { RexonanceCallSequence } from "../components/rexonance-saga/rexonance-call-sequence";

export type RexonanceTransitionRenderer = typeof RexonanceCallSequence;
type CallModule = { RexonanceCallSequence: RexonanceTransitionRenderer };

/** Cache successful imports, but let a failed request be retried. Each caller
 * owns its deadline/cancellation, so history cannot revive an old transition. */
export function createRexonanceTransitionLoader(load: () => Promise<CallModule>) {
  let pending: Promise<RexonanceTransitionRenderer | null> | null = null;
  return (deadlineMs = 1800) => {
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .then(
          (module) => module.RexonanceCallSequence,
          () => {
            pending = null;
            return null;
          },
        );
    }
    let cancel = () => {};
    const promise = new Promise<RexonanceTransitionRenderer | null>((resolve) => {
      let settled = false;
      const finish = (renderer: RexonanceTransitionRenderer | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(renderer);
      };
      const timer = setTimeout(() => finish(null), deadlineMs);
      cancel = () => finish(null);
      void pending!.then(finish);
    });
    return { promise, cancel };
  };
}

export const prepareRexonanceTransition = createRexonanceTransitionLoader(
  () => import("../components/rexonance-saga/rexonance-call-sequence"),
);
