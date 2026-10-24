/** Compact Illusionculum's full-resolution sources, decoded once and in pairs.
 * Completed sources belong to the caller; this loader retains only pending work. */
export function createIllusionculumImageLoader(environment = globalThis) {
  const pending = new Map();
  const queue = [];
  let active = 0;
  let disposed = false;
  const timers = {
    set: environment.setTimeout?.bind(environment) ?? setTimeout,
    clear: environment.clearTimeout?.bind(environment) ?? clearTimeout,
  };
  const cancelError = () => new Error("Illusionculum image request cancelled");
  const fallback = (src, signal) =>
    new Promise((resolve, reject) => {
      const ImageClass = environment.Image;
      if (!ImageClass || signal.aborted) {
        reject(cancelError());
        return;
      }
      const image = new ImageClass();
      image.decoding = "async";
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        image.onload = image.onerror = null;
        signal.removeEventListener("abort", abort);
        // A successful image is the source itself: retain its src until the
        // engine releases it. Failed/cancelled requests must release theirs.
        if (error) {
          image.src = "";
          reject(error);
        } else resolve(image);
      };
      const abort = () => finish(cancelError());
      signal.addEventListener("abort", abort, { once: true });
      image.onload = () => finish(image.naturalWidth > 0 ? null : new Error("Empty image"));
      image.onerror = () => finish(new Error("Illusionculum image failed"));
      image.src = src;
    });
  const read = async (job) => {
    const signal = job.controller.signal;
    if (
      typeof environment.createImageBitmap === "function" &&
      typeof environment.fetch === "function"
    ) {
      try {
        const response = await environment.fetch(job.src, {
          cache: "force-cache",
          mode: "same-origin",
          credentials: "same-origin",
          signal,
        });
        if (!response.ok) throw new Error("Illusionculum image fetch failed");
        const blob = await response.blob();
        if (signal.aborted) throw cancelError();
        const bitmap = await environment.createImageBitmap(blob);
        if (signal.aborted || disposed || job.settled) {
          bitmap.close?.();
          throw cancelError();
        }
        return bitmap;
      } catch (error) {
        if (signal.aborted || disposed || job.settled) throw error;
        return fallback(job.src, signal);
      }
    }
    return fallback(job.src, signal);
  };
  const pump = () => {
    while (!disposed && active < 2 && queue.length) {
      const job = queue.shift();
      if (job.settled) continue;
      active += 1;
      void read(job)
        .then(
          (source) => {
            if (job.settled || disposed) source.close?.();
            else job.finish(null, source);
          },
          (error) => job.finish(error),
        )
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return {
    load(src) {
      if (disposed) return Promise.reject(cancelError());
      if (pending.has(src)) return pending.get(src).promise;
      const controller = new AbortController();
      const job = { src, controller, settled: false, promise: null, finish: null };
      job.promise = new Promise((resolve, reject) => {
        job.finish = (error, source) => {
          if (job.settled) return;
          job.settled = true;
          timers.clear(job.timer);
          if (pending.get(src) === job) pending.delete(src);
          if (error) {
            controller.abort();
            reject(error);
          } else resolve(source);
        };
        job.timer = timers.set(() => job.finish(new Error("Illusionculum image timeout")), 8000);
      });
      pending.set(src, job);
      queue.push(job);
      pump();
      return job.promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of pending.values()) job.finish(cancelError());
      queue.length = 0;
    },
  };
}
