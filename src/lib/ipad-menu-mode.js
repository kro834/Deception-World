export const IPAD_MENU_STORAGE_KEY = "dw-ipad-compact-menu-v1";
const CHANGE_EVENT = "dw-ipad-menu-change";
export const IPAD_MENU_MOTION_SETTLE_MS = 900;
const HEADER_SELECTORS = {
  gallery: ".gallery-topbar",
  world: ".topbar",
  dream: ".dream-site-header",
};

/** The compact trigger replaces the chrome only once its complete measured
 * height has scrolled out, including Dream's separate navigation row.
 * @param {boolean} previous @param {number} scrollY @param {number} exitDistance
 * @param {boolean} locked
 */
export function getIpadMenuScrolled(previous, scrollY, exitDistance, locked = false) {
  if (locked || !Number.isFinite(scrollY)) return previous;
  return Number.isFinite(exitDistance) && exitDistance > 0 && scrollY >= exitDistance;
}

/** A header-to-floating vector in CSS pixels, read only at a real scroll
 * boundary. Invalid/detached geometry must not launch a viewport-sized streak.
 * @param {{left:number,top:number,width:number,height:number}|null} headerRect
 * @param {{left:number,top:number,width:number,height:number}|null} floatingRect
 * @param {{width:number,height:number}} viewport
 */
