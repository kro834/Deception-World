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
//
// A few cases are pressed as a whole through one control inside them (an
// episode card through its select button, a Dream CASE through its summary,
// a library card through its title link): the case carries the press too,
// as data-press-within, and the sheets scale it by that. They used
// :has(> ... [data-press]), but an attribute named inside any :has() makes
// Chromium restyle every ancestor any :has() rule depends on, <body>
// included: every press on every control restyled the whole page (about
// 3,700 elements on /world).

const ATTRIBUTE = "data-press";
const PRESSABLE = 'a[href], button:not(:disabled), summary, [role="button"], [role="tab"]';
const SKIP =
  '.liquid-swipe-tabs, .ios-slide-open, .zeus-button, [data-press-skip], [aria-disabled="true"]';
const SLOP_PX = 8;
const MIN_TOUCH_MS = 150;
const MIN_MOUSE_MS = 90;
const RELEASE_MS = 340;
/** The cases pressed through a control inside them, and those controls. */
const CASE = ".episode-card, .dream-story-case, .library-card";
const CASE_CONTROL =
  ".episode-card > .episode-card-select, .dream-story-case > summary, .library-card > h3 > a";
const WITHIN = "data-press-within";
/**
 * The case each control last marked: the release clears that one, even
 * when the control has left its case (or the page) in the meantime.
 * @type {WeakMap<Element, Element>}
 */
const marked = new WeakMap();

/**
 * Sets (or with null removes) the press on a control, and on its case.
 * @param {Element} el @param {string | null} value
 */
function mark(el, value) {
  const was = marked.get(el);
  const box = value !== null && el.matches(CASE_CONTROL) ? el.parentElement?.closest(CASE) : null;
  if (was && was !== box) was.removeAttribute(WITHIN);
  if (value === null) {
    el.removeAttribute(ATTRIBUTE);
    marked.delete(el);
    return;
  }
  el.setAttribute(ATTRIBUTE, value);
  if (box) {
    box.setAttribute(WITHIN, value);
    marked.set(el, box);
  } else marked.delete(el);
}

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
  // Enumerable only while a hold/settle is pending, so interruption and
  // teardown can cancel all controls, including taps already released.
  /** @type {Map<Element, number>} */
  const timers = new Map();

  /** @param {Element} el @param {() => void} run @param {number} ms */
  const later = (el, run, ms) => {
    view?.clearTimeout(timers.get(el));
    timers.set(el, view?.setTimeout(() => {
      timers.delete(el);
      run();
    }, ms) ?? 0);
  };

  /** @param {Element} el */
  const settle = (el) => {
    mark(el, "out");
    later(
      el,
      () => {
        if (el.getAttribute(ATTRIBUTE) === "out") mark(el, null);
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
    mark(target, touch ? "touch" : "in");
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
  const cancel = () => {
    release();
    for (const el of timers.keys()) {
      if (el.getAttribute(ATTRIBUTE) !== "out") settle(el);
    }
  };

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
    if (pressed) mark(pressed, null);
    pressed = null;
    pointerId = -1;
    for (const [el, timer] of timers) {
      view?.clearTimeout(timer);
      mark(el, null);
    }
    timers.clear();
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
