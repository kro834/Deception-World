/* FAR FROM SAGA — the nanite entry transition (2026-10-22).

   Mounted at the top of /far-from-saga. An overlay, not a wall: the hero
   is in the DOM and readable before, during and after it. On the first
   visit of a session, once the route's cover has settled, it fades in over
   the page and plays the suit-up scene (src/lib/far-from-assembly-scene.ts,
   the same scene the #suitup runway scrubs) on the clock of the seven
   transformation calls (src/lib/far-from-entry.ts: FAR_FROM_SAGA.calls,
   verbatim), then leaves. No fire phase: the nanites gather into the
   armour, the bits dock and the halo closes.

   Rules: prefers-reduced-motion, forced colours, Save-Data and the world's
   economy flag skip it (nothing renders, onRevealed fires at once); it
   plays once per session (sessionStorage; a reload later in the same
   session shows the page plain); it never gates the first paint (nothing
   renders until its chunk and picture are here, and past a deadline it is
   skipped); it is skippable (the button, Escape, or scrolling on). The
   loop is one requestAnimationFrame while it plays; a hidden tab ends it. */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import {
  FAR_FROM_ENTRY_BEATS,
  FAR_FROM_ENTRY_TIMINGS,
  farFromEntryBeat,
  farFromEntryProgress,
} from "@/lib/far-from-entry";
import { farFromSceneSource, loadFarFromScene } from "@/lib/far-from-assembly";
import type { FarFromScene } from "@/lib/far-from-assembly-scene";

export type FarFromEntryPhase = "idle" | "covering" | "revealing" | "revealed";

export type FarFromEntryTransitionProps = {
  /** The stage the hero shows; the overlay takes its accent. */
  stage?: "middle" | "high" | "xhigh" | "max" | "ultra";
  /** Called once when the reveal has finished (or immediately, when skipped). */
  onRevealed?: () => void;
};

/** One play per session. */
export const FAR_FROM_ENTRY_STORAGE_KEY = "ffs-entry-20261022";

type Loaded = Awaited<ReturnType<typeof loadFarFromScene>>;

