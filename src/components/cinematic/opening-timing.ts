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
 * The dive, in seconds from the moment GL is drawing. One camera move: a
 * small breath back on the title, an accelerating plunge into the logo's ring
 * (the background drifts slower than the logo: depth), light trails and a
 * spectral (chromatic) zoom blur at peak speed, the world opening through the
 * ring as an iris, then a forward deceleration that overshoots the World
 * page's framing by `landScale`. Everything up to `glEnd` is drawn by the
 * shader on the main thread. From `glEnd` the compositor eases the landing
 * frame back to the page's framing (`settle`) while the route mounts
 * underneath, so the route's main-thread work never freezes the picture.
 */
export const OPENING_DIVE = {
  /** The canvas fades in over the title (frame 0 is the title's own framing). */
  fadeIn: [0, 0.16],
  /** The camera breaks through the logo's ring into the world. */
  cut: 0.95,
  /** Last shader frame: the world at its landing framing. */
  glEnd: 1.45,
  /** The forward overshoot past the page's framing at `glEnd` (a canvas scale). */
  landScale: 1.1,
  /** Seconds of the compositor-only settle from landScale to 1, after `glEnd`. */
  settle: 1.4,
} as const;

/** GL (bitmaps + shader) must be ready this long after the press, or the dive is CSS. */
export const OPENING_DIVE_READY_TIMEOUT_MS = 450;

export type DiveUniforms = {
  uZoom: number;
  uBlur: number;
  uDive: number;
  uWarp: number;
  uChroma: number;
  uIris: number;
  uCenter: number;
  uWorld: number;
  uWorldZoom: number;
  uLand: number;
  uBars: number;
  uIce: number;
};

/** Dive shader uniforms at T seconds after the dive started drawing. */
export function diveUniformsAt(T: number): DiveUniforms {
  const { cut, glEnd, landScale } = OPENING_DIVE;
  const pre = T < cut;
  // A breath back (the camera draws in), then a curve that keeps
  // accelerating until the ring fills the frame.
  const breath = T < 0.26 ? Math.sin(Math.PI * clamp01(T / 0.26)) : 0;
  const diveT = clamp01((T - 0.08) / (cut - 0.08));
  // The world behind the ring: far while seen through it, then a forward
  // deceleration past the page's framing, to landScale.
  const worldMag = pre
    ? 0.72 + 0.24 * smooth(cut - 0.3, cut, T)
    : 0.96 + (landScale - 0.96) * easeOutCubic(clamp01((T - cut) / (glEnd - cut)));
  return {
    uZoom: pre ? (1 + 0.028 * breath) * (1 - 0.9 * diveT ** 2.2) : 0.1,
    uBlur: pre ? 0.5 * diveT ** 2.4 : 0.36 * (1 - smooth(cut, cut + 0.42, T)),
    uDive: pre ? smooth(0.08, cut, T) : Math.max(0, 1 - (T - cut) / 0.4),
    // One swell into the breakthrough and one slow decay: never a strobe.
    uWarp: smooth(0.5, cut, T) * (1 - smooth(cut, glEnd, T)),
    // The spectral split peaks with the speed and is gone well before landing.
    uChroma: smooth(0.4, cut, T) * (1 - smooth(cut, cut + 0.4, T)),
    // The world opens through the ring and fills the frame at the cut.
    uIris: pre ? smooth(cut - 0.28, cut, T) : 1,
    // The camera's axis drifts from the ring to the frame's centre.
    uCenter: smooth(cut - 0.25, cut + 0.35, T),
    uWorld: pre ? 0 : 1,
    // From glEnd the shader draws the page's framing and the canvas carries
    // the overshoot (scale landScale): the same picture either side of it.
    uWorldZoom: T >= glEnd ? 1 : 1 / worldMag,
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
