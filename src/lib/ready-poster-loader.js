/**
 * Share in-flight poster requests and only publish decoded images. Failed or
 * timed-out requests remain retryable; disposing also settles their callers.
 * @param {(image: HTMLImageElement, source: string) => void} prepare
 * @param {{ ImageClass?: typeof Image, clock?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>, timeout?: number }} options
 */
export function createReadyPosterLoader(prepare, options = {}) {
  const ImageClass = options.ImageClass ?? globalThis.Image;
  const clock = options.clock ?? globalThis;
  const pending = new Map();
  let disposed = false;

  return {
    /** @param {string} source @param {'high' | 'low'} priority @returns {Promise<boolean>} */
    load(source, priority = "high") {
      if (disposed) return Promise.resolve(false);
      const existing = pending.get(source);
      if (existing) {
        if (priority === "high") existing.image.fetchPriority = priority;
        return existing.promise;
      }
      const image = new ImageClass();
      image.decoding = "async";
      image.fetchPriority = priority;
      let settle;
      const promise = new Promise((resolve) => { settle = resolve; });
      let finished = false;
      let timer;
      const finish = (ready) => {
        if (finished) return;
        finished = true;
        clock.clearTimeout(timer);
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", failed);
        pending.delete(source);
        settle(ready);
      };
      const failed = () => finish(false);
      const loaded = () => {
        if (typeof image.decode !== "function") {
          finish(image.complete && image.naturalWidth > 0);
          return;
        }
        void image.decode().then(
          () => finish(image.naturalWidth > 0),
          () => finish(image.complete && image.naturalWidth > 0),
        );
      };
      pending.set(source, { promise, image, cancel: failed });
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", failed, { once: true });
      timer = clock.setTimeout(failed, options.timeout ?? 8000);
      prepare(image, source);
      if (image.complete && image.naturalWidth > 0) loaded();
      return promise;
    },
    dispose() {
      disposed = true;
      for (const request of pending.values()) request.cancel();
    },
  };
}
