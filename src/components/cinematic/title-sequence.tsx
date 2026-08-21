import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { createCinematicScore } from "@/lib/cinematic-audio";
import { WORLD_ENTER_ASSETS, preloadAssets } from "@/lib/asset-loader";
import { useLoadGate } from "@/components/load-gate";
import { Particles } from "./particles";

const SEQUENCE_MS = 6600;
const WORLD_DIVE_MS = 720;

type SequencePhase = "idle" | "playing" | "complete" | "diving";

function HudRings() {
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
    <svg className="cine-hud" viewBox="0 0 200 200" aria-hidden="true">
      <g fill="none" stroke="currentColor" className="text-ice/80" strokeWidth="0.35">
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
      </g>
    </svg>
  );
}

export function TitleSequence() {
  const [phase, setPhase] = useState<SequencePhase>("idle");
  const [muted, setMuted] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const scoreRef = useRef<ReturnType<typeof createCinematicScore> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const phaseRef = useRef(phase);
  const { go } = useLoadGate();
  const router = useRouter();
  phaseRef.current = phase;

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
      return;
    }
    const timer = window.setTimeout(() => {
      void Promise.all([
        preloadAssets(WORLD_ENTER_ASSETS, () => undefined),
        router.preloadRoute({ to: "/world" }).catch(() => undefined),
      ]);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    return () => {
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
      void video.play().catch(() => undefined);
    }
  }, []);

  const finish = useCallback(() => {
    phaseRef.current = "complete";
    setPhase("complete");
    scoreRef.current?.stop();
    scoreRef.current = null;
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

    phaseRef.current = "diving";
    setPhase("diving");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      await Promise.all([
        preloadAssets(WORLD_ENTER_ASSETS, () => undefined),
        router.preloadRoute({ to: "/world" }).catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, reduced ? 180 : WORLD_DIVE_MS)),
      ]);
      await go({ to: "/world", assets: WORLD_ENTER_ASSETS });
    } catch {
      phaseRef.current = "complete";
      setPhase("complete");
    }
  }, [go, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const isInteractive = Boolean(target?.closest("button, a, input, textarea, select, [contenteditable='true']"));
      const isSkipKey = e.key === "Escape" || e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "s";
      if (phase === "playing" && isSkipKey && (!isInteractive || e.key === "Escape")) {
        e.preventDefault();
        skip();
      } else if (phase === "complete" && !isInteractive && e.key.toLowerCase() === "r") {
        replay();
      } else if (!isInteractive && e.key.toLowerCase() === "m") {
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

  const stageClass =
    phase === "playing"
      ? "cine-stage is-playing"
      : phase === "complete"
        ? "cine-stage is-complete"
        : phase === "diving"
          ? "cine-stage is-complete is-diving"
        : "cine-stage";

  return (
    <section
      className={stageClass}
      onPointerDown={phase === "playing" ? unlockAudio : undefined}
      role="region"
      aria-label="仮面ライダーサーガ Deception World オープニング"
      aria-busy={phase === "diving"}
    >
      <video
        key={`atm-${replayKey}`}
        ref={videoRef}
        className="cine-atmosphere"
        src="/atmosphere.mp4"
        poster="/atmosphere-poster.jpg"
        muted
        playsInline
        preload="metadata"
        loop
      />

      <div className="cine-light-field" aria-hidden="true" />
      <div className="cine-scanline" aria-hidden="true" />
      <div className="cine-flare" aria-hidden="true" />
      <HudRings />
      <Particles active={phase === "playing" || phase === "diving"} />

      <div className="cine-line" />

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
      <div className="cine-dive-tunnel" aria-hidden="true" />
      <div className="cine-dive-flash" aria-hidden="true" />
      {phase === "diving" ? (
        <div className="cine-dive-status" role="status" aria-live="polite">
          <small>WORLD LINK // DIVE</small>
          <span>境界を通過中</span>
        </div>
      ) : null}
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

      <div className="cine-always" aria-hidden={phase === "idle" || phase === "diving"}>
        <button
          type="button"
          className="cine-ghost inline-flex items-center gap-2"
          disabled={phase === "idle" || phase === "diving"}
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
