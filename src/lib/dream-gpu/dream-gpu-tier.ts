import { useEffect, useState } from "react";

/**
 * Dream chapter GPU tiers, decided at runtime with no flags required:
 *   "A" WebGPU + HTML-in-Canvas (GPUQueue.drawElementImageToTexture and
 *       HTMLCanvasElement.updateElementGeometry): the programme desk is redrawn
 *       through shaders, plus the lamplight overlay.
 *   "B" WebGPU only (e.g. iPadOS 26 Safari): the lamplight overlay.
 *   "C" neither, reduced motion or economy effects: the page as it is.
 * The server render and the first client render are always "C".
 */
export type DreamGpuTier = "A" | "B" | "C";

export function motionAllowed() {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.worldEffects === "economy") return false;
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export function hasHtmlInCanvas() {
  const queue = (globalThis as { GPUQueue?: { prototype: object } }).GPUQueue;
  return (
    !!queue &&
    typeof (queue.prototype as { drawElementImageToTexture?: unknown })
      .drawElementImageToTexture === "function" &&
    typeof (HTMLCanvasElement.prototype as { updateElementGeometry?: unknown })
      .updateElementGeometry === "function"
  );
}

let probe: Promise<boolean> | null = null;
function hasWebGpu() {
  probe ??= (async () => {
    const gpu = (navigator as { gpu?: { requestAdapter(o?: object): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return !!(await gpu.requestAdapter({ powerPreference: "low-power" }));
    } catch {
      return false;
    }
  })();
  return probe;
}

export async function detectDreamGpuTier(): Promise<DreamGpuTier> {
  if (!motionAllowed()) return "C";
  if (!(await hasWebGpu())) return "C";
  return hasHtmlInCanvas() ? "A" : "B";
}

/** The current tier; it drops to "C" when economy or reduced motion turns on. */
export function useDreamGpuTier(): DreamGpuTier {
  const [tier, setTier] = useState<DreamGpuTier>("C");
  useEffect(() => {
    let alive = true;
    const update = () => {
      void detectDreamGpuTier().then((next) => {
        if (alive) setTier(next);
      });
    };
    // Wait for the page to settle so the GPU work never competes with the first paint.
    const idle = window.setTimeout(update, 600);
    const media = window.matchMedia("(prefers-reduced-motion: no-preference)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects"],
    });
    return () => {
      alive = false;
      window.clearTimeout(idle);
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return tier;
}
