import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { LiquidLens, LiquidPointerGlow } from "@/components/world/liquid-rail";
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
  startProgress: 0 | 1;
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
  const switchProgress = dragProgress ?? (isSaga ? 0 : 1);
  const contactArchive = dragProgress === null
    ? holdingArchive
    : dragProgress >= 0.5 ? "realm" : "saga";

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

  const updateLiquidContact = useCallback((clientX: number, clientY: number) => {
    const switcher = switcherRef.current;
    const bounds = switcher?.getBoundingClientRect();
    if (!switcher || !bounds) return;

    switcher.style.setProperty("--archive-contact-x", `${clientX - bounds.left}px`);
    switcher.style.setProperty("--archive-contact-y", `${clientY - bounds.top}px`);
  }, []);

  const progressFromDrag = useCallback((press: ArchivePress, clientX: number) => {
    const bounds = switcherRef.current?.getBoundingClientRect();
    if (!bounds) return press.startProgress;

    const travel = bounds.width * 0.5;
    return Math.min(1, Math.max(0, press.startProgress + (clientX - press.originX) / travel));
  }, []);

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
      startProgress: archive === "realm" ? 1 : 0,
      target,
    };
    target.setPointerCapture(event.pointerId);
    updateLiquidContact(event.clientX, event.clientY);
    setHoldingArchive(next);
    longPressTimerRef.current = setTimeout(() => {
      const press = pressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;

      longPressTimerRef.current = null;
      setHoldingArchive(null);
      updateDragProgress(press.startProgress);
    }, 360);
  }, [archive, cancelPointerGesture, updateDragProgress, updateLiquidContact]);

  const moveLongPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;

    press.clientX = event.clientX;
    press.clientY = event.clientY;
    updateLiquidContact(event.clientX, event.clientY);

    if (dragProgressRef.current !== null) {
      event.preventDefault();
      updateDragProgress(progressFromDrag(press, event.clientX));
      return;
    }

    const distance = Math.hypot(event.clientX - press.originX, event.clientY - press.originY);
    if (distance <= 16) return;

    ignoreClickUntilRef.current = performance.now() + 650;
    cancelPointerGesture();
  }, [cancelPointerGesture, progressFromDrag, updateDragProgress, updateLiquidContact]);

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
        className="form-archive-switcher liquid-swipe-tabs ios26-glass"
        role="tablist"
        aria-label="フォームアーカイブを切り替え。長押し後、左右へスライドできます"
        data-dragging={dragProgress !== null ? "true" : undefined}
        data-drag-target={dragProgress === null ? undefined : dragProgress >= 0.5 ? "realm" : "saga"}
        data-liquid-initialized="true"
        data-liquid-pressed={holdingArchive !== null || dragProgress !== null ? "true" : undefined}
        data-liquid-held={dragProgress !== null ? "true" : undefined}
        data-liquid-dragging={dragProgress !== null ? "true" : undefined}
        style={{
          ["--archive-switch-progress" as string]: switchProgress,
          ["--liquid-current-accent" as string]: switchProgress >= 0.5
            ? "var(--archive-violet)"
            : "var(--archive-cyan)",
        }}
      >
        <LiquidLens />
        <button
          type="button"
          role="tab"
          aria-selected={isSaga}
          aria-controls="form-archive-frame"
          data-liquid-pointer="true"
          data-liquid-contact={contactArchive === "saga" ? "true" : undefined}
          data-archive="saga"
          style={{ ["--liquid-accent" as string]: "var(--archive-cyan)" }}
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
          data-liquid-contact={contactArchive === "realm" ? "true" : undefined}
          data-archive="realm"
          style={{ ["--liquid-accent" as string]: "var(--archive-violet)" }}
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
