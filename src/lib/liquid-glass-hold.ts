// The liquid glass's long press (owner, 2026-11-01: 「リキッドグラス長押し時の
// ボタンの大型化や光の拡散効果を実装して」). The script half of section 8 of
// src/styles-liquid-glass-controls.css, started by liquid-glass-defs.tsx only
// while html[data-button-style="liquid"] is set, and undone completely when
// the option goes off.
//
// A quick tap keeps the shared press (press-feedback.js: the gel squash).
// A press held for HOLD_MS, as iOS 26's glass does:
// - the control swells (the individual `scale` property, never `transform`,
//   so no layout moves): small chips and icons by about 1.18, large cards by
//   about 1.08, never past what a clipping ancestor leaves room for;
// - light diffuses from the finger: a bloom spreads through the glass, the
//   rim nearest the finger brightens, two caustic rings travel outward, and
//   a little light spills past the edge. While held, the light follows the
//   finger; on release the control springs back and the light fades.
//
// The light is one overlay (.lg-hold), reused for every press, so at most
// one diffusion layer exists. It is a fixed layer in the body (or in the open
// modal <dialog>, which sits in the top layer), cut to the nearest clipping
// ancestor, so neither the grown control nor its glow is cut by a rail or a
// bar, and no React tree gains a node.
//
// The draggables (Ciel's button, the slide-to-open pills, the range thumbs)
// measure their box during the drag: they get the light only, never a scale.
//
// Budgets: nothing is read on a tap. A hold reads its geometry once (one
// getBoundingClientRect on the control, one on each clipping ancestor and
// the overlay, and their computed style); a move while held writes two
// custom properties from the event's coordinates and reads nothing. Only
// scale, translate and opacity animate; no backdrop-filter is added.

import { LIQUID_GLASS_TARGETS } from "./liquid-glass";

/** How long a press rests before it counts as a hold (the slider lens's 200 ms). */
export const HOLD_MS = 200;
/** A finger that travels further before the hold is scrolling, not holding. */
export const HOLD_SLOP_PX = 10;
/** How long the release's spring and fade run before the overlay is put away. */
export const RELEASE_MS = 640;

/** Swell bounds: an icon (48px and under) to a large card (240px and over). */
export const SWELL_SMALL = 1.18;
export const SWELL_LARGE = 1.08;

/** Draggables: their drag measures the box, so they are lit, never scaled. */
export const HOLD_LIGHT_ONLY = [
  ".zeus-button",
  ".ios-slide-open",
  '.rzn-movie-seek > input[type="range"]',
  '.lab-seek input[type="range"]',
  '.dream-chapter-stage-slider input[type="range"]',
] as const;

/** The styled selects (styles-liquid-glass-controls.css, section 5). */
export const HOLD_SELECTS = [
  ".gallery-order select",
  ".gallery-tour-playback select",
  ".rxs-comparison-selector select",
  ".rxs-p14-native-select select",
  ".lab-selectors select",
  ".dream-page select",
  ".dogs-viewer select",
  ".exhibition-artwork-browser select",
] as const;

/** Everything that swells: the glass buttons, the pills, the rail items. */
export const HOLD_SWELL = [
  ...LIQUID_GLASS_TARGETS.filter((target) => !HOLD_LIGHT_ONLY.includes(target as never)),
  '[data-lg-seg-mode] > :is(button, a, [role="tab"], [role="radio"])',
  '[data-lg-rail] > :is(a, button, article, [role="button"], [role="tab"])',
  "[data-lg-rail] > li > :is(a, button)",
  ...HOLD_SELECTS,
] as const;

/** The switches swell their track (decorative), never the button's box. */
export const HOLD_SWITCHES = [".side-panel-zeus-toggle"] as const;

/** Never: the rails that own their own hold and lens, and dead controls. */
const HOLD_SKIP =
  '.liquid-swipe-tabs, [data-press-skip], [aria-disabled="true"], :disabled, [data-lg-hold-skip]';

const ALL = [...HOLD_LIGHT_ONLY, ...HOLD_SWITCHES, ...HOLD_SWELL].join(", ");
const LIGHT_ONLY = HOLD_LIGHT_ONLY.join(", ");
const SWITCHES = HOLD_SWITCHES.join(", ");
const SELECTS = HOLD_SELECTS.join(", ");

/* Every attribute and property this module writes on a control. */
const HOLD = "data-lg-hold";
const KIND = "data-lg-hold-kind";
const RAISE = "data-lg-hold-raise";
const PROPS = ["--lg-hold-s"] as const;

