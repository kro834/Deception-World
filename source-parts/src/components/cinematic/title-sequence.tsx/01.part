import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type SyntheticEvent,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { createCinematicScore } from "@/lib/cinematic-audio";
import { WORLD_ENTER_ASSETS, preloadAssets } from "@/lib/asset-loader";
import {
  OPENING_LOGO_FINAL,
  OPENING_LOGO_FIRST,
  OPENING_LOGO_HEIGHT,
  OPENING_LOGO_SIZES,
  OPENING_LOGO_WIDTH,
} from "@/lib/opening-logo";
import { useLoadGate } from "@/components/load-gate";
import { Particles } from "./particles";
import { OPENING_BURN } from "./opening-timing";
import type { BurnRun, BurnStats } from "./opening-burn";

// OPENING_SEQUENCE_SECONDS in opening-timing.ts: the ice logo arrives, burns
// from 2.6 s, and the prism logo has cooled and taken over by about 6.1 s.
const SEQUENCE_MS = 7200;

// The burn and dive engines are loaded with import() in idle time, so the
// title's first paint does not carry WebGL code.
type BurnEngine = typeof import("./opening-burn");
type DiveEngine = typeof import("./opening-dive");
let burnEngine: Promise<BurnEngine> | null = null;
let diveEngine: Promise<DiveEngine> | null = null;
const loadBurnEngine = () => (burnEngine ??= import("./opening-burn"));
const loadDiveEngine = () => (diveEngine ??= import("./opening-dive"));

// Most taps last longer than this, and a flick usually cancels the pointer
// sooner; a quicker tap primes at pointerup (as RISING THE WORLD does).
const DIVE_TOUCH_PRIME_DELAY_MS = 60;

const openingAuditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("opening-audit");

type OpeningTitleTestHook = {
  readonly phase: SequencePhase;
  readonly burn: BurnStats | null;
  /** Resolves once the burn engine is loaded and, for WebGL, compiled (or given up). */
  ready: () => Promise<string>;
  /** Audit clock: seconds since the title started playing; every animation is paused on it. */
  seek: (t: number) => void;
  finish: () => void;
};

declare global {
  interface Window {
    __openingTest?: { title?: OpeningTitleTestHook; dive?: unknown };
    __openingBurnStats?: BurnStats;
  }
}

function whenIdle(callback: () => void, timeout = 900) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 16);
  return () => window.clearTimeout(id);
}

type SequencePhase = "idle" | "playing" | "complete" | "diving";

function waitForVisualPaint() {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.setTimeout(finish, 96);
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
  });
}

// The static scene layers are memoised: a phase change (for example the press
// on ENTER THE WORLD) re-renders only what the phase changes.
const HudRings = memo(function HudRings({ rootRef }: { rootRef: Ref<SVGSVGElement> }) {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const inner = i % 5 === 0 ? 70 : 74;
    const n = (v: number) => v.toFixed(2);
    return {
      i,
      x1: n(100 + Math.cos(a) * inner),
      y1: n(100 + Math.sin(a) * inner),
      x2: n(100 + Math.cos(a) * 78),
      y2: n(100 + Math.sin(a) * 78),
      sw: i % 5 === 0 ? "0.6" : "0.25",
    };
  });

  return (
    <svg ref={rootRef} className="cine-hud" viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke="currentColor" className="text-ice/80" strokeWidth="0.35">
        <g className="cine-hud-orbits">
          <ellipse cx="100" cy="100" rx="92" ry="31" strokeDasharray="1.5 5.5" />
          <ellipse
            cx="100"
            cy="100"
            rx="92"
            ry="31"
            strokeDasharray="18 9"
            transform="rotate(60 100 100)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="92"
            ry="31"
            strokeDasharray="4 11"
            transform="rotate(120 100 100)"
          />
        </g>
        <g className="cine-hud-spin">
          <circle cx="100" cy="100" r="78" />
          <circle cx="100" cy="100" r="86" strokeDasharray="2 6" />
          {ticks.map((t) => (
            <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.sw} />
          ))}
        </g>
        <g className="cine-hud-spin-rev">
          <circle cx="100" cy="100" r="52" strokeDasharray="12 8" />
          <circle cx="100" cy="100" r="44" />
        </g>
        <g className="cine-hud-reticle">
          <path d="M100 7v18M100 175v18M7 100h18M175 100h18" />
          <path d="M100 33l4 7-4 7-4-7zM100 153l4 7-4 7-4-7z" />
          <circle cx="100" cy="100" r="7" strokeDasharray="2 3" />
        </g>
      </g>
    </svg>
  );
});

