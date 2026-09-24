// RISING THE WORLD: the storyboard, the shader's uniform schedule and the tier
// choice. Pure and dependency-free, so node:test can import it directly.

export type RisingTier = "webgl" | "css" | "reduced";

type TierTiming = {
  portal: number;
  breakthrough: number;
  burnStart: number;
  title: number;
  burnEnd: number;
  settle: readonly [number, number];
  fade: readonly [number, number];
  end: number;
};

/** Seconds from the moment the sequence clock starts. */
export const RISING_TIMING: Record<RisingTier, TierTiming> = {
  webgl: {
    portal: 0.42,
    breakthrough: 2.05,
    burnStart: 2.25,
    title: 4.5,
    burnEnd: 8.0,
    settle: [7.5, 8.9],
    fade: [8.9, 9.6],
    end: 9.6,
  },
  css: {
    portal: 0.42,
    breakthrough: 2.2,
    burnStart: 2.2,
    title: 4.2,
    burnEnd: 6.9,
    settle: [6.6, 7.3],
    fade: [7.0, 7.7],
    end: 7.7,
  },
  reduced: {
    portal: 0,
    breakthrough: 0,
    burnStart: 0.8,
    title: 2.0,
    burnEnd: 2.0,
    settle: [0.8, 2.0],
    fade: [0.8, 2.0],
    end: 2.6,
  },
};

/**
 * The flashback (rising-art.ts RISING_FLASHBACK): scenes that come and go over
 * the dive and the burn, under the title once it cuts in, and gone before the
 * print has burned away. Each scene fades in over one step and out over the
 * next while the following one comes up, so the picture is always a
 * cross-fade, never a cut. A scene comes up every 0.42-0.45 s; with the
 * scenes' grade that keeps every spot at one flash a second (the RISING flash
 * audit, scripts/verify-rising-world.mjs).
 */
export const RISING_FLASHBACK_WINDOW: Record<
  Exclude<RisingTier, "reduced">,
  readonly [number, number]
> = {
  webgl: [0.3, 5.7],
  css: [0.3, 5.4],
};
/** The layer's opacity at full: the scenes stay a memory over the fire. */
export const RISING_FLASHBACK_OPACITY = 0.85;

/** Pure: when scene `index` of `count` fades in, peaks and fades out (seconds). */
export function risingFlashbackSlot(
  tier: Exclude<RisingTier, "reduced">,
  index: number,
  count: number,
) {
  const [start, end] = RISING_FLASHBACK_WINDOW[tier];
  const step = (end - start) / (count + 1);
  const from = start + index * step;
  return { from, peak: from + step, to: from + 2 * step, step };
}

/**
 * The burning image is framed like object-fit: cover with this object-position
 * (x, y as fractions) everywhere it appears: the portal, the calm tier and the
 * shader's first frame. Portrait phones see the whole height; landscape
 * screens keep the rider's crest and chest instead of the belt.
 */
export const RISING_WORLD_POSITION = [0.5, 0.1] as const;

/** Width / height of the burning image (1024 x 1536, and its 683 x 1024 cut). */
export const RISING_ART_ASPECT = 2 / 3;

/** The dive's focal point in the image (x from the left, y up): the rider's chest core. */
export const RISING_WORLD_FOCUS = [0.5, 0.71] as const;

/**
 * Render pixels per frame (CSS px; the device pixel ratio is ignored: the fire
 * is soft and the DOM title stays at native resolution). Compact screens are
 * coarse-pointer or narrow ones (rising-sequence.ts). Phones fit at one pixel
 * per CSS pixel (412 x 915 is 377k), so the print is as sharp as the portal it
 * takes over from; a 1440 x 900 window renders 1145 x 716, more pixels across
 * than the 1024 px texture holds.
 */
export const RISING_COMPACT_PIXEL_BUDGET = 420_000;
export const RISING_WIDE_PIXEL_BUDGET = 820_000;

/**
 * The quality ladder's resolution-only rungs (rising-fire.ts: RISING_LADDER),
 * as a share of the budget's width and height.
 */
export const RISING_RESOLUTION_RUNGS = [1, 0.75, 0.62, 0.5] as const;

/** The probe times this frame of the sequence: mid-burn, just after the cut. */
export const RISING_PROBE_T = 5.0;

/** A burn frame (both passes) should take at most this long on the GPU. */
export const RISING_PROBE_BUDGET_MS = 8;

/**
 * Every run starts on rung 0. During the portal, the renderer times one burn
 * frame on the GPU (rising-fire.ts: probe) and moves to the first
 * resolution-only rung whose share of the pixels brings it within the
 * budget, before the first frame shows: a slow GPU never starts with a
 * resolution pop mid-burn, and a fast one keeps the sharpest picture. The
 * ladder still steps down at runtime when frames run late.
 */
