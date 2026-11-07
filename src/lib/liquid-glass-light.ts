// The room's light on the glass (owner, 2026-11-02:
// 「あらゆるリキッドグラスの情報を集めてさらに仕上げて」). Liquid Glass's
// highlights "move in space" with interaction and, in some cases, "respond
// to device motion" (WWDC25 "Meet Liquid Glass"). The sheet places every
// specular line by one light, --lg-lx/--lg-ly (-1..1, the upper left at
// rest, declared on <html>); this nudges that light, a little and slowly:
// - a mouse or trackpad: the light leans toward where the pointer is in the
//   window (the control under the pointer already takes its own light,
//   liquid-glass.ts, and this leaves that control to it);
// - a scroll (wheel, or a finger dragging the page): the light trails the
//   motion, and drifts back once it stops;
// - the device's tilt, only where orientation events already arrive. iOS
//   sends none until the page asks permission, and asking shows a prompt, so
//   this never asks: on iOS the tilt counts only if permission was granted
//   already; elsewhere (Android, some desktops) the events simply arrive.
//
// Where the light is written: on the lit glass itself (LIT_SELECTOR: the
// controls, the styled selects, the dialog shells, panels and the toast),
// only those on or near the screen (one IntersectionObserver), never on
// <html>. An inherited custom property changed on <html> restyles every
// element of the page (about 3,700 on /world: 0.4-0.6 s a write on a
// throttled phone, several times a scroll); on the glass it restyles a few
// small subtrees. The surfaces' shadows are tokens resolved where they are
// declared, so a lit surface carries data-lg-lit and the sheet declares
// them again on it (styles-liquid-glass-surfaces.css). Back at rest the
// inline light and the attribute are removed: the sheet's own light shows,
// as before any lean.
//
// Budget: nothing is read from layout (the pointer's client position, the
// window's size on resize, the touch's clientY, the wheel's delta and the
// observer's entries). The light is computed at most every WRITE_MS and
// written only when it moved by STEP, and only where it differs; between
// writes nothing runs. Off under reduced motion, in economy, and when the
// option goes off (every property and attribute removed).

import { LIQUID_GLASS_TARGETS } from "./liquid-glass";

/** Lit by the room besides the controls: whatever else the sheets light by --lg-lx/--lg-ly. */
export const LIT_EXTRAS = [
  // the menu button in its compact disc (styles-liquid-glass-surfaces.css)
  ".side-panel-trigger",
  // the styled selects (styles-liquid-glass-controls.css, section 5)
  ".gallery-order select",
  ".gallery-tour-playback select",
  ".rxs-comparison-selector select",
  ".rxs-p14-native-select select",
  ".lab-selectors select",
  ".dream-page select",
  ".dogs-viewer select",
  ".exhibition-artwork-browser select",
  // the surfaces wearing --lgs-frame / --lgs-panel (lgs:frames, lgs:panels, the toast)
  ".form-pickup-dialog",
  ".rider-nightmare-dialog",
  ".episode-pickup-dialog",
  ".world-column-dialog",
  ".quick-search-panel",
  ".site-announcement-hub",
  ".command-atlas-index",
  '.side-panel-group[data-atlas-group="sections"]',
  ".command-deck-chapter-links",
  ".command-deck-footer",
  ".saga-cinema .toast",
] as const;

export const LIT_SELECTOR = [...LIQUID_GLASS_TARGETS, ...LIT_EXTRAS].join(", ");
/** Marks an element carrying the room's light (the sheet re-resolves the surface tokens on it). */
export const LIT_ATTRIBUTE = "data-lg-lit";
/** How far past the screen a lit element is kept up to date. */
export const LIT_MARGIN = "25% 0px";
/** How long after the page's tree changes new glass is looked for (once per window). */
export const SCAN_MS = 400;

/** The rest light (the sheet's own --lg-lx/--lg-ly). */
export const REST_LIGHT = { x: -0.55, y: -1 } as const;
/** How far each source may lean the light, on each axis. */
export const LEAN = { pointer: 0.45, scroll: 0.35, tilt: 0.5 } as const;
/** The quietest change worth a style write, and the writes' cadence. */
export const STEP = 0.04;
export const WRITE_MS = 90;
/** How long the scroll's lean takes to drift back once the page stops. */
export const SCROLL_RELAX_MS = 600;

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

