// The liquid glass's long press (owner, 2026-11-01: 「リキッドグラス長押し時の
// ボタンの大型化や光の拡散効果を実装して」). The script half of section 8 of
// src/styles-liquid-glass-controls.css, started by liquid-glass-defs.tsx only
// while html[data-button-style="liquid"] is set, and undone completely when
// the option goes off.
//
// A quick tap keeps the shared press (press-feedback.js: the gel squash).
// A press held for HOLD_MS, as iOS 26's glass does:
// - the control swells (the individual `scale` property, never `transform`,
//   so no layout moves), as far as iOS 26's glass does (owner, 2026-11-01:
//   「拡大も小さすぎます」): an icon or a small chip by 1.42, a pill by about
//   1.28, a card by about 1.15, a large card by 1.12 (swellFor);
// - where a clipping ancestor (a scrolling rail, the side menu, a hero) has
//   no room for that, the control is lifted rather than capped: a styled
//   copy of it (liftCopy) swells in the overlay, which no ancestor clips,
//   while the control itself stays in place, unscaled and transparent, so it
//   still takes the finger and the click. Only the viewport caps a swell, and
//   a control the copy cannot stand for (a video, a canvas, a frame, a large
//   tree, a dialog's content) is capped as before;
// - the finger is a light held over curved glass (owner, 2026-11-02:
//   「長押し時の反射光沢などを大きく改善して」): a specular highlight sits
//   between the finger and the glass's apex and slides as the finger does,
//   an environment reflection band drifts the other way across the top,
//   the rim brightens by Fresnel on the finger's side (a lobe that rotates
//   toward it, with a spectral fringe), a caustic pools under the glass on
//   the far side, and a tinted glow rises inside. On release the control
//   springs back and the light relaxes to the rest light.
//
// The light is one overlay (.lg-hold), reused for every press, so at most
// one diffusion layer exists. It is a fixed layer in the body (or in the open
// modal <dialog>, which sits in the top layer), cut to the nearest clipping
// ancestor, so neither the grown control nor its glow is cut by a rail or a
// bar, and no React tree gains a node.
//
// The draggables (Ciel's button, the slide-to-open pills, the range thumbs)
// measure their box during the drag: the box gets the light only, never a
// scale. The sliders swell a decorative layer of their own instead (owner,
// 2026-11-01: 「六詠や犬の切り替えスライダー長押し時などに光沢とともに拡大」):
// the slide-to-open lens and the range thumbs in the sheet, the tab rails'
// lens (src/lib/liquid/boot.js), none of which any drag measures.
// Ciel's light rides its drag (the drag's own inline translate, copied as it
// is written), so it never lets go while the button is carried.
//
// A tap is never a hold: the timer only arms it for the next frame (input
// the browser queued behind the timer runs first), and a pointerup stamped
// (event.timeStamp) under HOLD_MS after its pointerdown puts any light that
// did start away at once, however late the browser delivered it.
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
/** The light's room past the grown control: the lift's blur and the spill. */
export const HALO_PX = 44;

/** Swell bounds: an icon (48px and under) to a large card (320px and over). */
export const SWELL_SMALL = 1.42;
export const SWELL_LARGE = 1.12;
/** The swell by the box's longer side: [side px, scale], linear between. */
export const SWELL_STOPS = [
  [48, SWELL_SMALL],
  [96, 1.28],
  [200, 1.15],
  [320, SWELL_LARGE],
] as const;
/** The largest copy the lift makes (elements): a bigger tree is capped instead. */
export const LIFT_MAX_NODES = 40;

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
const LIFT = "data-lg-hold-lift";
const PROPS = ["--lg-hold-s"] as const;
/* On a pill group (liquid-glass-controls.ts) whose chosen option is held. */
const PILL_S = "--lg-hold-pill-s";

/* The pill group a held option rides in, when it is the chosen one. */
function pillOf(target: HTMLElement) {
  const group = target.parentElement;
  return group?.getAttribute("data-lg-seg-mode") === "pill" && target.hasAttribute("data-lg-seg-current")
    ? group
    : null;
}

type Kind = "swell" | "switch" | "light";

