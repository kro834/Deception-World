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
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
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
    };
  }, []);
}
