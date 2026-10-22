let cancelPending: (() => void) | undefined;
let releaseReticle: (() => void) | undefined;

// The landing ring (styles-record-landing.css, handed in by the opener as
// `stylesheet`) stays on the destination for this long, or until focus moves
// on; the brief skip-style cue keeps its own 2.4s. Both go when focus leaves.
const LANDING_HOLD_MS = 6000;
// The reticle's tag (what found the record) leaves the words around the
// frame to the page after this long, the brackets keep the place. The live
// tier fades it in CSS (record-reticle-tag-out); the still tier here.
const TAG_HOLD_MS = 3200;
// While the route settles (its scroll, the plates fading in) the chrome is
// measured again every so often, so a plate that appears late still counts.
const SETTLE_MS = 1600;
const REMEASURE_MS = 240;

export type RecordArrivalOptions = {
  /** styles-record-landing.css's URL (the opener's import). */
  stylesheet?: string;
  /** The reticle tag's words: the query that found the record, or its title. */
  label?: string;
  /** The tag's HUD code: HIT for a search result, FILE for a library card. */
  code?: string;
};

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

const HEADING = "h1,h2,h3,h4,h5,h6,[role='heading']";

/** What the reticle frames. A heading or a small block is its own anchor; a
 * tall destination (a dossier's whole profile, a page section, an episode
 * plate) is marked at its first heading on screen, so the mark is where
 * the eye lands instead of an outline running off the viewport. "On screen"
 * is the band between the chrome at the top (`top`) and the plates docked
 * at the foot (`foot`): a heading behind the way-back plate or the guide's
 * plate is not where the eye lands, so the on-screen part is framed instead. */
function anchorOf(target: HTMLElement, top = 0, foot = 0): HTMLElement {
  const viewport = window.innerHeight;
  const rect = target.getBoundingClientRect();
  if (target.matches(HEADING) || rect.height <= viewport * 0.42) return target;
  for (const heading of target.querySelectorAll<HTMLElement>(HEADING)) {
    if (heading.closest('[aria-hidden="true"]')) continue;
    if (onScreen(heading.getBoundingClientRect(), top, foot)) return heading;
  }
  return target;
}

/** A heading's box shows between the top chrome and the foot plates. */
function onScreen(box: DOMRect, top: number, foot: number) {
  return (
    box.width >= 4 &&
    box.height >= 4 &&
    box.bottom > top &&
    box.top < window.innerHeight &&
    box.bottom <= window.innerHeight - foot
  );
}

type Inset = { left: number; top: number; right: number; bottom: number };

/** A heading's words, not its block: the box its text lines paint, as
 * insets from the element's own box (re-read whenever the element resizes). */
function textInset(anchor: HTMLElement, box: DOMRect): Inset {
  const none = { left: 0, top: 0, right: 0, bottom: 0 };
  if (
    !anchor.matches(HEADING) ||
    typeof document.createRange !== "function" ||
    typeof document.createTreeWalker !== "function"
  )
    return none;
  const range = document.createRange();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  // Text nodes only: a block-level child (a romanised name on its own line)
  // must not widen the frame to the column; its words still count.
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const line of range.getClientRects()) {
      // Skip collapsed boxes and visually hidden 1px labels.
      if (line.width < 2 || line.height < 2) continue;
      left = Math.min(left, line.left);
      top = Math.min(top, line.top);
      right = Math.max(right, line.right);
      bottom = Math.max(bottom, line.bottom);
    }
  }
  range.detach();
  if (!Number.isFinite(left)) return none;
  return {
    left: Math.max(0, left - box.left),
    top: Math.max(0, top - box.top),
    right: Math.max(0, box.right - right),
    bottom: Math.max(0, box.bottom - bottom),
  };
}

/** The bottom of the fixed/sticky chrome stacked at the top of the viewport
 * (the bar, then a page's own sticky tabs below it): the reticle is clipped
 * under it, so it never draws over the bar while the page scrolls. */
function chromeBottom() {
  if (typeof document.elementsFromPoint !== "function") return 0;
  const limit = window.innerHeight * 0.4;
  let bottom = 0;
  for (let probe = 0; probe < 3; probe++) {
    const y = bottom + 2;
    let found = 0;
    for (const element of document.elementsFromPoint(window.innerWidth / 2, y)) {
      for (let node: Element | null = element; node && node !== document.body; ) {
        const position = getComputedStyle(node).position;
        if (position === "fixed" || position === "sticky") {
          const box = node.getBoundingClientRect();
          if (box.top <= y && box.bottom > bottom) found = Math.max(found, box.bottom);
          break;
        }
        node = node.parentElement;
      }
      if (found) break;
    }
    if (!found || found > limit) break;
    bottom = found;
  }
  return Math.round(bottom);
}

