export const ULTRA_QUALITY_STORAGE_KEY = "dw-ultra-quality-v1";

const STORAGE_EVENT = "storage";
const isUltraQuality = (value) => value === "high" || value === "cinema";

const SERVER_SNAPSHOT = Object.freeze({
  quality: "high",
  ready: false,
  storageAvailable: false,
});
let snapshot = SERVER_SNAPSHOT;
let users = 0;
let stopWatching = null;
let sessionOverride = false;
const listeners = new Set();

const hasBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

function readPreference(fallback = "high") {
  try {
    const value = window.localStorage.getItem(ULTRA_QUALITY_STORAGE_KEY);
    if (value === null && sessionOverride) {
      return { quality: fallback, storageAvailable: true };
    }
    return { quality: isUltraQuality(value) ? value : "high", storageAvailable: true };
  } catch {
    return { quality: fallback, storageAvailable: false };
  }
}

function publish(quality, storageAvailable) {
  if (
    snapshot.ready &&
    snapshot.quality === quality &&
    snapshot.storageAvailable === storageAvailable
  )
    return;
  snapshot = Object.freeze({ quality, ready: true, storageAvailable });
  for (const notify of [...listeners]) notify();
}

/** Stable snapshots for useSyncExternalStore; reading them attaches no listeners. */
export const getUltraQualitySnapshot = () => snapshot;
export const getUltraQualityServerSnapshot = () => SERVER_SNAPSHOT;

function watchUltraQuality() {
  if (!hasBrowser()) return () => {};
  if (users++ === 0) {
    const storageChanged = (event) => {
      if (event.key !== null && event.key !== ULTRA_QUALITY_STORAGE_KEY) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        publish(snapshot.quality, false);
        return;
      }

      sessionOverride = false;
      const preference = readPreference("high");
      publish(preference.quality, preference.storageAvailable);
    };
    window.addEventListener(STORAGE_EVENT, storageChanged);
    stopWatching = () => {
      window.removeEventListener(STORAGE_EVENT, storageChanged);
    };
    if (!sessionOverride) {
      const preference = readPreference(snapshot.quality);
      publish(preference.quality, preference.storageAvailable);
    }
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (--users === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

/** @param {() => void} notify */
export function subscribeUltraQuality(notify) {
  const listener = () => notify();
  listeners.add(listener);
  const stop = watchUltraQuality();
  return () => {
    listeners.delete(listener);
    stop();
  };
}

/** Save a strict browser-local quality choice, retaining an in-memory choice on storage errors.
 * @param {"high" | "cinema"} value
 */
export function setUltraQuality(value) {
  if (!isUltraQuality(value)) throw new TypeError("Ultra quality must be 'high' or 'cinema'.");
  if (!hasBrowser()) return;

  let storageAvailable = true;
  try {
    window.localStorage.setItem(ULTRA_QUALITY_STORAGE_KEY, value);
    sessionOverride = false;
  } catch {
    storageAvailable = false;
    sessionOverride = true;
  }
  publish(value, storageAvailable);
}
