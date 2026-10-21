/* RESONANCE FIELD: the scroll runway's fire mapping, in one place. The
   entry maps its canonical clock to the shared fire phase as t / 2400
   (rexonance-ignition.js); the scroll maps its progress q through these
   two numbers. The owner's new opening (2026-10-21: 「炎がアンダースーツを
   段々と覆っていき、爆散。ナノマシンと化し、そこから装着シークエンスが始まり
   ます。」) gives the engulf a longer runway; the fire engineer's module will
   set the exact mapping, and every scroll-side clock (the swarm's births,
   the field's wake, the scene's flame phase) reads it from here. */

export const REXONANCE_SCROLL_FLAME = Object.freeze({ start: 0.015, span: 0.285 });

/** Progress q → the shared fire phase. */
export const scrollFlamePhase = (q) =>
  (q - REXONANCE_SCROLL_FLAME.start) / REXONANCE_SCROLL_FLAME.span;

/** A fire phase → progress q. */
export const scrollFlameAt = (phase) =>
  REXONANCE_SCROLL_FLAME.start + REXONANCE_SCROLL_FLAME.span * phase;
