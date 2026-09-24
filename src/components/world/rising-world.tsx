import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { rexonanceImage } from "@/lib/rexonance-images";
import {
  RISING_BURN_ART,
  RISING_CALM_CHAR,
  RISING_CALM_EDGES,
  RISING_CALM_FLAMES,
  RISING_CALM_SCORCHES,
  RISING_CALM_SMOKE,
  risingBurnArt,
} from "./rising-art";
import { CALM_EMBERS, CALM_FLAME_SEATS, CALM_SMOKE } from "./rising-calm";
import type { RisingRun, RisingStats } from "./rising-sequence";

// The image the fire consumes is chosen per device at the press
// (rising-art.ts). The art that emerges from the ash is the standard
// Rexonance artwork (gold on dark reads under red), 640w candidate.
const RIDER_ART =
  rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet?.split(",")[0]?.trim().split(" ")[0] ??
  REXONANCE_SITE_ARTWORK.standard;

type Engine = typeof import("./rising-sequence");
let engine: Promise<Engine> | null = null;
let engineModule: Engine | null = null;
// A failed import() is not retried: the browser keeps the failed module in its
// module map for the document's lifetime, so the same (hashed) URL would only
// reject again without a request. The dialog then shows the static end still.
const loadEngine = () => {
  engine ??= import("./rising-sequence").then((module) => {
    engineModule = module;
    return module;
  });
  return engine;
};
const prewarm = () => {
  void loadEngine()
    .then((module) => module.prepareRising(risingBurnArt(), RIDER_ART))
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

// Most taps last longer than this, and a flick usually cancels the pointer
// (the browser takes over the pan) sooner; a quicker tap primes at pointerup.
const TOUCH_PRIME_DELAY_MS = 60;

// SKIP and もう一度 share one spot and swap the picture between the end still
// and the void: a press this soon after a swap is a double or repeated press.
const SWAP_GUARD_MS = 600;

const auditRequested = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rising-audit");

/**
 * The gate after the footer. Scrolling past END OF RECORD raises the RISING
 * THE WORLD button (scroll-linked, styles-world-rising.css). The button opens
 * a modal sequence: a dive into the world, the world consumed by red flames
 * and, mid-burn, a hard cut to EP7 REXONANCE. The engine is loaded on
 * approach, and the WebGL context exists only while the sequence plays.
 */
/**
 * The calm tier's fire (static markup: the tiers move it with WAAPI): raster
 * sprites rendered from the same fire model (scripts/render-rising-calm-sprites.mjs):
 * the burn-edge strip over tiled char, flame sprites seated along its lip
 * behind it (two frames per seat that take turns), smoke billows, and embers. The images load lazily, so only a run that
 * shows this tier fetches them. Memoised with no props, so opening the dialog
 * does not re-render it inside the press's click handler.
 */
const CalmFire = memo(function CalmFire() {
  return (
    <>
      <span className="rw-calm-burn">
        <span className="rw-calm-smoke">
          {CALM_SMOKE.map((left) => (
            <img
              key={left}
              src={RISING_CALM_SMOKE}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ left: `${left}%` }}
            />
          ))}
        </span>
        <span className="rw-calm-ash" style={{ backgroundImage: `url(${RISING_CALM_CHAR})` }} />
        {/* Under the flames: the print browning and blistering ahead of the lip. */}
        <span className="rw-calm-scorch">
          {RISING_CALM_SCORCHES.map((src, index) => (
            <img
              key={src}
              className="rw-calm-edge"
              data-profile={index}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
        {/* Behind the strip: the char cuts the flames' roots along the lip. */}
        <span className="rw-calm-flames">
          {CALM_FLAME_SEATS.map(({ centre, width, height, dip, frame, mirror }) => (
            <i
              key={centre}
              className={mirror ? "rw-calm-mirror" : undefined}
              style={{
                left: `${centre}%`,
                bottom: `calc(79% - ${dip}% * var(--rw-edge-k))`,
                width: `min(${width}cqmin, ${(height * 0.9).toFixed(1)}cqh)`,
                height: `${height}cqh`,
              }}
            >
              {[frame, frame + 1].map((index) => (
                <img
                  key={index}
                  src={RISING_CALM_FLAMES[index % RISING_CALM_FLAMES.length]}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </i>
          ))}
        </span>
        <span className="rw-calm-char">
          {RISING_CALM_EDGES.map((src, index) => (
            <img
              key={src}
              className="rw-calm-edge"
              data-profile={index}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
      </span>
      <span className="rw-calm-embers">
        {CALM_EMBERS.map((left) => (
          <i key={left} style={{ left: `${left}%` }} />
        ))}
      </span>
    </>
  );
});

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
  const swappedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const skipRequestedRef = useRef(false);
  const artRef = useRef(RISING_BURN_ART);
  const [art, setArt] = useState(RISING_BURN_ART);
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
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
    swappedAtRef.current = performance.now();
    if (!refocusControlRef.current) return;
    refocusControlRef.current = false;
    controlsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [ended]);

  const noteControlFocus = useCallback(() => {
    refocusControlRef.current = Boolean(
      document.activeElement && controlsRef.current?.contains(document.activeElement),
    );
  }, []);

  // Every path to the end still: focus moves from SKIP to もう一度 with it.
  const markEnded = useCallback(() => {
    noteControlFocus();
    setEnded(true);
  }, [noteControlFocus]);

  // Starts (or restarts, for もう一度) a run inside the open dialog.
  const begin = useCallback(async () => {
    const generation = ++generationRef.current;
    runRef.current?.dispose();
    runRef.current = null;
    skipRequestedRef.current = false;
    setLive("");
    // No tier yet: the engine is still loading. The picture stays dark until
    // the run starts, so the end still (the reveal) never shows first.
    if (viewportRef.current) delete viewportRef.current.dataset.tier;
    let module: Engine;
    try {
      module = engineModule ?? (await loadEngine());
    } catch {
      // Offline or the chunk failed: show the end still with the title. The
      // failure is final (see loadEngine), so もう一度 is not offered.
      skipRequestedRef.current = false;
      const viewport = viewportRef.current;
      if (viewport && dialogRef.current?.open && generation === generationRef.current) {
        viewport.dataset.tier = "static";
        setLive("EP7 REXONANCE");
        // SKIP unmounts without a successor: hand its focus to CLOSE first.
        if (controlsRef.current?.contains(document.activeElement)) {
          closeRef.current?.focus({ preventScroll: true });
        }
        setFailed(true);
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
      world: artRef.current,
      rider: RIDER_ART,
      audit,
      onTitle: () => setLive("EP7 REXONANCE"),
      onEnd: markEnded,
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
    // SKIP pressed while the engine chunk was loading.
    if (skipRequestedRef.current) {
      skipRequestedRef.current = false;
      run.skip();
    }
  }, [markEnded]);

  // Pointer contact: warm up, and create the GL context and start the shader
  // compile on a detached canvas before the click opens the dialog. A touch
  // that lands on the button may be the start of a scroll (pointercancel), so
  // touch primes a moment later, or at pointerup: getContext() on the main
  // thread must not delay the scroll starting under the thumb.
  const primeTimerRef = useRef(0);
  const cancelPrime = () => {
    window.clearTimeout(primeTimerRef.current);
    primeTimerRef.current = 0;
  };
  const primeNow = () => {
    cancelPrime();
    engineModule?.primeRising(risingBurnArt(), RIDER_ART);
  };
  const prime = (event: ReactPointerEvent<HTMLButtonElement>) => {
    prewarm();
    if (event.pointerType !== "touch") {
      primeNow();
      return;
    }
    cancelPrime();
    primeTimerRef.current = window.setTimeout(primeNow, TOUCH_PRIME_DELAY_MS);
  };
  const primePending = () => {
    if (primeTimerRef.current) primeNow();
  };

  const start = useCallback(
    (keyboard: boolean) => {
      const dialog = dialogRef.current;
      const trigger = triggerRef.current;
      if (!dialog || !trigger || dialog.open) return;
      const rect = trigger.getBoundingClientRect();
      originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      artRef.current = risingBurnArt();
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
      setArt(artRef.current);
      setOpen(true);
      void begin();
    },
    [begin],
  );

  const settled = () => performance.now() - swappedAtRef.current >= SWAP_GUARD_MS;

  const skip = () => {
    if (!settled()) return;
    if (runRef.current) runRef.current.skip();
    else skipRequestedRef.current = true; // the run starts at the end still
  };

  const replay = () => {
    if (!settled()) return;
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
    skipRequestedRef.current = false;
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
      window.clearTimeout(primeTimerRef.current);
      openRef.current = false;
      runRef.current?.dispose();
      runRef.current = null;
      // After the run: close the prepared bitmaps; the next approach prepares again.
      engineModule?.releaseRising();
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
          onPointerUp={primePending}
          onPointerCancel={cancelPrime}
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
        onClose={() => {
          // A close event queued by an earlier close can arrive after start() has
          // reopened the dialog; it belongs to the old session.
          if (!dialogRef.current?.open) finishClose();
        }}
        onKeyDown={(event) => {
          // A held Enter or Space would click the control under focus on every repeat.
          if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
        }}
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
              src={open ? art : undefined}
              alt=""
              width={1024}
              height={1536}
              decoding="async"
            />
            <CalmFire />
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
              src={open ? art : undefined}
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
            failed ? null : (
              <button key="replay" type="button" className="rw-replay" onClick={replay}>
                もう一度
              </button>
            )
          ) : (
            <button key="skip" type="button" className="rw-skip" onClick={skip}>
              SKIP
            </button>
          )}
        </div>
        <button ref={closeRef} type="button" className="rw-close" onClick={closeDialog}>
          <span>CLOSE</span>
          <i aria-hidden="true" />
        </button>
      </dialog>
    </>
  );
}
