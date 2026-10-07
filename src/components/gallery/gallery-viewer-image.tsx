import { useEffect, useRef, useState } from "react";
import type { GalleryCollectionArtwork } from "./gallery-community-client";
import { galleryImagePresentation, type GalleryImageLoadStatus } from "./gallery-image-state";
import { gallerySwipeStep } from "./gallery-viewer-state";

/** Remounted per artwork: stale loads and zoom state cannot leak into the next work. */
export function GalleryViewerImage({
  work,
  neighbors,
  navigationDisabled,
  onMove,
}: {
  work: GalleryCollectionArtwork;
  neighbors: readonly GalleryCollectionArtwork[];
  navigationDisabled: boolean;
  onMove: (step: number) => void;
}) {
  const [fullStatus, setFullStatus] = useState<GalleryImageLoadStatus>("loading");
  const [mediumStatus, setMediumStatus] = useState<GalleryImageLoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const hasSeparateMedium = work.medium !== work.full;
  const { showingMedium, waitingForMedium, imageUnavailable, busy, canZoom } =
    galleryImagePresentation(fullStatus, mediumStatus, hasSeparateMedium);
  const source = attempt
    ? `${work.full}${work.full.includes("?") ? "&" : "?"}retry=${attempt}`
    : work.full;

  useEffect(() => {
    const img = imageRef.current;
    if (img?.complete) setFullStatus(img.naturalWidth ? "ready" : "error");
  }, [source]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: zoomed ? viewport.clientHeight / 2 : 0,
      left: zoomed ? viewport.clientWidth / 2 : 0,
      behavior: "instant",
    });
    if (zoomed) viewport.focus({ preventScroll: true });
  }, [zoomed]);

  useEffect(() => {
    if (
      fullStatus !== "ready" ||
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    )
      return;
    // Only the two adjacent images, and only once the current image is ready.
    const pending = neighbors.map((neighbor) => {
      const img = new Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      img.src = neighbor.full;
      return img;
    });
    return () =>
      pending.forEach((img) => {
        img.removeAttribute("src");
      });
  }, [neighbors, fullStatus]);

  return (
    <div className="gallery-viewer-image" data-zoomed={zoomed}>
      <div className="gallery-image-toolbar">
        <span id="gallery-image-help">
          {zoomed ? "画像をスクロールして鑑賞" : "左右スワイプ・← → キーで作品移動"}
        </span>
        <button
          type="button"
          className="gallery-viewer-close"
          disabled={!canZoom}
          aria-pressed={zoomed}
          onClick={() => {
            setZoomed((current) => !current);
          }}
        >
          {zoomed ? "全体を表示" : "2倍で鑑賞"}
        </button>
      </div>
      <div
        className="gallery-image-viewport"
        ref={viewportRef}
        aria-busy={busy}
        aria-describedby="gallery-image-help"
        tabIndex={zoomed ? 0 : -1}
        onKeyDown={(event) => {
          if (zoomed && (event.key === "ArrowLeft" || event.key === "ArrowRight"))
            event.stopPropagation();
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchRef.current =
            !zoomed && !navigationDisabled && event.touches.length === 1
              ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
              : null;
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) touchRef.current = null;
        }}
        onTouchCancel={() => {
          touchRef.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touchRef.current;
          touchRef.current = null;
          if (
            !start ||
            zoomed ||
            navigationDisabled ||
            event.touches.length ||
            event.changedTouches.length !== 1
          )
            return;
          const touch = event.changedTouches[0];
          const step = gallerySwipeStep(
            start,
            { x: touch.clientX, y: touch.clientY, at: event.timeStamp },
            window.innerWidth,
          );
          if (step) onMove(step);
        }}
      >
        <div className="gallery-image-canvas">
          {hasSeparateMedium && fullStatus !== "ready" && (
            <img
              className="gallery-image-preview"
              data-ready={mediumStatus === "ready"}
              src={work.medium}
              alt={showingMedium ? work.alt : ""}
              aria-hidden={!showingMedium}
              width={work.width}
              height={work.height}
              decoding="async"
              draggable={false}
              onLoad={() => setMediumStatus("ready")}
              onError={() => setMediumStatus("error")}
            />
          )}
          <img
            key={source}
            className="gallery-image-full"
            data-ready={fullStatus === "ready"}
            ref={imageRef}
            src={source}
            alt={fullStatus === "ready" ? work.alt : ""}
            aria-hidden={fullStatus !== "ready"}
            width={work.width}
            height={work.height}
            decoding="async"
            draggable={false}
            onLoad={() => setFullStatus("ready")}
            onError={() => setFullStatus("error")}
          />
        </div>
        {(fullStatus === "loading" || (fullStatus === "error" && waitingForMedium)) && (
          <p className="gallery-image-status" data-preview-ready={showingMedium} role="status">
            {showingMedium
              ? "高画質画像を読み込んでいます…"
              : fullStatus === "error"
                ? "標準画像を読み込んでいます…"
                : "画像を読み込んでいます…"}
          </p>
        )}
        {fullStatus === "error" && showingMedium && (
          <div className="gallery-image-fallback" role="status">
            <p>高画質画像を読み込めませんでした。標準画像を表示しています。</p>
            <button
              type="button"
              className="gallery-viewer-close"
              onClick={() => {
                setFullStatus("loading");
                setAttempt((current) => current + 1);
              }}
            >
              高画質を再読み込み
            </button>
          </div>
        )}
        {imageUnavailable && (
          <div className="gallery-image-error" role="alert">
            <p>画像を読み込めませんでした。</p>
            <p className="gallery-image-description">{work.alt}</p>
            <button
              type="button"
              className="gallery-viewer-close"
              onClick={() => {
                setFullStatus("loading");
                setAttempt((current) => current + 1);
              }}
            >
              再読み込み
            </button>
            <a href={work.medium} target="_blank" rel="noreferrer">
              画像を別のタブで開く
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
