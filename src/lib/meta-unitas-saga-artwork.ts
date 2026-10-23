// The META UNITAS SAGA special site's two key visuals (owner-supplied,
// 2026-10-23), as one versioned revision under public/meta-unitas-saga-20261023/,
// built by scripts/build-meta-unitas-saga-artwork.mjs from
// design/meta-unitas-saga-20261023/key-visual/.
export type MetaUnitasStageKey = "middle" | "ultra";

export const META_UNITAS_STAGE_ORDER = [
  "middle",
  "ultra",
] as const satisfies readonly MetaUnitasStageKey[];

export const META_UNITAS_ARTWORK_REVISION = "20261023";
const FOLDER = `/meta-unitas-saga-${META_UNITAS_ARTWORK_REVISION}`;

/** The delivery widths; the last is the canonical `src` (never enlarged). */
export const META_UNITAS_ARTWORK_WIDTHS = [640, 960, 1280] as const;

export type MetaUnitasArtwork = { src: string; width: number; height: number };

/** Intrinsic sizes of the largest delivery file (the build script prints them). */
export const META_UNITAS_ARTWORK: Record<MetaUnitasStageKey, MetaUnitasArtwork> = {
  middle: { src: `${FOLDER}/middle-1280.webp`, width: 1280, height: 1707 },
  ultra: { src: `${FOLDER}/ultra-1280.webp`, width: 1024, height: 1536 },
};

/** The hero, the preload, the share image and the entry all take ミドル. */
export const META_UNITAS_KEY_VISUAL = META_UNITAS_ARTWORK.middle;

/** The side menu's SPECIAL tile: ミドル at 400 px, built by the same script. */
export const META_UNITAS_MENU_TILE = `${FOLDER}/middle-tile-400.webp`;

/** srcset / sizes for one form's key visual. */
export function metaUnitasImage(stage: MetaUnitasStageKey, lazyLayout = false) {
  const { src, width: intrinsic } = META_UNITAS_ARTWORK[stage];
  const stem = src.replace(/-1280\.webp$/, "");
  return {
    srcSet: META_UNITAS_ARTWORK_WIDTHS.map(
      (width) => `${stem}-${width}.webp ${Math.min(width, intrinsic)}w`,
    ).join(", "),
    sizes: (lazyLayout ? "auto, " : "") + "(max-width: 767px) 100vw, 56vw",
  };
}
