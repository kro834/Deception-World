import { createFileRoute } from "@tanstack/react-router";
import { validateInquirySearch } from "@/lib/inquiry-guides";
import { useCallback, useEffect, useRef, useState } from "react";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { LiquidLens, LiquidPointerGlow } from "@/components/world/liquid-rail";
import { useWorldMode } from "@/components/world/use-world-mode";
import { initRail } from "@/lib/liquid/boot.js";
import { WORLD_STYLESHEET_LINKS } from "@/lib/world-head";
import formArchiveCssUrl from "@/styles-form-archive.css?url";

type ArchiveKind = "saga" | "realm";

// The reader's form and compared pair live in this URL (?form=vertex,
// ?compare=multi.vertex), so a shared link, a reload or Back reopens them.
// The sandboxed archive cannot read the page URL: the frame receives them in
// its #fragment and reports each choice (public/archive-state-bridge.js).
const ARCHIVE_STATE_MESSAGE = "deception-world:archive-state";
const ARCHIVE_FORM_ID = /^[a-z0-9-]{1,40}$/;
const ARCHIVE_COMPARE_PAIR = /^[a-z0-9-]{1,40}\.[a-z0-9-]{1,40}$/;

type ArchiveFrameState = { form?: string; compare?: string };

function archiveFormId(value: unknown) {
  return typeof value === "string" && ARCHIVE_FORM_ID.test(value) ? value : undefined;
}

function archiveComparePair(value: unknown) {
  return typeof value === "string" && ARCHIVE_COMPARE_PAIR.test(value) ? value : undefined;
}

function archiveFrameHash({ form, compare }: ArchiveFrameState) {
  const params = new URLSearchParams();
  if (form) params.set("form", form);
  if (compare) params.set("compare", compare);
  const fragment = params.toString();
  return fragment ? `#${fragment}` : "";
}

