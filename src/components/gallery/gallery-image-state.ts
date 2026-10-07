export type GalleryImageLoadStatus = "loading" | "ready" | "error";

/** A successful standard image remains visible while high quality is retried. */
export function galleryImagePresentation(
  full: GalleryImageLoadStatus,
  medium: GalleryImageLoadStatus,
  hasSeparateMedium: boolean,
) {
  const showingMedium = hasSeparateMedium && medium === "ready" && full !== "ready";
  const waitingForMedium = hasSeparateMedium && medium === "loading";
  return {
    showingMedium,
    waitingForMedium,
    imageUnavailable: full === "error" && (!hasSeparateMedium || medium === "error"),
    busy: !showingMedium && (full === "loading" || (full === "error" && waitingForMedium)),
    canZoom: full === "ready",
  };
}
