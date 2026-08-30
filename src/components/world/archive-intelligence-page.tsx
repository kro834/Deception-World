import { useEffect, useRef, useState } from "react";
import { DEFAULT_ARCHIVE_MODEL_PREFERENCES } from "@/lib/archive-model-config";
import {
  ARCHIVE_IOS_KEYBOARD_COMPACT_MAX,
  archiveIosVisualViewportPanned,
  estimateArchiveIosKeyboardInset,
  measureArchiveIosKeyboardInset,
} from "@/lib/archive-viewport";
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
    let lockedInset: number | null = null;
    let restLayoutHeight = window.innerHeight;
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

    const resetDocumentScroll = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
      if (document.body.scrollTop) document.body.scrollTop = 0;
    };

    const setChromeInert = (inert: boolean) => {
      const chrome = page.querySelector(".archive-oracle-header");
      if (!(chrome instanceof HTMLElement)) return;
      if (inert) chrome.setAttribute("inert", "");
      else chrome.removeAttribute("inert");
    };

    const applyInset = (inset: number, state: "opening" | "open" | "closing" | "closed") => {
      page.style.removeProperty("--archive-viewport-height");
      page.style.setProperty("--archive-vv-offset", "0px");
      page.style.setProperty("--archive-keyboard-inset", `${Math.max(0, Math.round(inset))}px`);
      page.dataset.keyboard = state;
      setChromeInert(state === "opening" || state === "open");
    };

    const applyViewport = (source: "layout" | "scroll" = "layout") => {
      resetDocumentScroll();
      const compact = window.innerWidth <= ARCHIVE_IOS_KEYBOARD_COMPACT_MAX;
      const layoutHeight = window.innerHeight;
      const visualHeight = viewport?.height ?? layoutHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const focused = document.activeElement?.matches(editableSelector) ?? false;

      if (!compact || !focused) {
        lockedInset = null;
        if (layoutHeight > restLayoutHeight - 40) restLayoutHeight = layoutHeight;
        applyInset(0, "closed");
        return;
      }

      if (source === "scroll") return;

      const layoutShrunk = restLayoutHeight - layoutHeight > 80;
      const estimate = estimateArchiveIosKeyboardInset(restLayoutHeight);
      const measured = measureArchiveIosKeyboardInset(layoutHeight, visualHeight);
      const panned = archiveIosVisualViewportPanned(offsetTop);

      if (layoutShrunk) {
        lockedInset = 0;
      } else if (lockedInset == null) {
        lockedInset = measured > 80 && !panned ? measured : estimate;
      } else if (measured > 80 && !panned && Math.abs(measured - lockedInset) > 96) {
        lockedInset = measured;
      }

      applyInset(lockedInset, layoutShrunk || measured > 80 ? "open" : "opening");
    };

    const syncViewport = (source: "layout" | "scroll" = "layout") => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyViewport(source);
      });
    };

    const syncLayout = () => syncViewport("layout");
    const syncVisualScroll = () => {
      resetDocumentScroll();
      syncViewport("scroll");
    };

    const armKeyboard = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches(editableSelector)) return;
      if (window.innerWidth > ARCHIVE_IOS_KEYBOARD_COMPACT_MAX) return;
      page.dataset.composerFocus = "true";
      if (lockedInset == null) lockedInset = estimateArchiveIosKeyboardInset(restLayoutHeight);
      applyInset(lockedInset, "opening");
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      page.dataset.composerFocus = "true";
      window.scrollTo(0, 0);
      applyViewport("layout");
      scheduleSync([280, 480]);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      lockedInset = null;
      page.dataset.keyboard = "closing";
      applyInset(0, "closing");
      window.requestAnimationFrame(() => {
        if (!(document.activeElement?.matches(editableSelector) ?? false)) {
          delete page.dataset.composerFocus;
          applyInset(0, "closed");
        }
      });
      scheduleSync([240, 520]);
    };

    const handleOrientationChange = () => {
      lockedInset = null;
      scheduleSync([0, 180, 420]);
    };

    syncViewport("layout");
    window.addEventListener("resize", syncLayout, { passive: true });
    window.addEventListener("pageshow", syncLayout, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });
    document.addEventListener("pointerdown", armKeyboard, { capture: true, passive: true });
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    viewport?.addEventListener("resize", syncLayout, { passive: true });
    viewport?.addEventListener("scroll", syncVisualScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const timer of recoveryTimers) window.clearTimeout(timer);
      window.removeEventListener("resize", syncLayout);
      window.removeEventListener("pageshow", syncLayout);
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("pointerdown", armKeyboard, true);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      viewport?.removeEventListener("resize", syncLayout);
      viewport?.removeEventListener("scroll", syncVisualScroll);
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
