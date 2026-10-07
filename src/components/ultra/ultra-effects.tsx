import { memo, useEffect, useRef } from "react";
import { isUltraSceneBlocked, watchUltraSceneVisibility } from "@/lib/ultra-mode-visibility.js";
import type { UltraRenderer } from "@/lib/ultra-renderer.js";

export type UltraEffectsStatus = "starting" | "webgl2" | "fallback" | "paused" | "error";
interface UltraEffectsProps {
  enabled: boolean;
  motionAllowed: boolean;
  onStatus?: (status: UltraEffectsStatus) => void;
}

const ACCESSIBILITY_QUERIES = [
  "(prefers-reduced-motion: reduce)",
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
  "(forced-colors: active)",
];

/** Optional decorative scene. The renderer owns its sole RAF loop; React never
 * updates per frame. UI locks retain the context, while OFF releases it. */
export const UltraEffects = memo(function UltraEffects({
  enabled,
  motionAllowed,
  onStatus,
}: UltraEffectsProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onStatus);
  useEffect(() => {
    callbackRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !stage || !canvas) return;
    const root = document.documentElement;
    let disposed = false;
    let importing = false;
    let failed = false;
    let renderer: UltraRenderer | null = null;
    let reported: UltraEffectsStatus | undefined;
    let viewportWidth = Math.max(window.innerWidth, 1);
    let viewportHeight = Math.max(window.innerHeight, 1);
    let media: MediaQueryList[] = [];
    let mediaAvailable = true;
    try {
      media = ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
    } catch {
      mediaAvailable = false;
    }
    const allowed = () =>
      !disposed &&
      motionAllowed &&
      mediaAvailable &&
      !media.some((query) => query.matches) &&
      !isUltraSceneBlocked(document);
    const report = (status: UltraEffectsStatus) => {
      if (disposed || reported === status) return;
      reported = status;
      stage.dataset.ultraRenderer = status === "webgl2" ? "gpu" : status;
      root.dataset.ultraRenderer = status;
      callbackRef.current?.(status);
    };
    const tint = () => {
      const chrome = root.dataset.viewportChrome;
      const shell = document.querySelector<HTMLElement>("[data-world-phase]");
      const accent = shell?.style.getPropertyValue("--world-atmosphere-accent").trim();
      const color =
        accent && /^#[0-9a-f]{6}$/i.test(accent)
          ? accent
          : chrome === "gallery"
            ? "#ebbc75"
            : chrome === "dream"
              ? "#c097f6"
              : "#7ae8ff";
      renderer?.setTheme([
        parseInt(color.slice(1, 3), 16) / 255,
        parseInt(color.slice(3, 5), 16) / 255,
        parseInt(color.slice(5, 7), 16) / 255,
      ]);
    };
    const fail = () => {
      failed = true;
      renderer?.dispose();
      renderer = null;
      report("error");
    };
    const sync = () => {
      if (disposed) return;
      if (!allowed()) {
        renderer?.pause();
        report("paused");
        return;
      }
      if (failed) {
        report("fallback");
        return;
      }
      if (renderer) {
        tint();
        const diagnostics = renderer.getDiagnostics();
        report(diagnostics.lost ? "paused" : diagnostics.ready ? "webgl2" : "starting");
        renderer.start();
        return;
      }
      if (importing) return;
      importing = true;
      report("starting");
      void import("@/lib/ultra-renderer.js")
        .then(({ createUltraRenderer }) => {
          importing = false;
          // A menu/route lock can start while the shader chunk is in flight.
          // Re-read live gates here, before even allocating a WebGL context.
          if (!allowed()) return;
          const candidate = createUltraRenderer(canvas, {
            maxPixels: 1_600_000,
            maxDpr: 1.6,
            steps: 64,
            maxFps: 60,
            onStatus(status) {
              if (disposed) return;
              if (status === "ready") {
                if (allowed()) report("webgl2");
                else sync();
              } else if (status === "context-lost") report("paused");
              else if (status === "unsupported") {
                failed = true;
                report("fallback");
              } else if (status === "error") fail();
            },
          });
          if (disposed || failed) {
            candidate?.dispose();
            return;
          }
          renderer = candidate;
          if (!renderer) {
            failed = true;
            report("fallback");
            return;
          }
          tint();
          sync();
        })
        .catch(() => {
          importing = false;
          if (!disposed) fail();
        });
    };
    const resize = () => {
      viewportWidth = Math.max(window.innerWidth, 1);
      viewportHeight = Math.max(window.innerHeight, 1);
      if (allowed()) renderer?.resize();
    };
    const pointer = (event: PointerEvent) => {
      if (!allowed() || !renderer || event.pointerType === "touch") return;
      renderer.setPointer(
        (event.clientX / viewportWidth) * 2 - 1,
        1 - (event.clientY / viewportHeight) * 2,
      );
    };
    const center = () => renderer?.setPointer(0, 0);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("blur", center);
    for (const query of media) query.addEventListener("change", sync);
    const stopVisibility = watchUltraSceneVisibility(sync);
    const themeObserver = new MutationObserver(tint);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-viewport-chrome"] });
    const shell = document.querySelector<HTMLElement>(".site-shell.mirage-edition");
    if (shell)
      themeObserver.observe(shell, { attributes: true, attributeFilter: ["data-world-phase"] });

    return () => {
      disposed = true;
      stopVisibility();
      themeObserver.disconnect();
      for (const query of media) query.removeEventListener("change", sync);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("blur", center);
      renderer?.dispose();
      renderer = null;
      if (root.dataset.ultraRenderer === reported) delete root.dataset.ultraRenderer;
    };
  }, [enabled, motionAllowed]);

  return enabled ? (
    <div ref={stageRef} className="ultra-effects" aria-hidden="true">
      <canvas ref={canvasRef} className="ultra-effects-canvas" />
      <div className="ultra-effects-fallback" />
    </div>
  ) : null;
});
