// RISING THE WORLD: the image the fire consumes, the armoured rider on the
// night highway (supplied 2026-09-24, kept byte for byte). Compact screens get
// the 683x1024 cut, the size the shader's texture is capped at anyway. The URL
// is chosen once at the press and shared by the portal, the calm tier and the
// shader, so it downloads once. Tiny and dependency-free: the gate imports it
// statically without pulling the engine into the World bundle.
export const RISING_BURN_ART = "/rising-burn-rider-20260924.webp";
export const RISING_BURN_ART_COMPACT = "/rising-burn-rider-20260924-683.webp";

/** Same test as the renderer's pixel budget: a coarse pointer or a narrow window. */
export const risingBurnArt = () =>
  window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 760
    ? RISING_BURN_ART_COMPACT
    : RISING_BURN_ART;
