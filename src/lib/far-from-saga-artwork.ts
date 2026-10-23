// The FAR FROM SAGA special site's five stage illustrations (owner-supplied,
// 2026-10-22), as one versioned revision under public/far-from-saga-20261022/.
//
// The owner's five files were assumed to arrive in stage order: ミドル, ハイ,
// エックスハイ, マックス, ウルトラ. FAR_FROM_SAGA_STAGE_ORDER is that mapping,
// and the only place it lives: scripts/build-far-from-saga-artwork.mjs takes
// its positional source arguments in this order, and the site's stage rail
// lists the stages in it. Reorder here and rebuild if the assumption was wrong.
export type FarFromStageKey = "middle" | "high" | "xhigh" | "max" | "ultra";

export const FAR_FROM_SAGA_STAGE_ORDER = [
  "middle",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly FarFromStageKey[];

export const FAR_FROM_SAGA_ARTWORK_REVISION = "20261022";
const FOLDER = `/far-from-saga-${FAR_FROM_SAGA_ARTWORK_REVISION}`;

/** The delivery widths every stage is encoded at; the last is the canonical `src`. */
export const FAR_FROM_SAGA_ARTWORK_WIDTHS = [640, 960, 1280] as const;

export type FarFromStageArtwork = {
  /** The canonical (largest) delivery file, also the share image. */
  src: string;
  width: number;
  height: number;
};

// Intrinsic sizes of the largest delivery file, as the build script reports
// them. Originals narrower than 1280 px are never enlarged, so their "-1280"
// file keeps the original's width (ミドル, ハイ and マックス since the owner's
// corrected visuals of 2026-10-22).
export const FAR_FROM_SAGA_ARTWORK: Record<FarFromStageKey, FarFromStageArtwork> = {
  middle: { src: `${FOLDER}/middle-1280.webp`, width: 1092, height: 1500 },
  high: { src: `${FOLDER}/high-1280.webp`, width: 1086, height: 1448 },
  xhigh: { src: `${FOLDER}/xhigh-1280.webp`, width: 1280, height: 1716 },
  max: { src: `${FOLDER}/max-1280.webp`, width: 1125, height: 1500 },
  ultra: { src: `${FOLDER}/ultra-1280.webp`, width: 1280, height: 1716 },
};

/** ウルトラ before its interfaces (the owner's render, 2026-10-22): the stage
 * panel shows it first and deploys the auxiliary interfaces over it as
 * vector panels (far-from-ultra-deploy.tsx); the calm tiers keep the
 * painted ウルトラ above. Same widths and caps, one more file stem. */
export const FAR_FROM_SAGA_ULTRA_BASE: FarFromStageArtwork = {
  src: `${FOLDER}/ultra-base-1280.webp`,
  width: 1083,
  height: 1452,
};

/** Every delivered stage picture: the five forms and ウルトラ's base. */
export type FarFromArtworkKey = FarFromStageKey | "ultraBase";
const STAGE_ASSETS: Record<FarFromArtworkKey, FarFromStageArtwork> = {
  ...FAR_FROM_SAGA_ARTWORK,
  ultraBase: FAR_FROM_SAGA_ULTRA_BASE,
};

/** The hero, preload, share image and the entry warm-up all take ミドル. */
export const FAR_FROM_SAGA_KEY_VISUAL = FAR_FROM_SAGA_ARTWORK.middle;

/** The side menu's SPECIAL tile (styles-stage-shell.css): ミドル at 400 px,
 * built by the same script. */
export const FAR_FROM_SAGA_MENU_TILE = `${FOLDER}/middle-tile-400.webp`;

/** srcset / sizes for one stage's picture (shared by the HTML preload, the
 * hero and the stage panel so they all fetch the same candidate). */
export function farFromImage(stage: FarFromArtworkKey, lazyLayout = false) {
  const { src, width: intrinsic } = STAGE_ASSETS[stage];
  const stem = src.replace(/-1280\.webp$/, "");
  return {
    // Each candidate is described by its real width (a file is never wider
    // than its original).
    srcSet: FAR_FROM_SAGA_ARTWORK_WIDTHS.map(
      (width) => `${stem}-${width}.webp ${Math.min(width, intrinsic)}w`,
    ).join(", "),
    sizes: (lazyLayout ? "auto, " : "") + "(max-width: 767px) 100vw, 64vw",
  };
}