export function getIpadMenuMotionGeometry(headerRect, floatingRect, viewport) {
  if (!headerRect || !floatingRect || !viewport) return null;
  const rects = [headerRect, floatingRect];
  if (
    rects.some(
      (rect) =>
        ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 ||
        rect.height <= 0,
    )
  )
    return null;
  if (
    ![viewport.width, viewport.height].every(Number.isFinite) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return null;
  const x = headerRect.left + headerRect.width / 2 - floatingRect.left - floatingRect.width / 2;
  const y = headerRect.top + headerRect.height / 2 - floatingRect.top - floatingRect.height / 2;
  const round = (value) => Math.round(value * 100) / 100;
  return {
    x: round(Math.max(-viewport.width, Math.min(viewport.width, x))),
    y: round(Math.max(-viewport.height - 120, Math.min(viewport.height + 120, y))),
  };
}

/** @param {{ getItem: (key: string) => string | null }} storage @param {boolean} fallback */
export function readIpadMenuPreference(storage, fallback = true) {
  try {
    // Older installations had no saved setting until the visitor touched it.
    // Explicit OFF remains personal; absent or damaged settings use iPad's ON default.
    return storage.getItem(IPAD_MENU_STORAGE_KEY) !== "0";
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
  root.setAttribute("data-ipad-menu-preference", enabled ? "on" : "off");
  if (enabled) root.setAttribute("data-ipad-menu", "compact");
  else {
    root.removeAttribute("data-ipad-menu");
    root.removeAttribute("data-ipad-menu-scrolled");
    root.removeAttribute("data-ipad-menu-motion");
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
 * Header dimensions are read only after route/size changes, not on scrolling.
 * Style observation checks only lock properties, ignoring our own CSS variables.
 * @param {Window & typeof globalThis} [win]
 * @param {Document} [doc]
 */
export function watchIpadMenuMode(win = window, doc = document) {
  const root = doc.documentElement;
  let frame = 0;
  let disposed = false;
  let measureDirty = true;
  let scrolled = root.getAttribute("data-ipad-menu-scrolled") === "true";
  let headerHeight = 0;
  let exitDistance = 0;
  let header = null;
  let nav = null;
  let scrollRequested = false;
  let reconcileRequested = true;
  let motionTimer = 0;
  let motionGeneration = 0;
  const reducedMotion =
    typeof win.matchMedia === "function"
      ? win.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let lastOverflow = root.style.overflow;
  let lastBodyPosition = doc.body.style.position;
  const isIpad = () => root.getAttribute("data-ipad-viewport") === "contained";
  const isEnabled = () => root.getAttribute("data-ipad-menu") === "compact";
  const signal = () => win.dispatchEvent(new Event(CHANGE_EVENT));
  const applyPreference = (enabled) => {
    root.setAttribute("data-ipad-menu-preference", enabled ? "on" : "off");
    if (enabled && isIpad()) root.setAttribute("data-ipad-menu", "compact");
    else root.removeAttribute("data-ipad-menu");
  };
  const loadPreference = () => {
    const fallback = root.getAttribute("data-ipad-menu-preference") !== "off";
    try {
      applyPreference(readIpadMenuPreference(win.localStorage, fallback));
    } catch {
      // Accessing localStorage itself can throw in restricted browsing contexts.
      applyPreference(fallback);
    }
  };
  const setPixels = (name, value) => {
    const next = `${value}px`;
    if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
  };
  const clearMotion = () => {
    motionGeneration++;
    if (motionTimer) win.clearTimeout(motionTimer);
    motionTimer = 0;
    root.removeAttribute("data-ipad-menu-motion");
    root.style.removeProperty("--ipad-menu-origin-x");
    root.style.removeProperty("--ipad-menu-origin-y");
  };
  const startMotion = (direction, geometry) => {
    clearMotion();
    if (!geometry || reducedMotion?.matches || doc.hidden || typeof win.setTimeout !== "function")
      return;
    setPixels("--ipad-menu-origin-x", geometry.x);
    setPixels("--ipad-menu-origin-y", geometry.y);
    root.setAttribute("data-ipad-menu-motion", direction);
    const generation = motionGeneration;
    motionTimer = win.setTimeout(() => {
      if (!disposed && generation === motionGeneration) clearMotion();
    }, IPAD_MENU_MOTION_SETTLE_MS);
  };
  const clearGeometry = () => {
    root.style.removeProperty("--ipad-header-scroll");
    root.style.removeProperty("--ipad-header-height");
    root.style.removeProperty("--ipad-header-exit-distance");
  };
  const measure = () => {
    const route = root.getAttribute("data-viewport-chrome");
    const selector = HEADER_SELECTORS[route];
    const nextHeader = selector ? doc.querySelector(selector) : null;
    const nextNav = route === "dream" ? doc.querySelector(".dream-chapter-nav") : null;
    if (nextHeader !== header || nextNav !== nav) {
      resizeObserver?.disconnect();
      header = nextHeader;
      nav = nextNav;
      if (header) resizeObserver?.observe(header);
      if (nav) resizeObserver?.observe(nav);
    }
    headerHeight = Math.max(0, header?.offsetHeight || 0);
    exitDistance = headerHeight ? headerHeight + Math.max(0, nav?.offsetHeight || 0) : 0;
    setPixels("--ipad-header-height", headerHeight);
    setPixels("--ipad-header-exit-distance", exitDistance);
    measureDirty = false;
  };
  const update = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    if (disposed) return;
    const scrollBoundary = scrollRequested && !measureDirty && !reconcileRequested;
    scrollRequested = false;
    reconcileRequested = false;
    if (!isIpad() || !isEnabled()) {
      if (!isIpad()) root.removeAttribute("data-ipad-menu");
      scrolled = false;
      root.removeAttribute("data-ipad-menu-scrolled");
      clearGeometry();
      clearMotion();
      measureDirty = true;
      return;
    }
    const locked = doc.body.style.position === "fixed" || root.style.overflow === "hidden";
    // Fixed-body modals report scrollY=0. Freeze the departing header as well as
    // the trigger state until their normal document position is restored.
    if (locked) {
      clearMotion();
      return;
    }
    if (measureDirty) measure();
    if (Number.isFinite(win.scrollY)) {
      setPixels("--ipad-header-scroll", Math.min(exitDistance, Math.max(0, win.scrollY)));
    }
    const nextScrolled = getIpadMenuScrolled(scrolled, win.scrollY, exitDistance);
    const animate =
      scrollBoundary && nextScrolled !== scrolled && !reducedMotion?.matches && !doc.hidden;
    const trigger = animate ? header?.querySelector?.(".side-panel-trigger") : null;
    const oldRect = trigger?.getBoundingClientRect?.();
    scrolled = nextScrolled;
    const value = scrolled ? "true" : "false";
    if (root.getAttribute("data-ipad-menu-scrolled") !== value) {
      root.setAttribute("data-ipad-menu-scrolled", value);
    }
    if (animate) {
      // Publish the settled hit box first: Zeus collision handling and touch
      // focus use the real launcher, never the travelling decorative ribbons.
      const newRect = trigger?.getBoundingClientRect?.();
      startMotion(
        scrolled ? "converge" : "expand",
        getIpadMenuMotionGeometry(scrolled ? oldRect : newRect, scrolled ? newRect : oldRect, {
          width: win.innerWidth,
          height: win.innerHeight,
        }),
      );
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = win.requestAnimationFrame(update);
  };
  const scheduleMeasure = () => {
    scrollRequested = false;
    reconcileRequested = true;
    clearMotion();
    measureDirty = true;
    schedule();
  };
  const resizeObserver =
    typeof win.ResizeObserver === "function" ? new win.ResizeObserver(scheduleMeasure) : null;
  const onScroll = () => {
    // Other devices and an explicit personal OFF choice need no scroll work.
    if (isIpad() && isEnabled()) {
      scrollRequested = true;
      schedule();
    }
  };
  const storageChanged = (event) => {
    if (event.key !== null && event.key !== IPAD_MENU_STORAGE_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== win.localStorage) return;
    } catch {
      return;
    }
    applyPreference(event.newValue !== "0");
    scrollRequested = false;
    reconcileRequested = true;
    clearMotion();
    measureDirty = true;
    update();
    signal();
  };
  if (isIpad()) loadPreference();
  update();
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener(CHANGE_EVENT, scheduleMeasure);
  win.addEventListener("storage", storageChanged);
  win.addEventListener("resize", scheduleMeasure, { passive: true });
  const observer = new win.MutationObserver((records) => {
    let changed = false;
    for (const record of records) {
      if (record.target === root && record.attributeName === "data-ipad-viewport") {
        if (isIpad()) loadPreference();
        changed = true;
        measureDirty = true;
      } else if (record.target === root && record.attributeName === "data-viewport-chrome") {
        changed = true;
        measureDirty = true;
      }
    }
    if (lastOverflow !== root.style.overflow || lastBodyPosition !== doc.body.style.position) {
      lastOverflow = root.style.overflow;
      lastBodyPosition = doc.body.style.position;
      changed = true;
    }
    if (changed) {
      scrollRequested = false;
      reconcileRequested = true;
      clearMotion();
      schedule();
    }
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["style", "data-ipad-viewport", "data-viewport-chrome"],
  });
  observer.observe(doc.body, { attributes: true, attributeFilter: ["style"] });
  // Lazy routes can commit their header after the pathname effect has already
  // run. A ResizeObserver cannot discover an element that did not exist yet.
  // Normal DOM churn only checks cached connectivity; no queries or layout
  // reads are needed while the expected chrome remains mounted.
  const treeObserver = new win.MutationObserver(() => {
    if (!isIpad() || !isEnabled()) return;
    const route = root.getAttribute("data-viewport-chrome");
    if (!HEADER_SELECTORS[route]) return;
    if (
      !header ||
      header.isConnected === false ||
      (route === "dream" && (!nav || nav.isConnected === false))
    ) {
      scheduleMeasure();
    }
  });
  treeObserver.observe(doc.body, { childList: true, subtree: true });
  const cancelMotion = () => {
    scrollRequested = false;
    reconcileRequested = true;
    clearMotion();
  };
  doc.addEventListener?.("visibilitychange", cancelMotion);
  reducedMotion?.addEventListener?.("change", cancelMotion);
  signal();
  return () => {
    disposed = true;
    clearMotion();
    if (frame) win.cancelAnimationFrame(frame);
    observer.disconnect();
    treeObserver.disconnect();
    resizeObserver?.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener(CHANGE_EVENT, scheduleMeasure);
    win.removeEventListener("storage", storageChanged);
    win.removeEventListener("resize", scheduleMeasure);
    doc.removeEventListener?.("visibilitychange", cancelMotion);
    reducedMotion?.removeEventListener?.("change", cancelMotion);
  };
}
