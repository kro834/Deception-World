import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { LiquidLens, LiquidPointerGlow } from "@/components/world/liquid-rail";
import { useWorldMode } from "@/components/world/use-world-mode";
import { initRail } from "@/lib/liquid/boot.js";
import { WORLD_STYLESHEET_LINKS } from "@/lib/world-head";

export const Route = createFileRoute("/form-archive")({
  component: FormArchive,
  head: () => ({
    meta: [
      { title: "仮面ライダーサーガ／レルム｜フォームアーカイブ" },
      {
        name: "description",
        content: "仮面ライダーサーガと仮面ライダーレルムのフォーム一覧・スペック・比較アーカイブ。",
      },
    ],
    links: WORLD_STYLESHEET_LINKS,
  }),
});

type ArchiveKind = "saga" | "realm";
const ARCHIVE_READY_FAILSAFE_MS = 900;

type ArchiveTransition = {
  archive: ArchiveKind;
  generation: number;
};

type ArchiveReadyFallback = ArchiveTransition & {
  frame: HTMLIFrameElement;
  timer: number;
};

function FormArchive() {
  useWorldMode();
  const [archive, setArchive] = useState<ArchiveKind>("saga");
  const [transitionGeneration, setTransitionGeneration] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const transitionGenerationRef = useRef(0);
  const activeTransitionRef = useRef<ArchiveTransition>({ archive: "saga", generation: 0 });
  const loadedFrameTransitionRef = useRef<ArchiveTransition | null>(null);
  const readyFallbackRef = useRef<ArchiveReadyFallback | null>(null);
  const selectArchiveRef = useRef<(next: ArchiveKind) => void>(() => {});
  const isSaga = archive === "saga";
  const archiveDocument = isSaga
    ? "/saga-form-archive-embedded.html?v=20260828-r44"
    : "/realm-form-archive-embedded.html?v=20260828-r44";

  useEffect(() => {
    const expectedArchive = archive;
    const expectedGeneration = transitionGeneration;
    const expectedFrame = frameRef.current;

    const releaseIfCurrent = () => {
      const activeTransition = activeTransitionRef.current;
      const loadedFrameTransition = loadedFrameTransitionRef.current;
      if (
        activeTransition.archive !== expectedArchive ||
        activeTransition.generation !== expectedGeneration ||
        loadedFrameTransition?.archive !== expectedArchive ||
        loadedFrameTransition.generation !== expectedGeneration ||
        frameRef.current !== expectedFrame ||
        expectedFrame?.dataset.archiveKind !== expectedArchive ||
        expectedFrame.dataset.archiveGeneration !== String(expectedGeneration)
      ) {
        return;
      }

      const fallback = readyFallbackRef.current;
      if (
        fallback?.archive === expectedArchive &&
        fallback.generation === expectedGeneration &&
        fallback.frame === expectedFrame
      ) {
        window.clearTimeout(fallback.timer);
        readyFallbackRef.current = null;
      }
      setLoaded(true);
    };

    const markArchiveReady = (event: MessageEvent) => {
      if (event.data?.type !== "saga-archive:ready" || event.data?.kind !== expectedArchive) {
        return;
      }

      const expectedWindow = expectedFrame?.contentWindow ?? null;
      const loadedFrameTransition = loadedFrameTransitionRef.current;
      // Sandboxed archive documents have an opaque origin. A few WebKit and
      // embedded WebView versions consequently expose MessageEvent.source as
      // null. Never trust that source-less message directly: the generation-
      // bound fallback installed by the current iframe's load event owns that
      // compatibility path, so a queued message from an old iframe cannot
      // release a newer transition.
      const shouldUseOpaqueWebKitFallback =
        event.source === null &&
        (event.origin === "null" || event.origin === "") &&
        loadedFrameTransition?.archive === expectedArchive &&
        loadedFrameTransition.generation === expectedGeneration;
      if (shouldUseOpaqueWebKitFallback) return;
      if (expectedWindow === null || event.source !== expectedWindow) return;

      releaseIfCurrent();
    };
    window.addEventListener("message", markArchiveReady);
    return () => {
      window.removeEventListener("message", markArchiveReady);
      const fallback = readyFallbackRef.current;
      if (
        fallback?.archive === expectedArchive &&
        fallback.generation === expectedGeneration &&
        fallback.frame === expectedFrame
      ) {
        window.clearTimeout(fallback.timer);
        readyFallbackRef.current = null;
      }
    };
  }, [archive, transitionGeneration]);

  const selectArchive = useCallback(
    (next: ArchiveKind) => {
      // Let WebKit release the current iframe document before another archive is
      // requested. Rapid Saga/Realm toggles during onLoad can otherwise overlap
      // two image-heavy document constructions on iPhone and iPad.
      if (!loaded || next === activeTransitionRef.current.archive) return;
      const generation = transitionGenerationRef.current + 1;
      transitionGenerationRef.current = generation;
      activeTransitionRef.current = { archive: next, generation };
      loadedFrameTransitionRef.current = null;
      const fallback = readyFallbackRef.current;
      if (fallback) window.clearTimeout(fallback.timer);
      readyFallbackRef.current = null;
      setLoaded(false);
      setTransitionGeneration(generation);
      setArchive(next);
    },
    [loaded],
  );

  useEffect(() => {
    selectArchiveRef.current = selectArchive;
  }, [selectArchive]);

  useEffect(() => {
    const switcher = switcherRef.current;
    if (!switcher) return;

    const handleRailSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      selectArchiveRef.current(index === 1 ? "realm" : "saga");
    };

    switcher.addEventListener("railselect", handleRailSelect);
    const disposeRail = initRail(switcher);
    return () => {
      switcher.removeEventListener("railselect", handleRailSelect);
      disposeRail?.();
    };
  }, []);

  return (
    <main className="form-archive-page" data-archive-kind={archive}>
      <header className="form-archive-toolbar" aria-label="フォームアーカイブ操作">
        <div
          ref={switcherRef}
          id="archive-switcher"
          className="form-archive-switcher liquid-swipe-tabs ios26-glass"
          role="tablist"
          aria-busy={!loaded}
          inert={!loaded ? true : undefined}
          aria-label="フォームアーカイブを切り替え。タップ、長押し、または左右へのスライドで選択できます"
          style={{
            ["--liquid-current-accent" as string]: isSaga
              ? "var(--archive-cyan)"
              : "var(--archive-violet)",
          }}
        >
          <LiquidLens />
          <button
            type="button"
            role="tab"
            className={isSaga ? "is-active" : ""}
            tabIndex={isSaga ? 0 : -1}
            aria-selected={isSaga}
            aria-controls="form-archive-frame"
            data-liquid-pointer="true"
            data-archive="saga"
            style={{ ["--liquid-accent" as string]: "var(--archive-cyan)" }}
            title="タップ、長押し、または左右へスライド"
            onClick={() => selectArchive("saga")}
          >
            <LiquidPointerGlow />
            <small>SAGA</small>
            <b>サーガ</b>
          </button>
          <button
            type="button"
            role="tab"
            className={!isSaga ? "is-active" : ""}
            tabIndex={!isSaga ? 0 : -1}
            aria-selected={!isSaga}
            aria-controls="form-archive-frame"
            data-liquid-pointer="true"
            data-archive="realm"
            style={{ ["--liquid-accent" as string]: "var(--archive-violet)" }}
            title="タップ、長押し、または左右へスライド"
            onClick={() => selectArchive("realm")}
          >
            <LiquidPointerGlow />
            <small>REALM</small>
            <b>レルム</b>
          </button>
        </div>
        <SideMenuTrigger
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="form-archive-menu-trigger"
        />
      </header>
      <SideMenuLayer context="archive" open={menuOpen} onOpenChange={setMenuOpen} />
      <div
        className={`form-archive-frame-status${loaded ? " is-loaded" : ""}`}
        role="status"
        aria-live="polite"
      >
        <i aria-hidden="true" />
        <span>{isSaga ? "SAGA" : "REALM"} ARCHIVE</span>
      </div>
      <iframe
        ref={frameRef}
        key={`${archive}:${transitionGeneration}`}
        id="form-archive-frame"
        data-archive-kind={archive}
        data-archive-generation={transitionGeneration}
        title={`仮面ライダー${isSaga ? "サーガ" : "レルム"} フォームアーカイブ`}
        src={archiveDocument}
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
        loading="eager"
        scrolling="yes"
        onLoad={(event) => {
          const frame = event.currentTarget;
          const activeTransition = activeTransitionRef.current;
          if (
            frameRef.current !== frame ||
            frame.dataset.archiveKind !== activeTransition.archive ||
            frame.dataset.archiveGeneration !== String(activeTransition.generation)
          ) {
            return;
          }

          loadedFrameTransitionRef.current = activeTransition;
          const previousFallback = readyFallbackRef.current;
          if (previousFallback) window.clearTimeout(previousFallback.timer);
          const timer = window.setTimeout(() => {
            const fallback = readyFallbackRef.current;
            const currentTransition = activeTransitionRef.current;
            if (
              fallback?.timer !== timer ||
              fallback.archive !== activeTransition.archive ||
              fallback.generation !== activeTransition.generation ||
              fallback.frame !== frame ||
              currentTransition.archive !== activeTransition.archive ||
              currentTransition.generation !== activeTransition.generation ||
              frameRef.current !== frame
            ) {
              return;
            }

            readyFallbackRef.current = null;
            setLoaded(true);
          }, ARCHIVE_READY_FAILSAFE_MS);
          readyFallbackRef.current = { ...activeTransition, frame, timer };

          // A newly created WebKit iframe can restore an inline scroll lock
          // from the archive controller before its first paint. Ask the loaded
          // document to clear transient UI, then request a fresh child-owned
          // ready signal. Loading the document alone is not archive readiness.
          frame.contentWindow?.postMessage({ type: "saga-archive:close-transients" }, "*");
          frame.contentWindow?.postMessage({ type: "saga-archive:status-request" }, "*");
        }}
      />
    </main>
  );
}
