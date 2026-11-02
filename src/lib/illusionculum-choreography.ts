import type { RexonanceAssemblyPiece } from "./rexonance-resonance.js";

/** Read the completed shell before its keyed approach. Fractions of the
 * existing scroll progress, so reversal and the entry share one pose.
 * Round 2 (2026-11-01, owner: 「装着アニメーションを大きく改善して」): each
 * plate is built by the nanites far off the body (7x the engine's lift, 3x
 * its depth), held there to be read, then driven home in a short stroke
 * (~100 ms on the entry clock) that ends on the director's hit
 * (illusionculum-assembly-accents.ts; the flights table,
 * scripts/build-illusionculum-flights.mjs, follows these numbers). */
export const ILLUSIONCULUM_ARMOUR_STAGING = Object.freeze({
  hold: 0.022,
  seat: 0.018,
  lift: 7,
  depth: 3,
});

/** The in-page SCROLL suit-up's staging. Owner (2026-11-03): 「スクロール変身
 * アニメーションは、もとの体がガタガタしないタイプにもどして。」 — the scroll is
 * back on the pre-round-2 staging (64320aef): each shell a short lift off
 * its seat (1.65x the engine's), a brief hold, a slow continuous seat. The
 * round-2 staging above stays on the entry (and the lab). */
export const ILLUSIONCULUM_SCROLL_STAGING = Object.freeze({
  hold: 0.012,
  seat: 0.026,
  lift: 1.65,
  depth: 1.5,
});

/** A staging as the nanite engine reads it (planAssemblyNanites). */
export type IllusionculumStaging = {
  readonly hold: number;
  readonly seat: number;
  readonly lift: number;
  readonly depth: number;
};

/** Gold starts after that shell contacts its seat, including the full
 * desktop/scroll guideway. Thin hanging plates and the helmet stay fixed. */
export function illusionculumPlateDelay(piece: RexonanceAssemblyPiece): number {
  return illusionculumPlateDelayFor(ILLUSIONCULUM_ARMOUR_STAGING)(piece);
}

/** The same gold delay for a given staging (the scroll's, the entry's). */
export const illusionculumPlateDelayFor =
  (staging: IllusionculumStaging) =>
  (piece: RexonanceAssemblyPiece): number => {
    if (
      piece.group === "helm" ||
      piece.group === "tail" ||
      piece.group === "ribbon" ||
      /^tasset/.test(piece.id) ||
      piece.h > 1.85 * piece.w
    )
      return 0;
    return staging.hold + staging.seat - 0.006;
  };
