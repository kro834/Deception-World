import { rexonanceImage } from "./rexonance-images.ts";
import {
  CIEL_PORTRAIT,
  CIEL_PORTRAIT_SIZES,
  PORTRAIT_THUMBNAILS,
  cielPortrait,
} from "./thumbnail-images.ts";

// Shared delivery choice for navigation warmup and visible image elements.
export const dossierImageSources = [
  "/civilian-yuma-20260826.jpeg",
  "/civilian-bell-20260826.jpeg",
  "/civilian-lore.jpeg",
  "/civilian-vandal.jpeg",
  "/civilian-leddic.jpeg",
  "/civilian-argenome.jpeg",
  "/civilian-cipher.jpeg",
  "/episode-01-hide-and-seek.jpeg",
  "/episode-02-legends.jpeg",
  "/episode-03-deception-world.jpeg",
  "/episode-04-kill.jpeg",
  "/episode-05-farce.jpeg",
  // The Saga file's nightmare pickup (and its Final Stage card): 721 KB as
  // supplied, for a card that stays under 600 px.
  "/nightmare-machiavel-gore.jpeg",
  "/rider-profile-saga.jpeg",
  "/rider-profile-realm.jpeg",
  "/rider-profile-lore.jpeg",
  "/rider-profile-vandal.jpeg",
  "/rider-profile-leddic.jpeg",
  "/rider-profile-argenome.jpeg",
  "/rider-profile-over-zeztz.jpeg",
  "/rider-over-zeztz-explom-20261019-v2.jpeg",
  "/rider-leddic-ishihen.jpeg",
  "/rider-leddic-hoko.jpeg",
  "/rider-leddic-rekka-20260829.jpeg",
  "/rider-leddic-kemonohen-9237.jpeg",
  "/rider-cipher.jpeg",
  "/rider-cipher-blacksite.jpeg",
  "/rider-vandal-20260826.jpeg",
  // The 六詠 riders' and Realm's Earth/Moon form pickups (their files, the
  // World's episode pickups and their warm-ups): 451-761 KB as supplied.
  "/manager-shuza-rider.jpeg",
  "/manager-lejas-rider.jpeg",
  "/manager-opus-rider.jpeg",
  "/manager-reemu-rider.jpeg",
  "/rider-realm-earth.jpeg",
  "/rider-realm-moon.jpeg",
  "/character-luna-thumb.jpeg",
  "/character-terra-thumb.jpeg",
  "/dream-chapter-ciel.jpeg",
  "/dream-chapter-keiya.jpeg",
  "/dream-chapter-keiya-awakened.jpeg",
  "/dream-chapter-kaisaku.jpeg",
  "/dream-chapter-lord-knight.jpeg",
  "/dream-chapter-lord-chaos.jpeg",
  "/dream-chapter-lord-chaos-spec.jpeg",
  "/dream-chapter-dread.jpeg",
  "/dream-chapter-lupin.jpeg",
] as const;
const sources = new Set<string>(dossierImageSources);
// レジャス's page draws its own two-layer hero (lejas-page.tsx, a 72 KB WebP):
// its warm-up keeps asking for that one file.
const managerWebp = new Set(["/manager-lejas.jpeg"]);

type HeroVariant = { path: string; width: number; build?: boolean };
type HeroImage = { source: string; variants: HeroVariant[]; aspect: number };

// The character files' hero portraits (five managers, テラ and ルナ) loaded
// their full delivery file at every size (up to 362 KB for a 517 px frame).
// They gain a 720 px candidate (テラ and ルナ reuse the cast wall's 360 and
// 720 px files); the full file stays the largest, except テラ's, whose
// supplied JPEG (1470 px) is wider than its old delivery file. Keyed by the
// URL the page and its navigation warm-ups (MANAGER_ASSETS, dossier-nav, the
// World's cards) name.
const managerHero = (stem: string, width: number, height: number): HeroImage => ({
  source: `${stem}.jpeg`,
  variants: [
    { path: `${stem}-720.webp`, width: 720, build: true },
    { path: `${stem}.webp`, width },
  ],
  aspect: width / height,
});
const portraitHero = (full: string, height: number): HeroImage => {
  const set = PORTRAIT_THUMBNAILS[full];
  // The aspect is the full delivery file's (its height is given), even when a
  // wider step drawn from the supplied file follows it.
  const width = (set.variants.find((variant) => variant.path === full) ?? set.variants[0]).width;
  return {
    source: set.source,
    variants: set.variants.map(({ path, width: size }) => ({ path, width: size })),
    aspect: width / height,
  };
};
export const DOSSIER_HERO_IMAGES: Record<string, HeroImage> = {
  "/manager-zeus-detail.jpeg": managerHero("/manager-zeus-detail", 1080, 1350),
  "/manager-opus.jpeg": managerHero("/manager-opus", 1080, 1435),
  "/manager-rex-loi.jpeg": managerHero("/manager-rex-loi", 1024, 1536),
  "/manager-shuza.jpeg": managerHero("/manager-shuza", 1050, 1498),
  "/manager-reemu.jpeg": managerHero("/manager-reemu", 941, 1672),
  "/character-luna.jpeg": portraitHero("/character-luna.webp", 1800),
  "/character-terra.jpeg": portraitHero("/character-terra.webp", 1431),
};

