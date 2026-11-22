// The ring system's one helper (src/styles-ring.css).
//
// Two halves.
//
// 1. Spring maths, shared by the sheet and by any engine that wants the same
//    feel in JS. Each preset is a mass-1 spring (stiffness, damping). The
//    sheet's --ring-spring-* linear() curves are these presets sampled by
//    ringSpringLinear(); scripts/ring-system.test.mjs checks the strings match,
//    so CSS and JS can never drift apart.
//
// 2. watchRingMotion(): the three things CSS cannot do alone.
//    - Arrivals. `.ring-enter` gets `data-ring-in` the first time it enters
//      the viewport (IntersectionObserver, plus a MutationObserver for nodes a
//      later React commit adds). `html[data-ring-ready]` is set only once the
//      observer exists, so without script nothing is ever held invisible.
//    - Scroll progress. Every `[data-ring-scroll]` receives `--ring-p` (0..1,
//      the document's scroll position), written on that element alone so a
//      scroll frame restyles a 48px ring and not the page.
//    - Scroll-linked bounce. `.ring-bounce` elements in view receive
//      `--ring-kick` (px): a spring pulled by the scroll velocity, so they lag
//      a little behind a flick and settle with one overshoot. Individual
//      elements only; the body and the scroll suit-ups are never moved.
//
// Nothing here calls preventDefault or reads layout per frame beyond
// scrollTop/scrollHeight. The frame loop runs only while a spring is moving.
// Reduced motion and economy rendering keep the arrivals (they are instant
// there, the sheet has no animation for them) and the progress, and skip the
// bounce.

/** @typedef {{ stiffness: number, damping: number }} RingSpring */

/** The presets. Overshoot = exp(-πζ / √(1 − ζ²)), ζ = damping / (2√stiffness). */
export const RING_SPRINGS = /** @type {const} */ ({
  // ζ 1.0 (critically damped): no overshoot at all. Large and full-viewport
  // surfaces, where a rebound would open a gap at the screen edge.
  soft: { stiffness: 170, damping: 26 },
  // ζ 0.62: 8 % overshoot. The default for controls and cards.
  spring: { stiffness: 260, damping: 20 },
  // ζ 0.45: 21 % overshoot. Anything that expands or unfolds, and its children.
  bounce: { stiffness: 320, damping: 16 },
  // ζ 0.32: 35 % overshoot, two visible rebounds. Small ornaments only
  // (ring ticks, dots, badges, the release of a press).
  elastic: { stiffness: 420, damping: 13 },
  // ζ 0.90: quick and plain. Closing, leaving, dismissing.
  snap: { stiffness: 600, damping: 44 },
});

const SETTLE_EPSILON = 0.002;

/**
 * Position (0 → 1) of a unit spring released from rest, t seconds in.
 * @param {RingSpring} spring
 * @param {number} t
 */
