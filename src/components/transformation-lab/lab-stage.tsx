import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LAB_NAMES,
  LAB_FORMS,
  type LabRider,
  type LabZoom,
} from "@/lib/transformation-lab-state.js";
import { loadLabConfig } from "@/lib/transformation-lab-engine";

// Capture the rendered layers only when a selection changes. The retained frame
// shares the normal viewport transform, including a newly selected camera zoom.
function retainFrame(runway: HTMLElement, target: HTMLCanvasElement) {
  const frame = runway.querySelector<HTMLCanvasElement>(".rzn-canvas");
  if (!frame?.width || !frame.height) return false;
  const bounds = frame.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;
  target.width = frame.width;
  target.height = frame.height;
  const context = target.getContext("2d");
  if (!context) return false;
  const scaleX = frame.width / bounds.width;
  const scaleY = frame.height / bounds.height;
  for (const layer of runway.querySelectorAll<HTMLCanvasElement>(".lab-viewport canvas")) {
    if (layer === target || !layer.width || !layer.height) continue;
    const style = getComputedStyle(layer);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = layer.getBoundingClientRect();
    const parentOpacity = layer.parentElement?.classList.contains("is-skin")
      ? Number(getComputedStyle(layer.parentElement).opacity) : 1;
    context.globalAlpha = Number(style.opacity) * parentOpacity;
    context.drawImage(
      layer,
      (box.x - bounds.x) * scaleX,
      (box.y - bounds.y) * scaleY,
      box.width * scaleX,
      box.height * scaleY,
    );
  }
  return true;
}

