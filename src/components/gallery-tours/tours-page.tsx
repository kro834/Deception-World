import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { GalleryTourEntrance } from "./tour-entrance";
import { GalleryTourTheatre } from "./tour-theatre";
import { getGalleryTour, getTourStopIndex } from "./tour-data";
import {
  clearTourProgress,
  readTourProgressState,
  saveTourProgress,
  TOUR_PROGRESS_KEY,
  type TourProgress,
} from "./tour-progress";

function TourShareLink({ tourId, workId }: { tourId: string; workId: string }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState<{ href: string; attempt: number } | null>(null);
  const [copying, setCopying] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const copyingRef = useRef(false);
  const fallbackAttemptRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (fallback) {
      fallbackRef.current?.focus({ preventScroll: true });
      fallbackRef.current?.select();
    }
  }, [fallback]);

  async function copyLink() {
    if (copyingRef.current) return;
    copyingRef.current = true;
    const link = new URL("/gallery-tours", window.location.origin);
    link.searchParams.set("tour", tourId);
    link.searchParams.set("work", workId);
    setCopying(true);
    setMessage("");
    setFallback(null);
    try {
      await navigator.clipboard.writeText(link.href);
      if (mountedRef.current) setMessage("この作品から始まるツアーのリンクをコピーしました。");
    } catch {
      if (mountedRef.current) {
        setFallback({ href: link.href, attempt: ++fallbackAttemptRef.current });
        setMessage("下のリンクを選択してコピーできます。");
      }
    } finally {
      copyingRef.current = false;
      if (mountedRef.current) setCopying(false);
    }
  }

  return (
    <div className="gallery-tour-sharing">
      <button type="button" onClick={() => void copyLink()} disabled={copying}>
        {copying ? "コピー中" : "この場面のリンクをコピー"}
      </button>
      <span role="status">{message}</span>
      {fallback && (
        <input
          key={fallback.attempt}
          ref={fallbackRef}
          type="url"
          defaultValue={fallback.href}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="この場面のツアーリンク"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}

export function GalleryToursPage({
  tourId,
  workId,
  onSelect,
  onExit,
}: {
  tourId?: string;
  workId?: string;
  onSelect: (tourId: string, workId: string, replace: boolean) => void;
  onExit: () => void;
}) {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<TourProgress>({});
  const [storageMessage, setStorageMessage] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const focusAfterNavigation = useRef(false);
  const tour = getGalleryTour(tourId);
  const index = tour ? getTourStopIndex(tour, workId) : 0;
  const activeWorkId = tour?.stops[index].artworkId;
  const activePositionRef = useRef({ tourId: tour?.id, workId: activeWorkId });
  activePositionRef.current = { tourId: tour?.id, workId: activeWorkId };
  const selectIndex = useCallback(
    (next: number) => {
      const stop = tour?.stops[next];
      if (tour && stop) onSelect(tour.id, stop.artworkId, true);
    },
    [tour, onSelect],
  );

  useEffect(() => {
    const read = () => {
      try {
        const result = readTourProgressState(window.localStorage);
        if (!result.available) throw new Error("Progress storage unavailable");
        setProgress(result.progress);
        setStorageMessage("");
      } catch {
        setStorageMessage(
          "このブラウザーでは再開位置を保存できません。ツアーはそのまま鑑賞できます。",
        );
      }
    };
    read();
    const sync = (event: StorageEvent) => {
      if (event.key !== TOUR_PROGRESS_KEY && event.key !== null) return;
      try {
        if (event.storageArea === window.localStorage) read();
      } catch {
        setStorageMessage(
          "このブラウザーでは再開位置を保存できません。ツアーはそのまま鑑賞できます。",
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [tour?.id]);

  const remember = useCallback(
    (id: string) => {
      if (
        !tourId ||
        activePositionRef.current.tourId !== tourId ||
        activePositionRef.current.workId !== id
      )
        return;
      try {
        setProgress(saveTourProgress(window.localStorage, tourId, id));
        setStorageMessage("");
      } catch {
        setStorageMessage(
          "このブラウザーでは再開位置を保存できません。ツアーはそのまま鑑賞できます。",
        );
      }
    },
    [tourId],
  );

  function resetTour(id: string) {
    try {
      setProgress(clearTourProgress(window.localStorage, id));
      setStorageMessage("このツアーの再開位置をリセットしました。");
    } catch {
      setStorageMessage("再開位置をリセットできませんでした。もう一度お試しください。");
    }
  }

  return (
    <div className="world gallery-page gallery-tours-page" data-gallery-tours="true">
      <header className="gallery-topbar">
        <Link className="gallery-brand" to="/gallery">
          DECEPTION WORLD<span>GUIDED EXHIBITIONS</span>
        </Link>
        <div className="gallery-topbar-actions">
          <Link to="/gallery">ギャラリーへ</Link>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <main id="main" ref={mainRef} className="gallery-tours-main">
        {tour && activeWorkId ? (
          <>
            <GalleryTourTheatre
              key={tour.id}
              tour={tour}
              index={index}
              onIndexChange={selectIndex}
              suspended={menuOpen}
              onExit={() => {
                focusAfterNavigation.current = true;
                onExit();
              }}
              onArtworkReady={remember}
              actions={
                <TourShareLink
                  key={`${tour.id}:${activeWorkId}`}
                  tourId={tour.id}
                  workId={activeWorkId}
                />
              }
            />
            {storageMessage && (
              <p role="status" className="gallery-tour-storage-message">
                {storageMessage}
              </p>
            )}
          </>
        ) : (
          <GalleryTourEntrance
            progress={progress}
            onStart={(id, resumeId) => {
              const next = getGalleryTour(id);
              if (!next) return;
              focusAfterNavigation.current = true;
              onSelect(next.id, next.stops[getTourStopIndex(next, resumeId)].artworkId, false);
            }}
            onReset={resetTour}
            storageMessage={storageMessage}
          />
        )}
      </main>
      <div className="gallery-tours-colophon">
        <p>
          画像に映る光や構図を手がかりに巡る、小さな展示ツアー。再開位置はこのブラウザーに保存されます。
        </p>
        <Link to="/gallery">
          すべての作品を見る <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <SideMenuLayer context="gallery" open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}
