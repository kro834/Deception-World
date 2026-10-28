/** Cancel native navigation only for a single-finger stroke that starts at a
 * viewport edge on this canvas. Pointer Events own brushing; history is untouched. */
export function guardCielSequinTouch(surface: HTMLCanvasElement) {
  let identifier: number | null = null;
  const options = { passive: false, capture: true };
  const start = (event: TouchEvent) => {
    if (surface.hidden || event.touches.length !== 1) {
      identifier = null;
      return;
    }
    const touch = event.touches[0];
    const width =
      surface.ownerDocument.defaultView?.innerWidth ??
      surface.ownerDocument.documentElement.clientWidth;
    if (!Number.isFinite(touch.clientX) || (touch.clientX > 32 && touch.clientX < width - 32)) {
      identifier = null;
      return;
    }
    identifier = touch.identifier;
    if (event.cancelable) event.preventDefault();
  };
  const move = (event: TouchEvent) => {
    if (identifier === null) return;
    if (event.touches.length !== 1 || event.touches[0].identifier !== identifier) {
      identifier = null;
      return;
    }
    if (event.cancelable) event.preventDefault();
  };
  const end = () => {
    identifier = null;
  };
  // A passive listener cannot cancel Safari's edge swipe at its first sample.
  surface.addEventListener("touchstart", start, options);
  surface.addEventListener("touchmove", move, options);
  surface.addEventListener("touchend", end, { passive: true });
  surface.addEventListener("touchcancel", end, { passive: true });
  return () => {
    identifier = null;
    surface.removeEventListener("touchstart", start, options);
    surface.removeEventListener("touchmove", move, options);
    surface.removeEventListener("touchend", end);
    surface.removeEventListener("touchcancel", end);
  };
}
