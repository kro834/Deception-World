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

// The entry stretches the fire's whole run (canonical 0–420 ms) uniformly
// over one extra second, so the engulf climbs the body at one steady pace
// (owner, 2026-10-21: 「炎がアンダースーツを段々と覆っていき、爆散」). Every
// authored materialization, docking and final-light clock after it keeps
// its canonical value; wall time continues driving the flame's texture.
export const REXONANCE_ENTRY_VORTEX_HOLD_MS = 1000;
const VORTEX_LINGER_FROM = 0;
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

// The fire's life in shared phase units (entry t/2400; scroll (q-.015)/.285):
//   0 → kindle   the first licks at the soles grow;
//   kindle → cover   the engulf front climbs the undersuit (feet, legs,
//                    hips, torso, shoulders, arms, crown, hands last) and the
//                    oldest fire burns toward complete combustion;
//   cleanFrom → cleanTo   the colour shifts, sooty green → clean cyan-blue;
//   cover → burstStart   the whole figure is a steady clean torch;
//   burstStart → burstEnd   爆散: the fire detonates outward into fragments;
//   materialStart   the first fragments have cooled into nanite chips;
//   flameEnd   the last fragment is a chip; nothing of the fire remains.
// Entry uses t/2400; scroll uses (q-.015)/.285, so both scenes retain the
// same causal order even when the reader reverses or jumps the clock.
export const NANITE_FIRE_PHASES = Object.freeze({
  kindle: 0.025,
  cleanFrom: 0.095,
  cleanTo: 0.165,
  cover: 0.16,
  burstStart: 0.175,
  burstEnd: 7 / 30,
  materialStart: 0.195,
  flameEnd: 0.25,
});
// The engulf front overshoots the farthest body point (arrival 1) so its
// irregular edge noise cannot leave an unburnt island before the torch.
const COVER_OVERSHOOT = 1.12;
const KINDLE_COVER = 0.06;

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

// Capsules of the default silhouette: the six chip-birth paths, a wider
// head, and the shoulder bars that join the arms to the torso.
const SILHOUETTE = new Float32Array([
  0.5, 0.09, 0.5, 0.2, 0.055, 0.5, 0.215, 0.5, 0.43, 0.082, 0.307, 0.265, 0.172, 0.55, 0.024, 0.69,
  0.265, 0.825, 0.55, 0.024, 0.397, 0.48, 0.267, 0.96, 0.032, 0.6, 0.48, 0.73, 0.96, 0.032, 0.5,
  0.25, 0.307, 0.265, 0.03, 0.5, 0.25, 0.69, 0.265, 0.03,
]);

/** Paints the authored body (capsules along the same paths the chips are
 * born on) as a silhouette alpha into `alpha` (w×h bytes), with the figure
 * occupying the rectangle (x, y, width, height) in that grid. The fire can
 * then burn even when no undersuit image was prepared. */
export function paintBodySilhouette(alpha, w, h, x, y, width, height) {
  const aspect = height / width;
  for (let row = 0; row < h; row += 1) {
    const py = (row + 0.5 - y) / height;
    for (let column = 0; column < w; column += 1) {
      const px = (column + 0.5 - x) / width;
      let best = Infinity;
      for (let k = 0; k < SILHOUETTE.length; k += 5) {
        const ax = SILHOUETTE[k];
        const ay = SILHOUETTE[k + 1];
        const dx = SILHOUETTE[k + 2] - ax;
        const dy = (SILHOUETTE[k + 3] - ay) * aspect;
        const length = dx * dx + dy * dy || 1;
        const t = clamp(((px - ax) * dx + (py - ay) * aspect * dy) / length);
        const ex = px - (ax + dx * t);
        const ey = (py - ay) * aspect - dy * t;
        const distance = Math.sqrt(ex * ex + ey * ey) - SILHOUETTE[k + 4];
        if (distance < best) best = distance;
      }
      alpha[row * w + column] =
        best < 0 ? 255 : best < 0.012 ? Math.round(255 * (1 - best / 0.012)) : 0;
    }
  }
  return alpha;
}

/** Shared phase: entry t/2400; scroll (q-.015)/.285. The fire's overall
 * radiance: it fades in with the kindle, holds through the engulf and the
 * torch, then dies away through the detonation as its fragments cool. The
 * first machines overlap only the declining explosion (at most 0.83).
 * No accumulating simulation state: scrubbing is exact. */
export function naniteFlameEnvelope(phase) {
  if (!Number.isFinite(phase) || phase <= 0 || phase >= NANITE_FIRE_PHASES.flameEnd) return 0;
  if (phase < NANITE_FIRE_PHASES.kindle) return smooth(phase / NANITE_FIRE_PHASES.kindle);
  if (phase < NANITE_FIRE_PHASES.burstStart) return 1;
  return (
    1 -
    smooth(
      (phase - NANITE_FIRE_PHASES.burstStart) /
        (NANITE_FIRE_PHASES.flameEnd - NANITE_FIRE_PHASES.burstStart),
    )
  );
}

