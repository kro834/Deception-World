// RISING THE WORLD: the image the fire consumes, the armoured rider on the
// night highway (supplied 2026-09-24, kept byte for byte), plus a 683x1024
// cut. The URL is chosen once at the press and shared by the portal, the calm
// tier and the shader, so it downloads once. Tiny and dependency-free: the
// gate imports it statically without pulling the engine into the World bundle.
export const RISING_BURN_ART = "/rising-burn-rider-20260924.webp";
export const RISING_BURN_ART_COMPACT = "/rising-burn-rider-20260924-683.webp";

// The calm (CSS) tier's sprites, rendered by scripts/render-rising-calm-sprites.mjs:
// three flame frames, the burn-edge strips and the scorch ahead of them (one
// per edge profile, rising-calm.ts), a tileable char texture and a smoke
// billow. Loaded only when that tier shows (or is prepared for).
export const RISING_CALM_FLAMES = [
  "/rising-calm-flame-20260924-1.webp",
  "/rising-calm-flame-20260924-2.webp",
  "/rising-calm-flame-20260924-3.webp",
] as const;
export const RISING_CALM_EDGES = [
  "/rising-calm-edge-20260924.webp",
  "/rising-calm-edge-20260924-b.webp",
] as const;
export const RISING_CALM_SCORCHES = [
  "/rising-calm-scorch-20260924.webp",
  "/rising-calm-scorch-20260924-b.webp",
] as const;
export const RISING_CALM_CHAR = "/rising-calm-char-20260924.webp";
export const RISING_CALM_SMOKE = "/rising-calm-smoke-20260924.webp";

// The cut's width, plus about 5%: a softer upscale than that shows.
const COMPACT_ART_WIDTH = 720;

/**
 * Chosen by the image pixels the screen needs, not by pointer type: the
 * portal and the calm tier show the art cover-fitted (2:3) at the device
 * pixel ratio, so a phone (412 x 915 at 2.6x needs about 1600 px across) and a
 * touch laptop get the full file, and only a small, low-density window gets
 * the cut. Save-Data and 2G ask for the cut too. The shader caps its texture at
 * 1024 px either way.
 */
export const risingBurnArt = () => {
  const coverWidth = Math.max(window.innerWidth, (window.innerHeight * 2) / 3);
  const needed = coverWidth * (window.devicePixelRatio || 1);
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  const frugal = connection?.saveData === true || /(^|-)2g$/.test(connection?.effectiveType ?? "");
  return frugal || needed <= COMPACT_ART_WIDTH ? RISING_BURN_ART_COMPACT : RISING_BURN_ART;
};
