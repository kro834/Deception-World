export const NANITE_FIRE_PHASES: Readonly<{
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
export function naniteFlameScatter(phase: number): number;
