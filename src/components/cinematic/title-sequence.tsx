import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { createCinematicScore } from "@/lib/cinematic-audio";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { useLoadGate } from "@/components/load-gate";
import { Particles } from "./particles";

const SEQUENCE_MS = 12500;

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
  const { go } = useLoadGate();

  useEffect(() => {
    scoreRef.current = createCinematicScore();
    return () => scoreRef.current?.stop();
  }, [replayKey]);

  const begin = useCallback(() => {
    setPhase("playing");
    void scoreRef.current?.unlock();
    scoreRef.current?.start();
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPhase("complete");
      return;
    }
    const t = window.setTimeout(() => begin(), 750);
    return () => window.clearTimeout(t);
  }, [begin, replayKey]);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(() => setPhase("complete"), SEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const skip = useCallback(() => {
    setPhase("complete");
    const video = videoRef.current;
    if (video && video.duration) {
      video.currentTime = Math.max(0, video.duration - 0.05);
      void video.play().catch(() => undefined);
    }
  }, []);

  const replay = useCallback(() => {
    scoreRef.current?.stop();
    setPhase("idle");
    setReplayKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (phase === "playing") skip();
        else if (phase === "complete") replay();
      } else if (e.key === "r" || e.key === "R") {
        replay();
      } else if (e.key === "m" || e.key === "M") {
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
    void scoreRef.current?.unlock();
    setMuted((m) => {
      const next = !m;
      scoreRef.current?.setMuted(next);
      return next;
    });
  };

  const unlockAudio = () => {
    void scoreRef.current?.unlock();
    if (phase === "playing" && !scoreRef.current?.muted()) {
      scoreRef.current?.start();
    }
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
      onPointerDown={unlockAudio}
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
        preload="auto"
        loop
      />
      <HudRings />
      <Particles active={phase !== "idle"} />
      <div className="cine-line" />
      <div className="cine-stack">
        <div className="cine-logo-wrap">
          <img src="/logo-title.jpg" alt="" className="cine-logo-glow" draggable={false} />
          <img
            src="/logo-title.jpg"
            alt="仮面ライダーサーガ Kamen Rider SA-GA Deception World"
            className="cine-logo-core"
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
      <button type="button" className="cine-ghost cine-skip" onClick={skip}>
        スキップ
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
