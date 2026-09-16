// A modal and a rail can overlap. Only the final owner may restore the viewport;
// per-component snapshots otherwise restore another component's `hidden` value.
const owners = new Set();
let snapshot = null;
let frozenPosition = null;
let railCount = 0;

const blockRailScroll = (event) => event.preventDefault();

/** @param {{ freezeBody?: boolean, rail?: boolean }} options */
export function acquireViewportScrollLock({ freezeBody = false, rail = false } = {}) {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const body = document.body;
  const owner = {};
  if (!owners.size) {
    snapshot = {
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
  }
  owners.add(owner);
  if (freezeBody && !frozenPosition) {
    frozenPosition = { top: window.scrollY, left: window.scrollX };
    body.style.position = "fixed";
    body.style.top = `-${frozenPosition.top}px`;
    body.style.width = "100%";
  }
  if (rail && railCount++ === 0) {
    root.dataset.railLock = "true";
    window.addEventListener("touchmove", blockRailScroll, { passive: false, capture: true });
    window.addEventListener("wheel", blockRailScroll, { passive: false, capture: true });
  }

  return () => {
    if (!owners.delete(owner)) return;
    if (rail && --railCount === 0) {
      delete root.dataset.railLock;
      window.removeEventListener("touchmove", blockRailScroll, { capture: true });
      window.removeEventListener("wheel", blockRailScroll, { capture: true });
    }
    if (owners.size || !snapshot) return;
    root.style.overflow = snapshot.rootOverflow;
    root.style.overscrollBehavior = snapshot.rootOverscroll;
    body.style.overflow = snapshot.bodyOverflow;
    body.style.position = snapshot.bodyPosition;
    body.style.top = snapshot.bodyTop;
    body.style.width = snapshot.bodyWidth;
    if (frozenPosition) {
      // Restore once, synchronously. No delayed correction may fight a new swipe.
      const rootBehavior = root.style.scrollBehavior;
      const bodyBehavior = body.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      body.style.scrollBehavior = "auto";
      window.scrollTo({ ...frozenPosition, behavior: "instant" });
      root.style.scrollBehavior = rootBehavior;
      body.style.scrollBehavior = bodyBehavior;
    }
    frozenPosition = null;
    snapshot = null;
  };
}
