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
//    - Glass rings. `.ring-glass` gets `data-ring-seen` once it comes within
//      GLASS_MARGIN of the viewport (the sheet requests its pictures only
//      then) and `data-ring-live` while it is on screen; a hidden tab sets
//      `html[data-ring-hidden]`. The sheet turns the layers only while live
//      and visible. The route cover's glass band is fetched on idle after
//      the first paint (not under reduced motion, economy or data saver:
//      the cover does not show it there).
//
//    - Linked sections (owner, 2026-11-23: 「連鎖する感じ」「琥珀色の糸と滑車で」).
//      A heading and the parts under it (lead, body, cards, figures) arrive
//      as one mechanism: every part hangs below its place, the heading lifts
//      first, and an amber thread over an amber pulley lifts the next part
//      at the moment the one before reaches its seat. Sections are found
//      from the page's own structure (the top-most section / article /
//      [data-ring-section]), so a page needs no markup. The helper only
//      decides WHEN: it holds the parts that are still below the fold,
//      measures them once when their chain comes near, and at release writes
//      each part's delay. The lift, the thread's stretch and the
//      pulley's turn are CSS animations on those delays (the sheet), so no
//      frame loop runs. Anything that owns its scroll choreography (the
//      suit-up stages, scroll timelines, sticky and fixed boxes) is left
//      alone. 2026-11-23 (owner: 「変身シーン以外すべて」): the pages' own
//      reveal classes (.dg-reveal, .rxs-reveal, [data-dream-reveal], the
//      cinema's [data-reveal]) are absorbed: the chain decides when they
//      arrive and lifts them itself; a tall one (a dossier chapter) is
//      opened and its paragraphs chain. The thread nodes come from a pool
//      made at rest, so nothing is inserted into the page while it scrolls.
//      Economy keeps the order and a plain fade, without threads; reduced
//      motion does nothing at all.
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
const GLASS = ".ring-glass";
const GLASS_MARGIN = "280px";
const COVER_IMAGE = "/ring-glass-20261123/cover.webp";
// The scroll bounce: px of lag per px/ms of scroll speed, and its ceiling.
const KICK_GAIN = 9;
const KICK_MAX = 14;
const KICK_REST = 0.05;

// ---- Linked sections (the pulley-and-thread chain) -----------------------
const LINK = "data-ring-link";
const LINK_ROOT = "section, article, [data-ring-section]";
const LINK_OFF = 'dialog, nav, aside, [hidden], [aria-hidden="true"], [data-ring-chain="off"]';
// Never a part, and never searched for parts: the suit-up, entry and call
// staging (the contract test's list), every stage (the World annex's
// `wa-…-stage` boxes are plain layout grids, so they stay), pinned scroll
// scenes, and everything that already owns its own arrival. A plain
// `.ring-enter` is not in this list: it joins the chain as a part (the helper
// gives it `data-ring-in` at its slot, and its own rise plays there). Nor are
// the absorbed reveal classes (2026-11-23, LINK_ABSORB): `dg-reveal` and
// `rxs-reveal` pass; any other `…reveal` class (a burn, a depth field, the
// typing) keeps its own.
const LINK_FORBID =
  /suitup|suit-up|henshin|assembly|entry|ignition|nanite|wire|burst|reactor|vortex|swarm|flame|engine|canvas|call|(?:^|\s)(?!wa-)\S*stage|sticky|pinned|scene|(?<!(?:^|\s)(?:dg|rxs)-)reveal|ring-(?:stagger|expand|bounce|glass|orbit|arc|divider|halo)|ring-enter-(?:pop|spin)/;
/**
 * The pages' own reveals the chain absorbs (owner, 2026-11-23: 「変身シーン以外すべて」).
 * `seen` says whether the page has revealed it, `show` reveals it as the page
 * would. While absorbed (`data-ring-absorb`) its own transition and arrival
 * are off (the sheet), so the chain's lift is the only motion.
 * @type {readonly { test: (el: Element) => boolean, seen: (el: Element) => boolean, show: (el: Element) => void }[]}
 */
const LINK_ABSORB = [
  {
    // The dynamic GUI kit: dossier chapters, records (styles-dynamic-gui.css).
    test: (el) => el.classList.contains("dg-reveal"),
    seen: (el) => el.hasAttribute("data-dg-seen"),
    show: (el) => el.setAttribute("data-dg-seen", ""),
  },
  {
    // The special sites' chapters (the five sagas, Final Stage).
    test: (el) => el.classList.contains("rxs-reveal"),
    seen: (el) => el.classList.contains("is-visible"),
    show: (el) => el.classList.add("is-visible"),
  },
  {
    test: (el) => el.hasAttribute("data-dream-reveal"),
    seen: (el) => el.getAttribute("data-dream-visible") === "true",
    show: (el) => el.setAttribute("data-dream-visible", "true"),
  },
  {
    // The saga cinema's blocks (use-cinema-motion.ts).
    test: (el) => el.hasAttribute("data-reveal") && el.closest(".saga-cinema") !== null,
    seen: (el) => el.classList.contains("is-visible"),
    show: (el) => el.classList.add("is-visible"),
  },
];
const ABSORB = "data-ring-absorb";
/** @param {Element} el */
const absorbOf = (el) => {
  for (const family of LINK_ABSORB) if (family.test(el)) return family;
  return null;
};
// Moved as one piece, never taken apart: measured rails, sliders, control
// rows. Their inner geometry is read by their own engines.
const LINK_WHOLE =
  /rail|liquid|slider|switch|tabs?(?![a-z])|pills?(?![a-z])|console|dial|carousel|track|controls?(?![a-z])|toolbar|actions|meter/;
