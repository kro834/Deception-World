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

// Intrinsic sizes of the largest delivery file (the originals are 1491–1536 x
// 2048, resized to 1280 wide; height is recorded by the build script).
export const FAR_FROM_SAGA_ARTWORK: Record<FarFromStageKey, FarFromStageArtwork> = {
  middle: { src: `${FOLDER}/middle-1280.webp`, width: 1280, height: 1758 },
  high: { src: `${FOLDER}/high-1280.webp`, width: 1280, height: 1716 },
  xhigh: { src: `${FOLDER}/xhigh-1280.webp`, width: 1280, height: 1716 },
  max: { src: `${FOLDER}/max-1280.webp`, width: 1280, height: 1707 },
  ultra: { src: `${FOLDER}/ultra-1280.webp`, width: 1280, height: 1716 },
};

/** The hero, preload, share image and the entry warm-up all take ミドル. */
export const FAR_FROM_SAGA_KEY_VISUAL = FAR_FROM_SAGA_ARTWORK.middle;

/** The side menu's SPECIAL tile (styles-stage-shell.css): ミドル at 400 px,
 * built by the same script. */
export const FAR_FROM_SAGA_MENU_TILE = `${FOLDER}/middle-tile-400.webp`;

/** srcset / sizes for one stage's picture (shared by the HTML preload, the
 * hero and the stage panel so they all fetch the same candidate). */
export function farFromImage(stage: FarFromStageKey, lazyLayout = false) {
  const { src } = FAR_FROM_SAGA_ARTWORK[stage];
  const stem = src.replace(/-1280\.webp$/, "");
  return {
    srcSet: FAR_FROM_SAGA_ARTWORK_WIDTHS.map((width) => `${stem}-${width}.webp ${width}w`).join(
      ", ",
    ),
    sizes: (lazyLayout ? "auto, " : "") + "(max-width: 767px) 100vw, 64vw",
  };
}
