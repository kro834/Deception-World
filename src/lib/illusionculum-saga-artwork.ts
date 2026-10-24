// The ILLUSIONCULUM SAGA special site's four key visuals (owner-supplied,
// 2026-10-23), one versioned revision under public/illusionculum-saga-20261023/.
//
// The owner's four files, in the selector's order: イリュージョンクルムサーガ
// (1.jpg), the same with its two リアクター・モア deployed (2.jpg), ウルトラ
// (3.jpg), and ウルトラ with リアクター・モア (4.jpg). The originals are kept in
// design/illusionculum-saga-20261023/ (key-<stem>.jpg) and encoded by
// scripts/build-illusionculum-saga.mjs.
export type IllusionculumFormKey = "standard" | "more" | "ultra" | "ultraMore";

export const ILLUSIONCULUM_FORM_ORDER = [
  "standard",
  "more",
  "ultra",
  "ultraMore",
] as const satisfies readonly IllusionculumFormKey[];

/** Each form's file stem (design/ and public/). */
export const ILLUSIONCULUM_FORM_STEMS: Record<IllusionculumFormKey, string> = {
  standard: "standard",
  more: "more",
  ultra: "ultra",
  ultraMore: "ultra-more",
};

export const ILLUSIONCULUM_ARTWORK_REVISION = "20261023";
export const ILLUSIONCULUM_ARTWORK_FOLDER = `/illusionculum-saga-${ILLUSIONCULUM_ARTWORK_REVISION}`;

/** The delivery widths every key visual is encoded at; the last is `src`. */
export const ILLUSIONCULUM_ARTWORK_WIDTHS = [640, 960, 1280] as const;

export type IllusionculumArtwork = { src: string; width: number; height: number };

// The originals are 1333 x 2000; the 1280 file is 1280 x 1920.
const art = (key: IllusionculumFormKey): IllusionculumArtwork => ({
  src: `${ILLUSIONCULUM_ARTWORK_FOLDER}/${ILLUSIONCULUM_FORM_STEMS[key]}-1280.webp`,
  width: 1280,
  height: 1920,
});

export const ILLUSIONCULUM_ARTWORK: Record<IllusionculumFormKey, IllusionculumArtwork> = {
  standard: art("standard"),
  more: art("more"),
  ultra: art("ultra"),
  ultraMore: art("ultraMore"),
};

/** The page's hero key visual (owner, 2026-10-24: 「他みたいに表示する様改善して」):
 * the armoured figure on its halo and cosmic sky, framed as the other special
 * sites frame theirs. One more file stem ("hero"), the same widths and byte
 * caps as the form visuals (design/ key-hero.jpg, scripts/build-illusionculum-saga.mjs). */
export const ILLUSIONCULUM_HERO_STEM = "hero";
export const ILLUSIONCULUM_HERO: IllusionculumArtwork = {
  src: `${ILLUSIONCULUM_ARTWORK_FOLDER}/${ILLUSIONCULUM_HERO_STEM}-1280.webp`,
  width: 1280,
  height: 1920,
};

/** The hero, the preload, the share image and the menu tile. */
export const ILLUSIONCULUM_KEY_VISUAL = ILLUSIONCULUM_HERO;

/** srcset / sizes for the hero (shared by the HTML preload, the hero and the
 * asset loader so they all fetch the same candidate), as farFromImage does. */
export function illusionculumHeroImage() {
  return {
    srcSet: ILLUSIONCULUM_ARTWORK_WIDTHS.map(
      (width) =>
        `${ILLUSIONCULUM_ARTWORK_FOLDER}/${ILLUSIONCULUM_HERO_STEM}-${width}.webp ${width}w`,
    ).join(", "),
    sizes: "(max-width: 899px) 100vw, 46vw",
  };
}

/** The side menu's SPECIAL tile and the World's door (400 px, same script). */
export const ILLUSIONCULUM_MENU_TILE = `${ILLUSIONCULUM_ARTWORK_FOLDER}/${ILLUSIONCULUM_HERO_STEM}-tile-400.webp`;
export const ILLUSIONCULUM_MENU_TILE_SIZE = [400, 533] as const;

