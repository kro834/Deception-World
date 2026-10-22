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
export const REXONANCE_ENTRY_VORTEX_HOLD_MS: 360;
export function entryCanonicalTime(elapsedMs: number): number;
export function entryElapsedTime(canonicalMs: number): number;
/** The entry's undersuit scan: canonical from/span (ms), and the
 * stylesheet's own delay (elapsed ms). */
export const REXONANCE_ENTRY_SCAN: Readonly<{ delay: number; from: number; span: number }>;
/** Canonical ms at which the scan has revealed the whole undersuit. */
export const REXONANCE_ENTRY_SCAN_END: number;
/** The entry's fire phase at canonical ms: 0 until the scan's end, then
 * burstStart at canonical 420, and t / 2400 from there on. */
export function entryFlamePhase(canonicalMs: number): number;
/** Inverse of entryFlamePhase (a phase of 0 or less: the scan's end). */
export function entryFlameTime(phase: number): number;
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
export function paintBodySilhouette<T extends Uint8Array | Uint8ClampedArray>(
  alpha: T,
  w: number,
  h: number,
  x: number,
  y: number,
  width: number,
  height: number,
): T;