const LINK_SKIP_TAGS = new Set([
  "script",
  "style",
  "template",
  "dialog",
  "canvas",
  "iframe",
  "br",
  "hr",
  "noscript",
  "link",
  "meta",
  "wbr",
]);
const LINK_ATOMS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figure",
  "img",
  "picture",
  "video",
  "svg",
  "a",
  "button",
  "blockquote",
  "table",
  "details",
  "form",
  "fieldset",
  "dl",
  "pre",
  "nav",
  "li",
  "label",
  "input",
  "select",
  "textarea",
  "summary",
  "span",
  "time",
  "output",
]);
const LINK_CONTROLS = new Set(["a", "button", "input", "select", "label", "span"]);
const LINK_HEADS = new Set(["h1", "h2", "h3", "h4"]);
const LINK_MAX_PARTS = 12;
const LINK_MAX_DEPTH = 6;
/** How far a part hangs below its place, px. The sheet's ring-link-lift-* keyframes. */
export const RING_LINK_HANG = /** @type {const} */ ({ text: 30, figure: 52 });
/**
 * The hand-off: a part starts when the one before first reaches its seat on
 * the bounce spring, the moment its thread has run out of slack.
 */
export const RING_LINK_STEP_MS = (() => {
  for (let t = 0; t < 1; t += 1 / 2000) {
    if (ringSpringPosition(RING_SPRINGS.bounce, t) >= 1) return Math.round(t * 1000);
  }
  return 130;
})();
const LINK_PULLEY_R = 8;
// A .ring-enter part rises by its own keyframe (ring-rise-in: 26px).
const LINK_ENTER_RISE = 26;
const LINK_THREAD_BASE = 100;
const LINK_GATE = 0.92;
// Thread nodes made at rest (2026-11-23): inserting nodes while the page
// scrolls restyled the whole document (its :has() rules), so the helper keeps
// a pool, made when the page is idle, and only shows and places them.
const LINK_POOL = 12;

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

  // Glass rings: near the viewport once (their pictures), on screen now (their turn).
  const glassNear = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-ring-seen", "");
        glassNear.unobserve(entry.target);
      }
    },
    { rootMargin: GLASS_MARGIN, threshold: 0 },
  );
  const glassLive = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        entry.target.toggleAttribute("data-ring-live", entry.isIntersecting);
    },
    { threshold: 0 },
  );

  /** @param {ParentNode} scope */
  const observeEnters = (scope) => {
    const list =
      scope instanceof view.Element && scope.matches(ENTER)
        ? [scope, ...scope.querySelectorAll(ENTER)]
        : [...scope.querySelectorAll(ENTER)];
    for (const el of list) if (!el.hasAttribute(IN)) io.observe(el);
    const glass =
      scope instanceof view.Element && scope.matches(GLASS)
        ? [scope, ...scope.querySelectorAll(GLASS)]
        : [...scope.querySelectorAll(GLASS)];
    for (const el of glass) {
      if (!el.hasAttribute("data-ring-seen")) glassNear.observe(el);
      glassLive.observe(el);
    }
  };

  const onVisibility = () =>
    root.toggleAttribute("data-ring-hidden", doc.visibilityState === "hidden");

  // The route cover's glass band: fetched when the page is idle, so the first
  // covered route change already has it and the first paint never waits for it.
  let coverIdle = 0;
  const fetchCover = () => {
    coverIdle = 0;
    const saver = /** @type {{ connection?: { saveData?: boolean } }} */ (view.navigator)
      .connection;
    if (!bounces() || saver?.saveData) return;
    new view.Image().src = COVER_IMAGE;
  };
  const scheduleCover = () => {
    coverIdle =
      typeof view.requestIdleCallback === "function"
        ? view.requestIdleCallback(fetchCover, { timeout: 4000 })
        : view.setTimeout(fetchCover, 1800);
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
    // No frame is asked for on a page with nothing to feed (2026-11-23): a
    // frame callback each scroll frame cost a forced restyle for nothing.
    if (frame) return;
    rings ??= Array.from(doc.querySelectorAll(SCROLL));
    if (rings.length || bounceElements.length || wroteKick)
      frame = view.requestAnimationFrame(tick);
  };

  // ---- Linked sections: the pulley-and-thread chain -----------------------
  // A chain is a heading and the parts that follow it, at most about one
  // viewport tall. Only chains that are near and still below the fold are
  // armed (held, measured, threaded). Everything else is untouched.
  /**
   * @typedef {{ test: (el: Element) => boolean, seen: (el: Element) => boolean, show: (el: Element) => void }} LinkFamily
   * @typedef {{ el: HTMLElement, chain: LinkChain, i: number, figure: boolean, head: boolean, own: boolean, once: boolean,
   *   fam: LinkFamily | null, state: 0 | 1 | 2, start: number, timer: number, top: number, bottom: number, left: number, right: number }} LinkPart
   * @typedef {{ parts: LinkPart[], links: (HTMLElement | null)[], near: boolean, armed: boolean,
   *   lastStart: number, top: number, body: boolean, root: Element, wait: number }} LinkChain
   * @typedef {{ el: Element, chains: LinkChain[], done: boolean, dirty: boolean, near: boolean, at: number, wait: number }} LinkRoot
   */
  /** @type {WeakMap<Element, LinkPart>} */
  const partOf = new WeakMap();
  /** @type {WeakMap<Element, LinkChain>} */
  const chainOf = new WeakMap();
  /** @type {WeakMap<Element, LinkRoot>} */
  const rootOf = new WeakMap();
  /** @type {LinkRoot[]} */
  const linkRoots = [];
  /** @type {Set<LinkPart>} */
  const held = new Set();
  /** @type {HTMLElement | null} */
  let linkLayer = null;
  let linkSafety = 0;
  let linkScan = 0;
  const linksOn = () => !calm.matches;

  /** @param {string} color a computed colour */
  const alphaOf = (color) => {
    if (color === "transparent") return 0;
    if (!color.startsWith("rgba") && !color.includes("/")) return 1;
    const match = /[,/]\s*([\d.]+)%?\s*\)$/.exec(color);
    return match ? parseFloat(match[1]) : 1;
  };

  /** @param {Element} el */
  const ownText = (el) => {
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 && /\S/.test(/** @type {Text} */ (node).data)) return true;
    }
    return false;
  };

  /** @param {Element} el */
  const controlsOnly = (el) => {
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
      if (!LINK_CONTROLS.has(child.localName)) return false;
    }
    return true;
  };

  /**
   * The parts of `el`, in document order. A transparent wrapper is opened;
   * a card, a text block, a figure or a control row is one part.
   * @param {Element} el
   * @param {number} depth
   * @param {LinkPart[]} out
   * @param {number} vh
   * @param {number} vw
   * @param {number} sy
   */
  const collectParts = (el, depth, out, vh, vw, sy) => {
    for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
      const tag = child.localName;
      if (LINK_SKIP_TAGS.has(tag) || !(child instanceof view.HTMLElement)) continue;
      if (
        child.hidden ||
        child.getAttribute("aria-hidden") === "true" ||
        child.getAttribute("data-ring-chain") === "off"
      )
        continue;
      const cls = child.className;
      if (cls && LINK_FORBID.test(cls)) continue;
      // One of the pages' own reveals that has not arrived yet: the chain
      // takes it over (its own hold is invisible below the fold anyway).
      // One the page has already revealed is taken too while it is wholly
      // below the fold (its own arrival is spent off screen, or still to run).
      const family = absorbOf(child);
      const fam =
        family &&
        (!family.seen(child) ||
          child.hasAttribute(ABSORB) ||
          child.getBoundingClientRect().top > vh)
          ? family
          : null;
      // A plain .ring-enter that has not arrived yet: it keeps its own rise,
      // and the chain decides when (it is held by its own rule until then).
      // Once it has arrived it is never held again (its own rule would outrank the lift).
      const enter = cls !== "" && /(?:^|\s)ring-enter(?:\s|$)/.test(cls);
      const own = enter && !child.hasAttribute(IN);
      const cs = view.getComputedStyle(child);
      const display = cs.display;
      if (display === "none") continue;
      // A reveal pinned to the scroll (a view or scroll timeline) keeps its own.
      if (fam && cs.animationTimeline && !/^(?:auto(?:,\s*auto)*)$/.test(cs.animationTimeline))
        continue;
      if (display === "contents") {
        collectParts(child, depth, out, vh, vw, sy);
        continue;
      }
      // An inline box takes no transform; an out-of-flow or pinned box, a box
      // that is already animated, moved, dimmed or scrolls is not ours.
      if (display === "inline") continue;
      if (cs.position !== "static" && cs.position !== "relative") continue;
      // A box with its own entrance (a dossier part's card, a form record)
      // is never moved; once that entrance has played (nothing current on
      // it, 2026-11-23) it is opened and what is inside it may chain.
      if (
        !fam &&
        (cs.animationName !== "none" || cs.translate !== "none") &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) >= 0.99 &&
        child.childElementCount > 0 &&
        cs.overflowY !== "auto" &&
        cs.overflowY !== "scroll" &&
        typeof child.getAnimations === "function" &&
        child.getAnimations().length === 0
      ) {
        collectParts(child, depth + 1, out, vh, vw, sy);
        continue;
      }
      if (
        (!fam && cs.animationName !== "none") ||
        (!fam && cs.translate !== "none") ||
        (!fam && cs.visibility === "hidden") ||
        (!own && !fam && parseFloat(cs.opacity) < 0.99) ||
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll"
      )
        continue;
      const rect = child.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      // A tall reveal, or one that holds a heading and what follows it (a
      // dossier chapter, a saga's long copy, the cinema's layouts), is
      // opened: it is revealed at once while it is still wholly below the
      // fold, with its own arrival off, and its parts chain. One already on
      // screen is left to its own reveal.
      if (child.getAttribute(ABSORB) === "open") {
        collectParts(child, depth + 1, out, vh, vw, sy);
        continue;
      }
      if (
        fam &&
        child.childElementCount > 1 &&
        (rect.height > Math.min(vh * 0.5, 360) ||
          (rect.height > 160 && child.querySelector("h1, h2, h3, h4") !== null))
      ) {
        if (rect.top <= vh) continue;
        child.setAttribute(ABSORB, "open");
        fam.show(child);
        collectParts(child, depth + 1, out, vh, vw, sy);
        continue;
      }
      const card =
        cs.backgroundImage !== "none" ||
        alphaOf(cs.backgroundColor) > 0.02 ||
        (cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0) ||
        cs.boxShadow !== "none";
      // `data-ring-open` (2026-11-23): a row whose items each arrive (the home's cards).
      const whole =
        !child.hasAttribute("data-ring-open") &&
        (own ||
          fam !== null ||
          card ||
          LINK_ATOMS.has(tag) ||
          depth >= LINK_MAX_DEPTH ||
          child.childElementCount === 0 ||
          cs.overflowX !== "visible" ||
          child.hasAttribute("role") ||
          (cls !== "" && LINK_WHOLE.test(cls)) ||
          ownText(child) ||
          controlsOnly(child) ||
          // A heading group (a number, a kicker and the title): one part, the
          // chain's first (2026-11-23).
          (rect.height < 200 &&
            child.childElementCount <= 4 &&
            child.querySelector(
              ":scope > :is(h1, h2, h3, h4), :scope > * > :is(h1, h2, h3, h4)",
            ) !== null));
      if (!whole) {
        collectParts(child, depth + 1, out, vh, vw, sy);
        continue;
      }
      // Never a page-scale block, full-bleed media or a canvas host.
      if (rect.height > vh * 1.25 || rect.width >= vw - 4) continue;
      if (child.querySelector("canvas, iframe") !== null) continue;
      out.push({
        el: child,
        chain: /** @type {LinkChain} */ (/** @type {unknown} */ (null)),
        i: 0,
        figure:
          card ||
          tag === "figure" ||
          tag === "img" ||
          tag === "picture" ||
          tag === "video" ||
          child.querySelector("img, picture, video") !== null,
        head:
          LINK_HEADS.has(tag) ||
          (!card && rect.height < 320 && child.querySelector("h1, h2, h3, h4") !== null),
        own,
        once: enter && !own,
        fam,
        state: 0,
        timer: 0,
        start: 0,
        top: rect.top + sy,
        bottom: rect.bottom + sy,
        left: rect.left,
        right: rect.right,
      });
    }
  };

  /** @param {LinkPart} part */
  const clearPart = (part) => {
    if (part.timer) {
      view.clearTimeout(part.timer);
      part.timer = 0;
    }
    if (part.state === 1) {
      held.delete(part);
      gateIO.unobserve(part.el);
      // A .ring-enter the chain was holding goes back to its own observer.
      if (part.own && !part.el.hasAttribute(IN)) io.observe(part.el);
    }
    if (part.state !== 0) {
      const landed = part.state === 2;
      part.state = 0;
      part.el.style.removeProperty("animation-delay");
      if (part.own) return;
      part.el.removeAttribute(LINK);
      // An absorbed reveal that has arrived gets its own transitions back
      // (hover and press); its arrival stays off for good.
      if (landed && part.fam) part.el.setAttribute(ABSORB, "done");
    }
  };

  // ---- The thread pool. Nodes are made at rest (load, idle) and only
  // shown, placed and hidden while the page scrolls.
  /** @type {HTMLElement[]} */
  const pool = [];
  let poolIdle = 0;
  const ensureLayer = () => {
    if (linkLayer && linkLayer.isConnected) return linkLayer;
    linkLayer = doc.createElement("div");
    linkLayer.className = "ring-links";
    linkLayer.setAttribute("aria-hidden", "true");
    (doc.body ?? root).appendChild(linkLayer);
    pool.length = 0;
    return linkLayer;
  };
  const makeNode = () => {
    const node = doc.createElement("i");
    node.className = "ring-link";
    node.setAttribute("data-ring-idle", "");
    const pull = doc.createElement("i");
    pull.className = "ring-thread ring-thread-pull";
    const lift = doc.createElement("i");
    lift.className = "ring-thread ring-thread-lift";
    const pulley = doc.createElement("i");
    pulley.className = "ring-pulley";
    node.append(pull, lift, pulley);
    return node;
  };
  /** Threads the sections read near the screen may still ask for. */
  const poolNeed = () => {
    let need = 0;
    for (const rec of linkRoots) {
      if (!rec.near) continue;
      for (const chain of rec.chains) if (!chain.armed) need += chain.parts.length - 1;
    }
    return need;
  };
  /**
   * Top the pool up, in one insertion, when the page is idle: LINK_POOL free
   * nodes, or as many as the sections near the screen may ask for.
   */
  const fillPool = () => {
    poolIdle = 0;
    if (!linksOn() || !bounces() || !doc.body) return;
    const layer = ensureLayer();
    const want = Math.max(LINK_POOL, poolNeed());
    if (pool.length >= want) return;
    const batch = doc.createDocumentFragment();
    while (pool.length < want) {
      const node = makeNode();
      pool.push(node);
      batch.appendChild(node);
    }
    layer.appendChild(batch);
  };
  const queuePool = () => {
    if (poolIdle || (pool.length >= LINK_POOL / 2 && pool.length >= poolNeed())) return;
    poolIdle =
      typeof view.requestIdleCallback === "function"
        ? view.requestIdleCallback(fillPool, { timeout: 2000 })
        : view.setTimeout(fillPool, 600);
  };
  /** @param {HTMLElement} node */
  const freeNode = (node) => {
    node.removeAttribute("data-ring-run");
    node.setAttribute("data-ring-idle", "");
    if (node.parentNode === linkLayer) pool.push(node);
  };

  /** @param {LinkChain} chain */
  const dropThreads = (chain) => {
    for (let i = 0; i < chain.links.length; i += 1) {
      const node = chain.links[i];
      if (node) freeNode(node);
      chain.links[i] = null;
    }
  };

  /**
   * How long the section's own entrance still runs, ms (a dossier part that
   * was just chosen springs into the layout): 0 when it is at rest. `deep`
   * counts the entrances inside it too (finite ones only; a loop never ends).
   * @param {Element} el
   * @param {boolean} [deep]
   */
  const rootSettling = (el, deep = false) => {
    if (typeof el.getAnimations !== "function") return 0;
    let left = 0;
    for (const animation of el.getAnimations({ subtree: deep })) {
      if (animation.playState !== "running" || typeof animation.currentTime !== "number") continue;
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end))
        left = Math.max(left, end - animation.currentTime);
    }
    return left > 0 ? Math.min(1200, Math.ceil(left) + 32) : 0;
  };

  /** Back to the page's own state: nothing held, no threads. @param {LinkChain} chain */
  const disarm = (chain) => {
    if (chain.wait) {
      view.clearTimeout(chain.wait);
      chain.wait = 0;
    }
    for (const part of chain.parts) clearPart(part);
    dropThreads(chain);
    chain.armed = false;
    chain.lastStart = 0;
  };

  /**
   * One pulley with its two thread ends, placed from the measured boxes.
   * The thread ends are 100px strips scaled to their length, so the sheet
   * can stretch them on the very curve that moves the part they hold.
   * @param {LinkPart} a the part that pulls
   * @param {LinkPart} b the part that is lifted
   */
  const makeThread = (a, b) => {
    const r = LINK_PULLEY_R;
    let cx = 0;
    let cy = 0;
    let x1 = r;
    let x2 = r;
    let l1 = NaN;
    let l2 = 0;
    if (b.top >= a.bottom - 4) {
      // Stacked: the thread runs down beside the left edge of the two boxes,
      // past a pulley in the gap between them. With a wide gutter the wheel
      // sits beside the thread; in a phone's 16px gutter the thread runs
      // through its centre. Never over the text. A wide gap means something
      // the chain must not cross (a stage, full-bleed media) lies between.
      if (b.top - a.bottom > 96) return null;
      const edge = Math.max(a.left, b.left);
      if (edge < r + 6) return null;
      const beside = edge >= 2 * r + 8;
      const x = beside ? edge - 6 : edge - 4;
      cx = beside ? x - r : x;
      x1 = x - cx;
      x2 = x1;
      cy = (a.bottom + b.top) / 2;
      // The pulling end is tied up the side of the part above (at most 140px
      // up), so the taut thread is long enough to be read as a thread.
      if (x >= a.left - 16 && x <= a.right + 16)
        l1 = a.bottom - Math.min(140, a.bottom - a.top) - cy;
      l2 = b.top - cy;
    } else {
      // Side by side: a pulley over the gap at the top edge, one thread end
      // down to each box.
      const gap = b.left - a.right;
      if (gap < 4 || gap > 96) return null;
      cx = a.right + gap / 2;
      cy = Math.min(a.top, b.top) - 3;
      x1 = -r;
      x2 = r;
      l1 = a.top - cy;
      l2 = b.top - cy;
    }
    if (cx - r < 2 || cx + r > root.clientWidth - 2 || cy < r) return null;
    const layer = ensureLayer();
    // From the pool; a node is made here only if the pool ran dry.
    let node = pool.pop();
    if (!node) {
      node = makeNode();
      layer.appendChild(node);
    }
    queuePool();
    const [pull, lift, pulley] = /** @type {HTMLElement[]} */ ([...node.children]);
    node.style.left = `${cx.toFixed(1)}px`;
    node.style.top = `${cy.toFixed(1)}px`;
    const hangB = b.own ? LINK_ENTER_RISE : b.figure ? RING_LINK_HANG.figure : RING_LINK_HANG.text;
    node.toggleAttribute("data-ring-nopull", l1 !== l1);
    if (l1 === l1) {
      const hangA = a.own
        ? LINK_ENTER_RISE
        : a.figure
          ? RING_LINK_HANG.figure
          : RING_LINK_HANG.text;
      pull.style.left = `${x1}px`;
      pull.style.setProperty("--ring-thread-to", (l1 / LINK_THREAD_BASE).toFixed(4));
      pull.style.setProperty("--ring-thread-from", ((l1 + hangA) / LINK_THREAD_BASE).toFixed(4));
    }
    lift.style.left = `${x2}px`;
    lift.style.setProperty("--ring-thread-to", (l2 / LINK_THREAD_BASE).toFixed(4));
    lift.style.setProperty("--ring-thread-from", ((l2 + hangB) / LINK_THREAD_BASE).toFixed(4));
    // The wheel turns by the thread that runs over it: travel / radius.
    pulley.style.setProperty("--ring-pulley-from", `${(-hangB / r).toFixed(2)}rad`);
    node.removeAttribute("data-ring-idle");
    return node;
  };

  /**
   * Hold the parts of a chain that are still below the fold and thread them.
   * Runs in an observer callback, never in a frame: it measures each part once.
   * @param {LinkChain} chain
   */
  const arm = (chain) => {
    // A section that is still springing into the layout (a dossier part just
    // chosen) is measured once it has landed.
    if (chain.wait) return;
    const settle = rootSettling(chain.root);
    if (settle > 0) {
      chain.wait = view.setTimeout(() => {
        chain.wait = 0;
        if (chain.near && !chain.armed) arm(chain);
      }, settle);
      return;
    }
    // Held only when wholly below the fold: a part with a sliver on screen is
    // never hidden. An absorbed reveal is invisible by its own hold until it
    // arrives, so it is always the chain's (its geometry is read without
    // that hold's offset: the sheet takes it off while absorbed).
    const line = view.innerHeight;
    const sy = root.scrollTop;
    const parts = chain.parts;
    let any = false;
    for (const part of parts) if (part.fam) part.el.setAttribute(ABSORB, "");
    for (const part of parts) {
      const rect = part.el.getBoundingClientRect();
      part.top = rect.top + sy;
      part.bottom = rect.bottom + sy;
      part.left = rect.left;
      part.right = rect.right;
      part.start = 0;
      const hidden = part.fam !== null && !part.fam.seen(part.el);
      part.state = !part.once && rect.height > 0 && (hidden || rect.top > line) ? 1 : 0;
      // An absorbed part the chain does not hold is simply there.
      if (part.state === 0 && part.fam && part.el.getAttribute(ABSORB) === "")
        part.el.setAttribute(ABSORB, "done");
    }
    for (const part of parts) {
      if (part.state !== 1) continue;
      if (part.own) {
        // Arrived already (its own observer was first): it is simply there.
        if (part.el.hasAttribute(IN)) {
          part.own = false;
          part.once = true;
          part.state = 0;
          continue;
        }
        io.unobserve(part.el);
      } else part.el.setAttribute(LINK, "hold");
      held.add(part);
      gateIO.observe(part.el);
      any = true;
    }
    chain.armed = any;
    chain.lastStart = 0;
    // The safety sweep is set before any thread is built.
    if (any && !linkSafety) linkSafety = view.setTimeout(sweepHeld, SAFETY_MS);
    if (any && bounces()) {
      for (let i = 1; i < parts.length; i += 1) {
        if (parts[i].state === 1) chain.links[i] = makeThread(parts[i - 1], parts[i]);
      }
    }
  };

  /**
   * Let a held part go. Its start is the moment the part before it reaches
   * its seat, so the chain runs as cause and effect; the sheet does the rest
   * from the delays written here.
   * @param {LinkPart} part
   * @param {number} now
   */
  const release = (part, now) => {
    if (part.state !== 1) return;
    const chain = part.chain;
    for (let k = 0; k < part.i; k += 1) release(chain.parts[k], now);
    const start = chain.lastStart ? Math.max(now, chain.lastStart + RING_LINK_STEP_MS) : now;
    chain.lastStart = start;
    part.start = start;
    part.state = 2;
    held.delete(part);
    gateIO.unobserve(part.el);
    // A later part waits on a timer (still held), not in an animation's delay:
    // an animation, even one still in its delay, is restyled on every frame
    // the page draws (2026-11-23). It is set going as its thread goes taut,
    // one step before its lift.
    const wait = Math.round(start - now) - (part.own ? 0 : RING_LINK_STEP_MS);
    if (wait > 24)
      part.timer = view.setTimeout(() => {
        part.timer = 0;
        go(part, view.performance.now());
      }, wait);
    else go(part, now);
  };

  /**
   * Set a released part (and its thread) going: the sheet does the rest from
   * the delays written here.
   * @param {LinkPart} part
   * @param {number} now
   */
  const go = (part, now) => {
    if (part.state !== 2) return;
    const chain = part.chain;
    const delay = Math.max(0, Math.round(part.start - now));
    const style = part.el.style;
    // An absorbed reveal arrives as the page would show it, on the chain's lift.
    if (part.fam && !part.fam.seen(part.el)) part.fam.show(part.el);
    if (part.own) {
      // Its own rise, at the chain's moment.
      style.setProperty("animation-delay", `${delay}ms`);
      part.el.setAttribute(IN, "");
      // Economy has no rise to wait for.
      if (!bounces()) {
        clearPart(part);
        part.own = false;
        part.once = true;
      }
    } else {
      // The part shows on its hook one step early, as its thread goes taut.
      // The delays are written as the part's own animation-delay (not as
      // inherited custom properties, which restyled every node inside it).
      const seen = `${Math.max(0, delay - RING_LINK_STEP_MS)}ms`;
      style.setProperty("animation-delay", bounces() ? `${delay}ms, ${seen}` : seen);
      part.el.setAttribute(LINK, part.figure ? "figure" : "text");
    }
    const node = chain.links[part.i];
    if (!node) return;
    const puller = chain.parts[part.i - 1];
    node.style.setProperty("--ring-link-d", `${delay}ms`);
    node.style.setProperty("--ring-link-f", `${delay - RING_LINK_STEP_MS}ms`);
    // The pulling end follows the part above, wherever that is in its own lift.
    node.style.setProperty(
      "--ring-link-a",
      `${puller.start ? Math.round(puller.start - now) : -9999}ms`,
    );
    node.setAttribute("data-ring-run", part.own ? "enter" : "");
  };

  /** A part has landed: hand it back to the page with nothing left on it. @param {Event} event */
  const onLinkEnd = (event) => {
    const part = partOf.get(/** @type {Element} */ (event.target));
    if (!part || part.state !== 2) return;
    const name = /** @type {AnimationEvent} */ (event).animationName;
    if (part.own) {
      // It has arrived for good: from here on it is an ordinary box.
      clearPart(part);
      part.own = false;
      part.once = true;
      return;
    }
    if (
      event.type === "animationcancel" ||
      name === "ring-link-lift-text" ||
      name === "ring-link-lift-figure" ||
      (name === "ring-link-seen" && !bounces())
    )
      clearPart(part);
  };

  // A stalled observer, or a jump past a held part, must never leave it invisible.
  // Once the scroll has stopped, a part with any sliver on screen is let go
  // (the gate line is 8 % up while scrolling; a jump may stop just below it).
  function sweepHeld() {
    if (linkSafety) view.clearTimeout(linkSafety);
    linkSafety = 0;
    if (!held.size) return;
    const bottom = view.innerHeight;
    const now = view.performance.now();
    for (const part of [...held]) {
      if (!part.el.isConnected) {
        held.delete(part);
        continue;
      }
      if (part.el.getBoundingClientRect().top < bottom) release(part, now);
    }
    if (held.size) linkSafety = view.setTimeout(sweepHeld, SAFETY_MS);
  }

  const gateIO = new view.IntersectionObserver(
    (entries) => {
      const now = view.performance.now();
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const part = partOf.get(entry.target);
        if (part) release(part, now);
      }
    },
    { rootMargin: `0px 0px -${Math.round((1 - LINK_GATE) * 100)}% 0px`, threshold: 0 },
  );

  // A chain is armed when its heading comes within 30 % of a viewport of the
  // fold (only its parts below the fold are held), and put back when it leaves
  // downwards: scrolling up never shows a held part, and scrolling down again
  // replays the mechanism.
  const nearIO = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const chain = chainOf.get(entry.target);
        if (!chain) continue;
        if (entry.isIntersecting) {
          if (chain.near) continue;
          chain.near = true;
          if (!chain.armed) arm(chain);
        } else if (chain.near) {
          chain.near = false;
          if (entry.boundingClientRect.top > 0) disarm(chain);
        }
      }
    },
    { rootMargin: "0px 0px 30% 0px", threshold: 0 },
  );

  /** @param {LinkRoot} rec */
  const forgetRoot = (rec) => {
    for (const chain of rec.chains) {
      disarm(chain);
      nearIO.unobserve(chain.parts[0].el);
      chainOf.delete(chain.parts[0].el);
      for (const part of chain.parts) partOf.delete(part.el);
    }
    rec.chains.length = 0;
  };

  /** @param {LinkRoot} rec */
  const detectRoot = (rec) => {
    rec.done = true;
    rec.dirty = false;
    rec.at = view.performance.now();
    forgetRoot(rec);
    if (!linksOn()) return;
    // Only a section the document itself scrolls: the threads live in page coordinates.
    const body = doc.body;
    for (let up = rec.el.parentElement; up && up !== body && up !== root; up = up.parentElement) {
      const cs = view.getComputedStyle(up);
      if (cs.position === "fixed" || cs.overflowY === "auto" || cs.overflowY === "scroll") return;
    }
    // A section out of the layout (a dossier part not chosen) is read when it comes in.
    if (rec.el.getClientRects().length === 0) {
      rec.done = false;
      return;
    }
    const vh = view.innerHeight;
    /** @type {LinkPart[]} */
    const parts = [];
    collectParts(rec.el, 0, parts, vh, root.clientWidth, root.scrollTop);
    /** @type {LinkChain | null} */
    let chain = null;
    for (const part of parts) {
      if (
        !chain ||
        (part.head && chain.body) ||
        chain.parts.length >= LINK_MAX_PARTS ||
        part.top - chain.top > vh * 0.9
      ) {
        chain = {
          parts: [],
          links: [],
          near: false,
          armed: false,
          lastStart: 0,
          top: part.top,
          body: false,
          root: rec.el,
          wait: 0,
        };
        rec.chains.push(chain);
      }
      if (!part.head) chain.body = true;
      part.chain = chain;
      part.i = chain.parts.length;
      chain.parts.push(part);
      chain.links.push(null);
      partOf.set(part.el, part);
    }
    for (const made of rec.chains) {
      chainOf.set(made.parts[0].el, made);
      nearIO.observe(made.parts[0].el);
    }
    // The section is within a viewport of the screen: its threads are made
    // now, at idle, before its chains come near.
    if (rec.chains.length) queuePool();
  };

  const rootIO = new view.IntersectionObserver(
    (entries) => {
      // A section is read only while it is within a viewport of the screen:
      // the first time, and again if its content changed while it was away.
      for (const entry of entries) {
        const rec = rootOf.get(entry.target);
        if (!rec) continue;
        rec.near = entry.isIntersecting;
        if (rec.near && (!rec.done || rec.dirty)) {
          // A section springing into the layout (a dossier part just chosen,
          // while the page scrolls smoothly back to its top) is read once it
          // has landed: "below the fold" must mean where it will rest.
          const settle = rootSettling(rec.el, true);
          if (settle > 0) {
            if (!rec.wait)
              rec.wait = view.setTimeout(() => {
                rec.wait = 0;
                if (rec.near && (!rec.done || rec.dirty)) detectRoot(rec);
              }, settle);
          } else detectRoot(rec);
        }
        // Taken out of the layout (another dossier part was chosen): nothing
        // stays held in it, and it is read afresh when it comes back.
        else if (!rec.near && rec.done && entry.target.getClientRects().length === 0) {
          forgetRoot(rec);
          rec.done = false;
        }
      }
    },
    { rootMargin: "100% 0px", threshold: 0 },
  );

  /** Find new sections, drop the ones that left the document, re-read the ones that changed. */
  const scanLinks = () => {
    linkScan = 0;
    if (!linksOn()) return;
    const now = view.performance.now();
    for (let i = linkRoots.length - 1; i >= 0; i -= 1) {
      const rec = linkRoots[i];
      if (!rec.el.isConnected) {
        forgetRoot(rec);
        rootIO.unobserve(rec.el);
        linkRoots.splice(i, 1);
        continue;
      }
      if (!rec.done || !rec.dirty || !rec.near) continue;
      let busy = false;
      for (const chain of rec.chains)
        for (const part of chain.parts) if (part.state === 2) busy = true;
      // A chain in motion finishes first; a restless section is re-read at most every 1.5 s.
      if (busy || now - rec.at < 1500) {
        queueLinkScan();
        continue;
      }
      detectRoot(rec);
    }
    for (const el of doc.querySelectorAll(LINK_ROOT)) {
      if (rootOf.has(el)) continue;
      if (el.parentElement?.closest(LINK_ROOT) || el.closest(LINK_OFF)) continue;
      const cls = el.getAttribute("class");
      if (cls && LINK_FORBID.test(cls)) continue;
      /** @type {LinkRoot} */
      const rec = { el, chains: [], done: false, dirty: false, near: false, at: 0, wait: 0 };
      rootOf.set(el, rec);
      linkRoots.push(rec);
      rootIO.observe(el);
    }
  };

  function queueLinkScan() {
    if (!linkScan) linkScan = view.setTimeout(scanLinks, 320);
  }

  /**
   * The layout moved under the threads: resting ones go, waiting ones are
   * measured again. The parts themselves are the same boxes, so a section is
   * read again only when the window changed (a breakpoint may regroup it).
   * @param {unknown} [event]
   */
  const onLinkLayout = (event) => {
    const resized = event instanceof view.Event;
    const fold = view.innerHeight;
    for (const rec of linkRoots) {
      if (resized) rec.dirty = rec.done;
      for (const chain of rec.chains) {
        let moving = false;
        for (const part of chain.parts) if (part.state === 2) moving = true;
        if (moving) continue;
        if (!chain.armed) {
          dropThreads(chain);
          continue;
        }
        disarm(chain);
        if (
          chain.near &&
          chain.parts[chain.parts.length - 1].el.getBoundingClientRect().bottom > fold
        )
          arm(chain);
      }
    }
    if (resized) queueLinkScan();
  };

  /** Print, reduced motion switched on: everything back at once, absorbed reveals shown. */
  const releaseAllLinks = () => {
    for (const rec of linkRoots)
      for (const chain of rec.chains) {
        disarm(chain);
        for (const part of chain.parts)
          if (part.fam && !part.fam.seen(part.el)) part.fam.show(part.el);
      }
  };

  const linkSizes =
    typeof view.ResizeObserver === "function" ? new view.ResizeObserver(onLinkLayout) : null;

  const mo = new view.MutationObserver((records) => {
    let ring = false;
    for (const record of records) {
      // The thread layer is the helper's own.
      if (linkLayer && (record.target === linkLayer || linkLayer.contains(record.target))) continue;
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = /** @type {Element} */ (node);
        if (el === linkLayer) continue;
        observeEnters(el);
        // A section that gained content is measured again once it is calm.
        let host = el.parentElement?.closest(LINK_ROOT) ?? null;
        while (host && !rootOf.has(host)) host = host.parentElement?.closest(LINK_ROOT) ?? null;
        const rec = host && rootOf.get(host);
        if (rec) rec.dirty = rec.done;
        if (!rec || rec.near) queueLinkScan();
        if (!ring && (el.matches(SCROLL) || el.querySelector(SCROLL))) ring = true;
      }
      if (record.removedNodes.length) queueLinkScan();
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
  doc.addEventListener("visibilitychange", onVisibility);
  onVisibility();
  if (doc.readyState === "complete") scheduleCover();
  else view.addEventListener("load", scheduleCover, { once: true });
  root.setAttribute(READY, "");
  writeProgress();
  doc.addEventListener("animationend", onLinkEnd);
  doc.addEventListener("animationcancel", onLinkEnd);
  view.addEventListener("beforeprint", releaseAllLinks);
  view.addEventListener("resize", onLinkLayout, { passive: true });
  view.addEventListener("scrollend", sweepHeld, { passive: true });
  calm.addEventListener?.("change", releaseAllLinks);
  if (doc.body) linkSizes?.observe(doc.body);
  scanLinks();
  queuePool();

  // A stalled observer must never leave content invisible.
  const safety = view.setTimeout(() => {
    for (const el of doc.querySelectorAll(`${ENTER}:not([${IN}])`)) {
      const box = el.getBoundingClientRect();
      if (box.bottom >= 0 && box.top <= view.innerHeight) el.setAttribute(IN, "");
    }
  }, SAFETY_MS);

  return () => {
    view.clearTimeout(safety);
    view.clearTimeout(linkSafety);
    view.clearTimeout(linkScan);
    if (poolIdle) {
      if (typeof view.cancelIdleCallback === "function") view.cancelIdleCallback(poolIdle);
      else view.clearTimeout(poolIdle);
    }
    doc.removeEventListener("animationend", onLinkEnd);
    doc.removeEventListener("animationcancel", onLinkEnd);
    view.removeEventListener("beforeprint", releaseAllLinks);
    view.removeEventListener("resize", onLinkLayout);
    view.removeEventListener("scrollend", sweepHeld);
    calm.removeEventListener?.("change", releaseAllLinks);
    linkSizes?.disconnect();
    for (const rec of linkRoots) {
      view.clearTimeout(rec.wait);
      forgetRoot(rec);
    }
    linkRoots.length = 0;
    rootIO.disconnect();
    nearIO.disconnect();
    gateIO.disconnect();
    linkLayer?.remove();
    mo.disconnect();
    io.disconnect();
    glassNear.disconnect();
    glassLive.disconnect();
    doc.removeEventListener("visibilitychange", onVisibility);
    view.removeEventListener("load", scheduleCover);
    if (coverIdle) {
      if (typeof view.cancelIdleCallback === "function") view.cancelIdleCallback(coverIdle);
      else view.clearTimeout(coverIdle);
    }
    root.removeAttribute("data-ring-hidden");
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
