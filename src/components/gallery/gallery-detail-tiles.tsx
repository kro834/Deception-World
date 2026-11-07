import { useEffect, useRef, useState } from "react";
import { GALLERY_DETAIL } from "./gallery-detail-assets";
import { galleryDetailPlan } from "./gallery-image-delivery";
import type { GalleryImageViewport } from "./gallery-viewer-state";

export function GalleryDetailTiles({
  viewport,
  onFallback,
}: {
  viewport: GalleryImageViewport;
  onFallback: () => void;
}) {
  const requested = useRef<string[]>([]);
  const [tiles, setTiles] = useState<(typeof GALLERY_DETAIL.tiles)[number][]>([]);
  useEffect(() => {
    const plan = galleryDetailPlan(viewport, requested.current);
    if (plan.mode === "full") {
      onFallback();
      return;
    }
    const unseen = plan.visible.filter((tile) => !requested.current.includes(tile.path));
    if (!unseen.length) return;
    requested.current.push(...unseen.map((tile) => tile.path));
    setTiles((current) => [...current, ...unseen]);
  }, [viewport, onFallback]);
  const scale = Math.min(
    viewport.scrollWidth / GALLERY_DETAIL.width,
    viewport.scrollHeight / GALLERY_DETAIL.height,
  );
  const width = GALLERY_DETAIL.width * scale;
  const height = GALLERY_DETAIL.height * scale;
  return (
    <div
      className="gallery-detail-tiles"
      aria-hidden="true"
      style={{
        width,
        height,
        left: (viewport.scrollWidth - width) / 2,
        top: (viewport.scrollHeight - height) / 2,
      }}
    >
      {tiles.map((tile) => (
        <img
          key={tile.path}
          src={tile.path}
          alt=""
          width={tile.width}
          height={tile.height}
          decoding="async"
          draggable={false}
          onError={onFallback}
          style={{
            left: `${(tile.left / GALLERY_DETAIL.width) * 100}%`,
            top: `${(tile.top / GALLERY_DETAIL.height) * 100}%`,
            width: `${(tile.width / GALLERY_DETAIL.width) * 100}%`,
            height: `${(tile.height / GALLERY_DETAIL.height) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
