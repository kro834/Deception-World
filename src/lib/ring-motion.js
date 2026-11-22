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
//      each part's delay. The lift, the recoil, the thread's stretch and the
//      pulley's turn are CSS animations on those delays (the sheet), so no
//      frame loop runs. Anything that already owns its arrival or its
//      scroll choreography (the suit-up stages, scroll timelines, reveal
//      classes, .ring-enter, sticky and fixed boxes) is left alone.
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
// staging (the contract test's list), pinned scroll scenes, and everything
// that already owns its own arrival.
const LINK_FORBID =
  /suitup|suit-up|henshin|assembly|entry|ignition|nanite|wire|burst|reactor|vortex|swarm|flame|engine|canvas|call|stage|sticky|pinned|scene|reveal|ring-(?:enter|stagger|expand|bounce|glass|orbit|arc|divider|halo)/;
// Moved as one piece, never taken apart: measured rails, sliders, control
// rows. Their inner geometry is read by their own engines.
const LINK_WHOLE =
  /rail|liquid|slider|switch|tabs?(?![a-z])|pills?(?![a-z])|console|dial|carousel|track|controls?(?![a-z])|toolbar|actions|meter/;
const LINK_SKIP_TAGS = new Set(["script", "style", "template", "dialog", "canvas", "iframe", "br", "hr", "noscript", "link", "meta", "wbr"]);
const LINK_ATOMS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "figure", "img", "picture", "video", "svg", "a", "button",
  "blockquote", "table", "details", "form", "fieldset", "dl", "pre", "nav", "li", "label", "input",
  "select", "textarea", "summary", "span", "time", "output",
]);
const LINK_CONTROLS = new Set(["a", "button", "input", "select", "label", "span"]);
const LINK_HEADS = new Set(["h1", "h2", "h3", "h4"]);
const LINK_MAX_PARTS = 12;
const LINK_MAX_DEPTH = 6;
/** How far a part hangs below its place, px. The sheet's --ring-link-hang values. */
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
const LINK_THREAD_BASE = 100;
const LINK_GATE = 0.92;

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
      for (const entry of entries) entry.target.toggleAttribute("data-ring-live", entry.isIntersecting);
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

  const onVisibility = () => root.toggleAttribute("data-ring-hidden", doc.visibilityState === "hidden");

  // The route cover's glass band: fetched when the page is idle, so the first
  // covered route change already has it and the first paint never waits for it.
  let coverIdle = 0;
  const fetchCover = () => {
    coverIdle = 0;
    const saver = /** @type {{ connection?: { saveData?: boolean } }} */ (view.navigator).connection;
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
    if (!frame) frame = view.requestAnimationFrame(tick);
  };


  // ---- Linked sections: the pulley-and-thread chain -----------------------
  // A chain is a heading and the parts that follow it, at most about one
  // viewport tall. Only chains that are near and still below the fold are
  // armed (held, measured, threaded). Everything else is untouched.
  /**
   * @typedef {{ el: HTMLElement, chain: LinkChain, i: number, figure: boolean, head: boolean,
   *   state: 0 | 1 | 2, start: number, top: number, bottom: number, left: number, right: number }} LinkPart
   * @typedef {{ parts: LinkPart[], links: (HTMLElement | null)[], near: boolean, armed: boolean,
   *   lastStart: number, top: number, body: boolean }} LinkChain
   * @typedef {{ el: Element, chains: LinkChain[], done: boolean, dirty: boolean, at: number }} LinkRoot
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
      const cs = view.getComputedStyle(child);
      const display = cs.display;
      if (display === "none") continue;
      if (display === "contents") {
        collectParts(child, depth, out, vh, vw, sy);
        continue;
      }
      // An inline box takes no transform; an out-of-flow or pinned box, a box
      // that is already animated, moved, dimmed or scrolls is not ours.
      if (display === "inline") continue;
      if (cs.position !== "static" && cs.position !== "relative") continue;
      if (
        cs.animationName !== "none" ||
        cs.translate !== "none" ||
        cs.visibility === "hidden" ||
        parseFloat(cs.opacity) < 0.99 ||
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll"
      )
        continue;
      const rect = child.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const card =
        cs.backgroundImage !== "none" ||
        alphaOf(cs.backgroundColor) > 0.02 ||
        (cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0) ||
        cs.boxShadow !== "none";
      const whole =
        card ||
        LINK_ATOMS.has(tag) ||
        depth >= LINK_MAX_DEPTH ||
        child.childElementCount === 0 ||
        cs.overflowX !== "visible" ||
        child.hasAttribute("role") ||
        (cls !== "" && LINK_WHOLE.test(cls)) ||
        ownText(child) ||
        controlsOnly(child);
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
        state: 0,
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
    if (part.state === 1) {
      held.delete(part);
      gateIO.unobserve(part.el);
    }
    if (part.state !== 0) {
      part.state = 0;
      part.el.removeAttribute(LINK);
      part.el.style.removeProperty("--ring-link-d");
      part.el.style.removeProperty("--ring-link-f");
    }
  };

  /** @param {LinkChain} chain */
  const dropThreads = (chain) => {
    for (let i = 0; i < chain.links.length; i += 1) {
      chain.links[i]?.remove();
      chain.links[i] = null;
    }
  };

  /** Back to the page's own state: nothing held, no threads. @param {LinkChain} chain */
  const disarm = (chain) => {
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
      // Stacked: the thread runs down the left edge of the two boxes, past a
      // pulley in the gap between them: in the gutter where there is room,
      // astride the edge where there is not (a phone's 16px gutter).
      const edge = Math.max(a.left, b.left);
      const x = edge >= 2 * r + 8 ? edge - 6 : edge + 6;
      cx = x - r;
      cy = (a.bottom + b.top) / 2;
      // The pulling end is tied up the side of the part above (at most 140px
      // up), so the taut thread is long enough to be read as a thread.
      if (x >= a.left - 16 && x <= a.right + 16) l1 = a.bottom - Math.min(140, a.bottom - a.top) - cy;
      l2 = b.top - cy;
    } else {
      // Side by side: a pulley over the gap at the top edge, one thread end
      // down to each box.
      const gap = b.left - a.right;
      if (gap < 4 || gap > 96) return null;
      cx = a.right + gap / 2;
      cy = Math.min(a.top, b.top) - 3;
      x1 = -r;
      l1 = a.top - cy;
      l2 = b.top - cy;
    }
    if (cx - r < 2 || cx + r > root.clientWidth - 2 || cy < r) return null;
    if (!linkLayer || !linkLayer.isConnected) {
      linkLayer = doc.createElement("div");
      linkLayer.className = "ring-links";
      linkLayer.setAttribute("aria-hidden", "true");
      (doc.body ?? root).appendChild(linkLayer);
    }
    const node = doc.createElement("i");
    node.className = "ring-link";
    node.style.left = `${cx.toFixed(1)}px`;
    node.style.top = `${cy.toFixed(1)}px`;
    const hangB = b.figure ? RING_LINK_HANG.figure : RING_LINK_HANG.text;
    if (l1 === l1) {
      const hangA = a.figure ? RING_LINK_HANG.figure : RING_LINK_HANG.text;
      const pull = doc.createElement("i");
      pull.className = "ring-thread ring-thread-pull";
      pull.style.left = `${x1}px`;
      pull.style.setProperty("--ring-thread-to", (l1 / LINK_THREAD_BASE).toFixed(4));
      pull.style.setProperty("--ring-thread-from", ((l1 + hangA) / LINK_THREAD_BASE).toFixed(4));
      node.appendChild(pull);
    }
    const lift = doc.createElement("i");
    lift.className = "ring-thread";
    lift.style.left = `${x2}px`;
    lift.style.setProperty("--ring-thread-to", (l2 / LINK_THREAD_BASE).toFixed(4));
    lift.style.setProperty("--ring-thread-from", ((l2 + hangB) / LINK_THREAD_BASE).toFixed(4));
    node.appendChild(lift);
    const pulley = doc.createElement("i");
    pulley.className = "ring-pulley";
    // The wheel turns by the thread that runs over it: travel / radius.
    pulley.style.setProperty("--ring-pulley-from", `${(-hangB / r).toFixed(2)}rad`);
    node.appendChild(pulley);
    linkLayer.appendChild(node);
    return node;
  };

  /**
   * Hold the parts of a chain that are still below the fold and thread them.
   * Runs in an observer callback, never in a frame: it measures each part once.
   * @param {LinkChain} chain
   */
  const arm = (chain) => {
    const line = view.innerHeight * LINK_GATE;
    const sy = root.scrollTop;
    const parts = chain.parts;
    let any = false;
    for (const part of parts) {
      const rect = part.el.getBoundingClientRect();
      part.top = rect.top + sy;
      part.bottom = rect.bottom + sy;
      part.left = rect.left;
      part.right = rect.right;
      part.start = 0;
      part.state = rect.height > 0 && rect.top > line ? 1 : 0;
    }
    for (const part of parts) {
      if (part.state !== 1) continue;
      part.el.setAttribute(LINK, "hold");
      held.add(part);
      gateIO.observe(part.el);
      any = true;
    }
    if (any && bounces()) {
      for (let i = 1; i < parts.length; i += 1) {
        if (parts[i].state === 1) chain.links[i] = makeThread(parts[i - 1], parts[i]);
      }
    }
    chain.armed = any;
    chain.lastStart = 0;
    if (any && !linkSafety) linkSafety = view.setTimeout(sweepHeld, SAFETY_MS);
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
    const delay = Math.round(start - now);
    const style = part.el.style;
    style.setProperty("--ring-link-d", `${delay}ms`);
    // The part shows on its hook one step early, as its thread goes taut.
    style.setProperty("--ring-link-f", `${Math.max(0, delay - RING_LINK_STEP_MS)}ms`);
    part.el.setAttribute(LINK, part.figure ? "figure" : "text");
    const node = chain.links[part.i];
    if (!node) return;
    const puller = chain.parts[part.i - 1];
    node.style.setProperty("--ring-link-d", `${delay}ms`);
    node.style.setProperty("--ring-link-f", `${delay - RING_LINK_STEP_MS}ms`);
    // The pulling end follows the part above, wherever that is in its own lift.
    node.style.setProperty("--ring-link-a", `${puller.start ? Math.round(puller.start - now) : -9999}ms`);
    node.setAttribute("data-ring-run", "");
  };

  /** A part has landed: hand it back to the page with nothing left on it. @param {Event} event */
  const onLinkEnd = (event) => {
    const part = partOf.get(/** @type {Element} */ (event.target));
    if (!part || part.state !== 2) return;
    const name = /** @type {AnimationEvent} */ (event).animationName;
    if (event.type === "animationcancel" || name === "ring-link-lift" || (name === "ring-link-seen" && !bounces()))
      clearPart(part);
  };

  // A stalled observer, or a jump past a held part, must never leave it invisible.
  function sweepHeld() {
    linkSafety = 0;
    const bottom = view.innerHeight;
    const now = view.performance.now();
    for (const part of [...held]) {
      if (!part.el.isConnected) {
        held.delete(part);
        continue;
      }
      if (part.el.getBoundingClientRect().top < bottom * LINK_GATE) release(part, now);
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

  // A chain is armed when its heading comes within 30 % of a viewport below
  // the fold, and put back when it leaves downwards: scrolling up never shows
  // a held part, and scrolling down again replays the mechanism.
  const nearIO = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const chain = chainOf.get(entry.target);
        if (!chain) continue;
        if (entry.isIntersecting) {
          if (chain.near) continue;
          chain.near = true;
          if (!chain.armed && entry.boundingClientRect.top > view.innerHeight * LINK_GATE) arm(chain);
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
        chain = { parts: [], links: [], near: false, armed: false, lastStart: 0, top: part.top, body: false };
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
  };

  const rootIO = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const rec = rootOf.get(entry.target);
        rootIO.unobserve(entry.target);
        if (rec && !rec.done) detectRoot(rec);
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
      if (!rec.done || !rec.dirty) continue;
      let busy = false;
      for (const chain of rec.chains) for (const part of chain.parts) if (part.state === 2) busy = true;
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
      const rec = { el, chains: [], done: false, dirty: false, at: 0 };
      rootOf.set(el, rec);
      linkRoots.push(rec);
      rootIO.observe(el);
    }
  };

  function queueLinkScan() {
    if (!linkScan) linkScan = view.setTimeout(scanLinks, 320);
  }

  /** The layout moved under the threads: resting ones go, waiting ones are measured again. */
  const onLinkLayout = () => {
    const line = view.innerHeight * LINK_GATE;
    for (const rec of linkRoots) {
      rec.dirty = rec.done;
      for (const chain of rec.chains) {
        let moving = false;
        for (const part of chain.parts) if (part.state === 2) moving = true;
        if (moving) continue;
        if (!chain.armed) {
          dropThreads(chain);
          continue;
        }
        disarm(chain);
        if (chain.near && chain.parts[0].el.getBoundingClientRect().top > line) arm(chain);
      }
    }
    queueLinkScan();
  };

  /** Print, reduced motion switched on: everything back at once. */
  const releaseAllLinks = () => {
    for (const rec of linkRoots) for (const chain of rec.chains) disarm(chain);
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
        queueLinkScan();
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
  calm.addEventListener?.("change", releaseAllLinks);
  if (doc.body) linkSizes?.observe(doc.body);
  scanLinks();

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
    doc.removeEventListener("animationend", onLinkEnd);
    doc.removeEventListener("animationcancel", onLinkEnd);
    view.removeEventListener("beforeprint", releaseAllLinks);
    view.removeEventListener("resize", onLinkLayout);
    calm.removeEventListener?.("change", releaseAllLinks);
    linkSizes?.disconnect();
    for (const rec of linkRoots) forgetRoot(rec);
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
