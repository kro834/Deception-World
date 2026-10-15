import { autoSizedImageRef } from "../../lib/auto-sized-image.ts";
import type { GalleryDensity } from "./gallery-display-preferences.ts";

// The collection uses justified flex rows, not a fixed number of columns.
// Let lazy images select their existing candidates from the actual painted
// width, including the user's density choice and the surrounding works.
// Older engines keep conservative viewport fallbacks. Compact intentionally
// retains the standard fallback: flex growth can make an individual compact
// work wider than a column estimate would suggest. No source is downsampled.
const STANDARD_PORTRAIT = "(max-width: 700px) 46vw, (max-width: 1020px) 30vw, 22vw";
const STANDARD_LANDSCAPE = "(max-width: 700px) 92vw, (max-width: 1020px) 60vw, 44vw";
const SPACIOUS = "(max-width: 700px) 92vw, (max-width: 1020px) 75vw, 60vw";

function presentation(fallback: string) {
  const sizes = `auto, ${fallback}`;
  return { sizes, ref: autoSizedImageRef(sizes) };
}

// These three refs are shared and stable across ordinary page rerenders.
// Each attachment still owns its cleanup, which removes auto sizes before
// React detaches the image (including filtering, navigation and StrictMode).
const portrait = presentation(STANDARD_PORTRAIT);
const landscape = presentation(STANDARD_LANDSCAPE);
const spacious = presentation(SPACIOUS);

export function galleryGridImage(density: GalleryDensity, width: number, height: number) {
  if (density === "spacious") return spacious;
  return width > height ? landscape : portrait;
}