export function LabStage({
  rider,
  form,
  progress,
  zoom,
  comparing,
  onReady,
}: {
  rider: LabRider;
  form: string;
  progress: number;
  zoom: LabZoom;
  comparing: boolean;
  onReady: (ready: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const playhead = useRef(progress);
  const retained = useRef<HTMLCanvasElement>(null);
  const retainedLabel = useRef("");
  const title = useRef<HTMLHeadingElement>(null);
  const readyCallback = useRef(onReady);
  const sharedFormClock = comparing && rider === "far-from";
  const [brokenImage, setBrokenImage] = useState("");
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const formLabel = LAB_FORMS[rider].find(([key]) => key === form)?.[1];
  const needsForm = form !== "standard" && progress > 0.915;
  useLayoutEffect(() => {
    const runway = host.current;
    const canvas = retained.current;
    return () => {
      if (!runway || !canvas || runway.dataset.rznLoad !== "ready" || !runway.dataset.rznDrawnAt)
        return;
      if (needsForm && runway.dataset.rznFormLoad !== "ready") return;
      if (retainFrame(runway, canvas)) {
        const percent = Math.round(Number(runway.dataset.rznDrawnAt) * 100);
        retainedLabel.current = `${LAB_NAMES[rider]}・${formLabel}（${percent}%）`;
      }
    };
  }, [rider, formLabel, attempt, needsForm, sharedFormClock]);
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
    let dropSurge: (() => void) | undefined;
    readyCallback.current(false);
    setStatus("loading");
    setFallback({});
    delete runway.dataset.rznLoad;
    delete runway.dataset.rznDrawnAt;
    delete runway.dataset.rznFormLoad;
    const sync = () => {
      const base = runway.dataset.rznLoad || "loading";
      const formLoading =
        runway.dataset.form !== "standard" && playhead.current > 0.915
          ? runway.dataset.rznFormLoad || "loading"
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
          // A comparison samples the chosen form directly. Far From's single-view
          // form-change movie has its own clock and would run ahead of the other side.
          formShift: sharedFormClock ? undefined : config.formShift,
          progress: () => playhead.current,
          directProgress: true,
          eager: true,
          prewarm: true,
        });
        runway.dispatchEvent(new Event("rexonance:assembly-wake"));
        sync();
        // Rexonance's own layer over its scene (owner, 2026-11-11: the lab
        // plays the suit-up as /rexonance-saga does — the liquid skin's
        // front, the cells it takes in, the retract): the page's surge
        // layer itself, on this stage, on the lab's playhead. Its chunk is
        // fetched here, for this rider only; it fetches the skin's chunk and
        // field in turn once the scene is live. If it never arrives the
        // scene plays as it did.
        if (rider !== "rexonance") return;
        void import("@/components/rexonance-saga/rexonance-suit-surge").then(
          (layer) => {
            if (cancelled) return;
            dropSurge = layer.mountScrollSurge(runway, {
              box: runway.querySelector<HTMLElement>(".lab-viewport"),
              progress: () => playhead.current,
            });
          },
          () => undefined,
        );
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
      // (Its layer first: it hands the scene's canvases back as they were.)
      dropSurge?.();
      dispose?.();
      readyCallback.current(false);
    };
  }, [rider, attempt, sharedFormClock]);
  const retry = () => {
    title.current?.focus({ preventScroll: true });
    setBrokenImage("");
    setAttempt((value) => value + 1);
  };
  const isPending = status !== "ready" && status !== "static";
  const showHeld = isPending && Boolean(retainedLabel.current);
  const staticSrc = fallback[form] || fallback.standard;
  const showArt = !showHeld && (status === "static" || status === "error") &&
    Boolean(staticSrc) && brokenImage !== staticSrc;
  // Rexonance's surge layer draws on canvases of its own round the scene's.
  const surge = rider === "rexonance";
  return (
    <section className="lab-stage" data-rider={rider} data-fallback={showArt || undefined} aria-label={`${LAB_NAMES[rider]}の変身`}>
      <h2 ref={title} tabIndex={-1}>
        {LAB_NAMES[rider]}
        <span className="lab-form-name">{formLabel}</span>
      </h2>
      <div ref={host} className="lab-engine" data-form={form} data-zoom={zoom}>
        <div className="rzn-frame">
          <div className="lab-viewport">
            {showArt && (
              <img
                className="lab-static"
                src={staticSrc}
                onError={() => setBrokenImage(staticSrc)}
                alt={`${LAB_NAMES[rider]}・${formLabel}の完成形`}
              />
            )}
            {surge && (
              <canvas className="rzn-surge is-back" aria-hidden="true" width={0} height={0} />
            )}
            <canvas
              className="rzn-canvas"
              aria-label={`${LAB_NAMES[rider]}の変身、${Math.round(progress * 100)}%`}
              aria-hidden={status !== "ready" || undefined}
              role="img"
            />
            {surge && (
              <>
                <i className="rzn-surge is-skin" aria-hidden="true">
                  <canvas width={0} height={0} />
                </i>
                <canvas className="rzn-surge is-front" aria-hidden="true" width={0} height={0} />
              </>
            )}
            <canvas
              ref={retained}
              className="lab-retained"
              hidden={!showHeld}
              role="img"
              aria-label={`直前の描画：${retainedLabel.current}`}
            />
          </div>
        </div>
        {zoom !== "full" && (
          <div className="lab-optical-calipers" data-target={zoom} aria-hidden="true">
            <i className="lab-caliper is-tl" />
            <i className="lab-caliper is-tr" />
            <i className="lab-caliper is-bl" />
            <i className="lab-caliper is-br" />
          </div>
        )}
      </div>
      {status !== "ready" && (
        <div className="lab-stage-status" role="status">
          {showHeld && <span>直前の描画：{retainedLabel.current}</span>}
          {status === "error" || (status === "static" && brokenImage && brokenImage === staticSrc) ? (
            <>
              変身素材を読み込めませんでした。{showArt && "完成形を表示しています。"}
              <button onClick={retry}>再読み込み</button>
            </>
          ) : status === "static" ? (
            "動きを抑える設定のため完成形を表示しています。"
          ) : (
            "変身素材を準備中…"
          )}
        </div>
      )}
    </section>
  );
}
