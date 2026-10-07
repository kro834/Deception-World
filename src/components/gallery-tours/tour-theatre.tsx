import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { GalleryArtwork } from "../gallery/gallery-data";
import { getTourArtwork } from "./tour-data";
import type { GalleryTour } from "./tour-data";

type ArtworkStatus = "loading" | "ready" | "error";

/** Each frame owns its loading state, including cached loads and manual retries. */
function TourArtwork({
  artwork,
  onStatus,
}: {
  artwork: GalleryArtwork;
  onStatus: (status: ArtworkStatus) => void;
}) {
  const [status, setStatus] = useState<ArtworkStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const source = attempt
    ? `${artwork.full}${artwork.full.includes("?") ? "&" : "?"}tour-retry=${attempt}`
    : artwork.full;
  const updateStatus = useCallback(
    (next: ArtworkStatus) => {
      setStatus(next);
      onStatus(next);
    },
    [onStatus],
  );

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) updateStatus(image.naturalWidth > 0 ? "ready" : "error");
  }, [source, updateStatus]);

  return (
    <div className="gallery-tour-artwork" aria-busy={status === "loading"}>
      <img
        ref={imageRef}
        key={source}
        className="gallery-tour-full-image"
        data-ready={status === "ready"}
        src={source}
        alt={artwork.alt}
        width={artwork.width}
        height={artwork.height}
        decoding="async"
        draggable={false}
        onLoad={() => updateStatus("ready")}
        onError={() => updateStatus("error")}
      />
      {status === "loading" && (
        <p className="gallery-tour-image-message" role="status">
          作品を読み込んでいます…
        </p>
      )}
      {status === "error" && (
        <div className="gallery-tour-image-message" role="alert">
          <p>作品を読み込めませんでした。時間をおいて、もう一度お試しください。</p>
          <button
            className="gallery-tour-theatre-button"
            type="button"
            onClick={() => {
              updateStatus("loading");
              setAttempt((current) => current + 1);
            }}
          >
            再読み込み
          </button>
          <a href={artwork.medium} target="_blank" rel="noreferrer">
            画像を別のタブで開く
          </a>
        </div>
      )}
    </div>
  );
}

export type GalleryTourTheatreProps = {
  tour: GalleryTour;
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
  onArtworkReady?: (id: string) => void;
  actions?: ReactNode;
  suspended?: boolean;
};

