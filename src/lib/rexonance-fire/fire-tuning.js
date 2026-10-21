// The one table both fire kernels read: the GLSL fragment shader is built
// from these numbers (fire-shaders.js) and the CPU fallback computes the
// same expressions with them (fire-raster.js), so a frame of either path is
// the same closed-form function of (phase, seed); the clock only flickers.
export const FIRE_TUNING = Object.freeze({
  // Height above the surface, in figure widths: flames rise, so vertical
  // distance to the body below counts once and sideways distance counts
  // sideWeight times. Plume heights vary with a large slow noise.
  sideWeight: 2.6,
  reachUp: 0.16,
  reachUpNoise: 0.5,
  // Upward advection of the turbulence (widths per second), accelerating
  // with height; the noise is stretched vertically and gently warped.
  flowBase: 0.7,
  flowAccel: 0.7,
  noiseScale: 1,
  stretch: 2.2,
  warpScale: 0.55,
  warpAmp: 0.09,
  warpSpeed: 0.16,
  // The engulf front's irregular, branching edge.
  edgeScale: 2.2,
  edgeAmp: 0.16,
  edgeSpeed: 0.12,
  frontWidth: 0.07,
  ageSpan: 0.35,
  // Density: contrast-boosted noise minus height; a sharp base and a
  // soft, torn top; the skin keeps holes the suit shows through.
  gain: 1.9,
  bias: 0.12,
  biasSkin: 0.4,
  fall: 0.72,
  softBase: 0.12,
  softTop: 0.3,
  // Temperature: hot at the base, cool at the tips, patchy over the skin.
  tipCool: 0.65,
  patch: 0.45,
  patchScale: 1.6,
  patchSpeed: 1.2,
  // 8–14 Hz global flicker and fast local intermittency.
  flickerGlobal: 0.1,
  flickerLocal: 0.3,
  localScale: 2.5,
  localSpeed: 3.5,
  // The silhouette's edge-on brightening and the skin/plume layer split.
  rim: 0.03,
  rimGain: 0.18,
  frontShare: 0.7,
  // Sooty absorption of the green fire (clean fire is nearly transparent).
  absorbSooty: 0.45,
  absorbClean: 0.06,
  // 爆散: the envelope blows outward and dissolves; a body-shaped shock
  // ring and a flash leave the figure.
  burstReach: 2,
  burstDissolve: 0.5,
  ringSpeed: 0.55,
  ringWidth: 0.018,
  ringWiden: 0.03,
  flashDecay: 18,
  flashReach: 0.25,
});

// Colour stops [t, r, g, b] (0..1), piecewise smooth. Both ramps share the
// temperature axis, so their additive crossfade passes through teal without
// a grey midpoint (research branch worktree-agent-a30edc20f99f8528a).
export const RAMP_SOOTY = Object.freeze([
  [0, 0, 0, 0],
  [0.22, 0.012, 0.149, 0.071],
  [0.48, 0.071, 0.463, 0.157],
  [0.72, 0.329, 0.839, 0.275],
  [0.9, 0.698, 0.98, 0.471],
  [1, 0.894, 1, 0.769],
]);
export const RAMP_CLEAN = Object.freeze([
  [0, 0, 0, 0],
  [0.22, 0.21, 0.09, 0.35],
  [0.46, 0.09, 0.33, 0.92],
  [0.7, 0.24, 0.68, 1],
  [0.9, 0.66, 0.9, 1],
  [1, 0.93, 0.98, 1],
]);
// Burst fragments cool from white heat through the suit's light blue
// rgb(150 236 255) into its pale pink rgb(255 143 216): the nanites' tones.
export const RAMP_HEAT = Object.freeze([
  [0, 0.78, 0.42, 0.7],
  [0.3, 1, 0.56, 0.85],
  [0.6, 0.59, 0.93, 1],
  [1, 0.94, 0.98, 1],
]);