const CinematicDepthField = memo(function CinematicDepthField() {
  return (
    <div className="cine-depth-field" aria-hidden="true">
      <div className="cine-depth-grid" />
      <div className="cine-aperture">
        <i />
        <i />
        <i />
      </div>
      <div className="cine-orbit cine-orbit-a" />
      <div className="cine-orbit cine-orbit-b" />
      <div className="cine-prism-field">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className="cine-impact-bloom">
        <i />
        <i />
      </div>
    </div>
  );
});

const CinematicEditorialFrame = memo(function CinematicEditorialFrame() {
  return (
    <div className="cine-editorial" aria-hidden="true">
      <div className="cine-editorial-frame">
        <i className="cine-editorial-frame-top" />
        <i className="cine-editorial-frame-right" />
        <i className="cine-editorial-frame-bottom" />
        <i className="cine-editorial-frame-left" />
      </div>
      <div className="cine-editorial-type">
        <p className="cine-editorial-kicker">
          <span>KAMEN RIDER SAGA</span>
          <i />
          <span>WORLD FILE / 02</span>
        </p>
        <div className="cine-editorial-word" aria-hidden="true">
          <span>
            <b>DECEPTION</b>
          </span>
          <span>
            <b>WORLD</b>
          </span>
        </div>
        <p className="cine-editorial-caption">THE WORLD IS MADE OF DECEPTION.</p>
      </div>
      <span className="cine-editorial-coordinate cine-editorial-coordinate-left">
        35°41′ // REALITY
      </span>
      <span className="cine-editorial-coordinate cine-editorial-coordinate-right">
        SIGNAL 07 // LOCKED
      </span>
    </div>
  );
});

function LogoLayer({
  logo,
  className,
  imageRef,
  alt = "",
  priority = "low",
  onLoad,
}: {
  logo: typeof OPENING_LOGO_FIRST;
  className: string;
  imageRef?: Ref<HTMLImageElement>;
  alt?: string;
  priority?: "high" | "low";
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <img
      ref={imageRef}
      src={logo.src}
      srcSet={logo.srcSet}
      sizes={OPENING_LOGO_SIZES}
      crossOrigin="anonymous"
      alt={alt}
      className={className}
      width={OPENING_LOGO_WIDTH}
      height={OPENING_LOGO_HEIGHT}
      loading="eager"
      decoding="async"
      fetchPriority={priority}
      draggable={false}
      onLoad={onLoad}
    />
  );
}

