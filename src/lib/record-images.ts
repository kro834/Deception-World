import {
  EPISODE_THUMBNAILS,
  LAUNCHER_TILE_IMAGES,
  PORTRAIT_THUMBNAILS,
} from "./thumbnail-images.ts";
import { dossierImage } from "./dossier-images.ts";
import { FORM_RECORD_IMAGES } from "./record-form-images.ts";

// Covers the crop's height too: portrait cards on phones can be 380px tall.
export const RECORD_ART_SIZES = "(max-width: 560px) 88vw, (max-width: 900px) 46vw, 540px";

export function recordImage(source: string) {
  const form = /^\/archive-media\/thumbs\/(saga|realm)-([\w-]+)\.webp$/.exec(source);
  if (form) {
    const set = FORM_RECORD_IMAGES[`${form[1]}-${form[2]}`];
    if (set)
      return {
        src: set.variants[0].path,
        srcSet: set.variants.map(({ path, width }) => `${path} ${width}w`).join(", "),
        sizes: RECORD_ART_SIZES,
      };
  }
  const portrait = Object.values(PORTRAIT_THUMBNAILS).find((set) =>
    set.variants.some((variant) => variant.path === source),
  );
  if (portrait)
    return {
      src: source,
      srcSet: portrait.variants.map(({ path, width }) => `${path} ${width}w`).join(", "),
      sizes: RECORD_ART_SIZES,
    };
  const episode = Object.values(EPISODE_THUMBNAILS).find((set) =>
    set.variants.some((variant) => variant.path === source),
  );
  if (episode)
    return {
      src: source,
      srcSet: episode.variants.map(({ path, width }) => `${path} ${width}w`).join(", "),
      sizes: RECORD_ART_SIZES,
    };
  const rider = Object.entries(LAUNCHER_TILE_IMAGES).find(
    ([route, set]) => route.startsWith("/riders/") && set.source === source,
  )?.[1];
  if (rider)
    return {
      src: rider.variants[1].path,
      srcSet: `${rider.variants[1].path} 400w, ${source} ${source.includes("saga-rexonance") ? 680 : 720}w`,
      sizes: RECORD_ART_SIZES,
    };
  return { src: source, ...dossierImage(source) };
}
