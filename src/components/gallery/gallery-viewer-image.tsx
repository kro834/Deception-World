import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryCollectionArtwork } from "./gallery-community-client";
import { galleryImagePresentation, type GalleryImageLoadStatus } from "./gallery-image-state";
import {
  galleryImagePanPosition,
  galleryImageResizePosition,
  galleryImageRetrySource,
  gallerySwipeStep,
  type GalleryImageViewport,
} from "./gallery-viewer-state";

import { GALLERY_DETAIL } from "./gallery-detail-assets";
import { GalleryDetailTiles } from "./gallery-detail-tiles";
import {
  galleryFitSizes,
  galleryZoomSource,
  galleryNativeIsReady,
  rememberGalleryNativeLoad,
} from "./gallery-image-delivery";

function readViewport(viewport: HTMLDivElement): GalleryImageViewport {
  return {
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    scrollWidth: viewport.scrollWidth,
    scrollHeight: viewport.scrollHeight,
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
  };
}

/** Remounted per artwork: stale loads and zoom state cannot leak into the next work. */
export function GalleryViewerImage({
  work,
  navigationDisabled,
  onMove,
}: {
  work: GalleryCollectionArtwork;
  navigationDisabled: boolean;
  onMove: (step: number) => void;
}) {
  const [fullStatus, setFullStatus] = useState<GalleryImageLoadStatus>("loading");
  const [mediumStatus, setMediumStatus] = useState<GalleryImageLoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [mediumAttempt, setMediumAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [pixelRatio, setPixelRatio] = useState(1);
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const [detailViewport, setDetailViewport] = useState<GalleryImageViewport | null>(null);
  const [nativeReady, setNativeReady] = useState(() => galleryNativeIsReady(work.full));
  const [detailFull, setDetailFull] = useState(false);
  const fitSourceRef = useRef(work.medium);
  const useFullDetail = useCallback(() => setDetailFull(true), []);
  const zoomSource = nativeReady
    ? work.full
    : galleryZoomSource(work, fitWidth ?? work.width, pixelRatio);
  const tiled =
    work.id === GALLERY_DETAIL.id && zoomSource === work.full && !nativeReady && !detailFull;
  const imageRef = useRef<HTMLImageElement>(null);
  const mediumRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const retryFocusRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewingPositionRef = useRef<GalleryImageViewport | null>(null);
  const wasZoomedRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const hasSeparateMedium = work.medium !== work.full;
  const { showingMedium, waitingForMedium, imageUnavailable, busy, canZoom } =
    galleryImagePresentation(fullStatus, mediumStatus, hasSeparateMedium);
  const activeSource = zoomed ? (tiled ? fitSourceRef.current : zoomSource) : work.medium;
  const source = fitWidth ? galleryImageRetrySource(activeSource, attempt) : undefined;
  const responsiveSources = (work.fullSrcSet ?? work.srcSet)
    .split(",")
    .filter(Boolean)
    .map((candidate) => {
      const [path, descriptor] = candidate.trim().split(/\s+/);
      return `${galleryImageRetrySource(path, attempt)} ${descriptor}`;
    })
    .join(", ");
  const mediumSource = galleryImageRetrySource(work.medium, mediumAttempt);

  const retry = () => {
    // Both error controls disappear during a retry. Keep keyboard focus inside
    // the image until a useful control returns, unless the reader moves on.
    retryFocusRef.current = true;
    viewportRef.current?.focus({ preventScroll: true });
    setFullStatus("loading");
    setAttempt((current) => current + 1);
    if (mediumStatus === "error") {
      setMediumStatus("loading");
      setMediumAttempt((current) => current + 1);
    }
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      setPixelRatio(window.devicePixelRatio || 1);
      const width = Math.min(
        viewport.clientWidth,
        (viewport.clientHeight * work.width) / work.height,
      );
      if (width > 0) setFitWidth(Math.ceil(width));
    };
    measure();
    // The parent opens the native dialog in its effect, after this child mounts.
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [work.width, work.height]);

  useEffect(() => {
    if (!source) return;
    const img = imageRef.current;
    if (img?.complete) setFullStatus(img.naturalWidth ? "ready" : "error");
    else setFullStatus("loading");
  }, [source]);

  useEffect(() => {
    const img = mediumRef.current;
    if (img?.complete) setMediumStatus(img.naturalWidth ? "ready" : "error");
  }, [mediumSource]);

  useEffect(() => {
    if (
      !retryFocusRef.current ||
      fullStatus === "loading" ||
      (fullStatus === "error" && !imageUnavailable && !showingMedium)
    )
      return;
    retryFocusRef.current = false;
    if (document.activeElement !== viewportRef.current) return;
    (fullStatus === "ready" ? zoomRef.current : retryRef.current)?.focus({ preventScroll: true });
  }, [fullStatus, imageUnavailable, showingMedium]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!zoomed) {
      viewport.scrollTo({ top: 0, left: 0, behavior: "instant" });
      viewingPositionRef.current = null;
      setDetailViewport(null);
      if (wasZoomedRef.current) zoomRef.current?.focus({ preventScroll: true });
      wasZoomedRef.current = false;
      return;
    }
    wasZoomedRef.current = true;
    const artwork = { width: work.width, height: work.height };
    viewport.scrollTo({
      ...galleryImageResizePosition(null, readViewport(viewport), artwork),
      behavior: "instant",
    });
    viewingPositionRef.current = readViewport(viewport);
    setDetailViewport(readViewport(viewport));
    viewport.focus({ preventScroll: true });
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = readViewport(viewport);
      const previous = viewingPositionRef.current;
      if (
        previous &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.scrollWidth === next.scrollWidth &&
        previous.scrollHeight === next.scrollHeight
      )
        return;
      viewport.scrollTo({
        ...galleryImageResizePosition(previous, next, artwork),
        behavior: "instant",
      });
      viewingPositionRef.current = readViewport(viewport);
      setDetailViewport(readViewport(viewport));
    });
    observer.observe(viewport);
    // WebKit can expose the enlarged canvas one layout after the viewport.
    // The viewport itself keeps its size, so observe its contents as well.
    const canvas = viewport.querySelector(".gallery-image-canvas");
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [zoomed, work.width, work.height]);

  return (
    <div
      className="gallery-viewer-image"
      data-zoomed={zoomed}
      data-detail-mode={
        zoomed ? (tiled ? "tiles" : zoomSource === work.full ? "full" : "standard") : "fit"
      }
    >
      <div className="gallery-image-toolbar">
        <span id="gallery-image-help">
          {zoomed ? "スクロール・↑ ↓ ← → キーで鑑賞" : "左右スワイプ・← → キーで作品移動"}
        </span>
        <button
          type="button"
          className="gallery-viewer-close"
          ref={zoomRef}
          disabled={!canZoom && !zoomed}
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
        role="region"
        aria-label={zoomed ? "拡大した作品画像" : "作品画像"}
        tabIndex={zoomed ? 0 : -1}
        onScroll={(event) => {
          if (!zoomed) return;
          const next = readViewport(event.currentTarget);
          const previous = viewingPositionRef.current;
          // A browser can clamp scrolling before ResizeObserver runs. Keep the
          // previous geometry until the observer has restored the artwork point.
          if (
            previous &&
            (previous.width !== next.width ||
              previous.height !== next.height ||
              previous.scrollWidth !== next.scrollWidth ||
              previous.scrollHeight !== next.scrollHeight)
          )
            return;
          viewingPositionRef.current = next;
          setDetailViewport(next);
        }}
        onKeyDown={(event) => {
          if (!zoomed || event.target !== event.currentTarget) return;
          const position = galleryImagePanPosition(readViewport(event.currentTarget), event.key);
          if (!position) return;
          event.stopPropagation();
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          event.currentTarget.scrollTo({ ...position, behavior: "instant" });
          viewingPositionRef.current = readViewport(event.currentTarget);
          setDetailViewport(readViewport(event.currentTarget));
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
          {hasSeparateMedium && fullStatus !== "ready" && (zoomed || fullStatus === "error") && (
            <img
              key={mediumSource}
              ref={mediumRef}
              className="gallery-image-preview"
              data-ready={mediumStatus === "ready"}
              src={mediumSource}
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
            srcSet={zoomed || !fitWidth ? undefined : responsiveSources}
            sizes={
              zoomed
                ? undefined
                : fitWidth
                  ? `${fitWidth}px`
                  : galleryFitSizes(work.width, work.height)
            }
            fetchPriority="high"
            alt={fullStatus === "ready" ? work.alt : ""}
            aria-hidden={fullStatus !== "ready"}
            width={work.width}
            height={work.height}
            decoding="async"
            draggable={false}
            onLoad={(event) => {
              setFullStatus("ready");
              const loaded = event.currentTarget.currentSrc;
              if (!zoomed) fitSourceRef.current = loaded || work.medium;
              if (rememberGalleryNativeLoad(work.full, loaded)) setNativeReady(true);
            }}
            onError={() => setFullStatus("error")}
          />
          {zoomed && tiled && detailViewport && (
            <GalleryDetailTiles viewport={detailViewport} onFallback={useFullDetail} />
          )}
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
            <button type="button" className="gallery-viewer-close" ref={retryRef} onClick={retry}>
              高画質を再読み込み
            </button>
          </div>
        )}
        {imageUnavailable && (
          <div className="gallery-image-error" role="alert">
            <p>画像を読み込めませんでした。</p>
            <p className="gallery-image-description">{work.alt}</p>
            <button type="button" className="gallery-viewer-close" ref={retryRef} onClick={retry}>
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
