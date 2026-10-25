import type { GalleryArtwork } from "@/components/gallery/gallery-data";

export type ExhibitionFormat = "all" | "portrait" | "landscape" | "square";

export function findExhibitionArtworks(
  artworks: readonly GalleryArtwork[],
  query: string,
  format: ExhibitionFormat,
) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ja");
  const number = /^(?:g)?0*(\d+)$/u.exec(normalized);
  const words = normalized.split(/\s+/u).filter(Boolean);
  return artworks.flatMap((artwork, index) => {
    const artworkFormat =
      artwork.width === artwork.height
        ? "square"
        : artwork.width < artwork.height
          ? "portrait"
          : "landscape";
    if (format !== "all" && artworkFormat !== format) return [];
    if (number) return index + 1 === Number(number[1]) ? [{ artwork, index }] : [];
    const text = `${artwork.title} ${artwork.alt}`.normalize("NFKC").toLocaleLowerCase("ja");
    return words.every((word) => text.includes(word)) ? [{ artwork, index }] : [];
  });
}

export function exhibitionBrowsePage(total: number, requested: number, size: number) {
  const count = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(0, requested), count - 1);
  return { count, page, start: page * size, end: Math.min(total, (page + 1) * size) };
}