export const Route = createFileRoute("/form-archive")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateInquirySearch(search),
    archive: search.archive === "realm" ? ("realm" as const) : undefined,
    form: archiveFormId(search.form),
    compare: archiveComparePair(search.compare),
  }),
  component: FormArchive,
  head: () => ({
    meta: [
      { title: "仮面ライダーサーガ／レルム｜フォームアーカイブ" },
      {
        name: "description",
        content: "仮面ライダーサーガと仮面ライダーレルムのフォーム一覧・スペック・比較アーカイブ。",
      },
    ],
    // The route chrome sheet goes after the World sheets; the Michroma HUD
    // subset it names is already loaded root-wide.
    links: [...WORLD_STYLESHEET_LINKS, { rel: "stylesheet", href: formArchiveCssUrl }],
  }),
});

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
  const {
    archive: requestedArchive = "saga",
    form: requestedForm,
    compare: requestedCompare,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [archive, setArchive] = useState<ArchiveKind>(requestedArchive);
  // Fixed for each frame: a new src would reload the archive and add a frame
  // history entry, so later choices travel up by message, not down by src.
  const [frameState, setFrameState] = useState<ArchiveFrameState>(() => ({
    form: requestedForm,
    compare: requestedCompare,
  }));
  const knownStateRef = useRef<ArchiveFrameState>(frameState);
  const reportsInFlightRef = useRef(0);
  const [transitionGeneration, setTransitionGeneration] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const transitionGenerationRef = useRef(0);
  const activeTransitionRef = useRef<ArchiveTransition>({
    archive: requestedArchive,
    generation: 0,
  });
  const loadedFrameTransitionRef = useRef<ArchiveTransition | null>(null);
  const readyFallbackRef = useRef<ArchiveReadyFallback | null>(null);
  const restoreSwitcherFocusRef = useRef<ArchiveTransition | null>(null);
  const selectArchiveRef = useRef<
    (next: ArchiveKind, nextState?: ArchiveFrameState, reopen?: boolean) => void
  >(() => {});
  const isSaga = archive === "saga";
  const archiveDocument = isSaga
    ? "/saga-form-archive-embedded.html?v=20261010-deck"
    : "/realm-form-archive-embedded.html?v=20261010-deck";

  // An SSR iframe can finish before hydration and lose its one-shot load
  // event. Mount it only after React can own that event and its ready fallback.
  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
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
  }, [archive, clientReady, transitionGeneration]);

  const selectArchive = useCallback(
    (next: ArchiveKind, nextState: ArchiveFrameState = {}, reopen = false) => {
      // Let WebKit release the current iframe document before another archive is
      // requested. Rapid Saga/Realm toggles during onLoad can otherwise overlap
      // two image-heavy document constructions on iPhone and iPad.
      if (!loaded || (next === activeTransitionRef.current.archive && !reopen)) return;
      const generation = transitionGenerationRef.current + 1;
      transitionGenerationRef.current = generation;
      activeTransitionRef.current = { archive: next, generation };
      restoreSwitcherFocusRef.current = switcherRef.current?.contains(document.activeElement)
        ? activeTransitionRef.current
        : null;
      loadedFrameTransitionRef.current = null;
      const fallback = readyFallbackRef.current;
      if (fallback) window.clearTimeout(fallback.timer);
      readyFallbackRef.current = null;
      setLoaded(false);
      knownStateRef.current = nextState;
      setFrameState(nextState);
      setTransitionGeneration(generation);
      setArchive(next);
      // Keep this history entry tied to the document being read. Replacing
      // it preserves Back's meaning while reloads and shared URLs retain Realm.
      // The other archive's forms are not this one's, so its record starts over.
      if (next !== requestedArchive) {
        void navigate({
          search: (previous) => ({
            ...previous,
            archive: next === "realm" ? next : undefined,
            form: undefined,
            compare: undefined,
          }),
          hash: true,
          replace: true,
          resetScroll: false,
        });
      }
    },
    [loaded, navigate, requestedArchive],
  );

  useEffect(() => {
    selectArchiveRef.current = selectArchive;
  }, [selectArchive]);

  // A same-page history traversal may request another archive, form or pair
  // while a frame is loading. Let that frame settle before replacing it, just
  // as for taps. The frame's own reports are already known and change nothing.
  useEffect(() => {
    if (!loaded || reportsInFlightRef.current > 0) return;
    const known = knownStateRef.current;
    const archiveChanged = requestedArchive !== activeTransitionRef.current.archive;
    const recordChanged = requestedForm !== known.form || requestedCompare !== known.compare;
    if (archiveChanged || recordChanged) {
      selectArchiveRef.current(
        requestedArchive,
        { form: requestedForm, compare: requestedCompare },
        !archiveChanged,
      );
    }
  }, [loaded, requestedArchive, requestedForm, requestedCompare]);

  // The current frame reports the reader's form and pair; this entry's URL
  // keeps them (replaced, like the archive switch, so Back keeps its meaning).
  useEffect(() => {
    const keepArchiveState = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown;
        kind?: unknown;
        form?: unknown;
        compare?: unknown;
      };
      if (data?.type !== ARCHIVE_STATE_MESSAGE) return;
      const frame = frameRef.current;
      if (!frame || event.source === null || event.source !== frame.contentWindow) return;
      if (data.kind !== activeTransitionRef.current.archive) return;
      const form = archiveFormId(data.form);
      const compare = archiveComparePair(data.compare);
      knownStateRef.current = { form, compare };
      reportsInFlightRef.current += 1;
      void navigate({
        search: (previous) => ({ ...previous, form, compare }),
        hash: true,
        replace: true,
        resetScroll: false,
      }).finally(() => {
        reportsInFlightRef.current -= 1;
      });
    };
    window.addEventListener("message", keepArchiveState);
    return () => window.removeEventListener("message", keepArchiveState);
  }, [navigate]);

  useEffect(() => {
    if (!loaded) return;
    const pending = restoreSwitcherFocusRef.current;
    restoreSwitcherFocusRef.current = null;
    const current = activeTransitionRef.current;
    const switcher = switcherRef.current;
    if (
      !pending ||
      pending.archive !== current.archive ||
      pending.generation !== current.generation ||
      !switcher
    ) {
      return;
    }
    // Making the loading rail inert drops keyboard focus to the body. Restore
    // the selected tab so the next arrow key still works, unless the visitor
    // has moved to another control while this document was loading.
    if (document.activeElement === document.body || switcher.contains(document.activeElement)) {
      switcher
        .querySelector<HTMLButtonElement>(`button[data-archive="${current.archive}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [loaded]);

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
      {clientReady ? (
        <iframe
          ref={frameRef}
          key={`${archive}:${transitionGeneration}`}
          id="form-archive-frame"
          data-archive-kind={archive}
          data-archive-generation={transitionGeneration}
          title={`仮面ライダー${isSaga ? "サーガ" : "レルム"} フォームアーカイブ`}
          src={`${archiveDocument}${archiveFrameHash(frameState)}`}
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
      ) : null}
    </main>
  );
}
