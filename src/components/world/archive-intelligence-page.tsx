import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import {
  DEFAULT_ARCHIVE_MODEL_PREFERENCES,
  archivePersonaProfileLabel,
  archiveSearchPreferenceLabel,
  normalizeArchiveModelPreferences,
  type ArchiveModelPreferences,
} from "@/lib/archive-model-config";
import { ArchiveModelSelector } from "./archive-model-selector";
import { ArchiveIntelligenceWorkspace } from "./archive-oracle";
import { SideMenuLayer, SideMenuTrigger } from "./world-chrome";
import { useWorldMode } from "./use-world-mode";

export function ArchiveIntelligencePage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelPreferences, setModelPreferences] = useState<ArchiveModelPreferences>(
    DEFAULT_ARCHIVE_MODEL_PREFERENCES,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("archive-intelligence-active");
    document.body.classList.add("archive-intelligence-active");
    return () => {
      document.documentElement.classList.remove("archive-intelligence-active");
      document.body.classList.remove("archive-intelligence-active");
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("deception-world:archive-models:v2");
      setModelPreferences(
        stored
          ? normalizeArchiveModelPreferences(JSON.parse(stored) as unknown)
          : DEFAULT_ARCHIVE_MODEL_PREFERENCES,
      );
    } catch {
      setModelPreferences(DEFAULT_ARCHIVE_MODEL_PREFERENCES);
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem(
        "deception-world:archive-models:v2",
        JSON.stringify(modelPreferences),
      );
    } catch {
      // Private browsing can deny persistent storage; the in-memory choice remains usable.
    }
  }, [modelPreferences, preferencesReady]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const viewport = window.visualViewport;
    let frame = 0;
    let stableHeight = viewport?.height ?? window.innerHeight;
    let focusStartedAt = 0;
    const recoveryTimers = new Set<number>();
    const editableSelector = "input, textarea, [contenteditable='true']";

    const scheduleSync = (delays: readonly number[]) => {
      for (const delay of delays) {
        const timer = window.setTimeout(() => {
          recoveryTimers.delete(timer);
          syncViewport();
        }, delay);
        recoveryTimers.add(timer);
      }
    };

    const syncViewport = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const focused = document.activeElement?.matches(editableSelector) ?? false;
        if (!focused && height > stableHeight - 72) stableHeight = height;
        const keyboardOpen = focused && stableHeight - height > Math.max(120, stableHeight * 0.18);
        const keyboardClosing =
          !focused && page.dataset.keyboard === "closing" && stableHeight - height > 120;
        const keyboardOpening = focused && width <= 760 && performance.now() - focusStartedAt < 600;
        const viewportLeft = viewport
          ? Number.isFinite(viewport.pageLeft - window.scrollX)
            ? viewport.pageLeft - window.scrollX
            : viewport.offsetLeft
          : 0;
        const viewportTop = viewport
          ? Number.isFinite(viewport.pageTop - window.scrollY)
            ? viewport.pageTop - window.scrollY
            : viewport.offsetTop
          : 0;
        page.style.setProperty("--archive-viewport-width", `${width}px`);
        page.style.setProperty("--archive-viewport-height", `${height}px`);
        page.style.setProperty("--archive-viewport-left", `${viewportLeft}px`);
        page.style.setProperty("--archive-viewport-top", `${viewportTop}px`);
        page.style.setProperty(
          "--archive-keyboard-inset",
          `${Math.max(0, stableHeight - height)}px`,
        );
        page.dataset.keyboard = keyboardOpen
          ? "open"
          : keyboardOpening
            ? "opening"
            : keyboardClosing
              ? "closing"
              : "closed";
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      focusStartedAt = performance.now();
      if ((viewport?.width ?? window.innerWidth) <= 760) page.dataset.keyboard = "opening";
      scheduleSync([0, 80, 180, 320, 650]);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      focusStartedAt = 0;
      page.dataset.keyboard = "closing";
      scheduleSync([0, 80, 240, 500]);
    };

    const handleOrientationChange = () => {
      stableHeight = viewport?.height ?? window.innerHeight;
      scheduleSync([0, 160, 420]);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport, { passive: true });
    window.addEventListener("pageshow", syncViewport, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    viewport?.addEventListener("resize", syncViewport, { passive: true });
    viewport?.addEventListener("scroll", syncViewport, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of recoveryTimers) window.clearTimeout(timer);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("pageshow", syncViewport);
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
    };
  }, []);

  const openModelSelector = useCallback(() => {
    const focused = document.activeElement;
    modelReturnFocusRef.current =
      focused instanceof HTMLElement &&
      !focused.matches("input, textarea, [contenteditable='true']")
        ? focused
        : modelButtonRef.current;
    if (
      focused instanceof HTMLElement &&
      focused.matches("input, textarea, [contenteditable='true']")
    ) {
      focused.blur();
      window.setTimeout(() => setModelSelectorOpen(true), 140);
      return;
    }
    setModelSelectorOpen(true);
  }, []);

  return (
    <main ref={pageRef} className="archive-intelligence-page">
      <span className="archive-intelligence-page-grid" aria-hidden="true" />
      <span className="archive-intelligence-page-orbit is-one" aria-hidden="true" />
      <span className="archive-intelligence-page-orbit is-two" aria-hidden="true" />
      <h1 className="visually-hidden">Archive Intelligence — AIに聞く</h1>

      <header className="archive-intelligence-page-header">
        <GuardedLink
          to="/world"
          hash="top"
          assets={[]}
          className="archive-intelligence-page-brand"
          aria-label="Deception Worldへ戻る"
        >
          <span aria-hidden="true">DW</span>
          <div>
            <b>DECEPTION WORLD</b>
            <small>ARCHIVE INTELLIGENCE</small>
          </div>
        </GuardedLink>

        <button
          ref={modelButtonRef}
          type="button"
          className="archive-intelligence-page-models"
          aria-label="AIモデルを選択"
          aria-haspopup="dialog"
          aria-expanded={modelSelectorOpen}
          aria-controls="archive-model-selector"
          onClick={openModelSelector}
        >
          <span>
            <i aria-hidden="true" /> SEARCH{" "}
            <b>{archiveSearchPreferenceLabel(modelPreferences.search)}</b>
          </span>
          <span>
            <i aria-hidden="true" /> PERSONA{" "}
            <b>{archivePersonaProfileLabel(modelPreferences.personaProProfile)}</b>
          </span>
          <SlidersHorizontal size={15} strokeWidth={1.55} aria-hidden="true" />
        </button>

        <SideMenuTrigger
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="archive-intelligence-page-menu"
        />
      </header>

      <div className="archive-intelligence-page-stage">
        <ArchiveIntelligenceWorkspace
          active
          modelPreferences={modelPreferences}
          modelSelectorOpen={modelSelectorOpen}
          onOpenModelSelector={openModelSelector}
        />
      </div>

      <SideMenuLayer context="intelligence" open={menuOpen} onOpenChange={setMenuOpen} />
      <ArchiveModelSelector
        open={modelSelectorOpen}
        onOpenChange={setModelSelectorOpen}
        value={modelPreferences}
        onApply={setModelPreferences}
        onReturnFocus={() => {
          window.requestAnimationFrame(() =>
            modelReturnFocusRef.current?.focus({ preventScroll: true }),
          );
        }}
      />
    </main>
  );
}
