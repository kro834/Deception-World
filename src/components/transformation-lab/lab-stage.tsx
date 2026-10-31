import { useEffect, useRef, useState } from "react";
import {
  LAB_NAMES,
  LAB_FORMS,
  type LabRider,
  type LabZoom,
} from "@/lib/transformation-lab-state.js";
import { loadLabConfig } from "@/lib/transformation-lab-engine";

export function LabStage({
  rider,
  form,
  progress,
  zoom,
  onReady,
}: {
  rider: LabRider;
  form: string;
  progress: number;
  zoom: LabZoom;
  onReady: (ready: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const playhead = useRef(progress);
  const readyCallback = useRef(onReady);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  useEffect(() => {
    readyCallback.current = onReady;
  }, [onReady]);
  useEffect(() => {
    playhead.current = progress;
    host.current?.dispatchEvent(new Event("rexonance:assembly-frame"));
  }, [progress]);
  useEffect(() => {
    const runway = host.current;
    if (!runway) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    readyCallback.current(false);
    setStatus("loading");
    setFallback({});
    delete runway.dataset.rznDrawnAt;
    delete runway.dataset.rznFormLoad;
    const sync = () => {
      const base = runway.dataset.rznLoad || "loading";
      const formLoading =
        runway.dataset.form !== "standard" && playhead.current > 0.915
          ? runway.dataset.rznFormLoad
          : null;
      const state =
        base === "ready" && (!runway.dataset.rznDrawnAt || formLoading === "loading")
          ? "loading"
          : base === "ready" && formLoading === "error"
            ? "error"
            : base;
      setStatus(state);
      readyCallback.current(state === "ready");
    };
    const observer = new MutationObserver(sync);
    observer.observe(runway, {
      attributes: true,
      attributeFilter: ["data-rzn-load", "data-rzn-form-load", "data-rzn-drawn-at", "data-form"],
    });
    void Promise.all([loadLabConfig(rider), import("@/lib/rexonance-resonance.js")])
      .then(([config, engine]) => {
        if (cancelled) return;
        const figures: Record<string, string> = { standard: config.figure };
        for (const [key, value] of Object.entries(config.forms || {}))
          if (typeof value === "string") figures[key] = value;
        setFallback(figures);
        dispose = engine.mountRexonanceAssembly(runway, {
          ...config,
          progress: () => playhead.current,
          directProgress: true,
          eager: true,
          prewarm: true,
        });
        runway.dispatchEvent(new Event("rexonance:assembly-wake"));
        sync();
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          readyCallback.current(false);
        }
      });
    return () => {
      cancelled = true;
      observer.disconnect();
      dispose?.();
      readyCallback.current(false);
    };
  }, [rider, attempt]);
  const retry = () => setAttempt((value) => value + 1);
  return (
    <section className="lab-stage" aria-label={`${LAB_NAMES[rider]}の変身`}>
      <h2>
        {LAB_NAMES[rider]}
        <span className="lab-form-name">{LAB_FORMS[rider].find(([key]) => key === form)?.[1]}</span>
      </h2>
      <div ref={host} className="lab-engine" data-form={form} data-zoom={zoom}>
        <div className="rzn-frame">
          <div className="lab-viewport">
            {status === "static" && fallback.standard && (
              <img
                className="lab-static"
                src={fallback[form] || fallback.standard}
                alt={`${LAB_NAMES[rider]}の完成形`}
              />
            )}
            <canvas
              className="rzn-canvas"
              aria-label={`${LAB_NAMES[rider]}の変身、${Math.round(progress * 100)}%`}
              role="img"
            />
          </div>
        </div>
      </div>
      {status !== "ready" && (
        <div className="lab-stage-status" role="status">
          {status === "error" ? (
            <>
              変身素材を読み込めませんでした。<button onClick={retry}>再読み込み</button>
            </>
          ) : status === "static" ? (
            "動きを抑える設定のため完成形を表示しています。"
          ) : (
            <>
              変身素材を準備中…<button onClick={retry}>再試行</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
