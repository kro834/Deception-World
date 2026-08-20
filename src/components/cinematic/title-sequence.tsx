import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { createCinematicScore } from "@/lib/cinematic-audio";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { useLoadGate } from "@/components/load-gate";
import { Particles } from "./particles";

const SEQUENCE_MS = 7600;

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
  const [phase, setPhase] = useState<"idle" | "playing" | "complete">("idle");
  const [muted, setMuted] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const scoreRef = useRef<ReturnType<typeof createCinematicScore> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const phaseRef = useRef(phase);
  const { go } = useLoadGate();
  phaseRef.current = phase;

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
  }, []);

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
        : "cine-stage";

  return (
    <section
      className={stageClass}
      onPointerDown={phase === "playing" ? unlockAudio : undefined}
      role="img"
      aria-label="仮面ライダーサーガ Deception World オープニング"
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

      <HudRings />
      <Particles active={phase === "playing"} />

      <div className="cine-line" />

      <div className="cine-stack">
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
        </div>
      </div>

      <div className="cine-vignette" />
      <div className="cine-grain" />
      <div className="cine-letterbox top" />
      <div className="cine-letterbox bottom" />
      <div className="cine-progress" />

      <div className="cine-enter-hint">
        <p className="cine-pulse cine-kicker">Opening</p>
      </div>

      <button
        type="button"
        className="cine-ghost cine-skip"
        onClick={skip}
        aria-label="オープニングをスキップ"
        aria-keyshortcuts="Escape Enter Space S"
      >
        <SkipForward className="size-4" aria-hidden="true" />
        <span>スキップ</span>
        <kbd>ESC</kbd>
      </button>

      <div className="cine-always">
        <button
          type="button"
          className="cine-ghost inline-flex items-center gap-2"
          onClick={toggleMute}
          aria-label={muted ? "音声をオン" : "音声をオフ"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          <span className="hidden sm:inline">{muted ? "MUTE" : "SOUND"}</span>
        </button>
      </div>

      <div className="cine-chrome cine-replay-slot absolute inset-x-0 flex justify-center gap-3">
        <button
          type="button"
          className="cine-btn"
          onClick={() => void go({ to: "/world", assets: WORLD_ENTER_ASSETS, always: true })}
        >
          <span>ENTER THE WORLD</span>
        </button>
        <button type="button" className="cine-btn" onClick={replay}>
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="size-3.5" />
            もう一度
          </span>
        </button>
      </div>
    </section>
  );
}
