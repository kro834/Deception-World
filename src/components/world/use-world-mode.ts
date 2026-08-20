import { useEffect } from "react";

export function useWorldMode() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.mode;
    const previousAndroid = html.dataset.androidRenderer;
    const previousOneUi = html.dataset.oneUiRenderer;
    html.dataset.mode = "world";
    html.dataset.scrollMotionReady = "true";
    const userAgent = navigator.userAgent;
    if (/Android/i.test(userAgent)) html.dataset.androidRenderer = "true";
    if (/SamsungBrowser|SM-[A-Z0-9]+/i.test(userAgent)) html.dataset.oneUiRenderer = "true";
    return () => {
      if (prev) html.dataset.mode = prev;
      else delete html.dataset.mode;
      if (previousAndroid) html.dataset.androidRenderer = previousAndroid;
      else delete html.dataset.androidRenderer;
      if (previousOneUi) html.dataset.oneUiRenderer = previousOneUi;
      else delete html.dataset.oneUiRenderer;
    };
  }, []);
}