/** The swell for a box: more for an icon, less for a card. */
export function swellFor(width: number, height: number) {
  const d = Math.max(width, height);
  if (d <= SWELL_STOPS[0][0]) return SWELL_SMALL;
  for (let i = 1; i < SWELL_STOPS.length; i++) {
    const [d1, s1] = SWELL_STOPS[i];
    if (d <= d1) {
      const [d0, s0] = SWELL_STOPS[i - 1];
      return s0 + ((s1 - s0) * (d - d0)) / (d1 - d0);
    }
  }
  return SWELL_LARGE;
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
  /* The pointerdown's event time: a pointerup stamped sooner is a tap,
     however late the browser hands it over. */
  stamp: number;
  timer: number;
  held: boolean;
  /* Ciel's button carried by its own drag: the drag's translate when the
     light came on, and the observer that moves the light with it. */
  carried: { x: number; y: number; watch: MutationObserver | null } | null;
  /* Watches the control's ancestors for a script moving them (the side
     menu's swipe to close writes the panel's inline translate). */
  moved: MutationObserver | null;
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

/* Whether a copy can stand for the control: no live media, no huge tree. */
function liftable(target: HTMLElement) {
  if (target.closest("dialog")) return false;
  if (target.querySelector("video, canvas, iframe, object, embed")) return false;
  return target.querySelectorAll("*").length < LIFT_MAX_NODES;
}

/* Every computed property, as declarations (for a style attribute or a rule). */
function declarations(style: CSSStyleDeclaration) {
  let text = "";
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    text += `${name}:${style.getPropertyValue(name)};`;
  }
  return text;
}

/**
 * A copy of the control that looks the same outside its ancestors: each
 * element carries its computed style inline, and its ::before and ::after
 * as rules in a <style> of the copy's own. It is decorative (aria-hidden,
 * inert, no ids, no pointer events) and still: no animation, no transition
 * but the swell's. One read of computed style per element, once per hold.
 */