/** The band held by the fixed/sticky plates docked along the foot of the
 * viewport (the way back to the index, the inquiry guide's plate, a page's
 * bottom bar), as its height from the bottom edge. A control floating higher
 * up (the Zeus button) is not docked there and does not count. */
function chromeFoot() {
  if (typeof document.elementFromPoint !== "function") return 0;
  const height = window.innerHeight;
  const width = document.documentElement.clientWidth || window.innerWidth;
  let top = height;
  for (const share of [0.04, 0.2, 0.4, 0.6, 0.8, 0.96]) {
    for (const rise of [8, 24, 40, 56]) {
      const y = height - rise;
      let node = document.elementFromPoint(width * share, y);
      for (; node && node !== document.body && node !== document.documentElement; ) {
        const position = getComputedStyle(node).position;
        if (position === "fixed" || position === "sticky") {
          const box = node.getBoundingClientRect();
          if (box.bottom >= height - 48 && box.top >= height * 0.5) top = Math.min(top, box.top);
          break;
        }
        node = node.parentElement;
      }
    }
  }
  return Math.round(Math.min(height - top, height * 0.4));
}

type Box = { left: number; top: number; right: number; bottom: number };

// The site's floating controls, known by name before any style is read.
const FIXED_HINT = ".zeus-button,.record-return-navigation,.inquiry-navigation";

function fixedAncestor(element: Element) {
  for (let node: Element | null = element; node && node !== document.body; ) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
    node = node.parentElement;
  }
  return false;
}

/** How much of the page's words (not the anchor's own, unless `own`: a place
 * inside the frame) lie under a box or within a few pixels of it, in square
 * pixels (Infinity under a fixed control): the tag's place is probed at a few
 * points, and the lines of the first element under each (past the anchor's
 * own letters) and of its parent (an inline atom's line belongs to its block)
 * are measured. */
function textUnder(box: Box, anchor: HTMLElement, own = false) {
  if (
    typeof document.elementsFromPoint !== "function" ||
    typeof document.createRange !== "function" ||
    typeof document.createTreeWalker !== "function"
  )
    return 0;
  const range = document.createRange();
  const counted = new Set<Node>();
  let area = 0;
  const measure = (root: Element) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let budget = 48;
    for (let node = walker.nextNode(); node && budget > 0; node = walker.nextNode()) {
      if (counted.has(node) || !node.textContent?.trim() || (!own && anchor.contains(node)))
        continue;
      counted.add(node);
      budget -= 1;
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width < 2 || line.height < 2) continue;
        const across = Math.min(line.right, box.right + 4) - Math.max(line.left, box.left - 4);
        const down = Math.min(line.bottom, box.bottom + 4) - Math.max(line.top, box.top - 4);
        if (across > 0 && down > 0) area += across * down;
      }
    }
  };
  const seen = new Set<Element>();
  try {
    for (const x of [0.08, 0.5, 0.92]) {
      for (const y of [0.25, 0.75]) {
        // The anchor's own letters can paint over the line above it (a large
        // heading's ascent): the first element under them is the one tested.
        const element = document
          .elementsFromPoint(
            box.left + (box.right - box.left) * x,
            box.top + (box.bottom - box.top) * y,
          )
          .find((hit) => own || !anchor.contains(hit));
        if (!element) continue;
        // A fixed control (the Zeus button, a plate) paints over the layer.
        if (element.closest(FIXED_HINT) || fixedAncestor(element)) return Infinity;
        for (const root of [element, element.parentElement]) {
          if (
            !root ||
            seen.has(root) ||
            root === document.body ||
            root === document.documentElement
          )
            continue;
          seen.add(root);
          measure(root);
        }
      }
    }
    return area;
  } finally {
    range.detach();
  }
}

/** The landing reticle: four corner brackets that close in on the anchor once
 * (a still frame under reduced motion or economy), a tag with the query that
 * found it, followed frame by frame while it is held (scroll, layout shifts),
 * gone with the ring. Decorative: focus already sits on the destination. */
