/** A viewport resize does not reliably dispatch pointercancel for a captured
 * touch. Drop the old sheet offset before a rotation or split-width change
 * gives it a different coordinate system. Toolbar-only height changes keep
 * their native gesture. No layout is measured while moving the pointer.
 * @param {() => void} cancel
 * @param {Window & typeof globalThis} [win]
 * @param {Document} [doc]
 */
export function watchSideMenuSwipeLifecycle(cancel, win = window, doc = document) {
  let width = win.innerWidth;
  const onResize = () => {
    const next = win.innerWidth;
    if (Math.abs(next - width) >= 1) cancel();
    width = next;
  };
  const onVisibility = () => {
    if (doc.hidden) cancel();
  };
  win.addEventListener("resize", onResize, { passive: true });
  win.addEventListener("orientationchange", cancel);
  win.addEventListener("blur", cancel);
  win.addEventListener("pagehide", cancel);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    win.removeEventListener("resize", onResize);
    win.removeEventListener("orientationchange", cancel);
    win.removeEventListener("blur", cancel);
    win.removeEventListener("pagehide", cancel);
    doc.removeEventListener("visibilitychange", onVisibility);
    cancel();
  };
}