function liftCopy(view: Window, target: HTMLElement) {
  const doc = target.ownerDocument;
  const copy = target.cloneNode(true) as HTMLElement;
  const from = [target, ...target.querySelectorAll<HTMLElement>("*")];
  const to = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  let rules = "";
  from.forEach((el, i) => {
    const node = to[i];
    if (!node) return;
    node.setAttribute("style", declarations(view.getComputedStyle(el)));
    node.style.setProperty("animation", "none");
    node.style.setProperty("transition", "none");
    node.removeAttribute("id");
    // The inline style is the whole look: no page rule may reach the copy.
    node.removeAttribute("class");
    for (const pseudo of ["::before", "::after"]) {
      const style = view.getComputedStyle(el, pseudo);
      if (style.content === "none" || style.display === "none") continue;
      node.setAttribute("data-lg-lift-n", String(i));
      rules += `.lg-hold-lift [data-lg-lift-n="${i}"]${pseudo},.lg-hold-lift[data-lg-lift-n="${i}"]${pseudo}{${declarations(style)}animation:none;transition:none;}`;
    }
    if (i === 0) {
      // The chosen option of a pill group is clear: its glass is the
      // group's pill, which the copy wears itself.
      const group = pillOf(target);
      const side = group?.getAttribute("data-lg-seg");
      if (group && (side === "before" || side === "after")) {
        const pill = view.getComputedStyle(group, `::${side}`);
        node.style.setProperty("background", pill.background);
        node.style.setProperty("box-shadow", pill.boxShadow);
        node.style.setProperty("border-radius", pill.borderRadius);
        node.style.setProperty("border-color", "transparent");
      }
    }
    if ("value" in el && "value" in node) {
      try {
        (node as HTMLInputElement).value = (el as HTMLInputElement).value;
      } catch {
        /* a file input: nothing to show */
      }
    }
  });
  for (const name of [HOLD, KIND, RAISE, LIFT, "href", "tabindex", "aria-describedby", "aria-controls"])
    copy.removeAttribute(name);
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  // lg-lens-target: the hook a refraction layer attaches to (the swollen
  // visuals carry it: the rails' lens, the slide-to-open lens, this copy).
  copy.setAttribute("class", "lg-hold-lift lg-lens-target");
  // The pseudo-elements' rules sit beside the copy (a select or an input
  // cannot hold a <style>).
  const sheet = doc.createElement("style");
  sheet.textContent = rules;
  return { copy, sheet };
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
  let armFrame = 0;
  /* The lifted copy and its pseudo-elements' rules (at most one). */
  let lifted: { copy: HTMLElement; sheet: HTMLStyleElement } | null = null;

  // The lift waits for full motion, as the sheet's swell does, and for full
  // transparency (the overlay is dimmed under reduced transparency).
  const motion = () =>
    !view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches &&
    !view.matchMedia?.("(forced-colors: active)")?.matches &&
    !view.matchMedia?.("(prefers-reduced-transparency: reduce)")?.matches &&
    doc.documentElement.getAttribute("data-world-effects") !== "economy";

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
    for (const name of ["lg-hold-bloom", "lg-hold-band", "lg-hold-spec", "lg-hold-rim"]) {
      const layer = doc.createElement("i");
      layer.className = name;
      shell.appendChild(layer);
    }
    overlay.append(halo, shell);
    return overlay;
  };

  const dropLift = () => {
    lifted?.copy.remove();
    lifted?.sheet.remove();
    lifted = null;
  };

  const clearTarget = (target: HTMLElement) => {
    for (const name of [HOLD, KIND, RAISE, LIFT]) target.removeAttribute(name);
    for (const prop of PROPS) target.style.removeProperty(prop);
    target.parentElement?.style.removeProperty(PILL_S);
    dropLift();
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
    // Toward the finger, -1..1: the rim's lobe, the caustic and the spill
    // read the direction (the sheet takes its angle with atan2()).
    overlay.style.setProperty("--lg-dx", ((tx / p.width) * 2 - 1).toFixed(2));
    overlay.style.setProperty("--lg-dy", ((ty / p.height) * 2 - 1).toFixed(2));
  };

  /* Ciel's button: its drag (zeus-button.tsx) begins before the hold and
     writes its own `translate` each frame; the light reads that inline
     value (no layout) as it is written and travels with the button, at the
     drag's 1.075 lift. */
  const parseTranslate = (value: string) => {
    const [x = "0", y = "0"] = (value ?? "").trim().split(/\s+/);
    return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
  };
  const carry = (p: Press) => {
    if (!overlay) return;
    const base = parseTranslate(p.target.style.translate);
    const layer = overlay;
    const sync = () => {
      const now = parseTranslate(p.target.style.translate);
      layer.style.setProperty("--lg-hold-mx", `${(now.x - base.x).toFixed(1)}px`);
      layer.style.setProperty("--lg-hold-my", `${(now.y - base.y).toFixed(1)}px`);
    };
    layer.setAttribute("data-carried", "");
    layer.style.setProperty("--lg-hold-mx", "0px");
    layer.style.setProperty("--lg-hold-my", "0px");
    const Observer = view.MutationObserver;
    const watch = Observer ? new Observer(sync) : null;
    watch?.observe(p.target, { attributes: true, attributeFilter: ["style"] });
    p.carried = { ...base, watch };
  };

  const drop = (p: Press) => {
    p.carried?.watch?.disconnect();
    p.carried = null;
    p.moved?.disconnect();
    p.moved = null;
  };

  /* A container carried off by a script (a swipe to close, a dragged sheet)
     would leave the light behind: the hold lets go as soon as an ancestor's
     inline translate or transform changes. Inline values only, no layout. */
  const watchAncestors = (p: Press) => {
    const Observer = view.MutationObserver;
    if (!Observer) return;
    const placed = new Map<Element, string>();
    const where = (el: HTMLElement) => `${el.style.translate}|${el.style.transform}`;
    for (
      let node = p.target.parentElement;
      node && node !== doc.documentElement;
      node = node.parentElement
    )
      placed.set(node, where(node));
    const watch = new Observer((records) => {
      if (press !== p) return;
      for (const record of records) {
        const el = record.target as HTMLElement;
        if (placed.has(el) && placed.get(el) !== where(el)) {
          release();
          return;
        }
      }
    });
    for (const node of placed.keys())
      watch.observe(node, { attributes: true, attributeFilter: ["style"] });
    p.moved = watch;
  };

  /* The timer only arms the hold: it starts on the next frame, after any
     input the browser had queued behind it (a late pointerup ends it). */
  const arm = () => {
    if (!press) return;
    press.timer = 0;
    if (armFrame) view.cancelAnimationFrame(armFrame);
    armFrame = view.requestAnimationFrame(startHold);
  };

  const startHold = () => {
    armFrame = 0;
    const p = press;
    if (!p) return;
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
    let lift = false;
    if (p.kind !== "light") {
      const want = swellFor(width, height);
      const fit = fitScale(box, clip, cx, cy);
      scale = Math.min(want, fit);
      // A clipping ancestor has no room: lift the control into the overlay
      // (only the viewport bounds it there) rather than cap it.
      if (p.kind === "swell" && fit < want - 0.02 && motion() && liftable(target)) {
        const screen = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
        const room = Math.min(want, fitScale(box, screen, cx, cy));
        if (room > scale + 0.02) {
          scale = room;
          lift = true;
          Object.assign(clip, screen);
        }
      }
      if (scale < 1.02) {
        scale = 1;
        lift = false;
      }
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

    // The overlay covers the grown control and its halo, cut to the clip,
    // not the whole clip: a smaller layer to paint and composite. Ciel's
    // button travels with its drag, so its light keeps the whole clip.
    const drags = p.kind === "light" && target.matches(".zeus-button");
    if (!drags) {
      const reach = (Math.max(width, height) * (scale - 1)) / 2 + HALO_PX;
      clip.left = Math.max(clip.left, Math.floor(box.left - reach));
      clip.top = Math.max(clip.top, Math.floor(box.top - reach));
      clip.right = Math.max(clip.left, Math.min(clip.right, Math.ceil(box.right + reach)));
      clip.bottom = Math.max(clip.top, Math.min(clip.bottom, Math.ceil(box.bottom + reach)));
    }
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
    // The corner family (the slabs' squircle), so the light clips to the
    // same outline; an engine without corner-shape reads "" and is round.
    ls.setProperty("--lg-hold-cs", bare ? "round" : style.getPropertyValue("corner-shape") || "round");
    ls.setProperty("--lg-hold-from", from);
    ls.setProperty("--lg-hold-s", scale.toFixed(3));
    // The bloom's reach: past the far corner of a chip, a pool on a card.
    const reach = Math.min(520, Math.max(96, Math.hypot(width, height) * 1.6));
    ls.setProperty("--lg-hold-d", `${Math.ceil(reach)}px`);
    ls.setProperty("--lg-hold-tint", /^\d/.test(tint) ? tint : "190 232 255");
    layer.setAttribute("data-kind", p.kind);
    if (drags) carry(p);
    else layer.removeAttribute("data-carried");
    watchAncestors(p);
    layer.toggleAttribute("data-light", light);
    layer.toggleAttribute("data-bare", bare);
    follow(p, p.x, p.y);

    // Lifted, the copy swells; the control stays at rest, transparent, and
    // keeps the finger and the click.
    target.style.setProperty("--lg-hold-s", lift ? "1" : scale.toFixed(3));
    // The chosen option's pill swells with it (the sheet's segments rule).
    if (!lift && p.kind === "swell") pillOf(target)?.style.setProperty(PILL_S, scale.toFixed(3));
    if (lift) {
      dropLift();
      const made = liftCopy(view, target);
      const c = made.copy.style;
      c.setProperty("position", "absolute");
      c.setProperty("left", `${p.left.toFixed(1)}px`);
      c.setProperty("top", `${p.top.toFixed(1)}px`);
      c.setProperty("right", "auto");
      c.setProperty("bottom", "auto");
      c.setProperty("margin", "0");
      c.setProperty("box-sizing", "border-box");
      c.setProperty("width", `${width}px`);
      c.setProperty("height", `${height}px`);
      c.setProperty("transform", "none");
      c.setProperty("translate", "none");
      c.setProperty("rotate", "none");
      c.setProperty("transform-origin", "50% 50%");
      c.setProperty("scale", from);
      c.setProperty("opacity", "1");
      c.setProperty("visibility", "visible");
      c.setProperty("pointer-events", "none");
      c.setProperty("z-index", "auto");
      c.setProperty("float", "none");
      const shell = layer.querySelector(".lg-hold-shell");
      layer.insertBefore(made.copy, shell);
      layer.appendChild(made.sheet);
      lifted = made;
      target.setAttribute(LIFT, "");
    }
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
      if (press !== p || !overlay) return;
      overlay.setAttribute("data-state", "on");
      if (lifted) {
        lifted.copy.style.setProperty("transition", "scale 0.52s var(--lg-spring)");
        lifted.copy.style.setProperty("scale", scale.toFixed(3));
      }
    });
  };

  /** A tap the browser delivered late: put the light away at once. */
  const abort = (p: Press) => {
    clearTarget(p.target);
    if (overlay) {
      overlay.hidden = true;
      overlay.removeAttribute("data-state");
    }
  };

  const release = (stamp?: number) => {
    const p = press;
    press = null;
    if (!p) return;
    if (p.timer) view.clearTimeout(p.timer);
    if (armFrame) {
      view.cancelAnimationFrame(armFrame);
      armFrame = 0;
    }
    drop(p);
    if (!p.held) return;
    if (frame) {
      view.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (stamp !== undefined && p.stamp > 0 && stamp > 0 && stamp - p.stamp < HOLD_MS) {
      abort(p);
      return;
    }
    p.target.setAttribute(HOLD, "out");
    overlay?.setAttribute("data-state", "out");
    if (lifted) {
      lifted.copy.style.setProperty("transition", "scale var(--lg-spring-ms) var(--lg-spring)");
      lifted.copy.style.setProperty("scale", "1");
    }
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
      stamp: event.timeStamp || 0,
      timer: view.setTimeout(arm, HOLD_MS),
      held: false,
      carried: null,
      moved: null,
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
    // Ciel's button carries its light with its drag (the finger stays put
    // on the button, so the light does too).
    if (p.carried) return;
    follow(p, event.clientX, event.clientY);
  };

  const up = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointerId)
      release(event.type === "pointerup" ? event.timeStamp : undefined);
  };

  // A touch held on a glass control is the hold, not the page's long-press
  // menu (Android raises it at about 500 ms and would end the hold).
  const menu = (event: Event) => {
    if (press?.held && press.pointerType !== "mouse") event.preventDefault();
    else release();
  };

  const cancel = () => release();

  // Something around the control took the finger (the side menu's swipe to
  // close, a rail's pan): the control is carried off under a light that
  // stays put, so the hold lets go. Ciel's button capturing its own drag
  // keeps it (its light rides the drag).
  const captured = (event: PointerEvent) => {
    const p = press;
    if (!p || event.pointerId !== p.pointerId) return;
    const el = event.target as Node | null;
    if (el && el !== p.target && !p.target.contains(el)) release();
  };

  const passive = { capture: true, passive: true } as const;
  const active = { capture: true, passive: false } as const;
  doc.addEventListener("pointerdown", down, passive);
  doc.addEventListener("pointermove", move, passive);
  doc.addEventListener("pointerup", up, passive);
  doc.addEventListener("pointercancel", up, passive);
  doc.addEventListener("gotpointercapture", captured, passive);
  doc.addEventListener("scroll", cancel, passive);
  doc.addEventListener("dragstart", cancel, passive);
  doc.addEventListener("contextmenu", menu, active);
  doc.addEventListener("visibilitychange", cancel);
  view.addEventListener("blur", cancel);

  return () => {
    if (press?.timer) view.clearTimeout(press.timer);
    if (armFrame) view.cancelAnimationFrame(armFrame);
    if (press) {
      drop(press);
      clearTarget(press.target);
    }
    press = null;
    if (releasing) {
      view.clearTimeout(releasing.timer);
      clearTarget(releasing.target);
      releasing = null;
    }
    if (frame) view.cancelAnimationFrame(frame);
    dropLift();
    overlay?.remove();
    overlay = null;
    doc.removeEventListener("pointerdown", down, passive);
    doc.removeEventListener("pointermove", move, passive);
    doc.removeEventListener("pointerup", up, passive);
    doc.removeEventListener("pointercancel", up, passive);
    doc.removeEventListener("gotpointercapture", captured, passive);
    doc.removeEventListener("scroll", cancel, passive);
    doc.removeEventListener("dragstart", cancel, passive);
    doc.removeEventListener("contextmenu", menu, active);
    doc.removeEventListener("visibilitychange", cancel);
    view.removeEventListener("blur", cancel);
  };
}
