// The two opening logos, alpha-keyed from the supplied glow-on-black artwork
// (scripts/build-opening-logos.mjs). The ice logo is the first title; the
// prism logo emerges from its burn and stays. One srcset and sizes pair is
// shared by the route preload, every <img> layer, the handoff and the WebGL
// passes, so a device fetches one candidate of each logo, once.

const WIDTHS = [640, 960, 1280, 1536] as const;

function delivery(stem: string) {
  return {
    src: `/${stem}-delivery-1536.webp`,
    srcSet: WIDTHS.map((width) => `/${stem}-delivery-${width}.webp ${width}w`).join(", "),
  };
}

/** The layout width of `.cine-title-lockup`, as an image `sizes` value. */
export const OPENING_LOGO_SIZES = "min(1120px, 92vw, 117vh)";
export const OPENING_LOGO_WIDTH = 1536;
export const OPENING_LOGO_HEIGHT = 1024;

export const OPENING_LOGO_FIRST = delivery("logo-title-saga-20261016");
export const OPENING_LOGO_FINAL = delivery("logo-title-saga-20261016");
