// The dynamic GUI kit's one helper (src/styles-dynamic-gui.css).
//
// It does three small things and nothing else:
// - puts `data-dg-ready` on <html> once it knows it can keep its promises, so
//   the sheet's held-back reveals (.dg-reveal:not([data-dg-seen])) apply only
//   when something will release them;
// - marks every `.dg-reveal` with `data-dg-seen` the first time it enters the
//   viewport (an IntersectionObserver, with a MutationObserver for elements a
//   later React commit adds), and marks everything already in view on its first
//   pass so nothing above the fold waits;
// - writes `--dg-progress` (0..1, the document's scroll position) on each
//   .dg-rail (its ::before is the only reader) where the browser has no
//   scroll() timeline, from a passive scroll listener coalesced on
//   requestAnimationFrame. Only when a rail is on the page. (Written on
//   <html> until 2026-11-06: an inherited custom property there restyled
//   every element of the page on every scroll frame, about 900 elements on a
//   dossier; on the rail it restyles the rail alone, same fill.)
//
// Nothing here calls preventDefault or locks scroll; the only style it writes
// is that property on the rails. It reads layout once per scroll frame
// (scrollTop/scrollHeight) and only while a rail exists. A safety timer marks every reveal seen if the observer
// has not fired within SAFETY_MS of ready (a stalled observer must never leave
// content invisible).

const READY = "data-dg-ready";
const SEEN = "data-dg-seen";
const REVEAL = ".dg-reveal";
const RAIL = ".dg-rail";
const SAFETY_MS = 2500;

/**
 * Watch `doc` for the kit and return a disposer.
 * @param {Document} [doc]
 */
export function watchDynamicGui(doc = document) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  if (!view || typeof view.IntersectionObserver !== "function") return () => {};

  /** @param {Element} el */
  const see = (el) => {
    if (!el.hasAttribute(SEEN)) el.setAttribute(SEEN, "");
  };

  const io = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          see(entry.target);
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0 },
  );

  /** @param {ParentNode} scope */
  const observeReveals = (scope) => {
    const list =
      scope instanceof view.Element && scope.matches(REVEAL)
        ? [scope, ...scope.querySelectorAll(REVEAL)]
        : [...scope.querySelectorAll(REVEAL)];
    for (const el of list) if (!el.hasAttribute(SEEN)) io.observe(el);
  };

  // Progress rail fallback.
  let rails = 0;
  let frame = 0;
  // Live: a rail a later commit adds receives the value on the next frame.
  const railElements = doc.getElementsByClassName(RAIL.slice(1));
  /** @param {string | null} value */
  const writeRails = (value) => {
    for (const rail of Array.from(railElements)) {
      const style = /** @type {HTMLElement} */ (rail).style;
      if (!style) continue;
      if (value === null) style.removeProperty("--dg-progress");
      else if (style.getPropertyValue("--dg-progress") !== value)
        style.setProperty("--dg-progress", value);
    }
  };
  const measure = () => {
    frame = 0;
    const max = root.scrollHeight - root.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
    writeRails(ratio.toFixed(4));
  };
  const onScroll = () => {
    if (!frame) frame = view.requestAnimationFrame(measure);
  };
  const syncRail = () => {
    const count = doc.querySelectorAll(RAIL).length;
    if (count && !rails) {
      view.addEventListener("scroll", onScroll, { passive: true });
      view.addEventListener("resize", onScroll, { passive: true });
      measure();
    } else if (!count && rails) {
      view.removeEventListener("scroll", onScroll);
      view.removeEventListener("resize", onScroll);
    }
    rails = count;
  };

  const mo = new view.MutationObserver((records) => {
    let rail = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        observeReveals(el);
        if (!rail && (el.matches(RAIL) || el.querySelector(RAIL))) rail = true;
      }
      for (const node of record.removedNodes) {
        if (node.nodeType === 1 && !rail) {
          const el = /** @type {Element} */ (node);
          if (el.matches(RAIL) || el.querySelector(RAIL)) rail = true;
        }
      }
    }
    if (rail) syncRail();
  });

  const body = doc.body ?? root;
  observeReveals(body);
  syncRail();
  mo.observe(body, { childList: true, subtree: true });
  root.setAttribute(READY, "");

  const safety = view.setTimeout(() => {
    for (const el of doc.querySelectorAll(`${REVEAL}:not([${SEEN}])`)) {
      const box = el.getBoundingClientRect();
      if (box.bottom >= 0 && box.top <= view.innerHeight) see(el);
    }
  }, SAFETY_MS);

  return () => {
    view.clearTimeout(safety);
    mo.disconnect();
    io.disconnect();
    if (rails) {
      view.removeEventListener("scroll", onScroll);
      view.removeEventListener("resize", onScroll);
    }
    if (frame) view.cancelAnimationFrame(frame);
    writeRails(null);
    root.removeAttribute(READY);
  };
}
