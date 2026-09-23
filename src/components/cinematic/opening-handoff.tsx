import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { OPENING_DIVE } from "./opening-timing";
import type { DiveRun, DiveStats } from "./opening-dive";

export type OpeningHandoffRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
};

export type OpeningHandoffSource = {
  logoRect: OpeningHandoffRect;
  videoRect?: OpeningHandoffRect;
  hudRect?: OpeningHandoffRect;
  lineRect?: OpeningHandoffRect;
  logoSrc?: string;
  videoSrc?: string;
  videoPoster?: string;
  videoCurrentTime: number;
  videoPlaying: boolean;
  reducedMotion: boolean;
  economy: boolean;
};

export type OpeningHandoffDestination = {
  path: string;
  brand: HTMLElement | null;
  sigil: HTMLElement | null;
  hero: HTMLElement | null;
  backdrop: HTMLElement | null;
  focus: HTMLElement | null;
};

export type OpeningHandoffSnapshot = {
  token: number;
  source: OpeningHandoffSource;
  destination?: OpeningHandoffDestination;
  phase: "covering" | "arriving";
};

type OpeningHandoffLayerProps = {
  snapshot: OpeningHandoffSnapshot | null;
  onCovered: (token: number) => void;
  onComplete: (token: number) => void;
};

// ENTER THE WORLD. The covering phase is the dive: WebGL where it is ready in
// time (opening-dive.ts), otherwise the same storyboard with compositor-only
// DOM layers. Either way it ends on a still of the world at the World page's
// framing; the route changes under that still, and the arrival fades it out
// over the page. Reduced motion is a short cross-fade.
const ARRIVAL_MS = { full: 520, economy: 420 } as const;
const REDUCED_DURATION_MS = 250;
const CSS_DIVE_SCALE = { full: 1, economy: 0.8 } as const;
const DEFAULT_LOGO_SRC = "/logo-title-prism-20260924-delivery-1536.webp";
const DEFAULT_VIDEO_SRC = "/atmosphere.mp4";
const DEFAULT_VIDEO_POSTER = "/atmosphere-poster.jpg";
const WORLD_ART = "/deception-world-poster-delivery.webp";
// The dark dial inside the logo's ring (above サーガ), in its own box: the camera dives into it.
const RING = { x: 0.573, y: 0.315 };

const COVER_EASING = "cubic-bezier(0.22, 0.82, 0.2, 1)";
const DIVE_EASING = "cubic-bezier(0.6, 0, 0.9, 0.4)";
const SETTLE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

type DiveEngine = typeof import("./opening-dive");
let diveEngine: Promise<DiveEngine> | null = null;
const loadDiveEngine = () => (diveEngine ??= import("./opening-dive"));

type OpeningDiveTestHook = {
  readonly tier: string;
  readonly stats: DiveStats | null;
  ready: () => Promise<string>;
  /** Seconds since the dive started drawing (GL) or animating (CSS). */
  seek: (T: number) => void;
  /** Ends the dive on its landing frame; the route then changes. */
  land: () => void;
};

declare global {
  interface Window {
    __openingDiveStats?: DiveStats;
  }
}

const openingAuditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("opening-audit");

