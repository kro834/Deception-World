// A protected phrase unit that cannot fit its line (2026-11-26, owner
// 「途中改行を根こそぎ直して」, follow-up on overflow).
//
// <dw-u> is `white-space: nowrap` (styles-name-words.css), so a unit holds
// together on every line. When its box is narrower than the unit itself (an
// 85px archive column, a 44px spec cell, a 22px heading at 320px) the text
// would run out of the box. This pass finds exactly those units after layout
// and sets `data-dw-fit` on them; the sheet then lets such a unit wrap at its
// own seams (a space, a hyphen, a middle dot) and, as a last resort, anywhere
// inside it. Every other unit stays whole, so the mid-word break count does
// not grow, and the text is never touched.
//
// Plain DOM reads and one attribute, no engine-specific CSS: it works the same
// in iOS Safari, Blink and Gecko. It runs only in the browser (never during
// server rendering), batches all reads before any write, and re-runs only
// when something can have changed: a resize, the web fonts arriving, nodes a
// later render adds, a press or a change (a tab, a disclosure or a dialog
// opening, a form being chosen), the page changing height (a panel swapped
// in) and content the browser skipped (content-visibility) coming into view.
// There is no scroll listener and no polling: two looks while the page settles.

export const FIT_ATTRIBUTE = "data-dw-fit";
const FIT_SELECTOR = `dw-u[${FIT_ATTRIBUTE}]`;
// Layout rounds to subpixels; anything below this is not an overflow.
const SLACK = 1.5;

/** Is a unit of `width` too wide for `room`? (both in CSS px along the line) */
export function overflows(width, room) {
  return width > 0 && room > 0 && width > room + SLACK;
}

const isFlow = (display) => display === "inline" || display === "contents";
const isContainer = (display) => /(^|-)(flex|grid)$/.test(display);

/**
 * The units in `units` that are wider than the box they sit in, from layout as
 * it stands. Read-only. A unit in a flex or grid item is also tested against
 * the container, because the item itself grows to the unit's width.
 * @param {Iterable<Element>} units
 * @param {(el: Element) => CSSStyleDeclaration} style
 * @returns {{ fit: Element[], pending: Element[] }} pending: units with no box yet
 */
export function measureOverflow(units, style) {
  const fit = [];
  const pending = [];
  const memo = new Map();
  const styleOf = (el) => {
    let value = memo.get(el);
    if (!value) memo.set(el, (value = style(el)));
    return value;
  };
  const blockOf = (el) => {
    let node = el.parentElement;
    while (node && isFlow(styleOf(node).display)) node = node.parentElement;
    return node;
  };
  // Padding and border subtracted from the box, on the line's axis.
  const inner = (el, vertical) => {
    const s = styleOf(el);
    const size = vertical ? el.clientHeight : el.clientWidth;
    const pad = vertical
      ? parseFloat(s.paddingTop) + parseFloat(s.paddingBottom)
      : parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
    return size - (pad || 0);
  };
  for (const unit of units) {
    if (!unit.offsetWidth && !unit.offsetHeight) {
      pending.push(unit);
      continue;
    }
    const block = blockOf(unit);
    if (!block) continue;
    const vertical = (styleOf(block).writingMode ?? "").startsWith("vertical");
    const width = vertical ? unit.offsetHeight : unit.offsetWidth;
    // The unit is measured as the page lays it out (nowrap), so its own width
    // is the width it would need. Walk from its block out through flex and
    // grid containers, stopping at anything that is meant to overflow.
    let node = block;
    let tooWide = false;
    for (let depth = 0; node && depth < 4; depth += 1) {
      const s = styleOf(node);
      if (/^(auto|scroll)$/.test(s.overflowX) && depth) break;
      // A line that is meant to run on or be cut short (a ticker, an ellipsis).
      if (/^(nowrap|pre)$/.test(s.whiteSpace)) break;
      if (s.textOverflow === "ellipsis" && s.overflowX !== "visible") break;
      const room = inner(node, vertical);
      if (!room) {
        pending.push(unit);
        break;
      }
      if (overflows(width, room)) {
        tooWide = true;
        break;
      }
      const parent = node.parentElement;
      if (!parent || !isContainer(styleOf(parent).display) || styleOf(parent).overflowX !== "visible") break;
      node = parent;
    }
    if (tooWide) fit.push(unit);
  }
  return { fit, pending };
}

/**
 * Start watching a document. Returns a function that stops it. Does nothing
 * (and returns a no-op) where there is no layout to read.
 * @param {Document} [doc]
 */
