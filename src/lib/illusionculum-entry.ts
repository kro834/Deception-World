/* ILLUSIONCULUM SAGA's entry transformation: the gate's numbers and words.
   A light module: the route transition screen (load-gate.tsx) reads it on
   every page, so it carries only the calls (the owner's four, verbatim —
   scripts/illusionculum-saga-special-site.test.mjs checks them against the
   record) and the figure (the page's hero file, the link's warmed asset). */

import { ILLUSIONCULUM_ENTRY_CUTOUT } from "./illusionculum-saga-artwork.ts";

/** The gate covers the page this long (the four calls, the figure resolved,
 * the orbs seated, the reactor lit), then reveals it over `reveal`. */
export const ILLUSIONCULUM_ENTRY_TIMINGS = { cover: 5300, reveal: 560 } as const;

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

/** Entry and CSS share this elapsed clock, starting only once the renderer
 * is ready. The gate holds for completion even on a cold asset load. */
export const ILLUSIONCULUM_ENTRY_HOLD_MS = 140;
export const ILLUSIONCULUM_ENTRY_CLOCK = Object.freeze([
  [0, 0],
  [360, 0.07],
  [800, 0.16],
  [1430, 0.275],
  [2060, 0.39],
  [2690, 0.505],
  [3320, 0.62],
  [4200, 0.82],
  [4440, 0.86],
  [4740, 0.95],
] as const);

export function illusionculumEntryProgress(elapsed: number): number {
  const clock = ILLUSIONCULUM_ENTRY_CLOCK;
  const ms = Math.max(0, elapsed);
  for (let i = 1; i < clock.length; i += 1) {
    const [t1, p1] = clock[i];
    const [t0, p0] = clock[i - 1];
    if (ms <= t1) return p0 + ((p1 - p0) * (ms - t0)) / (t1 - t0);
  }
  return clock[clock.length - 1][1];
}

/** Original words, with time to read each call and the four assembly beats. */
export const ILLUSIONCULUM_ENTRY_CALL_TIMES = Object.freeze([
  { start: 0, hold: 650, unit: 140 },
  { start: 650, hold: 400, unit: 140 },
  { start: 1050, hold: 2340, unit: 315 },
  { start: 3390, hold: 1350, unit: 360 },
] as const);
