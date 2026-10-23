import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

const STUDIO_ACCESSIBILITY_QUERIES = [
  "(prefers-reduced-motion: reduce)",
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
  "(forced-colors: active)",
];
const STUDIO_BLOCKING_ATTRIBUTES = [
  "data-loading",
  "data-route-cover",
  "data-opening-handoff-active",
  "data-side-menu-open",
  "data-dialog-open",
];

function readStudioMotionAllowed() {
  if (typeof window === "undefined") return false;
  try {
    return STUDIO_ACCESSIBILITY_QUERIES.every((query) => !window.matchMedia(query).matches);
  } catch {
    return false;
  }
}

function subscribeStudioPreferences(notify: () => void) {
  if (typeof window === "undefined") return () => {};
  let preferences: MediaQueryList[];
  try {
    preferences = STUDIO_ACCESSIBILITY_QUERIES.map((query) => window.matchMedia(query));
  } catch {
    return () => {};
  }
  for (const media of preferences) {
    if (media.addEventListener) media.addEventListener("change", notify);
    else media.addListener(notify);
  }
  return () => {
    for (const media of preferences) {
      if (media.removeEventListener) media.removeEventListener("change", notify);
      else media.removeListener(notify);
    }
  };
}

const studioServerSnapshot = () => false;

function isStudioSceneBlocked(doc: Document) {
  return (
    doc.visibilityState === "hidden" ||
    STUDIO_BLOCKING_ATTRIBUTES.some((name) => {
      const value = doc.documentElement.getAttribute(name);
      return value !== null && value !== "false";
    })
  );
}

function watchStudioSceneVisibility(notify: () => void, doc = document) {
  let previous: boolean | undefined;
  const update = () => {
    const blocked = isStudioSceneBlocked(doc);
    if (blocked !== previous) {
      previous = blocked;
      notify();
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: STUDIO_BLOCKING_ATTRIBUTES,
  });
  doc.addEventListener("visibilitychange", update);
  update();
  return () => {
    observer.disconnect();
    doc.removeEventListener("visibilitychange", update);
  };
}

/** The original image and its enlargement link remain the accessible fallback.
 * Only the independent immersive room may load the heavy renderer. */
export function ExhibitionStudio(props: ExhibitionStudioProps) {
  const motionAllowed = useSyncExternalStore(
    subscribeStudioPreferences,
    readStudioMotionAllowed,
    studioServerSnapshot,
  );
  if (!props.immersive || !motionAllowed || !props.artworkReady) return props.children;
  return <StudioView key={props.artworkUrl} {...props} quality="high" />;
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
  const viewRef = useRef<ExhibitionStudioView>(initialView);
  const [attempt, setAttempt] = useState(0);
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
      !disposed && visible && !originalRef.current && !isStudioSceneBlocked(document);
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
          candidate.setView(viewRef.current);
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
          // Visibility can return between the import's guard and this completion.
          if (!disposed && !failed && !rendererRef.current && allowed()) sync();
        });
    };
    syncRef.current = sync;
    const resize = new ResizeObserver(() => {
      if (allowed()) rendererRef.current?.resize();
    });
    resize.observe(host);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    intersection.observe(host);
    const stopVisibility = watchStudioSceneVisibility(sync);
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
  }, [artworkUrl, artworkWidth, artworkHeight, quality, initialView, attempt]);

  const updateView = (next: ExhibitionStudioView) => {
    viewRef.current = next;
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
  const unavailable = phase === "error" || phase === "unsupported" || phase === "context-lost";
  const retry = () => {
    setPhase("loading");
    originalRef.current = false;
    setOriginal(false);
    setAttempt((value) => value + 1);
  };

  return (
    <div className="exhibition-studio" data-exhibition-active="true">
      <div
        ref={hostRef}
        className="exhibition-studio-stage"
        data-studio-ready={ready ? "true" : "false"}
        aria-busy={phase === "loading" && !original}
        data-studio-format={artworkWidth < artworkHeight ? "portrait" : "landscape"}
      >
        <canvas
          key={attempt}
          ref={canvasRef}
          className="exhibition-studio-canvas"
          aria-hidden="true"
        />
        <div className="exhibition-studio-original">{children}</div>
        {ready && showEnlargeHint && (
          <span className="exhibition-studio-hint">作品をタップして原画を拡大</span>
        )}
      </div>
      <div className="exhibition-studio-tools" aria-label="展示空間の表示">
        <span className="exhibition-studio-label">EXHIBITION STUDIO</span>
        <div
          role="group"
          aria-label="鑑賞する角度"
          onKeyDown={(event) => {
            if (
              !ready ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            )
              return;
            const views: ExhibitionStudioView[] = ["front", "oblique", "room"];
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const focusedIndex = buttons.findIndex((button) => button === event.target);
            const currentIndex = focusedIndex >= 0 ? focusedIndex : views.indexOf(view);
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            const index =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : (currentIndex + direction + views.length) % views.length;
            event.preventDefault();
            updateView(views[index]);
            buttons[index]?.focus();
          }}
        >
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
      {unavailable ? (
        <p className="exhibition-studio-notice" role="status">
          3D表示を利用できないため、原画を表示しています。
          <button type="button" onClick={retry}>
            3D表示を再試行
          </button>
        </p>
      ) : phase === "loading" && !original ? (
        <p className="exhibition-studio-notice" role="status">
          展示空間を準備しています。原画はそのままご覧いただけます。
        </p>
      ) : null}
    </div>
  );
}
