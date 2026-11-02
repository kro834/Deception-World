// Liquid glass: what lies behind each control (owner, 2026-11-02:
// 「リキッドグラスの外観を…完全に模倣する様に」). Started by
// liquid-glass-defs.tsx only while html[data-button-style="liquid"] is set,
// and undone completely when the option goes off.
//
// Liquid Glass adapts to its backdrop: small glass "flip[s] from light to
// dark based on the background", its glyphs flip with it, and its shadow
// grows "when it is over text" and fades over "a solid light background"
// (WWDC25, "Meet Liquid Glass"). Apple reads the pixels every frame; the
// web cannot, so this is a cheap estimate per control:
// - the stack under three points of the control (elementsFromPoint): the
//   painted background colours composited front to back, and the first
//   image under the control sampled once into a 1×1 canvas (same-origin;
//   a tainted or unloaded image counts as busy and mid-dark);
// - read when a control first comes into view, or is resized, and, for a
//   control that stays put while the page scrolls under it (in a fixed or
//   sticky box), once each time a scroll comes to rest. Never per frame.
//   "Into view" is one shared IntersectionObserver whose root reaches
//   NEAR_MARGIN past the screen (owner, 2026-11-02: a control below the fold
//   was never read, so it was never busy or light over art): a control that
//   nears the screen is read as soon as it is on it, by a timer armed from
//   the scroll (the handler reads nothing), and again each time it comes
//   back (the page may have changed under it meanwhile);
// - read again when the art under it may have changed: a picture added,
//   removed or loaded (the /world poster switching), for the controls on
//   screen that sit over art (busy) only, once the change has settled.
// The reading waits for an idle moment (requestIdleCallback; WebKit: a task
// right after the next frame), a few controls at a time, all read before
// any is written: the page's style is clean then, so a read forces no
// extra style pass, and a finger waiting for the thread goes first.
// The result is two attributes the sheet reads: data-lg-tone="light" (the
// backdrop is light: the glass flips light, its label dark) and
// data-lg-busy (an image or video behind: a deeper veil and shadow).

import { LIQUID_GLASS_TARGETS } from "./liquid-glass";

export const TONE_ATTRIBUTE = "data-lg-tone";
export const BUSY_ATTRIBUTE = "data-lg-busy";
/** Above this relative luminance the glass turns light; below the second, dark again. */
export const TONE_LIGHT_ABOVE = 0.56;
export const TONE_DARK_BELOW = 0.42;
/** The page's own ground when nothing painted is found (the site is dark). */
const GROUND = { r: 8, g: 10, b: 16 };
/** How long a scroll must be still before the fixed controls look again. */
export const SCROLL_REST_MS = 160;
/** While a scroll runs, how often the controls nearing the screen look. */
export const SCROLL_PEEK_MS = 120;
/** How far past the screen a control counts as coming into view. */
export const NEAR_MARGIN = "40% 0px";
/** How long the art must be still before the controls over it look again. */
export const ART_SETTLE_MS = 320;
/** Estimates per frame. */
const PER_FRAME = 6;
/** The longest an estimate waits for an idle moment. */
export const IDLE_TIMEOUT_MS = 400;

const TARGETS = LIQUID_GLASS_TARGETS.join(", ");

/** sRGB channel (0..255) to linear light. */
function linear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance(r: number, g: number, b: number) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The first rgb()/rgba() colour in a computed value, with its alpha. */
export function parseRgb(value: string) {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value);
  if (!m) return null;
  let a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (m[4]?.endsWith("%")) a /= 100;
  return { r: +m[1], g: +m[2], b: +m[3], a: Number.isFinite(a) ? a : 1 };
}

/**
 * The tone with hysteresis: a control near the threshold does not flicker
 * between light and dark as the backdrop shifts a little.
 */
export function toneFor(lum: number, was: "light" | "dark") {
  if (was === "light") return lum < TONE_DARK_BELOW ? "dark" : "light";
  return lum > TONE_LIGHT_ABOVE ? "light" : "dark";
}

interface Entry {
  pinned: boolean;
  tone: "light" | "dark";
  /* Within the observer's reach (on screen or about to be). */
  near: boolean;
}

