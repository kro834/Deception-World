// The room's light on the glass (owner, 2026-11-02:
// 「あらゆるリキッドグラスの情報を集めてさらに仕上げて」). Liquid Glass's
// highlights "move in space" with interaction and, in some cases, "respond
// to device motion" (WWDC25 "Meet Liquid Glass"). The sheet places every
// specular line by one light, --lg-lx/--lg-ly on <html> (-1..1, the upper
// left at rest); this nudges that light, a little and slowly:
// - a mouse or trackpad: the light leans toward where the pointer is in the
//   window (the control under the pointer already takes its own light,
//   liquid-glass.ts);
// - a scroll (wheel, or a finger dragging the page): the light trails the
//   motion, and drifts back once it stops;
// - the device's tilt, only where orientation events already arrive. iOS
//   sends none until the page asks permission, and asking shows a prompt, so
//   this never asks: on iOS the tilt counts only if permission was granted
//   already; elsewhere (Android, some desktops) the events simply arrive.
//
// Budget: nothing is read from layout (the pointer's client position, the
// window's size on resize, the touch's clientY and the wheel's delta). The
// light is written at most every WRITE_MS and only when it moved by STEP, as
// two custom properties on <html>; between writes nothing runs. Off under
// reduced motion, in economy, and when the option goes off (both properties
// removed).

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
  if (!view?.matchMedia) return () => {};
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
  let lastTouchY: number | null = null;
  let lastTouchAt = 0;

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
    if (Math.abs(next.x - shown.x) >= STEP || Math.abs(next.y - shown.y) >= STEP) {
      shown = next;
      root.style.setProperty("--lg-lx", next.x.toFixed(2));
      root.style.setProperty("--lg-ly", next.y.toFixed(2));
    }
    if (relax > 0) schedule();
  };
  const schedule = () => {
    if (!timer) timer = view.setTimeout(write, WRITE_MS);
  };
  const clear = () => {
    root.style.removeProperty("--lg-lx");
    root.style.removeProperty("--lg-ly");
    shown = { x: REST_LIGHT.x, y: REST_LIGHT.y };
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
  return () => {
    if (timer) view.clearTimeout(timer);
    timer = 0;
    doc.removeEventListener("pointermove", move, passive);
    doc.removeEventListener("pointerout", leave, passive);
    view.removeEventListener("wheel", wheel, passive);
    view.removeEventListener("touchmove", touchMove, passive);
    view.removeEventListener("touchend", touchEnd, passive);
    view.removeEventListener("touchcancel", touchEnd, passive);
    view.removeEventListener("deviceorientation", orient, passive);
    view.removeEventListener("resize", resize, passive);
    clear();
  };
}
