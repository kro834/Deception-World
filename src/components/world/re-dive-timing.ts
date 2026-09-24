// RE DIVE…?: the transition's schedule, the shader's uniform schedule and the
// end still's framing. Pure and dependency-free, so node:test can import it
// directly (re-dive-sequence.ts runs it).

/** Seconds from the start of the transition. */
export const RE_DIVE = {
  fadeIn: 0.28,
  dive: [0.22, 1.85],
  warp: [1.5, 1.9, 2.55],
  land: [1.95, 2.45],
  landed: 2.55,
  reducedLanded: 0.7,
  /** The dialog's fade-out over the section, after landing. */
  leave: 0.6,
  readyTimeoutMs: 450,
} as const;

/** The art's core (the spiral on the chest), in art UV (y-down): the camera dives into it. */
export const RE_DIVE_CORE = { x: 0.57, y: 0.34 } as const;

/** The end still's art (the Rexonance art's 640w candidate), in CSS px. */
export const RE_DIVE_ART_NATURAL = { width: 640, height: 853 } as const;

/** The section's burning lip (styles-world-re-dive.css --re-dive-edge-h). */
export function reDiveEdgeHeight(viewportWidth: number) {
  return Math.min(320, Math.max(170, viewportWidth * 0.3));
}
/**
 * Where the tiled char takes over under the lip, as a share of the lip's
 * height: inside the strip's own opaque char, above its faded bottom.
 */
export const RE_DIVE_CHAR_FROM = 0.8;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const easeInCubic = (t: number) => t * t * t;

export type ReDiveUniforms = {
  zoom: number;
  blur: number;
  dive: number;
  lift: number;
  warp: number;
  land: number;
};

/** Pure: the shader's schedule (unit-tested). */
export function reDiveUniformsAt(T: number): ReDiveUniforms {
  const [d0, d1] = RE_DIVE.dive;
  const [w0, w1, w2] = RE_DIVE.warp;
  const [l0, l1] = RE_DIVE.land;
  const progress = clamp01((T - d0) / (d1 - d0));
  const land = smooth(l0, l1, T);
  return {
    zoom: 1 - 0.88 * easeInCubic(progress),
    blur: 0.46 * Math.pow(progress, 2.2) * (1 - land),
    dive: smooth(d0, d0 + 0.6, T) * (1 - land),
    lift: smooth(d0, d0 + 0.9, T),
    warp: smooth(w0, w1, T) * (1 - smooth(w1, w2, T)),
    land,
  };
}

/**
 * The end still's framing on a viewport (styles-world-rising.css .rw-end-art):
 * cover at 50% 30% on portrait screens, fitted by height with feathered sides
 * and a faded top on landscape ones.
 */
export function reDiveFraming(width: number, height: number) {
  const aspect = RE_DIVE_ART_NATURAL.width / RE_DIVE_ART_NATURAL.height;
  const landscape = width / height >= 3 / 4;
  let drawnWidth: number;
  let drawnHeight: number;
  let offsetX: number;
  let offsetY: number;
  if (landscape) {
    drawnHeight = height;
    drawnWidth = height * aspect;
    offsetX = (width - drawnWidth) / 2;
    offsetY = 0;
  } else {
    const scale = Math.max(width / RE_DIVE_ART_NATURAL.width, height / RE_DIVE_ART_NATURAL.height);
    drawnWidth = RE_DIVE_ART_NATURAL.width * scale;
    drawnHeight = RE_DIVE_ART_NATURAL.height * scale;
    offsetX = (width - drawnWidth) * 0.5;
    offsetY = (height - drawnHeight) * 0.3;
  }
  return {
    map: [width / drawnWidth, height / drawnHeight, -offsetX / drawnWidth, -offsetY / drawnHeight],
    focus: {
      x: (RE_DIVE_CORE.x * drawnWidth + offsetX) / width,
      y: (RE_DIVE_CORE.y * drawnHeight + offsetY) / height,
    },
    feather: landscape ? [(0.3 * height) / width, (0.375 * height) / width, 0.16, 1] : [0, 0, 0, 0],
  };
}
