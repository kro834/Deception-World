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
  // the body below and sideWeight times the sideways distance off a limb
  // (so licks hug the sides). Under the soles the plume thins as if
  // floorWeight times the depth were height, and fades out on an analytic
  // floor line (floorFrom..floorTo widths below it, ragged by floorJag):
  // the floor never squeezes the turbulence into one-pixel bands, which
  // the field's texel rows cut into a staircase under the soles.
  sideWeight: 3.5,
  floorWeight: 10,
  floorFrom: -0.008,
  floorTo: 0.035,
  floorJag: 0.012,
  // The envelope's rag: the rising turbulence moves the plume's outline in
  // and out by up to ragAmp/2 of height (ragAmp/2/sideWeight widths beside
  // a limb), nothing at the skin (ragRoot of height), so no envelope
  // stands as a straight wall beside the shins or on the vertical lines
  // through the hands, and the tall tongues over the crown have ragged
  // edges.
  ragAmp: 0.65,
  ragRoot: 0.06,
  // ...fading out from ragTop of the plume's reach to its tips.
  ragTop: 0.45,
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
  // the flow; a lateral flutter that grows toward the tips, with a finer
  // flutter (warpFine of it) that bends a tongue's edge along its length.
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
  warpFine: 0.7,
  warpLift: 0.05,
  gain: 2.4,
  // The engulf front's irregular, branching edge (drawn out along the rise
  // by edgeStretch), the tongues of the fire below it licking up past it
  // and the sheet's streaks racing ahead of it (frontLick, in arrival
  // units), and how the plume above the front has not climbed yet
  // (arrival per width of height). Where the front is still kindling
  // (fresh below 1) the plume's and the sheet's thresholds are raised by
  // up to frontThr, so the front advances as ragged tongues, never as a
  // soft rounded blot.
  edgeScale: 1.3,
  edgeAmp: 0.2,
  edgeStretch: 0.45,
  edgeSpeed: 0.25,
  tongueRise: 0.2,
  frontLick: 0.12,
  frontThr: 0.6,
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
  // The tears of the 爆散: the burning shell splits open along the paths
  // the fragments are born on (TEAR_PATHS), so they fly out of continuous
  // incandescent tears, never dotted seams. A hairline at the detonation,
  // a tear opens to tearWidth (half-width, figure widths) by tearOpen of
  // the burst, white at its core inside a cyan halo. Its line is ragged by
  // a noise fixed on the body (tearScale per width, tearStretch along the
  // height): a coarse meander and a fine jag across it (widths), a width
  // that pinches and swells (tearPinch), tapering over tearEnds of its
  // length at both ends. It burns bright until tearHold of the burst and
  // is gone by tearFade, as the fragments leave it.
  tearHair: 0.0028,
  tearWidth: 0.011,
  tearOpen: 0.07,
  tearHalo: 0.03,
  tearScale: 2,
  tearStretch: 0.55,
  tearMeander: 0.05,
  tearJag: 0.016,
  tearPinch: 0.7,
  tearEnds: 0.1,
  tearHold: 0.06,
  tearFade: 0.32,
  tearGain: 1.15,
  tearHaloGain: 0.55,
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
  // The fragments come out of the tears: unseen inside them at the
  // detonation, they show between sparkEmergeFrom and sparkEmergeTo of
  // the burst, as they fly clear.
  sparkEmergeFrom: 0.015,
  sparkEmergeTo: 0.1,
  rasterSparkStretch: 0.6,
  rasterSparkWidth: 0.75,
});

// The paths the fragments are born on (rexonance-ignition.js
// sampleFlameBirth, mirrored here and held to it by the unit tests), in
// normalized body units [x0, y0, x1, y1, half-width]: head, torso, arms,
// legs. A fragment is born within half-width · TEAR_SPREAD of its path.
export const TEAR_PATHS = Object.freeze([
  Object.freeze([0.5, 0.09, 0.5, 0.2, 0.024]),
  Object.freeze([0.5, 0.215, 0.5, 0.43, 0.082]),
  Object.freeze([0.307, 0.265, 0.172, 0.55, 0.024]),
  Object.freeze([0.69, 0.265, 0.825, 0.55, 0.024]),
  Object.freeze([0.397, 0.48, 0.267, 0.96, 0.032]),
  Object.freeze([0.6, 0.48, 0.73, 0.96, 0.032]),
]);
export const TEAR_SPREAD = 0.72;

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
