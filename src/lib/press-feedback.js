// `html[data-press-ready]` + `[data-press]`: one press response for every
// tap, click and pen press.
//
// Tailwind's preflight makes -webkit-tap-highlight-color transparent on
// <html>, and Chrome on Android only applies :active after its tap timeout, so
// most controls gave no sign of a touch at all. A passive, capturing
// pointerdown marks the pressed control with data-press before the gesture is
// classified; the styles (src/styles-press-feedback.css) hold the visual back
// for 45 ms on touch, and a move past the slop, a pointercancel or any scroll
// releases it, so a swipe that starts on a card never dips it. A tap keeps
// the press for at least MIN_TOUCH_MS so a quick one still shows.
//
// data-press is "touch" or "in" while held and "out" for RELEASE_MS after, so
// the sheet can swap in its transition list for the press and the settle
// only, and leave each control's own transitions alone the rest of the time.
//
// Rails own their own lens and hold-to-drag (.liquid-swipe-tabs, including
// the eight-riders rail's long-press), and the HOLD + SLIDE controls and the
// Zeus button own their drag; all three are skipped, as is anything marked
// data-press-skip. Nothing here calls preventDefault, reads layout or writes
// styles.

const ATTRIBUTE = "data-press";
const PRESSABLE = 'a[href], button:not(:disabled), summary, [role="button"], [role="tab"]';
const SKIP =
  '.liquid-swipe-tabs, .ios-slide-open, .zeus-button, [data-press-skip], [aria-disabled="true"]';
const SLOP_PX = 8;
const MIN_TOUCH_MS = 150;
const MIN_MOUSE_MS = 90;
const RELEASE_MS = 340;

/**
 * Mark presses on `doc` and return a disposer.
 * @param {Document} [doc]
 */
export function watchPresses(doc = document) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  /** @type {Element | null} */
  let pressed = null;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let downAt = 0;
  let minMs = 0;
  // One pending timer per control (the rest of its minimum hold, then its
  // settle), so a quick second tap elsewhere never strands the first press.
  /** @type {WeakMap<Element, number>} */
  const timers = new WeakMap();

  /** @param {Element} el @param {() => void} run @param {number} ms */
  const later = (el, run, ms) => {
    view?.clearTimeout(timers.get(el));
    timers.set(el, view?.setTimeout(run, ms) ?? 0);
  };

  /** @param {Element} el */
  const settle = (el) => {
    el.setAttribute(ATTRIBUTE, "out");
    later(
      el,
      () => {
        if (el.getAttribute(ATTRIBUTE) === "out") el.removeAttribute(ATTRIBUTE);
      },
      RELEASE_MS,
    );
  };

  /** @param {boolean} [keepMinimum] a tap keeps its press visible; a scroll does not */
  const release = (keepMinimum = false) => {
    if (!pressed) return;
    const el = pressed;
    pressed = null;
    pointerId = -1;
    const left = keepMinimum ? minMs - (performance.now() - downAt) : 0;
    if (left > 0) later(el, () => settle(el), left);
    else settle(el);
  };

  /** @param {PointerEvent} event */
  const down = (event) => {
    if (!event.isPrimary || event.button > 0) return;
    const target = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
    if (!target || target.closest(SKIP)) return;
    release();
    const touch = event.pointerType === "touch";
    pressed = target;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    downAt = performance.now();
    minMs = touch ? MIN_TOUCH_MS : MIN_MOUSE_MS;
    view?.clearTimeout(timers.get(target));
    target.setAttribute(ATTRIBUTE, touch ? "touch" : "in");
  };

  /** @param {PointerEvent} event */
  const move = (event) => {
    if (!pressed || event.pointerId !== pointerId) return;
    if (Math.abs(event.clientX - startX) > SLOP_PX || Math.abs(event.clientY - startY) > SLOP_PX) {
      release();
    }
  };

  /** @param {PointerEvent} event */
  const up = (event) => {
    if (event.pointerId === pointerId) release(event.type === "pointerup");
  };
  const cancel = () => release();

  const options = { capture: true, passive: true };
  doc.addEventListener("pointerdown", down, options);
  doc.addEventListener("pointermove", move, options);
  doc.addEventListener("pointerup", up, options);
  doc.addEventListener("pointercancel", up, options);
  doc.addEventListener("scroll", cancel, options);
  doc.addEventListener("dragstart", cancel, options);
  doc.addEventListener("contextmenu", cancel, options);
  doc.addEventListener("visibilitychange", cancel);
  view?.addEventListener("blur", cancel);
  root.setAttribute("data-press-ready", "");

  return () => {
    release();
    doc.removeEventListener("pointerdown", down, options);
    doc.removeEventListener("pointermove", move, options);
    doc.removeEventListener("pointerup", up, options);
    doc.removeEventListener("pointercancel", up, options);
    doc.removeEventListener("scroll", cancel, options);
    doc.removeEventListener("dragstart", cancel, options);
    doc.removeEventListener("contextmenu", cancel, options);
    doc.removeEventListener("visibilitychange", cancel);
    view?.removeEventListener("blur", cancel);
    root.removeAttribute("data-press-ready");
  };
}