type Kind = "swell" | "switch" | "light";

/** The swell for a box: more for an icon, less for a card. */
export function swellFor(width: number, height: number) {
  const d = Math.max(width, height);
  const t = Math.min(1, Math.max(0, (d - 48) / (240 - 48)));
  return SWELL_SMALL + (SWELL_LARGE - SWELL_SMALL) * t;
}

/**
 * The largest scale about (ox, oy) that keeps the box inside the clip,
 * less a 2px margin. 1 when there is no room at all.
 */
export function fitScale(
  box: { left: number; top: number; right: number; bottom: number },
  clip: { left: number; top: number; right: number; bottom: number },
  ox: number,
  oy: number,
) {
  let s = Infinity;
  const room = (to: number, from: number) => (from > 0.5 ? Math.max(0, to) / from : Infinity);
  s = Math.min(s, room(ox - clip.left - 2, ox - box.left));
  s = Math.min(s, room(clip.right - 2 - ox, box.right - ox));
  s = Math.min(s, room(oy - clip.top - 2, oy - box.top));
  s = Math.min(s, room(clip.bottom - 2 - oy, box.bottom - oy));
  return Math.max(1, s);
}

interface Press {
  target: HTMLElement;
  kind: Kind;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  timer: number;
  held: boolean;
  /* Set when the hold starts: the shell's box in the overlay's coordinates. */
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  /* The overlay's left top corner in the viewport. */
  ox: number;
  oy: number;
}

