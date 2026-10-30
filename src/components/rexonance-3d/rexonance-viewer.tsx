import { useEffect, useRef, useState } from "react";
import type {
  RexonanceScene,
  RexonanceStatus,
  RexonanceViewId,
} from "@/lib/rexonance-3d/scene.ts";
import {
  REXONANCE_DEFAULT_VIEW,
  REXONANCE_VIEWS,
  rexonanceView,
} from "@/lib/rexonance-3d/views.ts";
import {
  isGuardianSceneBlocked,
  watchGuardianSceneVisibility,
} from "@/lib/dogs-archive/visibility.ts";

export const REXONANCE_3D_POSTER = "/rexonance-3d-20261030/rexonance-3d-480.webp";

/** The four sheets the panel compares with (the owner's ten-view sheet, main views). */
export const REXONANCE_3D_SHEETS = [
  { id: "front-10", label: "正面", view: "front", alt: "レクソナンスサーガの設定画、正面" },
  { id: "right-07", label: "右側面", view: "right", alt: "レクソナンスサーガの設定画、右側面" },
  { id: "back-09", label: "背面", view: "back", alt: "レクソナンスサーガの設定画、背面" },
  { id: "left-08", label: "左側面", view: "left", alt: "レクソナンスサーガの設定画、左側面" },
] as const;
type SheetId = (typeof REXONANCE_3D_SHEETS)[number]["id"];

const STATUS_COPY: Record<RexonanceStatus, string> = {
  loading: "立体模型を読み込み中",
  ready: "立体模型を表示しました",
  error: "立体模型を読み込めませんでした",
};

export function RexonanceViewer({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<RexonanceScene | null>(null);
  const [status, setStatus] = useState<RexonanceStatus>("loading");
  const [progress, setProgress] = useState<number | null>(null);
  const [view, setView] = useState<RexonanceViewId | null>(REXONANCE_DEFAULT_VIEW);
  const [autoRotate, setAutoRotate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetId>("front-10");
  const [attempt, setAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;
    let visible = false;
    let pending = false;
    let failed = false;
    setStatus("loading");
    setProgress(null);
    setPaused(false);
    const allowed = () => !cancelled && visible && !isGuardianSceneBlocked(document);
    const sync = () => {
      if (cancelled) return;
      if (runtime.current) {
        runtime.current.setBlocked(!allowed());
        return;
      }
      if (!allowed() || pending || failed) return;
      pending = true;
      void import("@/lib/rexonance-3d/scene.ts")
        .then(({ createRexonanceScene }) => {
          if (!allowed() || !host.current) return;
          runtime.current = createRexonanceScene(host.current, {
            onStatus: (next) => {
              if (cancelled) return;
              setStatus(next);
              if (next === "ready") setAnnouncement(STATUS_COPY.ready);
              if (next === "error") failed = true;
            },
            onProgress: (fraction) => !cancelled && setProgress(fraction),
            onAutoRotateChange: (on) => !cancelled && setAutoRotate(on),
            onViewChange: (next) => {
              if (cancelled) return;
              setView(next);
              if (next) {
                const sheetFor = rexonanceView(next).reference as SheetId;
                if (next !== "oblique") setSheet(sheetFor);
              }
            },
          });
          runtime.current.setBlocked(!allowed());
        })
        .catch((error) => {
          if (cancelled) return;
          failed = true;
          console.error("Rexonance WebGL initialization failed", error);
          setStatus("error");
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
  }, [attempt]);

  const ready = status === "ready";
  const chooseView = (next: RexonanceViewId) => {
    runtime.current?.setView(next);
    setAnnouncement(`${rexonanceView(next).label}から表示`);
  };
  const chooseSheet = (next: (typeof REXONANCE_3D_SHEETS)[number]) => {
    setSheet(next.id);
    if (ready) chooseView(next.view);
  };
  const activeSheet = REXONANCE_3D_SHEETS.find((item) => item.id === sheet)!;

  return (
    <div
      className={`rx3d-viewer ${ready ? "is-ready" : ""} ${className}`}
      data-viewer-status={status}
      data-reference-open={referenceOpen ? "true" : "false"}
    >
      <div className="rx3d-viewer__area">
        <div className="rx3d-viewer__surface" ref={host} />
        <div className="rx3d-viewer__fallback" aria-hidden={ready}>
          <img src={REXONANCE_3D_POSTER} alt="" width={480} height={720} draggable={false} />
          <div className="rx3d-viewer__loading" role="status">
            {status === "error" ? (
              <>
                <span>{STATUS_COPY.error}</span>
                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                  再読み込み
                </button>
              </>
            ) : (
              <span>
                {STATUS_COPY.loading}
                {progress !== null && progress < 1 ? (
                  <b aria-hidden="true">{` ${Math.round(progress * 100)}%`}</b>
                ) : null}
              </span>
            )}
          </div>
        </div>
        <div className="rx3d-viewer__toolbar">
          <div
            className="rx3d-viewer__views"
            id="rexonance-3d-views"
            role="group"
            aria-label="視点"
          >
            {REXONANCE_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-view={item.id}
                aria-pressed={view === item.id}
                disabled={!ready}
                onClick={() => chooseView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="rx3d-viewer__actions" role="group" aria-label="表示">
            <button
              type="button"
              className="rx3d-viewer__rotate"
              aria-pressed={autoRotate}
              disabled={!ready}
              onClick={() => runtime.current?.setAutoRotate(!autoRotate)}
              title="自動回転"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v4h-4M6 21v-4h4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>自動回転</span>
            </button>
            <button
              type="button"
              aria-pressed={paused}
              disabled={!ready}
              onClick={() => {
                const next = !paused;
                setPaused(next);
                runtime.current?.setPaused(next);
              }}
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
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <span>{paused ? "再開" : "一時停止"}</span>
            </button>
            <button
              type="button"
              className="rx3d-viewer__sheet-toggle"
              aria-expanded={referenceOpen}
              aria-controls="rexonance-3d-reference"
              onClick={() => setReferenceOpen((open) => !open)}
              title="参照画像"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 5h7v14H4zM13 5h7v14h-7z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <span>参照画像</span>
            </button>
          </div>
        </div>
      </div>
      <aside
        className="rx3d-viewer__reference"
        id="rexonance-3d-reference"
        aria-labelledby="rexonance-3d-reference-title"
        hidden={!referenceOpen}
      >
        <header>
          <h3 id="rexonance-3d-reference-title">参照画像</h3>
          <button
            type="button"
            onClick={() => setReferenceOpen(false)}
            aria-label="参照画像を閉じる"
          >
            ×
          </button>
        </header>
        <div className="rx3d-viewer__sheets" role="group" aria-label="設定画の向き">
          {REXONANCE_3D_SHEETS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={sheet === item.id}
              onClick={() => chooseSheet(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {referenceOpen ? (
          <figure>
            <img
              src={`/rexonance-3d-20261030/reference/${activeSheet.id}.webp`}
              alt={activeSheet.alt}
              width={640}
              height={960}
              decoding="async"
            />
            <figcaption>設定画　{activeSheet.label}</figcaption>
          </figure>
        ) : null}
      </aside>
      <span className="rx3d-viewer__sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