const storage = {
  played(): boolean {
    try {
      return window.sessionStorage.getItem(FAR_FROM_ENTRY_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  },
  mark() {
    try {
      window.sessionStorage.setItem(FAR_FROM_ENTRY_STORAGE_KEY, "1");
    } catch {
      // Private mode or blocked storage: the entry simply plays again.
    }
  },
};

const motionAllowed = () => {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return !(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy" ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType ?? "")
  );
};

/** Resolves once html[data-route-cover] is gone (the load gate has
 * settled), or after `limit` ms. */
const whenUncovered = (limit: number) =>
  new Promise<void>((resolve) => {
    const root = document.documentElement;
    if (!root.dataset.routeCover) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (!root.dataset.routeCover) finish();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-route-cover"] });
    const timer = window.setTimeout(finish, limit);
  });

export function FarFromEntryTransition({ stage = "middle", onRevealed }: FarFromEntryTransitionProps) {
  const [phase, setPhase] = useState<FarFromEntryPhase>("idle");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef<Loaded>(null);
  const revealedRef = useRef(onRevealed);
  revealedRef.current = onRevealed;
  const skipRef = useRef<() => void>(() => {});

  // Decide, then load: nothing renders until the scene is here.
  useEffect(() => {
    let cancelled = false;
    if (!motionAllowed() || storage.played()) {
      setPhase("revealed");
      revealedRef.current?.();
      return;
    }
    const src = farFromSceneSource(window.innerHeight, Math.min(1.5, window.devicePixelRatio || 1));
    const loading = loadFarFromScene(src, window, FAR_FROM_ENTRY_TIMINGS.deadline);
    Promise.all([loading, whenUncovered(FAR_FROM_ENTRY_TIMINGS.gate)]).then(([loaded]) => {
      if (cancelled) return;
      if (!loaded || !motionAllowed() || document.visibilityState === "hidden") {
        setPhase("revealed");
        revealedRef.current?.();
        return;
      }
      loadedRef.current = loaded;
      storage.mark();
      setPhase("covering");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Play: the scene on the calls' clock, then leave.
  useEffect(() => {
    if (phase !== "covering") return;
    const host = hostRef.current;
    const loaded = loadedRef.current;
    const stageBox = host?.querySelector<HTMLElement>(".ffs-entry-stage");
    const canvas = host?.querySelector<HTMLCanvasElement>("canvas.ffs-canvas");
    if (!host || !loaded || !stageBox || !canvas) {
      setPhase("revealed");
      revealedRef.current?.();
      return;
    }
    let scene: FarFromScene | null = null;
    try {
      scene = loaded.module.createFarFromScene({
        stage: stageBox,
        canvas,
        image: loaded.image,
        coarse: window.matchMedia("(pointer: coarse)").matches,
      });
    } catch {
      scene = null;
    }
    if (!scene) {
      setPhase("revealed");
      revealedRef.current?.();
      return;
    }
    const live = scene;
    let frame = 0;
    let ended = false;
    let leaveTimer = 0;
    let beat = -2;
    let unit = -1;
    let width = 0;
    let height = 0;
    const started = performance.now() + FAR_FROM_ENTRY_TIMINGS.cover * 0.5;
    const resize = () => {
      const w = stageBox.clientWidth;
      const h = stageBox.clientHeight;
      if (w === width && h === height) return;
      width = w;
      height = h;
      live.resize(w, h, window.devicePixelRatio || 1);
    };
    const leave = () => {
      if (ended) return;
      ended = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      setPhase("revealing");
      leaveTimer = window.setTimeout(() => {
        setPhase("revealed");
        revealedRef.current?.();
      }, FAR_FROM_ENTRY_TIMINGS.reveal);
    };
    skipRef.current = leave;
    const tick = (now: number) => {
      frame = 0;
      if (ended) return;
      resize();
      const ms = now - started;
      const p = farFromEntryProgress(ms);
      const at = farFromEntryBeat(ms);
      if (at.index !== beat) {
        beat = at.index;
        host.dataset.beat = String(beat);
      }
      if (at.unit !== unit) {
        unit = at.unit;
        host.dataset.unit = String(unit);
      }
      live.render(p);
      if (ms >= FAR_FROM_ENTRY_TIMINGS.total + FAR_FROM_ENTRY_TIMINGS.hold) {
        leave();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave();
    };
    const onIntent = () => leave();
    const onHidden = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onIntent, { passive: true });
    window.addEventListener("touchmove", onIntent, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    resize();
    frame = window.requestAnimationFrame(tick);
    return () => {
      ended = true;
      skipRef.current = () => {};
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(leaveTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onIntent);
      window.removeEventListener("touchmove", onIntent);
      document.removeEventListener("visibilitychange", onHidden);
      live.release();
    };
    // The scene is made once, on entering "covering"; "revealing" keeps
    // the finished frame on the canvas while the overlay fades.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "covering"]);

  const skip = useCallback(() => skipRef.current(), []);

  if (phase === "idle" || phase === "revealed") return null;
  const accent = FAR_FROM_SAGA.stages[stage]?.accent ?? FAR_FROM_SAGA.stages.middle.accent;
  return (
    <div
      ref={hostRef}
      className="ffs-entry"
      data-phase={phase}
      data-beat="-1"
      data-unit="0"
      style={
        {
          "--ffs-entry-accent": accent,
          "--ffs-entry-cover": `${FAR_FROM_ENTRY_TIMINGS.cover}ms`,
          "--ffs-entry-reveal": `${FAR_FROM_ENTRY_TIMINGS.reveal}ms`,
          "--ffs-entry-total": `${FAR_FROM_ENTRY_TIMINGS.total + FAR_FROM_ENTRY_TIMINGS.hold}ms`,
        } as CSSProperties
      }
    >
      <div className="ffs-entry-scene" aria-hidden="true">
        <i className="ffs-entry-ground" />
        <div className="ffs-entry-stage">
          <i className="ffs-stage-light" />
          <i className="ffs-stage-floor" />
          <canvas className="ffs-canvas" width={0} height={0} />
        </div>
        <p className="ffs-entry-caption">
          <span>FAR FROM SAGA</span>
          <span>TRANSFORMATION</span>
        </p>
        <ol className="ffs-entry-calls">
          {FAR_FROM_ENTRY_BEATS.map((beat, index) => (
            <li key={`${index}-${beat.call}`} className="ffs-entry-call" data-call={beat.call}>
              {beat.units.map((text, unitIndex) => (
                <span key={`${unitIndex}-${text}`} className="ffs-entry-unit">
                  {text}
                </span>
              ))}
            </li>
          ))}
        </ol>
        <p className="ffs-entry-meter">
          <i />
        </p>
      </div>
      <button type="button" className="ffs-entry-skip" onClick={skip}>
        スキップ
      </button>
    </div>
  );
}
