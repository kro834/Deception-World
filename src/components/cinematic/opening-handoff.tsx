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
  /** The dive has landed and covers the screen: the route may change under it. */
  onCovered: (token: number) => void;
  onComplete: (token: number) => void;
};

// ENTER THE WORLD. The covering phase is the dive: WebGL where it is ready in
// time (opening-dive.ts), otherwise the same storyboard with compositor-only
// DOM layers. Either way the camera lands just past the World page's framing
// and the landing (startLanding) eases it back on the compositor, with a HUD
// lock and a scan sweeping the frame, while the route mounts under it: the
// mount's main-thread work never shows as a frozen frame. The arrival lets the
// settle finish, then fades the landing into the page. Reduced motion is a
// short cross-fade to the world's still and another to the page.
const ARRIVAL_MS = { full: 600, economy: 420 } as const;
const SETTLE_MS = { full: OPENING_DIVE.settle * 1000, economy: 1000 } as const;
// The arrival starts this long before the settle ends (its last motion is
// slow enough to cross-fade), and never waits longer than ARRIVAL_WAIT_CAP_MS.
const ARRIVAL_OVERLAP_MS = 380;
const ARRIVAL_WAIT_CAP_MS = 900;
const LANDING_EASING = "cubic-bezier(0.42, 0, 0.16, 1)";
const LOGO_DECODE_WAIT_MS = 180;
const CSS_LATE_START_GRACE_MS = 500;
const REDUCED_DURATION_MS = 250;
const CSS_DIVE_SCALE = { full: 1, economy: 0.8 } as const;
const DEFAULT_LOGO_SRC = "/logo-title-saga-20261016-delivery-1536.webp";
const DEFAULT_VIDEO_SRC = "/atmosphere.mp4";
const DEFAULT_VIDEO_POSTER = "/atmosphere-poster.jpg";
const WORLD_ART = "/deception-world-poster-delivery.webp";
// The dark dial inside the logo's ring (above サーガ), in its own box: the camera dives into it.
const RING = { x: 0.573, y: 0.315 };

const COVER_EASING = "cubic-bezier(0.22, 0.82, 0.2, 1)";
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

/** Resolves when the image can paint (or after `limit` ms): no empty first frame. */
function decoded(image: HTMLImageElement | null | undefined, limit: number) {
  if (!image || (image.complete && image.naturalWidth > 0) || typeof image.decode !== "function") {
    return Promise.resolve();
  }
  return Promise.race([
    image.decode().catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, limit)),
  ]);
}

