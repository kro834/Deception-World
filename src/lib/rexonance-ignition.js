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

// Give the vortex a visible rolling interval without compressing or moving
// any authored materialization, docking or final-light choreography relative
// to one another. Wall time continues driving the flame's texture motion.
export const REXONANCE_ENTRY_VORTEX_HOLD_MS = 1000;
const VORTEX_LINGER_FROM = 280;
const VORTEX_LINGER_TO = 420;
const VORTEX_LINGER_SPAN = VORTEX_LINGER_TO - VORTEX_LINGER_FROM;
export function entryCanonicalTime(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (elapsedMs <= VORTEX_LINGER_FROM) return elapsedMs;
  if (elapsedMs >= VORTEX_LINGER_TO + REXONANCE_ENTRY_VORTEX_HOLD_MS)
    return elapsedMs - REXONANCE_ENTRY_VORTEX_HOLD_MS;
  return (
    VORTEX_LINGER_FROM +
    ((elapsedMs - VORTEX_LINGER_FROM) * VORTEX_LINGER_SPAN) /
      (VORTEX_LINGER_SPAN + REXONANCE_ENTRY_VORTEX_HOLD_MS)
  );
}
export function entryElapsedTime(canonicalMs) {
  if (!Number.isFinite(canonicalMs) || canonicalMs <= 0) return 0;
  if (canonicalMs <= VORTEX_LINGER_FROM) return canonicalMs;
  if (canonicalMs >= VORTEX_LINGER_TO) return canonicalMs + REXONANCE_ENTRY_VORTEX_HOLD_MS;
  return (
    VORTEX_LINGER_FROM +
    ((canonicalMs - VORTEX_LINGER_FROM) * (VORTEX_LINGER_SPAN + REXONANCE_ENTRY_VORTEX_HOLD_MS)) /
      VORTEX_LINGER_SPAN
  );
}

// First metal enters the trailing explosion, 72ms before the fire clears.
// Entry uses t/2400; scroll uses (q-.015)/.285, so both scenes retain the
// same causal order even when the reader reverses or jumps the clock.
export const NANITE_FIRE_PHASES = Object.freeze({
  burstStart: 0.175,
  burstEnd: 7 / 30,
  materialStart: 0.22,
  flameEnd: 0.25,
});

/** Start early boot growth just before the flame clears, preserving its
 * final fit and every later window. The first chips still get 60ms to fly. */
export function naniteMaterialLanding(land, fit) {
  if (!Number.isFinite(land) || !Number.isFinite(fit) || fit <= 0) return land;
  const oldFrom = fit - 100;
  const newFrom =
    oldFrom < NANITE_FIRE_PHASES.flameEnd * 2400 + 60
      ? Math.min(fit, NANITE_FIRE_PHASES.materialStart * 2400 + 60)
      : oldFrom;
  return newFrom === oldFrom ? land : newFrom + ((land - oldFrom) * (fit - newFrom)) / 100;
}

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
 * kindle is followed by a rolling vortex and an outward detonation. The
 * last 72ms overlap the first machines; the strong vortex stays fire-only.
 * No accumulating simulation state: scrubbing is exact. */
export function naniteFlameEnvelope(phase) {
  if (!Number.isFinite(phase) || phase <= 0 || phase >= NANITE_FIRE_PHASES.flameEnd) return 0;
  if (phase < 7 / 60) return 0.09 * smooth(clamp(phase / (7 / 60)));
  if (phase < NANITE_FIRE_PHASES.burstStart)
    return 0.09 + 0.91 * smooth((phase - 7 / 60) / (NANITE_FIRE_PHASES.burstStart - 7 / 60));
  return (
    1 -
    smooth(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.flameEnd - NANITE_FIRE_PHASES.burstStart),
    )
  );
}

/** A single outward detonation, not continuously respawning decorative
 * sparks. The nanite engines take over these same body-space sources. */
export function naniteFlameScatter(phase) {
  if (!Number.isFinite(phase)) return 0;
  return smooth(
    clamp(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.burstEnd - NANITE_FIRE_PHASES.burstStart),
    ),
  );
}
