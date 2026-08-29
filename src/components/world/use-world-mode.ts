import { useEffect } from "react";
import { useLiquidPointerLight } from "./use-liquid-pointer-light";

export function useWorldMode() {
  useLiquidPointerLight();
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.mode;
    const previousAndroid = html.dataset.androidRenderer;
    const previousOneUi = html.dataset.oneUiRenderer;
    const previousEffects = html.dataset.worldEffects;
    const previousVisibility = html.dataset.worldPageVisible;
    const previousPageScrolled = html.dataset.pageScrolled;
    const previousPageProgress = html.style.getPropertyValue("--page-progress");
    html.dataset.mode = "world";
    html.dataset.scrollMotionReady = "true";
    const userAgent = navigator.userAgent;
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const economyEffects =
      device.connection?.saveData === true ||
      device.connection?.effectiveType === "slow-2g" ||
      device.connection?.effectiveType === "2g" ||
      (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
      (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2);
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
    const syncPageProgress = () => {
      progressFrame = 0;
      const scrollable = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      html.style.setProperty("--page-progress", progress.toFixed(4));
      if (window.scrollY > 20) html.dataset.pageScrolled = "true";
      else delete html.dataset.pageScrolled;
    };
    const requestProgressSync = () => {
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(syncPageProgress);
    };
    syncPageProgress();
    window.addEventListener("scroll", requestProgressSync, { passive: true });
    window.addEventListener("resize", requestProgressSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestProgressSync, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("scroll", requestProgressSync);
      window.removeEventListener("resize", requestProgressSync);
      window.visualViewport?.removeEventListener("resize", requestProgressSync);
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      if (prev) html.dataset.mode = prev;
      else delete html.dataset.mode;
      if (previousAndroid) html.dataset.androidRenderer = previousAndroid;
      else delete html.dataset.androidRenderer;
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
