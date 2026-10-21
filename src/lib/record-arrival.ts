let cancelPending: (() => void) | undefined;
let releaseReticle: (() => void) | undefined;

// The landing ring (styles-record-landing.css, handed in by the opener as
// `stylesheet`) stays on the destination for this long, or until focus moves
// on; the brief skip-style cue keeps its own 2.4s. Both go when focus leaves.
const LANDING_HOLD_MS = 6000;

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
 * the eye lands instead of an outline running off the viewport. */
function anchorOf(target: HTMLElement): HTMLElement {
  const viewport = window.innerHeight;
  const rect = target.getBoundingClientRect();
  if (target.matches(HEADING) || rect.height <= viewport * 0.42) return target;
  for (const heading of target.querySelectorAll<HTMLElement>(HEADING)) {
    if (heading.closest('[aria-hidden="true"]')) continue;
    const box = heading.getBoundingClientRect();
    if (box.width < 4 || box.height < 4 || box.bottom <= 0 || box.top >= viewport) continue;
    return heading;
  }
  return target;
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
  let anchor = anchorOf(target);
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
  let last = "";
  let frame = 0;
  let released = false;
  const measureChrome = () => {
    clip = chromeBottom();
    layer.style.clipPath = clip ? `inset(${clip}px 0 0 0)` : "";
  };
  const place = () => {
    frame = 0;
    if (released) return;
    if (!anchor.isConnected || !target.isConnected) {
      release();
      return;
    }
    // A tall destination whose heading was not yet on screen (still sliding
    // in, or below the fold while the page settled) keeps looking for it.
    if (anchor === target && !target.matches(HEADING)) {
      const heading = anchorOf(target);
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
      inset = textInset(anchor, box);
    }
    const pad = window.innerWidth < 600 ? 7 : 10;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const left = Math.max(6, box.left + inset.left - pad);
    const right = Math.min(width - 6, box.right - inset.right + pad);
    const top = whole ? Math.max(box.top, clip + 14) : box.top + inset.top - pad;
    const bottom = whole
      ? Math.min(box.bottom, window.innerHeight - 14)
      : box.bottom - inset.bottom + pad;
    const next = `${Math.round(left)},${Math.round(top)},${Math.max(24, Math.round(right - left))},${Math.max(24, Math.round(bottom - top))}`;
    if (next !== last) {
      last = next;
      const [x, y, w, h] = next.split(",");
      reticle.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      reticle.style.width = `${w}px`;
      reticle.style.height = `${h}px`;
      // The tag rides above the frame, or below it when the bar is in the way.
      reticle.dataset.tag = top - 14 < clip ? "below" : "above";
    }
    frame = window.requestAnimationFrame(place);
  };
  const onResize = () => measureChrome();
  const release = () => {
    if (released) return;
    released = true;
    window.cancelAnimationFrame(frame);
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
