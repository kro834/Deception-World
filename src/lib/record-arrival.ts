let cancelPending: (() => void) | undefined;

/** A search/library selection is an explicit reading destination. Wait for
 * its route and cover to settle, without touching scroll/history or dialogs. */
export function watchRecordArrival(path: string, hash?: string) {
  cancelPending?.();
  if (!hash || typeof document === "undefined") return () => {};
  const root = document.documentElement;
  let frame = 0;
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(deadline);
    window.cancelAnimationFrame(frame);
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("wheel", stop, true);
    document.removeEventListener("keydown", stop, true);
    if (cancelPending === stop) cancelPending = undefined;
  };
  const arrive = () => {
    frame = 0;
    let currentHash: string;
    try {
      currentHash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      stop();
      return;
    }
    if (window.location.pathname !== path || currentHash !== hash) return;
    if (root.hasAttribute("data-loading") || root.hasAttribute("data-route-cover")) return;
    const target = document.getElementById(hash);
    if (!target || !target.getClientRects().length || target.closest('[aria-hidden="true"]'))
      return;
    if (document.querySelector("dialog[open]")) {
      stop();
      return;
    }
    const ownedTab = !target.matches("a[href],button,input,select,textarea,summary,[tabindex]");
    if (ownedTab) {
      target.tabIndex = -1;
      target.dataset.routeFocus = "true";
    }
    const marked =
      root.dataset.worldEffects !== "economy" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (marked) target.dataset.skipMark = "true";
    const timer = window.setTimeout(() => target.removeAttribute("data-skip-mark"), 2400);
    target.addEventListener(
      "blur",
      () => {
        window.clearTimeout(timer);
        target.removeAttribute("data-skip-mark");
        if (ownedTab) {
          target.removeAttribute("tabindex");
          target.removeAttribute("data-route-focus");
        }
      },
      { once: true },
    );
    target.focus({ preventScroll: true });
    stop();
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(arrive);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-loading", "data-route-cover"],
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const deadline = window.setTimeout(stop, 15000);
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("wheel", stop, { capture: true, passive: true });
  document.addEventListener("keydown", stop, true);
  cancelPending = stop;
  schedule();
  return stop;
}
