/** Re-resolve a clicked chapter against the current layout. WebKit can
 * retain pre-rotation fragment geometry even after the focus scroll settles.
 * Native navigation owns the URL, history and focus. A long chapter may
 * opt specific headings into realignment when late fonts reflow the page. */
export function mountRexonanceAnchorNavigation(root, environment = window, resizeSelector) {
  if (!root || typeof environment.requestAnimationFrame !== "function") return () => {};
  let frame = null;
  let sizeObserver = null;
  let disposed = false;
  let observedHash = null;
  const checkHash = () => {
    if (environment.location.hash !== observedHash) cancel();
  };
  const cancel = () => {
    if (frame !== null) environment.cancelAnimationFrame(frame);
    frame = null;
    if (sizeObserver) {
      sizeObserver.disconnect();
      sizeObserver = null;
      observedHash = null;
      environment.removeEventListener("hashchange", checkHash);
    }
  };
  const followResize = (target) => {
    if (!resizeSelector || !target?.matches(resizeSelector) || !environment.ResizeObserver) return;
    observedHash = environment.location.hash;
    sizeObserver = new environment.ResizeObserver(() => {
      if (disposed || environment.location.hash !== observedHash || !root.contains(target)) return cancel();
      const margin = parseFloat(environment.getComputedStyle(target).scrollMarginTop) || 0;
      const drift = target.getBoundingClientRect().top - margin;
      if (Math.abs(drift) > 1) environment.scrollBy({ top: drift, behavior: "instant" });
    });
    sizeObserver.observe(root);
    environment.addEventListener("hashchange", checkHash, { passive: true });
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
      followResize(target);
    });
  };
  const interrupts = ["wheel", "pointerdown", "keydown", "blur", "pagehide"];
  // A native fragment can receive focus before the route hydrates.
  const focused = root.ownerDocument.activeElement;
  if (resizeSelector && focused?.id && environment.location.hash === "#" + focused.id && root.contains(focused))
    followResize(focused);
  root.addEventListener("click", click, { capture: true, passive: true });
  for (const name of interrupts) environment.addEventListener(name, cancel, { passive: true });
  return () => {
    disposed = true;
    cancel();
    root.removeEventListener("click", click, true);
    for (const name of interrupts) environment.removeEventListener(name, cancel);
  };
}
