/* ILLUSIONCULUM SAGA's entry transformation: the gate's numbers and words.
   A light module: the route transition screen (load-gate.tsx) reads it on
   every page, so it carries only the calls (the owner's four, verbatim —
   scripts/illusionculum-saga-special-site.test.mjs checks them against the
   record) and the figure (the page's hero file, the link's warmed asset). */

import { ILLUSIONCULUM_ENTRY_CUTOUT } from "./illusionculum-saga-artwork.ts";

/** The gate covers the page this long (the four calls, the figure resolved,
 * the orbs seated, the reactor lit), then reveals it over `reveal`. */
export const ILLUSIONCULUM_ENTRY_TIMINGS = { cover: 3090, reveal: 560 } as const;

export const ILLUSIONCULUM_ENTRY_CALLS = Object.freeze([
  "ULTRA！VINCULUM！",
  "ROLLOUT！",
  "SA-GA！EX！SA-GA！EX！SA-GA！EX！SA-GA！EX！",
  "ILLUSIONCULUM！ILLUSIONCULUM！ILLUSIONCULUM！",
] as const);

export const ILLUSIONCULUM_ENTRY_FIGURE = ILLUSIONCULUM_ENTRY_CUTOUT.src;

/** The bare undersuit the armour locks onto: this suit's (Rexonance's, set
 * into this frame by scripts/build-illusionculum-suit.mjs). */
export const ILLUSIONCULUM_ENTRY_UNDERSUIT = "/illusionculum-suit-20261023/undersuit.webp";