export function watchPhraseFit(doc = typeof document === "undefined" ? undefined : document) {
  const win = doc?.defaultView;
  if (!doc || !win || !win.requestAnimationFrame || !win.MutationObserver) return () => {};
  let pending = [];
  let frame = 0;
  let timer = 0;
  let full = true;
  let stopped = false;
  const style = (el) => win.getComputedStyle(el);

  const run = () => {
    frame = 0;
    if (stopped || !doc.body) return;
    // Units already set are measured as the page lays them out (nowrap) too,
    // so they are released first and decided again; all reads then come
    // before the writes, within this one frame.
    const was = [...doc.querySelectorAll(FIT_SELECTOR)];
    for (const unit of was) unit.removeAttribute(FIT_ATTRIBUTE);
    const candidates = full
      ? [...doc.querySelectorAll("dw-u")]
      : [...new Set([...pending.filter((unit) => unit.isConnected), ...was.filter((unit) => unit.isConnected)])];
    let result = measureOverflow(candidates, style);
    pending = result.pending;
    // A wrapped unit narrows a shrink-to-fit grid or flex track around it, and
    // that can leave a neighbour too wide: look again at the rest until
    // nothing new overflows (never more than a few rounds).
    const fitted = new Set();
    for (let round = 0; round < 4 && result.fit.length; round += 1) {
      for (const unit of result.fit) {
        unit.setAttribute(FIT_ATTRIBUTE, "");
        fitted.add(unit);
      }
      result = measureOverflow(candidates.filter((unit) => !fitted.has(unit)), style);
    }
    full = false;
  };
  const schedule = (everything, delay = 0) => {
    if (everything) full = true;
    else if (!pending.length && !full) return;
    if (frame || timer) return;
    const go = () => {
      timer = 0;
      frame = win.requestAnimationFrame(run);
    };
    if (delay) timer = win.setTimeout(go, delay);
    else go();
  };

  const observer = new win.MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") return schedule(false, 60);
      for (const node of record.addedNodes)
        if (node.nodeType === 1 && (node.localName === "dw-u" || node.querySelector?.("dw-u")))
          return schedule(true, 80);
    }
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "hidden", "aria-selected", "aria-expanded", "aria-hidden", "data-state"],
  });
  // Width changes and fonts change every unit; the rest re-check only units
  // that had no box (a closed tab, a dialog, skipped content).
  const onResize = () => schedule(true, 120);
  const onMaybe = () => schedule(false, 160);
  const onPress = () => schedule(true, 180);
  win.addEventListener("resize", onResize, { passive: true });
  win.addEventListener("orientationchange", onResize, { passive: true });
  // Content the browser skipped (content-visibility: auto) gets its layout as
  // it nears the viewport; a page that swaps panels changes its own height.
  doc.addEventListener("contentvisibilityautostatechange", onMaybe, { capture: true });
  const size = win.ResizeObserver ? new win.ResizeObserver(() => schedule(true, 120)) : null;
  size?.observe(doc.documentElement);
  doc.addEventListener("click", onPress, { passive: true, capture: true });
  doc.addEventListener("change", onPress, { passive: true, capture: true });
  doc.addEventListener("toggle", onPress, { capture: true });
  doc.addEventListener("transitionend", onMaybe, { passive: true, capture: true });
  doc.fonts?.ready.then(() => schedule(true, 0)).catch(() => {});
  doc.fonts?.addEventListener?.("loadingdone", onResize);
  // Script that lays a page out after it loads (swapping panels, sizing
  // cards) can change a box without any event this pass hears: look again
  // once the page has loaded and twice more as it settles.
  const settle = [win.setTimeout(() => schedule(true, 0), 700), win.setTimeout(() => schedule(true, 0), 2200)];
  const onLoad = () => schedule(true, 0);
  win.addEventListener("load", onLoad);
  schedule(true, 0);
  return () => {
    for (const id of settle) win.clearTimeout(id);
    win.removeEventListener("load", onLoad);
    stopped = true;
    observer.disconnect();
    win.removeEventListener("resize", onResize);
    win.removeEventListener("orientationchange", onResize);
    doc.removeEventListener("contentvisibilityautostatechange", onMaybe, { capture: true });
    size?.disconnect();
    doc.removeEventListener("click", onPress, { capture: true });
    doc.removeEventListener("change", onPress, { capture: true });
    doc.removeEventListener("toggle", onPress, { capture: true });
    doc.removeEventListener("transitionend", onMaybe, { capture: true });
    doc.fonts?.removeEventListener?.("loadingdone", onResize);
    if (frame) win.cancelAnimationFrame(frame);
    if (timer) win.clearTimeout(timer);
  };
}