/** The transparent cutouts' delivery widths (1024 x 1536 frame, 2:3). */
export const ILLUSIONCULUM_CUTOUT_WIDTHS = [480, 960] as const;

/** One form's transparent cutout (the owner's frame), for the page's own
 * figures; every form lands pixel for pixel over the others. */
export function illusionculumCutout(key: IllusionculumFormKey, width: 480 | 960 = 960) {
  return `${ILLUSIONCULUM_ARTWORK_FOLDER}/cutout-${ILLUSIONCULUM_FORM_STEMS[key]}-${width}.webp`;
}
export const ILLUSIONCULUM_CUTOUT_SIZE = { width: 960, height: 1440 } as const;

/** srcset / sizes for a cutout (the hero's figure and its preload share it). */
export function illusionculumCutoutImage(key: IllusionculumFormKey) {
  return {
    srcSet: ILLUSIONCULUM_CUTOUT_WIDTHS.map(
      (width) => `${illusionculumCutout(key, width)} ${width}w`,
    ).join(", "),
    sizes: "(max-width: 760px) 92vw, 46vw",
  };
}

/** The entry transformation's figure: the standard form's cutout (the gate
 * resolves it over the undersuit). Not the hero any more. */
export const ILLUSIONCULUM_ENTRY_CUTOUT = {
  src: illusionculumCutout("standard", 960),
  ...ILLUSIONCULUM_CUTOUT_SIZE,
} as const;

/** The two リアクター・モア in the cutouts' 1024 x 1536 frame (the owner's
 * "more" cutouts; measured where they differ from the standard ones): the
 * centre and the sprite's radius, spikes included. Their sprites are cut
 * by scripts/build-illusionculum-saga.mjs (orb-<side>-<form>.webp). */
export const ILLUSIONCULUM_ORBS = {
  left: { cx: 225, cy: 196, r: 112 },
  right: { cx: 799, cy: 196, r: 112 },
} as const;
export const ILLUSIONCULUM_ORB_SIZE = 256;
export function illusionculumOrb(side: "left" | "right", ultra = false) {
  return `${ILLUSIONCULUM_ARTWORK_FOLDER}/orb-${side}-${ultra ? "ultra" : "standard"}-${ILLUSIONCULUM_ORB_SIZE}.webp`;
}

/** The chapters' detail crops: [name, key visual stem, box in the 1333 x
 * 2000 original, delivery width]. */
export const ILLUSIONCULUM_DETAIL_CROPS = [
  ["helm", "standard", { left: 370, top: 40, width: 540, height: 720 }, 720],
  ["orb", "more", { left: 24, top: 96, width: 400, height: 400 }, 560],
  ["legs", "standard", { left: 300, top: 1180, width: 740, height: 820 }, 720],
] as const;

/** A detail crop's delivery file and size. */
export function illusionculumDetail(name: (typeof ILLUSIONCULUM_DETAIL_CROPS)[number][0]) {
  const crop = ILLUSIONCULUM_DETAIL_CROPS.find((entry) => entry[0] === name)!;
  const [, , box, width] = crop;
  return {
    src: `${ILLUSIONCULUM_ARTWORK_FOLDER}/detail-${name}-${width}.webp`,
    width,
    height: Math.round((box.height * width) / box.width),
  };
}

/** srcset / sizes for one form's key visual (shared by the preload, the
 * hero and the forms panel, so they all fetch the same candidate). */
export function illusionculumImage(key: IllusionculumFormKey, _lazyLayout = false) {
  const stem = `${ILLUSIONCULUM_ARTWORK_FOLDER}/${ILLUSIONCULUM_FORM_STEMS[key]}`;
  return {
    srcSet: ILLUSIONCULUM_ARTWORK_WIDTHS.map((width) => `${stem}-${width}.webp ${width}w`).join(
      ", ",
    ),
    // Phones take the 640 candidate (memory: four key visuals at 1280 px
    // decoded ~40 MB on their own; 2026-10-24 crash margin).
    // ("auto" would take the laid-out width and override that, so it is
    // left out; lazyLayout stays for callers.)
    sizes: "(max-width: 767px) 213px, 56vw",
  };
}
