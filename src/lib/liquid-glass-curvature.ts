// Liquid glass: the curvature's script half (owner, 2026-11-01:
// 「ガラスの湾曲はfableで作って」). Started by liquid-glass-defs.tsx only while
// html[data-button-style="liquid"] is set, and undone completely when the
// option goes off (every attribute, rule and node it wrote is removed).
//
// Each glass control is measured once (a ResizeObserver: its border box,
// never a layout read per frame) and its corner radius and corner family
// (corner-shape: squircle on the slabs; round, or unsupported, elsewhere)
// read from computed style at that moment. The box is quantised to a shape
// (4px steps, 2px radius steps: src/lib/liquid-glass-curvature-map.ts),
// keyed by the family too, so an engine without corner-shape, which paints
// circular corners, gets a bezel that follows them, and the shape's maps
// are built once, on a canvas, in a frame-budgeted queue:
// - Chromium (html[data-liquid-lens]): an SVG filter per shape, the
//   displacement map of a convex bezel refracting the backdrop inward with
//   a chromatic fringe, named by the sheet as
//   backdrop-filter: var(--lg-lens, url(#dw-liquid-lens-capsule)) …;
// - every engine: the same bezel's rim light (the specular arc, the fresnel
//   band and the far caustic), a PNG the sheet lays as the control's first
//   background layer through var(--lg-rim-map, none). WebKit and Gecko draw
//   no url() backdrop, so this is their curvature: no new backdrop layer.
// A shape's rule (`[data-lg-curve="key"] { --lg-lens; --lg-rim-map }`) lives
// in one <style> this module owns; a control carries only data-lg-curve.
// Controls change shape rarely (a resize, a font load), and the hold's
// swell is a scale, which the filter and the image follow for free.

import { LIQUID_GLASS_TARGETS, LIQUID_LENS_ATTRIBUTE } from "./liquid-glass";
import {
  cornerOf,
  curvatureKey,
  quantizeShape,
  surfaceMaps,
  type LensShape,
  type SurfaceMaps,
} from "./liquid-glass-curvature-map";

/** The glass controls, the slider's thumb and lens, and the held thumbs' lens targets. */
export const CURVATURE_TARGETS = [
  ...LIQUID_GLASS_TARGETS,
  ".ios-slide-open-thumb",
  ".ios-slide-open-lens-body",
  ".lg-lens-target",
] as const;

/** The range inputs whose ::-webkit-slider-thumb wears the glass. */
export const CURVATURE_RANGES = [
  '.rzn-movie-seek > input[type="range"]',
  '.lab-seek input[type="range"]',
  '.dream-chapter-stage-slider input[type="range"]',
] as const;

/** The attribute a measured control carries (its shape's key). */
export const CURVE_ATTRIBUTE = "data-lg-curve";
/** The same, on a range input, for its thumb. */
export const CURVE_THUMB_ATTRIBUTE = "data-lg-curve-thumb";
/** The id prefix of the per-shape SVG filters. */
export const LENS_ID_PREFIX = "dw-lens-";
/** How far the red channel is bent past green and blue (the fringe). */
export const DISPERSION = 1.15;
/** The materialize stage's lens: this share of the shape's bend. */
export const MATERIALIZE_STRENGTH = 0.45;
/** Its filter's id: the shape's own id and this suffix. */
export const MATERIALIZE_SUFFIX = "-m";
/** Map building per frame, ms. */
export const FRAME_BUDGET_MS = 6;

const TARGETS = CURVATURE_TARGETS.join(", ");
const RANGES = CURVATURE_RANGES.join(", ");
const SVG_NS = "http://www.w3.org/2000/svg";
const RED_ONLY = "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
const GREEN_BLUE = "0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";

/** The corner radius, CSS px, from a computed border-radius of one corner. */
export function parseRadius(value: string, width: number, height: number) {
  const first = value.trim().split(/\s+/)[0] ?? "";
  const n = parseFloat(first);
  if (!Number.isFinite(n)) return 0;
  if (first.endsWith("%")) return (n / 100) * Math.min(width, height);
  return n;
}

interface Tracked {
  el: HTMLElement;
  range: boolean;
  key: string;
}

interface Built {
  rimUrl: string;
  lensUrl: string | null;
  maps: SurfaceMaps;
}

/**
 * Starts the curvature. Returns a disposer that removes every attribute,
 * rule and node it added.
 */
