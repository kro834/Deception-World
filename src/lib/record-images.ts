import {
  EPISODE_THUMBNAILS,
  LAUNCHER_TILE_IMAGES,
  PORTRAIT_THUMBNAILS,
} from "./thumbnail-images.ts";
import { dossierImage } from "./dossier-images.ts";
import { FORM_RECORD_IMAGES } from "./record-form-images.ts";

// The index pages' art windows (/library, /search) crop with object-fit:
// cover, so a picture needs the window's HEIGHT times its own aspect ratio
// when it is wider than the window (ゼウス's landscape card, the posters,
// ローア's square file), not merely the window's width. Each slot below says
// the CSS width its art must be decoded at, measured 2026-10-21 at 320-1920px
// with the widest aspect the slot holds, so a 2x iPad and a 3x phone get a
// candidate that is at least as wide as the pixels they paint.
//
// card: the shelf/result grid (2-6 columns of 4:5 windows; phones under 440px
//   set a 96px spine beside the words, up to 200px tall).
// side: a card that closes its row lies on its side (art 120-380px wide,
//   210-260px tall): the widest window the grid makes.
// row: the saved/history rows' 34px tab. continue: the 84px continue tab.
// stop: an inquiry entrance's 16:9 window (a third of the page, or all of it).
// peek: the see-all tile's strip of next records (its tile is 1-6 columns).
// strip: an inquiry tile's three standing strips (95-175px by 258-378px).
// cast: the hero rail's 3:4.3 files (118-168px on tablets, 1/8 of the page).
export const RECORD_ART_SIZES =
  "(max-width: 439px) 200px, (max-width: 559px) 62vw, (max-width: 899px) 44vw, (max-width: 1179px) 34vw, (max-width: 1399px) 27vw, 380px";
export const RECORD_ART_SLOT_SIZES = {
  card: RECORD_ART_SIZES,
  row: "56px",
  continue: "140px",
  stop: "(max-width: 899px) 92vw, 30vw",
  peek: "(max-width: 559px) 48vw, (max-width: 899px) 40vw, 32vw",
  strip: "480px",
  cast: "220px",
} as const;
export type RecordArtSlot = keyof typeof RECORD_ART_SLOT_SIZES;

type Variant = { path: string; width: number; build?: boolean };
type IndexArt = { source: string; variants: Variant[] };

// Every picture the index names that has (or now gains) a right-sized set:
// keyed by the path src/lib/record-art.ts gives as `src`. Only published
// files are named; the two sets marked `build` are drawn by
// scripts/build-record-art.mjs from the larger file of the same picture
// (never upscaled). The riders, the World cast wall, the episodes and the
// Form Archive's forms resolve through their own sets below.
const steps = (stem: string, widths: number[], ext = "webp"): Variant[] =>
  widths.map((width) => ({ path: `${stem}-${width}.${ext}`, width }));
