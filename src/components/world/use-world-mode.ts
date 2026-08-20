import { useEffect } from "react";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";

export function useWorldMode() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.mode;
    html.dataset.mode = "world";
    html.dataset.scrollMotionReady = "true";
    const id = window.requestAnimationFrame(() => {
      bootLiquidGlass(document);
    });
    return () => {
      window.cancelAnimationFrame(id);
      if (prev) html.dataset.mode = prev;
      else delete html.dataset.mode;
    };
  }, []);
}
