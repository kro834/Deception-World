import { useEffect, useRef, useState, type ReactNode } from "react";

export type StageArtwork = {
  id: string;
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  alt: string;
};

export type ArtworkStageProps = {
  artwork: StageArtwork;
  variant: "home" | "world" | "gallery";
  children?: ReactNode;
  controls?: ReactNode;
  renderArtwork?: (artwork: StageArtwork) => ReactNode;
  /** Existing media lifecycle (World loader) can retain ownership of its layers. */
  media?: ReactNode;
  className?: string;
  economy?: boolean;
};

/** Presentation only. Selection, links and history stay with the caller. */
export function ArtworkStage({
  artwork,
  variant,
  children,
  controls,
  renderArtwork,
  media,
  className = "",
  economy = false,
}: ArtworkStageProps) {
  const [frames, setFrames] = useState<{ current: StageArtwork; previous: StageArtwork | null }>({
    current: artwork,
    previous: null,
  });
  const currentImage = useRef<HTMLDivElement>(null);
  const loadedArtwork = useRef<StageArtwork | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (media) return;
    const image = currentImage.current?.querySelector("img");
    if (image?.complete && image.naturalWidth > 0) {
      loadedArtwork.current = artwork;
      setReadyId(artwork.id);
    }
  }, [artwork, media, failedId]);
  const information = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  if (frames.current.id !== artwork.id) {
    setFrames({ current: artwork, previous: media ? frames.current : loadedArtwork.current });
  }
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!frames.previous || (!media && (readyId !== artwork.id || failedId === artwork.id))) return;
    if (reduced) {
      setFrames((value) => ({ ...value, previous: null }));
      return;
    }
    const short = economy || document.documentElement.dataset.worldEffects === "economy";
    const animation =
      !reduced &&
      information.current?.animate(
        [
          { opacity: 0.65, transform: short ? "none" : "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: short ? 180 : 480, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    const timer = window.setTimeout(
      () =>
        setFrames((value) =>
          value.current.id === artwork.id ? { ...value, previous: null } : value,
        ),
      short ? 180 : 560,
    );
    return () => {
      window.clearTimeout(timer);
      if (animation) animation.cancel();
    };
  }, [frames.current.id, frames.previous, economy, reduced, readyId, artwork.id, media, failedId]);
  const draw = (item: StageArtwork) =>
    renderArtwork ? (
      renderArtwork(item)
    ) : (
      <img
        src={item.src}
        srcSet={item.srcSet}
        sizes={item.sizes ?? "(min-width: 960px) 65vw, 100vw"}
        width={item.width}
        height={item.height}
        alt={item.alt}
        decoding="async"
      />
    );
  const landscape = (artwork.width ?? 1) > (artwork.height ?? 1);
  return (
    <section
      className={`artwork-stage artwork-stage--${variant} ${className}`}
      data-artwork-id={artwork.id}
      data-format={landscape ? "landscape" : "portrait"}
      data-moving={!!frames.previous}
      data-waiting={
        !media && !!frames.previous && (readyId !== artwork.id || failedId === artwork.id)
      }
      data-failed={failedId === artwork.id}
      data-economy={economy}
    >
      <div className="artwork-stage__visual">
        <div key={`plane-${artwork.id}`} className="artwork-stage__plane" aria-hidden="true" />
        <div className="artwork-stage__aperture">
          {!media && frames.previous && (
            <div
              key={`out-${frames.previous.id}`}
              className="artwork-stage__image artwork-stage__image--out"
              aria-hidden="true"
              inert
            >
              {draw(frames.previous)}
            </div>
          )}
          {media ?? (
            <div
              key={artwork.id}
              ref={currentImage}
              className="artwork-stage__image artwork-stage__image--current"
              inert={!!frames.previous && readyId !== artwork.id && failedId !== artwork.id}
              onLoadCapture={(event) => {
                if (event.currentTarget !== currentImage.current) return;
                loadedArtwork.current = artwork;
                setFailedId(null);
                setReadyId(artwork.id);
              }}
              onErrorCapture={(event) => {
                if (event.currentTarget !== currentImage.current) return;
                setFailedId(artwork.id);
              }}
            >
              {failedId === artwork.id ? (
                <p className="artwork-stage__error" role="alert">
                  画像を読み込めませんでした。
                </p>
              ) : (
                draw(artwork)
              )}
            </div>
          )}
        </div>
        {controls && <div className="artwork-stage__controls">{controls}</div>}
      </div>
      {children && (
        <div ref={information} className="artwork-stage__information">
          {children}
        </div>
      )}
    </section>
  );
}