function drawReticle(target: HTMLElement, live: boolean, options?: RecordArrivalOptions) {
  if (
    typeof document.createElement !== "function" ||
    typeof target.getBoundingClientRect !== "function" ||
    typeof window.addEventListener !== "function" ||
    typeof getComputedStyle !== "function" ||
    !document.body ||
    window.matchMedia("(forced-colors: active)").matches
  )
    return;
  let anchor = target;
  const layer = document.createElement("div");
  layer.className = "record-landing-layer";
  layer.dataset.mode = live ? "live" : "still";
  layer.setAttribute("aria-hidden", "true");
  // Unstyled (the sheet not yet applied), the layer is invisible and inert.
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;opacity:var(--record-landing-visible,0)";
  const reticle = document.createElement("div");
  reticle.className = "record-landing-reticle";
  for (const corner of ["tl", "tr", "bl", "br"]) {
    const bracket = document.createElement("i");
    bracket.dataset.corner = corner;
    reticle.append(bracket);
  }
  const scan = document.createElement("span");
  scan.className = "record-landing-scan";
  const tag = document.createElement("span");
  tag.className = "record-landing-tag";
  const code = document.createElement("b");
  code.textContent = options?.code || "HIT";
  const words = document.createElement("span");
  words.textContent = options?.label || "該当箇所";
  tag.append(code, words);
  reticle.append(scan, tag);
  layer.append(reticle);
  document.body.append(layer);
  target.dataset.recordReticle = "true";

  let inset: Inset = { left: 0, top: 0, right: 0, bottom: 0 };
  let size = "";
  let clip = -1;
  let foot = 0;
  let measured = 0;
  let side = "";
  // The tag's full width (the code and the words) and the code's alone.
  let tagWidth = 0;
  let codeWidth = 0;
  let chosenAt = 0;
  let chosenFor = "";
  let last = "";
  let frame = 0;
  let released = false;
  const started = Date.now();
  // The still tier's tag leaves with a plain fade (no movement).
  const fadeTag = live
    ? 0
    : window.setTimeout(() => {
        tag.dataset.faded = "true";
      }, TAG_HOLD_MS);
  const measureChrome = () => {
    measured = Date.now();
    clip = chromeBottom();
    foot = chromeFoot();
    layer.style.clipPath = clip || foot ? `inset(${clip}px 0 ${foot}px 0)` : "";
    // A heading a plate has since come over is let go; the search resumes.
    if (anchor !== target && !onScreen(anchor.getBoundingClientRect(), clip, foot)) {
      anchor = target;
      size = "";
    }
  };
  // The tag's places around the frame: on its top line beside the bracket
  // (the default), beside its top right, or on its bottom line; at `width`
  // (the whole tag, or its code alone).
  const tagPlaces = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    width = tagWidth,
  ) => {
    const { height } = tag.getBoundingClientRect();
    const half = height / 2;
    const at = (x: number, y: number): Box => ({
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
    });
    return [
      ["above", at(left + 20, top - half)],
      ["side", at(right + 12, top)],
      ["below", at(left + 20, bottom - half)],
      // The code alone may also sit just inside the top right bracket, where
      // a heading's shorter first line leaves the frame empty.
      ...(width < tagWidth ? ([["inside", at(right - 10 - width, top + 6)]] as const) : []),
    ] as const;
  };
  const roomFor = (box: Box) =>
    box.top >= clip &&
    box.bottom <= window.innerHeight - foot &&
    box.left >= 6 &&
    box.right <= (document.documentElement.clientWidth || window.innerWidth) - 6;
  // The first place with room under the chrome and none of the page's words
  // under it (the eyebrow over a heading, the line under it); then the code
  // alone (HIT, GUIDE, FILE) in the same places or inside the corner; with
  // no free place at all the tag stays out (on a phone the frame often has
  // words on every side): the brackets keep the place, the words are read.
  const chooseTag = (box: Box) => {
    const passes = [
      [tagPlaces(box.left, box.top, box.right, box.bottom), false],
      [tagPlaces(box.left, box.top, box.right, box.bottom, codeWidth), true],
    ] as const;
    for (const [places, compact] of passes)
      for (const [name, at] of places)
        if (roomFor(at) && textUnder(at, anchor, name === "inside") === 0)
          return { name, compact } as const;
    return { name: "none", compact: true } as const;
  };
  // The tag's widths, read with the words shown (its compact form hides them).
  const measureTag = () => {
    const compact = tag.hasAttribute("data-compact");
    if (compact) tag.removeAttribute("data-compact");
    tagWidth = tag.getBoundingClientRect().width;
    // The code, the tag's 2px inset each side and its 1px border.
    codeWidth = code.getBoundingClientRect().width + 6;
    if (compact) tag.setAttribute("data-compact", "");
  };
  const place = () => {
    frame = 0;
    if (released) return;
    if (!anchor.isConnected || !target.isConnected) {
      release();
      return;
    }
    if (Date.now() - started < SETTLE_MS && Date.now() - measured > REMEASURE_MS) measureChrome();
    // A tall destination whose heading was not yet on screen (still sliding
    // in, below the fold or behind a foot plate while the page settled)
    // keeps looking for it.
    if (anchor === target && !target.matches(HEADING)) {
      const heading = anchorOf(target, clip, foot);
      if (heading !== target) {
        anchor = heading;
        size = "";
      }
    }
    const box = anchor.getBoundingClientRect();
    // No heading at all: frame the part of the destination on screen.
    const whole = anchor === target && box.height > window.innerHeight * 0.42;
    const shape = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (shape !== size) {
      size = shape;
      side = "";
      inset = textInset(anchor, box);
      measureTag();
    }
    const pad = window.innerWidth < 600 ? 7 : 10;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const left = Math.max(6, box.left + inset.left - pad);
    const right = Math.min(width - 6, box.right - inset.right + pad);
    const bottom = whole
      ? Math.min(box.bottom, window.innerHeight - foot - 14)
      : box.bottom - inset.bottom + pad;
    // A heading at the very top of a page with no bar over it (the Form
    // Archive's switcher) keeps its top brackets on screen, while most of it
    // shows (a heading scrolled away leaves with its frame).
    const edge = clip + 4;
    const rise = box.top + inset.top - pad;
    const top = whole
      ? Math.max(box.top, clip + 14)
      : rise < edge && bottom - edge >= 32
        ? edge
        : rise;
    const next = `${Math.round(left)},${Math.round(top)},${Math.max(24, Math.round(right - left))},${Math.max(24, Math.round(bottom - top))}`;
    // The tag's place is chosen again, at most every REMEASURE_MS, when the
    // frame has moved since (the route still settling under it), and a tag
    // left out is looked for again while it would still show.
    const since = Date.now() - started;
    const retry =
      Date.now() - chosenAt > REMEASURE_MS &&
      ((side === "none" && since < TAG_HOLD_MS) || (since < SETTLE_MS && next !== chosenFor));
    if (next !== last || retry) {
      last = next;
      const [x, y, w, h] = next.split(",");
      reticle.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      reticle.style.width = `${w}px`;
      reticle.style.height = `${h}px`;
      // A frame round the whole screenful keeps only its brackets and line.
      reticle.toggleAttribute("data-whole", whole);
      // The page is probed for the tag's place only when the frame changes
      // shape or its place runs out of room (under the bar, past a plate).
      const compact = tag.hasAttribute("data-compact");
      const places = tagPlaces(left, top, right, bottom, compact ? codeWidth : tagWidth);
      const current = places.find(([name]) => name === side);
      if (retry || (side !== "none" && (!current || !roomFor(current[1])))) {
        chosenAt = Date.now();
        chosenFor = next;
        const chosen = chooseTag({ left, top, right, bottom });
        side = chosen.name;
        tag.toggleAttribute("data-compact", chosen.compact);
      }
      reticle.dataset.tag = side;
    }
    frame = window.requestAnimationFrame(place);
  };
  const onResize = () => measureChrome();
  const release = () => {
    if (released) return;
    released = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(fadeTag);
    window.removeEventListener("resize", onResize);
    target.removeAttribute("data-record-reticle");
    if (releaseReticle === release) releaseReticle = undefined;
    if (live && typeof layer.animate === "function") {
      const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 320,
        easing: "ease-out",
        fill: "forwards",
      });
      fade.finished.then(
        () => layer.remove(),
        () => layer.remove(),
      );
    } else layer.remove();
  };
  window.addEventListener("resize", onResize, { passive: true });
  measureChrome();
  place();
  releaseReticle = release;
  return release;
}

/** A search/library selection is an explicit reading destination. Wait for
 * its route and cover to settle, without touching scroll/history or dialogs. */
export function watchRecordArrival(path: string, hash?: string, options?: RecordArrivalOptions) {
  cancelPending?.();
  releaseReticle?.();
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
    // Drawn before stop(): the observer is disconnected in this same turn,
    // so the layer's own insertion never schedules another arrival.
    const release = drawReticle(target, marked, options);
    const hold = window.setTimeout(() => {
      target.removeAttribute("data-record-landing");
      release?.();
    }, LANDING_HOLD_MS);
    target.addEventListener(
      "blur",
      () => {
        window.clearTimeout(timer);
        window.clearTimeout(hold);
        release?.();
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
