/** A lazy chunk's import that does not give up on the first failure (owner,
 * 2026-10-23: 「自動変身再生が必ず読み込まれ、正常に動作する様にして。」).
 *
 * `importWithRetry(load)` runs `load()` (a dynamic import), and when it
 * fails or does not settle within `timeoutMs`, tries again after a backoff
 * (`delays`), up to `attempts` times. A failed module fetch stays in the
 * browser's module map (the same URL rejects again without a request), so
 * a retry after a failure names the chunk's URL with a cache-busting query
 * when the error gives it (Chromium and Firefox name it in the message; the
 * rest retry `load()` as it is). A timed-out attempt keeps running: if it
 * lands later, its module is taken. Every failure is reported through
 * `onError` (never silent); the last one rejects.
 */

/** The backoff before each retry (ms): the first retry quickly, then longer. */
export const CHUNK_RETRY_DELAYS = Object.freeze([400, 1200, 3000, 6000]);
/** The tries, the first one included. */
export const CHUNK_RETRY_ATTEMPTS = 5;
/** How long (ms) one try may take before the next one starts. */
export const CHUNK_RETRY_TIMEOUT_MS = 15000;

/** The chunk's URL in a failed dynamic import's message, if it names one. */
export function failedChunkUrl(error) {
  const message = String(error?.message ?? error ?? "");
  const match = message.match(/(https?:\/\/[^\s'"]+?\.m?js)(?:\?[^\s'"]*)?(?=$|[\s'"])/);
  return match ? match[1] : null;
}

/**
 * @template T
 * @param {() => Promise<T>} load
 * @param {{
 *   attempts?: number,
 *   delays?: readonly number[],
 *   timeoutMs?: number,
 *   isCancelled?: () => boolean,
 *   onError?: (error: unknown, attempt: number) => void,
 *   importUrl?: (url: string) => Promise<T>,
 *   setTimer?: (callback: () => void, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 * }} [options]
 * @returns {Promise<T>}
 */
export function importWithRetry(load, options = {}) {
  const attempts = Math.max(1, options.attempts ?? CHUNK_RETRY_ATTEMPTS);
  const delays = options.delays ?? CHUNK_RETRY_DELAYS;
  const timeoutMs = options.timeoutMs ?? CHUNK_RETRY_TIMEOUT_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((id) => globalThis.clearTimeout(id));
  const importUrl =
    options.importUrl ?? ((url) => import(/* @vite-ignore */ /** @type {string} */ (url)));
  const cancelled = options.isCancelled ?? (() => false);
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastUrl = null;
    const succeed = (module) => {
      if (settled) return;
      settled = true;
      resolve(module);
    };
    const attempt = (index) => {
      if (settled) return;
      if (cancelled()) {
        settled = true;
        reject(new Error("chunk import cancelled"));
        return;
      }
      let done = false;
      let timer = 0;
      const fail = (error) => {
        if (done || settled) return;
        done = true;
        clearTimer(timer);
        lastUrl = failedChunkUrl(error) ?? lastUrl;
        options.onError?.(error, index + 1);
        if (index + 1 >= attempts) {
          settled = true;
          reject(error);
          return;
        }
        setTimer(() => attempt(index + 1), delays[Math.min(index, delays.length - 1)] ?? 1000);
      };
      let pending;
      try {
        pending =
          index > 0 && lastUrl
            ? importUrl(`${lastUrl}?retry=${index}-${Date.now().toString(36)}`)
            : load();
      } catch (error) {
        pending = Promise.reject(error);
      }
      // A slow try is not abandoned: its module is taken whenever it lands.
      Promise.resolve(pending).then((module) => {
        if (!done) {
          done = true;
          clearTimer(timer);
        }
        succeed(module);
      }, fail);
      if (timeoutMs > 0)
        timer = setTimer(() => fail(new Error(`chunk import timed out after ${timeoutMs} ms`)), timeoutMs);
    };
    attempt(0);
  });
}
