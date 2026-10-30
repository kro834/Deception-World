// The future-motion layer's one helper (src/styles-fx-motion.css).
//
// Desktop pointer only ((hover: hover) and (pointer: fine)), with motion
// allowed (prefers-reduced-motion: no-preference) and outside economy
// rendering. Touch never reaches it: a phone's answer is the press (data-press,
// src/lib/press-feedback.js) with the sheet's spring settle.
//
// - Tilt: a card under the pointer leans toward it in 3D (at most TILT_DEG),
//   and its sheen (--fx-px / --fx-py, 0..100%) follows the pointer.
// - Magnet: a small control drifts toward the pointer (at most MAGNET_PX).
//
// Both move on a damped spring integrated per animation frame (the same
// constants as the sheet's --fx-spring), so a fast pass overshoots a little
// and settles, and leaving lets the card spring back to rest. Only `transform`
// and two custom properties are written, inline, on the hovered element; the
// element's own `translate` / `scale` (reveals, press) stay free. The frame
// loop runs only while something is moving and stops when everything has
// settled. Layout is read once on enter (and again after a scroll), never per
// frame. An element whose resting `transform` is already in use, or whose
// transition list is `all`, is skipped. A control whose own list transitions
// `transform` has that one entry swapped for an inert name while the spring
// owns it (inline transition-property, restored on rest), so the browser
// never smooths the spring a second time.

const TILT =
  ".manager-slot-grid > .signal, .other-archive-card, .search-result-card, .rider-special-site-card";
const MAGNET = ".primary-action, .side-panel-trigger, .poster-reset, .poster-lock, .search-submit";
const SKIP = "[data-fx-skip], [data-dragging], .liquid-swipe-tabs *";
const HOVER = "data-fx-hover";
const TILT_DEG = 5;
const MAGNET_PX = 5;
const STIFFNESS = 260; // ω² of the sheet's --fx-spring (ω = 16)
const DAMPING = 24; // 2ζω, ζ = 0.76
const REST = 0.0015;

/**
 * Watch `doc` for the tilt and magnet hovers and return a disposer.
 * @param {Document} [doc]
 */
