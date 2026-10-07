import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isUltraSceneBlocked, watchUltraSceneVisibility } from "@/lib/ultra-mode-visibility.js";
import {
  ULTRA_FRAME_GUTTER,
  watchUltraArtworkTarget,
  watchUltraArtworkGeometry,
  type UltraArtworkTarget,
} from "@/lib/ultra-artwork-target.js";
import type { UltraRenderer } from "@/lib/ultra-renderer.js";

export type UltraEffectsStatus = "starting" | "webgl2" | "fallback" | "paused" | "error";
interface UltraEffectsProps {
  enabled: boolean;
  motionAllowed: boolean;
  quality?: "high" | "cinema";
  onStatus?: (status: UltraEffectsStatus) => void;
}

const ACCESSIBILITY_QUERIES = [
  "(prefers-reduced-motion: reduce)",
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
  "(forced-colors: active)",
];

/** React only tracks artwork identity. The portal shares its host's transforms;
 * layout/visibility observers and the renderer do not update React per frame. */
export const UltraEffects = memo(function UltraEffects({
  enabled,
  motionAllowed,
  quality = "high",
  onStatus,
}: UltraEffectsProps) {
  const [target, setTarget] = useState<UltraArtworkTarget | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return watchUltraArtworkTarget(setTarget);
  }, [enabled]);
  return enabled && target ? (
    <ArtworkFrame
      key={`${target.revision}-${quality}-${motionAllowed}`}
      target={target}
      enabled={enabled}
      motionAllowed={motionAllowed}
      quality={quality}
      onStatus={onStatus}
    />
  ) : null;
});

function ArtworkFrame({
  target,
  enabled,
  motionAllowed,
  quality,
  onStatus,
}: UltraEffectsProps & { target: UltraArtworkTarget }) {
  const stageRef = useRef<HTMLSpanElement>(null);
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
    let visible = false;
    let pointerRect: DOMRect | null = null;
    let media: MediaQueryList[] = [];
    let mediaAvailable = true;
    try {
      media = ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
    } catch {
      mediaAvailable = false;
    }
    const allowed = () =>
      !disposed &&
      visible &&
      target.host.isConnected &&
      target.image.isConnected &&
      target.image.complete &&
      target.image.naturalWidth > 0 &&
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
      stage.style.visibility = allowed() ? "visible" : "hidden";
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
            quality,
            maxFps: 60,
            frameWidthPx: ULTRA_FRAME_GUTTER,
            onMaterialState(state) {
              if (!disposed) stage.dataset.ultraMaterial = state;
            },
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
    const pointer = (event: PointerEvent) => {
      if (!allowed() || !renderer || !pointerRect || event.pointerType === "touch") return;
      renderer.setPointer(
        ((event.clientX - pointerRect.left) / Math.max(pointerRect.width, 1)) * 2 - 1,
        1 - ((event.clientY - pointerRect.top) / Math.max(pointerRect.height, 1)) * 2,
      );
    };
    const center = () => renderer?.setPointer(0, 0);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("blur", center);
    for (const query of media) query.addEventListener("change", sync);
    let previousSize = "";
    const stopGeometry = watchUltraArtworkGeometry(
      target,
      ({ geometry, visible: inView, rect }) => {
        visible = inView;
        pointerRect = rect;
        if (geometry) {
          stage.style.left = `${geometry.left}px`;
          stage.style.top = `${geometry.top}px`;
          stage.style.width = `${geometry.width}px`;
          stage.style.height = `${geometry.height}px`;
          const size = `${geometry.width}:${geometry.height}`;
          if (size !== previousSize && allowed()) renderer?.resize();
          previousSize = size;
        }
        sync();
      },
    );
    const stopVisibility = watchUltraSceneVisibility(sync);
    const themeObserver = new MutationObserver(tint);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-viewport-chrome"] });
    const shell = document.querySelector<HTMLElement>(".site-shell.mirage-edition");
    if (shell)
      themeObserver.observe(shell, { attributes: true, attributeFilter: ["data-world-phase"] });

    return () => {
      disposed = true;
      stopGeometry();
      stopVisibility();
      themeObserver.disconnect();
      for (const query of media) query.removeEventListener("change", sync);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("blur", center);
      renderer?.dispose();
      renderer = null;
      if (root.dataset.ultraRenderer === reported) delete root.dataset.ultraRenderer;
    };
  }, [target, enabled, motionAllowed, quality]);

  return createPortal(
    <span
      ref={stageRef}
      className="ultra-effects"
      data-ultra-quality={quality}
      aria-hidden="true"
      style={{ visibility: "hidden" }}
    >
      <canvas ref={canvasRef} className="ultra-effects-canvas" />
      <span className="ultra-effects-fallback" />
    </span>,
    target.host,
  );
}