function finite(value: number | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function viewportFallbackRect(): OpeningHandoffRect {
  return {
    left: 0,
    top: 0,
    width: Math.max(1, window.visualViewport?.width ?? window.innerWidth),
    height: Math.max(1, window.visualViewport?.height ?? window.innerHeight),
  };
}

function usableRect(
  candidate: OpeningHandoffRect | DOMRect | DOMRectReadOnly | undefined,
  fallback: OpeningHandoffRect,
): OpeningHandoffRect {
  if (!candidate) return fallback;
  const width = finite(candidate.width);
  const height = finite(candidate.height);
  if (width <= 0 || height <= 0) return fallback;
  return {
    left: finite(candidate.left),
    top: finite(candidate.top),
    width,
    height,
  };
}

function visualViewportLocalRect(
  candidate: OpeningHandoffRect | DOMRect | DOMRectReadOnly | undefined,
  fallback: OpeningHandoffRect,
) {
  const rect = usableRect(candidate, fallback);
  if (!candidate || rect === fallback) return fallback;
  const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
  const offsetTop = window.visualViewport?.offsetTop ?? 0;
  return {
    left: rect.left - offsetLeft,
    top: rect.top - offsetTop,
    width: rect.width,
    height: rect.height,
  };
}

function setRect(element: HTMLElement, rect: OpeningHandoffRect) {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${Math.max(1, rect.width)}px`;
  element.style.height = `${Math.max(1, rect.height)}px`;
  element.style.transform = "none";
}

function animateNode(
  node: HTMLElement | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  running: Set<Animation>,
) {
  if (!node || typeof node.animate !== "function") return null;
  const animation = node.animate(keyframes, options);
  running.add(animation);
  void animation.finished.catch(() => undefined).finally(() => running.delete(animation));
  return animation;
}

function updateVisualViewport(root: HTMLElement) {
  const viewport = window.visualViewport;
  root.style.setProperty("--opening-vv-left", `${viewport?.offsetLeft ?? 0}px`);
  root.style.setProperty("--opening-vv-top", `${viewport?.offsetTop ?? 0}px`);
  root.style.setProperty("--opening-vv-width", `${viewport?.width ?? window.innerWidth}px`);
  root.style.setProperty("--opening-vv-height", `${viewport?.height ?? window.innerHeight}px`);
}

export function OpeningHandoffLayer({ snapshot, onCovered, onComplete }: OpeningHandoffLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const tunnelRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  const activeTokenRef = useRef<number | null>(null);
  // The dive outlives the covering effect: its landing frame stays on screen
  // while the route changes, until the arrival has faded it out.
  const diveRef = useRef<{ token: number; run: DiveRun } | null>(null);
  const onCoveredRef = useRef(onCovered);
  const onCompleteRef = useRef(onComplete);
  onCoveredRef.current = onCovered;
  onCompleteRef.current = onComplete;
  const token = snapshot?.token ?? null;

  // The GL context is released when this handoff is over (or replaced).
  useLayoutEffect(() => {
    return () => {
      const dive = diveRef.current;
      if (dive && dive.token === token) {
        diveRef.current = null;
        dive.run.dispose();
      }
    };
  }, [token]);

  useLayoutEffect(() => {
    if (!snapshot) return;

    const root = rootRef.current;
    const backdrop = backdropRef.current;
    const video = videoRef.current;
    const hud = hudRef.current;
    const logo = logoRef.current;
    const gl = glRef.current;
    if (!root || !backdrop || !video || !hud || !logo || !gl) return;

    // Keep non-null aliases for callbacks that can run after this layout effect returns.
    const stableSnapshot = snapshot;
    const stableRoot = root;
    const stableVideo = video;
    const stableGl = gl;

    const token = snapshot.token;
    const source = snapshot.source;
    const mode = source.economy ? "economy" : "full";
    const audit = openingAuditRequested();
    const running = new Set<Animation>();
    const timers = new Set<number>();
    let viewportFrame = 0;
    let alive = true;
    let settled = false;
    activeTokenRef.current = token;

    updateVisualViewport(root);

    const viewportRect = viewportFallbackRect();
    const sourceLogoRect = visualViewportLocalRect(source.logoRect, {
      left: viewportRect.width * 0.5 - 104,
      top: viewportRect.height * 0.5 - 69,
      width: 208,
      height: 139,
    });
    const sourceVideoRect = visualViewportLocalRect(source.videoRect, viewportRect);
    const sourceHudRect = visualViewportLocalRect(source.hudRect, {
      left: viewportRect.width * 0.5 - Math.min(310, viewportRect.width * 0.42),
      top: viewportRect.height * 0.5 - Math.min(310, viewportRect.width * 0.42),
      width: Math.min(620, viewportRect.width * 0.84),
      height: Math.min(620, viewportRect.width * 0.84),
    });
    const focusX = sourceLogoRect.left + sourceLogoRect.width * RING.x;
    const focusY = sourceLogoRect.top + sourceLogoRect.height * RING.y;

    if (snapshot.phase === "covering") {
      setRect(logo, sourceLogoRect);
      setRect(video, sourceVideoRect);
      setRect(hud, sourceHudRect);
      root.style.setProperty("--opening-dive-x", `${focusX}px`);
      root.style.setProperty("--opening-dive-y", `${focusY}px`);
      logo.style.transformOrigin = `${sourceLogoRect.width * RING.x}px ${sourceLogoRect.height * RING.y}px`;
      video.style.transformOrigin = `${focusX - sourceVideoRect.left}px ${focusY - sourceVideoRect.top}px`;
      hud.style.transformOrigin = `${focusX - sourceHudRect.left}px ${focusY - sourceHudRect.top}px`;
    }

    const syncVideoTime = () => {
      if (!alive || !Number.isFinite(source.videoCurrentTime)) return;
      try {
        video.currentTime = Math.max(0, source.videoCurrentTime);
      } catch {
        // WebKit can reject seeks until metadata has been committed.
      }
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) syncVideoTime();
    else video.addEventListener("loadedmetadata", syncVideoTime, { once: true });

    if (source.videoPlaying && !source.reducedMotion && !source.economy) {
      void video.play().catch(() => undefined);
    } else {
      stableVideo.pause();
    }

    const commonOptions = (length: number, easing = SETTLE_EASING): KeyframeAnimationOptions => ({
      duration: length,
      easing,
      fill: "both",
    });

    function stopActiveWork() {
      if (viewportFrame) {
        window.cancelAnimationFrame(viewportFrame);
        viewportFrame = 0;
      }
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      for (const animation of running) animation.cancel();
      running.clear();
      stableVideo.pause();
    }

    function settleHandoff() {
      if (settled || !alive || activeTokenRef.current !== token) return;
      settled = true;
      if (stableSnapshot.phase === "covering") {
        // The dive's landing still holds the screen while the route changes:
        // its layers keep their last frame (they are not cancelled here).
        for (const timer of timers) window.clearTimeout(timer);
        timers.clear();
        for (const animation of running) animation.finish();
        stableVideo.pause();
        onCoveredRef.current(token);
        return;
      }
      stopActiveWork();
      onCompleteRef.current(token);
    }

    function handleVisibilityChange() {
      if (!document.hidden) return;
      diveRef.current?.run.land();
      settleHandoff();
    }

    function handleOrientationChange() {
      diveRef.current?.run.land();
      settleHandoff();
    }

    function handlePageHide() {
      settleHandoff();
    }

    function scheduleViewportUpdate() {
      if (!alive || settled || viewportFrame) return;
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0;
        if (!alive || settled) return;
        updateVisualViewport(stableRoot);
      });
    }

    const visualViewport = window.visualViewport;

    function cleanupEffect() {
      alive = false;
      if (activeTokenRef.current === token) activeTokenRef.current = null;
      stopActiveWork();
      stableVideo.removeEventListener("loadedmetadata", syncVideoTime);
      window.removeEventListener("resize", scheduleViewportUpdate);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("pagehide", handlePageHide);
      visualViewport?.removeEventListener("resize", scheduleViewportUpdate);
      visualViewport?.removeEventListener("scroll", scheduleViewportUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (window.__openingTest?.dive === diveHook) delete window.__openingTest.dive;
    }

    window.addEventListener("resize", scheduleViewportUpdate, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("pagehide", handlePageHide);
    visualViewport?.addEventListener("resize", scheduleViewportUpdate, { passive: true });
    visualViewport?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let diveHook: OpeningDiveTestHook | null = null;

    if (document.hidden) {
      settleHandoff();
      return cleanupEffect;
    }

    if (source.reducedMotion) {
      root.dataset.openingHandoffTier = "reduced";
      animateNode(
        root,
        snapshot.phase === "covering"
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 1 }, { opacity: 0 }],
        commonOptions(REDUCED_DURATION_MS, COVER_EASING),
        running,
      );
      const reducedTimer = window.setTimeout(() => {
        timers.delete(reducedTimer);
        settleHandoff();
      }, REDUCED_DURATION_MS + 18);
      timers.add(reducedTimer);
      return cleanupEffect;
    }

    if (snapshot.phase === "arriving") {
      // The landing still (the GL canvas, or the CSS world layer) fades into
      // the World page underneath, which already owns scrolling.
      const arrival = animateNode(
        root,
        [{ opacity: 1 }, { opacity: 0 }],
        commonOptions(ARRIVAL_MS[mode], "cubic-bezier(0.4, 0, 0.2, 1)"),
        running,
      );
      if (audit && arrival) arrival.pause();
      const completionTimer = window.setTimeout(
        () => {
          timers.delete(completionTimer);
          settleHandoff();
        },
        audit ? 1700 : ARRIVAL_MS[mode] + 34,
      );
      timers.add(completionTimer);
      return cleanupEffect;
    }

    // ---- Covering: the dive.
    const cssAnimations: Animation[] = [];
    let cssStarted = false;
    const startCssDive = () => {
      if (cssStarted || settled || !alive) return;
      cssStarted = true;
      stableRoot.dataset.openingHandoffTier = "css";
      const k = CSS_DIVE_SCALE[mode];
      const cut = OPENING_DIVE.cut * 1000 * k;
      const end = OPENING_DIVE.glEnd * 1000 * k;
      const at = (value: number) => Math.min(1, Math.max(0, value / end));
      const add = (node: HTMLElement | null, keyframes: Keyframe[], easing = "linear") => {
        const animation = animateNode(node, keyframes, commonOptions(end, easing), running);
        if (animation) {
          cssAnimations.push(animation);
          if (audit) animation.pause();
        }
      };
      // The title's still: it covers in about 0.2 s, the camera plunges into the
      // ring, one amber swell, then the world settles at the page's framing.
      add(stableRoot, [{ opacity: 0 }, { opacity: 1, offset: at(220 * k) }, { opacity: 1 }]);
      // The glyphs dim as they grow (the tunnel), so none sweeps a bright edge
      // back and forth across the frame.
      add(logoRef.current, [
        { transform: "scale(1)", opacity: 1, easing: DIVE_EASING },
        { transform: "scale(3)", opacity: 0.8, offset: at(cut * 0.45), easing: DIVE_EASING },
        { transform: "scale(6.5)", opacity: 0.28, offset: at(cut * 0.86) },
        { transform: "scale(8)", opacity: 0, offset: at(cut) },
        { transform: "scale(8)", opacity: 0 },
      ]);
      add(videoRef.current, [
        { transform: "scale(1)", opacity: 0.8, easing: DIVE_EASING },
        { transform: "scale(1.6)", opacity: 0.3, offset: at(cut) },
        { transform: "scale(1.6)", opacity: 0 },
      ]);
      add(backdropRef.current, [
        { transform: "scale(1)", opacity: 0.55, easing: DIVE_EASING },
        { transform: "scale(1.7)", opacity: 0.9, offset: at(cut) },
        { transform: "scale(1.7)", opacity: 0 },
      ]);
      add(hudRef.current, [
        { transform: "scale(1)", opacity: 0.7, easing: DIVE_EASING },
        { transform: "scale(3.2)", opacity: 0, offset: at(cut * 0.85) },
        { transform: "scale(3.2)", opacity: 0 },
      ]);
      add(speedRef.current, [
        { transform: "scale(0.7)", opacity: 0, easing: "ease-in" },
        { transform: "scale(1.5)", opacity: 0.55, offset: at(cut * 0.55) },
        { transform: "scale(2.6)", opacity: 0.8, offset: at(cut) },
        { transform: "scale(3.2)", opacity: 0, offset: at(cut + 260 * k) },
        { transform: "scale(3.2)", opacity: 0 },
      ]);
      add(tunnelRef.current, [
        { opacity: 0, easing: "ease-in" },
        { opacity: 0.8, offset: at(cut) },
        { opacity: 0, offset: at(cut + 300 * k) },
        { opacity: 0 },
      ]);
      add(bloomRef.current, [
        { opacity: 0 },
        { opacity: 0, offset: at(cut * 0.55) },
        { opacity: 0.85, offset: at(cut), easing: "ease-out" },
        { opacity: 0 },
      ]);
      add(worldRef.current, [
        { opacity: 0, transform: "scale(1.35)" },
        { opacity: 0, transform: "scale(1.35)", offset: at(cut * 0.9) },
        { opacity: 1, transform: "scale(1.3)", offset: at(cut), easing: SETTLE_EASING },
        { opacity: 1, transform: "scale(1)" },
      ]);
      for (const bar of stableRoot.querySelectorAll<HTMLElement>("[data-opening-handoff-letterbox]")) {
        const top = bar.dataset.openingHandoffLetterbox === "top";
        add(bar, [
          { transform: "translate3d(0, 0, 0)" },
          { transform: "translate3d(0, 0, 0)", offset: at(100 * k) },
          {
            transform: `translate3d(0, ${top ? "-104%" : "104%"}, 0)`,
            offset: at(550 * k),
          },
          { transform: `translate3d(0, ${top ? "-104%" : "104%"}, 0)` },
        ]);
      }
      if (!audit) {
        const coveredTimer = window.setTimeout(() => {
          timers.delete(coveredTimer);
          settleHandoff();
        }, end + 34);
        timers.add(coveredTimer);
      }
    };

    let tierLabel = "pending";
    root.dataset.openingHandoffTier = "pending";

    diveHook = {
      get tier() {
        return tierLabel;
      },
      get stats() {
        return diveRef.current?.run.stats ?? null;
      },
      ready: async () => {
        for (let frame = 0; frame < 600 && tierLabel === "pending"; frame += 1) {
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
        }
        return tierLabel;
      },
      seek: (T: number) => {
        if (tierLabel === "webgl") diveRef.current?.run.seek(T);
        else for (const animation of cssAnimations) animation.currentTime = Math.max(0, T) * 1000;
      },
      land: () => {
        if (tierLabel === "webgl") diveRef.current?.run.land();
        else settleHandoff();
      },
    };
    if (audit) window.__openingTest = { ...window.__openingTest, dive: diveHook };

    if (source.economy) {
      // Constrained devices: the compositor-only dive, shorter, without GL.
      tierLabel = "css";
      startCssDive();
    } else {
      void loadDiveEngine()
        .then(async (engine) => {
          if (!alive || settled) return;
          const run = engine.runOpeningDive({
            host: stableGl,
            logoRect: sourceLogoRect,
            barHeight: Math.max(42, viewportRect.height * 0.075),
            audit,
            onLanded: () => settleHandoff(),
          });
          diveRef.current?.run.dispose();
          diveRef.current = { token, run };
          window.__openingDiveStats = run.stats;
          const tier = await run.ready;
          if (!alive || settled) return;
          if (tier === "webgl") {
            tierLabel = "webgl";
            stableRoot.dataset.openingHandoffTier = "webgl";
          } else {
            tierLabel = "css";
            startCssDive();
          }
        })
        .catch(() => {
          tierLabel = "css";
          startCssDive();
        });
      // Fail-safe: a dive that never lands (the tab was frozen) still covers.
      if (!audit) {
        const safetyTimer = window.setTimeout(() => {
          timers.delete(safetyTimer);
          settleHandoff();
        }, 2400);
        timers.add(safetyTimer);
      }
    }

    return cleanupEffect;
  }, [snapshot]);

  if (!snapshot || typeof document === "undefined") return null;

  const source = snapshot.source;
  const mode = source.reducedMotion ? "reduced" : source.economy ? "economy" : "full";

  return createPortal(
    <div
      ref={rootRef}
      data-opening-handoff-root
      data-opening-handoff-phase={snapshot.phase}
      data-opening-handoff-mode={mode}
      data-opening-destination={snapshot.destination?.path ?? ""}
      aria-hidden="true"
    >
      <div ref={backdropRef} data-opening-handoff-backdrop />
      <video
        ref={videoRef}
        data-opening-handoff-video
        src={source.videoSrc ?? DEFAULT_VIDEO_SRC}
        poster={source.videoPoster ?? DEFAULT_VIDEO_POSTER}
        preload={source.economy ? "none" : "metadata"}
        muted
        playsInline
      />
      <div ref={speedRef} data-opening-handoff-speed />
      <div ref={hudRef} data-opening-handoff-hud>
        <span>DW // OPENING HANDOFF</span>
        <b>WORLD LINK</b>
        <i />
        <i />
        <i />
      </div>
      <div ref={logoRef} data-opening-handoff-logo>
        <img
          src={source.logoSrc ?? DEFAULT_LOGO_SRC}
          crossOrigin="anonymous"
          alt=""
          width={1536}
          height={1024}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <div ref={tunnelRef} data-opening-handoff-tunnel />
      <div ref={worldRef} data-opening-handoff-world>
        <img src={WORLD_ART} alt="" width={1024} height={1536} decoding="async" />
      </div>
      <div ref={bloomRef} data-opening-handoff-bloom />
      <div data-opening-handoff-letterbox="top" />
      <div data-opening-handoff-letterbox="bottom" />
      <div ref={glRef} data-opening-handoff-gl />
    </div>,
    document.body,
  );
}
