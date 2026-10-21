/* RESONANCE FIELD: the entry call's score, from the pinned call tables
   (rexonance-calls: the fits, the DEUS！ accents, the light-up) and the
   plates' seats. Canonical ms on the overlay's clock; the clocks themselves
   are unchanged. */

import {
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_LIGHT,
  REXONANCE_SUIT_SNAP,
} from "../rexonance-calls.ts";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../rexonance-suit.ts";
import { FIELD_WAKE, fieldScore } from "./index.js";
import type { FieldScore } from "./index.js";

/** The entry's fire phase is its canonical clock over this from the burst
 * on, where the wake begins (rexonance-ignition.js: entryFlamePhase). */
const ENTRY_FLAME_MS = 2400;

/** The groups the field converges on, in the fixed fit order: the cascade's
 * groups, the ribbons folded into the tail's. */
const GROUPS: readonly (readonly string[])[] = [
  ["legs"],
  ["waist"],
  ["arms"],
  ["chest"],
  ["shoulders"],
  ["tail", "ribbon"],
  ["helm"],
];
/** The strength of each group's lock: the DEUS！ accents whip hardest. */
const STRENGTH: Readonly<Record<string, number>> = {
  legs: 1,
  waist: 0.85,
  arms: 1,
  chest: 1.1,
  shoulders: 0.6,
  tail: 0.55,
  helm: 0.5,
};
/** From the helmet's clamp the field implodes into the reactor, and
 * detonates out of it with the light (REXONANCE DEUS！); gone before the
 * light's bloom settles, long before the cover. */
export const REXONANCE_FIELD_ENTRY = Object.freeze({
  collapse: [REXONANCE_SUIT_SNAP.helm, REXONANCE_SUIT_LIGHT.from] as const,
  detonate: [REXONANCE_SUIT_LIGHT.from, REXONANCE_SUIT_LIGHT.from + 420] as const,
  impulse: 260,
});

const extent = (ids: readonly string[]) => {
  const pieces = REXONANCE_SUIT_PIECES.filter((piece) => ids.includes(piece.group));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let sx = 0;
  let sy = 0;
  for (const piece of pieces) {
    x0 = Math.min(x0, piece.x);
    y0 = Math.min(y0, piece.y);
    x1 = Math.max(x1, piece.x + piece.w);
    y1 = Math.max(y1, piece.y + piece.h);
    sx += piece.seat[0];
    sy += piece.seat[1];
  }
  const n = Math.max(1, pieces.length);
  return {
    x: sx / n,
    y: sy / n,
    sx: Math.max(0, (x1 - x0) / 2 - 40),
    sy: Math.max(0, (y1 - y0) / 2 - 30),
  };
};

let SCORE: FieldScore | undefined;
/** The entry's score, built once. */
export function entryFieldScore() {
  if (SCORE) return SCORE;
  const groups = GROUPS.map((ids) => {
    const cascades = REXONANCE_SUIT_CASCADE.filter((cascade) => ids.includes(cascade.group));
    const from = Math.min(...cascades.map((cascade) => cascade.from));
    const lock = Math.max(
      ...cascades.flatMap((cascade) => cascade.order.map((id) => REXONANCE_SUIT_FIT[id])),
    );
    return { ...extent(ids), from, lock, strength: STRENGTH[ids[0]] ?? 0.7 };
  });
  SCORE = fieldScore({
    // The wake is the burst (owner, 2026-10-21: the fire engulfs the
    // undersuit, bursts, and its fragments are the nanites): the field's
    // one window of the fire's phase (from the detonation, through every
    // fragment's cooling into a chip, to the last chip's sweep onto its
    // line) on the entry's canonical clock.
    wake: [FIELD_WAKE[0] * ENTRY_FLAME_MS, FIELD_WAKE[1] * ENTRY_FLAME_MS],
    groups,
    collapse: [...REXONANCE_FIELD_ENTRY.collapse],
    detonate: [...REXONANCE_FIELD_ENTRY.detonate],
    end: REXONANCE_FIELD_ENTRY.detonate[1],
    impulse: REXONANCE_FIELD_ENTRY.impulse,
    origin: [...REXONANCE_SUIT_MARKS.core],
    // Woken, the field cocoons the whole body: the reactor's height to the
    // soles, a little past the shoulders.
    spread: [REXONANCE_SUIT_SIZE.width * 0.2, REXONANCE_SUIT_SIZE.height * 0.36],
    settle: 0.55,
  });
  return SCORE;
}

export const REXONANCE_FIELD_FIGURE = REXONANCE_SUIT_SIZE;
