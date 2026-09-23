// The opening's storyboards: the burn that turns the ice logo into the prism
// logo, and the ENTER THE WORLD dive. Pure and dependency-free, so node:test
// imports it directly and the flash audit can seek it.

export type OpeningTier = "webgl" | "css" | "reduced";

/** Seconds of the title sequence (the `.is-playing` phase). */
export const OPENING_SEQUENCE_SECONDS = 7.2;

/**
 * The burn, in seconds from its start. It starts `start` seconds into the
 * title sequence: the ice logo has settled by then (frosted-title-arrival
 * ends at 2.14 s).
 */
export const OPENING_BURN = {
  start: 2.6,
  /** The burn front climbs the logo (bottom left first). At 0 the canvas
   *  replaces the DOM ice logo in one frame (frame 0 is that logo). */
  front: [0.2, 3.0],
  /** The DOM prism logo replaces the canvas (the context is released then). */
  handOff: [3.5, 3.8],
  end: 3.8,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

export type BurnUniforms = {
  uHeat: number;
  uBurn: number;
  uFlame: number;
  uCool: number;
};

/** Burn shader uniforms at T seconds after the burn started. */
export function burnUniformsAt(T: number): BurnUniforms {
  const [frontStart, frontEnd] = OPENING_BURN.front;
  return {
    // Heat haze and the warm light build before the front arrives, and only rise.
    uHeat: smooth(0, 0.7, T),
    // Mostly linear with soft ends: the front never rushes through the middle.
    uBurn:
      T < frontStart
        ? 0
        : 0.7 * clamp01((T - frontStart) / (frontEnd - frontStart)) +
          0.3 * easeInOutSine((T - frontStart) / (frontEnd - frontStart)),
    uFlame: smooth(0.05, 0.55, T) * (1 - smooth(2.75, 3.5, T)),
    // The prism logo cools from ember to its own colours; at 1 it is the DOM image.
    uCool: smooth(2.8, 3.48, T),
  };
}

/**
 * The dive, in seconds from the moment GL is drawing. Everything before
 * `glEnd` is drawn by the shader on the main thread; the route changes after
 * it, under the still landing frame, so the route's work never drops a frame
 * of the dive.
 */
export const OPENING_DIVE = {
  /** The canvas fades in over the title (frame 0 is the title's own framing). */
  fadeIn: [0, 0.2],
  /** The camera breaks through the logo's ring into the world. */
  cut: 0.95,
  /** Last shader frame: the world at its landing framing. */
  glEnd: 1.45,
} as const;

/** GL (bitmaps + shader) must be ready this long after the press, or the dive is CSS. */
export const OPENING_DIVE_READY_TIMEOUT_MS = 450;

export type DiveUniforms = {
  uZoom: number;
  uBlur: number;
  uDive: number;
  uWarp: number;
  uWorld: number;
  uWorldZoom: number;
  uLand: number;
  uBars: number;
  uIce: number;
};

/** Dive shader uniforms at T seconds after the dive started drawing. */
export function diveUniformsAt(T: number): DiveUniforms {
  const { cut, glEnd } = OPENING_DIVE;
  const pre = T < cut;
  const diveT = clamp01(T / cut);
  return {
    uZoom: pre ? 1 - 0.88 * easeInCubic(diveT) : 0.12,
    uBlur: pre ? 0.46 * diveT ** 3 : 0.3 * (1 - smooth(cut, cut + 0.42, T)),
    uDive: pre ? smooth(0.08, cut, T) : Math.max(0, 1 - (T - cut) / 0.32),
    // One amber swell into the breakthrough and one slow decay: never a strobe.
    uWarp: smooth(0.5, cut, T) * (1 - smooth(cut, glEnd, T)),
    uWorld: pre ? 0 : 1,
    uWorldZoom: pre ? 0.4 : 0.4 + 0.6 * easeOutCubic(clamp01((T - cut) / (glEnd - cut))),
    uLand: smooth(cut + 0.06, glEnd, T),
    // The letterbox bars of the title open as the camera moves.
    uBars: 1 - smooth(0.1, 0.55, T),
    // The Mirage ice grade only rises: neutral at frame 0 (the title), ice after.
    uIce: smooth(0, 0.45, T),
  };
}

export type OpeningEnvironment = {
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
  /** hasConstrainedResources(navigator) from rendering-profile.js */
  constrained: boolean;
};

/**
 * By capability, never by device model: Galaxy, Pixel and iPhone get WebGL
 * like any capable device. A run still drops to "css" when WebGL is missing,
 * software-only, lost, or not ready in time.
 */
export function pickOpeningTier({ reducedMotion, constrained }: OpeningEnvironment): OpeningTier {
  if (reducedMotion) return "reduced";
  return constrained ? "css" : "webgl";
}

/**
 * Display frames per draw, from the measured rAF interval: 1 on 60 and 90 Hz
 * panels, 2 on 120 and 144 Hz panels (60 and 72 draws a second).
 */
export function openingFramesPerDraw(cadenceMs: number) {
  if (!(cadenceMs > 0)) return 1;
  return Math.max(1, Math.floor(1000 / 60 / cadenceMs + 0.25));
}