export function watchFxMotion(doc = document) {
  const view = doc.defaultView;
  if (!view || typeof view.matchMedia !== "function") return () => {};
  const root = doc.documentElement;
  const fine = view.matchMedia("(hover: hover) and (pointer: fine)");
  const calm = view.matchMedia("(prefers-reduced-motion: reduce)");
  const allowed = () =>
    fine.matches && !calm.matches && root.getAttribute("data-world-effects") !== "economy";

  /** @typedef {{ el: HTMLElement, kind: "tilt" | "magnet", rect: DOMRect | null,
   *   tx: number, ty: number, x: number, y: number, vx: number, vy: number,
   *   px: number, py: number, live: boolean, ownsTransition: boolean }} Body */
  /** @type {Map<Element, Body>} */
  const bodies = new Map();
  let frame = 0;
  let last = 0;

  /** @param {Body} b */
  const write = (b) => {
    if (b.kind === "tilt") {
      b.el.style.setProperty(
        "transform",
        `perspective(900px) rotateX(${(-b.y * TILT_DEG).toFixed(3)}deg) rotateY(${(b.x * TILT_DEG).toFixed(3)}deg)`,
      );
      b.el.style.setProperty("--fx-px", `${(b.px * 100).toFixed(1)}%`);
      b.el.style.setProperty("--fx-py", `${(b.py * 100).toFixed(1)}%`);
    } else {
      b.el.style.setProperty(
        "transform",
        `translate3d(${(b.x * MAGNET_PX).toFixed(2)}px, ${(b.y * MAGNET_PX).toFixed(2)}px, 0)`,
      );
    }
  };

  /** @param {Body} b */
  const clear = (b) => {
    if (b.ownsTransition) b.el.style.removeProperty("transition-property");
    b.el.style.removeProperty("transform");
    b.el.style.removeProperty("--fx-px");
    b.el.style.removeProperty("--fx-py");
    bodies.delete(b.el);
  };

  /** @param {number} now */
  const step = (now) => {
    frame = 0;
    const dt = Math.min(0.032, Math.max(0.001, (now - (last || now - 16)) / 1000));
    last = now;
    let moving = false;
    for (const b of bodies.values()) {
      if (!b.el.isConnected) {
        bodies.delete(b.el);
        continue;
      }
      const ax = STIFFNESS * (b.tx - b.x) - DAMPING * b.vx;
      const ay = STIFFNESS * (b.ty - b.y) - DAMPING * b.vy;
      b.vx += ax * dt;
      b.vy += ay * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const still =
        Math.abs(b.tx - b.x) < REST &&
        Math.abs(b.ty - b.y) < REST &&
        Math.abs(b.vx) < REST * 10 &&
        Math.abs(b.vy) < REST * 10;
      if (still) {
        b.x = b.tx;
        b.y = b.ty;
        b.vx = 0;
        b.vy = 0;
        if (!b.live && b.tx === 0 && b.ty === 0) {
          clear(b);
          continue;
        }
      } else moving = true;
      write(b);
    }
    if (moving) frame = view.requestAnimationFrame(step);
    else last = 0;
  };
  const kick = () => {
    if (!frame) frame = view.requestAnimationFrame(step);
  };

  /** @param {PointerEvent} event */
  const aim = (event) => {
    if (event.pointerType !== "mouse" || !allowed()) return;
    const target = /** @type {Element | null} */ (event.target);
    if (!target || typeof target.closest !== "function") return;
    const el = /** @type {HTMLElement | null} */ (target.closest(`${TILT}, ${MAGNET}`));
    if (!el || el.closest(SKIP)) return;
    let b = bodies.get(el);
    if (!b) {
      const kind = el.matches(TILT) ? "tilt" : "magnet";
      // Leave controls whose own CSS already moves `transform` alone.
      const style = view.getComputedStyle(el);
      if (style.transform !== "none") return;
      const list = style.transitionProperty.split(",").map((name) => name.trim());
      if (list.includes("all")) return;
      const ownsTransition = list.includes("transform");
      if (ownsTransition)
        el.style.setProperty(
          "transition-property",
          list.map((name) => (name === "transform" ? "--fx-inert" : name)).join(", "),
        );
      b = {
        el,
        kind,
        rect: null,
        tx: 0,
        ty: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        px: 0.5,
        py: 0.5,
        live: true,
        ownsTransition,
      };
      bodies.set(el, b);
    }
    if (!b.live) b.live = true;
    if (!b.rect) b.rect = el.getBoundingClientRect();
    if (!el.hasAttribute(HOVER)) el.setAttribute(HOVER, "");
    const r = b.rect;
    if (!r.width || !r.height) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
    b.px = nx;
    b.py = ny;
    b.tx = nx * 2 - 1;
    b.ty = ny * 2 - 1;
    kick();
  };

  /** @param {PointerEvent} event */
  const leave = (event) => {
    const target = /** @type {Element | null} */ (event.target);
    if (!target || typeof target.closest !== "function") return;
    const el = target.closest(`${TILT}, ${MAGNET}`);
    const b = el && bodies.get(el);
    if (!el || !b || !b.live) return;
    const next = /** @type {Node | null} */ (event.relatedTarget);
    if (next && el.contains(next)) return;
    b.live = false;
    b.tx = 0;
    b.ty = 0;
    b.rect = null;
    el.removeAttribute(HOVER);
    kick();
  };

  // A scroll moves the cards under a still pointer; re-measure on the next move.
  const forget = () => {
    for (const b of bodies.values()) b.rect = null;
  };

  const settleAll = () => {
    for (const b of bodies.values()) {
      b.el.removeAttribute(HOVER);
      clear(b);
    }
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const onPolicy = () => {
    if (!allowed()) settleAll();
  };

  doc.addEventListener("pointermove", aim, { passive: true });
  doc.addEventListener("pointerout", leave, { passive: true, capture: true });
  view.addEventListener("scroll", forget, { passive: true, capture: true });
  view.addEventListener("resize", forget, { passive: true });
  fine.addEventListener?.("change", onPolicy);
  calm.addEventListener?.("change", onPolicy);
  root.setAttribute("data-fx-ready", "");

  return () => {
    doc.removeEventListener("pointermove", aim);
    doc.removeEventListener("pointerout", leave, { capture: true });
    view.removeEventListener("scroll", forget, { capture: true });
    view.removeEventListener("resize", forget);
    fine.removeEventListener?.("change", onPolicy);
    calm.removeEventListener?.("change", onPolicy);
    settleAll();
    root.removeAttribute("data-fx-ready");
  };
}