export function TitleSequence() {
  const [phase, setPhase] = useState<SequencePhase>("idle");
  const [muted, setMuted] = useState(false);
  const [economyOpening, setEconomyOpening] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [audit] = useState(openingAuditRequested);
  const scoreRef = useRef<ReturnType<typeof createCinematicScore> | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const firstLogoRef = useRef<HTMLImageElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const logoBoxRef = useRef<HTMLDivElement>(null);
  const burnHostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const videoStartTimerRef = useRef<number | null>(null);
  const burnTimerRef = useRef<number | null>(null);
  const burnModuleRef = useRef<BurnEngine | null>(null);
  const burnRunRef = useRef<BurnRun | null>(null);
  const burnPrimeRef = useRef<Promise<string> | null>(null);
  const diveModuleRef = useRef<DiveEngine | null>(null);
  const divePrimeTimerRef = useRef(0);
  const phaseRef = useRef(phase);
  const mountedRef = useRef(true);
  const { beginOpeningHandoff, go } = useLoadGate();
  const router = useRouter();
  phaseRef.current = phase;

  useEffect(() => {
    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      deviceMemory?: number;
    };
    const economy =
      connection.connection?.saveData === true ||
      connection.connection?.effectiveType === "slow-2g" ||
      connection.connection?.effectiveType === "2g" ||
      (connection.deviceMemory !== undefined && connection.deviceMemory <= 2) ||
      (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2);
    setEconomyOpening(economy);
    if (
      connection.connection?.saveData ||
      connection.connection?.effectiveType === "slow-2g" ||
      connection.connection?.effectiveType === "2g"
    ) {
      return;
    }
    let idleId: number | null = null;
    const warm = () => {
      void Promise.all([
        preloadAssets(WORLD_ENTER_ASSETS, () => undefined),
        router.preloadRoute({ to: "/world" }).catch(() => undefined),
      ]);
    };
    // Let the title poster and controls paint before the larger world artwork
    // competes for network/decoding time, then use the first idle window so the
    // destination is still warm well before the shortened opening completes.
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(warm, { timeout: 900 });
      } else {
        warm();
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      if (idleId != null) window.cancelIdleCallback(idleId);
    };
  }, [router]);

  // The shine is masked by the prism logo's alpha, from the file its layer
  // chose. A server-rendered image can finish loading before hydration, so
  // the mount checks as well as the load event.
  const syncLogoMask = useCallback(() => {
    const source = logoRef.current?.complete ? logoRef.current.currentSrc : "";
    if (source) logoBoxRef.current?.style.setProperty("--cine-logo-mask", `url("${source}")`);
  }, []);

  useEffect(() => syncLogoMask(), [syncLogoMask]);

  const stopBurn = useCallback(() => {
    if (burnTimerRef.current != null) {
      window.clearTimeout(burnTimerRef.current);
      burnTimerRef.current = null;
    }
    burnRunRef.current?.dispose();
    burnRunRef.current = null;
    const lockup = lockupRef.current;
    if (lockup) {
      delete lockup.dataset.burn;
      delete lockup.dataset.burnPhase;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (videoStartTimerRef.current != null) window.clearTimeout(videoStartTimerRef.current);
      window.clearTimeout(divePrimeTimerRef.current);
      scoreRef.current?.stop();
      scoreRef.current = null;
      stopBurn();
      burnModuleRef.current?.releaseOpeningBurn();
      // A dive that has started owns its uploaded textures; only the unused
      // decoded bitmaps and an unclaimed primed context are dropped here.
      diveModuleRef.current?.releaseOpeningDivePrepared();
    };
  }, [stopBurn]);

  // Burn priming, well before the burn starts: the engine chunk, both logos as
  // resized ImageBitmaps (decoded off the main thread), then in an idle slice
  // the GL context, the uploads and the (parallel) shader compile.
  useEffect(() => {
    let cancelled = false;
    let cancelIdle: () => void = () => undefined;
    const prime = async () => {
      const engine = await loadBurnEngine();
      if (cancelled) return "cancelled";
      burnModuleRef.current = engine;
      if (engine.currentOpeningTier() !== "webgl") return engine.currentOpeningTier();
      const first = firstLogoRef.current;
      const final = logoRef.current;
      const box = logoBoxRef.current;
      if (!first || !final || !box) return "missing";
      // The <img> layers pick the candidate; the burn uses the same files.
      await Promise.all([first.decode(), final.decode()]).catch(() => undefined);
      if (cancelled) return "cancelled";
      const width = engine.burnTextureWidth(box.getBoundingClientRect().width || 800);
      await engine.prepareOpeningBurn(
        first.currentSrc || first.src,
        final.currentSrc || final.src,
        width,
      );
      if (cancelled) return "cancelled";
      await new Promise<void>((resolve) => {
        cancelIdle = whenIdle(() => resolve(), 600);
      });
      if (cancelled) return "cancelled";
      engine.primeOpeningBurn();
      // Resolves when the compile settles (audit and tests wait on it).
      for (let frame = 0; frame < 600 && !cancelled; frame += 1) {
        if (engine.openingBurnReady()) return "webgl";
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      }
      return engine.openingBurnReady() ? "webgl" : "not-ready";
    };
    burnPrimeRef.current = prime().catch(() => "failed");
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [replayKey]);

  const startBurn = useCallback(
    (auditRun = false) => {
      burnTimerRef.current = null;
      const lockup = lockupRef.current;
      const host = burnHostRef.current;
      const logoBox = logoBoxRef.current;
      if (!lockup || !host || !logoBox || burnRunRef.current || lockup.dataset.burn) return;
      if (phaseRef.current !== "playing") return;
      const engine = burnModuleRef.current;
      if (!engine) {
        // The engine chunk is not here (offline, slow network): the CSS burn.
        lockup.dataset.burn = "css";
        lockup.dataset.burnPhase = "burning";
        return;
      }
      burnRunRef.current = engine.runOpeningBurn({ lockup, host, logoBox, audit: auditRun });
      window.__openingBurnStats = burnRunRef.current.stats;
    },
    [],
  );

  const getScore = useCallback(() => {
    if (!scoreRef.current) {
      scoreRef.current = createCinematicScore();
      scoreRef.current.setMuted(muted);
    }
    return scoreRef.current;
  }, [muted]);

  const begin = useCallback(() => {
    phaseRef.current = "playing";
    setPhase("playing");
    if (!audit) {
      if (burnTimerRef.current != null) window.clearTimeout(burnTimerRef.current);
      burnTimerRef.current = window.setTimeout(() => startBurn(), OPENING_BURN.start * 1000);
    }
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      if (videoStartTimerRef.current != null) window.clearTimeout(videoStartTimerRef.current);
      // `preload="none"` keeps the 1 MB atmosphere clip off the critical
      // startup path. The poster carries the first frames; playback joins once
      // the opening chrome has had a chance to paint.
      // The audit clock keeps the atmosphere on its poster frame.
      if (!economyOpening) {
        videoStartTimerRef.current = window.setTimeout(() => {
          videoStartTimerRef.current = null;
          if (phaseRef.current === "playing" && document.visibilityState === "visible" && !audit) {
            void video.play().catch(() => undefined);
          }
        }, 90);
      }
    }
  }, [audit, economyOpening, startBurn]);

  const finish = useCallback(() => {
    phaseRef.current = "complete";
    setPhase("complete");
    stopBurn();
    // Anything primed and unused (a skip before the burn) is released.
    burnModuleRef.current?.releaseOpeningBurn();
    scoreRef.current?.stop();
    scoreRef.current = null;
    if (videoStartTimerRef.current != null) {
      window.clearTimeout(videoStartTimerRef.current);
      videoStartTimerRef.current = null;
    }
    videoRef.current?.pause();
  }, [stopBurn]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      finish();
      return;
    }
    const t = window.setTimeout(() => begin(), 120);
    return () => window.clearTimeout(t);
  }, [begin, finish, replayKey]);

  useEffect(() => {
    if (phase !== "playing" || audit) return;
    const t = window.setTimeout(finish, SEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [audit, finish, phase]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const replay = useCallback(() => {
    scoreRef.current?.stop();
    scoreRef.current = null;
    stopBurn();
    burnModuleRef.current?.releaseOpeningBurn();
    const video = videoRef.current;
    if (videoStartTimerRef.current != null) {
      window.clearTimeout(videoStartTimerRef.current);
      videoStartTimerRef.current = null;
    }
    video?.pause();
    if (video) video.currentTime = 0;
    phaseRef.current = "idle";
    setPhase("idle");
    setReplayKey((k) => k + 1);
    const score = getScore();
    if (!score.muted()) score.start();
  }, [getScore, stopBurn]);

  // The dive's images (the prism logo, the atmosphere still and the world key
  // visual) are decoded as ImageBitmaps once the title has settled.
  const prepareDive = useCallback(() => {
    void loadDiveEngine()
      .then((engine) => {
        diveModuleRef.current = engine;
        const logo = logoRef.current;
        return engine.prepareOpeningDive(logo?.currentSrc || logo?.src || OPENING_LOGO_FINAL.src);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "complete") return;
    return whenIdle(prepareDive, 1200);
  }, [phase, prepareDive]);

  // ENTER THE WORLD pointer contact: the GL context and the shader compile
  // start on a detached canvas before the click. Touch primes a moment later
  // (or at pointerup), so a flick that becomes a scroll creates no context.
  const cancelDivePrime = () => {
    window.clearTimeout(divePrimeTimerRef.current);
    divePrimeTimerRef.current = 0;
  };
  const primeDiveNow = () => {
    cancelDivePrime();
    diveModuleRef.current?.primeOpeningDive();
  };
  const primeDive = (event: ReactPointerEvent<HTMLButtonElement>) => {
    prepareDive();
    if (event.pointerType !== "touch") {
      primeDiveNow();
      return;
    }
    cancelDivePrime();
    divePrimeTimerRef.current = window.setTimeout(primeDiveNow, DIVE_TOUCH_PRIME_DELAY_MS);
  };
  const primeDivePending = () => {
    if (divePrimeTimerRef.current) primeDiveNow();
  };

  const enterWorld = useCallback(async () => {
    if (phaseRef.current !== "complete") return;

    const logo = logoRef.current;
    const hud = hudRef.current;
    const line = lineRef.current;
    if (!logo) return;

    const video = videoRef.current;
    const started = beginOpeningHandoff({
      logoRect: logo.getBoundingClientRect(),
      videoRect: video?.getBoundingClientRect(),
      hudRect: hud?.getBoundingClientRect(),
      lineRect: line?.getBoundingClientRect(),
      logoSrc: logo.currentSrc || logo.src || undefined,
      videoSrc: video?.currentSrc || video?.src || undefined,
      videoPoster: video?.poster || undefined,
      videoCurrentTime: video?.currentTime ?? 0,
      videoPlaying: Boolean(video && !video.paused),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      economy: economyOpening,
    });
    if (!started) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    phaseRef.current = "diving";
    setPhase("diving");

    try {
      // Give the provider-owned handoff layer two painted frames before route
      // work begins. This keeps the dive visible on mobile WebKit without
      // moving the title document or duplicating the transition locally.
      await waitForVisualPaint();
      if (!mountedRef.current || phaseRef.current !== "diving") return;
      await go({ to: "/world", assets: WORLD_ENTER_ASSETS, transitionCovered: true });
      // The covered route contract deliberately resolves cancellation and
      // timeout paths without throwing. If the title is still mounted, restore
      // its controls instead of leaving an inert `diving` frame behind.
      if (mountedRef.current && phaseRef.current === "diving" && window.location.pathname === "/") {
        phaseRef.current = "complete";
        setPhase("complete");
      }
    } catch {
      if (mountedRef.current) {
        phaseRef.current = "complete";
        setPhase("complete");
      }
    }
  }, [beginOpeningHandoff, economyOpening, go]);

  useEffect(() => {
    const restoreTitleIfNeeded = () => {
      if (mountedRef.current && phaseRef.current === "diving" && window.location.pathname === "/") {
        phaseRef.current = "complete";
        setPhase("complete");
      }
    };
    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (document.hidden) {
        if (videoStartTimerRef.current != null) {
          window.clearTimeout(videoStartTimerRef.current);
          videoStartTimerRef.current = null;
        }
        video?.pause();
        return;
      }
      restoreTitleIfNeeded();
      if (phaseRef.current === "playing" && !economyOpening && !audit) {
        void video?.play().catch(() => undefined);
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restoreTitleIfNeeded();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [audit, economyOpening]);

  // ?opening-audit: a frame-exact clock for the flash audit and the contact
  // sheets (scripts/verify-opening-cinematic.mjs). Nothing runs on timers.
  useEffect(() => {
    if (!audit) return;
    const hook: OpeningTitleTestHook = {
      get phase() {
        return phaseRef.current;
      },
      get burn() {
        return burnRunRef.current?.stats ?? null;
      },
      ready: async () => {
        for (let frame = 0; frame < 600 && !burnPrimeRef.current; frame += 1) {
          await new Promise((resolve) => window.requestAnimationFrame(resolve));
        }
        return (await burnPrimeRef.current) ?? "none";
      },
      seek: (t: number) => {
        const stage = stageRef.current;
        if (!stage || phaseRef.current !== "playing") return;
        if (t >= OPENING_BURN.start) startBurn(true);
        burnRunRef.current?.seek(t - OPENING_BURN.start);
        for (const animation of stage.getAnimations({ subtree: true })) {
          animation.pause();
          // The burn's CSS animations start with the burn.
          const name = "animationName" in animation ? String(animation.animationName) : "";
          const offset = name.startsWith("cine-burn") ? OPENING_BURN.start : 0;
          animation.currentTime = Math.max(0, t - offset) * 1000;
        }
      },
      finish: () => finish(),
    };
    window.__openingTest = { ...window.__openingTest, title: hook };
    return () => {
      if (window.__openingTest?.title === hook) delete window.__openingTest.title;
    };
  }, [audit, finish, startBurn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const isInteractive = Boolean(
        target?.closest("button, a, input, textarea, select, [contenteditable='true']"),
      );
      const isSkipKey =
        e.key === "Escape" || e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "s";
      if (phase === "playing" && isSkipKey && (!isInteractive || e.key === "Escape")) {
        e.preventDefault();
        skip();
      } else if (phase === "complete" && !isInteractive && e.key.toLowerCase() === "r") {
        replay();
      } else if (phase !== "diving" && !isInteractive && e.key.toLowerCase() === "m") {
        setMuted((m) => {
          const next = !m;
          scoreRef.current?.setMuted(next);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, replay, skip]);

  const toggleMute = () => {
    const score = getScore();
    setMuted((m) => {
      const next = !m;
      score.setMuted(next);
      if (!next && phaseRef.current === "playing") {
        void score.unlock().then(() => score.start());
      }
      return next;
    });
  };

  const unlockAudio = () => {
    const score = getScore();
    void score.unlock().then(() => {
      if (phaseRef.current === "playing" && !score.muted()) score.start();
    });
  };

  const stageStateClass =
    phase === "playing"
      ? "cine-stage is-playing"
      : phase === "complete"
        ? "cine-stage is-complete"
        : phase === "diving"
          ? "cine-stage is-complete is-diving"
          : "cine-stage";
  const stageClass = `${stageStateClass}${economyOpening ? " is-economy-opening" : ""}`;
  const isWorldTransitioning = phase === "diving";

  return (
    <main
      ref={stageRef}
      className={stageClass}
      onPointerDown={phase === "playing" ? unlockAudio : undefined}
      aria-label="仮面ライダーサーガ Deception World オープニング"
      aria-busy={isWorldTransitioning}
    >
      <div className="cine-camera" aria-hidden="true">
        <video
          key={`atm-${replayKey}`}
          ref={videoRef}
          className="cine-atmosphere"
          src="/atmosphere.mp4"
          poster="/atmosphere-poster.jpg"
          muted
          playsInline
          preload="none"
          loop
        />
        <div className="cine-light-field" />
        <CinematicDepthField />
      </div>
      <CinematicEditorialFrame />
      <div className="cine-scanline" aria-hidden="true" />
      <div className="cine-flare" aria-hidden="true" />
      <HudRings rootRef={hudRef} />
      <Particles active={!audit && phase === "playing"} />

      <div ref={lineRef} className="cine-line" />

      <div className="cine-sequence-meta" aria-hidden="true">
        <span>DW // OPENING 02</span>
        <span>WORLD SIGNAL 07</span>
      </div>

      <div className="cine-stack">
        <div ref={lockupRef} className="cine-title-lockup">
          <div ref={logoBoxRef} className="cine-logo-wrap">
            <LogoLayer logo={OPENING_LOGO_FIRST} className="cine-logo-glow" />
            <LogoLayer logo={OPENING_LOGO_FIRST} className="cine-logo-echo cine-logo-echo-ice" />
            <LogoLayer logo={OPENING_LOGO_FIRST} className="cine-logo-echo cine-logo-echo-gold" />
            <LogoLayer
              logo={OPENING_LOGO_FINAL}
              className="cine-logo-core"
              imageRef={logoRef}
              alt="仮面ライダーサーガ Kamen Rider SA-GA Deception World"
              onLoad={syncLogoMask}
            />
            <LogoLayer
              logo={OPENING_LOGO_FIRST}
              className="cine-logo-first"
              imageRef={firstLogoRef}
              priority="high"
            />
            <div className="cine-logo-shine" />
            <span className="cine-logo-frame" aria-hidden="true" />
          </div>
          {/* The burn: the WebGL canvas is appended here; the other layers are the CSS tier. */}
          <div ref={burnHostRef} className="cine-logo-burn" aria-hidden="true">
            <span className="cine-burn-light" />
            <span className="cine-burn-box">
              <span className="cine-burn-reveal">
                <LogoLayer logo={OPENING_LOGO_FINAL} className="cine-burn-art" />
                <LogoLayer logo={OPENING_LOGO_FINAL} className="cine-burn-art cine-burn-hot" />
              </span>
              <span className="cine-burn-wipe">
                <LogoLayer logo={OPENING_LOGO_FIRST} className="cine-burn-art" />
              </span>
              <span className="cine-burn-flame">
                <i />
                <i />
              </span>
              <span className="cine-burn-embers">
                {Array.from({ length: 10 }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
            </span>
          </div>
          <div className="cine-title-caption" aria-hidden="true">
            <span>THE SECOND SAGA</span>
            <i />
            <span>DECEPTION WORLD</span>
          </div>
        </div>
      </div>

      <div className="cine-vignette" />
      <div className="cine-grain" />
      <div className="cine-letterbox top" />
      <div className="cine-letterbox bottom" />
      <div className="cine-progress" aria-hidden="true">
        <span />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="cine-cue" aria-hidden="true">
        <span>INITIALIZE SIGNAL</span>
        <span>TRACE DECEPTION</span>
        <span>WORLD LOCKED</span>
      </div>

      <div className="cine-enter-hint">
        <p className="cine-pulse cine-kicker">Opening</p>
      </div>

      <button
        type="button"
        className="cine-ghost cine-skip"
        disabled={phase !== "playing"}
        onClick={skip}
        aria-label="オープニングをスキップ"
        aria-keyshortcuts="Escape Enter Space S"
      >
        <SkipForward className="size-4" aria-hidden="true" />
        <span>スキップ</span>
        <kbd>ESC</kbd>
      </button>

      <div className="cine-always" aria-hidden={phase === "idle" || isWorldTransitioning}>
        <button
          type="button"
          className="cine-ghost inline-flex items-center gap-2"
          disabled={phase === "idle" || isWorldTransitioning}
          onClick={toggleMute}
          aria-label={muted ? "音声をオン" : "音声をオフ"}
          aria-keyshortcuts="M"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          <span className="hidden sm:inline">{muted ? "SOUND OFF" : "SOUND ON"}</span>
        </button>
      </div>

      <div
        className="cine-chrome cine-replay-slot absolute inset-x-0 flex justify-center gap-3"
        aria-hidden={phase !== "complete"}
      >
        <button
          type="button"
          className="cine-btn"
          disabled={phase !== "complete"}
          onPointerDown={primeDive}
          onPointerUp={primeDivePending}
          onPointerCancel={cancelDivePrime}
          onFocus={prepareDive}
          onClick={() => void enterWorld()}
        >
          <span>ENTER THE WORLD</span>
        </button>
        <button
          type="button"
          className="cine-btn"
          disabled={phase !== "complete"}
          onClick={replay}
          aria-keyshortcuts="R"
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="size-3.5" />
            もう一度
          </span>
        </button>
      </div>
    </main>
  );
}