export function watchLiquidCurvature(doc: Document = document) {
  const view = doc.defaultView;
  if (!view || typeof view.ResizeObserver !== "function" || !doc.body) return () => {};
  const root = doc.documentElement;
  const withLens = root.hasAttribute(LIQUID_LENS_ATTRIBUTE);

  // The sheet of per-shape rules and (Chromium) the filters.
  const style = doc.createElement("style");
  style.setAttribute("data-lg-curvature", "");
  doc.body.append(style);
  let svg: SVGSVGElement | null = null;
  if (withLens) {
    svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "liquid-glass-curvature-defs");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute(
      "style",
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
    );
    svg.append(doc.createElementNS(SVG_NS, "defs"));
    doc.body.append(svg);
  }

  const tracked = new Map<HTMLElement, Tracked>();
  const built = new Map<string, Built>();
  const pending = new Map<string, { shape: LensShape; els: Set<HTMLElement> }>();
  let frame = 0;
  let scanTimer = 0;
  let canvas: HTMLCanvasElement | null = null;

  function economy() {
    return root.getAttribute("data-world-effects") === "economy";
  }

  /** A PNG data URL of cols × rows premultiplied RGBA. */
  function png(cols: number, rows: number, data: Uint8ClampedArray) {
    canvas ??= doc.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const image = ctx.createImageData(cols, rows);
    image.data.set(data);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function lensFilter(key: string, maps: SurfaceMaps, href: string, strength = 1) {
    if (!svg) return null;
    const id = LENS_ID_PREFIX + key + (strength < 1 ? MATERIALIZE_SUFFIX : "");
    const filter = doc.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "1");
    filter.setAttribute("height", "1");
    filter.setAttribute("primitiveUnits", "objectBoundingBox");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const image = doc.createElementNS(SVG_NS, "feImage");
    image.setAttribute("href", href);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", "1");
    image.setAttribute("height", "1");
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("result", "map");
    const bend = (scale: number, result: string) => {
      const node = doc.createElementNS(SVG_NS, "feDisplacementMap");
      node.setAttribute("in", "SourceGraphic");
      node.setAttribute("in2", "map");
      node.setAttribute("scale", scale.toFixed(4));
      node.setAttribute("xChannelSelector", "R");
      node.setAttribute("yChannelSelector", "G");
      node.setAttribute("result", result);
      return node;
    };
    const matrix = (input: string, values: string, result: string) => {
      const node = doc.createElementNS(SVG_NS, "feColorMatrix");
      node.setAttribute("in", input);
      node.setAttribute("type", "matrix");
      node.setAttribute("values", values);
      node.setAttribute("result", result);
      return node;
    };
    const blend = doc.createElementNS(SVG_NS, "feBlend");
    blend.setAttribute("in", "red");
    blend.setAttribute("in2", "greenBlue");
    blend.setAttribute("mode", "screen");
    filter.append(
      image,
      bend(maps.scale * strength, "bent"),
      bend(maps.scale * strength * DISPERSION, "bentRed"),
      matrix("bentRed", RED_ONLY, "red"),
      matrix("bent", GREEN_BLUE, "greenBlue"),
      blend,
    );
    svg.firstElementChild!.append(filter);
    return `url("#${id}")`;
  }

  function rule(selector: string, body: string) {
    try {
      style.sheet?.insertRule(`${selector} { ${body} }`, style.sheet.cssRules.length);
    } catch {
      // A pseudo-element this engine does not know: nothing to draw there.
    }
  }

  function build(key: string, shape: LensShape) {
    const maps = surfaceMaps(shape);
    const rimUrl = `url("${png(maps.rim.cols, maps.rim.rows, maps.rim.data)}")`;
    const lensHref = svg ? png(maps.lens.cols, maps.lens.rows, maps.lens.data) : "";
    const lensUrl = lensFilter(key, maps, lensHref);
    // The same bezel bending less: the stage a materializing control passes
    // through as its lens comes in (the sheet's lg-materialize).
    const halfUrl = lensFilter(key, maps, lensHref, MATERIALIZE_STRENGTH);
    const body = `--lg-rim-map: ${rimUrl};${lensUrl ? ` --lg-lens: ${lensUrl};` : ""}${
      halfUrl ? ` --lg-lens-mat: ${halfUrl};` : ""
    }`;
    rule(`[${CURVE_ATTRIBUTE}="${key}"]`, body);
    rule(`[${CURVE_THUMB_ATTRIBUTE}="${key}"]::-webkit-slider-thumb`, body);
    rule(`[${CURVE_THUMB_ATTRIBUTE}="${key}"]::-moz-range-thumb`, body);
    const entry = { rimUrl, lensUrl, maps };
    built.set(key, entry);
    return entry;
  }

  function apply(el: HTMLElement, range: boolean, key: string) {
    el.setAttribute(range ? CURVE_THUMB_ATTRIBUTE : CURVE_ATTRIBUTE, key);
  }

  /** Builds the queued shapes, a few milliseconds a frame. */
  function drain() {
    frame = 0;
    const start = performance.now();
    for (const [key, item] of pending) {
      if (!built.has(key)) build(key, item.shape);
      for (const el of item.els) {
        const entry = tracked.get(el);
        if (entry && entry.key === key) apply(el, entry.range, key);
      }
      pending.delete(key);
      if (performance.now() - start > FRAME_BUDGET_MS) break;
    }
    if (pending.size && !frame) frame = view!.requestAnimationFrame(drain);
  }

  function measure(el: HTMLElement, width: number, height: number) {
    const entry = tracked.get(el);
    if (!entry || width < 2 || height < 2) return;
    let w = width;
    let h = height;
    let radius: string;
    let corner: string;
    if (entry.range) {
      // The thumb's own box and corners (its pseudo-element's style).
      const thumb = view!.getComputedStyle(el, "::-webkit-slider-thumb");
      w = parseFloat(thumb.width) || 0;
      h = parseFloat(thumb.height) || 0;
      radius = thumb.borderTopLeftRadius;
      corner = thumb.getPropertyValue("corner-shape");
      if (w < 2 || h < 2) return;
    } else {
      const own = view!.getComputedStyle(el);
      radius = own.borderTopLeftRadius;
      corner = own.getPropertyValue("corner-shape");
    }
    const dpr = economy() ? 1 : (view!.devicePixelRatio || 1);
    const shape = quantizeShape(w, h, parseRadius(radius, w, h), dpr, cornerOf(corner));
    const key = curvatureKey(shape);
    if (entry.key === key) return;
    entry.key = key;
    if (built.has(key)) {
      apply(el, entry.range, key);
      return;
    }
    const item = pending.get(key) ?? { shape, els: new Set<HTMLElement>() };
    item.els.add(el);
    pending.set(key, item);
    if (!frame) frame = view!.requestAnimationFrame(drain);
  }

  const resize = new view.ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const box = entry.borderBoxSize?.[0];
      if (box) measure(el, box.inlineSize, box.blockSize);
      else {
        const rect = el.getBoundingClientRect();
        measure(el, rect.width, rect.height);
      }
    }
  });

  function attach(el: HTMLElement, range: boolean) {
    if (tracked.has(el)) return;
    tracked.set(el, { el, range, key: "" });
    resize.observe(el, { box: "border-box" });
  }

  function detach(entry: Tracked) {
    resize.unobserve(entry.el);
    entry.el.removeAttribute(entry.range ? CURVE_THUMB_ATTRIBUTE : CURVE_ATTRIBUTE);
    tracked.delete(entry.el);
  }

  function scan() {
    scanTimer = 0;
    for (const entry of [...tracked.values()]) if (!entry.el.isConnected) detach(entry);
    for (const el of doc.querySelectorAll<HTMLElement>(TARGETS)) attach(el, false);
    for (const el of doc.querySelectorAll<HTMLElement>(RANGES)) attach(el, true);
  }

  // Pages mount and unmount controls as the router moves: a quiet rescan,
  // at most every 400 ms, while the tree is changing. A class that lands on
  // a held thumb's lens target (.lg-lens-target) is taken up at once.
  const tree = new view.MutationObserver((records) => {
    let rescan = false;
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target;
        if (el instanceof view.HTMLElement && el.classList.contains("lg-lens-target"))
          attach(el, false);
      } else if (record.addedNodes.length || record.removedNodes.length) rescan = true;
    }
    if (rescan && !scanTimer) scanTimer = view.setTimeout(scan, 400);
  });
  tree.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  // A change of density (a window moved between screens) re-keys the rims.
  const media = view.matchMedia?.("(resolution: 1dppx)");
  const rekey = () => {
    for (const entry of tracked.values()) entry.key = "";
    for (const entry of tracked.values()) {
      const rect = entry.el.getBoundingClientRect();
      measure(entry.el, rect.width, rect.height);
    }
  };
  media?.addEventListener?.("change", rekey);
  scan();

  return () => {
    tree.disconnect();
    resize.disconnect();
    media?.removeEventListener?.("change", rekey);
    if (frame) view.cancelAnimationFrame(frame);
    if (scanTimer) view.clearTimeout(scanTimer);
    for (const entry of [...tracked.values()]) detach(entry);
    pending.clear();
    built.clear();
    style.remove();
    svg?.remove();
  };
}
