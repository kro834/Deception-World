import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  getUltraModeSnapshot,
  getUltraModeServerSnapshot,
  subscribeUltraMode,
} from "@/lib/ultra-mode.js";
import {
  getUltraQualitySnapshot,
  getUltraQualityServerSnapshot,
  subscribeUltraQuality,
} from "@/lib/ultra-quality.js";
import { isUltraSceneBlocked, watchUltraSceneVisibility } from "@/lib/ultra-mode-visibility.js";
import type {
  ExhibitionStudio as StudioRenderer,
  ExhibitionStudioView,
} from "@/lib/exhibition-studio-renderer";

interface ExhibitionStudioProps {
  artworkUrl: string;
  artworkWidth: number;
  artworkHeight: number;
  artworkReady: boolean;
  immersive?: boolean;
  initialView?: ExhibitionStudioView;
  showEnlargeHint?: boolean;
  children: ReactNode;
}

/** The original image and its enlargement link remain the accessible fallback.
 * The heavy renderer is loaded only for a visible, explicitly enabled exhibit. */
export function ExhibitionStudio(props: ExhibitionStudioProps) {
  const mode = useSyncExternalStore(
    subscribeUltraMode,
    getUltraModeSnapshot,
    getUltraModeServerSnapshot,
  );
  const { quality } = useSyncExternalStore(
    subscribeUltraQuality,
    getUltraQualitySnapshot,
    getUltraQualityServerSnapshot,
  );
  if ((!mode.enabled && !props.immersive) || !mode.motionAllowed || !props.artworkReady)
    return props.children;
  return <StudioView key={`${props.artworkUrl}:${quality}`} {...props} quality={quality} />;
}

function StudioView({
  artworkUrl,
  artworkWidth,
  artworkHeight,
  children,
  quality,
  initialView = "front",
  showEnlargeHint = true,
}: ExhibitionStudioProps & { quality: "high" | "cinema" }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StudioRenderer | null>(null);
  const [phase, setPhase] = useState("loading");
  const [view, setView] = useState<ExhibitionStudioView>(initialView);
  const [original, setOriginal] = useState(false);
  const originalRef = useRef(false);
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const controller = new AbortController();
    let disposed = false;
    let pending = false;
    let failed = false;
    let visible = false;
    const allowed = () =>
      !disposed && visible && !originalRef.current && !isUltraSceneBlocked(document);
    const sync = () => {
      if (disposed) return;
      const renderer = rendererRef.current;
      if (!allowed()) {
        renderer?.pause();
        return;
      }
      if (renderer) {
        renderer.resize();
        renderer.resume();
        return;
      }
      if (pending || failed) return;
      pending = true;
      void import("@/lib/exhibition-studio-renderer")
        .then(async ({ createExhibitionStudio }) => {
          if (!allowed()) return;
          const candidate = await createExhibitionStudio(canvas, {
            artworkUrl,
            artworkWidth,
            artworkHeight,
            quality,
            signal: controller.signal,
            onStatus(status) {
              if (!disposed && status !== "paused") setPhase(status);
            },
          });
          if (disposed) {
            candidate.dispose();
            return;
          }
          rendererRef.current = candidate;
          host.dataset.studioEnvironment = candidate.getDiagnostics().environment;
          candidate.setView(initialView);
          if (allowed()) candidate.resume();
          else candidate.pause();
        })
        .catch(() => {
          if (disposed) return;
          failed = true;
          rendererRef.current?.dispose();
          rendererRef.current = null;
          setPhase("error");
        })
        .finally(() => {
          pending = false;
        });
    };
    syncRef.current = sync;
    const resize = new ResizeObserver(() => rendererRef.current?.resize());
    resize.observe(host);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    intersection.observe(host);
    const stopVisibility = watchUltraSceneVisibility(sync);
    return () => {
      disposed = true;
      controller.abort();
      syncRef.current = null;
      resize.disconnect();
      intersection.disconnect();
      stopVisibility();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [artworkUrl, artworkWidth, artworkHeight, quality, initialView]);

  const updateView = (next: ExhibitionStudioView) => {
    setView(next);
    rendererRef.current?.setView(next);
  };
  const toggleOriginal = () => {
    const next = !originalRef.current;
    originalRef.current = next;
    setOriginal(next);
    syncRef.current?.();
  };
  const ready = phase === "ready" && !original;

  return (
    <div className="exhibition-studio" data-exhibition-active="true">
      <div
        ref={hostRef}
        className="exhibition-studio-stage"
        data-studio-ready={ready ? "true" : "false"}
        data-studio-format={artworkWidth < artworkHeight ? "portrait" : "landscape"}
      >
        <canvas ref={canvasRef} className="exhibition-studio-canvas" aria-hidden="true" />
        <div className="exhibition-studio-original">{children}</div>
        {ready && showEnlargeHint && (
          <span className="exhibition-studio-hint">作品をタップして原画を拡大</span>
        )}
      </div>
      <div className="exhibition-studio-tools" aria-label="展示空間の表示">
        <span className="exhibition-studio-label">EXHIBITION STUDIO</span>
        <div role="group" aria-label="鑑賞する角度">
          <button
            type="button"
            aria-pressed={view === "front"}
            disabled={!ready}
            onClick={() => updateView("front")}
          >
            正面
          </button>
          <button
            type="button"
            aria-pressed={view === "oblique"}
            disabled={!ready}
            onClick={() => updateView("oblique")}
          >
            斜めから
          </button>
          <button
            type="button"
            aria-pressed={view === "room"}
            disabled={!ready}
            onClick={() => updateView("room")}
          >
            展示室全景
          </button>
        </div>
        <button type="button" aria-pressed={original} onClick={toggleOriginal}>
          {original ? "展示空間に戻す" : "原画表示"}
        </button>
      </div>
      {phase === "error" || phase === "unsupported" || phase === "context-lost" ? (
        <p className="exhibition-studio-notice" role="status">
          3D表示を利用できないため、原画を表示しています。
        </p>
      ) : null}
    </div>
  );
}
