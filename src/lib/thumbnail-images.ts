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

// The World cast wall (04 CAST FILES) shows the dossiers' own portraits in
// 4:5 tiles, and its quote chips and the 05 ID photo show the same crops.
// They loaded the full files (up to 1200 px, 248-456 KB) for tiles of 103-345
// px; 360 and 720 px candidates are drawn from the files as supplied by
// scripts/build-portrait-variants.mjs, and the full file stays the largest
// candidate (for a 3x landscape phone or a 2x desktop with a profile open).
// A source without a delivery copy gets one at its own width (`build`).
const portrait = (source: string, full: string, fullWidth: number, buildFull = false): ImageSet => {
  const stem = full.replace(/\.webp$/, "");
  return {
    source,
    variants: [
      { path: `${stem}-360.webp`, width: 360, build: true },
      // A source not much wider than 720 px serves that step itself.
      ...(fullWidth >= 840 ? [{ path: `${stem}-720.webp`, width: 720, build: true }] : []),
      { path: full, width: fullWidth, ...(buildFull ? { build: true } : null) },
    ],
  };
};

/* Keyed by the URL the tile's `src` keeps. */
export const PORTRAIT_THUMBNAILS: Record<string, ImageSet> = {
  "/civilian-yuma-20260826.jpeg": portrait(
    "/civilian-yuma-20260826.jpeg",
    "/civilian-yuma-20260826-delivery.webp",
    960,
  ),
  "/civilian-bell-20260826.jpeg": portrait(
    "/civilian-bell-20260826.jpeg",
    "/civilian-bell-20260826-delivery.webp",
    853,
  ),
  "/civilian-lore.jpeg": portrait("/civilian-lore.jpeg", "/civilian-lore-delivery.webp", 1200),
  "/civilian-leddic.jpeg": portrait("/civilian-leddic.jpeg", "/civilian-leddic-delivery.webp", 1086),
  "/civilian-naikami-chigiri.jpeg": portrait(
    "/civilian-naikami-chigiri.jpeg",
    "/civilian-naikami-chigiri-delivery.webp",
    1050,
    true,
  ),
  "/civilian-argenome.jpeg": portrait(
    "/civilian-argenome.jpeg",
    "/civilian-argenome-delivery.webp",
    1102,
  ),
  "/character-james-20260829.webp": portrait(
    "/character-james-20260829.jpg",
    "/character-james-20260829.webp",
    720,
  ),
  "/character-luna.webp": portrait("/character-luna.jpeg", "/character-luna.webp", 1028),
  "/character-terra.webp": portrait("/character-terra.jpeg", "/character-terra.webp", 1080),
  "/character-yoake-mamori.jpeg": portrait(
    "/character-yoake-mamori.jpeg",
    "/character-yoake-mamori-delivery.webp",
    736,
    true,
  ),
};

// Tiles, measured at 320-1920 px with their crop zoom (up to 1.3): two
// columns under 560 px, three to 899 px, four to 1099 px, then five, and an
// opened profile's face at about 28% of the row (at most 480 px).
export const PORTRAIT_THUMBNAIL_SIZES =
  "(max-width: 559px) 56vw, (max-width: 899px) 37vw, (max-width: 1099px) 29vw, min(28.3vw, 480px)";

export function portraitThumbnail(source: string) {
  const set = PORTRAIT_THUMBNAILS[source];
  return set ? { srcSet: srcSet(set), sizes: PORTRAIT_THUMBNAIL_SIZES } : {};
}

