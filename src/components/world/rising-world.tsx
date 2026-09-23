import { useCallback, useEffect, useRef, useState } from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock";
import {
  RISING_TIMING,
  RisingFire,
  risingFrameAt,
  selectRisingFireProfile,
} from "./rising-fire";

type RisingPhase = "dive" | "burn" | "title" | "rest";
type RisingMode = "webgl" | "css" | "still";

const WORLD_ART = "/deception-world-poster-delivery.webp";
const NEXT_ART = {
  compact: "/rider-rexonance-max-20260923-delivery-640.webp",
  wide: "/rider-rexonance-max-20260923-delivery-960.webp",
} as const;

function phaseAt(time: number): RisingPhase {
  if (time < RISING_TIMING.diveEnd) return "dive";
  if (time < RISING_TIMING.cut) return "burn";
  if (time < RISING_TIMING.controls) return "title";
  return "rest";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      void image
        .decode?.()
        .catch(() => undefined)
        .finally(() => resolve(image));
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * The gate after the footer: scrolling past the end of the record raises the
 * RISING THE WORLD button (scroll-driven, see styles-world-rising.css). The
 * button opens a modal sequence — a dive into the world, the world burning
 * in red flames and, mid-burn, EP7 REXONANCE. The canvas and its WebGL
 * context exist only while the dialog is open.
 */
export function RisingWorld() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<RisingPhase>("dive");
  const [mode, setMode] = useState<RisingMode>("webgl");

  const openSequence = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const economy = document.documentElement.dataset.worldEffects === "economy";
    setMode(reduced ? "still" : economy ? "css" : "webgl");
    setPhase(reduced ? "rest" : "dive");
    setOpen(true);
    setRun((value) => value + 1);
    dialog.showModal();
  }, []);

  const closeSequence = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Scroll lock for as long as the dialog is open.
  useEffect(() => {
    if (!open) return;
    const release = acquireViewportScrollLock();
    return release;
  }, [open]);

  // The timeline: WebGL when available, otherwise the CSS version.
  useEffect(() => {
    if (!open || mode === "still") return;
    let frame = 0;
    let fire: RisingFire | null = null;
    let cancelled = false;
    let startedAt = 0;
    let pausedAt = 0;
    let lastPhase: RisingPhase = "dive";

    const canvas = canvasRef.current;
    if (mode === "webgl" && canvas) {
      const profile = selectRisingFireProfile(window.innerWidth, window.innerHeight);
      fire = RisingFire.create(canvas, profile);
      if (!fire) {
        setMode("css");
        return;
      }
      const compact = window.matchMedia("(max-width: 760px), (any-pointer: coarse)").matches;
      void loadImage(WORLD_ART).then((image) => {
        if (!cancelled && image) fire?.setImage(0, image);
      });
      void loadImage(compact ? NEXT_ART.compact : NEXT_ART.wide).then((image) => {
        if (!cancelled && image) fire?.setImage(1, image);
      });
    }

    const tick = (now: number) => {
      frame = 0;
      if (!startedAt) startedAt = now;
      const time = (now - startedAt) / 1000;
      const nextPhase = phaseAt(time);
      if (nextPhase !== lastPhase) {
        lastPhase = nextPhase;
        setPhase(nextPhase);
      }
      fire?.render(risingFrameAt(Math.min(time, RISING_TIMING.end)));
      // The sequence settles on a still frame; nothing keeps drawing after it.
      if (time < RISING_TIMING.end) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        pausedAt = performance.now();
      } else if (pausedAt) {
        startedAt += performance.now() - pausedAt;
        pausedAt = 0;
        if (!frame) frame = window.requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const resize = canvas && fire ? new ResizeObserver(() => fire?.resize()) : null;
    if (canvas) resize?.observe(canvas);

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      resize?.disconnect();
      fire?.dispose();
    };
  }, [open, mode, run]);

  // Keyboard users land on CLOSE once it can be used.
  useEffect(() => {
    if (open && (phase === "rest" || mode === "still")) closeRef.current?.focus();
  }, [open, phase, mode]);

  return (
    <>
      <section className="rw-gate" aria-labelledby="rw-gate-label">
        <div className="rw-gate-glow" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rw-gate-rise">
          <span className="rw-gate-arrows" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <button
            ref={triggerRef}
            type="button"
            className="rw-gate-button"
            aria-haspopup="dialog"
            aria-controls="rising-world-dialog"
            aria-expanded={open}
            onClick={openSequence}
          >
            <span id="rw-gate-label">RISING THE WORLD</span>
            <i aria-hidden="true" />
          </button>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        id="rising-world-dialog"
        className="rw-dialog"
        aria-labelledby="rw-title"
        onClose={() => {
          setOpen(false);
          window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
        }}
      >
        {open ? (
          <div className="rw-stage" data-phase={phase} data-mode={mode} key={run}>
            {mode === "webgl" ? <canvas ref={canvasRef} className="rw-canvas" aria-hidden="true" /> : null}
            <div className="rw-css-fire" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="rw-dive-lines" aria-hidden="true">
              <i />
              <i />
            </div>
            <h2 id="rw-title" className="rw-title">
              <span className="rw-title-ep">EP7</span>
              <span className="rw-title-name">REXONANCE</span>
            </h2>
            <div className="rw-actions">
              <button
                type="button"
                className="rw-action"
                onClick={() => {
                  setPhase("dive");
                  setRun((value) => value + 1);
                }}
                hidden={mode === "still"}
              >
                REPLAY
              </button>
              <button ref={closeRef} type="button" className="rw-action rw-close" onClick={closeSequence}>
                CLOSE
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
