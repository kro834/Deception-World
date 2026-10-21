/* RESONANCE FIELD: the fire's clocks, in one place. The entry maps its
   canonical clock to the shared fire phase as t / 2400 (rexonance-
   ignition.js); the scroll maps its progress q through REXONANCE_SCROLL_
   FLAME; and the field's wake (the burst's fragments becoming the field) is
   one window of that phase both scenes read. The owner's new opening
   (2026-10-21: 「炎がアンダースーツを段々と覆っていき、爆散。ナノマシンと化し、
   そこから装着シークエンスが始まります。」) gives the engulf a long runway:
   every scroll-side clock (the swarm's births, the field's wake, the scene's
   flame phase) reads it from here. */

import { NANITE_FIRE_PHASES } from "../rexonance-ignition.js";

/** The scroll's fire: q .02 → phase 0 (the first licks), the engulf climbs
 * the undersuit over the scan and the motes' beat (cover at q ≈ .097), the
 * detonation at q ≈ .104–.132, the first chips at q ≈ .114, nothing of the
 * fire by q ≈ .14, well before the first group lands (ASSEMBLY_BEATS.deus
 * at .16). */
export const REXONANCE_SCROLL_FLAME = Object.freeze({ start: 0.02, span: 0.48 });

/** Progress q → the shared fire phase. */
export const scrollFlamePhase = (q) =>
  (q - REXONANCE_SCROLL_FLAME.start) / REXONANCE_SCROLL_FLAME.span;

/** A fire phase → progress q. */
export const scrollFlameAt = (phase) =>
  REXONANCE_SCROLL_FLAME.start + REXONANCE_SCROLL_FLAME.span * phase;

/** The share of the field's wake over which its particles are born: the
 * fire's fragments cool (materialStart → flameEnd) within the wake's first
 * half, and the last chip has the other half to fly and take its line. */
export const FIELD_WAKE_BIRTHS = 0.5;

/** The field's wake in fire phase units: from the detonation (every
 * fragment flies, white hot, drawn by the fire) to the last chip's sweep
 * onto its line. Each scene maps it through its own clock (the entry ×
 * 2400 ms, the scroll through scrollFlameAt). */
export const FIELD_WAKE = Object.freeze([
  NANITE_FIRE_PHASES.burstStart,
  NANITE_FIRE_PHASES.burstStart +
    (NANITE_FIRE_PHASES.flameEnd - NANITE_FIRE_PHASES.burstStart) / FIELD_WAKE_BIRTHS,
]);
