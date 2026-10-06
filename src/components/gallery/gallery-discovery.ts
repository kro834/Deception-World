import type { GalleryArtwork } from "./gallery-data";

export const GALLERY_FAVORITES_KEY = "deception-world.gallery-favorites.v1";

export type GalleryFavorites = readonly string[];
type FavoriteStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeGalleryQuery(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").trim().replace(/\s+/g, " ");
}

export function matchesGalleryQuery(
  artwork: GalleryArtwork,
  query: string,
  personalTitle?: string,
): boolean {
  const normalized = normalizeGalleryQuery(query);
  if (!normalized) return true;
  const number = artwork.id.slice(1).padStart(3, "0");
  const searchable = normalizeGalleryQuery(
    [artwork.id, number, personalTitle, artwork.alt].filter(Boolean).join(" "),
  );
  return searchable.includes(normalized);
}

export function filterGalleryArtworks(
  artworks: readonly GalleryArtwork[],
  options: {
    category: string;
    query: string;
    favoritesOnly: boolean;
    favorites: GalleryFavorites;
    titles: Readonly<Record<string, string>>;
  },
): GalleryArtwork[] {
  const favoriteIds = new Set(options.favorites);
  return artworks.filter(
    (artwork) =>
      (options.category === "all" || artwork.category === options.category) &&
      (!options.favoritesOnly || favoriteIds.has(artwork.id)) &&
      matchesGalleryQuery(artwork, options.query, options.titles[artwork.id]),
  );
}

export function readGalleryFavorites(
  storage: Pick<Storage, "getItem">,
  artworkIds: readonly string[],
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
  return [...new Set(parsed.filter((id): id is string => typeof id === "string" && knownIds.has(id)))];
}

export function toggleGalleryFavorite(
  storage: FavoriteStorage,
  id: string,
  artworkIds: readonly string[],
): GalleryFavorites {
  if (!artworkIds.includes(id)) throw new Error("Invalid artwork identifier");
  const favorites = new Set(readGalleryFavorites(storage, artworkIds));
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  const next = [...favorites];
  storage.setItem(GALLERY_FAVORITES_KEY, JSON.stringify(next));
  return next;
}
