import { rexonanceImage } from "./rexonance-images.ts";
import { CIEL_PORTRAIT, PORTRAIT_THUMBNAILS, cielPortrait } from "./thumbnail-images.ts";

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
// 720 px files); the full file stays the largest. Keyed by the URL the page
// and its navigation warm-ups (MANAGER_ASSETS, dossier-nav, the World's
// cards) name.
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
  const width = set.variants[set.variants.length - 1].width;
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

// The hero frame (measured at 300-2600 px): 100vw - 38 px on phones, about
// 40vw to 1120 px, then 517-522 px, and 1.25 times as tall on phones, up to 1.5
// above. It crops with object-fit: cover, so a portrait wider than the frame
// needs the frame's height times its aspect. A 1x desktop and a 2x phone to
// 390 px take the 720 px file; 3x phones and 2x desktops keep the full one.
export function dossierHeroSizes(aspect: number) {
  const phone = Math.max(1, aspect * 1.25);
  const wide = Math.max(1, aspect * 1.5);
  const phoneTerm =
    phone > 1 ? `calc((100vw - 36px) * ${+phone.toFixed(3)})` : "calc(100vw - 36px)";
  return `(max-width: 760px) ${phoneTerm}, (max-width: 1120px) ${+(42 * wide).toFixed(1)}vw, ${Math.ceil(524 * wide)}px`;
}

// The Rexonance pickup card on the Saga and シエル files loads eagerly, and
// its record opens from the same file: 382 KB as supplied, for a card of
// 282-569 px (the record's figure is never wider). The card, the record and
// the gate's warm-up ask with the special site's candidates and the card's
// sizes, so each device fetches one file.
const FORM_PICKUP_IMAGES = new Set(["/rider-rexonance-saga-pickup-20260922.webp"]);
export const FORM_PICKUP_SIZES = "(max-width: 760px) calc(100vw - 36px), min(46vw, 570px)";
export function formPickupImage(source: string): { srcSet?: string; sizes?: string } {
  if (!FORM_PICKUP_IMAGES.has(source)) return {};
  return { srcSet: rexonanceImage(source).srcSet, sizes: FORM_PICKUP_SIZES };
}

export function dossierImage(source: string): { srcSet?: string; sizes?: string } {
  const path = source.split("?")[0];
  if (sources.has(path)) return { srcSet: path.replace(/\.jpeg$/, "-delivery.webp") };
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
  return {};
}
