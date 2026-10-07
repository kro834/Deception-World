export const ULTRA_MODE_STORAGE_KEY = "dw-ultra-mode-v1";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FORCED_COLORS = "(forced-colors: active)";
const REDUCED_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";
const MORE_CONTRAST = "(prefers-contrast: more)";
const ACCESSIBILITY_QUERIES = [REDUCED_MOTION, FORCED_COLORS, REDUCED_TRANSPARENCY, MORE_CONTRAST];
const SERVER_SNAPSHOT = Object.freeze({
  enabled: false,
  motionAllowed: false,
  ready: false,
  storageAvailable: false,
});
let snapshot = SERVER_SNAPSHOT;
let users = 0;
let stopWatching = null;
let media = null;
const listeners = new Set();

const hasBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

function readPreference(fallback = false) {
  try {
    return {
      enabled: window.localStorage.getItem(ULTRA_MODE_STORAGE_KEY) === "true",
      storageAvailable: true,
    };
  } catch {
    return { enabled: fallback, storageAvailable: false };
  }
}

function readMotionAllowed() {
  try {
    const queries = media || ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
    return !queries.some((query) => query.matches);
  } catch {
    // Unknown accessibility preferences keep animated enhancements disabled.
    return false;
  }
}

function publish(enabled, storageAvailable) {
  const motionAllowed = readMotionAllowed();
  const root = document.documentElement;
  if (enabled) root.setAttribute("data-ultra-mode", "on");
  else root.removeAttribute("data-ultra-mode");
  if (enabled && motionAllowed) root.setAttribute("data-ultra-motion", "on");
  else root.removeAttribute("data-ultra-motion");
  if (
    snapshot.ready &&
    snapshot.enabled === enabled &&
    snapshot.motionAllowed === motionAllowed &&
    snapshot.storageAvailable === storageAvailable
  )
    return;
  snapshot = Object.freeze({ enabled, motionAllowed, ready: true, storageAvailable });
  for (const notify of [...listeners]) notify();
}

/** Stable snapshots for React useSyncExternalStore. Reading never attaches listeners. */
export const getUltraModeSnapshot = () => snapshot;
export const getUltraModeServerSnapshot = () => SERVER_SNAPSHOT;

/** Retain one shared browser observer; the last owner releases every listener. */
export function watchUltraMode() {
  if (!hasBrowser()) return () => {};
  if (users++ === 0) {
    const cleanups = [];
    try {
      media = ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
    } catch {
      media = null;
    }
    const motionChanged = () => publish(snapshot.enabled, snapshot.storageAvailable);
    for (const query of media || []) {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", motionChanged);
        cleanups.push(() => query.removeEventListener("change", motionChanged));
      } else if (typeof query.addListener === "function") {
        query.addListener(motionChanged);
        cleanups.push(() => query.removeListener(motionChanged));
      }
    }
    const storageChanged = (event) => {
      if (event.key !== null && event.key !== ULTRA_MODE_STORAGE_KEY) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        publish(snapshot.enabled, false);
        return;
      }
      publish(event.key !== null && event.newValue === "true", true);
    };
    window.addEventListener("storage", storageChanged);
    cleanups.push(() => window.removeEventListener("storage", storageChanged));
    stopWatching = () => {
      for (const cleanup of cleanups) cleanup();
      media = null;
    };
    const preference = readPreference(snapshot.enabled);
    publish(preference.enabled, preference.storageAvailable);
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
export function subscribeUltraMode(notify) {
  // A wrapper lets independent subscriptions share the same callback safely.
  const listener = () => notify();
  listeners.add(listener);
  const stop = watchUltraMode();
  return () => {
    listeners.delete(listener);
    stop();
  };
}

/** Personal browser preference only. DOM and subscribers update synchronously.
 * @param {boolean} enabled
 */
export function setUltraMode(enabled) {
  if (!hasBrowser()) return;
  const next = enabled === true;
  let storageAvailable = true;
  try {
    window.localStorage.setItem(ULTRA_MODE_STORAGE_KEY, next ? "true" : "false");
  } catch {
    storageAvailable = false;
  }
  publish(next, storageAvailable);
}

/** ES5 prepaint gate: only an explicitly saved boolean enables Ultra. */
export const ULTRA_MODE_BOOTSTRAP_SCRIPT = `(function(){var r=document.documentElement,e=false,m=false;try{e=window.localStorage.getItem(${JSON.stringify(ULTRA_MODE_STORAGE_KEY)})==="true";}catch(_){}try{m=${ACCESSIBILITY_QUERIES.map((query) => `!window.matchMedia(${JSON.stringify(query)}).matches`).join("&&")};}catch(_){}if(e){r.setAttribute("data-ultra-mode","on");}else{r.removeAttribute("data-ultra-mode");}if(e&&m){r.setAttribute("data-ultra-motion","on");}else{r.removeAttribute("data-ultra-motion");}})();`;
