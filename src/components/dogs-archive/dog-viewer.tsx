import { useEffect, useRef, useState } from "react";
import type { GuardianPose, GuardianScene, GuardianStatus } from "@/lib/dogs-archive/scene.ts";
import { guardianPoseChooserVisible } from "@/lib/dogs-archive/poses.ts";
import { parseGuardianLook } from "@/lib/dogs-archive/look.ts";
import {
  isGuardianSceneBlocked,
  watchGuardianSceneVisibility,
} from "@/lib/dogs-archive/visibility.ts";

export type DogViewerProps = {
  active: boolean;
  /** Load the model at once. Without it the still stands until the visitor
   * touches the stage or one of its controls: the model, its decoder and the
   * scene's code are over 6 MB, and a visit that only passes through should
   * not pay for them. */
  eager?: boolean;
  onStatus?: (status: GuardianStatus) => void;
  className?: string;
};

export function DogViewer({ active, eager = false, onStatus, className = "" }: DogViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GuardianScene | null>(null);
  const statusCallback = useRef(onStatus);
  statusCallback.current = onStatus;
  const [touched, setTouched] = useState(false);
  const wanted = eager || touched;
  // 炎を吐く asked of the still: the model loads, then breathes.
  const breatheWhenReady = useRef(false);
  const [status, setStatus] = useState<GuardianStatus | "idle">(wanted ? "loading" : "idle");
  const [action, setAction] = useState(false);
  const [paused, setPaused] = useState(false);
  const [poses, setPoses] = useState<GuardianPose[]>([]);
  const [pose, setPose] = useState("Rest");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || !wanted || !host.current) return;
    let cancelled = false;
    let visible = false,
      pending = false,
      failed = false;
    setStatus("loading");
    setAction(false);
    setPaused(false);
    setPoses([]);
    const report = (next: GuardianStatus) => {
      if (cancelled) return;
      setStatus(next);
      if (next === "ready" && runtime.current) {
        setPoses(runtime.current.listPoses());
        setPose(runtime.current.getPose());
        if (breatheWhenReady.current) runtime.current.breathe();
        breatheWhenReady.current = false;
      }
      statusCallback.current?.(next);
    };
    const allowed = () => !cancelled && visible && !isGuardianSceneBlocked(document);
    const sync = () => {
      if (cancelled) return;
      if (runtime.current) {
        runtime.current.setBlocked(!allowed());
        return;
      }
      if (!allowed() || pending || failed) return;
      pending = true;
      void import("@/lib/dogs-archive/scene.ts")
        .then(({ createGuardianScene }) => {
          if (!allowed() || !host.current) return;
          runtime.current = createGuardianScene(host.current, {
            modelUrl: "/dogs-archive-20261029/guardian-v3.glb",
            manifestUrl: "/dogs-archive-20261029/model-manifest.json",
            lightingProfile: "sculpture",
            look: parseGuardianLook(window.location.search),
            onStatus: report,
            onActionChange: (next) => {
              if (!cancelled) {
                setAction(next);
                if (next) setPaused(false);
              }
            },
            onPoseChange: (next) => {
              if (!cancelled) {
                setPose(next);
                setPaused(false);
              }
            },
          });
          runtime.current.setBlocked(!allowed());
        })
        .catch((error) => {
          if (cancelled) return;
          failed = true;
          console.error("Guardian WebGL initialization failed", error);
          report("error");
        })
        .finally(() => {
          pending = false;
          if (!cancelled && !failed && !runtime.current && allowed()) sync();
        });
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(host.current);
    const stopVisibility = watchGuardianSceneVisibility(sync, document);
    return () => {
      cancelled = true;
      intersection.disconnect();
      stopVisibility();
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [active, attempt, wanted]);

  return (
    <div
      className={`dogs-viewer ${status === "ready" ? "is-ready" : ""} ${className}`}
      data-viewer-status={status}
      onPointerDown={wanted ? undefined : () => setTouched(true)}
    >
      <div className="dogs-viewer__surface" ref={host} />
      <div className="dogs-viewer__fallback" aria-hidden={status === "ready"}>
        <img
          src="/dogs-archive-20261028/guardian-480.webp"
          srcSet="/dogs-archive-20261028/guardian-480.webp 480w, /dogs-archive-20261028/guardian-920.webp 920w"
          sizes="min(100vw, 72dvh), 100vw"
          width={920}
          height={1280}
          decoding="async"
          alt=""
          draggable={false}
        />
        <div className="dogs-viewer__loading" role="status">
          {status === "error" ? (
            <>
              <span>立体模型を読み込めませんでした</span>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                再読み込み
              </button>
            </>
          ) : status === "idle" ? null : (
            <span>立体模型を読み込み中</span>
          )}
        </div>
      </div>
      <div
        className={`dogs-viewer__toolbar ${action ? "is-breathing" : ""}`}
        aria-label="立体模型の操作"
        data-breathing={action ? "true" : undefined}
      >
        <button
          className="dogs-viewer__breathe"
          type="button"
          disabled={(status !== "ready" && status !== "idle") || action}
          onClick={() => {
            if (runtime.current) runtime.current.breathe();
            else {
              breatheWhenReady.current = true;
              setTouched(true);
            }
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3c1 5-4 5-2 9 1-2 3-2 4-5 5 5 6 8 4 11-3 5-11 4-12-1-1-4 2-7 6-14Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          {action ? "吐炎中" : "炎を吐く"}
        </button>
        {guardianPoseChooserVisible(poses) ? (
          <select
            className="dogs-viewer__pose"
            aria-label="姿勢"
            value={pose}
            disabled={status !== "ready"}
            onChange={(event) => {
              const next = event.target.value;
              if (runtime.current?.setPose(next)) setPose(next);
            }}
          >
            {poses.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          disabled={status !== "ready"}
          onClick={() => runtime.current?.resetView()}
          aria-label="視点を戻す"
          title="視点を戻す"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 9a8 8 0 1 1-1 7M5 4v5h5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>視点を戻す</span>
        </button>
        <button
          type="button"
          disabled={status !== "ready"}
          aria-pressed={paused}
          onClick={() => setPaused(runtime.current?.togglePause() ?? false)}
          aria-label={paused ? "再開" : "一時停止"}
          title={paused ? "再開" : "一時停止"}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {paused ? (
              <path
                d="m9 5 11 7-11 7V5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M9 6v12M16 6v12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}
          </svg>
          <span>{paused ? "再開" : "一時停止"}</span>
        </button>
      </div>
      <span className="dogs-viewer__sr-only" aria-live="polite">
        {action
          ? "頭と顎を開き、森林緑の炎を吐いています"
          : status === "ready"
            ? "立体模型を表示しました"
            : ""}
      </span>
    </div>
  );
}
