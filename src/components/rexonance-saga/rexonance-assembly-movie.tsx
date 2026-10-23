import { useEffect, useRef, type RefObject } from "react";

/* The auto transformation movie's control (owner, 2026-10-23: 「自動変身
   ムービーも速度調整機能付きでつけて。レクソナンスにもこの機能は実装。」),
   beside the scroll suit-up's runway on /rexonance-saga (the ZENITH runway)
   and /far-from-saga (#suitup, the cyber HUD): 再生／一時停止, 最初から, the
   speed (0.5× … 2×, a radio group) and the seek. The markup is the same on
   both pages; each page's sheet draws it in its own HUD's grammar
   (styles-rexonance-zenith.css, styles-far-from-suitup.css).

   The control stands outside the runway (the runway is aria-hidden: its
   canvas and figure layers are pictures, their script is in the Guide),
   fixed at the viewport's foot and shown while the runway's frame is
   pinned, so it is on the sticky frame throughout the movie. The behaviour
   is src/lib/assembly-movie.ts, imported once the page is idle — never on
   the startup path — and it drives the page's scroll, so the engine draws
   the movie's frames exactly as it draws a scroll's. The still tiers
   (reduced motion, forced colours, economy) have no sequence to play and
   hide the control (data-load="static", and the sheet's media query). */

/** The speeds offered, in the radio group's order (1× checked at first). */
export const ASSEMBLY_MOVIE_SPEEDS = Object.freeze([0.5, 1, 1.5, 2] as const);
export const ASSEMBLY_MOVIE_DEFAULT_SPEED = 1;
/** The scrubber's steps over the runway (assembly-movie.ts MOVIE_SEEK_STEPS). */
export const ASSEMBLY_MOVIE_SEEK_STEPS = 200;

export function AssemblyMovie({
  runwayRef,
  site,
}: {
  runwayRef: RefObject<HTMLDivElement | null>;
  /** The page, for its sheet. */
  site: "rexonance" | "far-from";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const control = ref.current;
    const runway = runwayRef.current;
    if (!control || !runway) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    let idleId = 0;
    let timer = 0;
    const start = () => {
      idleId = 0;
      timer = 0;
      if (disposed) return;
      void import("@/lib/assembly-movie").then((module) => {
        if (disposed) return;
        dispose = module.mountAssemblyMovie(control, runway);
      });
    };
    // After the page's first frames, never in them.
    if (typeof window.requestIdleCallback === "function")
      idleId = window.requestIdleCallback(start, { timeout: 2500 });
    else timer = window.setTimeout(start, 400);
    return () => {
      disposed = true;
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timer) window.clearTimeout(timer);
      dispose?.();
    };
  }, [runwayRef]);
  return (
    // The dock: on phones the control stands in the page while idle and the
    // dock keeps its height while the control is at the viewport's foot
    // (assembly-movie.ts measures it), so nothing moves when a movie starts.
    <div className="rzn-movie-dock">
      <div
        ref={ref}
        className="rzn-movie"
        data-site={site}
        data-state="idle"
        role="group"
        aria-label="自動変身ムービー"
      >
        <p className="rzn-movie-kicker" aria-hidden="true">
          <span lang="en">AUTO SUIT-UP</span>
          <span>自動変身ムービー</span>
        </p>
        <div className="rzn-movie-row">
          <button type="button" className="rzn-movie-play" disabled>
            再生
          </button>
          <button type="button" className="rzn-movie-restart" disabled>
            最初から
          </button>
          <div className="rzn-movie-speeds" role="radiogroup" aria-label="速度">
            {ASSEMBLY_MOVIE_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                role="radio"
                aria-checked={speed === ASSEMBLY_MOVIE_DEFAULT_SPEED}
                aria-label={`${speed}倍速`}
                tabIndex={speed === ASSEMBLY_MOVIE_DEFAULT_SPEED ? 0 : -1}
                data-speed={speed}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
        <label className="rzn-movie-seek">
          <span className="rzn-movie-sr">位置</span>
          <input
            type="range"
            min={0}
            max={ASSEMBLY_MOVIE_SEEK_STEPS}
            step={1}
            defaultValue={0}
            aria-valuetext="0%"
            disabled
          />
        </label>
      </div>
    </div>
  );
}
