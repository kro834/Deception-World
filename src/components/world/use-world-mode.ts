import { useEffect } from "react";
import { useLiquidPointerLight } from "./use-liquid-pointer-light";
import {
  prefersLightweightRendering,
  prefersNativeScrollProgress,
  supportsIOS27Enhancements,
} from "@/lib/rendering-profile";
import { createViewportResizeFilter } from "@/lib/viewport-resize";

/* Only these headers draw `--page-progress` (styles-world/01.css, styles-dream-chapter.css).
   Writing the inherited property on <html> restyled every element on every scroll frame. */
const PROGRESS_HOST_CLASSES = [
  "topbar",
  "manager-topbar",
  "rider-archive-topbar",
  "dream-site-header",
];

/* The World topbar whose hairline styles-android-performance.css hides for the
   Motion prism line (content: none) where scroll timelines run. Keep the two
   selectors in sync: that host needs no per-frame value there. */
const PRISM_TOPBAR = ".site-shell.film-edition.motion-on .topbar";

/* The device attributes (data-android-renderer, data-one-ui-renderer,
   data-ios18-renderer, data-world-effects, data-native-scroll-progress) belong
   to the document: the root's pre-paint script (device-profile-gate.js) sets
   them before the first paint. Writing them here, after hydration, restyled
   and relaid out the whole page in one forced task. This hook only keeps
   native progress in step with reduced motion. */
export function useWorldMode() {
  useLiquidPointerLight();
  useEffect(() => {
    const html = document.documentElement;
    // /world enters world mode before the first paint (mirage-boot-gate.js).
    // That value is this page's own, so leaving the page removes it.
    const prepaintMode = html.dataset.modeOrigin === "prepaint";
    const prev = prepaintMode ? undefined : html.dataset.mode;
    if (prepaintMode) delete html.dataset.modeOrigin;
    const previousIOS27 = html.dataset.ios27Enhanced;
    const previousVisibility = html.dataset.worldPageVisible;
    const previousPageScrolled = html.dataset.pageScrolled;
    if (html.dataset.mode !== "world") html.dataset.mode = "world";
    html.dataset.scrollMotionReady = "true";
    const economyEffects = prefersLightweightRendering(navigator);

    const syncVisibility = () => {
      html.dataset.worldPageVisible = String(!document.hidden);
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    let progressFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const viewTimeline =
      window.CSS?.supports("animation-timeline", "view()") === true &&
      window.CSS?.supports("animation-range", "entry 0% entry 100%") === true;
    const enhancedIOS27 = supportsIOS27Enhancements(navigator) && !economyEffects && viewTimeline;
    // The same rule as the pre-paint script, so mounting changes nothing.
    const scrollTimeline = window.CSS?.supports("animation-timeline", "scroll(root block)") === true;
    const nativeProgressFor = (reduced: boolean) =>
      prefersNativeScrollProgress(navigator, {
        scrollTimeline,
        viewTimeline,
        reducedMotion: reduced,
      });
    let nativeProgress = nativeProgressFor(reducedMotion.matches);
    // The prism line replaces the World topbar's hairline under the same
    // conditions as its CSS (not economy, scroll timelines, motion allowed).
    const prismLineCapable = !economyEffects && viewTimeline;
    let prismLine = false;
    let lastScrolled: boolean | undefined;
    const progressHosts = PROGRESS_HOST_CLASSES.map((name) =>
      document.getElementsByClassName(name),
    );
    const writeProgress = (value: string | null) => {
      for (const hosts of progressHosts) {
        for (const host of Array.from(hosts)) {
          if (!(host instanceof HTMLElement)) continue;
          if (value !== null && prismLine && host.matches(PRISM_TOPBAR)) continue;
          if (value === null) host.style.removeProperty("--page-progress");
          else if (host.style.getPropertyValue("--page-progress") !== value)
            host.style.setProperty("--page-progress", value);
        }
      }
    };
    const syncScrolled = () => {
      const scrolled = window.scrollY > 20;
      if (scrolled === lastScrolled) return;
      lastScrolled = scrolled;
      if (scrolled) html.dataset.pageScrolled = "true";
      else delete html.dataset.pageScrolled;
    };
    const syncPageProgress = () => {
      progressFrame = 0;
      syncScrolled();
      if (nativeProgress) return;
      const scrollable = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      const value = progress.toFixed(4);
      // Per-host comparison: a header that mounts later still receives the value.
      writeProgress(value);
    };
    const requestProgressSync = () => {
      if (nativeProgress) {
        syncScrolled();
        return;
      }
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(syncPageProgress);
    };
    const syncProgressMode = () => {
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      if (enhancedIOS27 && !reducedMotion.matches && !reducedTransparency.matches)
        html.dataset.ios27Enhanced = "true";
      else delete html.dataset.ios27Enhanced;
      nativeProgress = nativeProgressFor(reducedMotion.matches);
      if (nativeProgress !== (html.dataset.nativeScrollProgress === "true")) {
        if (nativeProgress) html.dataset.nativeScrollProgress = "true";
        else delete html.dataset.nativeScrollProgress;
      }
      prismLine = prismLineCapable && !reducedMotion.matches;
      // The scroll position and height are read in the next frame, with that
      // frame's own layout, not forced here right after hydration.
      progressFrame = window.requestAnimationFrame(syncPageProgress);
    };
    let resizeSettleTimer = 0;
    const significantResize = createViewportResizeFilter();
    // The URL bar collapsing mid-scroll is followed by scroll events anyway. A
    // small height-only change with no scroll (a window edge, split screen,
    // DeX) syncs once it settles.
    const requestResizeSync = () => {
      window.clearTimeout(resizeSettleTimer);
      if (significantResize()) requestProgressSync();
      else resizeSettleTimer = window.setTimeout(requestProgressSync, 150);
    };
    syncProgressMode();
    reducedMotion.addEventListener("change", syncProgressMode);
    reducedTransparency.addEventListener("change", syncProgressMode);
    window.addEventListener("scroll", requestProgressSync, { passive: true });
    window.addEventListener("resize", requestResizeSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestResizeSync, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("scroll", requestProgressSync);
      window.removeEventListener("resize", requestResizeSync);
      window.visualViewport?.removeEventListener("resize", requestResizeSync);
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      window.clearTimeout(resizeSettleTimer);
      reducedMotion.removeEventListener("change", syncProgressMode);
      reducedTransparency.removeEventListener("change", syncProgressMode);
      if (prev) html.dataset.mode = prev;
      else delete html.dataset.mode;
      if (previousIOS27) html.dataset.ios27Enhanced = previousIOS27;
      else delete html.dataset.ios27Enhanced;
      if (previousVisibility) html.dataset.worldPageVisible = previousVisibility;
      else delete html.dataset.worldPageVisible;
      if (previousPageScrolled) html.dataset.pageScrolled = previousPageScrolled;
      else delete html.dataset.pageScrolled;
      writeProgress(null);
    };
  }, []);
}