export const INDEX_ART_IMAGES: Record<string, IndexArt> = {
  // 六詠: the manager cards' 480 and 640px files; ゼウス's landscape card
  // also has its 960px step (drawn from /manager-zeus.jpeg for the World).
  "/manager-zeus-thumb-480.webp": {
    source: "/manager-zeus.jpeg",
    variants: [
      ...steps("/manager-zeus-thumb", [480]),
      { path: "/manager-zeus-thumb.webp", width: 640 },
      ...steps("/manager-zeus-thumb", [960]),
    ],
  },
  "/manager-rex-loi-thumb-480.webp": {
    source: "/manager-rex-loi.jpeg",
    variants: [
      ...steps("/manager-rex-loi-thumb", [480]),
      { path: "/manager-rex-loi-thumb.webp", width: 640 },
    ],
  },
  "/manager-shuza-thumb-480.webp": {
    source: "/manager-shuza.jpeg",
    variants: [
      ...steps("/manager-shuza-thumb", [480]),
      { path: "/manager-shuza-thumb.webp", width: 640 },
    ],
  },
  "/manager-lejas-portrait-thumb-480.webp": {
    source: "/manager-lejas.jpeg",
    variants: [
      ...steps("/manager-lejas-portrait-thumb", [480]),
      { path: "/manager-lejas-portrait-thumb.webp", width: 640 },
    ],
  },
  "/manager-opus-thumb-480.webp": {
    source: "/manager-opus.jpeg",
    variants: [
      ...steps("/manager-opus-thumb", [480]),
      { path: "/manager-opus-thumb.webp", width: 640 },
    ],
  },
  "/manager-reemu-thumb-480.webp": {
    source: "/manager-reemu.jpeg",
    variants: [
      ...steps("/manager-reemu-thumb", [480]),
      { path: "/manager-reemu-thumb.webp", width: 540 },
    ],
  },
  "/ciel-thumb-20260924-480.webp": {
    source: "/ciel-thumb-20260924.jpeg",
    variants: [
      ...steps("/ciel-thumb-20260924", [480]),
      { path: "/ciel-thumb-20260924.webp", width: 640 },
    ],
  },
  // ダンテ's file card: a 720px step drawn from his full illustration.
  "/character-dante-thumb.webp": {
    source: "/character-dante.webp",
    variants: [
      { path: "/character-dante-thumb.webp", width: 360 },
      { path: "/character-dante-thumb-720.webp", width: 720, build: true },
    ],
  },
  // The Dream Chapter's card: its 320px poster thumbnail gains 480 and 720px
  // steps drawn from the poster's delivery file (the same picture).
  "/dream-chapter-poster-thumb-01.jpeg": {
    source: "/dream-chapter-poster-01-delivery.webp",
    variants: [
      { path: "/dream-chapter-poster-thumb-01.jpeg", width: 320 },
      { path: "/dream-chapter-poster-thumb-01-480.webp", width: 480, build: true },
      { path: "/dream-chapter-poster-thumb-01-720.webp", width: 720, build: true },
    ],
  },
  "/gallery/g01-480.webp": {
    source: "/gallery/g01-1024.webp",
    variants: steps("/gallery/g01", [480, 900, 1024]),
  },
  "/rider-far-from-saga-max-delivery-640.webp": {
    source: "/rider-far-from-saga-max.webp",
    variants: steps("/rider-far-from-saga-max-delivery", [640, 960, 1086]),
  },
  "/character-nagi-20260922-delivery-640.webp": {
    source: "/character-nagi-20260922.webp",
    variants: steps("/character-nagi-20260922-delivery", [640, 960, 1086]),
  },
  "/character-archive-delivery-640.webp": {
    source: "/character-archive.webp",
    variants: steps("/character-archive-delivery", [640, 960, 1086]),
  },
};

const srcSetOf = (variants: readonly Variant[]) =>
  variants.map(({ path, width }) => `${path} ${width}w`).join(", ");

export function recordImage(source: string, slot: RecordArtSlot = "card") {
  const sizes = RECORD_ART_SLOT_SIZES[slot];
  const form = /^\/archive-media\/thumbs\/(saga|realm)-([\w-]+)\.webp$/.exec(source);
  if (form) {
    const set = FORM_RECORD_IMAGES[`${form[1]}-${form[2]}`];
    if (set) return { src: set.variants[0].path, srcSet: srcSetOf(set.variants), sizes };
  }
  const index = INDEX_ART_IMAGES[source];
  if (index) return { src: source, srcSet: srcSetOf(index.variants), sizes };
  const portrait = Object.values(PORTRAIT_THUMBNAILS).find((set) =>
    set.variants.some((variant) => variant.path === source),
  );
  if (portrait) return { src: source, srcSet: srcSetOf(portrait.variants), sizes };
  const episode = Object.values(EPISODE_THUMBNAILS).find((set) =>
    set.variants.some((variant) => variant.path === source),
  );
  if (episode) return { src: source, srcSet: srcSetOf(episode.variants), sizes };
  const rider = Object.entries(LAUNCHER_TILE_IMAGES).find(
    ([route, set]) => route.startsWith("/riders/") && set.source === source,
  )?.[1];
  if (rider)
    return {
      src: rider.variants[1].path,
      srcSet: `${rider.variants[1].path} 400w, ${source} ${source.includes("saga-rexonance") ? 680 : 720}w`,
      sizes,
    };
  // A dossier picture named by its supplied file resolves to its delivery
  // WebP (one candidate: the browser takes it at any size).
  return { src: source, ...dossierImage(source) };
}