export function GalleryTourTheatre({
  tour,
  index,
  onIndexChange,
  onExit,
  onArtworkReady,
  actions,
  suspended = false,
}: GalleryTourTheatreProps) {
  const stop = tour.stops[index];
  const artwork = stop ? getTourArtwork(stop.artworkId) : undefined;
  const artworkId = artwork?.id ?? "";
  const [imageState, setImageState] = useState<{ id: string; status: ArtworkStatus } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(12);
  const [completed, setCompleted] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const filmstripRef = useRef<HTMLDivElement>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement>(null);
  const notifiedArtworkRef = useRef("");
  const status = imageState?.id === artworkId ? imageState.status : "loading";
  const imageReady = status === "ready";
  const lastStop = index === tour.stops.length - 1;
  const nextArtwork = !lastStop ? getTourArtwork(tour.stops[index + 1].artworkId) : undefined;
  const nextSource = nextArtwork?.full;
  const advancing = playing && imageReady && pageVisible && !suspended;

  const handleImageStatus = useCallback(
    (next: ArtworkStatus) => {
      setImageState({ id: artworkId, status: next });
      if (next === "error") {
        setPlaying(false);
        setPlaybackNotice("画像を読み込めなかったため、自動送りを停止しました。");
      }
    },
    [artworkId],
  );

  useEffect(() => {
    const updateVisibility = () => {
      const visible = document.visibilityState === "visible";
      setPageVisible(visible);
      if (!visible && playing) {
        setPlaying(false);
        setPlaybackNotice("画面を離れたため、自動送りを停止しました。");
      }
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, [playing]);

  useEffect(() => {
    if (!suspended || !playing) return;
    setPlaying(false);
    setPlaybackNotice("メニューを開いたため、自動送りを停止しました。");
  }, [suspended, playing]);

  useEffect(() => {
    if (
      !imageReady ||
      !pageVisible ||
      suspended ||
      !artworkId ||
      notifiedArtworkRef.current === artworkId
    )
      return;
    notifiedArtworkRef.current = artworkId;
    onArtworkReady?.(artworkId);
  }, [artworkId, imageReady, pageVisible, suspended, onArtworkReady]);

  useEffect(() => {
    if (!advancing) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (lastStop) {
        setPlaying(false);
        setCompleted(true);
        setPlaybackNotice("この巡回はここでおしまいです。気になる作品を、もう一度ゆっくりどうぞ。");
      } else {
        onIndexChange(index + 1);
      }
    }, intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [advancing, index, intervalSeconds, lastStop, onIndexChange]);

  useEffect(() => {
    if (
      !imageReady ||
      !pageVisible ||
      !nextSource ||
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    )
      return;
    // One adjacent full image is enough; never fetch the entire tour ahead of time.
    const next = new Image();
    next.decoding = "async";
    next.fetchPriority = "low";
    next.src = nextSource;
    return () => next.removeAttribute("src");
  }, [imageReady, nextSource, pageVisible]);

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const revealCurrentThumbnail = () => {
      const current = activeThumbnailRef.current;
      if (!current) return;
      const bounds = strip.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      const left =
        item.left < bounds.left
          ? item.left - bounds.left
          : item.right > bounds.right
            ? item.right - bounds.right
            : 0;
      if (left) strip.scrollBy({ left, behavior: "instant" });
    };
    revealCurrentThumbnail();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", revealCurrentThumbnail);
      return () => window.removeEventListener("resize", revealCurrentThumbnail);
    }
    const observer = new ResizeObserver(revealCurrentThumbnail);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [index, tour.id]);

  const selectStop = (nextIndex: number) => {
    setPlaying(false);
    setCompleted(false);
    setPlaybackNotice("");
    if (nextIndex >= 0 && nextIndex < tour.stops.length && nextIndex !== index)
      onIndexChange(nextIndex);
  };

  if (!artwork || !stop) {
    return (
      <section className="gallery-tour-theatre">
        <h1>{tour.title}</h1>
        <p role="status">この作品を表示できませんでした。巡回一覧から選び直してください。</p>
        <button className="gallery-tour-theatre-button" type="button" onClick={onExit}>
          巡回一覧に戻る
        </button>
      </section>
    );
  }

  return (
    <section
      className="gallery-tour-theatre"
      style={
        {
          "--gallery-tour-accent": tour.accent,
          "--gallery-tour-interval": `${intervalSeconds}s`,
        } as CSSProperties
      }
      aria-labelledby="gallery-tour-title"
    >
      <div className="gallery-tour-theatre-heading">
        <div>
          <p className="gallery-tour-theatre-kicker">{tour.kicker}</p>
          <h1 id="gallery-tour-title" tabIndex={-1}>
            {tour.title}
          </h1>
        </div>
        <button
          className="gallery-tour-theatre-button gallery-tour-exit"
          type="button"
          onClick={() => {
            setPlaying(false);
            onExit();
          }}
        >
          ← 巡回一覧に戻る
        </button>
      </div>

      <div className="gallery-tour-theatre-layout">
        <div className="gallery-tour-screen-column">
          <div
            id="gallery-tour-stage"
            className="gallery-tour-stage"
            tabIndex={0}
            role="group"
            aria-label={`作品 ${index + 1}。左右の矢印キーで作品を移動`}
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
              )
                return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                selectStop(index + (event.key === "ArrowRight" ? 1 : -1));
              }
            }}
          >
            <TourArtwork
              key={`${tour.id}:${artwork.id}`}
              artwork={artwork}
              onStatus={handleImageStatus}
            />
          </div>
          <div className="gallery-tour-transport" aria-label="作品の移動">
            <button
              className="gallery-tour-theatre-button"
              type="button"
              disabled={index === 0}
              onClick={() => selectStop(index - 1)}
            >
              ← 前の作品
            </button>
            <p className="gallery-tour-position" aria-live="polite" aria-atomic="true">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span className="gallery-tour-position-total">
                {" "}
                / {String(tour.stops.length).padStart(2, "0")}
              </span>
            </p>
            <button
              className="gallery-tour-theatre-button"
              type="button"
              disabled={lastStop}
              onClick={() => selectStop(index + 1)}
            >
              次の作品 →
            </button>
          </div>
          <div
            className="gallery-tour-filmstrip"
            ref={filmstripRef}
            role="group"
            aria-label="巡回する作品"
          >
            {tour.stops.map((item, itemIndex) => {
              const thumbnail = getTourArtwork(item.artworkId);
              if (!thumbnail) return null;
              return (
                <button
                  key={`${item.artworkId}:${itemIndex}`}
                  ref={itemIndex === index ? activeThumbnailRef : undefined}
                  className="gallery-tour-thumbnail"
                  type="button"
                  aria-label={`${itemIndex + 1}点目、${thumbnail.alt}`}
                  aria-current={itemIndex === index ? "step" : undefined}
                  onClick={() => selectStop(itemIndex)}
                >
                  <img
                    src={thumbnail.thumb}
                    alt=""
                    width={thumbnail.width}
                    height={thumbnail.height}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="gallery-tour-reading-column">
          <div className="gallery-tour-stop-caption">
            <p className="gallery-tour-stop-label">この一枚を見る</p>
            <h2>{artwork.alt}</h2>
            <p className="gallery-tour-stop-note">{stop.note}</p>
          </div>
          <div className="gallery-tour-playback">
            <div className="gallery-tour-playback-label">
              <label htmlFor="gallery-tour-interval">一枚を眺める時間</label>
              <select
                id="gallery-tour-interval"
                value={intervalSeconds}
                onChange={(event) => {
                  setIntervalSeconds(Number(event.target.value));
                  setPlaying(false);
                  setPlaybackNotice("");
                }}
              >
                <option value={8}>8秒</option>
                <option value={12}>12秒</option>
                <option value={20}>20秒</option>
              </select>
            </div>
            <button
              className="gallery-tour-theatre-button gallery-tour-play-button"
              type="button"
              disabled={!playing && (!imageReady || !pageVisible || suspended || completed)}
              aria-pressed={playing}
              onClick={() => {
                setPlaying((current) => !current);
                setPlaybackNotice(
                  playing ? "自動送りを停止しました。好きな速さで鑑賞できます。" : "",
                );
              }}
            >
              {playing ? "Ⅱ 自動送りを停止" : "▷ 自動で作品を巡る"}
            </button>
            <div className="gallery-tour-time-track" aria-hidden="true">
              {advancing && (
                <span
                  key={`${tour.id}:${index}:${intervalSeconds}`}
                  className="gallery-tour-time-fill"
                />
              )}
            </div>
            <p className="gallery-tour-playback-help">
              {playing
                ? imageReady
                  ? `${intervalSeconds}秒ごとに次の作品へ進み、最後の一枚で止まります。`
                  : "次の作品を読み込んでいます。表示できてから時間を数えます。"
                : "自動送りはお好みで。作品を選んだり画面を離れたりすると停止します。"}
            </p>
            <p className="gallery-tour-playback-notice" role="status">
              {playbackNotice}
            </p>
          </div>
          {lastStop && imageReady && (
            <div className="gallery-tour-ending">
              <p>{completed ? "巡回を終えて" : "最後の一枚です"}</p>
              <button
                className="gallery-tour-theatre-button"
                type="button"
                onClick={() => {
                  selectStop(0);
                  document.getElementById("gallery-tour-stage")?.focus({ preventScroll: true });
                }}
              >
                最初の作品をもう一度
              </button>
            </div>
          )}
          {actions && (
            <div
              className="gallery-tour-theatre-actions"
              onFocusCapture={() => setPlaying(false)}
              onPointerDownCapture={() => setPlaying(false)}
              onClickCapture={() => setPlaying(false)}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
