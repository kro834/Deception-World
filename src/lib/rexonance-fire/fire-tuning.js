// The one table both fire kernels read: the GLSL fragment shader is built
// from these numbers (fire-shaders.js) and the CPU fallback computes the
// same expressions with them (fire-raster.js), so a frame of either path is
// the same closed-form function of (phase, clock).
//
// The look (owner, 2026-10-21, and two reviews of the build): fire on a
// body is mostly what rises off it. Tongues lick up off the shoulders,
// head, arms and feet, hug the limbs' sides, accelerate as they rise,
// stretch, narrow and tear, their tips detaching and vanishing; the sheet
// seen edge-on brightens the silhouette's inner edge and flows as a
// translucent haze over the skin. Every density is smooth (two low-octave
// layers, wide soft bands): no dither, no speckle, no rigid sprite.
//
// Time never multiplies a position-dependent speed: every drift is a
// constant-speed offset wrapped into the noise's period on the CPU
// (fire-pose.js), and the rise accelerates through a static remapping of
// height, so a frame at a clock of hours is as smooth as one at a second.
export const FIRE_TUNING = Object.freeze({
  // The silhouette's anti-aliasing half-width (figure widths, about half a
  // field texel): the skin/air split is smooth however far it is magnified.
  edgeSoft: 0.005,
  // Height above the burning surface, in figure widths: straight up off
  // the body below, sideWeight times the sideways distance off a limb (so
  // licks hug the sides), and floorWeight times the depth under the soles.
  sideWeight: 3.5,
  floorWeight: 14,
  // The plume's reach drifts with a large, slow noise, so tall licks come
  // and go above the crown and shoulders.
  reachBase: 0.28,
  reachVar: 0.75,
  reachScale: 0.6,
  reachSpeed: 0.35,
  // The whole burning body feeds the column above its middle: the merged
  // plume over the head and shoulders reaches farthest.
  columnBoost: 0.55,
  columnWidth: 0.24,
  // The rise: noise flowing up at flowA (tongues) and flowB (their inner
  // turbulence, faster, so a tongue's shape keeps changing as it climbs),
  // accelerating with height (speed × (1 + accel·height)), stretched along
  // the flow; a lateral flutter that grows toward the tips.
  scaleA: 1.25,
  stretchA: 2.4,
  flowA: 1.25,
  scaleB: 2.3,
  stretchB: 1.7,
  flowB: 2.1,
  accel: 4,
  warpScale: 0.9,
  warpSpeed: 0.55,
  warpAmp: 0.16,
  warpBase: 0.25,
  warpLift: 0.05,
  gain: 2.4,
  // The engulf front's irregular, branching edge, the tongues of the fire
  // below it licking up past it (in arrival units), and how the plume
  // above the front has not climbed yet (arrival per width of height).
  edgeScale: 1.3,
  edgeAmp: 0.2,
  edgeSpeed: 0.25,
  tongueRise: 0.2,
  climb: 0.15,
  frontWidth: 0.08,
  ageSpan: 0.35,
  flareGain: 2.5,
  // Plume: a threshold that climbs with height, so only the turbulence's
  // peaks survive as tongues; a crisp-ish core inside a soft halo; hot
  // where the turbulence is strongest, cooling toward the tips.
  thrBase: 0.2,
  thrTop: 1,
  thrCurve: 1.25,
  tipFade: 0.7,
  coreSoft: 0.1,
  haloSoft: 0.16,
  coreWeight: 0.7,
  hotSpan: 0.35,
  tipCool: 0.75,
  // The silhouette seen edge-on (a bright band on the skin's inner edge,
  // broken by the same turbulence) and the translucent sheet over the skin.
  rimWidth: 0.028,
  rimGain: 0.55,
  rimHeat: 0.8,
  // The sheet's own streaks: finer, longer and faster than the plume's
  // tongues, so the fire over the skin reads as flames racing up it, not
  // as blotches; the plume's large shapes still modulate it.
  scaleS: 2.1,
  stretchS: 3.4,
  flowS: 2.4,
  sheetStreak: 0.8,
  sheetThr: 0.4,
  sheetSoft: 0.36,
  sheetHaze: 0.4,
  sheetGain: 0.78,
  sheetHeat: 0.62,
  // Slow hot patches drifting up the body.
  patchScale: 0.9,
  patchSpeed: 0.8,
  patchAmp: 0.32,
  // 8–14 Hz global flicker and local intermittency, calmer once clean.
  flickerGlobal: 0.07,
  flickerLocal: 0.3,
  localScale: 1.1,
  localSpeed: 2.4,
  // The skin's layer split (the plume is all behind the undersuit's draw,
  // outside the figure) and the sooty absorption of the green fire.
  frontShare: 0.65,
  absorbSooty: 0.3,
  absorbClean: 0.05,
  // 爆散: the envelope blows outward and dissolves; a body-shaped shock
  // ring and a flash leave the figure.
  // The blast never lengthens the plume's reach: past FIELD_LIFT (the
  // lift's cap) every column with the body below it would burn to the
  // drawing's top while the air beside it stayed too high to, so the fire
  // stood as a straight-sided pillar on the vertical lines through the
  // body's outermost points (review of 2ce6712). Instead the blast throws
  // the envelope it has outward from the body's middle (rect uv), fastest
  // at the detonation (an ease-out over the dissolve), wider than tall,
  // as it thins away.
  burstExpand: 0.42,
  burstExpandY: 0.16,
  burstCentreU: 0.5,
  burstCentreV: 0.589,
  burstDissolve: 0.4,
  burstSkin: 0.14,
  // The tongues' roots are torn off the skin ragged and soft (figure
  // widths deep inside the thrown silhouette, the turbulence's jag), so the
  // gap the blast opens round the bare undersuit never reads as a
  // silhouette-shaped shadow; the thrown fire fades before whichever edge
  // of the drawing clips first (widths in from the sides, top, bottom).
  burstTear: 0.06,
  burstTearDepth: 0.09,
  burstTearJag: 0.12,
  throwFadeSide: 0.12,
  throwFadeTop: 0.2,
  throwFadeBottom: 0.08,
  // The shock ring is a quick pulse: it sweeps off the figure while it is
  // bright and is gone before the fragments scatter, so it never lingers
  // round the bare undersuit as a ghost outline.
  ringSpeed: 0.8,
  ringDecay: 4,
  ringWidth: 0.04,
  ringWiden: 0.05,
  ringGain: 0.4,
  flashDecay: 18,
  flashReach: 0.22,
  flashGain: 1,
  // The flash and the ring fade out before the fire rect's edges (figure
  // widths in from each side), so the canvas never shows as a lit panel.
  edgeFadeSide: 0.3,
  edgeFadeTop: 0.42,
  edgeFadeBottom: 0.16,
  // Burst fragments read as streaks flung along their velocity (widths per
  // phase unit), thinner than long, shortening as the drag slows them.
  // A streak is no longer than its flight so far: at the detonation's
  // first instant the fragments are points, drawn out over sparkGrow of
  // the burst. The CPU fallback's axis-aligned sparks stay near-square.
  sparkStretch: 0.15,
  sparkMaxStretch: 2.5,
  sparkWidth: 0.5,
  sparkGrow: 0.25,
  rasterSparkStretch: 0.6,
  rasterSparkWidth: 0.75,
});

