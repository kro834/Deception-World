// Preview choices belong to one history entry, independently of saved preferences.
const previews = new Map<string, string>();
export function readGalleryStagePreview(entry: string): string | null {
  return previews.get(entry) ?? null;
}
export function rememberGalleryStagePreview(entry: string, id: string | null) {
  if (id === null) previews.delete(entry);
  else previews.set(entry, id);
}
export function resolveGalleryStageArtwork<T extends { id: string }>(
  artworks: readonly T[],
  preview: string | null,
  saved: string | null,
  fallback: T,
): T {
  return (
    artworks.find((artwork) => artwork.id === preview) ??
    artworks.find((artwork) => artwork.id === saved) ??
    fallback
  );
}
