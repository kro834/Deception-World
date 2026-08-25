import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { LiquidLens, LiquidPointerGlow } from "@/components/world/liquid-rail";
import { useWorldMode } from "@/components/world/use-world-mode";
import { initRail } from "@/lib/liquid/boot.js";
import "@/styles-world.css";
import "@/styles-world-addon.css";

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
  }),
});

type ArchiveKind = "saga" | "realm";
const ARCHIVE_READY_FAILSAFE_MS = 900;

function FormArchive() {
  useWorldMode();
  const [archive, setArchive] = useState<ArchiveKind>("saga");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const selectArchiveRef = useRef<(next: ArchiveKind) => void>(() => {});
  const isSaga = archive === "saga";
  const archiveDocument = isSaga
    ? "/saga-form-archive-embedded.html?v=20260825-r42"
    : "/realm-form-archive-embedded.html?v=20260825-r42";

  useEffect(() => {
    const markArchiveReady = (event: MessageEvent) => {
      if (event.data?.type !== "saga-archive:ready" || event.data?.kind !== archive) return;
      setLoaded(true);
    };
    window.addEventListener("message", markArchiveReady);
    // Opaque-origin sandboxed frames can suppress MessageEvent.source on a
    // small set of WebKit/WebView builds. The child still owns its boot
    // surface, so release only the outer veil after a short bounded fallback.
    const failSafe = window.setTimeout(() => setLoaded(true), ARCHIVE_READY_FAILSAFE_MS);
    return () => {
      window.removeEventListener("message", markArchiveReady);
      window.clearTimeout(failSafe);
    };
  }, [archive]);

  const selectArchive = useCallback(
    (next: ArchiveKind) => {
      // Let WebKit release the current iframe document before another archive is
      // requested. Rapid Saga/Realm toggles during onLoad can otherwise overlap
      // two image-heavy document constructions on iPhone and iPad.
      if (!loaded || next === archive) return;
      setLoaded(false);
      setArchive(next);
    },
    [archive, loaded],
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
        key={archive}
        id="form-archive-frame"
        title={`仮面ライダー${isSaga ? "サーガ" : "レルム"} フォームアーカイブ`}
        src={archiveDocument}
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
        loading="eager"
        scrolling="yes"
        onLoad={(event) => {
          // A newly created WebKit iframe can restore an inline scroll lock
          // from the archive controller before its first paint. Ask the loaded
          // document to clear transient UI before exposing it to interaction.
          event.currentTarget.contentWindow?.postMessage(
            { type: "saga-archive:close-transients" },
            "*",
          );
          window.requestAnimationFrame(() => setLoaded(true));
        }}
      />
    </main>
  );
}
