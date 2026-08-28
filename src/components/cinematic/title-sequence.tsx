import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { useRouter } from "@tanstack/react-router";
import { RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { createCinematicScore } from "@/lib/cinematic-audio";
import { WORLD_ENTER_ASSETS, preloadAssets } from "@/lib/asset-loader";
import { useLoadGate } from "@/components/load-gate";
import { Particles } from "./particles";

const SEQUENCE_MS = 5800;

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

function HudRings({ rootRef }: { rootRef: Ref<SVGSVGElement> }) {
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
}

function CinematicDepthField() {
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
}

export function TitleSequence() {
  const [phase, setPhase] = useState<SequencePhase>("idle");
  const [muted, setMuted] = useState(false);
  const [economyOpening, setEconomyOpening] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const scoreRef = useRef<ReturnType<typeof createCinematicScore> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const videoStartTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (videoStartTimerRef.current != null) window.clearTimeout(videoStartTimerRef.current);
      scoreRef.current?.stop();
      scoreRef.current = null;
    };
  }, []);

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
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      if (videoStartTimerRef.current != null) window.clearTimeout(videoStartTimerRef.current);
      // `preload="none"` keeps the 1 MB atmosphere clip off the critical
      // startup path. The poster carries the first frames; playback joins once
      // the opening chrome has had a chance to paint.
      if (!economyOpening) {
        videoStartTimerRef.current = window.setTimeout(() => {
          videoStartTimerRef.current = null;
          if (phaseRef.current === "playing" && document.visibilityState === "visible") {
            void video.play().catch(() => undefined);
          }
        }, 90);
      }
    }
  }, [economyOpening]);

  const finish = useCallback(() => {
    phaseRef.current = "complete";
    setPhase("complete");
    scoreRef.current?.stop();
    scoreRef.current = null;
    if (videoStartTimerRef.current != null) {
      window.clearTimeout(videoStartTimerRef.current);
      videoStartTimerRef.current = null;
    }
    videoRef.current?.pause();
  }, []);

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
    if (phase !== "playing") return;
    const t = window.setTimeout(finish, SEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [finish, phase]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const replay = useCallback(() => {
    scoreRef.current?.stop();
    scoreRef.current = null;
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
  }, [getScore]);

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
      if (
        mountedRef.current &&
        phaseRef.current === "diving" &&
        window.location.pathname === "/"
      ) {
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
      if (
        mountedRef.current &&
        phaseRef.current === "diving" &&
        window.location.pathname === "/"
      ) {
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
      if (phaseRef.current === "playing" && !economyOpening) {
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
  }, [economyOpening]);

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
    <section
      className={stageClass}
      onPointerDown={phase === "playing" ? unlockAudio : undefined}
      role="region"
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
      <div className="cine-scanline" aria-hidden="true" />
      <div className="cine-flare" aria-hidden="true" />
      <HudRings rootRef={hudRef} />
      <Particles active={phase === "playing" || isWorldTransitioning} />

      <div ref={lineRef} className="cine-line" />

      <div className="cine-sequence-meta" aria-hidden="true">
        <span>DW // OPENING 02</span>
        <span>WORLD SIGNAL 07</span>
      </div>

      <div className="cine-stack">
        <div className="cine-title-lockup">
          <div className="cine-logo-wrap">
            <img
              src="/logo-title.jpg"
              alt=""
              className="cine-logo-glow"
              decoding="async"
              draggable={false}
            />
            <img
              src="/logo-title.jpg"
              alt=""
              className="cine-logo-echo cine-logo-echo-ice"
              decoding="async"
              draggable={false}
            />
            <img
              src="/logo-title.jpg"
              alt=""
              className="cine-logo-echo cine-logo-echo-gold"
              decoding="async"
              draggable={false}
            />
            <img
              ref={logoRef}
              src="/logo-title.jpg"
              alt="仮面ライダーサーガ Kamen Rider SA-GA Deception World"
              className="cine-logo-core"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
            <div className="cine-logo-shine" />
            <span className="cine-logo-frame" aria-hidden="true" />
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
    </section>
  );
}
