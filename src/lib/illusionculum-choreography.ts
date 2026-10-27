import type { RexonanceAssemblyPiece } from "./rexonance-resonance.js";

/** Read the completed shell before its keyed approach. Fractions of the
 * existing scroll progress, so reversal and the entry share one pose. */
export const ILLUSIONCULUM_ARMOUR_STAGING = Object.freeze({
  hold: 0.012,
  seat: 0.026,
  lift: 1.65,
  depth: 1.5,
});

/** Gold starts after that shell contacts its seat, including the full
 * desktop/scroll guideway. Thin hanging plates and the helmet stay fixed. */
export function illusionculumPlateDelay(piece: RexonanceAssemblyPiece): number {
  if (
    piece.group === "helm" ||
    piece.group === "tail" ||
    piece.group === "ribbon" ||
    /^tasset/.test(piece.id) ||
    piece.h > 1.85 * piece.w
  )
    return 0;
  return ILLUSIONCULUM_ARMOUR_STAGING.hold + ILLUSIONCULUM_ARMOUR_STAGING.seat - 0.006;
}