/** The landing has begun to fade into the page: the page's held motion may start. */
function releaseOpeningArrival() {
  const root = document.documentElement;
  if (!root.hasAttribute("data-opening-handoff-active")) return;
  root.dataset.openingHandoffArriving = "true";
  document.dispatchEvent(
    new CustomEvent("deception-world:opening-handoff", {
      detail: { active: false, arriving: true },
    }),
  );
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
  const trailsRef = useRef<HTMLDivElement>(null);
  const warpRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef<HTMLDivElement>(null);
  const activeTokenRef = useRef<number | null>(null);
  // The landing's compositor motion also outlives the covering effect: it
  // carries on under the arrival, which waits for it to come to rest.
  const landingRef = useRef<{ token: number; endsAt: number; motion: Animation[] } | null>(null);
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
      const landing = landingRef.current;
      if (landing && landing.token === token) {
        landingRef.current = null;
        for (const animation of landing.motion) animation.cancel();
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
      const landing = landingRef.current;
      if (landing && landing.token !== token) {
        landingRef.current = null;
        for (const animation of landing.motion) animation.cancel();
      }
      if (root.dataset.openingHandoffLanding === "static") {
        delete root.dataset.openingHandoffLanding;
        root.style.removeProperty("background");
        for (const layer of root.querySelectorAll<HTMLElement>(":scope > *")) {
          layer.style.removeProperty("visibility");
        }
        worldRef.current?.style.removeProperty("opacity");
        worldRef.current?.style.removeProperty("transform");
      }
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

    // The camera has landed just past the page's framing: ease it back on
    // the compositor (the GL canvas does its own in opening-dive.ts) and lock
    // the HUD onto the world, with a scan sweeping it until the page arrives.
    function startLanding(delay = 0) {
      if (landingRef.current?.token === token || source.reducedMotion) return;
      const settleMs = SETTLE_MS[mode];
      const motion: Animation[] = [];
      const keep = (animation: Animation | null | undefined) => {
        if (animation) motion.push(animation);
      };
      const world = worldRef.current;
      if (
        stableRoot.dataset.openingHandoffTier === "css" &&
        world &&
        typeof world.animate === "function"
      ) {
        keep(
          world.animate(
            [
              { opacity: 1, transform: `scale(${OPENING_DIVE.landScale})` },
              { opacity: 1, transform: "scale(1)" },
            ],
            { duration: settleMs, delay, easing: LANDING_EASING, fill: "forwards" },
          ),
        );
      }
      const lock = lockRef.current;
      if (!source.economy && lock && typeof lock.animate === "function") {
        keep(
          lock.animate(
            [
              { opacity: 0, transform: "scale(1.06)" },
              { opacity: 1, transform: "scale(1)" },
            ],
            { duration: 640, delay, easing: SETTLE_EASING, fill: "forwards" },
          ),
        );
        const scan = lock.querySelector<HTMLElement>("[data-opening-handoff-scan]");
        if (scan && typeof scan.animate === "function") {
          keep(
            scan.animate(
              [
                { transform: "translate3d(0, -30vh, 0)", opacity: 0 },
                { transform: "translate3d(0, 10vh, 0)", opacity: 1, offset: 0.2 },
                { transform: "translate3d(0, 100vh, 0)", opacity: 0.2 },
              ],
              {
                duration: 1500,
                delay: delay + 120,
                easing: "cubic-bezier(0.45, 0, 0.3, 1)",
                iterations: Infinity,
              },
            ),
          );
        }
      }
      if (audit) for (const animation of motion) animation.pause();
      landingRef.current = { token, endsAt: performance.now() + delay + settleMs, motion };
    }

    function settleHandoff() {
      if (settled || !alive || activeTokenRef.current !== token) return;
      settled = true;
      if (stableSnapshot.phase === "covering") {
        // The dive's landing holds the screen while the route changes: its
        // layers keep their last frame (they are not cancelled here) and the
        // landing keeps the picture moving on the compositor.
        for (const timer of timers) window.clearTimeout(timer);
        timers.clear();
        for (const animation of running) animation.finish();
        stableVideo.pause();
        if (!document.hidden) startLanding();
        onCoveredRef.current(token);
        return;
      }
      // Faded out: keep it transparent while the animations are released, so
      // the landing never shows again for the frame before the portal goes.
      stableRoot.style.opacity = "0";
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
      if (!alive || viewportFrame) return;
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0;
        if (!alive) return;
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
      // A cross-fade to the world's still (CSS shows only that layer), and
      // another from it to the page.
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
      // The landing (the GL canvas, or the CSS world layer) fades into the
      // World page underneath, which already owns scrolling, once its settle
      // has nearly come to rest: a fast mount waits a moment, a slow one
      // (the settle already over) fades at once.
      const landing = landingRef.current;
      const wait =
        audit || !landing || landing.token !== token
          ? 0
          : Math.min(
              ARRIVAL_WAIT_CAP_MS,
              Math.max(0, landing.endsAt - ARRIVAL_OVERLAP_MS - performance.now()),
            );
      const arrival = animateNode(
        root,
        [{ opacity: 1 }, { opacity: 0 }],
        { ...commonOptions(ARRIVAL_MS[mode], "cubic-bezier(0.4, 0, 0.2, 1)"), delay: wait },
        running,
      );
      if (audit && arrival) arrival.pause();
      // As the fade begins, the World's own entrance (its HUD boot and
      // ambient motion, held while the landing covered it) is let go, so it
      // plays as the page arrives rather than starting after the cover.
      const releaseTimer = window.setTimeout(
        () => {
          timers.delete(releaseTimer);
          releaseOpeningArrival();
        },
        audit ? 0 : wait,
      );
      timers.add(releaseTimer);
      const completionTimer = window.setTimeout(
        () => {
          timers.delete(completionTimer);
          settleHandoff();
        },
        audit ? 1700 : wait + ARRIVAL_MS[mode] + 34,
      );
      timers.add(completionTimer);
      return cleanupEffect;
    }

    // ---- Covering: the dive.
    const cssAnimations: Animation[] = [];
    let cssStarted = false;
    let safetyTimer = 0;
    const startCssDive = (elapsedSeconds = 0) => {
      if (cssStarted || settled || !alive) return;
      cssStarted = true;
      // The CSS completion timer now owns the remaining flight. An older GL
      // watchdog must not cut short a fallback that starts near landing.
      if (safetyTimer) {
        window.clearTimeout(safetyTimer);
        timers.delete(safetyTimer);
        safetyTimer = 0;
      }
      stableRoot.dataset.openingHandoffTier = "css";
      const k = CSS_DIVE_SCALE[mode];
      const cut = OPENING_DIVE.cut * 1000 * k;
      const end = OPENING_DIVE.glEnd * 1000 * k;
      // Resume after a live GL failure without replaying the title or skipping
      // the dive. Always leave a short visible landing sequence.
      const elapsed = Math.min(Math.max(0, elapsedSeconds * 1000), end - 750);
      const at = (value: number) => Math.min(1, Math.max(0, value / end));
      // Offsets as a fraction of the plunge (0 = the press, 1 = the cut).
      const plunge = (fraction: number) => at(cut * fraction);
      const add = (node: HTMLElement | null, keyframes: Keyframe[], easing = "linear") => {
        const animation = animateNode(node, keyframes, commonOptions(end, easing), running);
        if (animation) {
          cssAnimations.push(animation);
          if (elapsed > 0) animation.currentTime = elapsed;
          if (audit) animation.pause();
        }
      };
      // The shader's storyboard on compositor layers. Each depth moves at its
      // own rate (parallax): the logo (near) on a curve that keeps
      // accelerating, the HUD rings (middle) slower and turning, the
      // atmosphere (far) slowest. Two layers of light trails stream out of
      // the ring, a red and blue ring pair flares at peak speed (the
      // chromatic warp), the ring opens as an ice iris onto the world, and
      // the world decelerates forwards past the page's framing; the landing
      // settle (startLanding) eases it back while the route mounts.
      // A lost GPU already owned the screen. Keep its replacement opaque even
      // when WebKit delays starting compositor animations after context loss.
      add(stableRoot, [
        { opacity: elapsedSeconds > 0 ? 1 : 0 },
        { opacity: 1, offset: at(160 * k) },
        { opacity: 1 },
      ]);
      // The glyphs dim as they grow (the tunnel), so none sweeps a bright edge
      // back and forth across the frame.
      add(logoRef.current, [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.985)", opacity: 1, offset: plunge(0.12) },
        { transform: "scale(1.2)", opacity: 1, offset: plunge(0.3) },
        { transform: "scale(1.62)", opacity: 0.96, offset: plunge(0.48) },
        { transform: "scale(2.25)", opacity: 0.88, offset: plunge(0.62) },
        { transform: "scale(3.1)", opacity: 0.74, offset: plunge(0.74) },
        { transform: "scale(4.4)", opacity: 0.5, offset: plunge(0.84) },
        { transform: "scale(6.2)", opacity: 0.24, offset: plunge(0.92) },
        { transform: "scale(9)", opacity: 0, offset: plunge(1) },
        { transform: "scale(9)", opacity: 0 },
      ]);
      add(videoRef.current, [
        { transform: "scale(1)", opacity: 0.8 },
        { transform: "scale(1.02)", opacity: 0.78, offset: plunge(0.3) },
        { transform: "scale(1.12)", opacity: 0.66, offset: plunge(0.62) },
        { transform: "scale(1.26)", opacity: 0.46, offset: plunge(0.84) },
        { transform: "scale(1.42)", opacity: 0.2, offset: plunge(1) },
        { transform: "scale(1.46)", opacity: 0, offset: at(cut + 120 * k) },
        { transform: "scale(1.46)", opacity: 0 },
      ]);
      add(backdropRef.current, [
        { transform: "scale(1)", opacity: 0.55 },
        { transform: "scale(1.2)", opacity: 0.7, offset: plunge(0.5) },
        { transform: "scale(1.7)", opacity: 0.9, offset: plunge(0.84) },
        { transform: "scale(2.3)", opacity: 0.6, offset: plunge(1) },
        { transform: "scale(2.5)", opacity: 0, offset: at(cut + 150 * k) },
        { transform: "scale(2.5)", opacity: 0 },
      ]);
      add(hudRef.current, [
        { transform: "scale(1) rotate(0deg)", opacity: 0.72 },
        { transform: "scale(1.3) rotate(6deg)", opacity: 0.6, offset: plunge(0.4) },
        { transform: "scale(2.2) rotate(14deg)", opacity: 0.4, offset: plunge(0.7) },
        { transform: "scale(3.6) rotate(22deg)", opacity: 0, offset: plunge(0.88) },
        { transform: "scale(3.6) rotate(22deg)", opacity: 0 },
      ]);
      add(speedRef.current, [
        { transform: "scale(0.55)", opacity: 0 },
        { transform: "scale(0.9)", opacity: 0.3, offset: plunge(0.35) },
        { transform: "scale(1.7)", opacity: 0.72, offset: plunge(0.7) },
        { transform: "scale(2.9)", opacity: 0.92, offset: plunge(1) },
        { transform: "scale(3.6)", opacity: 0, offset: at(cut + 300 * k) },
        { transform: "scale(3.6)", opacity: 0 },
      ]);
      add(trailsRef.current, [
        { transform: "scale(0.4) rotate(4deg)", opacity: 0 },
        { transform: "scale(0.7) rotate(4deg)", opacity: 0.26, offset: plunge(0.45) },
        { transform: "scale(1.6) rotate(4deg)", opacity: 0.62, offset: plunge(1) },
        { transform: "scale(2) rotate(4deg)", opacity: 0, offset: at(cut + 250 * k) },
        { transform: "scale(2) rotate(4deg)", opacity: 0 },
      ]);
      add(tunnelRef.current, [
        { opacity: 0, easing: "ease-in" },
        { opacity: 0.42, offset: plunge(0.54) },
        { opacity: 0.84, offset: plunge(1) },
        { opacity: 0, offset: at(cut + 300 * k) },
        { opacity: 0 },
      ]);
      add(warpRef.current, [
        { transform: "scale(0.25)", opacity: 0 },
        { transform: "scale(0.45)", opacity: 0, offset: plunge(0.7) },
        { transform: "scale(0.9)", opacity: 0.6, offset: plunge(0.92) },
        { transform: "scale(1.5)", opacity: 0.7, offset: plunge(1) },
        { transform: "scale(3.2)", opacity: 0, offset: at(cut + 220 * k) },
        { transform: "scale(3.2)", opacity: 0 },
      ]);
      add(bloomRef.current, [
        { transform: "scale(0.1)", opacity: 0 },
        { transform: "scale(0.12)", opacity: 0, offset: plunge(0.72) },
        { transform: "scale(0.9)", opacity: 0.9, offset: plunge(0.9) },
        { transform: "scale(2.6)", opacity: 0.86, offset: plunge(1) },
        { transform: "scale(3.6)", opacity: 0.32, offset: at(cut + 180 * k) },
        { transform: "scale(4.2)", opacity: 0, offset: at(cut + 360 * k) },
        { transform: "scale(4.2)", opacity: 0 },
      ]);
      add(worldRef.current, [
        { opacity: 0, transform: "scale(0.9)" },
        { opacity: 0, transform: "scale(0.9)", offset: plunge(0.8) },
        {
          opacity: 1,
          transform: "scale(0.96)",
          offset: plunge(1),
          easing: "cubic-bezier(0.22, 0.7, 0.3, 1)",
        },
        { opacity: 1, transform: `scale(${OPENING_DIVE.landScale})` },
      ]);
      for (const bar of stableRoot.querySelectorAll<HTMLElement>(
        "[data-opening-handoff-letterbox]",
      )) {
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
        // The landing is scheduled on the compositor now, so a busy main
        // thread (the route mounting) cannot hold it at its first frame.
        startLanding(end - elapsed);
        // The route mounts only after the landing: raster work for the new
        // page would otherwise hold the flight's frames on slower GPUs. The
        // flight lands on its own clock, so a late first frame (a busy main
        // thread as it starts) never cuts its breakthrough short; the timer
        // is the fail-safe.
        void cssAnimations[0]?.finished.then(
          () => {
            if (alive) settleHandoff();
          },
          () => undefined,
        );
        const coveredTimer = window.setTimeout(
          () => {
            timers.delete(coveredTimer);
            settleHandoff();
          },
          end - elapsed + 34 + CSS_LATE_START_GRACE_MS,
        );
        timers.add(coveredTimer);
      }
    };

    let tierLabel = "pending";
    root.dataset.openingHandoffTier = "pending";
    // A fresh CSS dive waits (briefly) for its logo and its world to decode,
    // under the transparent pending root, so no frame of it is ever empty.
    const firstImage = (node: HTMLElement | null) =>
      typeof node?.querySelector === "function" ? node.querySelector("img") : null;
    const logoReady = Promise.all([
      decoded(firstImage(logo), LOGO_DECODE_WAIT_MS),
      decoded(firstImage(worldRef.current), LOGO_DECODE_WAIT_MS),
    ]);
    const beginCssDive = () => {
      void logoReady.then(() => {
        if (!alive || settled) return;
        tierLabel = "css";
        startCssDive();
      });
    };

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
      beginCssDive();
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
            onFallback: (elapsed, landed) => {
              if (landed) {
                // This run also owns its still during arrival, after this
                // covering effect has settled and cleaned up. Only its token
                // and connected portal may replace that retained GL frame.
                const world = worldRef.current;
                const currentDive = diveRef.current;
                if (
                  currentDive?.token !== token ||
                  currentDive.run !== run ||
                  rootRef.current !== stableRoot ||
                  !stableRoot.isConnected ||
                  !world?.isConnected ||
                  !stableRoot.contains(world)
                )
                  return;
                tierLabel = "css";
                stableRoot.dataset.openingHandoffTier = "css";
                stableRoot.dataset.openingHandoffLanding = "static";
                stableRoot.style.background = "#04080f";
                // Do not touch root opacity: its arrival fade may already be
                // running. A static world replaces the canvas without another
                // tunnel, title reveal, or covered notification.
                for (const layer of stableRoot.querySelectorAll<HTMLElement>(":scope > *")) {
                  if (layer !== world) layer.style.visibility = "hidden";
                }
                for (const animation of world.getAnimations()) animation.cancel();
                world.style.opacity = "1";
                world.style.transform = "none";
                world.style.visibility = "visible";
                return;
              }
              tierLabel = "css";
              startCssDive(elapsed);
            },
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
            beginCssDive();
          }
        })
        .catch(() => {
          beginCssDive();
        });
      // Fail-safe: a dive that never lands (the tab was frozen) still covers.
      if (!audit) {
        safetyTimer = window.setTimeout(
          () => {
            timers.delete(safetyTimer);
            settleHandoff();
          },
          OPENING_DIVE.glEnd * 1000 + 950,
        );
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
      <div ref={trailsRef} data-opening-handoff-trails />
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
      <div ref={warpRef} data-opening-handoff-warp />
      <div ref={bloomRef} data-opening-handoff-bloom />
      <div data-opening-handoff-letterbox="top" />
      <div data-opening-handoff-letterbox="bottom" />
      <div ref={glRef} data-opening-handoff-gl />
      <div ref={lockRef} data-opening-handoff-lock>
        <i />
        <i />
        <i />
        <i />
        <span data-opening-handoff-scan />
      </div>
    </div>,
    document.body,
  );
}
