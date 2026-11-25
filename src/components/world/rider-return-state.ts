type RiderReturn = {
  id: string;
  poster?: number;
  locked?: boolean;
  // The dossier control is visible even when its tall card starts offscreen.
  viewportFraction?: number;
  keyboard?: boolean;
};

type Entry = { href: string; index: number; value: RiderReturn };
declare module "@tanstack/history" {
  interface HistoryState {
    worldRiderReturn?: Entry;
  }
}

const ENTRY_FIELD = "worldRiderReturn";

function currentEntry(): Entry | null {
  const state = window.history.state;
  const entry = state?.[ENTRY_FIELD] as Entry | undefined;
  return entry && entry.index === state.__TSR_index && entry.href === window.location.href
    ? entry
    : null;
}

export function captureRiderReturn(value: RiderReturn) {
  const state = window.history.state;
  if (typeof state?.__TSR_index !== "number") return;
  const entry: Entry = { index: state.__TSR_index, href: window.location.href, value };
  // Preserve TanStack's cached location, index and native history key.
  try {
    window.History.prototype.replaceState.call(
      window.history,
      { ...state, [ENTRY_FIELD]: entry },
      "",
    );
  } catch {
    // A browser that denies history writes still opens the dossier normally.
  }
}

// The router writes this state on the new entry only when this specific
// navigation commits. A cancelled transition cannot prime a later visit.
export function riderNavigationState(to: string, hash?: string, keyboard = false) {
  const index = window.history.state?.__TSR_index;
  if (typeof index !== "number") return undefined;
  const path = window.location.pathname;
  const current = currentEntry()?.value;
  let value: RiderReturn | undefined;
  if (path === "/world" && current && to === `/riders/${current.id}`) value = current;
  const rider = /^\/riders\/([^/]+)$/.exec(path);
  if (rider && to === "/world" && hash === "riders-return") {
    value = current ? { ...current, keyboard: keyboard || current.keyboard } : { id: rider[1] };
  }
  if (!value) return undefined;
  const url = new URL(to, window.location.href);
  url.hash = hash ?? "";
  return { [ENTRY_FIELD]: { index: index + 1, href: url.href, value } };
}

export function readRiderReturn() {
  if (typeof window === "undefined" || window.location.pathname !== "/world") return null;
  if (!["", "#riders", "#riders-return"].includes(window.location.hash)) return null;
  return currentEntry()?.value ?? null;
}

export function restoreRiderControl(value: RiderReturn, control: HTMLButtonElement) {
  const fraction = value.viewportFraction;
  if (fraction == null) return () => {};
  const href = window.location.href;
  const timers: number[] = [];
  const viewport = window.visualViewport;
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  let stopped = false;
  let frame = 0;
  let focused = false;
  const inputs = [
    "pointerdown",
    "touchstart",
    "wheel",
    "keydown",
    "hashchange",
    "pagehide",
  ] as const;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const timer of timers) window.clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    viewport?.removeEventListener("resize", schedule);
    for (const type of inputs) window.removeEventListener(type, stop, true);
  };
  const align = () => {
    frame = 0;
    if (!control.isConnected || location.href !== href) return stop();
    const height = viewport?.height ?? window.innerHeight;
    const rect = control.getBoundingClientRect();
    const target =
      (viewport?.offsetTop ?? 0) + Math.max(0, Math.min(height - rect.height, height * fraction));
    const delta = rect.top - target;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
    if (value.keyboard && !focused && !document.documentElement.hasAttribute("data-loading")) {
      control.focus({ preventScroll: true });
      focused = document.activeElement === control;
    }
  };
  function schedule() {
    if (!stopped && !frame) frame = requestAnimationFrame(align);
  }
  // The router can restore a saved offset after our first paint. Watch its
  // scroll and any reflow, without measuring another 100 idle frames.
  for (const type of inputs) window.addEventListener(type, stop, { capture: true, passive: true });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  observer?.observe(control.closest("main") ?? control);
  for (const delay of [120, 300, 600, 1000, 1500]) {
    timers.push(window.setTimeout(schedule, delay));
  }
  timers.push(window.setTimeout(stop, 1800));
  schedule();
  return stop;
}
