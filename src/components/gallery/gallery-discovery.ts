import {
  galleryNumberFor,
  isCommunityGalleryId,
  type GalleryCollectionArtwork,
} from "./gallery-community-client.ts";

export const GALLERY_FAVORITES_KEY = "deception-world.gallery-favorites.v1";

export type GalleryFavorites = readonly string[];
type FavoriteStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeGalleryQuery(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").trim().replace(/\s+/g, " ");
}

export type GallerySearchQuery =
  | { kind: "text"; terms: readonly string[] }
  | { kind: "number"; collection: "catalogue" | "community"; from: number; to: number };

/** Numbers refer to the displayed catalogue, not digits within titles or IDs. */
export function parseGalleryQuery(query: string): GallerySearchQuery {
  const normalized = normalizeGalleryQuery(query);
  const number = /^([gu]?)(\d+)(?:\s*[-–—〜~]\s*([gu]?)(\d+))?$/.exec(normalized);
  if (number) {
    const collection = number[1] === "u" ? "community" : "catalogue";
    const lastCollection = !number[3] ? collection : number[3] === "u" ? "community" : "catalogue";
    const first = Number(number[2]);
    const last = Number(number[4] ?? number[2]);
    if (
      collection === lastCollection &&
      Number.isSafeInteger(first) &&
      Number.isSafeInteger(last) &&
      first >= 0 &&
      last >= 0
    ) {
      return {
        kind: "number",
        collection,
        from: Math.min(first, last),
        to: Math.max(first, last),
      };
    }
  }
  return { kind: "text", terms: [...new Set(normalized.split(" ").filter(Boolean))] };
}

export function matchesParsedGalleryQuery(
  artwork: GalleryCollectionArtwork,
  query: GallerySearchQuery,
  publicTitle?: string,
): boolean {
  if (query.kind === "number") {
    const community = isCommunityGalleryId(artwork.id);
    if (community !== (query.collection === "community")) return false;
    const catalogueNumber = /^g(\d+)$/i.exec(artwork.id)?.[1];
    const number = community ? artwork.communitySequence : Number(catalogueNumber);
    return (
      typeof number === "number" &&
      Number.isSafeInteger(number) &&
      number >= query.from &&
      number <= query.to
    );
  }
  if (query.terms.length === 0) return true;
  const fields = [artwork.id, galleryNumberFor(artwork), publicTitle, artwork.alt]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeGalleryQuery);
  // Words may match different fields, but a word cannot cross an artificial
  // boundary between a title and the image description.
  return query.terms.every((term) => fields.some((field) => field.includes(term)));
}

export function matchesGalleryQuery(
  artwork: GalleryCollectionArtwork,
  query: string,
  publicTitle?: string,
): boolean {
  return matchesParsedGalleryQuery(artwork, parseGalleryQuery(query), publicTitle);
}

export function filterGalleryArtworks(
  artworks: readonly GalleryCollectionArtwork[],
  options: {
    category: string;
    query: string;
    favoritesOnly: boolean;
    favorites: GalleryFavorites;
    titles: Readonly<Record<string, string>>;
  },
): GalleryCollectionArtwork[] {
  const favoriteIds = new Set(options.favorites);
  const query = parseGalleryQuery(options.query);
  return artworks.filter(
    (artwork) =>
      (options.category === "all" || artwork.category === options.category) &&
      (!options.favoritesOnly || favoriteIds.has(artwork.id)) &&
      matchesParsedGalleryQuery(artwork, query, options.titles[artwork.id]),
  );
}

export function readGalleryFavorites(
  storage: Pick<Storage, "getItem">,
  artworkIds: readonly string[],
  preserveCommunityIds = false,
): GalleryFavorites {
  const raw = storage.getItem(GALLERY_FAVORITES_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const knownIds = new Set(artworkIds);
  return [
    ...new Set(
      parsed.filter(
        (id): id is string =>
          typeof id === "string" &&
          (knownIds.has(id) || (preserveCommunityIds && isCommunityGalleryId(id))),
      ),
    ),
  ];
}

export function toggleGalleryFavorite(
  storage: FavoriteStorage,
  id: string,
  artworkIds: readonly string[],
): GalleryFavorites {
  if (!artworkIds.includes(id)) throw new Error("Invalid artwork identifier");
  // A shared post can load after favorites. Keep its valid identifier when
  // writing, while the target must belong to this tab's loaded collection.
  const favorites = new Set(readGalleryFavorites(storage, artworkIds, true));
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  const next = [...favorites];
  storage.setItem(GALLERY_FAVORITES_KEY, JSON.stringify(next));
  return next;
}
