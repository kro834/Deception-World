// One body-space contract for the continuous fire and both nanite engines.
// Preparation samples these paths once; a frame never creates a particle.
const BODY = new Float32Array([
  // x0,y0,x1,y1, half-width, outward normal x/y. Connected at the shoulders
  // and hips, with the real gap between the legs deliberately left empty.
  0.5, 0.09, 0.5, 0.2, 0.024, 1, 0, 0.5, 0.215, 0.5, 0.43, 0.082, 1, 0, 0.307, 0.265, 0.172, 0.55,
  0.024, -0.94, -0.34, 0.69, 0.265, 0.825, 0.55, 0.024, 0.94, -0.34, 0.397, 0.48, 0.267, 0.96,
  0.032, -0.98, -0.2, 0.6, 0.48, 0.73, 0.96, 0.032, 0.98, -0.2,
]);
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);

/** Seed is periodic (0 and 1 agree); invalid input safely samples the head.
 * Returns the supplied buffer: [normalized x, y, outward normal x, y].
 * Sampling the surface's interior, not a halo, means every emitted chip
 * begins inside the same masked fire before moving out into the air. */
export function sampleFlameBirth(seed, out) {
  const s = Number.isFinite(seed) ? ((seed % 1) + 1) % 1 : 0;
  const f = s * 6;
  const i = Math.min(5, Math.floor(f));
  const k = i * 7;
  const t = f - i;
  const across = Math.sin(s * 97.31 + i * 1.7) * BODY[k + 4] * 0.72;
  const nx = i < 2 && Math.sin(s * 157.1) < 0 ? -1 : BODY[k + 5];
  const ny = BODY[k + 6];
  out[0] = BODY[k] + (BODY[k + 2] - BODY[k]) * t + across;
  out[1] = BODY[k + 1] + (BODY[k + 3] - BODY[k + 1]) * t;
  out[2] = nx;
  out[3] = ny;
  return out;
}

/** Shared phase: entry t/2400; scroll (q-.015)/.285. A quiet, local
 * kindle is followed by a fast combustion front, then a long handoff to
 * the machines. No accumulating simulation state: scrubbing is exact. */
export function naniteFlameEnvelope(phase) {
  if (!Number.isFinite(phase) || phase <= 0 || phase >= 1) return 0;
  if (phase < 7 / 60) return 0.09 * smooth(clamp(phase / (7 / 60)));
  if (phase < 0.175) return 0.09 + 0.91 * smooth((phase - 7 / 60) / (0.175 - 7 / 60));
  if (phase < 0.4) return 1;
  return 1 - smooth(clamp((phase - 0.4) / 0.6));
}

/** A single outward detonation, not continuously respawning decorative
 * sparks. The nanite engines take over these same body-space sources. */
export function naniteFlameScatter(phase) {
  if (!Number.isFinite(phase)) return 0;
  return smooth(clamp((phase - 0.16) / 0.2));
}
