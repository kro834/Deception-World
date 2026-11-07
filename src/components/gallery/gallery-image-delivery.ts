import { GALLERY_DETAIL } from "./gallery-detail-assets.ts";
import type { GalleryImageViewport } from "./gallery-viewer-state.ts";

// Successful native-size loads are shared by the hero and viewer in this tab.
// No speculative request is made to discover whether a different work is cached.
const nativeLoads = new Set<string>();
export function galleryNativeIsReady(full: string) {
  return nativeLoads.has(full);
}
export function rememberGalleryNativeLoad(full: string, currentSrc: string) {
  if (!currentSrc || typeof window === "undefined") return false;
  if (
    new URL(currentSrc, window.location.href).pathname !==
    new URL(full, window.location.href).pathname
  )
    return false;
  nativeLoads.add(full);
  return true;
}

export function galleryZoomSource(
  work: { full: string; srcSet: string; fullSrcSet?: string },
  fitWidth: number,
  pixelRatio: number,
) {
  const target = fitWidth * 2 * Math.max(1, pixelRatio);
  const candidates = (work.fullSrcSet ?? work.srcSet)
    .split(",")
    .filter(Boolean)
    .map((candidate) => {
      const [path, descriptor] = candidate.trim().split(/\s+/);
      return { path, width: Number.parseInt(descriptor) };
    })
    .sort((a, b) => a.width - b.width);
  return candidates.find((candidate) => candidate.width >= target)?.path ?? work.full;
}

export function galleryFitSizes(width: number, height: number) {
  const ratio = width / height;
  return `min(calc(100vw - 48px), ${(80 * ratio).toFixed(3)}vh)`;
}

export function galleryStageSizes(width: number, height: number) {
  const ratio = width / height;
  return `min(calc(100vw - 64px), clamp(${360 * ratio}px, ${65 * ratio}vh, ${780 * ratio}px))`;
}

/** Intersect source pixels with the visible part of an object-fit:contain canvas. */
export function galleryVisibleDetailTiles(viewport: GalleryImageViewport) {
  const scale = Math.min(
    viewport.scrollWidth / GALLERY_DETAIL.width,
    viewport.scrollHeight / GALLERY_DETAIL.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const x = (viewport.scrollWidth - GALLERY_DETAIL.width * scale) / 2;
  const y = (viewport.scrollHeight - GALLERY_DETAIL.height * scale) / 2;
  const left = (viewport.left - x) / scale;
  const top = (viewport.top - y) / scale;
  const right = (viewport.left + viewport.width - x) / scale;
  const bottom = (viewport.top + viewport.height - y) / scale;
  return GALLERY_DETAIL.tiles.filter(
    (tile) =>
      tile.left < right &&
      tile.left + tile.width > left &&
      tile.top < bottom &&
      tile.top + tile.height > top,
  );
}

/** Compare the next transfer, without charging cached crops a second time. */
export function galleryDetailPlan(
  viewport: GalleryImageViewport,
  requested: readonly string[] = [],
  nativeReady = false,
) {
  const visible = galleryVisibleDetailTiles(viewport);
  const cached = new Set(requested);
  const bytes = visible.reduce((sum, tile) => sum + (cached.has(tile.path) ? 0 : tile.bytes), 0);
  return {
    mode:
      nativeReady || bytes >= GALLERY_DETAIL.sourceBytes ? ("full" as const) : ("tiles" as const),
    visible,
    bytes,
  };
}
