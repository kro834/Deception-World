import type { RexonanceCallSequence } from "../components/rexonance-saga/rexonance-call-sequence";

export type RexonanceTransitionRenderer = typeof RexonanceCallSequence;
type CallModule = {
  RexonanceCallSequence: RexonanceTransitionRenderer;
  /** rx17: builds the nanite engine's plan and canvases at idle. */
  prepareRexonanceSuit?: () => Promise<boolean>;
};

/** Cache successful imports, but let a failed request be retried. Each caller
 * owns its deadline/cancellation, so history cannot revive an old transition.
 * rx17: prefetch() starts (or shares) the same import ahead of time, at idle,
 * so the call's own chunk is usually there before the tap. */
export function createRexonanceTransitionLoader(load: () => Promise<CallModule>) {
  let pending: Promise<CallModule | null> | null = null;
  const fetchModule = () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .then(
          (module) => module,
          () => {
            pending = null;
            return null;
          },
        );
    }
    return pending;
  };
  const prepare = (deadlineMs = 1800) => {
    const loading = fetchModule();
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
      void loading.then((module) => finish(module ? module.RexonanceCallSequence : null));
    });
    return { promise, cancel };
  };
  return Object.assign(prepare, { prefetch: fetchModule });
}

export const prepareRexonanceTransition = createRexonanceTransitionLoader(
  () => import("../components/rexonance-saga/rexonance-call-sequence"),
);
