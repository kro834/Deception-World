import { useEffect } from "react";
import { useLiquidPointerLight } from "./use-liquid-pointer-light";
import {
  prefersLightweightRendering,
  prefersIOS18Rendering,
  supportsIOS27Enhancements,
} from "@/lib/rendering-profile";

export function useWorldMode() {
  useLiquidPointerLight();
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.mode;
    const previousAndroid = html.dataset.androidRenderer;
    const previousIOS18 = html.dataset.ios18Renderer;
    const previousIOS27 = html.dataset.ios27Enhanced;
    const previousOneUi = html.dataset.oneUiRenderer;
    const previousEffects = html.dataset.worldEffects;
    const previousVisibility = html.dataset.worldPageVisible;
    const previousPageScrolled = html.dataset.pageScrolled;
    const previousPageProgress = html.style.getPropertyValue("--page-progress");
    const previousNativeProgress = html.dataset.nativeScrollProgress;
    html.dataset.mode = "world";
    html.dataset.scrollMotionReady = "true";
    const userAgent = navigator.userAgent;
    const economyEffects = prefersLightweightRendering(navigator);
    if (prefersIOS18Rendering(navigator)) html.dataset.ios18Renderer = "true";
    else delete html.dataset.ios18Renderer;
    if (/Android/i.test(userAgent)) html.dataset.androidRenderer = "true";
    if (/SamsungBrowser|SM-[A-Z0-9]+/i.test(userAgent)) html.dataset.oneUiRenderer = "true";
    if (economyEffects) html.dataset.worldEffects = "economy";
    else delete html.dataset.worldEffects;

    const syncVisibility = () => {
      html.dataset.worldPageVisible = String(!document.hidden);
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    let progressFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const enhancedIOS27 =
      supportsIOS27Enhancements(navigator) &&
      !economyEffects &&
      window.CSS?.supports("animation-timeline", "view()") === true &&
      window.CSS?.supports("animation-range", "entry 0% entry 100%") === true;
    const supportsNativeProgress =
      (/Android/i.test(userAgent) || enhancedIOS27) &&
      window.CSS?.supports("animation-timeline", "scroll(root block)") === true;
    let nativeProgress = supportsNativeProgress && !reducedMotion.matches;
    let lastScrolled: boolean | undefined;
    let lastProgress = "";
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
      if (value !== lastProgress) html.style.setProperty("--page-progress", value);
      lastProgress = value;
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
      nativeProgress = supportsNativeProgress && !reducedMotion.matches;
      if (nativeProgress) html.dataset.nativeScrollProgress = "true";
      else delete html.dataset.nativeScrollProgress;
      syncPageProgress();
    };
    syncProgressMode();
    reducedMotion.addEventListener("change", syncProgressMode);
    reducedTransparency.addEventListener("change", syncProgressMode);
    window.addEventListener("scroll", requestProgressSync, { passive: true });
    window.addEventListener("resize", requestProgressSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestProgressSync, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("scroll", requestProgressSync);
      window.removeEventListener("resize", requestProgressSync);
      window.visualViewport?.removeEventListener("resize", requestProgressSync);
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      reducedMotion.removeEventListener("change", syncProgressMode);
      reducedTransparency.removeEventListener("change", syncProgressMode);
      if (previousNativeProgress) html.dataset.nativeScrollProgress = previousNativeProgress;
      else delete html.dataset.nativeScrollProgress;
      if (prev) html.dataset.mode = prev;
      else delete html.dataset.mode;
      if (previousAndroid) html.dataset.androidRenderer = previousAndroid;
      else delete html.dataset.androidRenderer;
      if (previousIOS18) html.dataset.ios18Renderer = previousIOS18;
      else delete html.dataset.ios18Renderer;
      if (previousIOS27) html.dataset.ios27Enhanced = previousIOS27;
      else delete html.dataset.ios27Enhanced;
      if (previousOneUi) html.dataset.oneUiRenderer = previousOneUi;
      else delete html.dataset.oneUiRenderer;
      if (previousEffects) html.dataset.worldEffects = previousEffects;
      else delete html.dataset.worldEffects;
      if (previousVisibility) html.dataset.worldPageVisible = previousVisibility;
      else delete html.dataset.worldPageVisible;
      if (previousPageScrolled) html.dataset.pageScrolled = previousPageScrolled;
      else delete html.dataset.pageScrolled;
      if (previousPageProgress) html.style.setProperty("--page-progress", previousPageProgress);
      else html.style.removeProperty("--page-progress");
    };
  }, []);
}
