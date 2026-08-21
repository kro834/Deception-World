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

type ArchiveKind = "saga" | "realm";

type ArchivePress = {
  pointerId: number;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  target: HTMLButtonElement;
};

function FormArchive() {
  const [archive, setArchive] = useState<ArchiveKind>("saga");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [holdingArchive, setHoldingArchive] = useState<ArchiveKind | null>(null);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<ArchivePress | null>(null);
  const dragProgressRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const isSaga = archive === "saga";

  const selectArchive = useCallback((next: ArchiveKind) => {
    if (next === archive) return;
    setLoaded(false);
    setArchive(next);
  }, [archive]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const updateDragProgress = useCallback((next: number | null) => {
    dragProgressRef.current = next;
    setDragProgress(next);
  }, []);

  const progressFromPointer = useCallback((clientX: number) => {
    const bounds = switcherRef.current?.getBoundingClientRect();
    if (!bounds) return archive === "realm" ? 1 : 0;

    const firstCenter = bounds.left + bounds.width * 0.25;
    const travel = bounds.width * 0.5;
    return Math.min(1, Math.max(0, (clientX - firstCenter) / travel));
  }, [archive]);

  const cancelPointerGesture = useCallback(() => {
    clearLongPressTimer();
    const press = pressRef.current;
    pressRef.current = null;
    setHoldingArchive(null);
    updateDragProgress(null);

    if (press?.target.hasPointerCapture(press.pointerId)) {
      press.target.releasePointerCapture(press.pointerId);
    }
  }, [clearLongPressTimer, updateDragProgress]);

  const beginLongPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>, next: ArchiveKind) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    cancelPointerGesture();
    const target = event.currentTarget;
    pressRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      target,
    };
    target.setPointerCapture(event.pointerId);
    setHoldingArchive(next);
    longPressTimerRef.current = setTimeout(() => {
      const press = pressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;

      longPressTimerRef.current = null;
      setHoldingArchive(null);
      updateDragProgress(progressFromPointer(press.clientX));
    }, 360);
  }, [cancelPointerGesture, progressFromPointer, updateDragProgress]);

  const moveLongPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;

    press.clientX = event.clientX;
    press.clientY = event.clientY;

    if (dragProgressRef.current !== null) {
      event.preventDefault();
      updateDragProgress(progressFromPointer(event.clientX));
      return;
    }

    const distance = Math.hypot(event.clientX - press.originX, event.clientY - press.originY);
    if (distance <= 16) return;

    ignoreClickUntilRef.current = performance.now() + 650;
    cancelPointerGesture();
  }, [cancelPointerGesture, progressFromPointer, updateDragProgress]);

  const finishLongPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;

    clearLongPressTimer();
    const finalProgress = dragProgressRef.current;
    pressRef.current = null;
    setHoldingArchive(null);

    if (finalProgress !== null) {
      event.preventDefault();
      ignoreClickUntilRef.current = performance.now() + 800;
      selectArchive(finalProgress >= 0.5 ? "realm" : "saga");
    }

    updateDragProgress(null);
    if (press.target.hasPointerCapture(event.pointerId)) {
      press.target.releasePointerCapture(event.pointerId);
    }
  }, [clearLongPressTimer, selectArchive, updateDragProgress]);

  const activateArchive = useCallback((next: ArchiveKind) => {
    if (performance.now() < ignoreClickUntilRef.current) return;
    selectArchive(next);
  }, [selectArchive]);

  useEffect(() => () => {
    clearLongPressTimer();
    pressRef.current = null;
    dragProgressRef.current = null;
  }, [clearLongPressTimer]);

  return (
    <main className="form-archive-page" data-archive-kind={archive}>
      <div
        ref={switcherRef}
        id="archive-switcher"
        className="form-archive-switcher ios26-glass"
        role="tablist"
        aria-label="フォームアーカイブを切り替え。長押し後、左右へスライドできます"
        data-dragging={dragProgress !== null ? "true" : undefined}
        data-drag-target={dragProgress === null ? undefined : dragProgress >= 0.5 ? "realm" : "saga"}
      >
        <span
          className="form-archive-switcher-track"
          aria-hidden="true"
          data-active={archive}
          style={dragProgress === null ? undefined : { transform: `translate3d(${dragProgress * 100}%, 0, 0)` }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={isSaga}
          aria-controls="form-archive-frame"
          data-liquid-pointer="true"
          data-archive="saga"
          className={holdingArchive === "saga" ? "is-long-pressing" : undefined}
          title="タップ、または長押しして左右へスライド"
          onPointerDown={(event) => beginLongPress(event, "saga")}
          onPointerMove={moveLongPress}
          onPointerUp={finishLongPress}
          onPointerCancel={cancelPointerGesture}
          onLostPointerCapture={cancelPointerGesture}
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
          data-archive="realm"
          className={holdingArchive === "realm" ? "is-long-pressing" : undefined}
          title="タップ、または長押しして左右へスライド"
          onPointerDown={(event) => beginLongPress(event, "realm")}
          onPointerMove={moveLongPress}
          onPointerUp={finishLongPress}
          onPointerCancel={cancelPointerGesture}
          onLostPointerCapture={cancelPointerGesture}
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
