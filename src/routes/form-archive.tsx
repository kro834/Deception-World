import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  type ArchiveKind = "saga" | "realm";

  const [archive, setArchive] = useState<ArchiveKind>("saga");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [holdingArchive, setHoldingArchive] = useState<ArchiveKind | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const isSaga = archive === "saga";

  const selectArchive = useCallback((next: ArchiveKind) => {
    if (next === archive) return;
    setLoaded(false);
    setArchive(next);
  }, [archive]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setHoldingArchive(null);
  }, []);

  const beginLongPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>, next: ArchiveKind) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    cancelLongPress();
    setHoldingArchive(next);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      ignoreClickUntilRef.current = performance.now() + 800;
      setHoldingArchive(null);
      selectArchive(next);
    }, 440);
  }, [cancelLongPress, selectArchive]);

  const activateArchive = useCallback((next: ArchiveKind) => {
    if (performance.now() < ignoreClickUntilRef.current) return;
    selectArchive(next);
  }, [selectArchive]);

  useEffect(() => cancelLongPress, [cancelLongPress]);

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
          className={holdingArchive === "saga" ? "is-long-pressing" : undefined}
          title="タップまたは長押しでサーガへ切り替え"
          onPointerDown={(event) => beginLongPress(event, "saga")}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => activateArchive("saga")}
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
          className={holdingArchive === "realm" ? "is-long-pressing" : undefined}
          title="タップまたは長押しでレルムへ切り替え"
          onPointerDown={(event) => beginLongPress(event, "realm")}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => activateArchive("realm")}
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