/** How far the engulf front has climbed, in arrival units (0 = the soles,
 * 1 = the farthest body point, the hands and crown). Monotone, continuous,
 * and closed-form: a reversed clock retreats over the very same frames. */
export function naniteEngulf(phase) {
  if (!Number.isFinite(phase) || phase <= 0) return 0;
  const P = NANITE_FIRE_PHASES;
  if (phase < P.kindle) return KINDLE_COVER * smooth(phase / P.kindle);
  if (phase < P.cover)
    return (
      KINDLE_COVER + (COVER_OVERSHOOT - KINDLE_COVER) * ((phase - P.kindle) / (P.cover - P.kindle))
    );
  // Still creeping over the torch: no frozen front while the colour turns.
  return COVER_OVERSHOOT + 0.08 * clamp((phase - P.cover) / (P.burstStart - P.cover));
}

/** 0 = the sooty forest-green diffusion fire, 1 = complete combustion: a
 * transparent cyan-blue mantle round a pale inner cone. The whole fire has
 * turned before the detonation, which is clean by definition. */
export function naniteCombustion(phase) {
  if (!Number.isFinite(phase)) return 0;
  const P = NANITE_FIRE_PHASES;
  if (phase >= P.burstStart) return 1;
  return smooth(clamp((phase - P.cleanFrom) / (P.cleanTo - P.cleanFrom)));
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

// Fragments of the detonation: closed-form trajectories in normalized body
// space (x over the figure's width, y over its height; velocities in those
// units per phase unit). Seeds are periodic and share sampleFlameBirth with
// the nanite engines, so a chip can be born exactly where its fragment cools.
export const NANITE_FIRE_FRAGMENTS = 144;
const FRAGMENT_DRAG = 4.5;
const FRAGMENT_SETTLE = 1 - Math.exp(-FRAGMENT_DRAG);
const BODY_ASPECT = 1040 / 571;
// A pure function of the seed (no random state): each fragment's jitter.
const fragmentJitter = (seed, salt) => {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Pose of one burst fragment: out = [x, y, vx, vy, heat, size].
 * Before burstStart it rests, cold, at its birth point on the burning body
 * (heat 0). From burstStart it is flung outward and upward with drag, white
 * hot, cooling through the suit's cyan and pink; heat reaches 0 at its own
 * cooling time, between materialStart and flameEnd, where a nanite chip is
 * born carrying this velocity. Size is in units of the figure's width. */
export function fireFragmentPose(seed, phase, out) {
  const s = Number.isFinite(seed) ? ((seed % 1) + 1) % 1 : 0;
  sampleFlameBirth(s, out);
  const bx = out[0];
  const by = out[1];
  const nx = out[2];
  const ny = out[3];
  const h1 = fragmentJitter(s, 1.3);
  const h2 = fragmentJitter(s, 2.7);
  const h3 = fragmentJitter(s, 3.9);
  const h4 = fragmentJitter(s, 5.1);
  const P = NANITE_FIRE_PHASES;
  const span = P.flameEnd - P.burstStart;
  const u = Number.isFinite(phase) ? clamp((phase - P.burstStart) / span) : 0;
  // Outward along the surface normal, lifted, with a tangential scatter.
  let dx = nx * (0.55 + 0.45 * h1) - ny * (h2 - 0.5) * 0.9;
  let dy = ny * (0.55 + 0.45 * h1) + nx * (h2 - 0.5) * 0.9 - (0.75 + 0.55 * h3);
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= length;
  dy /= length;
  const travel = 0.14 + 0.26 * h4;
  const decay = Math.exp(-FRAGMENT_DRAG * u);
  const along = (travel * (1 - decay)) / FRAGMENT_SETTLE;
  const rate = (travel * FRAGMENT_DRAG * decay) / FRAGMENT_SETTLE / span;
  // Gravity sags the slower, heavier fragments (W units, then to H units).
  const sag = 0.05 * u * (2 - u);
  out[0] = bx + dx * along;
  out[1] = by + (dy * along + sag) / BODY_ASPECT;
  out[2] = u > 0 && u < 1 ? dx * rate : 0;
  out[3] = u > 0 && u < 1 ? (dy * rate + (0.1 * (1 - u)) / span) / BODY_ASPECT : 0;
  const cool =
    (P.materialStart - P.burstStart) / span + h2 * (1 - (P.materialStart - P.burstStart) / span);
  out[4] = u > 0 ? Math.pow(clamp(1 - u / cool), 0.8) : 0;
  out[5] = (0.02 + 0.016 * h3) * (1 - 0.45 * u);
  return out;
}
