import { useEffect, useId, useRef, type RefObject } from "react";
import { importWithRetry } from "@/lib/chunk-retry.js";

/* The auto transformation movie's control (owner, 2026-10-23: 「自動変身
   ムービーも速度調整機能付きでつけて。レクソナンスにもこの機能は実装。」),
   beside the scroll suit-up's runway on /rexonance-saga (the ZENITH runway)
   and /far-from-saga (#suitup, the cyber HUD): 再生／一時停止, 最初から, the
   speed (0.5× … 2×, a radio group) and the seek. The markup is the same on
   both pages; each page's sheet draws it in its own HUD's grammar
   (styles-rexonance-zenith.css, styles-far-from-suitup.css).

   The control stands outside the runway (the runway is aria-hidden: its
   canvas and figure layers are pictures, their script is in the Guide),
   fixed over the viewport and shown while the runway's frame is pinned, so
   it is on the sticky frame throughout the movie. It never stands over the
   figure's body (owner, 2026-10-23: 「速度調整インターフェースが全身にかぶら
   ない様にスマホでは展開式にして、iPadなどでは工夫して」): wide screens dock
   the whole sheet in the column beside the figure; phones, tablets and short
   windows keep a small pill (再生／一時停止 with a progress ring, and the
   speed) in a corner and open the sheet on a tap — over the HUD's top on
   phones, beside the figure on tablets — closing it after a choice, a few
   seconds idle, or a scroll (src/styles-assembly-movie.css has the places;
   the controller measures the figure's box for the room beside it). The behaviour
   is src/lib/assembly-movie.ts, imported once the page is idle — never on
   the startup path — or at once when the runway comes near or the reader
   reaches for the control, and it drives the page's scroll, so the engine
   draws the movie's frames exactly as it draws a scroll's. The import is
   retried with a backoff (src/lib/chunk-retry.js), then again on every
   approach and when the network comes back (owner, 2026-10-23: 「自動変身
   再生が必ず読み込まれ、正常に動作する様にして。」); until the controller is
   here the control is not shown (the sheet shows it from data-shown, which
   only the controller sets), so there is never a dead control on screen —
   and if its retries run out, the control shows over the pinned frame
   reading 再読み込み, whose press reloads the page (never absent, never
   dead).
   The still tiers (reduced motion, forced colours, economy, Save-Data)
   have no sequence to play and hide the control (data-tier="still", and
   the sheet's own rules before the controller arrives). */

/** How far ahead of the runway (of the window's height) the controller's
 * chunk is fetched without waiting for idle time. */
export const ASSEMBLY_MOVIE_PRELOAD_MARGIN = "150% 0px 150% 0px";
/** After the import's retries run out, it is tried again this much later
 * (ms), for as long as the page is open. */
export const ASSEMBLY_MOVIE_RETRY_LATER_MS = 20000;
/** The controller's show rule and its 再読み込み, for the control before it
 * arrives (assembly-movie.ts MOVIE_SHOW_AT, MOVIE_PLAY_LABELS.retry: that
 * chunk is the one that could not be loaded). */
