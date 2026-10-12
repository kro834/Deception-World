import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { DREAM_POSTERS } from "./dream-chapter-data";
import { createReadyPosterLoader } from "@/lib/ready-poster-loader";
import { posterImage, preparePosterImage } from "@/lib/thumbnail-images";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { createScreeningSelection } from "./dream-screening-selection.js";

type DreamScreeningRoomProps = {
  initialIndex: number;
  trigger: HTMLButtonElement | null;
  onClose: (index: number) => void;
};

/** The poster console's explicit, full-picture viewing room. */
export function DreamScreeningRoom({ initialIndex, trigger, onClose }: DreamScreeningRoomProps) {
  const router = useRouter();
  const firstIndex =
    ((initialIndex % DREAM_POSTERS.length) + DREAM_POSTERS.length) % DREAM_POSTERS.length;
  const [index, setIndex] = useState(firstIndex);
  const [requestedIndex, setRequestedIndex] = useState<number | null>(firstIndex);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<ReturnType<typeof createReadyPosterLoader> | null>(null);
  const selectionRef = useRef<ReturnType<typeof createScreeningSelection> | null>(null);
  const currentIndexRef = useRef(firstIndex);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  onCloseRef.current = onClose;

  if (!selectionRef.current) {
    selectionRef.current = createScreeningSelection(
      (next: number) => {
        loaderRef.current ??= createReadyPosterLoader(preparePosterImage);
        return loaderRef.current.load(DREAM_POSTERS[next].src, "high");
      },
      (next: number) => {
        currentIndexRef.current = next;
        setIndex(next);
        setImageReady(true);
        setZoomed(false);
        imageViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
      },
      (state: "loading" | "ready" | "error", next: number) => {
        setRequestedIndex(state === "loading" ? next : null);
        setFailedIndex(state === "error" ? next : null);
      },
      DREAM_POSTERS.length,
    );
  }

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current(currentIndexRef.current);
  }, []);

  // A request for the currently shown picture is still a new choice. It must
  // supersede any pending request for a different picture (or retry the first).
  const select = useCallback((next: number) => {
    void selectionRef.current?.select(next);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const oldDialogFlag = root.dataset.dreamDialogOpen;
    // showModal's native autofocus may scroll the document. Capture the
    // departure position before it (and before any style-affecting flag).
    const releaseScroll = acquireViewportScrollLock({ freezeBody: true });
    root.dataset.dreamDialogOpen = "true";
    dialog.showModal();
    let released = false;
    const releaseViewport = () => {
      if (released) return;
      released = true;
      if (dialog.open) dialog.close();
      releaseScroll();
      if (oldDialogFlag === undefined) delete root.dataset.dreamDialogOpen;
      else root.dataset.dreamDialogOpen = oldDialogFlag;
    };
    closeRef.current?.focus({ preventScroll: true });
    // The initial picture gets the same decoded-image and retry guarantee as
    // every later choice. Until ready, the stage shows an explicit placeholder.
    void selectionRef.current?.select(firstIndex);
    let historyDismissed = false;
    const stopHistory = router.history.subscribe(({ action }) => {
      if (action.type !== "BACK" && action.type !== "FORWARD" && action.type !== "GO") return;
      historyDismissed = true;
      // Release the old page offset before the browser restores its destination.
      releaseViewport();
      close();
    });
    return () => {
      stopHistory();
      selectionRef.current?.invalidate();
      loaderRef.current?.dispose();
      loaderRef.current = null;
      releaseViewport();
      if (!historyDismissed && trigger?.isConnected) {
        window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
      }
    };
  }, [close, firstIndex, router, trigger]);

  useEffect(() => {
    const filmstrip = filmstripRef.current;
    const active = filmstrip?.querySelector<HTMLElement>(`[data-poster-index="${index}"]`);
    if (!filmstrip || !active) return;
    const left = active.offsetLeft - (filmstrip.clientWidth - active.clientWidth) / 2;
    filmstrip.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [index]);

  const handleKeys = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (zoomed || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      select(currentIndexRef.current + (event.key === "ArrowRight" ? 1 : -1));
    }
  };

  const poster = DREAM_POSTERS[index];
  return (
    <dialog
      ref={dialogRef}
      className="dream-screening-dialog"
      aria-label="ドリームチャプター 映写室"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={handleKeys}
    >
      <div className="dream-screening-shell">
        <header className="dream-screening-header">
          <div className="dream-screening-title">
            <span lang="en">DREAM CHAPTER · POSTER SCREENING</span>
            <h2>映写室</h2>
          </div>
          <span className="dream-screening-count" aria-live="polite">
            {String(index + 1).padStart(2, "0")} <span aria-hidden="true">/</span>{" "}
            {String(DREAM_POSTERS.length).padStart(2, "0")}
          </span>
          <button
            ref={closeRef}
            type="button"
            className="dream-screening-close"
            onClick={close}
            aria-label="映写室を閉じる"
          >
            <span aria-hidden="true">×</span>
            <span>閉じる</span>
          </button>
        </header>

        <div className="dream-screening-stage">
          <button
            type="button"
            className="dream-screening-arrow"
            aria-label="前のポスター"
            onClick={() => select(currentIndexRef.current - 1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div
            ref={imageViewportRef}
            className={`dream-screening-picture${zoomed ? " is-zoomed" : ""}`}
          >
            {imageReady ? (
              <img
                key={poster.src}
                src={poster.src}
                {...posterImage(poster.src)}
                width={poster.width}
                height={poster.height}
                alt={poster.alt}
                decoding="async"
                draggable={false}
              />
            ) : (
              <p className="dream-screening-placeholder">
                {failedIndex === firstIndex ? "画像を読み込めませんでした" : "画像を読み込み中"}
              </p>
            )}
          </div>
          <button
            type="button"
            className="dream-screening-arrow"
            aria-label="次のポスター"
            onClick={() => select(currentIndexRef.current + 1)}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="dream-screening-controls">
          <p className="dream-screening-caption" aria-live="polite">
            {poster.alt}
          </p>
          <button
            type="button"
            className="dream-screening-zoom"
            aria-pressed={zoomed}
            disabled={!imageReady}
            onClick={() => {
              setZoomed((value) => !value);
              imageViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
            }}
          >
            {zoomed ? "全体表示" : "100% / 拡大"}
          </button>
        </div>
        <div className="dream-screening-message">
          <p className="dream-screening-status" role="status" aria-live="polite">
            {requestedIndex != null
              ? `其ノ${requestedIndex + 1}を読み込み中`
              : failedIndex != null
                ? "画像を読み込めませんでした。再試行できます。"
                : ""}
          </p>
          {failedIndex != null ? (
            <button
              type="button"
              className="dream-screening-retry"
              onClick={() => select(failedIndex)}
            >
              再試行
            </button>
          ) : null}
        </div>
        <div
          ref={filmstripRef}
          className="dream-screening-filmstrip"
          role="group"
          aria-label="ポスター一覧"
        >
          {DREAM_POSTERS.map((item, itemIndex) => (
            <button
              key={item.src}
              type="button"
              data-poster-index={itemIndex}
              aria-label={`${itemIndex + 1}番: ${item.alt}`}
              aria-current={index === itemIndex ? "true" : undefined}
              onClick={() => select(itemIndex)}
            >
              <img
                src={`/dream-chapter-poster-thumb-${String(itemIndex + 1).padStart(2, "0")}.jpeg`}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span>{String(itemIndex + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
