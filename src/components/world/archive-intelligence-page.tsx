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
    let lockedOffset = 0;
    let frozen = false;
    let focusStartedAt = 0;
    let settleHeight = 0;
    let settleOffset = 0;
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

    const applyViewport = (_source: "layout" | "scroll" = "layout") => {
      const compact = window.innerWidth <= ARCHIVE_IOS_KEYBOARD_COMPACT_MAX;
      const focused = document.activeElement?.matches(editableSelector) ?? false;

      if (!compact || !focused) {
        frozen = false;
        lockedHeight = null;
        lockedOffset = 0;
        settleHits = 0;
        applyFrame(null, 0, "closed");
        return;
      }

      if (frozen && lockedHeight != null) {
        applyFrame(lockedHeight, lockedOffset, "open");
        return;
      }

      const layoutHeight = window.innerHeight;
      const visualHeight = viewport?.height ?? layoutHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const frameNow = resolveArchiveIosKeyboardFrame({
        focused,
        compact,
        layoutHeight,
        visualHeight,
        offsetTop,
      });

      const elapsed = focusStartedAt ? performance.now() - focusStartedAt : 0;
      if (
        frameNow.state === "open" &&
        elapsed >= 360 &&
        frameNow.heightPx != null
      ) {
        if (
          Math.abs(frameNow.heightPx - settleHeight) <= 1 &&
          Math.abs(frameNow.offsetPx - settleOffset) <= 1
        ) {
          settleHits += 1;
        } else {
          settleHeight = frameNow.heightPx;
          settleOffset = frameNow.offsetPx;
          settleHits = 1;
        }
        if (settleHits >= 3) {
          frozen = true;
          lockedHeight = settleHeight;
          lockedOffset = settleOffset;
          applyFrame(lockedHeight, lockedOffset, "open");
          return;
        }
      }

      applyFrame(frameNow.heightPx, frameNow.offsetPx, frameNow.state);
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
      syncViewport("scroll");
    };

    const armKeyboard = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.matches(editableSelector)) return;
      if (window.innerWidth > ARCHIVE_IOS_KEYBOARD_COMPACT_MAX) return;
      focusStartedAt = performance.now();
      page.dataset.composerFocus = "true";
      applyViewport("layout");
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      focusStartedAt = performance.now();
      frozen = false;
      page.dataset.composerFocus = "true";
      window.scrollTo(0, 0);
      applyViewport("layout");
      scheduleSync([180, 360, 520, 720]);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(editableSelector)) return;
      frozen = false;
      lockedHeight = null;
      lockedOffset = 0;
      settleHits = 0;
      focusStartedAt = 0;
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
      frozen = false;
      lockedHeight = null;
      lockedOffset = 0;
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
