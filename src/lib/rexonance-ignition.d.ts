export const NANITE_FIRE_PHASES: Readonly<{
  kindle: number;
  cleanFrom: number;
  cleanTo: number;
  cover: number;
  burstStart: number;
  burstEnd: number;
  materialStart: number;
  flameEnd: number;
}>;
export function naniteMaterialLanding(land: number, fit: number): number;
export const REXONANCE_ENTRY_VORTEX_HOLD_MS: 1000;
export function entryCanonicalTime(elapsedMs: number): number;
export function entryElapsedTime(canonicalMs: number): number;
export function sampleFlameBirth<T extends Float32Array | Float64Array>(seed: number, out: T): T;
export function naniteFlameEnvelope(phase: number): number;
export function naniteEngulf(phase: number): number;
export function naniteCombustion(phase: number): number;
export function naniteFlameScatter(phase: number): number;
export const NANITE_FIRE_FRAGMENTS: 144;
/** out = [x, y, vx, vy, heat, size] in normalized body space (x over the
 * figure's width, y over its height; velocity per phase unit; size in
 * widths). Heat is 0 before burstStart and again once the fragment has
 * cooled into a nanite chip, between materialStart and flameEnd. */
export function fireFragmentPose<T extends Float32Array | Float64Array>(
  seed: number,
  phase: number,
  out: T,
): T;
export const REXONANCE_ENTRY_AFTERBURN: Readonly<{ from: number; to: number }>;
export const REXONANCE_SCROLL_AFTERBURN: Readonly<{ from: number; to: number }>;
export const NANITE_AFTERBURN: Readonly<{ rise: number; fade: number }>;
export function naniteAfterburnProgress(
  value: number,
  window: Readonly<{ from: number; to: number }>,
): number;
/** Retired: always 0. */
export function naniteAfterburnEnvelope(burn?: number): number;
/** Retired: always 0. */
export function naniteAfterburnQuench(burn?: number, y?: number): number;
