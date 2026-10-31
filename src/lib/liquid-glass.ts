// Liquid glass: the buttons' optional material (src/styles-liquid-glass.css).
//
// The side menu's option sets html[data-button-style="liquid"] (persisted
// under "dw-button-style", applied before the first paint). This module is
// the material's script half, used by src/components/liquid-glass-defs.tsx
// only while the option is on:
// - the lens: two displacement maps (a capsule and a round one) for the SVG
//   filters the sheet names with backdrop-filter: url(#…);
// - lensSupported(): whether this engine draws url() in backdrop-filter
//   (Chromium). Elsewhere html[data-liquid-lens] stays off and the glass is
//   blur and specular alone;
// - watchLiquidPointer(): the pointer light, for a mouse or trackpad only.

export const BUTTON_STYLE_ATTRIBUTE = "data-button-style";
export const LIQUID_BUTTON_STYLE = "liquid";
export const LIQUID_LENS_ATTRIBUTE = "data-liquid-lens";

/** The controls that wear the glass: the sheet's `lg:targets` list. */
export const LIQUID_GLASS_TARGETS = [
  ".topbar nav a",
  '.side-panel-trigger:not(:is([data-ipad-menu="compact"], [data-phone-landscape-menu="true"]) *)',
  ".manager-back",
  ".dream-back-link",
  ".rxs-footer-return",
  ".primary-action",
  ".poster-shuffle",
  ".poster-reset",
  ".poster-lock",
  ".episode-controls button",
  ".cine-btn",
  ".cine-skip",
  ".rw-skip",
  ".rw-replay",
  ".rw-redive-button",
  ".ios-slide-open",
  ".episode-pickup-plus",
  ".side-panel-close",
  ".site-announcement-close",
  ".form-pickup-close",
  ".form-pickup-end-close",
  ".rider-nightmare-dialog-close",
  ".world-column-dialog-close",
  ".episode-pickup-close",
  ".rw-close",
  ".dream-dossier-close",
  ".quick-search-close",
  ".rider-special-site-link",
  ".command-deck-header-nav a",
  ".command-deck-scene-buttons > a",
  ".command-deck-enter",
  ".command-deck-down",
  ".command-deck-art-controls",
  ".command-deck-gallery-link",
  ".zeus-button",
  ".rxs-local-nav nav a",
  ".rxe-hero-primary",
  ".rxe-hero-secondary",
  ".exo-door",
  ".opening-notice .opening-notice-close",
] as const;

const TARGET_SELECTOR = LIQUID_GLASS_TARGETS.join(", ");

/* A displacement map: red bends x, green bends y, mid-grey rests. Each
   gradient runs from 1 at the near edge to 0 at the far one, so every rim
   samples inward (nothing is pulled in from outside the control's box), and
   a blurred mid-grey slab keeps the middle still. Stretched over the box. */
function displacementMap(width: number, height: number, inset: number, blur: number) {
  const r = (height - inset * 2) / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>` +
    `<linearGradient id="x"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<linearGradient id="y" x2="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset="1" stop-color="#000"/></linearGradient>` +
    `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="url(#x)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#y)" style="mix-blend-mode:screen"/>` +
    `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${r}" fill="#808000" filter="url(#b)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The capsule: chips, pills and plates (about 3:1). */
export const LENS_MAP_CAPSULE = displacementMap(192, 64, 11, 6);
/** The round one: icon buttons and Ciel's button. */
export const LENS_MAP_ROUND = displacementMap(64, 64, 11, 6);

/**
 * Whether the engine draws an SVG filter in backdrop-filter. Chromium does;
 * WebKit (every iOS browser) and Gecko parse it but draw nothing, which would
 * also drop the blur, so they keep the blur-only glass.
 */
export function lensSupported(win: Window & typeof globalThis = window) {
  try {
    const nav = win.navigator as Navigator & { userAgentData?: { brands?: unknown[] } };
    if (!nav.userAgentData || !Array.isArray(nav.userAgentData.brands)) return false;
    return win.CSS?.supports?.("backdrop-filter", "url(#a) blur(1px)") ?? false;
  } catch {
    return false;
  }
}

/** Whether the option is on (the attribute the side menu writes). */
export function liquidButtonsOn(doc: Document = document) {
  return doc.documentElement.getAttribute(BUTTON_STYLE_ATTRIBUTE) === LIQUID_BUTTON_STYLE;
}

const POINTER_PROPS = ["--lg-px", "--lg-py", "--lg-lx", "--lg-ly"] as const;

/**
 * The pointer light: over a glass control, the inner pool follows the
 * pointer (--lg-px/--lg-py) and the rim is lit from its side (--lg-lx/
 * --lg-ly, -1..1). Mouse and trackpad only, one control at a time, written
 * once per frame. Returns a disposer.
 */
export function watchLiquidPointer(doc: Document = document) {
  const view = doc.defaultView;
  if (!view?.matchMedia) return () => {};
  const fine = view.matchMedia("(hover: hover) and (pointer: fine)");
  let current: HTMLElement | null = null;
  let frame = 0;
  let x = 0;
  let y = 0;

  const clear = () => {
    if (current) for (const prop of POINTER_PROPS) current.style.removeProperty(prop);
    current = null;
  };

  const paint = () => {
    frame = 0;
    if (!current) return;
    const box = current.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const px = Math.min(1, Math.max(0, (x - box.left) / box.width));
    const py = Math.min(1, Math.max(0, (y - box.top) / box.height));
    current.style.setProperty("--lg-px", `${(px * 100).toFixed(1)}%`);
    current.style.setProperty("--lg-py", `${(py * 100).toFixed(1)}%`);
    // The light sits where the pointer is: the rim nearest it is lit.
    current.style.setProperty("--lg-lx", (px * 2 - 1).toFixed(2));
    current.style.setProperty("--lg-ly", Math.min(py * 2 - 1, -0.35).toFixed(2));
  };

  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !fine.matches) return;
    const target =
      event.target instanceof view.Element ? event.target.closest(TARGET_SELECTOR) : null;
    if (target !== current) {
      clear();
      current = target instanceof view.HTMLElement ? target : null;
    }
    if (!current) return;
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = view.requestAnimationFrame(paint);
  };

  const leave = (event: PointerEvent) => {
    if (current && (!event.relatedTarget || !current.contains(event.relatedTarget as Node)))
      clear();
  };

  const options = { capture: true, passive: true } as const;
  doc.addEventListener("pointermove", move, options);
  doc.addEventListener("pointerout", leave, options);
  return () => {
    if (frame) view.cancelAnimationFrame(frame);
    clear();
    doc.removeEventListener("pointermove", move, options);
    doc.removeEventListener("pointerout", leave, options);
  };
}
