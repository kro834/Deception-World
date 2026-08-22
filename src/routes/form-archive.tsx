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

function FormArchive() {
  useWorldMode();
  const [archive, setArchive] = useState<ArchiveKind>("saga");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const isSaga = archive === "saga";

  const selectArchive = useCallback((next: ArchiveKind) => {
    if (next === archive) return;
    setLoaded(false);
    setArchive(next);
  }, [archive]);

  useEffect(() => {
    const switcher = switcherRef.current;
    if (!switcher) return;

    const handleRailSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      selectArchive(index === 1 ? "realm" : "saga");
    };

    switcher.addEventListener("railselect", handleRailSelect);
    initRail(switcher);
    return () => switcher.removeEventListener("railselect", handleRailSelect);
  }, [selectArchive]);

  return (
    <main className="form-archive-page" data-archive-kind={archive}>
      <div
        ref={switcherRef}
        id="archive-switcher"
        className="form-archive-switcher liquid-swipe-tabs ios26-glass"
        role="tablist"
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
      <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} className="form-archive-menu-trigger" />
      <SideMenuLayer context="archive" open={menuOpen} onOpenChange={setMenuOpen} />
      <div className={`form-archive-frame-status${loaded ? " is-loaded" : ""}`} role="status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{isSaga ? "SAGA" : "REALM"} ARCHIVE</span>
      </div>
      <iframe
        id="form-archive-frame"
        title={`仮面ライダー${isSaga ? "サーガ" : "レルム"} フォームアーカイブ`}
        src={isSaga ? "/saga-form-archive-standalone.html" : "/realm-form-archive-standalone.html"}
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </main>
  );
}
