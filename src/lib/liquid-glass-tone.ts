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
// - read when a control is first seen or resized, and, for a control that
//   stays put while the page scrolls under it (in a fixed or sticky box),
//   once each time a scroll comes to rest. Never per frame.
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
/** Estimates per frame. */
const PER_FRAME = 6;

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

  const tracked = new Map<HTMLElement, { pinned: boolean; tone: "light" | "dark" }>();
  const queue = new Set<HTMLElement>();
  let frame = 0;
  let scanTimer = 0;
  let restTimer = 0;
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

  /* The colour behind one point of the control, front to back. */
  function sampleAt(el: HTMLElement, x: number, y: number): Sample {
    let r = 0;
    let g = 0;
    let b = 0;
    let left = 1;
    let busy = false;
    for (const node of doc.elementsFromPoint(x, y)) {
      if (node === el || el.contains(node) || node.closest(".lg-hold")) continue;
      if (node instanceof view!.HTMLImageElement) {
        const c = imageAt(node, x, y) ?? { r: 40, g: 44, b: 54 };
        busy = true;
        r += c.r * left;
        g += c.g * left;
        b += c.b * left;
        left = 0;
        break;
      }
      if (node instanceof view!.HTMLVideoElement || node instanceof view!.HTMLCanvasElement) {
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

  function estimate(el: HTMLElement) {
    const entry = tracked.get(el);
    if (!entry || !el.isConnected) return;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (box.bottom < 0 || box.top > view!.innerHeight || box.right < 0 || box.left > view!.innerWidth)
      return;
    const y = box.top + box.height / 2;
    const points = [0.2, 0.5, 0.8].map((f) => sampleAt(el, box.left + box.width * f, y));
    const n = points.length;
    const avg = points.reduce(
      (s, p) => ({ r: s.r + p.r / n, g: s.g + p.g / n, b: s.b + p.b / n }),
      { r: 0, g: 0, b: 0 },
    );
    const tone = toneFor(luminance(avg.r, avg.g, avg.b), entry.tone);
    entry.tone = tone;
    if (tone === "light") el.setAttribute(TONE_ATTRIBUTE, "light");
    else el.removeAttribute(TONE_ATTRIBUTE);
    el.toggleAttribute(BUSY_ATTRIBUTE, points.some((p) => p.busy));
  }

  function drain() {
    frame = 0;
    let done = 0;
    for (const el of queue) {
      queue.delete(el);
      estimate(el);
      if (++done >= PER_FRAME) break;
    }
    if (queue.size) frame = view!.requestAnimationFrame(drain);
  }

  function enqueue(el: HTMLElement) {
    queue.add(el);
    if (!frame) frame = view!.requestAnimationFrame(drain);
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
          for (const entry of entries) enqueue(entry.target as HTMLElement);
        })
      : null;

  function detach(el: HTMLElement) {
    resize?.unobserve(el);
    el.removeAttribute(TONE_ATTRIBUTE);
    el.removeAttribute(BUSY_ATTRIBUTE);
    tracked.delete(el);
    queue.delete(el);
  }

  function scan() {
    scanTimer = 0;
    for (const el of [...tracked.keys()]) if (!el.isConnected) detach(el);
    for (const el of doc.querySelectorAll<HTMLElement>(TARGETS)) {
      if (tracked.has(el)) continue;
      tracked.set(el, { pinned: pinnedOf(el), tone: "dark" });
      resize?.observe(el);
      enqueue(el);
    }
  }

  const tree = new view.MutationObserver((records) => {
    if (records.some((r) => r.addedNodes.length || r.removedNodes.length) && !scanTimer)
      scanTimer = view.setTimeout(scan, 400);
  });
  tree.observe(doc.body, { childList: true, subtree: true });

  // The page moved under the pinned controls: look again once it is still.
  // Images load late (the art under the bar): look again then too.
  const rest = () => {
    restTimer = 0;
    for (const [el, entry] of tracked) if (entry.pinned) enqueue(el);
  };
  const scrolled = () => {
    if (restTimer) view.clearTimeout(restTimer);
    restTimer = view.setTimeout(rest, SCROLL_REST_MS);
  };
  const loaded = (event: Event) => {
    if (event.target instanceof view.HTMLImageElement) scrolled();
  };
  const options = { capture: true, passive: true } as const;
  view.addEventListener("scroll", scrolled, options);
  doc.addEventListener("load", loaded, options);
  scan();

  return () => {
    tree.disconnect();
    resize?.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    if (scanTimer) view.clearTimeout(scanTimer);
    if (restTimer) view.clearTimeout(restTimer);
    view.removeEventListener("scroll", scrolled, options);
    doc.removeEventListener("load", loaded, options);
    for (const el of [...tracked.keys()]) detach(el);
  };
}
