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
    let stableHeight = window.innerHeight;
    let focusStartedAt = 0;
    let lockedHeight: number | null = null;
    let lockedOffset = 0;
    let settleHeight = 0;
    let settleOffset = 0;
    let settleHits = 0;
    const recoveryTimers = new Set<number>();
    const editableSelector = "input, textarea, [contenteditable='true']";
    const COMPACT_BREAKPOINT = 760;
    const SETTLE_PX = 3;
    const LOCK_AFTER = 2;
    const RELAYOUT_PX = 56;

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

    const applyViewport = (source: "layout" | "scroll" = "layout") => {
      resetDocumentScroll();
      const compact = window.innerWidth <= COMPACT_BREAKPOINT;
      const layoutHeight = window.innerHeight;
      const visualHeight = Math.round(viewport?.height ?? layoutHeight);
      const offsetTop = Math.round(viewport?.offsetTop ?? 0);
      const focused = document.activeElement?.matches(editableSelector) ?? false;
      if (!focused && visualHeight > stableHeight - 72) {
        stableHeight = Math.max(visualHeight, layoutHeight);
      }

      const keyboardGap = Math.max(0, layoutHeight - visualHeight - offsetTop);
      const keyboardOpen = focused && compact && keyboardGap > 80;
      const sinceFocus = focusStartedAt ? performance.now() - focusStartedAt : Number.POSITIVE_INFINITY;
      const keyboardOpening = focused && compact && sinceFocus < 900 && !keyboardOpen;
      const keyboardClosing = !focused && page.dataset.keyboard === "closing" && keyboardGap > 80;
      const keyboardActive = focused && compact;
      const chrome = page.querySelector(".archive-oracle-header");

      if (!keyboardActive) {
        lockedHeight = null;
        lockedOffset = 0;
        settleHeight = 0;
        settleOffset = 0;
        settleHits = 0;
        page.style.setProperty("--archive-viewport-height", `${visualHeight}px`);
        page.style.setProperty("--archive-vv-offset", "0px");
        page.style.setProperty("--archive-keyboard-inset", "0px");
        page.dataset.keyboard = keyboardClosing ? "closing" : "closed";
        if (chrome instanceof HTMLElement) chrome.removeAttribute("inert");
        return;
      }

      if (source === "scroll" && lockedHeight != null) return;

      if (
        Math.abs(visualHeight - settleHeight) <= SETTLE_PX &&
        Math.abs(offsetTop - settleOffset) <= SETTLE_PX
      ) {
        settleHits += 1;
      } else {
        settleHeight = visualHeight;
        settleOffset = offsetTop;
        settleHits = 1;
      }

      if (lockedHeight == null && (keyboardOpen || settleHits >= LOCK_AFTER)) {
        lockedHeight = settleHeight;
        lockedOffset = settleOffset;
      } else if (
        lockedHeight != null &&
        (Math.abs(visualHeight - lockedHeight) >= RELAYOUT_PX ||
          Math.abs(offsetTop - lockedOffset) >= RELAYOUT_PX)
      ) {
        lockedHeight = visualHeight;
        lockedOffset = offsetTop;
      }

      const height = lockedHeight ?? visualHeight;
      const offset = lockedHeight != null ? lockedOffset : 0;
      const currentHeight = Number.parseFloat(page.style.getPropertyValue("--archive-viewport-height")) || 0;
      const currentOffset = Number.parseFloat(page.style.getPropertyValue("--archive-vv-offset")) || 0;
      if (Math.abs(height - currentHeight) >= SETTLE_PX || currentHeight === 0) {
        page.style.setProperty("--archive-viewport-height", `${height}px`);
      }
      if (Math.abs(offset - currentOffset) >= SETTLE_PX || (offset === 0 && currentOffset !== 0)) {
        page.style.setProperty("--archive-vv-offset", `${offset}px`);
      }
      page.style.setProperty("--archive-keyboard-inset", "0px");
      page.dataset.keyboard = keyboardOpen ? "open" : keyboardOpening ? "opening" : "closed";
      if (chrome instanceof HTMLElement) {
        if (keyboardOpen || keyboardOpening) chrome.setAttribute("inert", "");
        else chrome.removeAttribute("inert");
      }
    };

    const syncLayout = () => syncViewport("layout");
    const syncVisualScroll = () => syncViewport("scroll");

    const syncViewport = (source: "layout" | "scroll" = "layout") => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyViewport(source);
      });
    };

    const armKeyboard = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches(editableSelector)) return;
      if (window.innerWidth > COMPACT_BREAKPOINT) return;
      focusStartedAt = performance.now();
      page.dataset.composerFocus = "true";
      page.dataset.keyboard = "opening";
      applyViewport();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      focusStartedAt = performance.now();
      page.dataset.composerFocus = "true";
      if (window.innerWidth <= COMPACT_BREAKPOINT) page.dataset.keyboard = "opening";
      window.scrollTo(0, 0);
      applyViewport();
      scheduleSync([160, 420]);
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
      stableHeight = window.innerHeight;
      scheduleSync([0, 160, 420]);
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
