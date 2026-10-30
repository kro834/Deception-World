/** Safari decides edge-history navigation at touchstart, before a drag threshold.
 * Install for this archive only; the browser's Back button/history remain native. */
export function guardDogsArchiveNavigation(doc: Document) {
  const options = { passive: false, capture: true };
  let identifier: number | null = null;
  const clear = () => {
    identifier = null;
  };
  const start = (event: TouchEvent) => {
    clear();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const width = doc.defaultView?.innerWidth ?? doc.documentElement.clientWidth;
    if (!Number.isFinite(touch.clientX) || !width) return;
    if (touch.clientX > 32 && touch.clientX < width - 32) return;
    identifier = touch.identifier;
    if (event.cancelable) event.preventDefault();
  };
  const move = (event: TouchEvent) => {
    if (identifier === null) return;
    if (event.touches.length !== 1 || event.touches[0].identifier !== identifier) {
      clear();
      return;
    }
    if (event.cancelable) event.preventDefault();
  };
  const wheel = (event: WheelEvent) => {
    // A horizontal trackpad gesture should orbit/leave the scene still, never
    // become Safari history navigation when a scroll boundary is reached.
    if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (event.cancelable) event.preventDefault();
  };
  doc.addEventListener("touchstart", start, options);
  doc.addEventListener("touchmove", move, options);
  doc.addEventListener("touchend", clear, true);
  doc.addEventListener("touchcancel", clear, true);
  doc.addEventListener("wheel", wheel, options);
  doc.defaultView?.addEventListener("pagehide", clear);
  return () => {
    clear();
    doc.removeEventListener("touchstart", start, true);
    doc.removeEventListener("touchmove", move, true);
    doc.removeEventListener("touchend", clear, true);
    doc.removeEventListener("touchcancel", clear, true);
    doc.removeEventListener("wheel", wheel, true);
    doc.defaultView?.removeEventListener("pagehide", clear);
  };
}