// The World hero's poster deck turns every 5.2s and fetches the next poster:
// 32 supplied JPEGs of 225-800 KB (11.9 MB for the round). The same file
// fills the full-bleed hero backdrop, so each poster is fetched once, at its
// own width. It gains a WebP delivery copy of the same pixels (a re-encode by
// scripts/build-card-variants.mjs, 3-5 times smaller), used for both src and
// the 1x srcset so warmups and DOM updates select the same resource. The first
// poster keeps its delivery file, which the opening's handoff and the route
// preload share, and the two rider key visuals reuse the rider panel's WebPs.
const POSTER_SOURCES: readonly (readonly [string, number])[] = [
  ["/poster-card-03.jpeg", 1086],
  ["/poster-card-04.jpeg", 1023],
  ["/poster-card-05.jpeg", 1086],
  ["/poster-card-06.jpeg", 1086],
  ["/poster-card-07.jpeg", 1254],
  ["/poster-card-08.jpeg", 1254],
  ["/poster-card-10.jpeg", 1122],
  ["/poster-card-11.jpeg", 1122],
  ["/poster-card-12.jpeg", 1122],
  ["/poster-card-13.jpeg", 1086],
  ["/poster-card-14.jpeg", 1086],
  ["/poster-card-15.jpeg", 1536],
  ["/poster-card-16.jpeg", 1672],
  ["/poster-card-17.jpeg", 960],
  ["/poster-card-18.jpeg", 876],
  ["/poster-card-19.jpeg", 1280],
  ["/poster-card-20.jpeg", 1024],
  ["/poster-card-21.jpeg", 1280],
  ["/poster-card-22.jpeg", 853],
  ["/poster-card-23.jpeg", 1024],
  ["/poster-card-24.jpeg", 960],
  ["/poster-card-25.jpeg", 861],
  ["/poster-card-26.jpeg", 1024],
  ["/poster-card-27.jpeg", 1122],
  ["/poster-card-28.jpeg", 1024],
  ["/poster-card-29.jpeg", 1024],
  ["/poster-card-30.jpeg", 1023],
  ["/poster-card-31.jpeg", 1122],
  ["/poster-card-32-20260825.jpeg", 1122],
  ["/poster-card-33.jpeg", 1122],
  // The Dream Chapter's poster console turns the same way (15 JPEGs of
  // 190-700 KB). Poster 05 is also the page's hero and a warmed route asset:
  // the hero, its preload, the dive's warm-up and the console all ask for its
  // one WebP (DREAM_CHAPTER_HERO_ART in asset-loader.ts).
  ["/dream-chapter-poster-01.jpeg", 1126],
  ["/dream-chapter-poster-02.jpeg", 1024],
  ["/dream-chapter-poster-03.jpeg", 1448],
  ["/dream-chapter-poster-04.jpeg", 1448],
  ["/dream-chapter-poster-05.jpeg", 1448],
  ["/dream-chapter-poster-06.jpeg", 1086],
  ["/dream-chapter-poster-07.jpeg", 1024],
  ["/dream-chapter-poster-08.jpeg", 1086],
  ["/dream-chapter-poster-09.jpeg", 1024],
  ["/dream-chapter-poster-10.jpeg", 1280],
  ["/dream-chapter-poster-11.jpeg", 1280],
  ["/dream-chapter-poster-12.jpeg", 1254],
  ["/dream-chapter-poster-13.jpeg", 1280],
  ["/dream-chapter-poster-14.jpeg", 1280],
  ["/dream-chapter-poster-15.jpeg", 1280],
];

export const POSTER_IMAGES: Record<string, ImageSet> = {
  ...Object.fromEntries(
    POSTER_SOURCES.map(([source, width]) => [
      source,
      {
        source,
        variants: [
          { path: source.replace(/\.jpe?g$/, "-delivery.webp"), width, build: true },
        ],
      },
    ]),
  ),
  "/rider-saga-rexonance-thumbnail-20260827.jpeg": {
    source: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    variants: [{ path: "/rider-saga-rexonance-thumbnail-20260827.webp", width: 680 }],
  },
  "/rider-vandal-thumbnail-20260827.jpeg": {
    source: "/rider-vandal-thumbnail-20260827.jpeg",
    variants: [{ path: "/rider-vandal-thumbnail-20260827.webp", width: 720 }],
  },
};

// The Dream Chapter's title logo: 1280 px as supplied, for a 220-480 px slot
// (480 on portrait tablets, 420 on desktops). One WebP at twice the widest
// slot; the hero and the dive's warm-up ask for it (DREAM_CHAPTER_LOGO).
export const TITLE_LOGO_IMAGES: Record<string, ImageSet> = {
  "/dream-chapter-logo.jpeg": {
    source: "/dream-chapter-logo.jpeg",
    variants: [{ path: "/dream-chapter-logo-delivery.webp", width: 960, build: true }],
  },
};

export function posterImage(source: string) {
  const set = POSTER_IMAGES[source];
  // Keep src and srcset identical: WebKit can otherwise start the original
  // JPEG while React changes a keyed poster, invalidating the decoded warmup.
  return set ? { src: set.variants[0].path, srcSet: set.variants[0].path } : {};
}

/* The deck warms and decodes the next poster in a detached Image before it
   turns: it asks for the same file the cards and the backdrop then show. */
export function preparePosterImage(image: HTMLImageElement, source: string) {
  const set = POSTER_IMAGES[source];
  if (set) image.srcset = set.variants[0].path;
  image.src = set?.variants[0].path ?? source;
}

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
