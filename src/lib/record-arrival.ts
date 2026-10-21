let cancelPending: (() => void) | undefined;

// The landing ring (styles-record-landing.css, handed in by the opener as
// `stylesheet`) stays on the destination for this long, or until focus moves
// on; the brief skip-style cue keeps its own 2.4s. Both go when focus leaves.
const LANDING_HOLD_MS = 6000;

/** The landing ring's sheet, linked once per document the first time an
 * index hit is opened (from /search, /library or the quick search), so the
 * ring is styled by the time the route settles. */
function linkLandingSheet(href: string | undefined) {
  if (!href || typeof document.createElement !== "function") return;
  const head = document.head;
  if (!head || head.querySelector("link[data-record-landing-sheet]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-record-landing-sheet", "true");
  head.append(link);
}

/** A search/library selection is an explicit reading destination. Wait for
 * its route and cover to settle, without touching scroll/history or dialogs. */
export function watchRecordArrival(path: string, hash?: string, options?: { stylesheet?: string }) {
  cancelPending?.();
  if (!hash || typeof document === "undefined") return () => {};
  linkLandingSheet(options?.stylesheet);
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
    // The landing ring: a one-shot lock-on when motion is allowed, else still.
    target.dataset.recordLanding = marked ? "live" : "still";
    const hold = window.setTimeout(
      () => target.removeAttribute("data-record-landing"),
      LANDING_HOLD_MS,
    );
    target.addEventListener(
      "blur",
      () => {
        window.clearTimeout(timer);
        window.clearTimeout(hold);
        target.removeAttribute("data-skip-mark");
        target.removeAttribute("data-record-landing");
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
