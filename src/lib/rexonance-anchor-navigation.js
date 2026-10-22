/** Re-resolve a clicked chapter against the current layout. WebKit can
 * retain pre-rotation fragment geometry even after the focus scroll settles.
 * Native navigation still owns the URL, history and focus; this is one
 * cancellable correction per click, never a scroll listener or render loop. */
export function mountRexonanceAnchorNavigation(root, environment = window) {
  if (!root || typeof environment.requestAnimationFrame !== "function") return () => {};
  let frame = null;
  let disposed = false;
  const cancel = () => {
    if (frame !== null) environment.cancelAnimationFrame(frame);
    frame = null;
  };
  const click = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target?.closest?.('a[href^="#"]');
    if (!link || !root.contains(link) || link.hasAttribute("download")) return;
    const targetWindow = link.getAttribute("target");
    if (targetWindow && targetWindow !== "_self") return;
    let id;
    try {
      id = decodeURIComponent(link.getAttribute("href").slice(1));
    } catch {
      return;
    }
    if (!id) return;
    cancel();
    frame = environment.requestAnimationFrame(() => {
      frame = null;
      if (disposed || event.defaultPrevented || root.isConnected === false) return;
      try {
        if (decodeURIComponent(environment.location.hash.slice(1)) !== id) return;
      } catch {
        return;
      }
      const target = root.ownerDocument.getElementById(id);
      if (!target || !root.contains(target)) return;
      const margin = parseFloat(environment.getComputedStyle(target).scrollMarginTop) || 0;
      const top = environment.scrollY + target.getBoundingClientRect().top - margin;
      environment.scrollTo({ top, left: environment.scrollX, behavior: "auto" });
    });
  };
  const interrupts = ["wheel", "pointerdown", "keydown", "blur", "pagehide"];
  root.addEventListener("click", click, { capture: true, passive: true });
  for (const name of interrupts) environment.addEventListener(name, cancel, { passive: true });
  return () => {
    disposed = true;
    cancel();
    root.removeEventListener("click", click, true);
    for (const name of interrupts) environment.removeEventListener(name, cancel);
  };
}