export function risingProbeRung(frameMs: number, fromRung = 0) {
  if (!(frameMs > 0)) return fromRung;
  const last = RISING_RESOLUTION_RUNGS.length - 1;
  if (fromRung >= last) return fromRung;
  const area = (rung: number) => RISING_RESOLUTION_RUNGS[rung] ** 2;
  let rung = fromRung;
  while (rung < last && (frameMs * area(rung)) / area(fromRung) > RISING_PROBE_BUDGET_MS) {
    rung += 1;
  }
  return rung;
}

/** GL (assets + shader) must be ready this long after the press, or the run goes calm. */
export const RISING_READY_TIMEOUT_MS = 700;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The portal's ease-in, cubic-bezier(0.7, 0, 0.84, 0): the circle bursts at the end. */
export const PORTAL_BEZIER = [0.7, 0, 0.84, 0] as const;

/**
 * The portal easing at time progress x (0-1). The portal is sampled with it
 * (rising-sequence.ts) so the key visual inside can be counter-scaled frame by
 * frame: the circle opens like an iris over a still, full-screen image.
 */
export function portalEase(x: number) {
  const [x1, y1, x2, y2] = PORTAL_BEZIER;
  const bezier = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  const target = clamp01(x);
  if (target === 0 || target === 1) return target;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    if (bezier(middle, x1, x2) < target) low = middle;
    else high = middle;
  }
  return bezier((low + high) / 2, y1, y2);
}
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
// Mostly ease-in-out, with a linear share so the front is already moving at ignition.
const burnEase = (t: number) => 0.8 * clamp01(t) + 0.2 * easeInOutSine(t);

export type RisingUniforms = {
  uDive: number;
  uZoom: number;
  uArrive: number;
  uOpen: number;
  uBlur: number;
  uWarp: number;
  uBurn: number;
  uFlame: number;
  uShock: number;
  uReveal: number;
  uHeat: number;
};

/** Shader uniforms at time T (seconds). Pure, so tests and the audit can seek it. */
export function risingUniformsAt(T: number): RisingUniforms {
  const s = RISING_TIMING.webgl;
  const pre = T < s.breakthrough;
  const diveT = clamp01(T / s.breakthrough);
  return {
    uDive: pre ? diveT : Math.max(0, 1 - (T - s.breakthrough) / 0.35),
    // The dive closes in on the chest core and stays there...
    uZoom: 1 - 0.8 * easeInCubic(diveT),
    // ...until the breakthrough tears open from the core, under the brightest
    // amber: inside the opening the camera is already through, a little
    // closer than the cover fit, and eases back out to the whole print while
    // it burns. No frame jumps from one zoom to the other.
    uArrive: 0.82 + 0.18 * easeOutCubic(clamp01((T - s.breakthrough) / 4.5)),
    uOpen: 1.6 * easeInCubic(clamp01((T - (s.breakthrough - 0.14)) / 0.32)),
    uBlur: pre ? 0.42 * diveT ** 3 : 0.3 * (1 - smooth(s.breakthrough, s.breakthrough + 0.55, T)),
    // One amber swell over 0.5 s, decaying over 0.85 s: never a strobe.
    uWarp: smooth(1.55, s.breakthrough, T) * (1 - smooth(s.breakthrough, 2.9, T)),
    // The print catches along its bottom edge, the fire gathers pace, and the
    // last corner goes slowly.
    uBurn: T < s.burnStart ? 0 : burnEase((T - s.burnStart) / (s.burnEnd - s.burnStart)),
    uFlame:
      smooth(s.burnStart, s.burnStart + 0.6, T) * (1 - 0.72 * smooth(s.settle[0], s.settle[1], T)),
    uShock: T >= s.title ? T - s.title : -1,
    uReveal: smooth(s.title + 0.4, s.burnEnd + 0.2, T),
    // Colour temperature only rises (ice -> ember). A grade that swings back
    // and forth reads as a red flash.
    uHeat: smooth(1.1, s.burnStart + 0.4, T),
  };
}

export type RisingEnvironment = {
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
  /** hasConstrainedResources(navigator) from rendering-profile.js */
  constrained: boolean;
};

/**
 * Chooses the rendering tier by capability, never by device model: Galaxy and
 * Pixel phones get the WebGL sequence like any other capable device, and the
 * economy profile of the page is not consulted. A run still drops to "css"
 * when WebGL is missing, software-only, lost, or not ready in time
 * (rising-sequence.ts).
 */
export function pickRisingTier({ reducedMotion, constrained }: RisingEnvironment): RisingTier {
  if (reducedMotion) return "reduced";
  return constrained ? "css" : "webgl";
}

/**
 * Display frames per draw, from the measured rAF interval: 1 on 60 and 90 Hz
 * panels (90 Hz would otherwise fall to 45 draws a second), 2 on 120 and 144 Hz
 * panels (60 and 72 draws a second). The quality ladder's budget is this many
 * rAF intervals, so a fast panel never walks the ladder down for nothing.
 */
export function risingFramesPerDraw(cadenceMs: number) {
  if (!(cadenceMs > 0)) return 1;
  return Math.max(1, Math.floor(1000 / 60 / cadenceMs + 0.25));
}
