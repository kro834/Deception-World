export const IPAD_MENU_STORAGE_KEY = "dw-ipad-compact-menu-v1";
const CHANGE_EVENT = "dw-ipad-menu-change";

/** @param {boolean} previous @param {number} scrollY @param {boolean} locked */
export function getIpadMenuScrolled(previous, scrollY, locked = false) {
  if (locked || !Number.isFinite(scrollY)) return previous;
  if (scrollY > 80) return true;
  if (scrollY <= 16) return false;
  return previous;
}

/** @param {{ getItem: (key: string) => string | null }} storage @param {boolean} fallback */
export function readIpadMenuPreference(storage, fallback = false) {
  try {
    return storage.getItem(IPAD_MENU_STORAGE_KEY) === "1";
  } catch {
    return fallback;
  }
}

/** A primitive snapshot keeps hydration stable and useSyncExternalStore cheap. */
export function getIpadMenuSnapshot() {
  if (typeof document === "undefined") return "unavailable";
  const root = document.documentElement;
  if (root.getAttribute("data-ipad-viewport") !== "contained") return "unavailable";
  return root.getAttribute("data-ipad-menu") === "compact" ? "on" : "off";
}

export const getIpadMenuServerSnapshot = () => "unavailable";

/** @param {() => void} notify */
export function subscribeIpadMenuMode(notify) {
  window.addEventListener(CHANGE_EVENT, notify);
  return () => window.removeEventListener(CHANGE_EVENT, notify);
}

export function refreshIpadMenuMode() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Persist only a personal display setting; never modify shared gallery data.
 * @param {boolean} enabled
 */
export function setIpadMenuMode(enabled) {
  if (getIpadMenuSnapshot() === "unavailable") return;
  const root = document.documentElement;
  if (enabled) root.setAttribute("data-ipad-menu", "compact");
  else {
    root.removeAttribute("data-ipad-menu");
    root.removeAttribute("data-ipad-menu-scrolled");
  }
  try {
    window.localStorage.setItem(IPAD_MENU_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // The DOM remains the in-memory preference when storage is unavailable.
  }
  refreshIpadMenuMode();
}

/**
 * Observe the native document scroller; never replace it or change its lock.
 * Style-only observation resumes after modal locks without observing our own
 * attributes (which would create a feedback loop).
 * @param {Window & typeof globalThis} [win]
 * @param {Document} [doc]
 */
export function watchIpadMenuMode(win = window, doc = document) {
  const root = doc.documentElement;
  let frame = 0;
  let disposed = false;
  let scrolled = root.getAttribute("data-ipad-menu-scrolled") === "true";
  const isIpad = () => root.getAttribute("data-ipad-viewport") === "contained";
  const isEnabled = () => root.getAttribute("data-ipad-menu") === "compact";
  const signal = () => win.dispatchEvent(new Event(CHANGE_EVENT));
  const applyPreference = (enabled) => {
    if (enabled && isIpad()) root.setAttribute("data-ipad-menu", "compact");
    else root.removeAttribute("data-ipad-menu");
  };
  const update = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    if (disposed) return;
    if (!isIpad() || !isEnabled()) {
      scrolled = false;
      root.removeAttribute("data-ipad-menu-scrolled");
      return;
    }
    const locked = doc.body.style.position === "fixed" || root.style.overflow === "hidden";
    scrolled = getIpadMenuScrolled(scrolled, win.scrollY, locked);
    const value = scrolled ? "true" : "false";
    if (root.getAttribute("data-ipad-menu-scrolled") !== value) {
      root.setAttribute("data-ipad-menu-scrolled", value);
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = win.requestAnimationFrame(update);
  };
  const onScroll = () => {
    // Other devices and the default-off mode do not need per-scroll work.
    if (isIpad() && isEnabled()) schedule();
  };
  const storageChanged = (event) => {
    if (event.key !== null && event.key !== IPAD_MENU_STORAGE_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== win.localStorage) return;
    } catch {
      return;
    }
    applyPreference(event.key !== null && event.newValue === "1");
    update();
    signal();
  };
  if (isIpad()) {
    try {
      applyPreference(readIpadMenuPreference(win.localStorage, isEnabled()));
    } catch {
      // Accessing localStorage itself can throw in private/restricted contexts.
    }
  }
  update();
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener(CHANGE_EVENT, schedule);
  win.addEventListener("storage", storageChanged);
  const observer = new win.MutationObserver(schedule);
  observer.observe(root, { attributes: true, attributeFilter: ["style", "data-ipad-viewport"] });
  observer.observe(doc.body, { attributes: true, attributeFilter: ["style"] });
  signal();
  return () => {
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    observer.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener(CHANGE_EVENT, schedule);
    win.removeEventListener("storage", storageChanged);
  };
}
