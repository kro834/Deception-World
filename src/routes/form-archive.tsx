import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { LiquidPointerGlow } from "@/components/world/liquid-rail";
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

function FormArchive() {
  const [archive, setArchive] = useState<"saga" | "realm">("saga");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const isSaga = archive === "saga";

  const selectArchive = (next: "saga" | "realm") => {
    if (next === archive) return;
    setLoaded(false);
    setArchive(next);
  };

  return (
    <main className="form-archive-page" data-archive-kind={archive}>
      <div id="archive-switcher" className="form-archive-switcher ios26-glass" role="tablist" aria-label="フォームアーカイブを切り替え">
        <span className="form-archive-switcher-track" aria-hidden="true" data-active={archive} />
        <button
          type="button"
          role="tab"
          aria-selected={isSaga}
          aria-controls="form-archive-frame"
          data-liquid-pointer="true"
          onClick={() => selectArchive("saga")}
        >
          <LiquidPointerGlow />
          <small>SAGA</small>
          <b>サーガ</b>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isSaga}
          aria-controls="form-archive-frame"
          data-liquid-pointer="true"
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