interface Sample {
  r: number;
  g: number;
  b: number;
  busy: boolean;
}

/**
 * Starts the estimate. Returns a disposer that removes every attribute and
 * listener it added.
 */
export function watchLiquidTone(doc: Document = document) {
  const view = doc.defaultView;
  if (!view || typeof doc.elementsFromPoint !== "function" || !doc.body) return () => {};

  const tracked = new Map<HTMLElement, Entry>();
  const queue = new Set<HTMLElement>();
  /* Near the screen (the observer's margin) and not yet read since it came near. */
  const nearing = new Set<HTMLElement>();
  /* The drain's turn: an idle callback, or (no requestIdleCallback: WebKit)
     a task just after the next frame. Either way the page's style is
     already clean from its own render, so the reads cost no extra pass,
     and input waiting for the thread goes first. */
  let frame = 0;
  let idleId = 0;
  let post = 0;
  let startId = 0;
  const idle = typeof view.requestIdleCallback === "function";
  let scanTimer = 0;
  let restTimer = 0;
  let peekTimer = 0;
  let artTimer = 0;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  /* An image's colour at a viewport point, sampled once (null: unreadable). */
  function imageAt(img: HTMLImageElement, x: number, y: number) {
    if (!img.complete || !img.naturalWidth) return null;
    const box = img.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // object-fit: cover (the site's art) maps the box onto the middle of the image.
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const sx = (x - box.left - (box.width - img.naturalWidth * scale) / 2) / scale;
    const sy = (y - box.top - (box.height - img.naturalHeight * scale) / 2) / scale;
    try {
      canvas ??= doc.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      ctx ??= canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      // A small region around the point, averaged into one pixel.
      const span = Math.max(4, 24 / scale);
      ctx.clearRect(0, 0, 1, 1);
      ctx.drawImage(img, sx - span / 2, sy - span / 2, span, span, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    } catch {
      return null;
    }
  }

  /* Art hit testing skips (pointer-events: none, as /world's poster under
     its buttons is): a stack node's own media child over the point. */
  function mediaUnder(node: Element, el: HTMLElement, x: number, y: number) {
    for (const media of node.querySelectorAll(
      ":scope > :is(img, video, canvas), :scope > picture > img",
    )) {
      if (media.contains(el)) continue;
      const box = media.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      if (view!.getComputedStyle(media).pointerEvents === "none") return media;
    }
    return null;
  }

  /* The colour behind one point of the control, front to back. */
  function sampleAt(el: HTMLElement, x: number, y: number): Sample {
    let r = 0;
    let g = 0;
    let b = 0;
    let left = 1;
    let busy = false;
    for (const node of doc.elementsFromPoint(x, y)) {
      if (node === el || el.contains(node) || node.closest(".lg-hold")) continue;
      const hit = mediaUnder(node, el, x, y) ?? node;
      if (hit instanceof view!.HTMLImageElement) {
        const c = imageAt(hit, x, y) ?? { r: 40, g: 44, b: 54 };
        busy = true;
        r += c.r * left;
        g += c.g * left;
        b += c.b * left;
        left = 0;
        break;
      }
      if (hit instanceof view!.HTMLVideoElement || hit instanceof view!.HTMLCanvasElement) {
        busy = true;
        r += 40 * left;
        g += 44 * left;
        b += 54 * left;
        left = 0;
        break;
      }
      const style = view!.getComputedStyle(node);
      if (/url\(/.test(style.backgroundImage)) busy = true;
      const fill = parseRgb(style.backgroundColor);
      const a = fill ? fill.a * (Number(style.opacity) || 1) : 0;
      if (fill && a > 0.02) {
        r += fill.r * a * left;
        g += fill.g * a * left;
        b += fill.b * a * left;
        left *= 1 - a;
        if (left < 0.04) break;
      }
    }
    r += GROUND.r * left;
    g += GROUND.g * left;
    b += GROUND.b * left;
    return { r, g, b, busy };
  }

  /* Read: the backdrop under one control (null: nothing to read now). */
  function estimate(el: HTMLElement) {
    const entry = tracked.get(el);
    if (!entry || !el.isConnected) return null;
    const box = el.getBoundingClientRect();
    // No box (collapsed, hidden): nothing to read until it resizes.
    if (!box.width || !box.height) {
      nearing.delete(el);
      return null;
    }
    // Off screen (only near it): no pixels to read yet; the scroll's timer
    // brings it back once it is on.
    if (box.bottom < 0 || box.top > view!.innerHeight || box.right < 0 || box.left > view!.innerWidth)
      return null;
    nearing.delete(el);
    const y = box.top + box.height / 2;
    const points = [0.2, 0.5, 0.8].map((f) => sampleAt(el, box.left + box.width * f, y));
    const n = points.length;
    const avg = points.reduce(
      (s, p) => ({ r: s.r + p.r / n, g: s.g + p.g / n, b: s.b + p.b / n }),
      { r: 0, g: 0, b: 0 },
    );
    entry.tone = toneFor(luminance(avg.r, avg.g, avg.b), entry.tone);
    return { el, tone: entry.tone, busy: points.some((p) => p.busy) };
  }

  /* A frame's few controls: every read first, then every write, so one
     style pass serves them all (a write before the next read would force
     a whole-page style pass per control). */
  function drain() {
    frame = 0;
    idleId = 0;
    post = 0;
    const read = [];
    for (const el of queue) {
      queue.delete(el);
      const result = estimate(el);
      if (result) read.push(result);
      if (read.length >= PER_FRAME) break;
    }
    for (const { el, tone, busy } of read) {
      if (tone === "light") {
        if (el.getAttribute(TONE_ATTRIBUTE) !== "light") el.setAttribute(TONE_ATTRIBUTE, "light");
      } else if (el.hasAttribute(TONE_ATTRIBUTE)) el.removeAttribute(TONE_ATTRIBUTE);
      if (el.hasAttribute(BUSY_ATTRIBUTE) !== busy) el.toggleAttribute(BUSY_ATTRIBUTE, busy);
    }
    if (queue.size) schedule();
  }

  function schedule() {
    if (frame || idleId || post) return;
    if (idle) idleId = view!.requestIdleCallback(drain, { timeout: IDLE_TIMEOUT_MS });
    else
      frame = view!.requestAnimationFrame(() => {
        frame = 0;
        post = view!.setTimeout(drain, 0);
      });
  }

  function enqueue(el: HTMLElement) {
    queue.add(el);
    schedule();
  }

  /* Read it now if it is on screen, else as soon as the scroll brings it on. */
  function look(el: HTMLElement) {
    nearing.add(el);
    enqueue(el);
  }

  /* Whether the control stays put while the page scrolls (a fixed or sticky box). */
  function pinnedOf(el: HTMLElement) {
    for (let node: HTMLElement | null = el; node && node !== doc.body; node = node.parentElement) {
      const p = view!.getComputedStyle(node).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  }

  const resize =
    typeof view.ResizeObserver === "function"
      ? new view.ResizeObserver((entries) => {
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            // Far off screen there is nothing to read: the observer below
            // brings it in when it nears.
            if (!near || tracked.get(el)?.near) look(el);
          }
        })
      : null;

  // One observer for every control: a control nearing the screen (or back
  // after leaving it) is read once it is on it. The entries carry their own
  // geometry; nothing is measured here.
  const near =
    typeof view.IntersectionObserver === "function"
      ? new view.IntersectionObserver(
          (entries) => {
            for (const io of entries) {
              const el = io.target as HTMLElement;
              const entry = tracked.get(el);
              if (!entry) continue;
              entry.near = io.isIntersecting;
              if (!io.isIntersecting) {
                nearing.delete(el);
                continue;
              }
              look(el);
            }
          },
          { rootMargin: NEAR_MARGIN },
        )
      : null;

  function detach(el: HTMLElement) {
    resize?.unobserve(el);
    near?.unobserve(el);
    el.removeAttribute(TONE_ATTRIBUTE);
    el.removeAttribute(BUSY_ATTRIBUTE);
    tracked.delete(el);
    queue.delete(el);
    nearing.delete(el);
  }

  function scan() {
    scanTimer = 0;
    for (const el of [...tracked.keys()]) if (!el.isConnected) detach(el);
    for (const el of doc.querySelectorAll<HTMLElement>(TARGETS)) {
      if (tracked.has(el)) continue;
      // Without the observer (an old engine) every control is "near" and
      // read as before: on first sight, on resize and after a scroll.
      tracked.set(el, { pinned: pinnedOf(el), tone: "dark", near: !near });
      resize?.observe(el);
      if (near) near.observe(el);
      else look(el);
    }
  }

  // The art under the controls may have changed (a picture added, removed
  // or swapped: the /world poster switching every few seconds; one loaded):
  // once it is still, the controls on screen over art look again. Only
  // those: a plain backdrop does not change with a picture far from it.
  const artChanged = () => {
    if (artTimer) view.clearTimeout(artTimer);
    artTimer = view.setTimeout(recheckArt, ART_SETTLE_MS);
  };
  const recheckArt = () => {
    artTimer = 0;
    for (const [el, entry] of tracked)
      if (entry.near && el.hasAttribute(BUSY_ATTRIBUTE)) look(el);
  };
  const MEDIA = /^(img|picture|video|canvas|source)$/;
  const isMedia = (node: Node) =>
    node.nodeType === 1 &&
    (MEDIA.test((node as Element).localName) ||
      !!(node as Element).querySelector?.("img, picture, video, canvas"));

  const tree = new view.MutationObserver((records) => {
    let added = false;
    let art = false;
    for (const r of records) {
      if (r.type === "attributes") {
        art = true;
        continue;
      }
      if (!r.addedNodes.length && !r.removedNodes.length) continue;
      added = true;
      if (!art) for (const node of [...r.addedNodes, ...r.removedNodes]) if (isMedia(node)) art = true;
    }
    if (added && !scanTimer) scanTimer = view.setTimeout(scan, 400);
    if (art) artChanged();
  });
  // A picture's own source swapped in place counts as new art too.
  tree.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset"],
  });

  // The page moved under the pinned controls: look again once it is still.
  // While it moves, the controls nearing the screen look as they come on
  // (a timer armed here: the handler itself reads nothing).
  const rest = () => {
    restTimer = 0;
    for (const [el, entry] of tracked) if (entry.pinned && entry.near) enqueue(el);
    for (const el of nearing) enqueue(el);
  };
  const peek = () => {
    peekTimer = 0;
    for (const el of nearing) enqueue(el);
  };
  const scrolled = () => {
    if (restTimer) view.clearTimeout(restTimer);
    restTimer = view.setTimeout(rest, SCROLL_REST_MS);
    if (nearing.size && !peekTimer) peekTimer = view.setTimeout(peek, SCROLL_PEEK_MS);
  };
  // Images load late (the art under the bar, the poster): look again then too.
  const loaded = (event: Event) => {
    if (!(event.target instanceof view.HTMLImageElement)) return;
    scrolled();
    artChanged();
  };
  const options = { capture: true, passive: true } as const;
  view.addEventListener("scroll", scrolled, options);
  doc.addEventListener("load", loaded, options);
  // The first look waits for the page to be idle too: the glass starts
  // while a large page is still laying out (the controls' computed style
  // read here would force that pass early, in front of the finger).
  const start = () => {
    startId = 0;
    scan();
  };
  startId = idle
    ? view.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS })
    : view.setTimeout(start, 0);

  return () => {
    tree.disconnect();
    resize?.disconnect();
    near?.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    if (idleId) view.cancelIdleCallback(idleId);
    if (post) view.clearTimeout(post);
    if (startId) {
      if (idle) view.cancelIdleCallback(startId);
      else view.clearTimeout(startId);
    }
    if (scanTimer) view.clearTimeout(scanTimer);
    if (restTimer) view.clearTimeout(restTimer);
    if (peekTimer) view.clearTimeout(peekTimer);
    if (artTimer) view.clearTimeout(artTimer);
    view.removeEventListener("scroll", scrolled, options);
    doc.removeEventListener("load", loaded, options);
    for (const el of [...tracked.keys()]) detach(el);
  };
}