export const ASSEMBLY_MOVIE_SHOW_AT = 0.6;
export const ASSEMBLY_MOVIE_RELOAD_LABEL = "再読み込み";

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
  site: "rexonance" | "far-from" | "illusionculum" | "meta-unitas";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const control = ref.current;
    const runway = runwayRef.current;
    if (!control || !runway) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    let loading = false;
    let idleId = 0;
    let timer = 0;
    const cancelIdle = () => {
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timer) window.clearTimeout(timer);
      idleId = timer = 0;
    };
    // The controller could not be loaded (its retries ran out): the control
    // is not left absent — over the pinned frame (as the controller shows
    // it) it reads 再読み込み, and a press reloads the page (a chunk whose
    // fetch failed stays failed for this document; the router keeps the
    // reading position). The import is still retried; once the controller
    // mounts it takes the control over.
    let fallback: (() => void) | null = null;
    const showFallback = () => {
      const frame = runway.querySelector<HTMLElement>(".rzn-frame");
      if (fallback || !frame || typeof IntersectionObserver !== "function") return;
      const buttons = [...control.querySelectorAll<HTMLButtonElement>("button")];
      const actions = buttons.filter((button) => /rzn-movie-(play|mini)/.test(button.className));
      const seek = control.querySelector<HTMLInputElement>(".rzn-movie-seek input");
      const reload = () => window.location.reload();
      const observer = new IntersectionObserver(
        ([entry]) => {
          const box = entry.boundingClientRect;
          const room = Math.min(box.height, entry.rootBounds?.height ?? box.height);
          const pinned =
            entry.isIntersecting &&
            (room <= 0 || entry.intersectionRect.height / room >= ASSEMBLY_MOVIE_SHOW_AT);
          if (pinned && runway.dataset.rznLoad !== "static") control.dataset.shown = "true";
          else delete control.dataset.shown;
        },
        { threshold: Array.from({ length: 21 }, (_, k) => k / 20) },
      );
      const label = (text: string) => {
        for (const button of actions)
          if (button.classList.contains("rzn-movie-mini")) button.setAttribute("aria-label", text);
          else button.textContent = text;
      };
      control.dataset.state = "error";
      label(ASSEMBLY_MOVIE_RELOAD_LABEL);
      // Only 再読み込み is live: the rest needs the controller.
      for (const button of buttons) button.disabled = !actions.includes(button);
      if (seek) seek.disabled = true;
      for (const button of actions) button.addEventListener("click", reload);
      observer.observe(frame);
      fallback = () => {
        fallback = null;
        observer.disconnect();
        for (const button of actions) button.removeEventListener("click", reload);
        for (const button of buttons) button.disabled = true;
        label("再生");
        delete control.dataset.shown;
        control.dataset.state = "idle";
      };
    };
    const start = () => {
      cancelIdle();
      if (disposed || dispose || loading) return;
      loading = true;
      importWithRetry(() => import("@/lib/assembly-movie"), {
        isCancelled: () => disposed,
        onError: (error, attempt) =>
          console.warn(`[movie] the controller's chunk failed to load (try ${attempt})`, error),
      }).then(
        (module) => {
          loading = false;
          if (disposed || dispose) return;
          fallback?.();
          delete control.dataset.failed;
          try {
            dispose = module.mountAssemblyMovie(control, runway);
          } catch (error) {
            // (A controller that throws is no controller: 再読み込み, reported.)
            console.error("[movie] the controller could not be mounted", error);
            control.dataset.failed = "true";
            showFallback();
            return;
          }
          near?.disconnect();
        },
        (error) => {
          loading = false;
          if (disposed) return;
          // Never silent: reported, 再読み込み on the control, and tried again
          // on the next approach, the network coming back, or a while later.
          control.dataset.failed = "true";
          console.error("[movie] the controller could not be loaded", error);
          showFallback();
          timer = window.setTimeout(start, ASSEMBLY_MOVIE_RETRY_LATER_MS);
        },
      );
    };
    // After the page's first frames, never in them…
    if (typeof window.requestIdleCallback === "function")
      idleId = window.requestIdleCallback(start, { timeout: 2500 });
    else timer = window.setTimeout(start, 400);
    // …or at once when the runway comes near (a jump, a quick scroll).
    const near =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) start();
            },
            { rootMargin: ASSEMBLY_MOVIE_PRELOAD_MARGIN },
          )
        : null;
    near?.observe(runway);
    window.addEventListener("online", start);
    control.addEventListener("pointerenter", start);
    control.addEventListener("focusin", start);
    return () => {
      disposed = true;
      cancelIdle();
      near?.disconnect();
      window.removeEventListener("online", start);
      control.removeEventListener("pointerenter", start);
      control.removeEventListener("focusin", start);
      fallback?.();
      dispose?.();
      dispose = null;
    };
  }, [runwayRef]);
  const sheetId = useId();
  return (
    // The control is a fixed layer (styles-assembly-movie.css) holding two
    // surfaces: the sheet (the full control: 最初から, the speeds, the seek)
    // and, where the sheet would stand over the figure, the pill (再生／
    // 一時停止 with the progress ring, and the speed, which opens the sheet).
    <div
      ref={ref}
      className="rzn-movie"
      data-site={site}
      data-state="idle"
      role="group"
      aria-label="自動変身ムービー"
    >
      <div className="rzn-movie-pill">
        <button type="button" className="rzn-movie-mini" aria-label="再生" disabled />
        <button
          type="button"
          className="rzn-movie-toggle"
          aria-expanded="false"
          aria-controls={sheetId}
          aria-label={`速度 ${ASSEMBLY_MOVIE_DEFAULT_SPEED}× と操作`}
          disabled
        >
          <span className="rzn-movie-speed-now" aria-hidden="true">
            {ASSEMBLY_MOVIE_DEFAULT_SPEED}×
          </span>
          <span className="rzn-movie-chevron" aria-hidden="true" />
        </button>
      </div>
      <div className="rzn-movie-sheet" id={sheetId}>
        {/* The sheet's title (the group's own name is its aria-label); no
            English duplicate over it (owner, 2026-10-23). */}
        <p className="rzn-movie-kicker" aria-hidden="true">
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
                // Live with the controller, as the rest (a focused radio
                // shows the control: never one that does nothing).
                disabled
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