function clipRect(view: Window, el: HTMLElement) {
  let left = 0;
  let top = 0;
  let right = view.innerWidth;
  let bottom = view.innerHeight;
  let node = el.parentElement;
  while (node && node !== el.ownerDocument.body && node !== el.ownerDocument.documentElement) {
    const style = view.getComputedStyle(node);
    const clips =
      style.overflowX !== "visible" ||
      style.overflowY !== "visible" ||
      /paint|strict|content/.test(style.contain);
    if (clips) {
      const r = node.getBoundingClientRect();
      left = Math.max(left, r.left + node.clientLeft);
      top = Math.max(top, r.top + node.clientTop);
      right = Math.min(right, r.left + node.clientLeft + (node.clientWidth || r.width));
      bottom = Math.min(bottom, r.top + node.clientTop + (node.clientHeight || r.height));
    }
    // Past a fixed box (or the top layer) the ancestors no longer clip it.
    if (style.position === "fixed" || node.localName === "dialog") break;
    node = node.parentElement;
  }
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

/**
 * Starts the long press. Returns a disposer that removes the overlay and
 * every attribute, property and listener it added.
 */
export function watchLiquidHold(doc: Document = document) {
  const view = doc.defaultView;
  if (!view) return () => {};
  let press: Press | null = null;
  let overlay: HTMLDivElement | null = null;
  let releasing: { target: HTMLElement; timer: number } | null = null;
  let frame = 0;

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = doc.createElement("div");
    overlay.className = "lg-hold";
    overlay.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    const halo = doc.createElement("i");
    halo.className = "lg-hold-halo";
    const shell = doc.createElement("i");
    shell.className = "lg-hold-shell";
    for (const name of ["lg-hold-bloom", "lg-hold-ripple", "lg-hold-rim"]) {
      const layer = doc.createElement("i");
      layer.className = name;
      shell.appendChild(layer);
    }
    overlay.append(halo, shell);
    return overlay;
  };

  const clearTarget = (target: HTMLElement) => {
    for (const name of [HOLD, KIND, RAISE]) target.removeAttribute(name);
    for (const prop of PROPS) target.style.removeProperty(prop);
  };

  const finishRelease = () => {
    if (!releasing) return;
    view.clearTimeout(releasing.timer);
    if (releasing.target.getAttribute(HOLD) === "out") clearTarget(releasing.target);
    releasing = null;
    if (overlay && !press?.held) {
      overlay.hidden = true;
      overlay.removeAttribute("data-state");
    }
  };

  /** The finger, in the shell's own (unscaled) coordinates. */
  const follow = (p: Press, x: number, y: number) => {
    if (!overlay) return;
    const cx = p.left + p.width / 2;
    const cy = p.top + p.height / 2;
    const lx = (x - p.ox - cx) / p.scale + p.width / 2;
    const ly = (y - p.oy - cy) / p.scale + p.height / 2;
    const tx = Math.min(p.width, Math.max(0, lx));
    const ty = Math.min(p.height, Math.max(0, ly));
    overlay.style.setProperty("--lg-tx", `${tx.toFixed(1)}px`);
    overlay.style.setProperty("--lg-ty", `${ty.toFixed(1)}px`);
    // Toward the finger, -1..1: the spill leans that way.
    overlay.style.setProperty("--lg-dx", ((tx / p.width) * 2 - 1).toFixed(2));
    overlay.style.setProperty("--lg-dy", ((ty / p.height) * 2 - 1).toFixed(2));
  };

  const startHold = () => {
    const p = press;
    if (!p) return;
    p.timer = 0;
    const { target } = p;
    if (!target.isConnected) {
      press = null;
      return;
    }
    finishRelease();
    // The box the swell grows from: for a switch, its decorative track.
    const anchor =
      p.kind === "switch" ? (target.querySelector<HTMLElement>(":scope > i") ?? target) : target;
    const style = view.getComputedStyle(anchor);
    const rect = anchor.getBoundingClientRect();
    // The press's squash may already be under way: the layout size, about
    // the painted centre (the squash scales about the centre).
    const width = anchor.offsetWidth || rect.width;
    const height = anchor.offsetHeight || rect.height;
    if (!width || !height) {
      press = null;
      return;
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const box = {
      left: cx - width / 2,
      top: cy - height / 2,
      right: cx + width / 2,
      bottom: cy + height / 2,
    };
    const clip = clipRect(view, anchor);
    let scale = 1;
    if (p.kind !== "light") {
      scale = Math.min(swellFor(width, height), fitScale(box, clip, cx, cy));
      if (scale < 1.02) scale = 1;
    }
    const own = view.getComputedStyle(target);
    const tint = own.getPropertyValue("--lg-tint").trim();
    // A milky plate (ENTER THE WORLD) takes a tinted light: white on white
    // would wash its label out.
    const fill = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(
      own.getPropertyValue("--lg-fill") || own.backgroundColor,
    );
    const light =
      !!fill &&
      (Number(fill[1]) + Number(fill[2]) + Number(fill[3])) / 3 > 170 &&
      Number(fill[4] ?? 1) > 0.4;
    const from = style.scale && style.scale !== "none" ? style.scale : "1";

    const layer = ensureOverlay();
    const host = target.closest("dialog[open]") ?? doc.body;
    if (layer.parentNode !== host) host.appendChild(layer);
    layer.style.left = `${clip.left}px`;
    layer.style.top = `${clip.top}px`;
    layer.style.width = `${clip.right - clip.left}px`;
    layer.style.height = `${clip.bottom - clip.top}px`;
    layer.hidden = false;
    layer.removeAttribute("data-state");
    // A transformed dialog moves a fixed box's origin: correct it once.
    const placed = layer.getBoundingClientRect();
    const fixLeft = clip.left - placed.left;
    const fixTop = clip.top - placed.top;
    if (Math.abs(fixLeft) > 0.5 || Math.abs(fixTop) > 0.5) {
      layer.style.left = `${clip.left + fixLeft}px`;
      layer.style.top = `${clip.top + fixTop}px`;
    }
    p.left = box.left - clip.left;
    p.top = box.top - clip.top;
    p.width = width;
    p.height = height;
    p.scale = scale;
    p.ox = clip.left;
    p.oy = clip.top;
    p.held = true;

    const ls = layer.style;
    ls.setProperty("--lg-hold-x", `${p.left.toFixed(1)}px`);
    ls.setProperty("--lg-hold-y", `${p.top.toFixed(1)}px`);
    ls.setProperty("--lg-hold-w", `${width.toFixed(1)}px`);
    ls.setProperty("--lg-hold-h", `${height.toFixed(1)}px`);
    // A range has no box of its own to light: only the bloom along its
    // track, in a capsule (no rim, no spill outlining the input's box).
    const bare = anchor.localName === "input";
    ls.setProperty("--lg-hold-r", bare ? "999px" : style.borderRadius || "999px");
    ls.setProperty("--lg-hold-from", from);
    ls.setProperty("--lg-hold-s", scale.toFixed(3));
    // The bloom's reach: past the far corner of a chip, a pool on a card.
    const reach = Math.min(520, Math.max(96, Math.hypot(width, height) * 1.6));
    ls.setProperty("--lg-hold-d", `${Math.ceil(reach)}px`);
    ls.setProperty("--lg-hold-tint", /^\d/.test(tint) ? tint : "190 232 255");
    layer.setAttribute("data-kind", p.kind);
    layer.toggleAttribute("data-light", light);
    layer.toggleAttribute("data-bare", bare);
    follow(p, p.x, p.y);
    // The rings start where the finger first rested and keep travelling.
    ls.setProperty("--lg-rx", ls.getPropertyValue("--lg-tx"));
    ls.setProperty("--lg-ry", ls.getPropertyValue("--lg-ty"));

    target.style.setProperty("--lg-hold-s", scale.toFixed(3));
    target.setAttribute(KIND, p.kind);
    // A grown control lifts over its neighbours where z-index applies.
    const parent = target.parentElement;
    if (
      p.kind === "swell" &&
      own.zIndex === "auto" &&
      (own.position !== "static" ||
        (parent && /flex|grid/.test(view.getComputedStyle(parent).display)))
    )
      target.setAttribute(RAISE, "");
    target.setAttribute(HOLD, "on");
    // The overlay starts at the press's squash, then swells with the
    // control on the next frame (the same spring, the same origin).
    if (frame) view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      if (press === p && overlay) overlay.setAttribute("data-state", "on");
    });
  };

  const release = () => {
    const p = press;
    press = null;
    if (!p) return;
    if (p.timer) view.clearTimeout(p.timer);
    if (!p.held) return;
    if (frame) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
    p.target.setAttribute(HOLD, "out");
    overlay?.setAttribute("data-state", "out");
    releasing = { target: p.target, timer: view.setTimeout(finishRelease, RELEASE_MS) };
  };

  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button > 0) return;
    if (press) release();
    const origin = event.target instanceof view.Element ? event.target : null;
    const target = origin?.closest<HTMLElement>(ALL);
    if (!target || target.closest(HOLD_SKIP)) return;
    // A mouse opens a select's list on the press itself.
    if (event.pointerType === "mouse" && target.matches(SELECTS)) return;
    const kind: Kind = target.matches(LIGHT_ONLY)
      ? "light"
      : target.matches(SWITCHES)
        ? "switch"
        : "swell";
    press = {
      target,
      kind,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      timer: view.setTimeout(startHold, HOLD_MS),
      held: false,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      scale: 1,
      ox: 0,
      oy: 0,
    };
  };

  const move = (event: PointerEvent) => {
    const p = press;
    if (!p || event.pointerId !== p.pointerId) return;
    if (!p.held) {
      if (
        Math.abs(event.clientX - p.x) > HOLD_SLOP_PX ||
        Math.abs(event.clientY - p.y) > HOLD_SLOP_PX
      )
        release();
      return;
    }
    // Ciel's button is carried away by its drag: its light lets go.
    if (p.target.getAttribute("data-dragging") === "true" && p.target.matches(".zeus-button")) {
      release();
      return;
    }
    follow(p, event.clientX, event.clientY);
  };

  const up = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointerId) release();
  };

  // A touch held on a glass control is the hold, not the page's long-press
  // menu (Android raises it at about 500 ms and would end the hold).
  const menu = (event: Event) => {
    if (press?.held && press.pointerType !== "mouse") event.preventDefault();
    else release();
  };

  const cancel = () => release();

  const passive = { capture: true, passive: true } as const;
  const active = { capture: true, passive: false } as const;
  doc.addEventListener("pointerdown", down, passive);
  doc.addEventListener("pointermove", move, passive);
  doc.addEventListener("pointerup", up, passive);
  doc.addEventListener("pointercancel", up, passive);
  doc.addEventListener("scroll", cancel, passive);
  doc.addEventListener("dragstart", cancel, passive);
  doc.addEventListener("contextmenu", menu, active);
  doc.addEventListener("visibilitychange", cancel);
  view.addEventListener("blur", cancel);

  return () => {
    if (press?.timer) view.clearTimeout(press.timer);
    if (press) clearTarget(press.target);
    press = null;
    if (releasing) {
      view.clearTimeout(releasing.timer);
      clearTarget(releasing.target);
      releasing = null;
    }
    if (frame) view.cancelAnimationFrame(frame);
    overlay?.remove();
    overlay = null;
    doc.removeEventListener("pointerdown", down, passive);
    doc.removeEventListener("pointermove", move, passive);
    doc.removeEventListener("pointerup", up, passive);
    doc.removeEventListener("pointercancel", up, passive);
    doc.removeEventListener("scroll", cancel, passive);
    doc.removeEventListener("dragstart", cancel, passive);
    doc.removeEventListener("contextmenu", menu, active);
    doc.removeEventListener("visibilitychange", cancel);
    view.removeEventListener("blur", cancel);
  };
}