/** The light from the three leans (each -1..1), clamped to the sheet's range. */
export function lightFor(pointer: { x: number; y: number }, scroll: number, tilt: { x: number; y: number }) {
  return {
    x: clamp(REST_LIGHT.x + pointer.x * LEAN.pointer + tilt.x * LEAN.tilt),
    // The light stays above the glass: never past the horizon.
    y: clamp(REST_LIGHT.y + pointer.y * LEAN.pointer * 0.5 + scroll * LEAN.scroll + tilt.y * LEAN.tilt, -1, -0.35),
  };
}

export function watchLiquidLight(doc: Document = document) {
  const view = doc.defaultView;
  if (!view?.matchMedia || !doc.body) return () => {};
  const root = doc.documentElement;
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = view.matchMedia("(hover: hover) and (pointer: fine)");
  const economy = () => root.getAttribute("data-world-effects") === "economy";

  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let scroll = 0;
  let scrollAt = 0;
  let width = view.innerWidth || 1;
  let height = view.innerHeight || 1;
  let shown: { x: number; y: number } = { x: REST_LIGHT.x, y: REST_LIGHT.y };
  let timer = 0;
  let scanTimer = 0;
  let lastTouchY: number | null = null;
  let lastTouchAt = 0;

  /* Every lit element found, and those on or near the screen. */
  const tracked = new Set<HTMLElement>();
  const near = new Set<HTMLElement>();
  /* What the elements should carry: null at rest (the sheet's own light). */
  let lx: string | null = null;
  let ly: string | null = null;

  /* The light last written on each element, to tell it from the pointer's. */
  const mine = new WeakMap<HTMLElement, string>();

  /* Brings one element to the current light. Reads only its inline style.
     The control under a mouse takes the pointer's own light (liquid-glass.ts
     writes --lg-lx there too, and removes it when the mouse goes): a light
     this did not write is left alone. A finger's press writes only the
     pool (--lg-px), so a tapped control keeps following the room. */
  const paint = (el: HTMLElement) => {
    const style = el.style;
    const current = style.getPropertyValue("--lg-lx");
    const pointers = current !== "" && current !== mine.get(el);
    if (lx === null || ly === null) {
      if (!el.hasAttribute(LIT_ATTRIBUTE)) return;
      el.removeAttribute(LIT_ATTRIBUTE);
      mine.delete(el);
      if (pointers) return;
      style.removeProperty("--lg-lx");
      style.removeProperty("--lg-ly");
      return;
    }
    if (pointers) return;
    if (current !== lx) style.setProperty("--lg-lx", lx);
    if (style.getPropertyValue("--lg-ly") !== ly) style.setProperty("--lg-ly", ly);
    mine.set(el, lx);
    if (!el.hasAttribute(LIT_ATTRIBUTE)) el.setAttribute(LIT_ATTRIBUTE, "");
  };

  const seen =
    typeof view.IntersectionObserver === "function"
      ? new view.IntersectionObserver(
          (entries) => {
            for (const io of entries) {
              const el = io.target as HTMLElement;
              if (!tracked.has(el)) continue;
              if (io.isIntersecting) {
                near.add(el);
                paint(el);
              } else near.delete(el);
            }
          },
          { rootMargin: LIT_MARGIN },
        )
      : null;

  const forget = (el: HTMLElement) => {
    seen?.unobserve(el);
    tracked.delete(el);
    near.delete(el);
  };

  const scan = () => {
    scanTimer = 0;
    for (const el of [...tracked]) if (!el.isConnected) forget(el);
    for (const el of doc.querySelectorAll<HTMLElement>(LIT_SELECTOR)) {
      if (tracked.has(el)) continue;
      tracked.add(el);
      // Without the observer (an old engine) every element counts as near.
      if (seen) seen.observe(el);
      else {
        near.add(el);
        paint(el);
      }
    }
  };
  const tree = new view.MutationObserver((records) => {
    for (const r of records)
      if (r.addedNodes.length || r.removedNodes.length) {
        if (!scanTimer) scanTimer = view.setTimeout(scan, SCAN_MS);
        return;
      }
  });
  tree.observe(doc.body, { childList: true, subtree: true });

  const paintAll = () => {
    for (const el of near) paint(el);
  };

  const write = () => {
    timer = 0;
    if (still.matches || economy()) {
      clear();
      return;
    }
    // The scroll's lean relaxes on its own once the page is still.
    const idle = view.performance.now() - scrollAt;
    const relax = idle > SCROLL_RELAX_MS ? 0 : 1 - idle / SCROLL_RELAX_MS;
    const next = lightFor(pointer, scroll * relax, tilt);
    // Back at rest exactly (the scroll relaxed, no pointer, no tilt), the
    // last small step is taken too: the inline light comes off.
    const rest = next.x === REST_LIGHT.x && next.y === REST_LIGHT.y;
    if (rest || Math.abs(next.x - shown.x) >= STEP || Math.abs(next.y - shown.y) >= STEP) {
      shown = next;
      lx = rest ? null : next.x.toFixed(2);
      ly = rest ? null : next.y.toFixed(2);
    }
    // Also after the pointer's light let go of a control.
    paintAll();
    if (relax > 0) schedule();
  };
  const schedule = () => {
    if (!timer) timer = view.setTimeout(write, WRITE_MS);
  };
  const clear = () => {
    lx = null;
    ly = null;
    shown = { x: REST_LIGHT.x, y: REST_LIGHT.y };
    for (const el of tracked) paint(el);
  };

  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !fine.matches) return;
    pointer.x = clamp((event.clientX / width) * 2 - 1);
    pointer.y = clamp((event.clientY / height) * 2 - 1);
    schedule();
  };
  const leave = (event: PointerEvent) => {
    if (event.relatedTarget) return;
    pointer.x = 0;
    pointer.y = 0;
    schedule();
  };
  const pushScroll = (pxPerMs: number) => {
    // A fast flick (about 3 px/ms) leans the light all the way.
    scroll = clamp(pxPerMs / 3);
    scrollAt = view.performance.now();
    schedule();
  };
  const wheel = (event: WheelEvent) => {
    pushScroll(clamp(event.deltaY / 40, -3, 3));
  };
  const touchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const now = event.timeStamp;
    if (lastTouchY !== null && now > lastTouchAt) {
      // The page moves against the finger.
      pushScroll((lastTouchY - touch.clientY) / Math.max(8, now - lastTouchAt));
    }
    lastTouchY = touch.clientY;
    lastTouchAt = now;
  };
  const touchEnd = () => {
    lastTouchY = null;
  };
  const orient = (event: DeviceOrientationEvent) => {
    if (event.gamma == null || event.beta == null) return;
    // Held upright and tilted: gamma leans left/right, beta past a 45°
    // reading angle leans toward or away.
    tilt.x = clamp(event.gamma / 45);
    tilt.y = clamp((event.beta - 45) / 45);
    schedule();
  };
  const resize = () => {
    width = view.innerWidth || 1;
    height = view.innerHeight || 1;
  };

  const passive = { capture: true, passive: true } as const;
  doc.addEventListener("pointermove", move, passive);
  doc.addEventListener("pointerout", leave, passive);
  view.addEventListener("wheel", wheel, passive);
  view.addEventListener("touchmove", touchMove, passive);
  view.addEventListener("touchend", touchEnd, passive);
  view.addEventListener("touchcancel", touchEnd, passive);
  // Listening asks nothing: iOS fires these only once permission was given.
  view.addEventListener("deviceorientation", orient, passive);
  view.addEventListener("resize", resize, passive);
  scanTimer = view.setTimeout(scan, 0);
  return () => {
    if (timer) view.clearTimeout(timer);
    if (scanTimer) view.clearTimeout(scanTimer);
    timer = 0;
    scanTimer = 0;
    tree.disconnect();
    seen?.disconnect();
    doc.removeEventListener("pointermove", move, passive);
    doc.removeEventListener("pointerout", leave, passive);
    view.removeEventListener("wheel", wheel, passive);
    view.removeEventListener("touchmove", touchMove, passive);
    view.removeEventListener("touchend", touchEnd, passive);
    view.removeEventListener("touchcancel", touchEnd, passive);
    view.removeEventListener("deviceorientation", orient, passive);
    view.removeEventListener("resize", resize, passive);
    clear();
    tracked.clear();
    near.clear();
  };
}
