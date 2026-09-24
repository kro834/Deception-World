// Right-sized candidates for small image slots: the World episode cards, the
// six-manager cards and the Zeus button. The smaller files are made by
// scripts/build-thumbnail-variants.mjs (`build: true`); the largest candidate
// of each set is the file the slot loaded before.
//
// `sizes` is the CSS width each image needs in its slot at every layout
// (measured at 320-1920 px). The slots crop with object-fit: cover, so an
// image wider than its slot needs the slot's height times its aspect ratio,
// not the slot's width; max() says so. An engine that cannot read max() in
// `sizes` falls back to 100vw and the largest candidate, the file it loaded
// before. A 360 px Galaxy (DPR 3) now decodes an episode at 900 px wide
// instead of 1086-1448 px, and a manager card at 480 px instead of 640 px.

type Variant = { path: string; width: number; build?: boolean };
type ImageSet = { source: string; variants: Variant[]; fallback?: string };

const episode = (source: string, full: string, fullWidth: number): ImageSet => {
  const stem = full.replace(/\.webp$/, "");
  return {
    source,
    variants: [
      { path: `${stem}-600.webp`, width: 600, build: true },
      { path: `${stem}-900.webp`, width: 900, build: true },
      { path: full, width: fullWidth },
    ],
  };
};

export const EPISODE_THUMBNAILS: Record<string, ImageSet> = {
  "/episode-01-hide-and-seek.jpeg": episode(
    "/episode-01-hide-and-seek.jpeg",
    "/episode-01-hide-and-seek-delivery.webp",
    1086,
  ),
  "/episode-02-legends.jpeg": episode(
    "/episode-02-legends.jpeg",
    "/episode-02-legends-delivery.webp",
    1448,
  ),
  "/episode-03-deception-world.jpeg": episode(
    "/episode-03-deception-world.jpeg",
    "/episode-03-deception-world-delivery.webp",
    1086,
  ),
  "/episode-04-kill.jpeg": episode("/episode-04-kill.jpeg", "/episode-04-kill-delivery.webp", 1122),
  "/episode-05-farce.jpeg": episode(
    "/episode-05-farce.jpeg",
    "/episode-05-farce-delivery.webp",
    1200,
  ),
  "/episode-06-deus.webp": episode("/episode-06-deus.webp", "/episode-06-deus.webp", 1448),
};

// Card slots: phones calc(100vw - 84px) by 169-181 px; 561-700 px about
// 240 x 180; wider layouts up to 853 x 639 (landscape artwork is
// height-bound there).
export const EPISODE_THUMBNAIL_SIZES =
  "(max-width: 560px) calc(100vw - 84px), (max-width: 700px) 280px, min(76vw, 960px)";

const manager = (stem: string, fullWidth: number): ImageSet => ({
  source: `${stem}.jpeg`,
  variants: [
    { path: `${stem}-480.webp`, width: 480, build: true },
    { path: `${stem}.webp`, width: fullWidth, build: true },
  ],
});

export const MANAGER_THUMBNAILS: Record<string, ImageSet & { aspect: number }> = {
  zeus: { ...manager("/manager-zeus-thumb", 640), aspect: 640 / 497 },
  "rex-loi": { ...manager("/manager-rex-loi-thumb", 640), aspect: 640 / 960 },
  shuza: { ...manager("/manager-shuza-thumb", 640), aspect: 640 / 913 },
  "lejas-portrait": { ...manager("/manager-lejas-portrait-thumb", 640), aspect: 640 / 799 },
  opus: { ...manager("/manager-opus-thumb", 640), aspect: 640 / 851 },
  reemu: { ...manager("/manager-reemu-thumb", 540), aspect: 540 / 960 },
};

// RE DIVE's 六詠 I, シエル: an upper-body crop of his illustration
// (/ciel-illustration-20260924.webp, as supplied), in the managers' card slot.
export const CIEL_THUMBNAIL = { ...manager("/ciel-thumb-20260924", 640), aspect: 640 / 800 };

// His page's portrait (/characters/ciel): the whole illustration, right-sized
// for the dossier hero (phones 92vw, then 46vw, at most 520 px). 960 px serves
// a 3x phone; a 520 px hero at 2x upscales it by 8%, where the file as
// supplied (1122 px, 462 KB) would cost more than twice as much.
export const CIEL_PORTRAIT: ImageSet = {
  source: "/ciel-illustration-20260924.webp",
  variants: [
    { path: "/ciel-illustration-20260924-640.webp", width: 640, build: true },
    { path: "/ciel-illustration-20260924-960.webp", width: 960, build: true },
  ],
};
export const CIEL_PORTRAIT_SIZES = "(max-width: 760px) 92vw, (max-width: 1120px) 46vw, 520px";

// Card slots: phones about 40vw by 212 px; 561-820 px up to 190 x 212;
// 821-1100 px up to 150 x 179; wider up to 240 x 179.
const managerSizes = (aspect: number) => {
  const phone = Math.ceil(212 * aspect);
  const desk = Math.ceil(179 * aspect);
  return `(max-width: 560px) max(40vw, ${phone}px), (max-width: 820px) max(190px, ${phone}px), (max-width: 1100px) max(150px, ${desk}px), max(240px, ${desk}px)`;
};

const srcSet = (set: ImageSet) =>
  set.variants.map((variant) => `${variant.path} ${variant.width}w`).join(", ");

export function episodeThumbnail(source: string) {
  const set = EPISODE_THUMBNAILS[source];
  return set ? { srcSet: srcSet(set), sizes: EPISODE_THUMBNAIL_SIZES } : {};
}

export function managerThumbnail(name: keyof typeof MANAGER_THUMBNAILS) {
  const set = MANAGER_THUMBNAILS[name];
  return { srcSet: srcSet(set), sizes: managerSizes(set.aspect) };
}

export function cielThumbnail() {
  return { srcSet: srcSet(CIEL_THUMBNAIL), sizes: managerSizes(CIEL_THUMBNAIL.aspect) };
}

export function cielPortrait() {
  return { srcSet: srcSet(CIEL_PORTRAIT), sizes: CIEL_PORTRAIT_SIZES };
}

// The button's image box is 48 px on phones (the button is 60 px) and at most
// 80 px elsewhere: 144 px serves DPR 3, 216 px DPR 3.5-4.5.
export const ZEUS_BUTTON_SIZES = "(max-width: 560px) 48px, 80px";

export const ZEUS_BUTTON_IMAGES = {
  default: {
    source: "/zeus-button.png",
    fallback: "/zeus-button-360.webp",
    variants: [
      { path: "/zeus-button-144.webp", width: 144, build: true },
      { path: "/zeus-button-216.webp", width: 216, build: true },
      { path: "/zeus-button-360.webp", width: 360 },
    ],
  },
  returning: {
    source: "/zeus-button-return.jpeg",
    fallback: "/zeus-button-return-360.webp",
    variants: [
      { path: "/zeus-button-return-144.webp", width: 144, build: true },
      { path: "/zeus-button-return-216.webp", width: 216, build: true },
      { path: "/zeus-button-return-360.webp", width: 360 },
    ],
  },
} satisfies Record<string, ImageSet>;

export const ZEUS_BUTTON_SRCSET = srcSet(ZEUS_BUTTON_IMAGES.default);
export const ZEUS_BUTTON_RETURN_SRCSET = srcSet(ZEUS_BUTTON_IMAGES.returning);
