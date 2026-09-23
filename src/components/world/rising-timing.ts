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
    burnStart: 2.3,
    title: 4.5,
    burnEnd: 7.2,
    settle: [6.9, 8.2],
    fade: [8.1, 8.8],
    end: 8.8,
  },
  css: {
    portal: 0.42,
    breakthrough: 2.2,
    burnStart: 2.2,
    title: 4.0,
    burnEnd: 6.5,
    settle: [6.4, 7.0],
    fade: [6.6, 7.3],
    end: 7.3,
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

/** GL (assets + shader) must be ready this long after the press, or the run goes calm. */
export const RISING_READY_TIMEOUT_MS = 700;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

export type RisingUniforms = {
  uDive: number;
  uZoom: number;
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
    uZoom: pre
      ? 1 - 0.8 * easeInCubic(diveT)
      : 0.84 + 0.12 * easeOutCubic(clamp01((T - s.breakthrough) / 6)),
    uBlur: pre ? 0.42 * diveT ** 3 : 0.3 * (1 - smooth(s.breakthrough, s.breakthrough + 0.55, T)),
    // One amber swell over 0.5 s, decaying over 0.85 s: never a strobe.
    uWarp: smooth(1.55, s.breakthrough, T) * (1 - smooth(s.breakthrough, 2.9, T)),
    uBurn: T < s.burnStart ? 0 : easeInOutSine((T - s.burnStart) / (s.burnEnd - s.burnStart)),
    uFlame:
      smooth(s.burnStart, s.burnStart + 0.6, T) * (1 - 0.7 * smooth(s.settle[0], s.settle[1], T)),
    uShock: T >= s.title ? T - s.title : -1,
    uReveal: smooth(s.title + 0.3, s.burnEnd, T),
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