// The hero frame (the STAGE dossier, re-measured 2026-10-15 at 320-2560 x
// 390-1366 px): the screen's width on phones, about 54vh tall; on the split
// stage (1100 px and up and 540 px tall, or a landscape 900 px and 600 px
// tall) min(46vw, 820px) wide by 100vh - 76px; otherwise a stacked frame 0.92
// as wide as tall, at most 353 px or 49vh. The old 517 px desktop frame is
// 662 px at 1440 x 900 and 820 px at 1920 x 1080, where a 1x screen took the
// 720 px file. It crops with object-fit: cover, so a portrait narrower than
// the frame needs the frame's height times its aspect. Phones ask for 92vw
// (within the site's 0.9 rule), so a 2x phone keeps the 720 px file and a 3x
// phone the full one, as before.
export function dossierHeroSizes(aspect: number) {
  const a = +aspect.toFixed(3);
  const split = `max(min(46vw, 820px), calc((100vh - 76px) * ${a}))`;
  return `(max-width: 760px) max(92vw, ${+(55 * a).toFixed(1)}vh), (min-width: 1100px) and (min-height: 540px) ${split}, (min-width: 900px) and (min-height: 600px) and (orientation: landscape) ${split}, min(100vw, max(353px, 49vh))`;
}

// The Rexonance pickup card on the Saga and シエル files loads eagerly, and
// its record opens from the same file: 382 KB as supplied. The card, the
// record and the gate's warm-up ask with the special site's candidates and
// the card's sizes, so each device fetches one file. The STAGE card's figure
// is min(stage width, 0.8 x stage height) (styles-stage-dossier.css): the
// screen's width on phones, up to 699 px on portrait tablets (0.8 x 64svh),
// then min(46vw, 0.8 x (100svh - header)), 659 px at 1440 x 900. The old
// 46vw/570 px cap had a 2x iPad portrait take the 960 px step for a 699 px
// figure.
const FORM_PICKUP_IMAGES = new Set(["/rider-rexonance-saga-pickup-20260922.webp"]);
export const FORM_PICKUP_SIZES =
  "(max-width: 760px) 100vw, (orientation: portrait) min(100vw, 720px), min(46vw, 820px, 80vh)";
export function formPickupImage(source: string): { srcSet?: string; sizes?: string } {
  if (!FORM_PICKUP_IMAGES.has(source)) return {};
  return { srcSet: rexonanceImage(source).srcSet, sizes: FORM_PICKUP_SIZES };
}

export function dossierImage(source: string): { srcSet?: string; sizes?: string } {
  const path = source.split("?")[0];
  if (sources.has(path)) return { srcSet: path.replace(/\.(?:jpeg|png)$/, "-delivery.webp") };
  if (managerWebp.has(path)) return { srcSet: path.replace(/\.jpeg$/, ".webp") };
  const hero = DOSSIER_HERO_IMAGES[path];
  if (hero) {
    return {
      srcSet: hero.variants.map(({ path: file, width }) => `${file} ${width}w`).join(", "),
      sizes: dossierHeroSizes(hero.aspect),
    };
  }
  // シエル's warm-up names his illustration as supplied: it resolves to his
  // hero's candidates (ciel-page.tsx).
  if (path === CIEL_PORTRAIT.source) return cielPortrait();
  // Only the newly responsive partner/related slots. The James hero and
  // its covered-navigation warm-up intentionally still share one WebP.
  const portrait =
    path === "/civilian-naikami-chigiri.jpeg" || path === "/character-yoake-mamori.jpeg"
      ? PORTRAIT_THUMBNAILS[path]
      : undefined;
  if (portrait)
    return {
      srcSet: portrait.variants.map(({ path: file, width }) => `${file} ${width}w`).join(", "),
      sizes: CIEL_PORTRAIT_SIZES,
    };
  if (path === "/saga-extreme-middle-20261006.jpeg") {
    return { srcSet: "/saga-extreme-middle-20261006.webp" };
  }
  return {};
}
