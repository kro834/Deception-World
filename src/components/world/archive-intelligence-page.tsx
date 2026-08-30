import { useEffect, useRef, useState } from "react";
import { DEFAULT_ARCHIVE_MODEL_PREFERENCES } from "@/lib/archive-model-config";
import { ArchiveIntelligenceWorkspace } from "./archive-oracle";
import { SideMenuLayer, SideMenuTrigger } from "./world-chrome";
import { useWorldMode } from "./use-world-mode";

export function ArchiveIntelligencePage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelPreferences, setModelPreferences] = useState(DEFAULT_ARCHIVE_MODEL_PREFERENCES);
  const pageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("archive-intelligence-active");
    document.body.classList.add("archive-intelligence-active");
    return () => {
      document.documentElement.classList.remove("archive-intelligence-active");
      document.body.classList.remove("archive-intelligence-active");
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected)
        return;
      headingRef.current?.focus({ preventScroll: true });
    }, 380);
    return () => window.clearTimeout(timer);
  }, []);

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
        const layoutWidth = window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const focused = document.activeElement?.matches(editableSelector) ?? false;
        if (!focused && height > stableHeight - 72) stableHeight = height;
        const keyboardOpen = focused && stableHeight - height > Math.max(120, stableHeight * 0.18);
        const keyboardClosing =
          !focused && page.dataset.keyboard === "closing" && stableHeight - height > 120;
        const keyboardOpening =
          focused && layoutWidth <= 760 && performance.now() - focusStartedAt < 600;
        page.style.setProperty("--archive-viewport-height", `${height}px`);
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
      page.dataset.composerFocus = "true";
      if ((viewport?.width ?? window.innerWidth) <= 760) page.dataset.keyboard = "opening";
      // Sample height only. Moving a focused ancestor with visualViewport offsets
      // makes WebKit's caret and selection handles drift during keyboard animation.
      scheduleSync([0, 120, 360, 720]);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      focusStartedAt = 0;
      page.dataset.keyboard = "closing";
      window.requestAnimationFrame(() => {
        if (!(document.activeElement?.matches(editableSelector) ?? false)) {
          delete page.dataset.composerFocus;
        }
      });
      scheduleSync([0, 80, 240, 500, 900]);
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
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of recoveryTimers) window.clearTimeout(timer);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("pageshow", syncViewport);
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      viewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

  return (
    <main ref={pageRef} className="archive-intelligence-page">
      <h1 ref={headingRef} className="visually-hidden" tabIndex={-1}>
        Archive Intelligence — AIに聞く
      </h1>

      <header className="archive-intelligence-page-header">
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
          onModelPreferencesChange={setModelPreferences}
        />
      </div>

      <SideMenuLayer context="intelligence" open={menuOpen} onOpenChange={setMenuOpen} />
    </main>
  );
}