export function ringSpringPosition({ stiffness, damping }, t) {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  if (zeta >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}

/**
 * Seconds until the spring stays within SETTLE_EPSILON of its target.
 * @param {RingSpring} spring
 */
export function ringSpringSettle(spring) {
  const step = 1 / 600;
  let last = 0;
  for (let t = 0; t < 4; t += step) {
    if (Math.abs(1 - ringSpringPosition(spring, t)) > SETTLE_EPSILON) last = t;
  }
  return Math.ceil((last + step) * 50) / 50;
}

/**
 * The spring as a CSS linear() easing over its settle time.
 * @param {RingSpring} spring
 * @param {number} [stops]
 */
export function ringSpringLinear(spring, stops = 36) {
  const total = ringSpringSettle(spring);
  const points = ["0"];
  for (let i = 1; i < stops; i += 1) {
    points.push(String(+ringSpringPosition(spring, (i / stops) * total).toFixed(3)));
  }
  points.push("1");
  return { css: `linear(${points.join(", ")})`, ms: Math.round(total * 1000) };
}

/**
 * One semi-implicit Euler step of a spring toward `target`. Mutates and
 * returns `state` ({ x, v }), so a frame loop allocates nothing.
 * @param {{ x: number, v: number }} state
 * @param {number} target
 * @param {RingSpring} spring
 * @param {number} dt seconds (clamped to 1/30 so a dropped frame cannot explode it)
 */
export function ringSpringStep(state, target, { stiffness, damping }, dt) {
  const h = Math.min(dt, 1 / 30);
  state.v += (stiffness * (target - state.x) - damping * state.v) * h;
  state.x += state.v * h;
  return state;
}

const READY = "data-ring-ready";
const IN = "data-ring-in";
const ENTER = ".ring-enter";
const SCROLL = "[data-ring-scroll]";
const BOUNCE = "ring-bounce";
const SAFETY_MS = 2500;
// The scroll bounce: px of lag per px/ms of scroll speed, and its ceiling.
const KICK_GAIN = 9;
const KICK_MAX = 14;
const KICK_REST = 0.05;

/**
 * Watch `doc` for the ring system and return a disposer.
 * @param {Document} [doc]
 */
export function watchRingMotion(doc = document) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  if (!view || typeof view.IntersectionObserver !== "function") return () => {};
  const calm =
    typeof view.matchMedia === "function"
      ? view.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
  const bounces = () => !calm.matches && root.getAttribute("data-world-effects") !== "economy";

  const io = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          if (!entry.target.hasAttribute(IN)) entry.target.setAttribute(IN, "");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0 },
  );

  /** @param {ParentNode} scope */
  const observeEnters = (scope) => {
    const list =
      scope instanceof view.Element && scope.matches(ENTER)
        ? [scope, ...scope.querySelectorAll(ENTER)]
        : [...scope.querySelectorAll(ENTER)];
    for (const el of list) if (!el.hasAttribute(IN)) io.observe(el);
  };

  // Live collections: a ring a later commit adds is fed on the next frame.
  const bounceElements = doc.getElementsByClassName(BOUNCE);
  const kick = { x: 0, v: 0 };
  let frame = 0;
  let lastTop = root.scrollTop;
  let lastScrollAt = 0;
  let lastFrameAt = 0;
  let pull = 0;
  let wroteKick = false;

  // The scroll rings, queried once and again only after the DOM changed
  // around them: a scroll frame must not search the document.
  /** @type {Element[] | null} */
  let rings = null;
  const writeProgress = () => {
    rings ??= Array.from(doc.querySelectorAll(SCROLL));
    if (!rings.length) return;
    const max = root.scrollHeight - root.clientHeight;
    const value = (max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0).toFixed(4);
    for (const ring of rings) {
      const style = /** @type {HTMLElement} */ (ring).style;
      if (style.getPropertyValue("--ring-p") !== value) style.setProperty("--ring-p", value);
    }
  };

  /** @param {string | null} value */
  const writeKick = (value) => {
    for (let i = 0; i < bounceElements.length; i += 1) {
      const style = /** @type {HTMLElement} */ (bounceElements[i]).style;
      if (value === null) style.removeProperty("--ring-kick");
      else style.setProperty("--ring-kick", value);
    }
    wroteKick = value !== null;
  };

  /** @param {number} now */
  const tick = (now) => {
    frame = 0;
    writeProgress();
    if (!bounceElements.length || !bounces()) {
      if (wroteKick) writeKick(null);
      return;
    }
    const dt = lastFrameAt ? (now - lastFrameAt) / 1000 : 1 / 60;
    lastFrameAt = now;
    // The pull decays once the scroll stops, so the spring is released to rest.
    if (now - lastScrollAt > 48) pull = 0;
    ringSpringStep(kick, pull, RING_SPRINGS.bounce, dt);
    if (pull === 0 && Math.abs(kick.x) < KICK_REST && Math.abs(kick.v) < KICK_REST * 20) {
      kick.x = 0;
      kick.v = 0;
      lastFrameAt = 0;
      writeKick(null);
      return;
    }
    writeKick(`${kick.x.toFixed(2)}px`);
    frame = view.requestAnimationFrame(tick);
  };

  const onScroll = () => {
    const now = view.performance.now();
    const top = root.scrollTop;
    const elapsed = Math.max(8, now - (lastScrollAt || now - 16));
    const speed = (top - lastTop) / elapsed;
    lastTop = top;
    lastScrollAt = now;
    // Content lags behind the direction of travel: scrolling down pulls it down.
    pull = Math.max(-KICK_MAX, Math.min(KICK_MAX, speed * KICK_GAIN));
    if (!frame) frame = view.requestAnimationFrame(tick);
  };

  const mo = new view.MutationObserver((records) => {
    let ring = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        observeEnters(el);
        if (!ring && (el.matches(SCROLL) || el.querySelector(SCROLL))) ring = true;
      }
      for (const node of record.removedNodes) {
        if (ring || node.nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        if (el.matches(SCROLL) || el.querySelector(SCROLL)) ring = true;
      }
    }
    if (!ring) return;
    rings = null;
    if (!frame) frame = view.requestAnimationFrame(tick);
  });

  const body = doc.body ?? root;
  observeEnters(body);
  view.addEventListener("scroll", onScroll, { passive: true });
  view.addEventListener("resize", onScroll, { passive: true });
  mo.observe(body, { childList: true, subtree: true });
  root.setAttribute(READY, "");
  writeProgress();

  // A stalled observer must never leave content invisible.
  const safety = view.setTimeout(() => {
    for (const el of doc.querySelectorAll(`${ENTER}:not([${IN}])`)) {
      const box = el.getBoundingClientRect();
      if (box.bottom >= 0 && box.top <= view.innerHeight) el.setAttribute(IN, "");
    }
  }, SAFETY_MS);

  return () => {
    view.clearTimeout(safety);
    mo.disconnect();
    io.disconnect();
    view.removeEventListener("scroll", onScroll);
    view.removeEventListener("resize", onScroll);
    if (frame) view.cancelAnimationFrame(frame);
    if (wroteKick) writeKick(null);
    for (const ring of doc.querySelectorAll(SCROLL))
      /** @type {HTMLElement} */ (ring).style.removeProperty("--ring-p");
    rings = null;
    root.removeAttribute(READY);
  };
}
