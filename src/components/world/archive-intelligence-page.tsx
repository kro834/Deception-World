import { useEffect, useRef, useState } from "react";
import { DEFAULT_ARCHIVE_MODEL_PREFERENCES } from "@/lib/archive-model-config";
import {
  ARCHIVE_IOS_KEYBOARD_COMPACT_MAX,
  resolveArchiveIosKeyboardFrame,
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
    let lockedHeight: number | null = null;
    let settleHeight = 0;
    let settleHits = 0;
    const recoveryTimers = new Set<number>();
    const editableSelector =
      "input:not([disabled]), textarea:not([disabled]), [contenteditable='true']";

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

    const applyFrame = (
      heightPx: number | null,
      offsetPx: number,
      state: "opening" | "open" | "closed",
    ) => {
      page.style.setProperty("--archive-keyboard-inset", "0px");
      page.style.setProperty("--archive-vv-offset", "0px");
      if (heightPx == null) {
        page.style.removeProperty("--archive-viewport-height");
        page.style.transform = "";
      } else {
        page.style.setProperty("--archive-viewport-height", `${heightPx}px`);
        page.style.transform = offsetPx ? `translate3d(0, ${offsetPx}px, 0)` : "";
      }
      page.dataset.keyboard = state;
      setChromeInert(state !== "closed");
    };

    const applyViewport = (source: "layout" | "scroll" = "layout") => {
      resetDocumentScroll();
      const compact = window.innerWidth <= ARCHIVE_IOS_KEYBOARD_COMPACT_MAX;
      const layoutHeight = window.innerHeight;
      const visualHeight = viewport?.height ?? layoutHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const focused = document.activeElement?.matches(editableSelector) ?? false;
      const frameNow = resolveArchiveIosKeyboardFrame({
        focused,
        compact,
        layoutHeight,
        visualHeight,
        offsetTop,
      });

      if (frameNow.state === "closed") {
        lockedHeight = null;
        settleHeight = 0;
        settleHits = 0;
        applyFrame(null, 0, "closed");
        return;
      }

      if (source !== "scroll") {
        if (Math.abs(frameNow.heightPx! - settleHeight) <= 2) settleHits += 1;
        else {
          settleHeight = frameNow.heightPx!;
          settleHits = 1;
        }
        if (lockedHeight == null && (frameNow.state === "open" || settleHits >= 2)) {
          lockedHeight = frameNow.heightPx;
        } else if (lockedHeight != null && Math.abs(frameNow.heightPx! - lockedHeight) >= 80) {
          lockedHeight = frameNow.heightPx;
        }
      }

      applyFrame(lockedHeight ?? frameNow.heightPx, frameNow.offsetPx, frameNow.state);
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
      applyViewport("layout");
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      page.dataset.composerFocus = "true";
      window.scrollTo(0, 0);
      applyViewport("layout");
      scheduleSync([180, 360, 640]);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      lockedHeight = null;
      applyFrame(null, 0, "closed");
      window.requestAnimationFrame(() => {
        if (!(document.activeElement?.matches(editableSelector) ?? false)) {
          delete page.dataset.composerFocus;
          applyFrame(null, 0, "closed");
        }
      });
      scheduleSync([160, 400]);
    };

    const handleOrientationChange = () => {
      lockedHeight = null;
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
      page.style.transform = "";
      page.style.removeProperty("--archive-viewport-height");
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
