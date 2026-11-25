import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { GalleryTourEntrance } from "./tour-entrance";
import { GalleryTourTheatre } from "./tour-theatre";
import { GALLERY_TOURS, getGalleryTour, getTourStopIndex } from "./tour-data";
import {
  clearTourProgress,
  readTourProgressState,
  saveTourProgress,
  TOUR_PROGRESS_KEY,
  type TourProgress,
} from "./tour-progress";

// A tour can appear several times in history, with a different departure each time.
const nextTourDepartures = new Map<string, string>();

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
  const { history } = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<TourProgress>({});
  const [storageMessage, setStorageMessage] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const focusAfterNavigation = useRef(false);
  const returnTourIdRef = useRef<string | null>(null);
  const nextTourButton = useRef<HTMLButtonElement>(null);
  const nextTourReturn = useRef<{ key: string; tourId: string | null; cancelled: boolean } | null>(null);
  const tour = getGalleryTour(tourId);
  const previousTourId = useRef(tour?.id);
  const nextTour = tour
    ? GALLERY_TOURS[(GALLERY_TOURS.indexOf(tour) + 1) % GALLERY_TOURS.length]
    : undefined;
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
    let previous = history.location;
    const unsubscribe = history.subscribe(({ location, action }) => {
      const from = previous;
      previous = location;
      const key = location.state.__TSR_key;
      const backward = action.type === "BACK" || (action.type === "GO" && action.index === -1);
      const destination = key && nextTourDepartures.get(key);
      nextTourReturn.current =
        backward &&
        key &&
        destination &&
        from.pathname === "/gallery-tours" &&
        location.pathname === "/gallery-tours" &&
        new URLSearchParams(from.search).get("tour") === destination
          ? { key, tourId: new URLSearchParams(location.search).get("tour"), cancelled: document.hidden }
          : null;
      if (nextTourReturn.current) focusAfterNavigation.current = false;
    });
    const cancel = () => {
      if (nextTourReturn.current) nextTourReturn.current.cancelled = true;
    };
    const listeners = new AbortController();
    for (const type of ["keydown", "pointerdown", "wheel", "focusin", "blur"])
      window.addEventListener(type, cancel, {
        capture: type !== "blur",
        passive: true,
        signal: listeners.signal,
      });
    document.addEventListener("visibilitychange", cancel, { signal: listeners.signal });
    return () => {
      nextTourReturn.current = null;
      unsubscribe();
      listeners.abort();
    };
  }, [history]);

  const focusNextTourOnReturn = useCallback(() => {
    const request = nextTourReturn.current;
    const button = nextTourButton.current;
    if (!request || request.cancelled || request.tourId !== tourId || !button || menuOpen) return;
    window.requestAnimationFrame(() => {
      if (
        nextTourReturn.current !== request ||
        request.cancelled ||
        history.location.state.__TSR_key !== request.key ||
        !button.isConnected ||
        document.hidden
      )
        return;
      request.cancelled = true;
      button.focus({ preventScroll: true });
      button.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }, [history, menuOpen, tourId]);

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
    const previousId = previousTourId.current;
    previousTourId.current = tour?.id;
    const explicitNavigation = focusAfterNavigation.current;
    if (nextTourReturn.current) {
      focusNextTourOnReturn();
      return;
    }
    if (!explicitNavigation && previousId === tour?.id) return;
    focusAfterNavigation.current = false;
    const returnId = returnTourIdRef.current ?? previousId;
    returnTourIdRef.current = null;
    if (!tour && returnId) {
      // Restore the course after the router has applied its navigation scroll reset.
      const frame = window.requestAnimationFrame(() => {
        const heading = mainRef.current?.querySelector<HTMLElement>(
          `#gallery-tour-title-${returnId}`,
        );
        heading?.focus({ preventScroll: true });
        heading?.closest(".gallery-tour-course")?.scrollIntoView({ block: "start" });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const main = mainRef.current;
    if (explicitNavigation) {
      main?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      return;
    }

    // Browser history restores the scroll position independently of the tour.
    // Focus an element the reader can already see at that position.
    const frame = window.requestAnimationFrame(() => {
      if (!main || nextTourReturn.current) return;
      const bar = main.previousElementSibling;
      const viewportTop = Math.max(0, bar?.getBoundingClientRect().bottom ?? 0);
      const targets = main.querySelectorAll<HTMLElement>(
        "h1, #gallery-tour-stage, #gallery-tour-reading h2, .gallery-tour-theatre button:not(:disabled, [tabindex=\"-1\"], [aria-disabled=\"true\"])",
      );
      for (const target of targets) {
        const bounds = target.getBoundingClientRect();
        const top = Math.max(bounds.top, viewportTop);
        const bottom = Math.min(bounds.bottom, window.innerHeight);
        if (bounds.height === 0 || bottom - top < Math.min(24, bounds.height)) continue;
        // A thumbnail may also be clipped by the horizontal filmstrip.
        const visiblePoint = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          (top + bottom) / 2,
        );
        if (!target.contains(visiblePoint)) continue;
        target.focus({ preventScroll: true });
        break;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tour, focusNextTourOnReturn]);

  const remember = useCallback(
    (id: string) => {
      if (
        !tourId ||
        activePositionRef.current.tourId !== tourId ||
        activePositionRef.current.workId !== id
      )
        return;
      // The last stop's button mounts only after its artwork is ready.
      focusNextTourOnReturn();
      try {
        setProgress(saveTourProgress(window.localStorage, tourId, id));
        setStorageMessage("");
      } catch {
        setStorageMessage(
          "このブラウザーでは再開位置を保存できません。ツアーはそのまま鑑賞できます。",
        );
      }
    },
    [tourId, focusNextTourOnReturn],
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
    <div
      className="world gallery-page gallery-tours-page command-support-tours"
      data-gallery-tours="true"
    >
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
                returnTourIdRef.current = tour.id;
                onExit();
              }}
              nextTour={nextTour}
              nextTourButtonRef={nextTourButton}
              onNextTour={() => {
                if (!nextTour) return;
                const key = history.location.state.__TSR_key;
                if (key) nextTourDepartures.set(key, nextTour.id);
                focusAfterNavigation.current = true;
                onSelect(nextTour.id, nextTour.stops[0].artworkId, false);
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
        <p>再開位置はこのブラウザーに保存されます。気になる一枚から、いつでも続きを。</p>
        <Link to="/gallery">
          すべての作品を見る <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <SideMenuLayer context="gallery" open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}
