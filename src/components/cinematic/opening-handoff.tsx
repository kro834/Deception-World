import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

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

const NORMAL_DURATION_MS = 1180;
const ECONOMY_DURATION_MS = 850;
const REDUCED_DURATION_MS = 250;
const DEFAULT_LOGO_SRC = "/logo-title.jpg";
const DEFAULT_VIDEO_SRC = "/atmosphere.mp4";
const DEFAULT_VIDEO_POSTER = "/atmosphere-poster.jpg";

const ARRIVAL_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const COVER_EASING = "cubic-bezier(0.22, 0.82, 0.2, 1)";

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

function elementRect(element: HTMLElement | null | undefined, fallback: OpeningHandoffRect) {
  if (!element?.isConnected) return fallback;
  return visualViewportLocalRect(element.getBoundingClientRect(), fallback);
}

function setRect(element: HTMLElement, rect: OpeningHandoffRect) {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${Math.max(1, rect.width)}px`;
  element.style.height = `${Math.max(1, rect.height)}px`;
  element.style.transform = "none";
}

function rectTransform(from: OpeningHandoffRect, to: OpeningHandoffRect) {
  return `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0) scale(${Math.max(
    0.001,
    to.width / Math.max(1, from.width),
  )}, ${Math.max(0.001, to.height / Math.max(1, from.height))})`;
}

function durationFor(source: OpeningHandoffSource) {
  if (source.reducedMotion) return REDUCED_DURATION_MS;
  if (source.economy) return ECONOMY_DURATION_MS;
  return NORMAL_DURATION_MS;
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
  void animation.finished
    .catch(() => undefined)
    .finally(() => running.delete(animation));
  return animation;
}

function updateVisualViewport(root: HTMLElement) {
  const viewport = window.visualViewport;
  root.style.setProperty("--opening-vv-left", `${viewport?.offsetLeft ?? 0}px`);
  root.style.setProperty("--opening-vv-top", `${viewport?.offsetTop ?? 0}px`);
  root.style.setProperty("--opening-vv-width", `${viewport?.width ?? window.innerWidth}px`);
  root.style.setProperty("--opening-vv-height", `${viewport?.height ?? window.innerHeight}px`);
}

export function OpeningHandoffLayer({
  snapshot,
  onCovered,
  onComplete,
}: OpeningHandoffLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const activeTokenRef = useRef<number | null>(null);
  const onCoveredRef = useRef(onCovered);
  const onCompleteRef = useRef(onComplete);
  onCoveredRef.current = onCovered;
  onCompleteRef.current = onComplete;

  useLayoutEffect(() => {
    if (!snapshot) return;

    const root = rootRef.current;
    const backdrop = backdropRef.current;
    const video = videoRef.current;
    const hud = hudRef.current;
    const line = lineRef.current;
    const logo = logoRef.current;
    const focus = focusRef.current;
    if (!root || !backdrop || !video || !hud || !line || !logo || !focus) return;

    // Keep non-null aliases for callbacks that can run after this layout effect returns.
    const stableSnapshot = snapshot;
    const stableRoot = root;
    const stableVideo = video;
    const stableLogo = logo;

    const token = snapshot.token;
    const source = snapshot.source;
    const duration = durationFor(source);
    const running = new Set<Animation>();
    const timers = new Set<number>();
    let viewportFrame = 0;
    let alive = true;
    let settled = false;
    let logoAnimation: Animation | null = null;
    const arrivalStartedAt = performance.now();
    activeTokenRef.current = token;

    updateVisualViewport(root);

    const viewportRect = viewportFallbackRect();
    const sourceLogoRect = visualViewportLocalRect(source.logoRect, {
      left: viewportRect.width * 0.5 - 104,
      top: viewportRect.height * 0.5 - 58,
      width: 208,
      height: 116,
    });
    const sourceVideoRect = visualViewportLocalRect(source.videoRect, viewportRect);
    const sourceHudRect = visualViewportLocalRect(source.hudRect, {
      left: viewportRect.width * 0.5 - Math.min(310, viewportRect.width * 0.42),
      top: viewportRect.height * 0.5 - Math.min(310, viewportRect.width * 0.42),
      width: Math.min(620, viewportRect.width * 0.84),
      height: Math.min(620, viewportRect.width * 0.84),
    });
    const sourceLineRect = visualViewportLocalRect(source.lineRect, {
      left: viewportRect.width * 0.14,
      top: viewportRect.height * 0.73,
      width: viewportRect.width * 0.72,
      height: 2,
    });

    setRect(logo, sourceLogoRect);
    setRect(video, sourceVideoRect);
    setRect(hud, sourceHudRect);
    setRect(line, sourceLineRect);

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

    const commonOptions = (length: number, easing = ARRIVAL_EASING): KeyframeAnimationOptions => ({
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
      stopActiveWork();
      if (stableSnapshot.phase === "covering") {
        onCoveredRef.current(token);
        return;
      }
      onCompleteRef.current(token);
    }

    function handleVisibilityChange() {
      if (document.hidden) settleHandoff();
    }

    function handleOrientationChange() {
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

        if (
          stableSnapshot.phase !== "arriving" ||
          !stableSnapshot.destination ||
          !logoAnimation
        )
          return;
        const currentRect = visualViewportLocalRect(
          stableLogo.getBoundingClientRect(),
          sourceLogoRect,
        );
        const targetRect = elementRect(
          stableSnapshot.destination.sigil,
          elementRect(stableSnapshot.destination.brand, currentRect),
        );
        const elapsed = performance.now() - arrivalStartedAt;
        const remaining = Math.max(80, duration - elapsed);
        running.delete(logoAnimation);
        logoAnimation.cancel();
        setRect(stableLogo, currentRect);
        logoAnimation = animateNode(
          stableLogo,
          [
            {
              opacity: Number.parseFloat(getComputedStyle(stableLogo).opacity) || 1,
              transform: "none",
            },
            { opacity: 0.08, transform: rectTransform(currentRect, targetRect) },
          ],
          commonOptions(remaining),
          running,
        );
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
    }

    window.addEventListener("resize", scheduleViewportUpdate, { passive: true });
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("pagehide", handlePageHide);
    visualViewport?.addEventListener("resize", scheduleViewportUpdate, { passive: true });
    visualViewport?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.hidden) {
      settleHandoff();
      return cleanupEffect;
    }

    if (source.reducedMotion) {
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

    if (snapshot.phase === "covering") {
      const coverDuration = Math.min(
        duration,
        source.reducedMotion ? 250 : source.economy ? 430 : 520,
      );
      animateNode(
        root,
        [{ opacity: 0 }, { opacity: 1, offset: source.reducedMotion ? 1 : 0.72 }, { opacity: 1 }],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      animateNode(
        video,
        [
          { opacity: 0.28, filter: "saturate(0.82) brightness(0.72)", transform: "scale(1.025)" },
          { opacity: 0.78, filter: "saturate(1.2) brightness(0.86)", transform: "scale(1)" },
        ],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      animateNode(
        backdrop,
        [
          { opacity: 0, transform: "scale(1.12) rotate(-3deg)" },
          { opacity: 1, transform: "scale(1) rotate(0deg)" },
        ],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      animateNode(
        logo,
        [
          { opacity: 0, filter: "blur(12px) brightness(1.7)", transform: "scale(0.78)" },
          { opacity: 1, filter: "blur(0px) brightness(1.08)", transform: "scale(1)" },
        ],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      animateNode(
        hud,
        [
          { opacity: 0, transform: "scale(1.22) rotate(-8deg)" },
          { opacity: 0.82, transform: "scale(1) rotate(0deg)" },
        ],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      animateNode(
        line,
        [
          { opacity: 0, clipPath: "inset(0 50% 0 50%)" },
          { opacity: 1, clipPath: "inset(0 0% 0 0%)" },
        ],
        commonOptions(coverDuration, COVER_EASING),
        running,
      );
      const coveredTimer = window.setTimeout(() => {
        timers.delete(coveredTimer);
        settleHandoff();
      }, coverDuration + 34);
      timers.add(coveredTimer);
    } else if (snapshot.destination) {
      const destination = snapshot.destination;
      const logoTarget = elementRect(
        destination.sigil,
        elementRect(destination.brand, sourceLogoRect),
      );
      const videoTarget = elementRect(
        destination.backdrop,
        elementRect(destination.hero, viewportRect),
      );
      const hudTarget = elementRect(
        destination.focus,
        elementRect(destination.hero, sourceHudRect),
      );
      const lineTarget = elementRect(destination.brand, sourceLineRect);

      focus.style.left = `${hudTarget.left + hudTarget.width * 0.5}px`;
      focus.style.top = `${hudTarget.top + hudTarget.height * 0.5}px`;
      focus.style.width = `${Math.max(42, Math.min(hudTarget.width, hudTarget.height) * 0.92)}px`;
      focus.style.height = focus.style.width;

      logoAnimation = animateNode(
        logo,
        [
          {
            opacity: 1,
            filter: "blur(0px) brightness(1.08) saturate(1.08)",
            transform: "translate3d(0, 0, 0) scale(1)",
          },
          {
            opacity: 0.98,
            filter: "blur(0px) brightness(1.38) saturate(1.24)",
            offset: 0.58,
          },
          {
            opacity: 0.08,
            filter: "blur(1px) brightness(1.16) saturate(1.08)",
            transform: rectTransform(sourceLogoRect, logoTarget),
          },
        ],
        commonOptions(duration),
        running,
      );

      animateNode(
        video,
        [
          {
            opacity: 0.8,
            filter: "saturate(1.2) brightness(0.86)",
            borderRadius: "0px",
            clipPath: "inset(0% 0% 0% 0% round 0px)",
            transform: "translate3d(0, 0, 0) scale(1)",
          },
          {
            opacity: 0.48,
            filter: "saturate(1.08) brightness(0.76)",
            offset: 0.58,
          },
          {
            opacity: 0,
            filter: "saturate(0.9) brightness(0.68)",
            borderRadius: "28px",
            clipPath: "inset(0% 0% 0% 0% round 28px)",
            transform: rectTransform(sourceVideoRect, videoTarget),
          },
        ],
        commonOptions(duration),
        running,
      );

      animateNode(
        hud,
        [
          { opacity: 0.82, filter: "blur(0px)", transform: "translate3d(0, 0, 0) scale(1)" },
          { opacity: 0.58, filter: "blur(0px)", offset: 0.5 },
          {
            opacity: 0,
            filter: "blur(7px)",
            transform: rectTransform(sourceHudRect, hudTarget),
          },
        ],
        commonOptions(duration),
        running,
      );

      animateNode(
        line,
        [
          {
            opacity: 1,
            filter: "brightness(1.5)",
            transform: "translate3d(0, 0, 0) scale(1)",
          },
          {
            opacity: 0,
            filter: "brightness(2.2)",
            transform: rectTransform(sourceLineRect, lineTarget),
          },
        ],
        commonOptions(duration),
        running,
      );

      animateNode(
        backdrop,
        [
          { opacity: 1, filter: "hue-rotate(0deg) saturate(1.12)", transform: "scale(1)" },
          {
            opacity: 0.9,
            filter: "hue-rotate(12deg) saturate(1.38)",
            transform: "scale(1.08)",
            offset: 0.64,
          },
          {
            opacity: 0,
            filter: "hue-rotate(18deg) saturate(1.1)",
            transform: "scale(1.18)",
          },
        ],
        commonOptions(duration),
        running,
      );

      animateNode(
        focus,
        [
          { opacity: 0, transform: "translate3d(-50%, -50%, 0) scale(0.24)" },
          { opacity: 0.92, transform: "translate3d(-50%, -50%, 0) scale(1)", offset: 0.72 },
          { opacity: 0, transform: "translate3d(-50%, -50%, 0) scale(2.8)" },
        ],
        commonOptions(duration),
        running,
      );

      const topBar = root.querySelector<HTMLElement>('[data-opening-handoff-letterbox="top"]');
      const bottomBar = root.querySelector<HTMLElement>(
        '[data-opening-handoff-letterbox="bottom"]',
      );
      animateNode(
        topBar,
        [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(0, -104%, 0)" }],
        commonOptions(duration),
        running,
      );
      animateNode(
        bottomBar,
        [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(0, 104%, 0)" }],
        commonOptions(duration),
        running,
      );
      animateNode(
        root,
        [
          { opacity: 1 },
          { opacity: 1, offset: source.reducedMotion ? 0.34 : 0.82 },
          { opacity: 0 },
        ],
        commonOptions(duration),
        running,
      );

      const completionTimer = window.setTimeout(() => {
        timers.delete(completionTimer);
        settleHandoff();
      }, duration + 34);
      timers.add(completionTimer);
    } else {
      const destinationTimer = window.setTimeout(() => {
        timers.delete(destinationTimer);
        settleHandoff();
      }, 34);
      timers.add(destinationTimer);
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
      <div data-opening-handoff-grid>
        <i />
        <i />
        <i />
      </div>
      <div ref={hudRef} data-opening-handoff-hud>
        <span>DW // OPENING HANDOFF</span>
        <b>WORLD LINK</b>
        <i />
        <i />
        <i />
      </div>
      <div ref={lineRef} data-opening-handoff-line>
        <i />
      </div>
      <div ref={logoRef} data-opening-handoff-logo>
        <img
          src={source.logoSrc ?? DEFAULT_LOGO_SRC}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
        <i data-opening-handoff-logo-flare />
        <i data-opening-handoff-logo-orbit />
      </div>
      <div ref={focusRef} data-opening-handoff-focus />
      <div data-opening-handoff-letterbox="top" />
      <div data-opening-handoff-letterbox="bottom" />
    </div>,
    document.body,
  );
}