// Colour stops [t, r, g, b] (0..1), piecewise smooth, over one temperature
// axis. Every stop is a visible flame colour: a tongue's cool fringe is a
// deep saturated green (or the clean fire's pink-violet), never black, and
// it fades through its emission, so the tips read as fire against the dark
// stage. Their additive crossfade passes through teal without a grey
// midpoint (research branch worktree-agent-a30edc20f99f8528a).
export const RAMP_SOOTY = Object.freeze([
  [0, 0.03, 0.26, 0.09],
  [0.3, 0.05, 0.4, 0.13],
  [0.6, 0.2, 0.7, 0.24],
  [0.85, 0.56, 0.94, 0.44],
  [1, 0.88, 1, 0.76],
]);
// Complete combustion (owner): a clear cyan-blue body round a pale bright
// inner cone, with a faint pink-violet fringe; it passes through the suit's
// light blue rgb(150 236 255) on the way to the core.
export const RAMP_CLEAN = Object.freeze([
  [0, 0.42, 0.22, 0.62],
  [0.25, 0.3, 0.36, 0.95],
  [0.55, 0.22, 0.66, 1],
  [0.8, 0.59, 0.925, 1],
  [1, 0.9, 0.98, 1],
]);
// Burst fragments cool from white heat through the suit's light blue
// rgb(150 236 255) into its pale pink rgb(255 143 216): the nanites' tones.
export const RAMP_HEAT = Object.freeze([
  [0, 0.78, 0.42, 0.7],
  [0.3, 1, 0.56, 0.85],
  [0.6, 0.59, 0.93, 1],
  [1, 0.94, 0.98, 1],
]);
