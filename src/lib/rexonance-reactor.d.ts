/** Shared reactor/coil formation phase, clamped and eased to 0..1. */
export function reactorFormation(u: number): number;
/** Isolated artwork coil rotation in radians; exactly zero at/after 1. */
export function reactorCoilAngle(u: number): number;
/** Isolated artwork coil scale; exactly one at/after 1. */
export function reactorCoilScale(u: number): number;
