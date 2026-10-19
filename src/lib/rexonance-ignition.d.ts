export const NANITE_FIRE_PHASES: Readonly<{
  burstStart: number;
  burstEnd: number;
  materialStart: number;
}>;
export function naniteMaterialLanding(land: number, fit: number): number;
export function sampleFlameBirth<T extends Float32Array | Float64Array>(seed: number, out: T): T;
export function naniteFlameEnvelope(phase: number): number;
export function naniteFlameScatter(phase: number): number;
