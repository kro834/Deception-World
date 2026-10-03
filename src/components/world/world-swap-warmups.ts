import { warmRexonanceStages } from "@/lib/warm-rexonance-stages";
import { OTHER_ARTWORK } from "./other-artwork-card";

/* First views of the World's swaps paint their pictures at once (2026-10-03).
   The rider rail mounts a rider's art only when it is chosen, and REVERSE /
   RELATED mount their cards only when their tab opens, all lazily: a first
   choice showed the new rider's name over the previous rider's art for
   150-300 ms (a dark frame on phones, once the old art unmounted), and
   RELATED drew its cards as text, then popped five pictures in over about
   0.8 s on 4G. Once each block nears the screen, the other riders' art and
   those tabs' pictures are fetched and decoded one at a time in idle time,
   at low priority (warmRexonanceStages: never on Save-Data or 2G/3G), and
   not at all in economy rendering. Each warm-up asks for the painted
   element's own candidates, so it fetches the very file the swap paints. */

/** The rider panel <img>'s sizes (world-home.tsx, .rider-visual). */
export const RIDER_ART_SIZES = "(max-width: 760px) 92vw, (max-width: 1120px) 48vw, 560px";

/** The rider panel <img>'s candidates: its JPEG's WebP copy, as its srcSet. */
export function riderArtCandidates(source: string) {
  return { srcSet: source.replace(/\.jpe?g$/i, ".webp"), sizes: RIDER_ART_SIZES };
}

/** The pictures REVERSE (ダンテ) and RELATED show, cheapest first. They are
 * plain sources (no srcset) in world-home.tsx and other-artwork-card.tsx. */
export const ARCHIVE_TAB_PICTURES: readonly string[] = [
  "/character-dante-thumb.webp",
  ...OTHER_ARTWORK.map((artwork) => artwork.thumb),
  "/character-yoake-mamori.jpeg",
  "/character-terra-thumb.jpeg",
  "/character-luna-thumb.jpeg",
];

const plainSource = () => ({});

/** Warm the riders after the shown one (in rail order, wrapping) and the
 * archive's other tabs. Returns the cleanup. */
export function warmWorldSwaps(
  root: ParentNode,
  riderArt: readonly string[],
  shownRider: number,
) {
  if (document.documentElement.dataset.worldEffects === "economy") return () => {};
  const cleanups: (() => void)[] = [];
  const riderConsole = root.querySelector(".riders-section .rider-console");
  if (riderConsole && riderArt.length > 1) {
    const order = riderArt
      .map((_, step) => riderArt[(shownRider + 1 + step) % riderArt.length])
      .slice(0, riderArt.length - 1);
    cleanups.push(warmRexonanceStages(riderConsole, order, riderArtCandidates));
  }
  const archive = root.querySelector("#manager-archive");
  if (archive) cleanups.push(warmRexonanceStages(archive, ARCHIVE_TAB_PICTURES, plainSource));
  return () => cleanups.forEach((cleanup) => cleanup());
}
