/** Quality tiers and the adaptive resolution controller. Pure (no three.js, no DOM access
 * beyond the navigator passed in), so node tests can drive them. */

export type RexonanceQualityTier = "high" | "mobile" | "low";

type NavigatorLike = {
  hardwareConcurrency?: number;
  userAgent?: string;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export function detectRexonanceQualityTier(
  nav: NavigatorLike,
  coarsePointer: boolean,
): RexonanceQualityTier {
  const cores = nav.hardwareConcurrency || 0;
  const memory = nav.deviceMemory;
  const saveData = nav.connection?.saveData === true;
  if (saveData || (memory !== undefined && memory <= 2)) return "low";
  if (!coarsePointer) return "high";
  const constrained =
    (memory !== undefined && memory <= 4) ||
    (cores > 0 && cores <= 4 && /Android/iu.test(nav.userAgent ?? ""));
  return constrained ? "low" : "mobile";
}

export type RexonanceQuality = {
  /** Device pixel ratio cap. */
  dprCap: number;
  /** Most device pixels per frame (width x height x dpr²). */
  pixelBudget: number;
  /** Lowest scale the adaptive controller may reach (of the capped dpr). */
  minScale: number;
  /** MSAA samples on the HDR target; 0 uses FXAA instead. */
  samples: number;
  bloom: boolean;
  /** Contact shadow target size in texels. */
  shadowSize: number;
  /** Crystal shader detail: 2 = facets, inner galaxy layer and sparkles; 1 = no inner layer. */
  crystalDetail: 1 | 2;
  anisotropy: number;
  /** Draco decode workers (the model is ~100 small meshes, so a few run in parallel). */
  dracoWorkers: number;
};

export const REXONANCE_QUALITY: Record<RexonanceQualityTier, RexonanceQuality> = {
  high: {
    dprCap: 2,
    pixelBudget: 3_200_000,
    minScale: 0.6,
    samples: 4,
    bloom: true,
    shadowSize: 512,
    crystalDetail: 2,
    anisotropy: 8,
    dracoWorkers: 3,
  },
  mobile: {
    dprCap: 1.75,
    pixelBudget: 1_900_000,
    minScale: 0.6,
    samples: 4,
    bloom: true,
    shadowSize: 256,
    crystalDetail: 2,
    anisotropy: 4,
    dracoWorkers: 2,
  },
  low: {
    dprCap: 1.25,
    pixelBudget: 1_000_000,
    minScale: 0.65,
    samples: 0,
    bloom: true,
    shadowSize: 256,
    crystalDetail: 1,
    anisotropy: 2,
    dracoWorkers: 1,
  },
};

/** The pixel ratio for a viewport: the device's, capped by the tier and by its pixel budget. */
export function rexonancePixelRatio(
  devicePixelRatio: number,
  width: number,
  height: number,
  quality: RexonanceQuality,
  scale = 1,
) {
  const area = Math.max(1, width * height);
  const budget = Math.sqrt(quality.pixelBudget / area);
  return Math.max(0.5, Math.min(devicePixelRatio || 1, quality.dprCap, budget) * scale);
}

/** Lowers the render scale when frames run long and raises it again when they are quick.
 * Feed it real frame intervals (seconds) while the scene animates; it answers with the scale
 * to use, changing it at most once per window so the picture never pumps. */
export function createAdaptiveScale(minScale: number, window = 1.6) {
  let scale = 1;
  let elapsed = 0;
  let frames = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  return {
    get scale() {
      return scale;
    },
    reset() {
      elapsed = 0;
      frames = 0;
    },
    /** Returns true when the scale changed. */
    sample(dt: number) {
      // Long gaps (a hidden tab, a pause) say nothing about the GPU.
      if (!(dt > 0) || dt > 0.25) return false;
      elapsed += dt;
      frames++;
      if (elapsed < window) return false;
      const fps = frames / elapsed;
      elapsed = 0;
      frames = 0;
      if (fps < 42) {
        fastWindows = 0;
        if (++slowWindows >= 1 && scale > minScale) {
          scale = Math.max(minScale, Math.round((scale - 0.12) * 100) / 100);
          slowWindows = 0;
          return true;
        }
      } else if (fps > 57) {
        slowWindows = 0;
        if (++fastWindows >= 3 && scale < 1) {
          scale = Math.min(1, Math.round((scale + 0.1) * 100) / 100);
          fastWindows = 0;
          return true;
        }
      } else {
        slowWindows = 0;
        fastWindows = 0;
      }
      return false;
    },
  };
}
