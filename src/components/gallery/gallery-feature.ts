import { isCommunityGalleryId } from "./gallery-community-client.ts";

export const GALLERY_FEATURE_KEY = "deception-world.gallery-feature.v1";

export function readGalleryFeature(
  storage: Pick<Storage, "getItem">,
  artworkIds: readonly string[],
): string | null {
  const id = storage.getItem(GALLERY_FEATURE_KEY);
  return id && (artworkIds.includes(id) || isCommunityGalleryId(id)) ? id : null;
}

export function saveGalleryFeature(
  storage: Pick<Storage, "setItem" | "removeItem">,
  id: string | null,
  artworkIds: readonly string[],
): void {
  if (id === null) storage.removeItem(GALLERY_FEATURE_KEY);
  else {
    if (!artworkIds.includes(id)) throw new Error("Invalid artwork identifier");
    storage.setItem(GALLERY_FEATURE_KEY, id);
  }
}
