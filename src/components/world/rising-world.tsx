import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { rexonanceImage } from "@/lib/rexonance-images";
import type { RisingRun, RisingStats } from "./rising-sequence";

// The key visual is already cached by the finale backdrop. The rider is the
// standard Rexonance artwork (gold on dark reads under red), 640w candidate.
const WORLD_ART = "/deception-world-poster-delivery.webp";
const RIDER_ART =
  rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet?.split(",")[0]?.trim().split(" ")[0] ??
  REXONANCE_SITE_ARTWORK.standard;

type Engine = typeof import("./rising-sequence");
let engine: Promise<Engine> | null = null;
let engineModule: Engine | null = null;
const loadEngine = () => {
  engine ??= import("./rising-sequence").then(
    (module) => {
      engineModule = module;
      return module;
    },
    (error: unknown) => {
      engine = null;
      throw error;
    },
  );
  return engine;
};
const prewarm = () => {
  void loadEngine()
    .then((module) => module.prepareRising(WORLD_ART, RIDER_ART))
    .catch(() => undefined);
};

type RisingTestHook = {
  readonly run: RisingRun | null;
  readonly stats: RisingStats | null;
  seek: (T: number) => void;
};

declare global {
  interface Window {
    __risingTest?: RisingTestHook;
    __risingStats?: RisingStats;
  }
}

const auditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rising-audit");

/**
 * The gate after the footer. Scrolling past END OF RECORD raises the RISING
 * THE WORLD button (scroll-linked, styles-world-rising.css). The button opens
 * a modal sequence: a dive into the world, the world consumed by red flames
 * and, mid-burn, a hard cut to EP7 REXONANCE. The engine is loaded on
 * approach, and the WebGL context exists only while the sequence plays.
 */
export function RisingWorld() {
  const gateRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<RisingRun | null>(null);
  const releaseLockRef = useRef<(() => void) | null>(null);
  const openRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const refocusControlRef = useRef(false);
  const generationRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [live, setLive] = useState("");

  // Warm the engine, the images and the shader when the gate nears the view.
  useEffect(() => {
    const gate = gateRef.current;
    if (!gate || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        prewarm();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(gate);
    return () => observer.disconnect();
  }, []);

  // SKIP and もう一度 replace each other; keep keyboard focus on the control.
  useLayoutEffect(() => {
    if (!refocusControlRef.current) return;
    refocusControlRef.current = false;
    controlsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [ended]);

  const noteControlFocus = useCallback(() => {
    refocusControlRef.current = Boolean(
      document.activeElement && controlsRef.current?.contains(document.activeElement),
    );
  }, []);

  // Starts (or restarts, for もう一度) a run inside the open dialog.
  const begin = useCallback(async () => {
    const generation = ++generationRef.current;
    runRef.current?.dispose();
    runRef.current = null;
    setLive("");
    let module: Engine;
    try {
      module = engineModule ?? (await loadEngine());
    } catch {
      // Offline or the chunk failed: show the end still with the title.
      const viewport = viewportRef.current;
      if (viewport && dialogRef.current?.open && generation === generationRef.current) {
        viewport.dataset.tier = "static";
        setLive("EP7 REXONANCE");
        setEnded(true);
      }
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport || !dialogRef.current?.open || generation !== generationRef.current) return;
    const audit = auditRequested();
    const run = module.runRising({
      viewport,
      origin: originRef.current,
      world: WORLD_ART,
      rider: RIDER_ART,
      audit,
      onTitle: () => setLive("EP7 REXONANCE"),
      onEnd: () => {
        noteControlFocus();
        setEnded(true);
      },
    });
    runRef.current = run;
    window.__risingStats = run.stats;
    if (audit) {
      window.__risingTest = {
        get run() {
          return runRef.current;
        },
        get stats() {
          return runRef.current?.stats ?? null;
        },
        seek: (T: number) => runRef.current?.seek(T),
      };
    }
  }, [noteControlFocus]);

  // Pointer contact: warm up, and create the GL context and start the shader
  // compile on a detached canvas before the click opens the dialog.
  const prime = () => {
    prewarm();
    engineModule?.primeRising(WORLD_ART, RIDER_ART);
  };

  const start = useCallback(
    (keyboard: boolean) => {
      const dialog = dialogRef.current;
      const trigger = triggerRef.current;
      if (!dialog || !trigger || dialog.open) return;
      const rect = trigger.getBoundingClientRect();
      originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      try {
        dialog.showModal(); // top layer: covers the Zeus button, the header and the page
      } catch {
        return;
      }
      // Locked in the same task as showModal(), released in the same task as close().
      openRef.current = true;
      releaseLockRef.current?.();
      releaseLockRef.current = acquireViewportScrollLock({ freezeBody: true });
      // Pointer: focus the dialog surface (no ring flash). Keyboard: CLOSE.
      (keyboard ? closeRef.current : dialog)?.focus({ preventScroll: true });
      setEnded(false);
      setOpen(true);
      void begin();
    },
    [begin],
  );

  const replay = () => {
    noteControlFocus();
    setEnded(false);
    void begin();
  };

  // Idempotent: CLOSE, Esc / the Android back gesture (cancel) and any other
  // close all end here, synchronously.
  const finishClose = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    generationRef.current += 1;
    runRef.current?.dispose();
    runRef.current = null;
    setOpen(false);
    setEnded(false);
    setLive("");
    // Focus first (the body is still frozen), then restore the scroll position.
    triggerRef.current?.focus({ preventScroll: true });
    releaseLockRef.current?.();
    releaseLockRef.current = null;
  }, []);

  const closeDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    finishClose();
  }, [finishClose]);

  // bfcache and route changes release the context and the lock.
  useEffect(() => {
    const onPageHide = () => {
      if (dialogRef.current?.open) closeDialog();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      openRef.current = false;
      runRef.current?.dispose();
      runRef.current = null;
      releaseLockRef.current?.();
      releaseLockRef.current = null;
    };
  }, [closeDialog]);

  return (
    <>
      <section ref={gateRef} className="rw-gate" aria-label="RISING THE WORLD">
        <span className="rw-gate-horizon" aria-hidden="true" />
        <span className="rw-gate-rule" aria-hidden="true" />
        <button
          ref={triggerRef}
          type="button"
          className="rw-gate-button"
          aria-haspopup="dialog"
          aria-controls="rising-world-dialog"
          onPointerDown={prime}
          onFocus={prewarm}
          onClick={(event) => start(event.detail === 0)}
        >
          RISING THE WORLD
        </button>
      </section>

      <dialog
        ref={dialogRef}
        id="rising-world-dialog"
        className="rw-dialog"
        aria-label="RISING THE WORLD"
        tabIndex={-1}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={finishClose}
      >
        <div ref={viewportRef} className="rw-viewport">
          <div className="rw-end" aria-hidden="true">
            <img
              className="rw-end-art"
              src={open ? RIDER_ART : undefined}
              alt=""
              width={640}
              height={853}
              decoding="async"
            />
          </div>
          <div className="rw-calm" aria-hidden="true">
            <img
              className="rw-calm-world"
              src={open ? WORLD_ART : undefined}
              alt=""
              width={1024}
              height={1536}
              decoding="async"
            />
            <span className="rw-calm-burn" />
          </div>
          <div className="rw-gl" aria-hidden="true" />
          <span className="rw-title-scrim" aria-hidden="true" />
          <div className="rw-title-wrap" aria-hidden="true">
            <p className="rw-title">
              <span className="rw-title-ep">EP7</span>{" "}
              <span className="rw-title-name">REXONANCE</span>
            </p>
          </div>
          <div className="rw-portal" aria-hidden="true">
            <img
              className="rw-portal-art"
              src={open ? WORLD_ART : undefined}
              alt=""
              width={1024}
              height={1536}
              decoding="async"
            />
          </div>
        </div>
        <p className="rw-live" aria-live="polite" aria-atomic="true">
          {live}
        </p>
        <div ref={controlsRef} className="rw-controls">
          {ended ? (
            <button type="button" className="rw-replay" onClick={replay}>
              もう一度
            </button>
          ) : (
            <button type="button" className="rw-skip" onClick={() => runRef.current?.skip()}>
              SKIP
            </button>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="rw-close"
          aria-label="閉じる"
          onClick={closeDialog}
        >
          <span>CLOSE</span>
          <i aria-hidden="true" />
        </button>
      </dialog>
    </>
  );
}
